import { z } from "zod";
import { teamSeatAllowance, type PlanId } from "./billing";
import { teamCall, projectTeamRpc } from "./project-team-membership.server";
import type { TeamReadRpc } from "./project-team-read.server";

export interface TeamSeatAllowanceInput {
  workingSeats: number;
  viewerSeats: number;
}
/** Extra purchased working seats, read from the authoritative LIVE Stripe projection
 * only when the entitlement owns that subscription and its period is still current.
 * It is a SEPARATE read that fails to 0, so a missing migration, a transport failure,
 * a manual/comped grant, a free account or a legacy provider all keep exactly the
 * plan's seat bundle. Seat purchase/upgrade/downgrade is not offered yet: nothing in
 * the product can increase this number; only a reconciled Stripe projection can. */
async function purchasedWorkingSeats(userId: string): Promise<number> {
  const { readPurchasedWorkingSeats } = await import("./stripe-lifecycle.server");
  return readPurchasedWorkingSeats(userId);
}
/** The largest purchased seat count this product can represent; it mirrors the
 * database CHECK on the projection, so an out-of-range number is a fault, not a
 * bigger allowance. */
const MAX_PURCHASED_WORKING_SEATS = 1000;

/**
 * Extra seats to add to the plan bundle.
 *
 * `resolveEntitledPlan` fails CLOSED to `freePreview`, so `freePreview` means
 * either a genuinely free account or an entitlement read that did not succeed.
 * Neither may be topped up from a second, independent read: the extras read is
 * not even called in that state, and the allowance is exactly the free bundle.
 * A non-integral, negative, oversized or non-numeric count — including from an
 * injected dependency — is 0, never a wider allowance.
 */
async function extraWorkingSeats(
  planId: PlanId,
  userId: string,
  readPurchased: (userId: string) => Promise<number>,
): Promise<number> {
  if (planId === "freePreview") return 0;
  const purchased = await readPurchased(userId);
  return typeof purchased === "number" &&
    Number.isInteger(purchased) &&
    purchased > 0 &&
    purchased <= MAX_PURCHASED_WORKING_SEATS
    ? purchased
    : 0;
}
/** The owner's current seat allowance: the plan bundle plus any purchased extra
 * working seats. Fails closed to the free tier like every other entitlement read. */
export async function readTeamSeatAllowance(
  userId: string,
  resolvePlan?: (userId: string) => Promise<PlanId>,
  readPurchased: (userId: string) => Promise<number> = purchasedWorkingSeats,
): Promise<TeamSeatAllowanceInput> {
  const resolve = resolvePlan ?? (await import("./entitlements.server")).resolveEntitledPlan;
  const planId = await resolve(userId);
  return teamSeatAllowance(planId, await extraWorkingSeats(planId, userId, readPurchased));
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
  readPurchased: (userId: string) => Promise<number> = purchasedWorkingSeats,
): Promise<z.infer<typeof teamSeatsView>> {
  const resolve = resolvePlan ?? (await import("./entitlements.server")).resolveEntitledPlan;
  const planId = await resolve(userId);
  const allowance = teamSeatAllowance(
    planId,
    await extraWorkingSeats(planId, userId, readPurchased),
  );
  const usage = await readTeamSeatUsage(userId, rpc);
  return teamSeatsView.parse({ planId, ...allowance, ...usage });
}
