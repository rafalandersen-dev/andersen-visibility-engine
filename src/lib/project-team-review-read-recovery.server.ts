import type { TeamReadRpc } from "./project-team-read.server";

const reads = new Set([
  "read_project_team_review_context",
  "read_project_team_review_authority",
  "read_project_team_review_history",
]);
export const TEAM_REVIEW_READ_BUDGET_MS = 1500;
const pauses = [30, 90] as const;

/** Only these SELECT-only RPCs may retry a confirmed PostgreSQL NOWAIT rollback.
 * Each attempt repeats current account/project/membership checks. The caller's
 * existing preview lease stays held; this wrapper neither acquires a lease nor
 * retries any write, transport failure, access refusal or version conflict.
 * The deadline bounds new attempts, not an already running RPC's transport time.
 */
export function recoverTeamReviewRead(
  rpc: TeamReadRpc,
  deadline = Date.now() + TEAM_REVIEW_READ_BUDGET_MS,
): TeamReadRpc {
  return async (name, args) => {
    if (!reads.has(name)) return rpc(name, args);
    for (let attempt = 0; ; attempt++) {
      if (Date.now() >= deadline)
        return { data: null, error: { code: "55P03", message: "team_review_read_deadline" } };
      const result = await rpc(name, args);
      const code = (result?.error as { code?: string } | null | undefined)?.code;
      if (code !== "55P03" || attempt >= pauses.length) return result;
      if (Date.now() + pauses[attempt] >= deadline) return result;
      await new Promise((resolve) => setTimeout(resolve, pauses[attempt]));
    }
  };
}
