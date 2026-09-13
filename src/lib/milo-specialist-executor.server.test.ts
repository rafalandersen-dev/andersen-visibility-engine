import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runConversationSpecialists,
  MILO_EXECUTION_TIMEOUT_MS,
  type SpecialistExecutorDeps,
} from "./milo-specialist-executor.server";
import { conversationTurn, type ConversationTurn } from "./milo-conversation";
import { specialistMemory, specialistPlan, serializeSpecialistContext } from "./milo-specialist";
import { AiProviderConfigurationError } from "./ai-provider.server";
const actor = "00000000-0000-4000-8000-000000000001",
  ownerId = "00000000-0000-4000-8000-000000000002",
  conversationId = "00000000-0000-4000-8000-000000000003",
  turnId = "00000000-0000-4000-8000-000000000004",
  attemptId = "00000000-0000-4000-8000-000000000005";
const target = { ownerId, projectId: "p", conversationId, turnId };
const initial: ConversationTurn = {
  turnId,
  ordinal: 1,
  body: "Sprawdź SEO artykułu a, potem zaproponuj poprawki.",
  locale: "pl",
  state: "running",
  events: [],
  createdAt: "2026-09-13T12:00:00Z",
  updatedAt: "2026-09-13T12:00:00Z",
};
const plan = {
  handoff: "SEO przejmuje analizę, a redaktor opracuje zmiany.",
  assignments: [
    {
      role: "seo",
      task: "Sprawdź zapisany artykuł",
      tools: [{ name: "draft_seo_review", assetId: "a" }],
    },
    {
      role: "content",
      task: "Zaproponuj konkretne poprawki",
      tools: [{ name: "draft_read", assetId: "a" }],
    },
  ],
};
function harness() {
  let stored = structuredClone(initial);
  const history: ConversationTurn[] = [];
  const claim = vi.fn(async () => ({ acquired: true, attemptId, turn: structuredClone(stored) }));
  const read = vi.fn(async () => ({
    ...target,
    actorId: actor,
    title: "SEO",
    turnCount: stored.ordinal,
    turns: [...history, structuredClone(stored)],
    nextAfter: stored.ordinal,
    hasMore: false,
  }));
  const assert = vi.fn(async () => {
    if (stored.state !== "running") throw new Error("revoked or cancelled");
  });
  const advance = vi.fn(async (_actor, _target, update) => {
    if (stored.state !== "running" || update.expected !== stored.events.length)
      throw new Error("conflict");
    stored = conversationTurn.parse({
      ...stored,
      events: [...stored.events, ...update.events],
      state: update.state,
    });
    return structuredClone(stored);
  });
  const tool = vi.fn(async (input, context) => {
    await context.beforeDispatch();
    return {
      state: "completed" as const,
      evidence: JSON.stringify({ observed: input.name, projectId: context.target.projectId }),
      reference: { kind: "draft" as const, id: "a" },
    };
  });
  const responses = [
    JSON.stringify(plan),
    "Zapisany artykuł ma dwie sekcje. To przegląd tekstu, bez nowego crawla.",
    "Na podstawie przeglądu SEO proponuję poprawić nagłówki. Zmiany nie zostały zapisane.",
  ];
  const model = vi.fn(async (input) => {
    await input.context.beforeDispatch();
    return responses.shift()!;
  });
  const deps = { claim, read, assert, advance, tool, model } as unknown as SpecialistExecutorDeps;
  return {
    deps,
    claim,
    read,
    assert,
    advance,
    tool,
    model,
    responses,
    history,
    get stored() {
      return stored;
    },
    set stored(value) {
      stored = value;
    },
  };
}
afterEach(() => vi.useRealTimers());
describe("real bounded specialist conversation execution", () => {
  it("retains a real tool-backed handoff in one conversation and carries the first specialist reply to the second", async () => {
    const h = harness();
    const result = await runConversationSpecialists(actor, target, h.deps);
    expect(result.state).toBe("completed");
    expect(h.tool.mock.calls.map(([input]) => input.name)).toEqual([
      "project_brief",
      "draft_seo_review",
      "draft_read",
    ]);
    expect(
      result.events.filter((event) => event.kind === "assistant").map((event) => event.role),
    ).toEqual(["seo", "content"]);
    expect(h.model.mock.calls[2][0].prompt).toContain("Zapisany artykuł ma dwie sekcje");
    expect(
      h.model.mock.calls.every(
        ([input]) =>
          input.context.userId === actor &&
          input.context.attempt.jobId === turnId &&
          input.prompt.includes('"locale":"pl"'),
      ),
    ).toBe(true);
    const operations = h.model.mock.calls.map(([input]) => input.context.attempt.requestId);
    expect(new Set(operations).size).toBe(3);
    for (const id of operations)
      expect(
        result.events.some((event) => event.operationId === id && event.kind === "status"),
      ).toBe(true);
    expect(
      h.tool.mock.calls.every(
        ([, context]) =>
          context.actorId === actor &&
          context.target.ownerId === ownerId &&
          context.target.projectId === "p",
      ),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain(attemptId);
  });
  it("does not re-enter tools/models when the saved claim is already running, completed or unknown", async () => {
    for (const state of ["running", "completed", "unknown"] as const) {
      const h = harness();
      h.claim.mockResolvedValue({
        acquired: false,
        attemptId: null as unknown as string,
        turn: { ...initial, state },
      });
      expect((await runConversationSpecialists(actor, target, h.deps)).state).toBe(state);
      expect(h.read).not.toHaveBeenCalled();
      expect(h.model).not.toHaveBeenCalled();
      expect(h.tool).not.toHaveBeenCalled();
    }
  });
  it("rejects arbitrary model tools/arguments and repeated paid work before dispatch", async () => {
    for (const tools of [
      [{ name: "publish", url: "https://outside.example" }],
      [{ name: "draft_read", assetId: "a", ownerId: actor }],
      [
        { name: "draft_generation", opportunityId: "a", assetType: "article" },
        { name: "draft_generation", opportunityId: "b", assetType: "article" },
      ],
      [
        {
          name: "draft_metadata_proposal",
          assetId: "a",
          fields: ["metaTitle"],
          instructions: "Improve title",
        },
        {
          name: "draft_metadata_proposal",
          assetId: "b",
          fields: ["metaTitle"],
          instructions: "Improve title",
        },
      ],
      [
        {
          name: "draft_metadata_proposal",
          assetId: "a",
          fields: ["markdown"],
          instructions: "Write body",
        },
      ],
      [
        {
          name: "draft_metadata_proposal",
          assetId: "a",
          fields: ["metaTitle", "metaTitle"],
          instructions: "Duplicate fields",
        },
      ],
    ]) {
      const h = harness();
      h.responses[0] = JSON.stringify({
        handoff: "Next",
        assignments: [{ role: "content", task: "Work", tools }],
      });
      expect((await runConversationSpecialists(actor, target, h.deps)).state).toBe("unknown");
      expect(h.tool).toHaveBeenCalledOnce();
      expect(h.model).toHaveBeenCalledOnce();
    }
  });
  it("does not dispatch a model when its start checkpoint cannot be retained", async () => {
    const h = harness(),
      original = h.advance.getMockImplementation()!;
    h.advance.mockImplementation(async (a, b, update) => {
      if (
        update.events.some(
          (event: import("./milo-conversation").ConversationEvent) => event.code === "analysing",
        )
      )
        throw new Error("storage unknown");
      return original(a, b, update);
    });
    expect((await runConversationSpecialists(actor, target, h.deps)).state).toBe("unknown");
    expect(h.model).not.toHaveBeenCalled();
  });
  it("rechecks cancellation immediately before provider dispatch after asynchronous admission", async () => {
    const h = harness();
    h.model.mockImplementation(async (input) => {
      h.stored = { ...h.stored, state: "cancelled" };
      await input.context.beforeDispatch();
      throw new Error("must not reach provider");
    });
    await expect(runConversationSpecialists(actor, target, h.deps)).rejects.toThrow(
      "outcome could not be confirmed",
    );
    expect(h.stored.state).toBe("cancelled");
    expect(h.model).toHaveBeenCalledOnce();
    expect(h.tool).toHaveBeenCalledOnce();
    expect(h.stored.events.some((event) => event.kind === "assistant")).toBe(false);
  });
  it("retains earlier tool receipts when a later model fails and never logs its raw error", async () => {
    const h = harness(),
      original = h.model.getMockImplementation()!;
    h.model.mockImplementation(async (input) => {
      if (input.context.operation === "miloSpecialistReply")
        throw new Error("fixture-private provider body");
      return original(input);
    });
    const result = await runConversationSpecialists(actor, target, h.deps);
    expect(result.state).toBe("unknown");
    expect(
      result.events.some(
        (event) => event.tool === "draft_seo_review" && event.state === "completed",
      ),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain("fixture-private");
    expect(h.tool.mock.calls.map(([input]) => input.name)).toEqual([
      "project_brief",
      "draft_seo_review",
    ]);
  });
  it("shows a configuration hold without making up a specialist response", async () => {
    const h = harness();
    h.model.mockRejectedValue(new AiProviderConfigurationError());
    const result = await runConversationSpecialists(actor, target, h.deps);
    expect(result.state).toBe("failed");
    expect(result.events.at(-1)?.code).toBe("provider_unavailable");
    expect(result.events.filter((event) => event.kind === "assistant")).toHaveLength(0);
  });
  it("bounds elapsed time and ignores a late model result without continuing tools", async () => {
    vi.useFakeTimers();
    const h = harness();
    let finish!: (value: string) => void;
    h.model.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const work = runConversationSpecialists(actor, target, h.deps);
    await vi.advanceTimersByTimeAsync(MILO_EXECUTION_TIMEOUT_MS + 1);
    expect((await work).state).toBe("unknown");
    finish(JSON.stringify(plan));
    await vi.advanceTimersByTimeAsync(1);
    expect(h.model).toHaveBeenCalledOnce();
    expect(h.tool).toHaveBeenCalledOnce();
    expect(h.stored.events.some((event) => event.kind === "assistant")).toBe(false);
    expect(h.model.mock.calls[0][0].context.signal.aborted).toBe(true);
  });
  it("rejects an oversized UTF-8 answer rather than silently truncating a completed response", async () => {
    const h = harness();
    h.responses[1] = "ą".repeat(6001);
    const result = await runConversationSpecialists(actor, target, h.deps);
    expect(result.state).toBe("unknown");
    expect(result.events.some((event) => event.kind === "assistant")).toBe(false);
  });
  it("preserves prior result references and explicitly bounds long memory", () => {
    const turns = Array.from({ length: 30 }, (_, i) => ({
      ...initial,
      ordinal: i + 1,
      body: `Earlier task ${i}: ${"ą".repeat(2000)}`,
      events: [
        { kind: "assistant" as const, role: "content" as const, text: "Draft saved." },
        {
          kind: "tool" as const,
          role: "content" as const,
          text: "Saved",
          tool: "draft_generation" as const,
          state: "completed" as const,
          reference: { kind: "generation" as const, id: turnId },
        },
      ],
    }));
    const memory = specialistMemory(turns, 31);
    expect(memory.shortened).toBe(true);
    expect(memory.omittedTurns).toBe(30 - memory.history.length);
    expect(memory.history.at(-1)?.receipts[0].reference).toEqual({
      kind: "generation",
      id: turnId,
    });
    expect(new TextEncoder().encode(JSON.stringify(memory.history)).byteLength).toBeLessThanOrEqual(
      12000,
    );
  });
  it("keeps the exact current task within prompt limits despite nested quoted evidence", () => {
    const userTask = '\\"'.repeat(4000);
    const encoded = serializeSpecialistContext({
      userTask,
      projectEvidence: { evidence: '\\"'.repeat(12000) },
      observations: Array(4).fill({ evidence: '\\"'.repeat(12000) }),
    });
    expect(JSON.parse(encoded).userTask).toBe(userTask);
    expect(JSON.parse(encoded).contextShortened).toBe(true);
    expect(new TextEncoder().encode(encoded).byteLength).toBeLessThanOrEqual(56000);
  });
  it("keeps every receipt from a maximum-sized current plan and labels wider historical evidence as partial", () => {
    const receipt = {
      kind: "tool" as const,
      role: "content" as const,
      text: "Saved",
      tool: "draft_generation" as const,
      state: "completed" as const,
    };
    const events = Array.from({ length: 5 }, (_, index) => ({
      ...receipt,
      reference: { kind: "generation" as const, id: `result-${index}` },
    }));
    const complete = specialistMemory([{ ...initial, ordinal: 1, events }], 2);
    expect(complete.shortened).toBe(false);
    expect(complete.history[0].receipts.map((item) => item.reference)).toEqual(
      events.map((event) => event.reference),
    );
    const partial = specialistMemory([{ ...initial, ordinal: 1, events: [...events, receipt] }], 2);
    expect(partial.shortened).toBe(true);
  });
  it("rejects invalid dates, duplicate specialists and unknown handoff properties", () => {
    expect(() =>
      specialistPlan.parse({ ...plan, assignments: [plan.assignments[0], plan.assignments[0]] }),
    ).toThrow();
    expect(() => specialistPlan.parse({ ...plan, authority: "publish" })).toThrow();
    expect(() =>
      specialistPlan.parse({
        ...plan,
        assignments: [
          {
            role: "lead",
            task: "Read",
            tools: [{ name: "weekly_preparation", weekStart: "2026-02-31" }],
          },
        ],
      }),
    ).toThrow();
  });
});
