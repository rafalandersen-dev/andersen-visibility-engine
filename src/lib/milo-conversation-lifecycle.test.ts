import { describe, expect, it, vi } from "vitest";
import {
  buildConversationExport,
  checkedConversationExportPage,
} from "./milo-conversation-lifecycle";
const actor = "00000000-0000-4000-8000-000000000001";
const target = {
  ownerId: actor,
  projectId: "p",
  conversationId: "00000000-0000-4000-8000-000000000002",
};
const stamp = "2026-09-13T12:00:00Z";
const turn = {
  turnId: "00000000-0000-4000-8000-000000000003",
  ordinal: 1,
  body: '<script>unsafe()</script>\n"private"',
  locale: "en",
  state: "completed",
  events: [{ kind: "assistant", role: "lead", text: "Saved answer" }],
  createdAt: stamp,
  updatedAt: stamp,
};
const page = {
  ...target,
  actorId: actor,
  title: "Private title",
  version: "a".repeat(64),
  observedAt: stamp,
  turnCount: 1,
  nextAfter: 1,
  hasMore: false,
  entries: [{ turn, proposal: null, omittedProposals: 0 }],
};
const signal = () => new AbortController().signal;
describe("complete conversation export assembly", () => {
  it("makes a parseable file preserving exact text and fences the final page", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce({ ...page, entries: [] });
    const result = await buildConversationExport(actor, target, read, signal());
    expect(JSON.parse(await result.blob.text()).entries[0].turn.body).toBe(turn.body);
    expect(read.mock.calls[1][0]).toEqual({ ...target, after: 1, version: page.version });
  });
  it.each([
    { actorId: target.conversationId },
    { ownerId: target.conversationId },
    { projectId: "q" },
    { conversationId: actor },
    { nextAfter: 0 },
    { hasMore: true },
    { turnCount: 2 },
    { entries: [] },
    { entries: [{ ...page.entries[0], turn: { ...turn, ordinal: 2 } }] },
    { entries: [{ ...page.entries[0], turn: { ...turn, attemptId: actor } }] },
  ])("rejects mismatched scope, gaps, cursors or private fields: %j", (change) => {
    expect(() => checkedConversationExportPage(actor, target, { ...page, ...change })).toThrow();
  });
  it("rejects missing or changed versions on a later page", () => {
    expect(() =>
      checkedConversationExportPage(actor, { ...target, after: 1 }, { ...page, entries: [] }),
    ).toThrow();
    expect(() =>
      checkedConversationExportPage(
        actor,
        { ...target, after: 1, version: "b".repeat(64) },
        { ...page, entries: [] },
      ),
    ).toThrow();
  });
  it.each(["revoke", "changed", "mismatch", "title"])(
    "returns no file if the final authorization/version check fails: %s",
    async (kind) => {
      const read = vi.fn().mockResolvedValueOnce(page);
      if (kind === "revoke") read.mockRejectedValueOnce(new Error("Revoked"));
      else
        read.mockResolvedValueOnce({
          ...page,
          entries: [],
          ...(kind === "changed"
            ? { version: "b".repeat(64) }
            : kind === "title"
              ? { title: "Changed" }
              : { actorId: target.conversationId }),
        });
      await expect(buildConversationExport(actor, target, read, signal())).rejects.toThrow();
      expect(read).toHaveBeenCalledTimes(2);
    },
  );
  it("does not read after cancellation or download a response that arrives after navigation", async () => {
    const before = new AbortController();
    before.abort();
    const read = vi.fn().mockResolvedValue(page);
    await expect(buildConversationExport(actor, target, read, before.signal)).rejects.toThrow(
      "cancelled",
    );
    expect(read).not.toHaveBeenCalled();
    const during = new AbortController();
    read.mockImplementation(async () => {
      during.abort();
      return page;
    });
    await expect(buildConversationExport(actor, target, read, during.signal)).rejects.toThrow(
      "cancelled",
    );
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("rejects duplicate turn identities even when ordinal continuity looks correct", async () => {
    const duplicate = {
      ...page,
      turnCount: 2,
      nextAfter: 2,
      entries: [page.entries[0], { ...page.entries[0], turn: { ...turn, ordinal: 2 } }],
    };
    await expect(
      buildConversationExport(actor, target, async () => duplicate, signal()),
    ).rejects.toThrow("duplicate");
  });
});
