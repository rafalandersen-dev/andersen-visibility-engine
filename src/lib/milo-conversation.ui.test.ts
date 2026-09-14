import { describe, expect, it } from "vitest";
import {
  checkedDirectory,
  checkedPage,
  conversationKey,
  conversationStatus,
  displayedConversationEvents,
  lastConversationPage,
  referenceDestination,
} from "./milo-conversation.ui";
import type { ConversationTurn, ConversationEvent } from "./milo-conversation";
const actor = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  conversationId = "00000000-0000-4000-8000-000000000003";
const project = { ownerId: actor, projectId: "p", name: "One" };
const base = {
  ...project,
  actorId: actor,
  conversationId,
  title: "A",
  turnCount: 0,
  turns: [],
  nextAfter: 0,
  hasMore: false,
};
const { name: _name, ...page } = base;
const turn: ConversationTurn = {
  turnId: conversationId,
  ordinal: 1,
  body: "Task",
  locale: "en",
  state: "running",
  events: [],
  createdAt: "2026-09-13T12:00:00Z",
  updatedAt: "2026-09-13T12:00:00Z",
};
describe("conversation browser boundaries", () => {
  it("separates the actor, owner, project and conversation even for repeated project IDs", () => {
    expect(
      new Set(
        [
          conversationKey(actor, project),
          conversationKey(other, project),
          conversationKey(actor, { ...project, ownerId: other }),
          conversationKey(actor, { ...project, projectId: "q" }),
        ].map((value) => JSON.stringify(value)),
      ).size,
    ).toBe(4);
    const target = { ownerId: actor, projectId: "p", conversationId };
    expect(checkedPage(actor, target, page)).toEqual(page);
    for (const change of [
      { actorId: other },
      { ownerId: other },
      { projectId: "q" },
      { conversationId: other },
    ])
      expect(() => checkedPage(actor, target, { ...page, ...change })).toThrow();
    const directory = { actorId: actor, ownerId: actor, projectId: "p", conversations: [] };
    expect(checkedDirectory(actor, project, directory)).toEqual(directory);
    for (const change of [{ actorId: other }, { ownerId: other }, { projectId: "q" }])
      expect(() => checkedDirectory(actor, project, { ...directory, ...change })).toThrow();
  });
  it("never renders stale started operations as still running after a result, cancellation or unknown outcome", () => {
    const started: ConversationEvent = {
      kind: "tool",
      role: "seo",
      tool: "draft_read",
      state: "running",
      text: "",
      operationId: conversationId,
    };
    const result: ConversationEvent = { ...started, state: "completed", text: "Observed" };
    expect(displayedConversationEvents({ ...turn, events: [started] })).toEqual([started]);
    expect(displayedConversationEvents({ ...turn, events: [started, result] })).toEqual([result]);
    for (const state of ["cancelled", "unknown", "completed", "failed"] as const)
      expect(displayedConversationEvents({ ...turn, state, events: [started, result] })).toEqual([
        result,
      ]);
    expect(conversationStatus({ ...turn, state: "unknown", events: [started] })).toBe(
      "chat.unknown",
    );
    expect(
      conversationStatus({
        ...turn,
        state: "failed",
        events: [{ kind: "status", role: "lead", text: "", code: "budget_unavailable" }],
      }),
    ).toBe("chat.budget_unavailable");
  });
  it("links collaborators only to a scoped team draft and links retained generation to the exact owner project and receipt", () => {
    const event: ConversationEvent = {
      kind: "tool",
      role: "content",
      tool: "draft_generation",
      state: "completed",
      text: "",
      reference: { kind: "generation", id: conversationId },
    };
    expect(referenceDestination(project, actor, event)).toEqual({
      to: "/app/generations",
      search: { receipt: conversationId, project: "p" },
    });
    expect(referenceDestination(project, other, event)).toBeNull();
    const draft: ConversationEvent = { ...event, reference: { kind: "draft", id: "a" } };
    expect(referenceDestination(project, other, draft)).toEqual({
      to: "/app/collaborators",
      search: { owner: actor, project: "p", asset: "a" },
    });
    expect(referenceDestination(project, actor, { ...draft, state: "running" })).toBeNull();
    expect(referenceDestination(project, actor, { ...draft, kind: "assistant" })).toBeNull();
    expect(
      referenceDestination(project, other, { ...event, reference: { kind: "knowledge", id: "p" } }),
    ).toBeNull();
    for (const [kind, to] of [
      ["technical", "/app/audit"],
      ["visibility", "/app/ai-visibility"],
      ["authority", "/app/backlinks"],
    ] as const) {
      const evidence: ConversationEvent = { ...event, reference: { kind, id: "p" } };
      expect(referenceDestination(project, actor, evidence)).toEqual({ to, search: {} });
      expect(referenceDestination(project, other, evidence)).toBeNull();
    }
  });
  it("keeps an unconfirmed proposal operation available for an exact read after execution stops", () => {
    const started: ConversationEvent = {
      kind: "tool",
      role: "seo",
      tool: "draft_metadata_proposal",
      operationId: conversationId,
      state: "running",
      text: "",
    };
    const result: ConversationEvent = {
      ...started,
      state: "approval_required",
      reference: { kind: "draft_proposal", id: conversationId },
    };
    const applied: ConversationEvent = { ...result, state: "completed" };
    for (const state of ["cancelled", "unknown", "failed", "completed"] as const) {
      expect(displayedConversationEvents({ ...turn, state, events: [started] })).toEqual([started]);
      expect(displayedConversationEvents({ ...turn, state, events: [started, result] })).toEqual([
        result,
      ]);
      expect(
        displayedConversationEvents({ ...turn, state, events: [started, result, applied] }),
      ).toEqual([applied]);
    }
    expect(referenceDestination(project, actor, result)).toBeNull();
  });
  it("keeps the latest turn visible at page boundaries and at the final storage limit", () => {
    expect([0, 1, 20, 21, 40, 41, 500].map(lastConversationPage)).toEqual([
      0, 0, 0, 20, 20, 40, 480,
    ]);
  });
});
