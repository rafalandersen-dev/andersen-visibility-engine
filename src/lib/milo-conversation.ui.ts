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
  return turn.events.filter((event) => {
    if (event.kind === "assistant" || event.kind === "handoff") return true;
    if (event.kind !== "tool") return false;
    if (event.state !== "running") return true;
    return (
      turn.state === "running" &&
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
    default:
      return null;
  }
}
