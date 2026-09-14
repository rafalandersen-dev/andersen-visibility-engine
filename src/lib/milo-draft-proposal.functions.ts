import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { draftProposalTarget } from "./milo-draft-proposal";

export const readMiloDraftProposalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => draftProposalTarget.parse(input))
  .handler(async ({ data, context }) => {
    const { readDraftProposal } = await import("./milo-draft-proposal.server");
    return readDraftProposal(context.userId, data);
  });
export const applyMiloDraftProposalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => draftProposalTarget.parse(input))
  .handler(async ({ data, context }) => {
    const { applyDraftProposal } = await import("./milo-draft-proposal.server");
    return applyDraftProposal(context.userId, data);
  });
