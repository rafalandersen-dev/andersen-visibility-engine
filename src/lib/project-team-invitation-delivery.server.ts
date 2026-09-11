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
    locale: z.enum(["en", "pl", "sv", "da"]),
  })
  .strict();
type Dependencies = Pick<OperationalEmailDependencies, "rpc" | "send"> & {
  recipient(email: string): Promise<{ email: string; unsubscribeToken: string }>;
};
const invitationCopy = {
  en: {
    subject: "You have a Milo Growth project invitation",
    intro: "You have been invited to collaborate on a project in Milo Growth.",
    instruction:
      "Sign in or create an account using the email address that received this invitation, then review the invitation and role in Collaborators.",
    open: "Review invitation",
    footer:
      "The invitation expires seven days after it was created and may be revoked by its owner. Opening this link does not accept the invitation, approve content or publish anything.",
    roles: { viewer: "Viewer", editor: "Editor", reviewer: "Reviewer" },
  },
  pl: {
    subject: "Zaproszenie do projektu w Milo Growth",
    intro: "Zaproszono Cię do współpracy nad projektem w Milo Growth.",
    instruction:
      "Zaloguj się lub utwórz konto z adresem e-mail, na który otrzymano zaproszenie, a następnie sprawdź zaproszenie i rolę w sekcji Współpracownicy.",
    open: "Sprawdź zaproszenie",
    footer:
      "Zaproszenie wygasa siedem dni po utworzeniu i może zostać cofnięte przez właściciela. Otwarcie linku nie akceptuje zaproszenia, nie zatwierdza ani nie publikuje treści.",
    roles: { viewer: "Obserwator", editor: "Redaktor", reviewer: "Recenzent" },
  },
  sv: {
    subject: "Du har en projektinbjudan i Milo Growth",
    intro: "Du har bjudits in att samarbeta i ett projekt i Milo Growth.",
    instruction:
      "Logga in eller skapa ett konto med e-postadressen som fick inbjudan. Granska sedan inbjudan och rollen under Samarbetspartner.",
    open: "Granska inbjudan",
    footer:
      "Inbjudan löper ut sju dagar efter att den skapades och kan återkallas av ägaren. Att öppna länken accepterar inte inbjudan, godkänner inte innehåll och publicerar ingenting.",
    roles: { viewer: "Läsare", editor: "Redaktör", reviewer: "Granskare" },
  },
  da: {
    subject: "Du har en projektinvitation i Milo Growth",
    intro: "Du er inviteret til at samarbejde på et projekt i Milo Growth.",
    instruction:
      "Log ind eller opret en konto med den e-mailadresse, der modtog invitationen. Gennemgå derefter invitationen og rollen under Samarbejdspartnere.",
    open: "Gennemgå invitation",
    footer:
      "Invitationen udløber syv dage efter oprettelsen og kan tilbagekaldes af ejeren. Åbning af linket accepterer ikke invitationen, godkender ikke indhold og udgiver ingenting.",
    roles: { viewer: "Læser", editor: "Redaktør", reviewer: "Reviewer" },
  },
};
export function renderTeamInvitation(
  role: "viewer" | "editor" | "reviewer",
  locale: "en" | "pl" | "sv" | "da" = "en",
) {
  const c = invitationCopy[locale],
    label = c.roles[role],
    url = "https://milogrowth.com/app/collaborators";
  return {
    subject: c.subject,
    text: [c.intro, label, c.instruction, `${c.open}: ${url}`, c.footer].join("\n\n"),
    html: `<p>${c.intro}</p><p>${label}</p><p>${c.instruction}</p><p><a href="${url}">${c.open}</a></p><p>${c.footer}</p>`,
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
