import { z } from "zod";
import { teamSeatAllowance, type PlanId } from "./billing";
import { teamCall, projectTeamRpc } from "./project-team-membership.server";
import type { TeamReadRpc } from "./project-team-read.server";

export interface TeamSeatAllowanceInput {
  workingSeats: number;
  viewerSeats: number;
}
/** The owner's current seat allowance. Purchased extra seats are not recorded anywhere
 * yet (no Stripe seat item exists), so only the plan's bundle applies. Fails closed to
 * the free tier like every other entitlement read. */
export async function readTeamSeatAllowance(
  userId: string,
  resolvePlan?: (userId: string) => Promise<PlanId>,
): Promise<TeamSeatAllowanceInput> {
  const resolve = resolvePlan ?? (await import("./entitlements.server")).resolveEntitledPlan;
  return teamSeatAllowance(await resolve(userId), 0);
}
const usageRow = z
  .array(z.object({ working: z.number().int().min(1), viewer: z.number().int().min(0) }).strict())
  .length(1);
/** Distinct people currently holding seats across the owner's whole account. The owner
 * counts as one working seat; pending invitations reserve seats until they expire. */
export async function readTeamSeatUsage(ownerId: string, rpc: TeamReadRpc = projectTeamRpc) {
  const owner = z.string().uuid().parse(ownerId);
  const [row] = usageRow.parse(await teamCall("count_project_team_seats", { p_owner: owner }, rpc));
  return { usedWorkingSeats: row.working, usedViewerSeats: row.viewer };
}
export const teamSeatsView = z
  .object({
    planId: z.string(),
    workingSeats: z.number().int().min(1),
    viewerSeats: z.number().int().min(0),
    usedWorkingSeats: z.number().int().min(1),
    usedViewerSeats: z.number().int().min(0),
  })
  .strict();
export async function readTeamSeats(
  userId: string,
  rpc: TeamReadRpc = projectTeamRpc,
  resolvePlan?: (userId: string) => Promise<PlanId>,
): Promise<z.infer<typeof teamSeatsView>> {
  const resolve = resolvePlan ?? (await import("./entitlements.server")).resolveEntitledPlan;
  const planId = await resolve(userId);
  const allowance = teamSeatAllowance(planId, 0);
  const usage = await readTeamSeatUsage(userId, rpc);
  return teamSeatsView.parse({ planId, ...allowance, ...usage });
}
