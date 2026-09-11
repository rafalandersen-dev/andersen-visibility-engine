import { z } from "zod";
import { teamReadInput } from "./project-team";
import { projectTeamDraft, projectTeamList, teamProjectTarget } from "./project-team-view";

export type TeamReadRpc = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: unknown }>;

const envelope = teamProjectTarget
  .extend({
    actorId: z.string().uuid(),
    canEdit: z.boolean(),
    draftHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    membershipRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    workspaceRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    project: z.unknown(),
    drafts: z.array(z.unknown()).max(100),
    remaining: z.number().int().min(0).max(100000),
    draft: z.unknown().nullable(),
  })
  .strict();

/** The storage RPC must authorize and read in one
 * transaction, checking current membership on every request. actorId must come
 * from authentication middleware, never from browser input. No workspace read
 * fallback is permitted if membership storage is unavailable. */
export async function readTeamProject(
  actorId: string,
  raw: z.input<typeof teamReadInput>,
  rpc: TeamReadRpc,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const actor = z.string().uuid().parse(actorId);
    const input = teamReadInput.parse(raw);
    if (input.assetId && input.offset !== 0) throw new Error("invalid_team_read");
    const response = await Promise.race([
      rpc("read_project_team_snapshot", {
        p_actor: actor,
        p_owner: input.ownerId,
        p_project: input.projectId,
        p_asset: input.assetId ?? null,
        p_offset: input.offset,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("team_read_timeout")), 10000);
      }),
    ]);
    if (!response || response.error) throw new Error("team_read_failed");
    const snapshot = envelope.parse(response.data);
    if (
      snapshot.actorId !== actor ||
      snapshot.ownerId !== input.ownerId ||
      snapshot.projectId !== input.projectId
    )
      throw new Error("team_read_scope");
    if (Boolean(input.assetId) !== Boolean(snapshot.draftHash))
      throw new Error("team_draft_version");
    const result = projectTeamList(
      { ownerId: input.ownerId, projectId: input.projectId },
      snapshot.project,
      snapshot.drafts,
      snapshot.remaining,
    );
    if (!input.assetId && snapshot.draft != null) throw new Error("unexpected_team_draft");
    return {
      ...result,
      draft: input.assetId
        ? projectTeamDraft(
            { ownerId: input.ownerId, projectId: input.projectId },
            input.assetId,
            snapshot.draft,
          )
        : null,
      canEdit: snapshot.canEdit,
      draftHash: snapshot.draftHash,
      membershipRevision: snapshot.membershipRevision,
      workspaceRevision: snapshot.workspaceRevision,
    };
  } catch {
    // Same response for absent, revoked, unrelated and unavailable projects;
    // never forward database detail or confirm another client's project exists.
    throw new Error("Project access could not be confirmed. Refresh and try again.");
  } finally {
    clearTimeout(timer);
  }
}
