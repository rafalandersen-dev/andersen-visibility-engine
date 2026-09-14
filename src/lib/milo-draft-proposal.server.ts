import { z } from "zod";
import { draftProposalTarget, draftProposalView, metadataProposal } from "./milo-draft-proposal";
import { admittedReadRpc } from "./project-team-read-admission.server";
import { projectTeamRpc, teamCall } from "./project-team-membership.server";
import type { TeamReadRpc } from "./project-team-read.server";

const retainedProposal = draftProposalTarget.extend({
  attemptId: z.string().uuid(),
  assetId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  expectedMembershipRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  proposal: metadataProposal,
});
function args(actor: string, input: z.infer<typeof draftProposalTarget>) {
  return {
    p_actor: z.string().uuid().parse(actor),
    p_owner: input.ownerId,
    p_project: input.projectId,
    p_conversation: input.conversationId,
    p_turn: input.turnId,
    p_proposal: input.proposalId,
  };
}
/** Private executor dependency. No browser function accepts a patch or attempt. */
export async function retainDraftProposal(
  actor: string,
  raw: z.infer<typeof retainedProposal>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const input = retainedProposal.parse(raw);
  const id = await teamCall(
    "retain_milo_draft_proposal",
    {
      ...args(actor, input),
      p_attempt: input.attemptId,
      p_asset: input.assetId,
      p_hash: input.expectedHash,
      p_membership: input.expectedMembershipRevision,
      p_patch: input.proposal.fields,
      p_explanation: input.proposal.explanation,
    },
    admittedReadRpc(actor, rpc),
  );
  if (id !== input.proposalId) throw new Error("Draft proposal could not be confirmed.");
  return id as string;
}
async function operate(
  action: "read" | "apply",
  actor: string,
  raw: z.infer<typeof draftProposalTarget>,
  rpc: TeamReadRpc,
) {
  const input = draftProposalTarget.parse(raw);
  const result = draftProposalView.parse(
    await teamCall(
      `${action}_milo_draft_proposal`,
      args(actor, input),
      admittedReadRpc(actor, rpc),
    ),
  );
  if (
    result.actorId !== actor ||
    Object.entries(input).some(([key, value]) => result[key as keyof typeof input] !== value) ||
    (action === "apply" && result.state !== "applied")
  )
    throw new Error("Draft proposal could not be confirmed.");
  return result;
}
export function readDraftProposal(
  actor: string,
  input: z.infer<typeof draftProposalTarget>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  return operate("read", actor, input, rpc);
}
export function applyDraftProposal(
  actor: string,
  input: z.infer<typeof draftProposalTarget>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  return operate("apply", actor, input, rpc);
}
