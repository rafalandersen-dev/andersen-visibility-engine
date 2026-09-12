import { emailLocaleSchema } from "./email-languages";
import { z } from "zod";
import {
  renderOperationalDigest,
  resolveOperationalEmailRecipient,
  type OperationalEmailDependencies,
} from "./operational-email.server";
import { refreshOperationalNotifications } from "./operational-notifications.server";
const target = z
  .object({
    owner_id: z.string().uuid(),
    project_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    recipient_id: z.string().uuid(),
  })
  .strict();
const claimSchema = target
  .extend({ id: z.string().uuid(), lease_token: z.string().uuid() })
  .strict();
export async function deliverOneTeamDigest(deps: OperationalEmailDependencies) {
  const claimed = await deps.rpc("claim_project_team_notification_digest");
  if (claimed.error) throw new Error("team_digest_unavailable");
  const claims = z.array(claimSchema).max(1).parse(claimed.data);
  if (!claims.length) return "empty";
  const c = claims[0];
  const finish = async (outcome: string) => {
    const r = await deps.rpc("finish_project_team_notification_delivery", {
      p_id: c.id,
      p_lease: c.lease_token,
      p_outcome: outcome,
    });
    if (r.error || r.data !== true) throw new Error("team_digest_reconciliation_unavailable");
  };
  let recipient: Awaited<ReturnType<OperationalEmailDependencies["recipient"]>>;
  try {
    if (!(await deps.refresh(c.owner_id))) throw new Error("stale_source");
    recipient = await deps.recipient(c.recipient_id);
  } catch {
    await finish("preflight_unavailable");
    return "deferred";
  }
  let prepared: { data: unknown; error: unknown };
  try {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(recipient.email.toLowerCase()),
    );
    const emailHash = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    prepared = await deps.rpc("begin_project_team_notification_delivery", {
      p_id: c.id,
      p_lease: c.lease_token,
      p_email_hash: emailHash,
    });
    if (prepared.error) throw new Error("preflight_unavailable");
  } catch {
    await finish("preflight_unavailable");
    return "deferred";
  }
  if (prepared.data === null) return "cancelled";
  try {
    const body = z
      .object({
        locale: emailLocaleSchema,
        items: z
          .array(
            z
              .object({
                id: z.string().uuid(),
                projectId: z.literal(c.project_id),
                targetId: z.string(),
                title: z.string().max(300),
                kind: z.enum([
                  "approval_due",
                  "publication_failed",
                  "manual_overdue",
                  "cadence_gap",
                  "scheduler_recovery",
                ]),
                dueAt: z.string().nullable(),
                detail: z.object({ timeZone: z.string() }).strict(),
              })
              .strict(),
          )
          .min(1)
          .max(50),
      })
      .strict()
      .parse(prepared.data);
    const result = await deps.send({
      id: c.id,
      ...recipient,
      ...renderOperationalDigest(body, "collaborators"),
    });
    if (!result.success) throw new Error("transport_unconfirmed");
  } catch {
    await finish("unknown");
    return "unknown";
  }
  await finish("accepted");
  return "accepted";
}
/** Refresh each owner once per bounded queue-preparation sweep. Delivery retains
 * its own immediate preflight refresh and recipient checks. */
export async function queueTeamDigestTargets(
  raw: unknown,
  deps: Pick<OperationalEmailDependencies, "rpc" | "refresh">,
) {
  let queued = 0,
    failed = 0;
  const refreshed = new Map<string, boolean>();
  for (const t of z.array(target).max(20).parse(raw)) {
    try {
      if (!refreshed.has(t.owner_id)) {
        refreshed.set(t.owner_id, false);
        refreshed.set(t.owner_id, await deps.refresh(t.owner_id));
      }
      if (!refreshed.get(t.owner_id)) throw new Error("stale_source");
      const r = await deps.rpc("queue_project_team_notification_digest", {
        p_owner: t.owner_id,
        p_project: t.project_id,
        p_recipient: t.recipient_id,
      });
      if (r.error) throw new Error("queue_unavailable");
      if (r.data !== null) {
        z.string().uuid().parse(r.data);
        queued++;
      }
    } catch {
      failed++;
    }
  }
  return { queued, failed };
}
export async function runTeamNotificationWorker() {
  if (process.env.TEAM_NOTIFICATION_EMAIL_ENABLED !== "true")
    return { enabled: false, queued: 0, processed: 0, failed: 0 };
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("team_transport_unavailable");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as Pick<OperationalEmailDependencies, "rpc">;
  const targets = await db.rpc("project_team_notification_scan_targets");
  if (targets.error) throw new Error("team_targets_unavailable");
  const { queued, failed } = await queueTeamDigestTargets(targets.data, {
    rpc: (name, args) => db.rpc(name, args),
    refresh: refreshOperationalNotifications,
  });
  let processed = 0;
  const { sendLovableEmail } = await import("@lovable.dev/email-js");
  for (let i = 0; i < 2; i++) {
    const status = await deliverOneTeamDigest({
      rpc: (name, args) => db.rpc(name, args),
      refresh: refreshOperationalNotifications,
      recipient: resolveOperationalEmailRecipient,
      send: async (p) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            sendLovableEmail(
              {
                to: p.email,
                from: "Milo Growth <noreply@milogrowth.com>",
                sender_domain: "notify.milogrowth.com",
                subject: p.subject,
                html: p.html,
                text: p.text,
                purpose: "transactional",
                label: "team-project-digest",
                idempotency_key: `milo-team-${p.id}`,
                message_id: p.id,
                unsubscribe_token: p.unsubscribeToken,
              },
              { apiKey, sendUrl: process.env.LOVABLE_SEND_URL },
            ),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error("transport_timeout")), 25000);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      },
    });
    if (status === "empty") break;
    processed++;
  }
  return { enabled: true, queued, processed, failed };
}
