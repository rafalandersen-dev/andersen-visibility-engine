import { emailCopy } from "@/i18n/email-copy";
import { emailLocaleSchema, type EmailLanguage } from "./email-languages";
import { escapeEmailText as escape } from "./email-render";
import { z } from "zod";
import {
  invitationDeliveryTarget,
  invitationDeliveryRequest,
  invitationDeliveryStatus,
} from "./project-team-invitation-delivery";
import { teamCall, projectTeamRpc } from "./project-team-membership.server";
import {
  resolveInvitationEmailRecipient,
  type OperationalEmailDependencies,
} from "./operational-email.server";
import type { TeamReadRpc } from "./project-team-read.server";
export async function requestTeamInvitationDelivery(
  actorId: string,
  raw: z.infer<typeof invitationDeliveryRequest>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = z.string().uuid().parse(actorId),
    input = invitationDeliveryRequest.parse(raw);
  const id = z
    .string()
    .uuid()
    .parse(
      await teamCall(
        "request_project_team_invitation_delivery",
        {
          p_actor: actor,
          p_project: input.projectId,
          p_invite: input.inviteId,
          p_email: input.email,
          p_role: input.role,
        },
        rpc,
      ),
    );
  return { id };
}
export async function readTeamInvitationDelivery(
  actorId: string,
  raw: z.infer<typeof invitationDeliveryTarget>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = z.string().uuid().parse(actorId),
    input = invitationDeliveryTarget.parse(raw);
  const result = invitationDeliveryStatus.parse(
    await teamCall(
      "read_project_team_invitation_delivery",
      { p_actor: actor, p_project: input.projectId, p_invite: input.inviteId },
      rpc,
    ),
  );
  if (
    result.ownerId !== actor ||
    result.projectId !== input.projectId ||
    result.inviteId !== input.inviteId
  )
    throw new Error("Invitation delivery could not be confirmed.");
  return result;
}
const claimSchema = z
  .object({
    id: z.string().uuid(),
    owner_id: z.string().uuid(),
    project_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    invite_id: z.string().uuid(),
    lease_token: z.string().uuid(),
    email: z.string().email().max(254),
    role: z.enum(["viewer", "editor", "reviewer"]),
    locale: emailLocaleSchema,
  })
  .strict();
type Dependencies = Pick<OperationalEmailDependencies, "rpc" | "send"> & {
  recipient(email: string): Promise<{ email: string; unsubscribeToken: string }>;
};

export function renderTeamInvitation(
  role: "viewer" | "editor" | "reviewer",
  locale: EmailLanguage = "en",
) {
  const c = emailCopy[emailLocaleSchema.parse(locale)].invitation,
    label = c.roles[z.enum(["viewer", "editor", "reviewer"]).parse(role)],
    url = "https://milogrowth.com/app/collaborators";
  return {
    subject: c.subject,
    text: [c.intro, label, c.instruction, `${c.open}: ${url}`, c.footer].join("\n\n"),
    html: `<div lang="${locale}"><p>${escape(c.intro)}</p><p>${escape(label)}</p><p>${escape(c.instruction)}</p><p><a href="${url}">${escape(c.open)}</a></p><p>${escape(c.footer)}</p></div>`,
  };
}
export async function deliverOneTeamInvitation(deps: Dependencies) {
  const result = await deps.rpc("claim_project_team_invitation_delivery");
  if (result.error) throw new Error("invitation_claim_unavailable");
  const claims = z.array(claimSchema).max(1).parse(result.data);
  if (!claims.length) return "empty";
  const c = claims[0];
  const finish = async (outcome: string) => {
    const r = await deps.rpc("finish_project_team_invitation_delivery", {
      p_id: c.id,
      p_lease: c.lease_token,
      p_outcome: outcome,
    });
    if (r.error || r.data !== true) throw new Error("invitation_reconciliation_unavailable");
  };
  let target: Awaited<ReturnType<Dependencies["recipient"]>>;
  try {
    target = await deps.recipient(c.email);
    if (target.email !== c.email) throw new Error("recipient_changed");
  } catch {
    await finish("preflight_unavailable");
    return "deferred";
  }
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(target.email));
    const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );
    const r = await deps.rpc("begin_project_team_invitation_delivery", {
      p_id: c.id,
      p_lease: c.lease_token,
      p_email_hash: hash,
      p_role: c.role,
    });
    if (r.error) throw new Error("admission_unavailable");
    if (r.data === false) return "cancelled";
    z.literal(true).parse(r.data);
  } catch {
    await finish("preflight_unavailable");
    return "deferred";
  }
  try {
    const sent = await deps.send({
      id: c.id,
      ...target,
      ...renderTeamInvitation(c.role, c.locale),
    });
    if (!sent.success) throw new Error("transport_unconfirmed");
  } catch {
    await finish("unknown");
    return "unknown";
  }
  await finish("accepted");
  return "accepted";
}
export async function runTeamInvitationWorker() {
  if (process.env.TEAM_INVITATION_EMAIL_ENABLED !== "true") return { enabled: false, processed: 0 };
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("invitation_transport_unavailable");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as Pick<Dependencies, "rpc">;
  const { sendLovableEmail } = await import("@lovable.dev/email-js");
  let processed = 0;
  for (let i = 0; i < 2; i++) {
    const result = await deliverOneTeamInvitation({
      rpc: (name, args) => db.rpc(name, args),
      recipient: resolveInvitationEmailRecipient,
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
                label: "project-invitation",
                idempotency_key: `milo-team-invitation-${p.id}`,
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
    if (result === "empty") break;
    processed++;
  }
  return { enabled: true, processed };
}
