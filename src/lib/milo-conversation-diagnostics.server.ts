/**
 * Bounded, SERVICE-ONLY failure diagnostics for the Milo conversation executor.
 *
 * Purpose: a conversation turn currently collapses EVERY non-classified error into
 * a single sanitised `execution_unknown` event, which is honest for the user but
 * leaves no way to tell WHERE a turn stopped or WHY. This module records, for a
 * failed turn only, the execution STAGE (a fixed enum), a SAFE error class/name
 * category (reusing the allowlist-only `classifyAiError`), an optional validated
 * HTTP status and an optional allowlisted SQLSTATE — correlated to the turn and,
 * where one exists, the operation id.
 *
 * SECURITY CONTRACT — this module NEVER records, returns or logs any of:
 *   - message bodies, prompts, model output, tokens or credentials,
 *   - raw exception messages, stacks or stringified errors,
 *   - provider payloads, response bodies/headers or URLs,
 *   - the owner/actor/project identity or any user content.
 * Only opaque correlation ids (turn/operation) and fixed enums/allowlisted codes
 * are stored, so every column is safe to read via the admin DB connector.
 *
 * It is best-effort and inert to control flow: a diagnostic write NEVER throws out
 * of the executor, is NEVER retried, and NEVER changes or suppresses the turn's
 * user-facing outcome. It does not model success; there is at most one ROW per turn,
 * first-terminal-wins with an explicit provenance bit — a preliminary claim-time
 * receipt is upgraded in place by a later terminal acquired-execution receipt, and a
 * terminal receipt is never overwritten. This is deliberately NOT a general
 * observability platform.
 */
import { z } from "zod";
import { projectTeamRpc } from "./project-team-membership.server";
import type { TeamReadRpc } from "./project-team-read.server";
import { TeamAdmissionBusyError } from "./project-team-admission";
import {
  classifyAiError,
  type AiErrorClass,
  type AiErrorNameCategory,
} from "./ai-error-diagnostics.server";

/** Fixed, non-sensitive execution stages, in run order. The pre-brief boundary
 * (`assert_live`, `continuity_read`, `continuity_check`, `brief_start`) is kept
 * distinct because the observed live failures stop there; the repeated assignment
 * loop is coarsened to its meaningful steps. A receipt always records the stage of
 * the ORIGINAL failure; `unknown` is the pre-entry default (e.g. a claim-time
 * fault, which never reaches a stage). */
export const conversationStages = [
  "assert_live",
  "continuity_read",
  "continuity_check",
  "brief_start",
  "brief_dispatch",
  "brief_result",
  "plan_model",
  "plan_parse",
  "handoff_save",
  "tool_start",
  "tool_dispatch",
  "tool_result",
  "reply_model",
  "reply_save",
  "unknown",
] as const;
export type ConversationStage = (typeof conversationStages)[number];

/** Allowlisted, non-sensitive SQLSTATEs. All are transient contention/cancel
 * classes; none can carry content. `55P03` (lock_not_available) is the NOWAIT
 * denial a live-view read/write collision raises. The other three are reserved
 * for a later, minimal `teamCall` enhancement (see the module tradeoff note in the
 * evidence log); today only `55P03` is ever emitted, via `TeamAdmissionBusyError`. */
export type ConversationDiagnosticSqlState = "55P03" | "40001" | "40P01" | "57014";

/** The classified failure codes the executor's `failure()` can produce. Kept in
 * lockstep with the sanitised event codes; never a free-text value. */
export type ConversationFailureCode =
  "provider_unavailable" | "usage_limit" | "budget_unavailable" | "execution_unknown";
export interface ConversationFailureOutcome {
  state: "failed" | "unknown";
  code: ConversationFailureCode;
}

/** Where a receipt came from. `preliminary` is a pre-acquisition claim-time fault: the
 * claim acquisition is unconfirmed; if still pending it may be re-dispatched, so the receipt is
 * provisional. `terminal` is an acquired-execution outcome. The writer keeps one row
 * per turn and lets a `terminal` upgrade a `preliminary` (never the reverse), so a
 * retry's real failure is never lost to a provisional claim receipt. Because a
 * claim-time fault and an in-run failure can BOTH surface as `unknown`/
 * `execution_unknown`, provenance is an explicit input, never inferred from the
 * outcome. */
export type ConversationDiagnosticProvenance = "preliminary" | "terminal";

export interface ConversationFailureDiagnosis {
  stage: ConversationStage;
  errorClass: AiErrorClass;
  nameCategory: AiErrorNameCategory;
  httpStatus: number | null;
  sqlState: ConversationDiagnosticSqlState | null;
}

/** `error instanceof TeamAdmissionBusyError`, guarded so it cannot itself throw.
 * A hostile `Proxy` with a `getPrototypeOf` trap makes a bare `instanceof` raise,
 * which is exactly what must not escape the classifier; on any such failure we fall
 * back to "not a typed busy error" (SQLSTATE null), which never weakens the genuine
 * 55P03 case — a real `TeamAdmissionBusyError` matches without the trap firing. */
function isAdmissionBusy(error: unknown): boolean {
  try {
    return error instanceof TeamAdmissionBusyError;
  } catch {
    return false;
  }
}

/** Reduce a thrown value + the current stage to a fixed, non-sensitive diagnosis.
 * The class/name/status come from the shared allowlist-only `classifyAiError` (which
 * already tolerates throwing getters / hostile Proxies); the SQLSTATE is derived
 * structurally via the guarded `isAdmissionBusy`, never from a message. The executor
 * is preview-lease-free, so in the executor path a `TeamAdmissionBusyError` can only
 * be a `milo_conversation*` row `FOR SHARE`/`FOR UPDATE NOWAIT` refusal (SQLSTATE
 * 55P03), never a preview-budget refusal.
 *
 * Fail-closed: this runs FIRST in the executor's catch, so it must NEVER throw — a
 * throw here would prevent the authoritative outcome write and the diagnostic. The
 * whole body is guarded and, on any unexpected fault, returns the safest diagnosis
 * (`unknown`/`other`, no status, no SQLSTATE) at the recorded stage. */
export function classifyConversationFailure(
  error: unknown,
  stage: ConversationStage,
): ConversationFailureDiagnosis {
  try {
    const { errorClass, httpStatus, nameCategory } = classifyAiError(error);
    return {
      stage,
      errorClass,
      nameCategory,
      httpStatus,
      sqlState: isAdmissionBusy(error) ? "55P03" : null,
    };
  } catch {
    return {
      stage,
      errorClass: "unknown",
      nameCategory: "other",
      httpStatus: null,
      sqlState: null,
    };
  }
}

const turnId = z.string().uuid();
const operationId = z.string().uuid();

export interface ConversationDiagnosticInput {
  turnId: string;
  operationId?: string;
  diagnosis: ConversationFailureDiagnosis;
  outcome: ConversationFailureOutcome;
  /** Explicit claim-time (`preliminary`) vs acquired-execution (`terminal`)
   * provenance. Drives the writer's first-terminal-wins upsert; see the type. */
  provenance: ConversationDiagnosticProvenance;
}

/** Best-effort service-only write of a single failure receipt. Calls the
 * service-role `record_milo_conversation_diagnostic` RPC through the raw team RPC
 * (never `teamCall`, so it neither throws nor maps errors) and swallows every
 * failure: a missing candidate migration, a DB error or an aborted request all
 * leave the turn outcome untouched. It NEVER retries. Correlation ids are
 * uuid-validated before they leave the process; the fixed enum fields come only
 * from `classifyConversationFailure`/`failure()` and are enforced again by the
 * table's CHECK constraints. The `provenance` bit (preliminary claim-time vs terminal
 * acquired-execution) drives the writer's first-terminal-wins upsert. */
export async function recordConversationDiagnostic(
  input: ConversationDiagnosticInput,
  rpc: TeamReadRpc = projectTeamRpc,
): Promise<void> {
  try {
    const p_turn = turnId.parse(input.turnId);
    const p_operation =
      input.operationId === undefined ? null : operationId.parse(input.operationId);
    await rpc("record_milo_conversation_diagnostic", {
      p_turn,
      p_operation,
      p_stage: input.diagnosis.stage,
      p_outcome: input.outcome.state,
      p_outcome_code: input.outcome.code,
      p_error_class: input.diagnosis.errorClass,
      p_name_category: input.diagnosis.nameCategory,
      p_http_status: input.diagnosis.httpStatus,
      p_sql_state: input.diagnosis.sqlState,
      p_provenance: input.provenance,
    });
  } catch {
    // Diagnostics are inert: a recording failure must never affect the turn
    // outcome and is never retried.
  }
}
