import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runConversationSpecialists,
  MILO_EXECUTION_TIMEOUT_MS,
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
    let refused = false;
    h.advance.mockImplementation(async (a, b, update) => {
      if (!refused) {
        refused = true;
        throw new TeamAdmissionBusyError();
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
    expect(typeof input.operationId).toBe("string");
    expect(input.diagnosis).toMatchObject({
      stage: "brief_start",
      errorClass: "unknown",
      nameCategory: "other",
      httpStatus: null,
      sqlState: "55P03",
    });
    expect(input.outcome).toEqual({ state: "unknown", code: "execution_unknown" });
  });
  it("pinpoints an initial liveness refusal at assert_live with no operation id", async () => {
    const h = harness();
    h.assert.mockImplementationOnce(async () => {
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
    h.read.mockImplementationOnce(async () => {
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
});
