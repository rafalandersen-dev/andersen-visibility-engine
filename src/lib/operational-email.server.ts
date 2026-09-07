import { z } from "zod";
import { notifications } from "@/i18n/notifications";
import { refreshOperationalNotifications } from "./operational-notifications.server";
const localeSchema = z.enum(["en", "pl", "sv", "da"]);
const claimSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  lease_token: z.string().uuid(),
});
const digestSchema = z.object({
  locale: localeSchema,
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        projectId: z.string(),
        targetId: z.string(),
        title: z.string().max(300),
        kind: z.enum(["approval_due", "publication_failed", "manual_overdue", "cadence_gap"]),
        dueAt: z.string().nullable(),
        detail: z.object({ timeZone: z.string() }),
      }),
    )
    .min(1)
    .max(50),
});
const copy = {
  en: {
    subject: "Your Milo Growth tasks need attention",
    intro:
      "These tasks still need attention at the latest check. Open Milo to review their current status.",
    open: "Review notifications",
    footer:
      "Manage operational email preferences in Milo. Opening this link never approves or publishes content.",
  },
  pl: {
    subject: "Zadania w Milo Growth wymagają uwagi",
    intro:
      "Te zadania wymagały uwagi podczas ostatniego sprawdzenia. Otwórz Milo, aby zobaczyć ich aktualny stan.",
    open: "Sprawdź powiadomienia",
    footer:
      "Ustawienia e-maili operacyjnych zmienisz w Milo. Otwarcie linku nie zatwierdza ani nie publikuje treści.",
  },
  sv: {
    subject: "Dina uppgifter i Milo Growth behöver uppmärksamhet",
    intro:
      "Dessa uppgifter behövde uppmärksamhet vid den senaste kontrollen. Öppna Milo för aktuell status.",
    open: "Visa aviseringar",
    footer:
      "Hantera e-postinställningar i Milo. Länken godkänner eller publicerar aldrig innehåll.",
  },
  da: {
    subject: "Dine opgaver i Milo Growth kræver opmærksomhed",
    intro:
      "Disse opgaver krævede opmærksomhed ved seneste kontrol. Åbn Milo for den aktuelle status.",
    open: "Se notifikationer",
    footer:
      "Administrer e-mailindstillinger i Milo. Linket godkender eller udgiver aldrig indhold.",
  },
};
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
export function renderOperationalDigest(input: unknown) {
  const digest = digestSchema.parse(input),
    c = copy[digest.locale];
  const lines = digest.items.map((item) => {
    let due = "";
    if (item.dueAt)
      due =
        new Intl.DateTimeFormat(digest.locale, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: item.detail.timeZone,
        }).format(new Date(item.dueAt)) + ` (${item.detail.timeZone})`;
    return `${notifications[digest.locale][`notifications.${item.kind}`]}: ${item.title}${due ? ` — ${due}` : ""}`;
  });
  const url = "https://milogrowth.com/app/notifications";
  return {
    subject: c.subject,
    text: [c.intro, ...lines, `${c.open}: ${url}`, c.footer].join("\n\n"),
    html: `<p>${escape(c.intro)}</p><ul>${lines.map((line) => `<li>${escape(line)}</li>`).join("")}</ul><p><a href="${url}">${escape(c.open)}</a></p><p>${escape(c.footer)}</p>`,
  };
}
export function operationalEmailEnabled() {
  return process.env.OPERATIONAL_EMAIL_ENABLED === "true";
}
async function getDb() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
/** No client-provided recipient: current confirmed account address and suppression checked before each send. */
export async function resolveOperationalEmailRecipient(userId: string) {
  const db = await getDb();
  const { data, error } = await db.auth.admin.getUserById(userId);
  const email = data?.user?.email?.toLowerCase();
  if (error || !email || !data.user.email_confirmed_at) throw new Error("recipient_unavailable");
  const suppressed = await db
    .from("suppressed_emails")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (suppressed.error || suppressed.data) throw new Error("recipient_unavailable");
  const lookup = await db
    .from("email_unsubscribe_tokens")
    .select("token,used_at")
    .eq("email", email)
    .maybeSingle();
  if (lookup.error || lookup.data?.used_at) throw new Error("recipient_unavailable");
  if (!lookup.data) {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const inserted = await db
      .from("email_unsubscribe_tokens")
      .upsert({ email, token }, { onConflict: "email", ignoreDuplicates: true });
    if (inserted.error) throw new Error("recipient_unavailable");
  }
  const stored = await db
    .from("email_unsubscribe_tokens")
    .select("token,used_at")
    .eq("email", email)
    .maybeSingle();
  if (stored.error || !stored.data?.token || stored.data.used_at)
    throw new Error("recipient_unavailable");
  return { email, unsubscribeToken: stored.data.token as string };
}
export interface OperationalEmailDependencies {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  refresh(userId: string): Promise<boolean>;
  recipient(userId: string): Promise<{ email: string; unsubscribeToken: string }>;
  send(payload: {
    id: string;
    email: string;
    unsubscribeToken: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<{ success: boolean }>;
}
/** Bounded worker: only pre-transport failures retry. Ambiguous sends stay unknown for reconciliation. */
export async function deliverOneOperationalDigest(deps: OperationalEmailDependencies) {
  const result = await deps.rpc("claim_operational_email_digest");
  if (result.error) throw new Error("email_claim_unavailable");
  const claims = z.array(claimSchema).max(1).parse(result.data);
  if (!claims.length) return "empty" as const;
  const claim = claims[0];
  const finish = async (outcome: string) => {
    const r = await deps.rpc("finish_operational_email_delivery", {
      p_id: claim.id,
      p_lease: claim.lease_token,
      p_outcome: outcome,
    });
    if (r.error || r.data !== true) throw new Error("email_reconciliation_unavailable");
  };
  let target: Awaited<ReturnType<OperationalEmailDependencies["recipient"]>>;
  try {
    if (!(await deps.refresh(claim.user_id))) throw new Error("source_unavailable");
    target = await deps.recipient(claim.user_id);
  } catch {
    await finish("preflight_unavailable");
    return "deferred" as const;
  }
  let prepared: { data: unknown; error: unknown };
  try {
    prepared = await deps.rpc("begin_operational_email_delivery", {
      p_id: claim.id,
      p_lease: claim.lease_token,
    });
  } catch {
    await finish("preflight_unavailable");
    return "deferred" as const;
  }
  if (prepared.error) {
    await finish("preflight_unavailable");
    return "deferred" as const;
  }
  if (prepared.data === null) return "cancelled" as const;
  try {
    const body = renderOperationalDigest(prepared.data);
    const result = await deps.send({ id: claim.id, ...target, ...body });
    if (!result.success) throw new Error("transport_not_confirmed");
  } catch {
    await finish("unknown");
    return "unknown" as const;
  }
  await finish("accepted");
  return "accepted" as const;
}
export async function runOperationalEmailWorker() {
  if (!operationalEmailEnabled()) return { enabled: false, processed: 0 };
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("email_transport_unavailable");
  const db = await getDb();
  const { sendLovableEmail } = await import("@lovable.dev/email-js");
  let processed = 0;
  // Two messages per sweep maximum; provider calls have no automatic retries here.
  for (let i = 0; i < 2; i++) {
    const status = await deliverOneOperationalDigest({
      rpc: (name, args) =>
        (db as unknown as Pick<OperationalEmailDependencies, "rpc">).rpc(name, args),
      refresh: refreshOperationalNotifications,
      recipient: resolveOperationalEmailRecipient,
      send: async (payload) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            sendLovableEmail(
              {
                to: payload.email,
                from: "Milo Growth <noreply@milogrowth.com>",
                sender_domain: "notify.milogrowth.com",
                subject: payload.subject,
                html: payload.html,
                text: payload.text,
                purpose: "transactional",
                label: "operational-digest",
                idempotency_key: `milo-operational-${payload.id}`,
                message_id: payload.id,
                unsubscribe_token: payload.unsubscribeToken,
              },
              { apiKey, sendUrl: process.env.LOVABLE_SEND_URL },
            ),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error("transport_timeout")), 25_000);
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
  return { enabled: true, processed };
}
