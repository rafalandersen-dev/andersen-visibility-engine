import { z } from "zod";
import { teamProjectTarget } from "./project-team-view";

export const ACCOUNT_CONVERSATION_PAGE = 25;
const instant = z.string().datetime({ offset: true });
const cursor = z.object({ createdAt: instant, conversationId: z.string().uuid() }).strict();
export const accountConversationList = z.object({ before: cursor.optional() }).strict();
const scope = teamProjectTarget.extend({ conversationId: z.string().uuid(), createdAt: instant });
// Identifiers only once access ends: no title, message, project name or data.
export const accountConversationEntry = z.discriminatedUnion("access", [
  scope
    .extend({
      access: z.literal("available"),
      title: z
        .string()
        .min(1)
        .max(800)
        .refine((text) => new TextEncoder().encode(text).byteLength <= 800),
    })
    .strict(),
  scope.extend({ access: z.literal("unavailable"), title: z.null() }).strict(),
]);
export type AccountConversation = z.infer<typeof accountConversationEntry>;
export const accountConversationPage = z
  .object({
    actorId: z.string().uuid(),
    conversations: z.array(accountConversationEntry).max(ACCOUNT_CONVERSATION_PAGE),
    hasMore: z.boolean(),
  })
  .strict();

/** Exact storage order including microseconds: newest first, then conversation ID. */
function position(entry: z.infer<typeof cursor>) {
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?(Z|[+-]\d\d(?::?\d\d)?)$/i.exec(
    entry.createdAt,
  );
  let zone = match?.[3].toUpperCase() ?? "";
  if (/^[+-]\d\d$/.test(zone)) zone += ":00";
  else if (/^[+-]\d{4}$/.test(zone)) zone = `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const seconds = match ? Date.parse(match[1] + zone) : NaN;
  if (!Number.isFinite(seconds)) throw new Error("Conversation directory could not be confirmed.");
  const nanos = BigInt((match![2] ?? "").padEnd(9, "0"));
  return {
    time: BigInt(seconds) * BigInt(1000000) + nanos,
    id: entry.conversationId.toLowerCase(),
  };
}
function newer(a: z.infer<typeof cursor>, b: z.infer<typeof cursor>) {
  const left = position(a),
    right = position(b);
  return left.time > right.time || (left.time === right.time && left.id > right.id);
}
export const accountConversationCursor = (entry: AccountConversation) => ({
  createdAt: entry.createdAt,
  conversationId: entry.conversationId,
});
export function checkedAccountConversations(
  actor: string,
  rawInput: z.input<typeof accountConversationList>,
  raw: unknown,
) {
  const input = accountConversationList.parse(rawInput),
    result = accountConversationPage.parse(raw),
    list = result.conversations;
  if (
    result.actorId !== actor ||
    (result.hasMore && list.length !== ACCOUNT_CONVERSATION_PAGE) ||
    new Set(list.map((entry) => entry.conversationId.toLowerCase())).size !== list.length ||
    list.some((entry, index) =>
      index === 0 ? !!input.before && !newer(input.before, entry) : !newer(list[index - 1], entry),
    )
  )
    throw new Error("Conversation directory could not be confirmed.");
  return result;
}
