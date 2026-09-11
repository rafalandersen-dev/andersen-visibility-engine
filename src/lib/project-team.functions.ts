import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  teamReviewDecision,
  teamCommentTarget,
  teamMediaInput,
  teamPolicyChange,
  teamAcceptInput,
  teamOwnerAction,
  teamRosterInput,
} from "./project-team";
import { teamDraftEdit, teamCommentRead, teamCommentAdd, teamReadInput } from "./project-team";
export const updateProjectTeamFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => teamOwnerAction.parse(v))
  .handler(async ({ data, context }) => {
    const { updateProjectTeam } = await import("./project-team-membership.server");
    return updateProjectTeam(context.userId, data);
  });
export const acceptProjectTeamFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => teamAcceptInput.parse(v))
  .handler(async ({ data, context }) => {
    const { acceptProjectTeam } = await import("./project-team-membership.server");
    return acceptProjectTeam(context.userId, data);
  });
export const readProjectTeamRosterFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => teamRosterInput.parse(v))
  .handler(async ({ data, context }) => {
    const { readProjectTeamRoster } = await import("./project-team-membership.server");
    return readProjectTeamRoster(context.userId, data);
  });
export const listMyProjectTeamsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({}).strict().parse(v))
  .handler(async ({ context }) => {
    const { listMyProjectTeams } = await import("./project-team-membership.server");
    return listMyProjectTeams(context.userId);
  });
export const readTeamProjectFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => teamReadInput.parse(v))
  .handler(async ({ data, context }) => {
    const { readTeamProject } = await import("./project-team-read.server");
    const { projectTeamRpc } = await import("./project-team-membership.server");
    return readTeamProject(context.userId, data, projectTeamRpc);
  });
export const readProjectTeamCommentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => teamCommentRead.parse(v))
  .handler(async ({ data, context }) => {
    const { readProjectTeamComments } = await import("./project-team-comments.server");
    return readProjectTeamComments(context.userId, data);
  });
export const addProjectTeamCommentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => teamCommentAdd.parse(v))
  .handler(async ({ data, context }) => {
    const { addProjectTeamComment } = await import("./project-team-comments.server");
    return addProjectTeamComment(context.userId, data);
  });
export const saveProjectTeamDraftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => teamDraftEdit.parse(v))
  .handler(async ({ data, context }) => {
    const { saveProjectTeamDraft } = await import("./project-team-edit.server");
    return saveProjectTeamDraft(context.userId, data);
  });
export const readOwnerTeamPolicyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => teamRosterInput.parse(v))
  .handler(async ({ data, context }) => {
    const { readOwnerTeamPolicy } = await import("./project-team-policy.server");
    return readOwnerTeamPolicy(context.userId, data);
  });
export const changeOwnerTeamPolicyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => teamPolicyChange.parse(v))
  .handler(async ({ data, context }) => {
    const { changeOwnerTeamPolicy } = await import("./project-team-policy.server");
    return changeOwnerTeamPolicy(context.userId, data);
  });
export const readProjectTeamMediaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => teamMediaInput.parse(v))
  .handler(async ({ data, context }) => {
    const { readProjectTeamMedia } = await import("./project-team-media.server");
    return readProjectTeamMedia(context.userId, data);
  });
export const readProjectTeamPreviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => teamCommentTarget.parse(v))
  .handler(async ({ data, context }) => {
    const { readProjectTeamPreview } = await import("./project-team-preview.server");
    return readProjectTeamPreview(context.userId, data);
  });
export const saveProjectTeamReviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => teamReviewDecision.parse(v))
  .handler(async ({ data, context }) => {
    const { saveProjectTeamReview } = await import("./project-team-review.server");
    return saveProjectTeamReview(context.userId, data);
  });
export const readProjectTeamReviewHistoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => teamCommentTarget.parse(v))
  .handler(async ({ data, context }) => {
    const { readProjectTeamReviewHistory } = await import("./project-team-review.server");
    return readProjectTeamReviewHistory(context.userId, data);
  });
