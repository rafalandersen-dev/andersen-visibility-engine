/**
 * AI Evaluation entitlement (B1/B7): Pro/Agency (and a verified platform owner) may run evaluation calls;
 * Free/Starter/Growth may not. Exercised through the REAL comparison orchestrator, the REAL server-function
 * validators/handlers, the authoritative plan/owner resolvers, the usage claim, the monetary admission and the
 * model adapter. Only the auth context, the Supabase table/RPC responses and the provider transport are
 * synthetic; no network.
 *
 * The first test is the independent baseline reproduction (non-owner Growth, default model, candidate not
 * configured) with its wiring unchanged and the corrected expectation: refused before any quota, money or
 * provider side effect.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  plan: "pro",
  owner: false,
  entitlementError: false,
  roleError: false,
  entitlementStall: false,
  reserve: null as null | { allowed: boolean; reason: string },
  content: "",
  rpc: vi.fn(),
  fetch: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: Symbol("authenticated-session"),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerOnlyFn: (fn: unknown) => fn,
  createServerFn: () => {
    let validate = (v: unknown) => v;
    const b = {
      middleware: () => b,
      inputValidator: (fn: typeof validate) => {
        validate = fn;
        return b;
      },
      handler: (fn: (a: unknown) => unknown) => (a: { data: unknown; context: unknown }) =>
        fn({ ...a, data: validate(a.data) }),
    };
    return b;
  },
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: h.rpc, from: h.from },
}));

import {
  evaluateContentQualityFn,
  generateAuthorityOpportunitiesFn,
  generateContentFn,
  getAiRouterStatusFn,
  improveContentDraftFn,
} from "./ai.functions";
import {
  runModelComparison,
  type EvaluationDeps,
  type FrozenEvaluationInput,
} from "./ai-evaluation";
import { DEFAULT_MODEL_ID } from "./ai-router";
import { PLAN_LIMITS } from "./billing";
import { AI_USAGE_LOOKUP_TIMEOUT_MS } from "./ai-usage.server";
import type { AiEvaluationRun } from "./types";

const userId = "00000000-0000-4000-8000-000000000011";
const GATE =
  "AI Evaluation is included in the Pro and Agency plans. Upgrade to run new comparisons — your saved evaluation history stays available.";
const UNAVAILABLE =
  "Milo cannot confirm AI Evaluation access right now. New comparisons are paused; please try again later. Your saved evaluation history stays available.";
const UNPRICED =
  "This AI model has no verified cost limit yet. Generation is paused; your existing content remains available.";
const BUDGET =
  "AI work is paused because its cost budget could not be confirmed. Your existing content remains available.";
const QUALITY = JSON.stringify({
  categories: { structure: { score: 70, explanation: "Synthetic" } },
});
const call = (fn: unknown, data: Record<string, unknown>) =>
  (fn as (a: unknown) => Promise<unknown>)({ data, context: { userId } });
const rpcNames = () => h.rpc.mock.calls.map((c) => c[0]);

const project = {
  id: "p",
  name: "Synthetic",
  businessName: "Synthetic",
  websiteUrl: "https://example.test",
};
const asset = {
  title: "T",
  markdown: Array(60).fill("word").join(" "),
  assetType: "article",
  destinationType: "",
  metaTitle: "",
  metaDescription: "",
  quickWins: [],
};
const opportunity = {
  id: "o",
  projectId: "p",
  title: "Topic",
  language: "English",
  contentType: "Blog Article",
  searchIntent: "Informational",
  targetAudience: "Owners",
  businessValue: "Evaluation",
  recommendedCta: "Contact us",
  priority: "Medium",
  status: "captured",
};
const frozen = (over: Partial<FrozenEvaluationInput> = {}) =>
  ({
    task: "contentQualityScore",
    project,
    services: [],
    asset,
    livePages: [],
    contentLanguage: "English",
    explanationLanguage: "English",
    existingModel: DEFAULT_MODEL_ID,
    candidateModel: null,
    candidateConfigured: false,
    ...over,
  }) as FrozenEvaluationInput;
let runs: AiEvaluationRun[];
// The route's own wiring: each side calls the real server function with the orchestrator's payload.
const deps = (): EvaluationDeps => ({
  generateContent: (data) => call(generateContentFn, data) as never,
  improveDraft: (data) => call(improveContentDraftFn, data) as never,
  evaluateQuality: (data) => call(evaluateContentQualityFn, data) as never,
  generateAuthority: (data) => call(generateAuthorityOpportunitiesFn, data) as never,
  addRun: (r) => runs.push(r),
  uid: () => "synthetic-run",
  now: () => Date.now(),
  needAssetMessage: "Select asset",
});

beforeEach(() => {
  h.plan = "pro";
  h.owner = false;
  h.entitlementError = false;
  h.roleError = false;
  h.entitlementStall = false;
  h.reserve = null;
  h.content = QUALITY;
  runs = [];
  vi.stubEnv("OPENAI_API_KEY", "synthetic-test-key");
  vi.stubEnv("AI_METERING_ENFORCED", "true");
  vi.stubGlobal("fetch", h.fetch);
  h.fetch.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          id: "synthetic-eval",
          object: "chat.completion",
          created: 0,
          model: DEFAULT_MODEL_ID,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: h.content },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        { headers: { "content-type": "application/json" } },
      ),
  );
  h.from.mockImplementation((table: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () =>
        table === "entitlements"
          ? h.entitlementStall
            ? new Promise(() => undefined)
            : h.entitlementError
              ? { data: null, error: { message: "synthetic read failure" } }
              : {
                  data: {
                    plan_id: h.plan,
                    status: "active",
                    current_period_end: new Date(Date.now() + 86400000).toISOString(),
                  },
                  error: null,
                }
          : table === "user_roles"
            ? h.roleError
              ? { data: null, error: { message: "synthetic read failure" } }
              : { data: h.owner ? { role: "owner" } : null, error: null }
            : { data: null, error: null },
    };
    return q;
  });
  h.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => ({
    error: null,
    data:
      name === "claim_ai_usage"
        ? [{ allowed: true, used: 1, cap: args.p_cap }]
        : name === "claim_generation_usage"
          ? // At the plan cap: the ordinary content path reaches its own existing quota.
            [
              {
                allowed: false,
                used: args.p_cap,
                cap: args.p_cap,
                receipt_id: args.p_id,
                claim_status: "denied",
              },
            ]
          : name === "reserve_ai_expense"
            ? [{ ...(h.reserve ?? { allowed: true, reason: "reserved" }), period: "2026-11" }]
            : [{ state: "unknown", overrun: false }],
  }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("baseline reproduction: a verified non-owner Growth default-model evaluation is refused before quota, money or provider", async () => {
  h.plan = "growth";
  const result = await runModelComparison(frozen(), deps());
  expect(PLAN_LIMITS.growth.aiEvaluationEnabled).toBe(false);
  expect(result.kind).toBe("recorded");
  expect(result.existing).toMatchObject({ status: "error", error: GATE });
  expect(result.candidate.status).toBe("notConfigured");
  expect(h.rpc).not.toHaveBeenCalled();
  expect(h.fetch).not.toHaveBeenCalled();
  // The refusal is an ordinary error side, like any other refused attempt; no model output is kept.
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({ existingStatus: "error", existingError: GATE });
  expect(runs[0].existingOutputPreview).toBeUndefined();
});

describe("non-owner Free/Starter/Growth: every evaluation entry is refused before quota, money or provider", () => {
  const entries = [
    ["Milo Score", evaluateContentQualityFn, { project, services: [], ...asset }],
    ["Improve", improveContentDraftFn, { project, services: [], ...asset }],
    ["authority", generateAuthorityOpportunitiesFn, { project, services: [] }],
    ["content", generateContentFn, { project, services: [], opportunity, assetType: "article" }],
  ] as const;
  for (const plan of ["freePreview", "starter", "growth"] as const)
    for (const [name, fn, data] of entries)
      for (const [mode, extra] of [
        ["default-model evaluation", { evaluation: true }],
        ["model override", { modelOverride: "candidate-model" }],
        ["default model id as override", { modelOverride: DEFAULT_MODEL_ID }],
      ] as const)
        it(`${plan} ${name}: ${mode}`, async () => {
          h.plan = plan;
          await expect(call(fn, { ...data, ...extra })).rejects.toThrow(GATE);
          expect(h.rpc).not.toHaveBeenCalled();
          expect(h.fetch).not.toHaveBeenCalled();
        });

  it("every task of the real orchestrator is refused on both sides for Growth", async () => {
    h.plan = "growth";
    for (const task of [
      "contentGeneration",
      "contentImprove",
      "contentQualityScore",
      "authorityGeneration",
    ] as const) {
      const result = await runModelComparison(
        frozen({
          task,
          opportunity: opportunity as never,
          candidateModel: "candidate-model",
          candidateConfigured: true,
        }),
        deps(),
      );
      expect(result.existing, task).toMatchObject({ status: "error", error: GATE });
      expect(result.candidate, task).toMatchObject({ status: "error", error: GATE });
    }
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
  });
});

describe("Pro/Agency and a verified owner reach the existing quota, budget and configuration holds", () => {
  for (const [label, plan, owner] of [
    ["Pro", "pro", false],
    ["Agency", "agency", false],
    ["verified owner on Growth", "growth", true],
  ] as const)
    it(`${label}: the default side runs through quota and money; a non-default candidate keeps the unpriced hold`, async () => {
      h.plan = plan;
      h.owner = owner;
      const result = await runModelComparison(
        frozen({ candidateModel: "candidate-model", candidateConfigured: true }),
        deps(),
      );
      expect(result.existing.status).toBe("success");
      expect(result.candidate).toMatchObject({ status: "error", error: UNPRICED });
      // Existing: claim + reservation + reconciliation. Candidate: claim, then the unpriced refusal.
      expect(rpcNames()).toEqual([
        "claim_ai_usage",
        "reserve_ai_expense",
        "reconcile_ai_expense",
        "claim_ai_usage",
      ]);
      expect(h.fetch).toHaveBeenCalledOnce();
      expect(runs).toHaveLength(1);
    });

  it("the owner bypass never bypasses the monetary budget", async () => {
    h.plan = "growth";
    h.owner = true;
    h.reserve = { allowed: false, reason: "budget_exhausted" };
    const result = await runModelComparison(frozen(), deps());
    expect(result.existing).toMatchObject({ status: "error", error: BUDGET });
    expect(rpcNames()).toEqual(["claim_ai_usage", "reserve_ai_expense"]);
    expect(h.fetch).not.toHaveBeenCalled();
  });
});

describe("access is allowed by EITHER positive authority, restricted only on complete negative evidence, else unavailable", () => {
  const access = async () =>
    ((await call(getAiRouterStatusFn, {})) as { evaluationAccess: string }).evaluationAccess;
  for (const [label, setup] of [
    ["entitlement read fails for a verified non-owner", () => (h.entitlementError = true)],
    [
      "role read fails on Growth",
      () => {
        h.plan = "growth";
        h.roleError = true;
      },
    ],
    [
      "both reads fail",
      () => {
        h.entitlementError = true;
        h.roleError = true;
      },
    ],
  ] as const)
    it(`${label}: unavailable, never a plan claim, refused before quota, money or provider`, async () => {
      setup();
      const result = await runModelComparison(frozen(), deps());
      expect(result.existing).toMatchObject({ status: "error", error: UNAVAILABLE });
      expect(h.rpc).not.toHaveBeenCalled();
      expect(h.fetch).not.toHaveBeenCalled();
      expect(await access()).toBe("unavailable");
    });

  it("an unrecognised plan id is a known Free plan: restricted", async () => {
    h.plan = "enterprise";
    const result = await runModelComparison(frozen(), deps());
    expect(result.existing).toMatchObject({ status: "error", error: GATE });
    expect(h.rpc).not.toHaveBeenCalled();
    expect(await access()).toBe("restricted");
  });

  for (const [label, setup] of [
    [
      "known Pro with the role read unavailable",
      () => {
        h.plan = "pro";
        h.roleError = true;
      },
    ],
    [
      "verified owner with the entitlement read unavailable",
      () => {
        h.owner = true;
        h.entitlementError = true;
      },
    ],
  ] as const)
    it(`${label}: allowed, and the run still goes through quota and money`, async () => {
      setup();
      expect(await access()).toBe("allowed");
      const result = await runModelComparison(frozen(), deps());
      expect(result.existing.status).toBe("success");
      expect(rpcNames()).toEqual(["claim_ai_usage", "reserve_ai_expense", "reconcile_ai_expense"]);
      expect(h.fetch).toHaveBeenCalledOnce();
    });

  it("a stalled entitlement read does not hide a verified owner, and a stalled read alone is unavailable", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      h.entitlementStall = true;
      h.owner = true;
      const owner = access();
      await vi.advanceTimersByTimeAsync(AI_USAGE_LOOKUP_TIMEOUT_MS);
      expect(await owner).toBe("allowed");
      h.owner = false;
      const nonOwner = access();
      await vi.advanceTimersByTimeAsync(AI_USAGE_LOOKUP_TIMEOUT_MS);
      expect(await nonOwner).toBe("unavailable");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Pro to Growth: the server reads the current plan for every side and every run", () => {
  it("a downgrade after the existing side stops the candidate side before its quota claim", async () => {
    h.plan = "pro";
    const respond = h.fetch.getMockImplementation()!;
    h.fetch.mockImplementationOnce(async (...args: unknown[]) => {
      h.plan = "growth"; // the plan changes while the first side is in flight
      return respond(...(args as []));
    });
    const result = await runModelComparison(
      frozen({ candidateModel: DEFAULT_MODEL_ID, candidateConfigured: true }),
      deps(),
    );
    expect(result.existing.status).toBe("success");
    expect(result.candidate).toMatchObject({ status: "error", error: GATE });
    expect(rpcNames()).toEqual(["claim_ai_usage", "reserve_ai_expense", "reconcile_ai_expense"]);
    expect(h.fetch).toHaveBeenCalledOnce();
  });

  it("the router status follows the current read, and the next run is refused", async () => {
    h.plan = "pro";
    const before = (await call(getAiRouterStatusFn, {})) as {
      evaluationAccess: string;
      defaultModel: { model: string };
    };
    expect(before.evaluationAccess).toBe("allowed");
    expect(before.defaultModel.model).toBe(DEFAULT_MODEL_ID);
    h.plan = "growth";
    expect(
      ((await call(getAiRouterStatusFn, {})) as { evaluationAccess: string }).evaluationAccess,
    ).toBe("restricted");
    const next = await runModelComparison(frozen(), deps());
    expect(next.existing).toMatchObject({ status: "error", error: GATE });
    expect(h.rpc).not.toHaveBeenCalled();
    h.owner = true;
    expect(
      ((await call(getAiRouterStatusFn, {})) as { evaluationAccess: string }).evaluationAccess,
    ).toBe("allowed");
  });
});

describe("ordinary Growth Milo Score, Improve, content and authority keep their own quota paths", () => {
  beforeEach(() => {
    h.plan = "growth";
  });
  it("Milo Score runs under the miloScore quota", async () => {
    const result = (await call(evaluateContentQualityFn, { project, services: [], ...asset })) as {
      outcome: string;
    };
    expect(result.outcome).toBe("model");
    expect(h.rpc.mock.calls[0][1]).toMatchObject({
      p_bucket: "miloScore",
      p_cap: PLAN_LIMITS.growth.monthlyMiloScores,
    });
    expect(rpcNames()).toEqual(["claim_ai_usage", "reserve_ai_expense", "reconcile_ai_expense"]);
    expect(h.fetch).toHaveBeenCalledOnce();
  });
  it("Improve runs under the improveDraft quota", async () => {
    h.content = JSON.stringify({ markdown: "Improved body" });
    await expect(call(improveContentDraftFn, { project, services: [], ...asset })).resolves.toEqual(
      { markdown: "Improved body" },
    );
    expect(h.rpc.mock.calls[0][1]).toMatchObject({
      p_bucket: "improveDraft",
      p_cap: PLAN_LIMITS.growth.monthlyImproveDrafts,
    });
    expect(h.fetch).toHaveBeenCalledOnce();
  });
  it("authority runs under the authority quota", async () => {
    h.content = JSON.stringify({ opportunities: [{ type: "localDirectory", title: "Listing" }] });
    const result = (await call(generateAuthorityOpportunitiesFn, { project, services: [] })) as {
      opportunities: { title: string }[];
    };
    expect(result.opportunities.map((o) => o.title)).toEqual(["Listing"]);
    expect(h.rpc.mock.calls[0][1]).toMatchObject({
      p_bucket: "authority",
      p_cap: PLAN_LIMITS.growth.monthlyAuthorityGenerations,
    });
    expect(h.fetch).toHaveBeenCalledOnce();
  });
  it("content generation reaches its own contentGeneration quota (here at the cap), not the evaluation gate", async () => {
    await expect(
      call(generateContentFn, { project, services: [], opportunity, assetType: "article" }),
    ).rejects.toThrow(/content generations on your plan this month/);
    expect(rpcNames()).toEqual(["claim_generation_usage"]);
    expect(h.rpc.mock.calls[0][1]).toMatchObject({
      p_bucket: "contentGeneration",
      p_cap: PLAN_LIMITS.growth.monthlyContentGenerations,
    });
    expect(h.fetch).not.toHaveBeenCalled();
  });
});
