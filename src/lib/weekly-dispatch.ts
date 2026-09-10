import { z } from "zod";
export const WEEKLY_DISPATCH_LIMIT = 20;
const scope = z
  .object({ ownerId: z.string().uuid(), projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) })
  .strict();
type Scope = z.infer<typeof scope>;
const batch = z
  .array(scope)
  .max(WEEKLY_DISPATCH_LIMIT)
  .refine(
    (targets) => new Set(targets.map((s) => `${s.ownerId}:${s.projectId}`)).size === targets.length,
    "duplicate_weekly_target",
  );
/** Validate the entire bounded batch before starting work. Project-level leases,
 * stage identities and budgets remain authoritative inside each runner. All
 * projects start together so the batch does not multiply the HTTP duration. */
export async function dispatchWeeklyBatch<T>(targets: unknown, run: (scope: Scope) => Promise<T>) {
  const scopes = batch.parse(targets);
  return Promise.all(
    scopes.map(async (scope) => {
      try {
        return await run(scope);
      } catch {
        return { projectId: scope.projectId, action: "unavailable" as const };
      }
    }),
  );
}
