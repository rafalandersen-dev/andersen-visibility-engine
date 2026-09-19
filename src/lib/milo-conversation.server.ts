import { z } from "zod";
import {
  conversationDirectory,
  conversationEvents,
  conversationList,
  conversationPage,
  conversationRead,
  conversationSend,
  conversationTurn,
  conversationTurnTarget,
} from "./milo-conversation";
import { projectTeamRpc, teamCall } from "./project-team-membership.server";
import { admittedReadRpc } from "./project-team-read-admission.server";
import type { TeamReadRpc } from "./project-team-read.server";

const actorSchema = z.string().uuid();
type Target = z.infer<typeof conversationTurnTarget>;
function args(
  actorId: string,
  input: { ownerId: string; projectId: string; conversationId?: string; turnId?: string },
) {
  return {
    p_actor: actorSchema.parse(actorId),
    p_owner: input.ownerId,
    p_project: input.projectId,
    ...(input.conversationId ? { p_conversation: input.conversationId } : {}),
    ...(input.turnId ? { p_turn: input.turnId } : {}),
  };
}
function scoped(
  actor: string,
  input: { ownerId: string; projectId: string },
  result: { actorId: string; ownerId: string; projectId: string },
) {
  if (
    result.actorId !== actor ||
    result.ownerId !== input.ownerId ||
    result.projectId !== input.projectId
  )
    throw new Error("Conversation access could not be confirmed.");
}
function sameTurn(turnId: string, result: z.infer<typeof conversationTurn>) {
  if (result.turnId !== turnId) throw new Error("Conversation response could not be confirmed.");
  return result;
}

/** Authenticated actor is always distinct from the owner/project input. All
 * RPCs reauthorize in storage; no browser cache or owner-workspace fallback. */
export async function beginConversationTurn(
  actorId: string,
  raw: z.infer<typeof conversationSend>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = actorSchema.parse(actorId),
    input = conversationSend.parse(raw);
  const result = z
    .object({ created: z.boolean(), turn: conversationTurn })
    .strict()
    .parse(
      await teamCall(
        "begin_milo_conversation_turn",
        {
          ...args(actor, input),
          p_body: input.body,
          p_locale: input.locale,
          ...(input.allowDraftGeneration !== undefined
            ? { p_allow_generation: input.allowDraftGeneration }
            : {}),
          ...(input.allowProviderChecks !== undefined
            ? { p_allow_checks: input.allowProviderChecks }
            : {}),
        },
        admittedReadRpc(actor, rpc),
      ),
    );
  sameTurn(input.turnId, result.turn);
  if (
    result.turn.body !== input.body ||
    result.turn.locale !== input.locale ||
    (result.turn.allowDraftGeneration ?? false) !== (input.allowDraftGeneration ?? false) ||
    (result.turn.allowProviderChecks ?? false) !== (input.allowProviderChecks ?? false)
  )
    throw new Error("Conversation response could not be confirmed.");
  return result;
}
/** Shared, validated continuity page read. The browser and executor entry points
 * differ only in whether the storage call is admitted through the browser
 * preview-lease budget; every response invariant (scope, page ordinals, turn
 * count, page linkage, unique turns) is enforced identically here. No
 * caller-supplied flag selects the budget — the two exported entry points do. */
async function readConversationPage(
  actor: string,
  input: z.infer<typeof conversationRead>,
  rpc: TeamReadRpc,
) {
  const result = conversationPage.parse(
    await teamCall("read_milo_conversation", { ...args(actor, input), p_after: input.after }, rpc),
  );
  scoped(actor, input, result);
  if (
    result.conversationId !== input.conversationId ||
    result.turns.some(
      (turn, index) => turn.ordinal !== input.after + index + 1 || turn.ordinal > result.turnCount,
    ) ||
    result.nextAfter !== (result.turns.at(-1)?.ordinal ?? input.after) ||
    result.hasMore !== result.nextAfter < result.turnCount ||
    new Set(result.turns.map((turn) => turn.turnId)).size !== result.turns.length
  )
    throw new Error("Conversation history could not be confirmed.");
  return result;
}
export async function readConversation(
  actorId: string,
  raw: z.input<typeof conversationRead>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = actorSchema.parse(actorId),
    input = conversationRead.parse(raw);
  // Browser-facing continuity read: still bounded by the per-actor/owner preview
  // budget so a rendered live view cannot exceed its lease allocation.
  return readConversationPage(actor, input, admittedReadRpc(actor, rpc));
}
/** Private executor-only continuity read. Identical parsing and response
 * validation to the browser `readConversation`, but it does NOT draw on the
 * browser preview-lease budget (`admittedReadRpc`). Like the executor's
 * claim/execution-check/advance RPCs, it runs under the durable claim, and the
 * `read_milo_conversation` RPC reauthorizes the actor's account, membership
 * revision and owner/project/conversation scope on every call, so this read must
 * not be starved by a signed-in owner's live polling of the same actor/owner
 * budget. Do not expose this from a browser server function: browser reads keep
 * `readConversation`. */
export async function readConversationForExecution(
  actorId: string,
  raw: z.input<typeof conversationRead>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = actorSchema.parse(actorId),
    input = conversationRead.parse(raw);
  return readConversationPage(actor, input, rpc);
}
export async function listConversations(
  actorId: string,
  raw: z.input<typeof conversationList>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = actorSchema.parse(actorId),
    input = conversationList.parse(raw);
  const result = conversationDirectory.parse(
    await teamCall(
      "list_milo_conversations",
      {
        ...args(actor, input),
        p_offset: input.offset,
      },
      admittedReadRpc(actor, rpc),
    ),
  );
  scoped(actor, input, result);
  if (
    new Set(result.conversations.map((item) => item.conversationId)).size !==
    result.conversations.length
  )
    throw new Error("Conversation history could not be confirmed.");
  return result;
}
export async function cancelConversationTurn(
  actorId: string,
  raw: Target,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = actorSchema.parse(actorId),
    input = conversationTurnTarget.parse(raw);
  return sameTurn(
    input.turnId,
    conversationTurn.parse(
      await teamCall(
        "cancel_milo_conversation_turn",
        args(actor, input),
        admittedReadRpc(actor, rpc),
      ),
    ),
  );
}

/** Renews only the start window of an unclaimed task. The database queues it;
 * authenticated requests never execute native work on the browser connection. */
export async function resumeConversationTurn(
  actorId: string,
  raw: Target,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = actorSchema.parse(actorId),
    input = conversationTurnTarget.parse(raw);
  return sameTurn(
    input.turnId,
    conversationTurn.parse(
      await teamCall(
        "resume_milo_conversation_turn",
        args(actor, input),
        admittedReadRpc(actor, rpc),
      ),
    ),
  );
}

/** Private executor-only entry. Do not expose the returned attempt token in
 * server functions or UI; a lost claim response never authorizes a new claim.
 * The executor's own claim/execution-check/advance RPCs deliberately bypass the
 * browser preview-lease budget (`admittedReadRpc`): they are private, service-role
 * calls that re-authorize the actor's membership, account and durable claim inside
 * storage, and are already bounded by the dispatch enqueue and running-turn
 * capacity gates. Sharing the preview budget let a signed-in owner watching the
 * turn's live progress (repeated conversation export polls) starve the executor's
 * own checkpoint writes: a transient `team_preview_capacity` refusal at the
 * analysing checkpoint aborted a running turn as `execution_unknown`. */
export async function claimConversationTurn(
  actorId: string,
  raw: Target,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = actorSchema.parse(actorId),
    input = conversationTurnTarget.parse(raw);
  const result = z
    .object({
      acquired: z.boolean(),
      attemptId: z.string().uuid().nullable(),
      turn: conversationTurn,
    })
    .strict()
    .parse(await teamCall("claim_milo_conversation_turn", args(actor, input), rpc));
  sameTurn(input.turnId, result.turn);
  if (
    result.acquired !== (result.attemptId !== null) ||
    (result.acquired && result.turn.state !== "running")
  )
    throw new Error("Conversation execution could not be confirmed.");
  return result;
}
const progress = z
  .object({
    attemptId: z.string().uuid(),
    expected: z.number().int().min(0).max(24),
    events: conversationEvents.refine((events) => events.length > 0),
    state: z.enum(["running", "completed", "failed", "unknown"]),
  })
  .strict();
export async function assertConversationExecution(
  actorId: string,
  raw: Target,
  attemptId: string,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = actorSchema.parse(actorId),
    input = conversationTurnTarget.parse(raw);
  // Executor-only recheck: bypass the browser preview-lease budget (see
  // claimConversationTurn). Full membership/claim/lease authority is enforced by
  // the RPC itself, so this last-moment gate cannot be starved by a live viewer.
  z.literal(true).parse(
    await teamCall(
      "check_milo_conversation_execution",
      { ...args(actor, input), p_attempt: z.string().uuid().parse(attemptId) },
      rpc,
    ),
  );
}
export async function advanceConversationTurn(
  actorId: string,
  raw: Target,
  update: z.infer<typeof progress>,
  rpc: TeamReadRpc = projectTeamRpc,
) {
  const actor = actorSchema.parse(actorId),
    input = conversationTurnTarget.parse(raw),
    change = progress.parse(update);
  if (change.expected + change.events.length > 24)
    throw new Error("Conversation event limit reached.");
  // Executor-only checkpoint write: bypass the browser preview-lease budget (see
  // claimConversationTurn). The RPC re-authorizes membership and the durable claim
  // atomically, so a live viewer's export polls can never starve a saved event.
  const result = sameTurn(
    input.turnId,
    conversationTurn.parse(
      await teamCall(
        "advance_milo_conversation_turn",
        {
          ...args(actor, input),
          p_attempt: change.attemptId,
          p_expected: change.expected,
          p_events: change.events,
          p_state: change.state,
        },
        rpc,
      ),
    ),
  );
  if (
    result.state !== change.state ||
    result.events.length !== change.expected + change.events.length ||
    JSON.stringify(result.events.slice(change.expected)) !== JSON.stringify(change.events)
  )
    throw new Error("Conversation progress could not be confirmed.");
  return result;
}
