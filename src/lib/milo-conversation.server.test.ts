import { describe, expect, it, vi } from "vitest";
import {
  advanceConversationTurn,
  beginConversationTurn,
  claimConversationTurn,
  listConversations,
  readConversation,
} from "./milo-conversation.server";
import { conversationSend } from "./milo-conversation";
const actor = "00000000-0000-4000-8000-000000000001";
const ownerId = "00000000-0000-4000-8000-000000000002";
const conversationId = "00000000-0000-4000-8000-000000000003";
const turnId = "00000000-0000-4000-8000-000000000004";
const lease = "00000000-0000-4000-8000-000000000005";
const target = { ownerId, projectId: "p", conversationId };
const input = { ...target, turnId, body: "Review SEO", locale: "pl" };
const turn = {
  turnId,
  ordinal: 1,
  body: input.body,
  locale: input.locale,
  state: "pending",
  events: [],
  createdAt: "2026-09-13T12:00:00Z",
  updatedAt: "2026-09-13T12:00:00Z",
};
function responding(data: unknown) {
  return vi.fn(async (name: string, _params: Record<string, unknown>) => ({
    data:
      name === "acquire_project_team_preview"
        ? lease
        : name === "release_project_team_preview"
          ? null
          : data,
    error: null,
  }));
}
describe("conversation server authority and response validation", () => {
  it("rejects forged actor, roles, events and claim identities before storage access", async () => {
    const rpc = responding(null);
    for (const extra of [
      { actorId: ownerId },
      { role: "seo" },
      { events: [] },
      { attemptId: lease },
      { state: "completed" },
    ])
      expect(() => conversationSend.parse({ ...input, ...extra })).toThrow();
    await expect(beginConversationTurn("forged", input, rpc)).rejects.toThrow();
    await expect(
      beginConversationTurn(actor, { ...input, body: "ą".repeat(4001) }, rpc),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("keeps the authenticated participant distinct from the client owner", async () => {
    const rpc = responding({ created: true, turn });
    await beginConversationTurn(actor, input, rpc);
    expect(rpc).toHaveBeenCalledWith("begin_milo_conversation_turn", {
      p_actor: actor,
      p_owner: ownerId,
      p_project: "p",
      p_conversation: conversationId,
      p_turn: turnId,
      p_body: input.body,
      p_locale: "pl",
    });
    expect(rpc).toHaveBeenLastCalledWith("release_project_team_preview", {
      p_actor: actor,
      p_owner: ownerId,
      p_lease: lease,
    });
  });
  it("sends the separate provider-check consent and refuses a stored response without it", async () => {
    const consented = { ...input, allowProviderChecks: true };
    const rpc = responding({ created: true, turn: { ...turn, allowProviderChecks: true } });
    await beginConversationTurn(actor, consented, rpc);
    expect(rpc).toHaveBeenCalledWith(
      "begin_milo_conversation_turn",
      expect.objectContaining({ p_allow_checks: true }),
    );
    for (const stored of [{ ...turn, allowProviderChecks: false }, turn])
      await expect(
        beginConversationTurn(actor, consented, responding({ created: true, turn: stored })),
      ).rejects.toThrow();
  });
  it("refuses substituted task content or identity in stored responses", async () => {
    for (const change of [{ body: "Other message" }, { turnId: lease }, { locale: "en" }])
      await expect(
        beginConversationTurn(
          actor,
          input,
          responding({ created: true, turn: { ...turn, ...change } }),
        ),
      ).rejects.toThrow();
  });
  it("refuses substituted owners, actors, projects, conversations and skipped history", async () => {
    const page = {
      ...target,
      actorId: actor,
      title: "SEO",
      turnCount: 1,
      turns: [turn],
      nextAfter: 1,
      hasMore: false,
    };
    for (const change of [
      { actorId: ownerId },
      { ownerId: actor },
      { projectId: "q" },
      { conversationId: lease },
      { nextAfter: 0 },
      { hasMore: true },
      { turns: [{ ...turn, ordinal: 2 }] },
    ])
      await expect(
        readConversation(actor, target, responding({ ...page, ...change })),
      ).rejects.toThrow();
    expect(await readConversation(actor, target, responding(page))).toEqual(page);
  });
  it("refuses claim tokens when a stored claim was not acquired", async () => {
    for (const data of [
      { acquired: false, attemptId: lease, turn },
      { acquired: true, attemptId: null, turn },
      { acquired: true, attemptId: lease, turn },
    ])
      await expect(
        claimConversationTurn(actor, { ...target, turnId }, responding(data)),
      ).rejects.toThrow();
  });
  it("accepts only exact server events and detects missing or changed evidence", async () => {
    const change = {
      attemptId: lease,
      expected: 0,
      events: [{ kind: "assistant" as const, role: "seo" as const, text: "Evidence reviewed" }],
      state: "completed" as const,
    };
    const result = { ...turn, state: "completed", events: change.events };
    expect(
      await advanceConversationTurn(actor, { ...target, turnId }, change, responding(result)),
    ).toEqual(result);
    for (const data of [
      { ...result, events: [] },
      { ...result, state: "running" },
      { ...result, events: [{ ...change.events[0], text: "Changed" }] },
    ])
      await expect(
        advanceConversationTurn(actor, { ...target, turnId }, change, responding(data)),
      ).rejects.toThrow();
  });
  it("refuses arbitrary result URLs, unknown tools and oversized event sequences before dispatch", async () => {
    const rpc = responding(null);
    const change = {
      attemptId: lease,
      expected: 0,
      events: [
        {
          kind: "assistant" as const,
          role: "seo" as const,
          text: "Result",
          href: "https://untrusted.example",
        },
      ],
      state: "completed" as const,
    };
    await expect(
      advanceConversationTurn(actor, { ...target, turnId }, change, rpc),
    ).rejects.toThrow();
    await expect(
      advanceConversationTurn(
        actor,
        { ...target, turnId },
        { ...change, expected: 24, events: [{ kind: "status", role: "lead", text: "State" }] },
        rpc,
      ),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects directory scope substitution without returning another client's history", async () => {
    await expect(
      listConversations(
        actor,
        { ownerId, projectId: "p" },
        responding({ actorId: ownerId, ownerId, projectId: "p", conversations: [] }),
      ),
    ).rejects.toThrow();
  });
  it("contains storage errors without leaking database details", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "fixture-private database detail" },
    }));
    await expect(beginConversationTurn(actor, input, rpc)).rejects.not.toThrow("fixture-private");
    expect(rpc).toHaveBeenCalledOnce();
  });
});
