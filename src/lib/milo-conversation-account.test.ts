import { describe, expect, it } from "vitest";
import {
  accountConversationCursor,
  checkedAccountConversations,
  type AccountConversation,
} from "./milo-conversation-account";
const actor = "00000000-0000-4000-8000-000000000001",
  owner = "00000000-0000-4000-8000-000000000002";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const available = (n: number, createdAt: string): AccountConversation => ({
  ownerId: owner,
  projectId: "p",
  conversationId: id(n),
  createdAt,
  access: "available",
  title: `Title ${n}`,
});
const page = (conversations: unknown[], hasMore = false) => ({
  actorId: actor,
  conversations,
  hasMore,
});
describe("account conversation directory response checks", () => {
  it("accepts exact storage order with microsecond timestamps, equivalent offsets and ID tie-breaks", () => {
    const entries = [
      available(9, "2026-09-13T12:00:00.000002+00:00"),
      available(8, "2026-09-13T14:00:00.000001+02:00"),
      available(3, "2026-09-13T12:00:00.000001Z"),
      { ...available(2, "2026-09-13T11:59:59+00:00"), access: "unavailable", title: null },
    ];
    expect(checkedAccountConversations(actor, {}, page(entries)).conversations).toHaveLength(4);
    expect(
      checkedAccountConversations(
        actor,
        { before: accountConversationCursor(entries[1] as AccountConversation) },
        page(entries.slice(2)),
      ).conversations,
    ).toHaveLength(2);
  });
  it.each([
    ["another actor", { ...page([]), actorId: owner }, {}],
    ["short page claiming more", page([available(1, "2026-09-13T12:00:00Z")], true), {}],
    [
      "duplicate identity",
      page([available(2, "2026-09-13T12:00:01Z"), available(2, "2026-09-13T12:00:00Z")]),
      {},
    ],
    [
      "ascending order",
      page([available(1, "2026-09-13T12:00:00Z"), available(2, "2026-09-13T12:00:01Z")]),
      {},
    ],
    [
      "equal position",
      page([available(1, "2026-09-13T12:00:00Z"), available(1, "2026-09-13T12:00:00Z")]),
      {},
    ],
    [
      "entry not older than the cursor",
      page([available(5, "2026-09-13T12:00:00Z")]),
      { before: { createdAt: "2026-09-13T12:00:00Z", conversationId: id(5) } },
    ],
    [
      "title retained after access ended",
      page([{ ...available(1, "2026-09-13T12:00:00Z"), access: "unavailable" }]),
      {},
    ],
    [
      "available entry without title",
      page([{ ...available(1, "2026-09-13T12:00:00Z"), title: null }]),
      {},
    ],
    [
      "extra private field",
      page([{ ...available(1, "2026-09-13T12:00:00Z"), projectName: "Client" }]),
      {},
    ],
    [
      "more than one page",
      page(Array.from({ length: 26 }, (_, i) => available(99 - i, "2026-09-13T12:00:00Z"))),
      {},
    ],
    ["invalid timestamp", page([available(1, "yesterday")]), {}],
  ])("rejects %s", (_name, response, input) => {
    expect(() => checkedAccountConversations(actor, input, response)).toThrow();
  });
  it("rejects forged request fields and half cursors", () => {
    for (const input of [
      { actorId: actor },
      { offset: 0 },
      { before: { createdAt: "2026-09-13T12:00:00Z" } },
      { before: { conversationId: id(1) } },
    ])
      expect(() => checkedAccountConversations(actor, input as never, page([]))).toThrow();
  });
});
