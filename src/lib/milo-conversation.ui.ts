import { z } from "zod";
import {
  conversationDirectory,
  conversationPage,
  conversationTarget,
  type ConversationEvent,
  type ConversationTurn,
} from "./milo-conversation";
import { teamProjectTarget } from "./project-team-view";

export type MiloProject = z.infer<typeof teamProjectTarget> & { name: string };
export const conversationKey = (actor: string, project: z.infer<typeof teamProjectTarget>) =>
  ["milo-conversation", actor, project.ownerId, project.projectId] as const;
export function checkedDirectory(actor: string, project: MiloProject, raw: unknown) {
  const result = conversationDirectory.parse(raw);
  if (
    result.actorId !== actor ||
    result.ownerId !== project.ownerId ||
    result.projectId !== project.projectId
  )
    throw new Error("Conversation access unavailable.");
  return result;
}
export function checkedPage(
  actor: string,
  target: z.infer<typeof conversationTarget>,
  raw: unknown,
) {
  const result = conversationPage.parse(raw);
  if (
    result.actorId !== actor ||
    result.ownerId !== target.ownerId ||
    result.projectId !== target.projectId ||
    result.conversationId !== target.conversationId
  )
    throw new Error("Conversation access unavailable.");
  return result;
}
export const lastConversationPage = (count: number) => Math.floor(Math.max(0, count - 1) / 20) * 20;
export const isActiveTurn = (turn: ConversationTurn) =>
  turn.state === "pending" || turn.state === "running";
export function conversationStatus(turn: ConversationTurn) {
  const code = turn.events.at(-1)?.code;
  return turn.state === "failed" &&
    code &&
    ["provider_unavailable", "usage_limit", "budget_unavailable"].includes(code)
    ? `chat.${code}`
    : `chat.${turn.state}`;
}
/** Starting evidence stays in storage, but a finished/unknown turn must never
 * look as if an old operation is still running. Render its matching result once. */
export function displayedConversationEvents(turn: ConversationTurn) {
  // A later user-save receipt updates the proposal in its original position.
  // Keep one stable review card and preserve its open state across polling.
  const events = turn.events.flatMap((event, index) => {
    if (event.kind !== "tool" || event.tool !== "draft_metadata_proposal" || !event.operationId)
      return [event];
    const same = (other: ConversationEvent) =>
      other.kind === "tool" && other.tool === event.tool && other.operationId === event.operationId;
    if (turn.events.slice(0, index).some(same)) return [];
    const latest = turn.events
      .slice(index)
      .reverse()
      .find((other) => same(other) && other.state !== "running");
    return [latest ?? event];
  });
  return events.filter((event) => {
    if (event.kind === "assistant" || event.kind === "handoff") return true;
    if (event.kind !== "tool") return false;
    if (event.state !== "running") return true;
    return (
      (turn.state === "running" || event.tool === "draft_metadata_proposal") &&
      !turn.events.some(
        (next) =>
          next !== event && next.operationId === event.operationId && next.state !== "running",
      )
    );
  });
}
export function referenceDestination(
  project: MiloProject,
  actor: string,
  event: ConversationEvent,
) {
  if (event.kind !== "tool" || event.state !== "completed" || !event.reference) return null;
  const reference = event.reference;
  if (actor !== project.ownerId)
    return reference.kind === "draft"
      ? {
          to: "/app/collaborators" as const,
          search: { owner: project.ownerId, project: project.projectId, asset: reference.id },
        }
      : null;
  switch (reference.kind) {
    case "draft":
      return { to: "/app/editor" as const, search: { id: reference.id } };
    case "generation":
      return {
        to: "/app/generations" as const,
        search: { receipt: reference.id, project: project.projectId },
      };
    case "knowledge":
      return { to: "/app/specialists" as const, search: { knowledge: true } };
    case "audit":
      return { to: "/app/audit" as const, search: {} };
    case "weekly":
      return { to: "/app/specialists" as const, search: {} };
    case "technical":
      return { to: "/app/audit" as const, search: {} };
    case "visibility":
      return { to: "/app/ai-visibility" as const, search: {} };
    case "authority":
      return { to: "/app/backlinks" as const, search: {} };
    case "search_console":
      return { to: "/app/analytics" as const, search: {} };
    case "ai_advice":
      return { to: "/app/ai-visibility" as const, search: {} };
    default:
      return null;
  }
}

/** What the browser may conclude from one send response. Only the server's typed
 * confirmed rollback is "notSaved", and only a saved turn with the request's own
 * turn ID is "saved". Anything else — a thrown call included — stays "uncertain"
 * and may be recovered only by resubmitting the identical request. */
export type SendOutcome = "saved" | "notSaved" | "uncertain";
export function sendOutcome(response: unknown, turnId: string): SendOutcome {
  if (!response || typeof response !== "object") return "uncertain";
  const value = response as { turn?: { turnId?: unknown }; notSaved?: unknown };
  if (value.notSaved === "busy" && value.turn === undefined) return "notSaved";
  return value.turn?.turnId === turnId ? "saved" : "uncertain";
}
/** Uncertainty is monotonic per request. The server's typed busy response proves
 * only that the attempt it answers did not commit; if any earlier attempt of the
 * same immutable request was uncertain, that one may have saved and queued work,
 * so the request stays uncertain. Only a never-uncertain request can be "notSaved". */
export function retainedSendOutcome(result: SendOutcome, everUncertain: boolean): SendOutcome {
  return everUncertain && result === "notSaved" ? "uncertain" : result;
}
/** History is never read while directory authorization is failing, and a new
 * conversation is read only after its first send was confirmed or became
 * uncertain — never alongside the begin call it would compete with. */
export function conversationReadEnabled(state: {
  fresh: boolean;
  concealed: boolean;
  outcome?: SendOutcome;
}) {
  if (state.concealed) return false;
  return !state.fresh || state.outcome === "saved" || state.outcome === "uncertain";
}
/** A new conversation whose first send is uncertain may not exist yet. A failed
 * read there means "not confirmed yet", not lost access: recovery stays offered and
 * the conversation is not reported as unavailable or promoted into the URL. */
export function awaitingFirstConfirmation(state: { fresh: boolean; outcome?: SendOutcome }) {
  return state.fresh && state.outcome === "uncertain";
}
