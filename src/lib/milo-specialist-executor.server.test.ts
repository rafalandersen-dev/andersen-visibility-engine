import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runConversationSpecialists,
  MILO_EXECUTION_TIMEOUT_MS,
  MILO_CONTENTION_ATTEMPTS,
  type SpecialistExecutorDeps,
} from "./milo-specialist-executor.server";
import { conversationTurn, type ConversationTurn } from "./milo-conversation";
import { specialistMemory, specialistPlan, serializeSpecialistContext } from "./milo-specialist";
import { AiProviderConfigurationError, AiMalformedCredentialError } from "./ai-provider.server";
import { AiExpenseUnavailableError } from "./ai-expense.server";
import { TeamAdmissionBusyError } from "./project-team-admission";
import type { ConversationDiagnosticInput } from "./milo-conversation-diagnostics.server";
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
  const claim = vi.fn(async (_actor: string) => ({
    acquired: true,
    attemptId,
    turn: structuredClone(stored),
  }));
  const read = vi.fn(async (_actor: string) => ({
    ...target,
    actorId: actor,
    title: "SEO",
    turnCount: stored.ordinal,
    turns: [...history, structuredClone(stored)],
    nextAfter: stored.ordinal,
    hasMore: false,
  }));
  const assert = vi.fn(async (_actor: string) => {
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
  const diagnostic = vi.fn(async (_input: ConversationDiagnosticInput) => {});
  const deps = {
    claim,
    read,
    assert,
    advance,
    tool,
    model,
    diagnostic,
  } as unknown as SpecialistExecutorDeps;
  return {
    deps,
    claim,
    read,
    assert,
    advance,
    tool,
    model,
    diagnostic,
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
    // The owning business account pays for every routing and reply request
    // (owner decision 2026-09-14; Milestones 100/101), even though actor !== owner.
    expect(
      h.model.mock.calls.every(
        ([input]) =>
          input.context.userId === ownerId &&
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
    // Authority stays actor-scoped: tools, private-conversation reads and every
    // claim/membership recheck are called with the collaborator, never the owner.
    expect(
      h.tool.mock.calls.every(
        ([, context]) =>
          context.actorId === actor &&
          context.target.ownerId === ownerId &&
          context.target.projectId === "p",
      ),
    ).toBe(true);
    expect(h.claim.mock.calls.every(([a]) => a === actor)).toBe(true);
    expect(h.read.mock.calls.every(([a]) => a === actor)).toBe(true);
    expect(h.assert.mock.calls.every(([a]) => a === actor)).toBe(true);
    expect(h.advance.mock.calls.every(([a]) => a === actor)).toBe(true);
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
  it("treats a manual free-budget refusal as a budget hold without any further tool or model attempt", async () => {
    const h = harness();
    h.model.mockRejectedValue(new AiExpenseUnavailableError("manual_budget_required"));
    const result = await runConversationSpecialists(actor, target, h.deps);
    expect(result.state).toBe("failed");
    const last = result.events.at(-1);
    expect(last?.code).toBe("budget_unavailable");
    expect(last?.state).toBe("unavailable");
    expect(result.events.filter((event) => event.kind === "assistant")).toHaveLength(0);
    // The refusal is a known failure before provider dispatch: no follow-on model
    // call and no tool beyond the single project brief taken before planning.
    expect(h.model).toHaveBeenCalledOnce();
    expect(h.tool.mock.calls.map(([input]) => input.name)).toEqual(["project_brief"]);
  });
  it("treats a malformed saved key as a provider hold, exactly like a missing configuration", async () => {
    const h = harness();
    h.model.mockRejectedValue(new AiMalformedCredentialError());
    const result = await runConversationSpecialists(actor, target, h.deps);
    expect(result.state).toBe("failed");
    const last = result.events.at(-1);
    expect(last?.code).toBe("provider_unavailable");
    expect(last?.state).toBe("unavailable");
    expect(result.events.filter((event) => event.kind === "assistant")).toHaveLength(0);
    // Detected before any reservation or dispatch, so it stops the turn with no
    // fabricated reply and no work beyond the single planning brief.
    expect(h.model).toHaveBeenCalledOnce();
    expect(h.tool.mock.calls.map(([input]) => input.name)).toEqual(["project_brief"]);
  });
  it.each(["entitlement_timeout", "global_cap_invalid"])(
    "treats the pre-dispatch expense setup failure %s as a budget hold that stops later steps",
    async (reason) => {
      const h = harness();
      h.model.mockRejectedValue(new AiExpenseUnavailableError(reason));
      const result = await runConversationSpecialists(actor, target, h.deps);
      expect(result.state).toBe("failed");
      const last = result.events.at(-1);
      expect(last?.code).toBe("budget_unavailable");
      expect(last?.state).toBe("unavailable");
      expect(result.events.filter((event) => event.kind === "assistant")).toHaveLength(0);
      // A setup failure raised before reservation is a confirmed hold: the planning
      // model call fails and no specialist reply or later tool is ever dispatched.
      expect(h.model).toHaveBeenCalledOnce();
      expect(h.tool.mock.calls.map(([input]) => input.name)).toEqual(["project_brief"]);
    },
  );
  it.each(["provider_timeout", "reconciliation_unconfirmed", "reservation_unavailable"])(
    "keeps the uncertain provider or reconciliation failure %s unknown rather than a confirmed hold",
    async (reason) => {
      const h = harness();
      h.model.mockRejectedValue(new AiExpenseUnavailableError(reason));
      const result = await runConversationSpecialists(actor, target, h.deps);
      // The provider may have run or a reservation may still be held: the outcome
      // is unknown, never a clean failure, and no reply is invented.
      expect(result.state).toBe("unknown");
      const last = result.events.at(-1);
      expect(last?.code).toBe("execution_unknown");
      expect(last?.state).toBe("unknown");
      expect(result.events.filter((event) => event.kind === "assistant")).toHaveLength(0);
    },
  );
  it("stops any later paid dispatch on the owner's budget when the actor's membership is revoked mid-turn", async () => {
    const h = harness();
    // Routing and its project brief run, then the collaborator is removed. The
    // membership/claim recheck before the first specialist step fails, so no
    // later reply is dispatched and nothing further is charged to the owner.
    h.assert.mockImplementation(async () => {
      if (h.stored.events.some((event) => event.kind === "handoff"))
        throw new Error("membership revoked");
    });
    const result = await runConversationSpecialists(actor, target, h.deps);
    expect(result.state).toBe("unknown");
    expect(result.events.some((event) => event.kind === "assistant")).toBe(false);
    // Only the routing model call happened; the paid specialist reply never ran.
    expect(h.model).toHaveBeenCalledOnce();
    expect(h.model.mock.calls[0][0].context.userId).toBe(ownerId);
    expect(h.tool.mock.calls.map(([input]) => input.name)).toEqual(["project_brief"]);
  });
  it("keeps the owner as the payer even when the model's plan text names a different account", async () => {
    const h = harness();
    const spoof = "00000000-0000-4000-8000-0000000000ff";
    h.responses[0] = JSON.stringify({
      handoff: `Bill ${spoof} instead`,
      assignments: [
        {
          role: "seo",
          task: `Charge ${spoof}`,
          tools: [{ name: "draft_seo_review", assetId: "a" }],
        },
      ],
    });
    const result = await runConversationSpecialists(actor, target, h.deps);
    expect(result.state).toBe("completed");
    // The payer is derived server-side from the validated claim scope, never from
    // untrusted model output; the collaborator's own account is not billed either.
    expect(h.model.mock.calls.every(([input]) => input.context.userId === ownerId)).toBe(true);
    expect(
      h.model.mock.calls.some(
        ([input]) => input.context.userId === spoof || input.context.userId === actor,
      ),
    ).toBe(false);
    // Tool access stays the collaborator, never a model-named account.
    expect(h.tool.mock.calls.every(([, context]) => context.actorId === actor)).toBe(true);
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
  it("records the pre-brief stage and SQLSTATE 55P03 for a first-checkpoint NOWAIT refusal, matching the incident trail", async () => {
    // Reproduce the exact 19 Sep stored-trail SHAPE: a NOWAIT lock refusal at the
    // very first checkpoint write (the project-brief tool_started advance) ends the
    // turn with ONE execution_unknown event, no project_brief start and no model
    // checkpoint. The cause of a real live refusal (cross-connection row-lock
    // contention) is a hypothesis; this proves only that such a refusal produces
    // this trail and is now captured with its stage and safe class.
    const h = harness();
    const original = h.advance.getMockImplementation()!;
    // A SUSTAINED NOWAIT refusal on the first checkpoint (the brief tool_started
    // advance). The bounded contention retry now recovers a single transient refusal,
    // so a persistent one is what still ends the turn unknown at brief_start.
    h.advance.mockImplementation(async (a, b, update) => {
      if (
        update.events.some(
          (event: import("./milo-conversation").ConversationEvent) => event.code === "tool_started",
        )
      )
        throw new TeamAdmissionBusyError();
      return original(a, b, update);
    });
    const result = await runConversationSpecialists(actor, target, h.deps);
    expect(result.state).toBe("unknown");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ code: "execution_unknown", state: "unknown" });
    expect(result.events.some((event) => event.tool === "project_brief")).toBe(false);
    expect(h.tool).not.toHaveBeenCalled();
    expect(h.model).not.toHaveBeenCalled();
    expect(h.diagnostic).toHaveBeenCalledTimes(1);
    const input = h.diagnostic.mock.calls[0][0] as ConversationDiagnosticInput;
    expect(input.turnId).toBe(turnId);
    expect(typeof input.operationId).toBe("string");
    expect(input.diagnosis).toMatchObject({
      stage: "brief_start",
      errorClass: "unknown",
      nameCategory: "other",
      httpStatus: null,
      sqlState: "55P03",
    });
    expect(input.outcome).toEqual({ state: "unknown", code: "execution_unknown" });
    // In-run (acquired-execution) failures are TERMINAL: they own the turn's receipt
    // and upgrade any earlier preliminary claim receipt for the same turn.
    expect(input.provenance).toBe("terminal");
  });
  it("pinpoints an initial liveness refusal at assert_live with no operation id", async () => {
    const h = harness();
    // Sustained NOWAIT refusal: a single transient one is retried away, so the whole
    // liveness gate must fail to end the turn unknown at assert_live.
    h.assert.mockImplementation(async () => {
      throw new TeamAdmissionBusyError();
    });
    const result = await runConversationSpecialists(actor, target, h.deps);
    expect(result.state).toBe("unknown");
    expect(result.events.some((event) => event.tool === "project_brief")).toBe(false);
    expect(h.read).not.toHaveBeenCalled();
    expect(h.model).not.toHaveBeenCalled();
    const input = h.diagnostic.mock.calls[0][0] as ConversationDiagnosticInput;
    expect(input.diagnosis).toMatchObject({ stage: "assert_live", sqlState: "55P03" });
    expect(input.operationId).toBeUndefined();
  });
  it("pinpoints a continuity read refusal at continuity_read", async () => {
    const h = harness();
    // Sustained NOWAIT refusal on the continuity read (a single transient one is
    // retried away), so the read gives up and the turn ends unknown at continuity_read.
    h.read.mockImplementation(async () => {
      throw new TeamAdmissionBusyError();
    });
    const result = await runConversationSpecialists(actor, target, h.deps);
    expect(result.state).toBe("unknown");
    expect(h.model).not.toHaveBeenCalled();
    const input = h.diagnostic.mock.calls[0][0] as ConversationDiagnosticInput;
    expect(input.diagnosis).toMatchObject({ stage: "continuity_read", sqlState: "55P03" });
    expect(input.operationId).toBeUndefined();
  });
  it("classifies a malformed plan JSON at plan_parse without a SQLSTATE", async () => {
    const h = harness();
    h.responses[0] = "not json at all";
    const result = await runConversationSpecialists(actor, target, h.deps);
    expect(result.state).toBe("unknown");
    const input = h.diagnostic.mock.calls[0][0] as ConversationDiagnosticInput;
    // The routing model returned unparseable output: recorded at plan_parse, safe
    // class from the allowlist, no SQLSTATE. Only the brief tool ran.
    expect(input.diagnosis).toMatchObject({ stage: "plan_parse", sqlState: null });
    expect(h.tool.mock.calls.map(([tool]) => tool.name)).toEqual(["project_brief"]);
  });
  it("never lets a diagnostic recording failure change the honest turn outcome", async () => {
    const h = harness();
    h.diagnostic.mockRejectedValue(new Error("diagnostic sink down"));
    h.model.mockRejectedValueOnce(new AiExpenseUnavailableError("reservation_unavailable"));
    const result = await runConversationSpecialists(actor, target, h.deps);
    // The uncertain provider outcome stays unknown; a throwing diagnostic is
    // swallowed and never surfaces or is retried.
    expect(result.state).toBe("unknown");
    expect(result.events.at(-1)).toMatchObject({ code: "execution_unknown", state: "unknown" });
    expect(h.diagnostic).toHaveBeenCalledTimes(1);
  });
  it("still records the stage when even the outcome write is refused, without suppressing the unconfirmed error", async () => {
    const h = harness();
    h.advance.mockImplementation(async () => {
      throw new TeamAdmissionBusyError();
    });
    await expect(runConversationSpecialists(actor, target, h.deps)).rejects.toThrow(
      "outcome could not be confirmed",
    );
    expect(h.diagnostic).toHaveBeenCalledTimes(1);
    const input = h.diagnostic.mock.calls[0][0] as ConversationDiagnosticInput;
    expect(input.diagnosis).toMatchObject({ stage: "brief_start", sqlState: "55P03" });
  });
  it("fails closed on a hostile thrown value, still writing the unknown outcome and a safe receipt", async () => {
    // A thrown value whose getPrototypeOf trap and getters throw would break a bare
    // `instanceof` in both classifyConversationFailure and failure(). The catch must
    // not itself throw: the honest execution_unknown outcome is still written and a
    // safe diagnosis (unknown class, no SQLSTATE) is recorded at the failure stage.
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("synthetic proto");
        },
        get() {
          throw new Error("hostile getter");
        },
      },
    );
    const h = harness();
    const original = h.advance.getMockImplementation()!;
    let refused = false;
    h.advance.mockImplementation(async (a, b, update) => {
      if (!refused) {
        refused = true;
        throw hostile;
      }
      return original(a, b, update);
    });
    const result = await runConversationSpecialists(actor, target, h.deps);
    expect(result.state).toBe("unknown");
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ code: "execution_unknown", state: "unknown" });
    expect(result.events.some((event) => event.tool === "project_brief")).toBe(false);
    expect(h.tool).not.toHaveBeenCalled();
    expect(h.model).not.toHaveBeenCalled();
    expect(h.diagnostic).toHaveBeenCalledTimes(1);
    const input = h.diagnostic.mock.calls[0][0] as ConversationDiagnosticInput;
    expect(input.turnId).toBe(turnId);
    expect(input.diagnosis).toMatchObject({
      stage: "brief_start",
      errorClass: "unknown",
      sqlState: null,
    });
    expect(input.outcome).toEqual({ state: "unknown", code: "execution_unknown" });
  });

  describe("a claim-time fault records a pre-entry unknown-stage receipt, advances nothing and re-throws", () => {
    // The durable claim runs BEFORE any execution stage, so a thrown claim was the one
    // failure with no diagnostic. It now records a best-effort receipt at the pre-entry
    // `unknown` stage and RE-THROWS the original error unchanged: claim ownership and
    // the turn's authoritative state are UNCONFIRMED, so no outcome is advanced, no
    // model/tool runs, and the claim is never retried.
    const assertInert = (h: ReturnType<typeof harness>) => {
      expect(h.claim).toHaveBeenCalledTimes(1); // never re-claimed
      expect(h.read).not.toHaveBeenCalled();
      expect(h.advance).not.toHaveBeenCalled();
      expect(h.tool).not.toHaveBeenCalled();
      expect(h.model).not.toHaveBeenCalled();
    };
    it("records stage unknown + SQLSTATE 55P03 for a real typed NOWAIT claim refusal, then re-throws", async () => {
      const h = harness();
      h.claim.mockRejectedValue(new TeamAdmissionBusyError());
      await expect(runConversationSpecialists(actor, target, h.deps)).rejects.toBeInstanceOf(
        TeamAdmissionBusyError,
      );
      assertInert(h);
      expect(h.diagnostic).toHaveBeenCalledTimes(1);
      const input = h.diagnostic.mock.calls[0][0] as ConversationDiagnosticInput;
      expect(input.turnId).toBe(turnId);
      expect(input.operationId).toBeUndefined(); // no stage/operation was ever entered
      expect(input.diagnosis).toMatchObject({
        stage: "unknown",
        errorClass: "unknown",
        nameCategory: "other",
        httpStatus: null,
        sqlState: "55P03",
      });
      // The claim's DB outcome is unconfirmed: an unknown correlation-only receipt,
      // never a "failed"/confirmed turn state that was actually written.
      expect(input.outcome).toEqual({ state: "unknown", code: "execution_unknown" });
      // Claim-time faults are PRELIMINARY: the pending turn may be re-dispatched, so a
      // later terminal acquired-execution receipt can replace this provisional one.
      expect(input.provenance).toBe("preliminary");
    });
    it("records stage unknown with no SQLSTATE for a lost-response/transport claim failure", async () => {
      const h = harness();
      h.claim.mockRejectedValue(new Error("socket hang up"));
      await expect(runConversationSpecialists(actor, target, h.deps)).rejects.toThrow(
        "socket hang up",
      );
      assertInert(h);
      const input = h.diagnostic.mock.calls[0][0] as ConversationDiagnosticInput;
      expect(input.diagnosis).toMatchObject({
        stage: "unknown",
        errorClass: "unknown",
        sqlState: null,
      });
      expect(input.operationId).toBeUndefined();
      expect(input.outcome).toEqual({ state: "unknown", code: "execution_unknown" });
    });
    it("fails closed on a hostile thrown claim value, recording a safe receipt and re-throwing that exact value", async () => {
      // A value whose getPrototypeOf trap and getters throw would break a bare
      // `instanceof`. classifyConversationFailure is guarded, so the receipt is still
      // a safe unknown / no-SQLSTATE diagnosis and the diagnostic write never throws;
      // the ORIGINAL hostile value is re-thrown unchanged.
      const hostile = new Proxy(
        {},
        {
          getPrototypeOf() {
            throw new Error("synthetic proto");
          },
          get() {
            throw new Error("hostile getter");
          },
        },
      );
      const h = harness();
      h.claim.mockImplementation(async () => {
        throw hostile;
      });
      let thrown: unknown;
      try {
        await runConversationSpecialists(actor, target, h.deps);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBe(hostile);
      assertInert(h);
      expect(h.diagnostic).toHaveBeenCalledTimes(1);
      const input = h.diagnostic.mock.calls[0][0] as ConversationDiagnosticInput;
      expect(input.turnId).toBe(turnId);
      expect(input.diagnosis).toMatchObject({
        stage: "unknown",
        errorClass: "unknown",
        sqlState: null,
      });
      expect(input.outcome).toEqual({ state: "unknown", code: "execution_unknown" });
    });
    it("never lets a failing claim-time diagnostic mask the original claim error", async () => {
      const h = harness();
      h.claim.mockRejectedValue(new TeamAdmissionBusyError());
      h.diagnostic.mockRejectedValue(new Error("diagnostic sink down"));
      // The re-thrown error is the ORIGINAL claim failure, not the diagnostic's; a
      // failing receipt is swallowed and never retried.
      await expect(runConversationSpecialists(actor, target, h.deps)).rejects.toBeInstanceOf(
        TeamAdmissionBusyError,
      );
      assertInert(h);
      expect(h.diagnostic).toHaveBeenCalledTimes(1);
    });
    it("returns an unacquired existing turn unchanged with no receipt and no re-claim", async () => {
      for (const state of ["running", "completed", "unknown"] as const) {
        const h = harness();
        h.claim.mockResolvedValue({
          acquired: false,
          attemptId: null as unknown as string,
          turn: { ...initial, state },
        });
        const result = await runConversationSpecialists(actor, target, h.deps);
        expect(result.state).toBe(state);
        // A normal unacquired claim is NOT a failure: no diagnostic receipt, no
        // outcome advance, no dispatch, and the claim is not retried.
        expect(h.diagnostic).not.toHaveBeenCalled();
        assertInert(h);
      }
    });
  });

  describe("a nested proposal-model failure correlates to its own reply_model operation, not the outer tool", () => {
    // The gated proposal tools run a nested "responding" model call INSIDE their
    // tool_dispatch via `context.proposal.model`. `ask` mints one id shared by that
    // call's status checkpoint and its model request; the executor tracks it as
    // reply_model with the SAME id, then restores the outer tool_dispatch + tool id
    // only after the nested call succeeds. A single content assignment with a real
    // proposal tool exercises this path.
    const proposalPlan = JSON.stringify({
      handoff: "Redaktor proponuje poprawki metadanych.",
      assignments: [
        {
          role: "content",
          task: "Zaproponuj poprawki metadanych",
          tools: [
            {
              name: "draft_metadata_proposal",
              assetId: "a",
              fields: ["metaTitle"],
              instructions: "Popraw tytuł",
            },
          ],
        },
      ],
    });
    // The outer tool runs the nested proposal model inside its dispatch; the project
    // brief never receives a proposal, so it is answered directly.
    const withProposalTool = (h: ReturnType<typeof harness>) =>
      h.tool.mockImplementation(async (input, context) => {
        await context.beforeDispatch();
        if (input.name === "project_brief")
          return {
            state: "completed" as const,
            evidence: "brief",
            reference: { kind: "draft" as const, id: "a" },
          };
        const reply = await context.proposal.model("PROPOSAL_PROMPT");
        return {
          state: "completed" as const,
          evidence: reply,
          reference: { kind: "draft" as const, id: "a" },
        };
      });
    const outerToolOp = (h: ReturnType<typeof harness>) =>
      h.tool.mock.calls.find(([input]) => input.name === "draft_metadata_proposal")![1].operationId;
    const nestedModelOp = (h: ReturnType<typeof harness>) =>
      h.model.mock.calls.find(([input]) => input.prompt === "PROPOSAL_PROMPT")?.[0].context.attempt
        .requestId as string | undefined;

    it("attributes a nested proposal model throw to reply_model with the nested request id", async () => {
      const h = harness();
      h.responses[0] = proposalPlan;
      withProposalTool(h);
      const respond = h.model.getMockImplementation()!;
      h.model.mockImplementation(async (input) => {
        if (input.prompt === "PROPOSAL_PROMPT") {
          await input.context.beforeDispatch();
          throw new Error("nested provider body");
        }
        return respond(input);
      });
      const result = await runConversationSpecialists(actor, target, h.deps);
      expect(result.state).toBe("unknown");
      expect(result.events.some((event) => event.kind === "assistant")).toBe(false);
      // Only the plan and the nested proposal model ran; the specialist reply did not.
      expect(h.model.mock.calls.map(([input]) => input.prompt === "PROPOSAL_PROMPT")).toEqual([
        false,
        true,
      ]);
      const nestedOp = nestedModelOp(h);
      expect(typeof nestedOp).toBe("string");
      // The nested status checkpoint, the nested model request and the diagnostic all
      // carry the SAME nested id — and it is NOT the outer tool operation.
      const status = result.events.find(
        (event) => event.kind === "status" && event.code === "responding",
      );
      expect(status?.operationId).toBe(nestedOp);
      const input = h.diagnostic.mock.calls[0][0] as ConversationDiagnosticInput;
      expect(input.diagnosis.stage).toBe("reply_model");
      expect(input.operationId).toBe(nestedOp);
      expect(input.operationId).not.toBe(outerToolOp(h));
      // The nested proposal ran inside an acquired execution, so the receipt is TERMINAL.
      expect(input.provenance).toBe("terminal");
      // The raw nested provider error is never logged into the receipt or the turn.
      expect(JSON.stringify(result)).not.toContain("nested provider body");
    });
    it("attributes a nested proposal status-checkpoint throw to reply_model with the nested id and SQLSTATE 55P03", async () => {
      const h = harness();
      h.responses[0] = proposalPlan;
      withProposalTool(h);
      let nestedOp: string | undefined;
      const original = h.advance.getMockImplementation()!;
      h.advance.mockImplementation(async (a, b, update) => {
        const responding = (
          update.events as unknown as Array<{ code?: string; operationId?: string }>
        ).find((event) => event.code === "responding");
        if (responding) {
          // Sustained NOWAIT refusal on the nested proposal status checkpoint (a single
          // transient one is retried away); it gives up at reply_model with the nested id.
          nestedOp ??= responding.operationId;
          throw new TeamAdmissionBusyError();
        }
        return original(a, b, update);
      });
      const result = await runConversationSpecialists(actor, target, h.deps);
      expect(result.state).toBe("unknown");
      // The status checkpoint failed first, so the nested model request never ran.
      expect(h.model.mock.calls.some(([input]) => input.prompt === "PROPOSAL_PROMPT")).toBe(false);
      expect(typeof nestedOp).toBe("string");
      const input = h.diagnostic.mock.calls[0][0] as ConversationDiagnosticInput;
      expect(input.diagnosis).toMatchObject({ stage: "reply_model", sqlState: "55P03" });
      expect(input.operationId).toBe(nestedOp);
      expect(input.operationId).not.toBe(outerToolOp(h));
    });
    it("restores the outer tool operation after a successful nested proposal model, so a later tool failure attributes the outer id", async () => {
      const h = harness();
      h.responses[0] = proposalPlan;
      h.tool.mockImplementation(async (input, context) => {
        await context.beforeDispatch();
        if (input.name === "project_brief")
          return {
            state: "completed" as const,
            evidence: "brief",
            reference: { kind: "draft" as const, id: "a" },
          };
        await context.proposal.model("PROPOSAL_PROMPT"); // succeeds and restores the outer stage/id
        throw new Error("tool failed after the proposal model");
      });
      const result = await runConversationSpecialists(actor, target, h.deps);
      expect(result.state).toBe("unknown");
      // The nested proposal model DID run (so the restore path executed)…
      const nestedOp = nestedModelOp(h);
      expect(typeof nestedOp).toBe("string");
      // …but the post-restore tool failure correlates to the OUTER tool dispatch/id,
      // never the nested reply operation.
      const input = h.diagnostic.mock.calls[0][0] as ConversationDiagnosticInput;
      expect(input.diagnosis.stage).toBe("tool_dispatch");
      expect(input.operationId).toBe(outerToolOp(h));
      expect(input.operationId).not.toBe(nestedOp);
    });
    it("keeps the final successful path unchanged when a tool uses the nested proposal model", async () => {
      const h = harness();
      h.responses[0] = proposalPlan;
      withProposalTool(h);
      const result = await runConversationSpecialists(actor, target, h.deps);
      expect(result.state).toBe("completed");
      // The nested reply became the tool evidence, the specialist reply was saved, and
      // no failure diagnostic was recorded.
      expect(
        result.events.some(
          (event) => event.tool === "draft_metadata_proposal" && event.state === "completed",
        ),
      ).toBe(true);
      expect(
        result.events.some((event) => event.kind === "assistant" && event.role === "content"),
      ).toBe(true);
      expect(h.diagnostic).not.toHaveBeenCalled();
      // Plan, nested proposal and the specialist reply each dispatched exactly once.
      expect(
        h.model.mock.calls.filter(([input]) => input.prompt === "PROPOSAL_PROMPT"),
      ).toHaveLength(1);
      expect(h.model).toHaveBeenCalledTimes(3);
    });
  });

  describe("a bounded retry recovers transient NOWAIT lock contention on the executor's own checkpoints", () => {
    // The 20 Sep release incident: an acquired turn reached handoff_save, the advance
    // hit SQLSTATE 55P03 (a FOR SHARE/UPDATE NOWAIT refusal). The outcome did not persist;
    // contention in its write is a tested hypothesis, not established live evidence. A 55P03 is raised before
    // any row is written (clean rollback), so re-issuing the SAME advance is idempotent
    // and repeats no model/tool work.
    it("retries a transiently contended handoff checkpoint and persists it without repeating model or tool work", async () => {
      const h = harness();
      const original = h.advance.getMockImplementation()!;
      let refusals = 0;
      h.advance.mockImplementation(async (a, b, update) => {
        if (
          update.events.some(
            (event: import("./milo-conversation").ConversationEvent) => event.kind === "handoff",
          ) &&
          refusals < 2
        ) {
          refusals++;
          throw new TeamAdmissionBusyError();
        }
        return original(a, b, update);
      });
      const result = await runConversationSpecialists(actor, target, h.deps);
      expect(result.state).toBe("completed");
      expect(refusals).toBe(2); // refused twice, then retried to a real commit
      expect(result.events.some((event) => event.kind === "handoff")).toBe(true);
      // No terminal failure recorded, and the retry re-dispatched no model/tool work.
      expect(h.diagnostic).not.toHaveBeenCalled();
      expect(h.tool.mock.calls.map(([tool]) => tool.name)).toEqual([
        "project_brief",
        "draft_seo_review",
        "draft_read",
      ]);
      expect(h.model).toHaveBeenCalledTimes(3);
    });
    it("gives up after the bounded contention attempts and ends unknown at the failed stage, without repeating work", async () => {
      const h = harness();
      const original = h.advance.getMockImplementation()!;
      let handoffAttempts = 0;
      h.advance.mockImplementation(async (a, b, update) => {
        if (
          update.events.some(
            (event: import("./milo-conversation").ConversationEvent) => event.kind === "handoff",
          )
        ) {
          handoffAttempts++;
          throw new TeamAdmissionBusyError();
        }
        return original(a, b, update);
      });
      const result = await runConversationSpecialists(actor, target, h.deps);
      expect(result.state).toBe("unknown");
      // Bounded: the handoff advance was attempted exactly MILO_CONTENTION_ATTEMPTS times.
      expect(handoffAttempts).toBe(MILO_CONTENTION_ATTEMPTS);
      // The honest outcome persisted (the outcome write is a separate, uncontended
      // advance) and the receipt records WHERE it stopped.
      expect(result.events.at(-1)).toMatchObject({ code: "execution_unknown", state: "unknown" });
      const input = h.diagnostic.mock.calls[0][0] as ConversationDiagnosticInput;
      expect(input.diagnosis).toMatchObject({ stage: "handoff_save", sqlState: "55P03" });
      expect(input.provenance).toBe("terminal");
      // Only the planning brief + model ran; the assignment tools never dispatched.
      expect(h.tool.mock.calls.map(([tool]) => tool.name)).toEqual(["project_brief"]);
      expect(h.model).toHaveBeenCalledTimes(1);
    });
    it("never retries a non-contention advance failure, so lease and authorization refusals are not masked", async () => {
      const h = harness();
      const original = h.advance.getMockImplementation()!;
      let handoffAttempts = 0;
      h.advance.mockImplementation(async (a, b, update) => {
        if (
          update.events.some(
            (event: import("./milo-conversation").ConversationEvent) => event.kind === "handoff",
          )
        ) {
          handoffAttempts++;
          // A conflict (lost lease / stale expected count / revocation) is NOT a 55P03
          // contention error and must propagate on the first occurrence, never retried.
          throw new Error("milo_conversation_conflict");
        }
        return original(a, b, update);
      });
      const result = await runConversationSpecialists(actor, target, h.deps);
      expect(result.state).toBe("unknown");
      expect(handoffAttempts).toBe(1);
    });
    it("retries a transiently contended outcome write so a failed turn is not left running (the release incident)", async () => {
      const h = harness();
      const original = h.advance.getMockImplementation()!;
      let outcomeRefused = false;
      h.advance.mockImplementation(async (a, b, update) => {
        const events = update.events as import("./milo-conversation").ConversationEvent[];
        // handoff_save fails persistently (the turn will end unknown)…
        if (events.some((event) => event.kind === "handoff")) throw new TeamAdmissionBusyError();
        // …and we inject one contention refusal into the outcome write. This is a
        // recovery scenario; the live diagnostic did not identify that write's error.
        if (events.some((event) => event.code === "execution_unknown") && !outcomeRefused) {
          outcomeRefused = true;
          throw new TeamAdmissionBusyError();
        }
        return original(a, b, update);
      });
      const result = await runConversationSpecialists(actor, target, h.deps);
      // The bounded retry lets the outcome write commit: the turn is NOT stuck running.
      expect(outcomeRefused).toBe(true);
      expect(result.state).toBe("unknown");
      expect(result.events.at(-1)).toMatchObject({ code: "execution_unknown", state: "unknown" });
      // The receipt still records the ORIGINAL handoff_save failure stage.
      const input = h.diagnostic.mock.calls[0][0] as ConversationDiagnosticInput;
      expect(input.diagnosis.stage).toBe("handoff_save");
    });
    it("does not launch another checkpoint RPC when the deadline fires during a contention backoff", async () => {
      // The in-run retry must be abort-aware: if the per-stage deadline fires WHILE a
      // 55P03 backoff is pending, the abandoned ordinary retry must NOT wake and launch
      // another advance (or model/tool). Only the bounded terminal cleanup runs.
      vi.useFakeTimers();
      const h = harness();
      const original = h.advance.getMockImplementation()!;
      let handoffAttempts = 0;
      let unknownWrites = 0;
      h.advance.mockImplementation(async (a, b, update) => {
        const events = update.events as import("./milo-conversation").ConversationEvent[];
        if (events.some((event) => event.kind === "handoff")) {
          handoffAttempts++;
          throw new TeamAdmissionBusyError();
        }
        if (events.some((event) => event.code === "execution_unknown")) unknownWrites++;
        return original(a, b, update);
      });
      // Pause at the plan model so we can advance the clock to just before the deadline
      // BEFORE the handoff advance's 55P03 backoff starts.
      let releaseModel!: (text: string) => void;
      h.model.mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            releaseModel = resolve;
          }),
      );
      const work = runConversationSpecialists(actor, target, h.deps);
      // Progress to the paused plan model, 10 ms before the 250 s deadline.
      await vi.advanceTimersByTimeAsync(MILO_EXECUTION_TIMEOUT_MS - 10);
      expect(h.model).toHaveBeenCalledTimes(1);
      // Release the model → the run reaches handoff_save, whose advance throws 55P03 and
      // schedules a 20 ms backoff (at deadline+10). Advancing 20 ms fires the deadline
      // (at +10) FIRST, which must cancel the abandoned retry.
      releaseModel(JSON.stringify(plan));
      await vi.advanceTimersByTimeAsync(20);
      const result = await work;
      expect(result.state).toBe("unknown");
      expect(handoffAttempts).toBe(1); // the retry never woke to launch a second advance
      expect(unknownWrites).toBe(1); // exactly the bounded terminal cleanup persisted
      expect(h.model).toHaveBeenCalledTimes(1); // no repeated model
      expect(h.tool.mock.calls.map(([tool]) => tool.name)).toEqual(["project_brief"]); // no repeated tool
      expect(h.stored.events.some((event) => event.kind === "assistant")).toBe(false);
      vi.useRealTimers();
    });
  });
});
