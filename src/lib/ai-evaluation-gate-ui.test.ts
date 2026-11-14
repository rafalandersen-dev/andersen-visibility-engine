/**
 * AI Evaluation route controls mirror the server access result in all four active languages:
 * - checking (first status read in flight): a loading status, Run disabled, no plan claim;
 * - unavailable (failed status request, unconfirmed access or an unexpected value): the localized explanation
 *   and a status-only Retry, Run disabled, no Upgrade and no plan claim;
 * - restricted (known lower plan, verified non-owner): the plan explanation and Upgrade;
 * - allowed: no notice, Run follows its usual input checks.
 * Saved evaluation history and imported workflow comparisons stay on the page in every state, and Retry
 * re-reads the status only: no comparison, model task or history run. A side refused mid-run shows the
 * server's authored sentence through the real ResultCard mapper in the active language.
 *
 * Static render of the REAL page component. No DOM renderer is installed, so a minimal hook shim keeps the
 * page's first two states (router status, task) and its effects observable: setters update the next render,
 * effects run when the test mounts the page, and Button records its click handler by label.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translate } from "@/i18n/translate";
import type { AiEvaluationRun } from "@/lib/types";

type Lang = "en" | "pl" | "sv" | "da";
const h = vi.hoisted(() => ({
  lang: "en" as "en" | "pl" | "sv" | "da",
  seeds: [] as unknown[],
  effects: [] as (() => void)[],
  clicks: new Map<string, () => void>(),
  state: {} as Record<string, unknown>,
  status: vi.fn(),
  tasks: [vi.fn(), vi.fn(), vi.fn(), vi.fn()],
  addRun: vi.fn(),
}));
vi.mock("react", async (importOriginal) => {
  const React = await importOriginal<typeof import("react")>();
  const realState = React.useState;
  let calls = 0;
  return {
    ...React,
    useState: (init: unknown) => {
      const i = calls++;
      if (i < h.seeds.length)
        return [h.seeds[i], (v: unknown) => (h.seeds[i] = v)] as [unknown, (v: unknown) => void];
      return realState(init);
    },
    useEffect: (fn: () => void) => void h.effects.push(fn),
    __resetSeed: () => (calls = 0),
  };
});
vi.mock("@/components/ui/button", async () => {
  const { createElement: el } = await vi.importActual<typeof import("react")>("react");
  const text = (c: unknown): string =>
    Array.isArray(c) ? c.map(text).join("") : typeof c === "string" ? c : "";
  return {
    Button: ({
      children,
      onClick,
      disabled,
    }: {
      children: unknown;
      onClick?: () => void;
      disabled?: boolean;
    }) => {
      if (onClick) h.clicks.set(text(children), onClick);
      return el("button", { disabled }, children as never);
    },
  };
});
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => () => undefined,
  Link: ({ to, children, className }: { to: string; children: unknown; className?: string }) =>
    createElement("a", { href: to, className }, children as never),
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: unknown }) => createElement("main", null, children as never),
}));
vi.mock("@/components/WorkflowComparisonPanel", () => ({
  WorkflowComparisonPanel: () => createElement("section", { "data-workflow-comparisons": "" }),
}));
vi.mock("@/lib/store", () => ({
  useStore: (select: (s: unknown) => unknown) => select(h.state),
  addAiEvaluationRun: h.addRun,
  updateAiEvaluationRun: vi.fn(),
  uid: () => "id",
}));
vi.mock("@/lib/ai.functions", () => ({
  getAiRouterStatusFn: h.status,
  generateContentFn: h.tasks[0],
  improveContentDraftFn: h.tasks[1],
  evaluateContentQualityFn: h.tasks[2],
  generateAuthorityOpportunitiesFn: h.tasks[3],
}));
vi.mock("@/i18n", () => ({
  useT: () => (k: string, vars?: Record<string, string | number>) => translate(h.lang, k, vars),
}));
import * as React from "react";
import { ResultCard, Route } from "@/routes/_authenticated/app.ai-evaluation";
import { AiEvaluationGateError } from "./ai-usage.server";

const LANGS: readonly Lang[] = ["en", "pl", "sv", "da"];
const savedRun: AiEvaluationRun = {
  id: "saved-run",
  createdAt: "2026-10-01T10:00:00.000Z",
  projectId: "p",
  taskType: "contentQualityScore",
  existingModel: "existing",
  existingStatus: "success",
  candidateStatus: "notConfigured",
  existingLatencyMs: 1234,
} as AiEvaluationRun;
const status = (evaluationAccess: string) => ({
  defaultModel: { label: "Default", model: "default-model", enabled: true },
  candidateConfigured: false,
  candidateLabel: "Candidate",
  candidateModel: null,
  candidateProvider: "openrouter",
  experimentalRoutingEnabled: false,
  evaluationAccess,
});
const Page = (Route as unknown as { options: { component: () => null } }).options.component;
const render = () => {
  (React as unknown as { __resetSeed: () => void }).__resetSeed();
  h.clicks.clear();
  return renderToStaticMarkup(createElement(Page));
};
// Authority needs no input, so only the access state can disable its run control.
const seed = (s: unknown, lang: Lang = "en") => {
  h.seeds = [s, "authorityGeneration"];
  h.lang = lang;
  return render();
};
// The attribute, not the "disabled:" utility classes.
const runButton = (html: string, lang: Lang) =>
  html.match(
    new RegExp(`<button[^>]*>(?:(?!</button>).)*${translate(lang, "aiEval.run")}</button>`),
  )?.[0] ?? "";
const DISABLED = /^<button[^>]*\sdisabled=""/;
const planNote = (lang: Lang) =>
  `${translate(lang, "publicPricing.evaluation")} · ${translate(lang, "publicPricing.included")}: Pro, Agency`;
const expectHistory = (html: string, lang: Lang) => {
  expect(html).toContain(translate(lang, "aiEval.history"));
  expect(html).toContain("1234ms");
  expect(html).toContain("data-workflow-comparisons");
};
const expectNoPlanClaim = (html: string, lang: Lang) => {
  expect(html).not.toContain("data-evaluation-plan-gate");
  expect(html).not.toContain('href="/app/billing"');
  expect(html).not.toContain(planNote(lang));
  expect(html).not.toMatch(/feature_gate|evaluationAccess|aiEvalAccess\./);
};

beforeEach(() => {
  vi.clearAllMocks();
  h.effects = [];
  h.state = {
    projects: [{ id: "p", name: "Synthetic", businessName: "Synthetic", appLanguage: "en" }],
    activeProjectId: "p",
    services: [],
    opportunities: [],
    content: [],
    aiEvaluationRuns: [savedRun],
  };
});

describe("AI Evaluation route access states", () => {
  for (const lang of LANGS) {
    it(`${lang}: checking shows a loading status, holds Run and makes no plan claim`, () => {
      const html = seed(undefined, lang);
      expect(html).toMatch(/role="status"[^>]*data-evaluation-access="checking"/);
      expect(html).toContain(translate(lang, "common.loading"));
      expect(runButton(html, lang)).toMatch(DISABLED);
      expectNoPlanClaim(html, lang);
      expectHistory(html, lang);
    });

    for (const [label, s] of [
      ["a failed status request", null],
      ["unconfirmed access", status("unavailable")],
      ["an unexpected access value", status("maybe")],
    ] as const)
      it(`${lang}: ${label} explains unavailability with a status-only Retry, no Upgrade`, () => {
        const html = seed(s, lang);
        expect(html).toMatch(/role="alert"[^>]*data-evaluation-access="unavailable"/);
        expect(html).toContain(translate(lang, "aiEvalAccess.unavailable"));
        expect(h.clicks.has(translate(lang, "common.retry"))).toBe(true);
        expect(runButton(html, lang)).toMatch(DISABLED);
        expectNoPlanClaim(html, lang);
        expectHistory(html, lang);
      });

    it(`${lang}: a known restriction shows the plan explanation and Upgrade, Run held`, () => {
      const html = seed(status("restricted"), lang);
      expect(runButton(html, lang)).toMatch(DISABLED);
      expect(html).toContain("data-evaluation-plan-gate");
      expect(html).toContain(planNote(lang));
      expect(html).toMatch(
        new RegExp(`href="/app/billing"[^>]*>${translate(lang, "billing.upgrade")}<`),
      );
      expect(html).not.toContain("data-evaluation-access");
      expectHistory(html, lang);
    });

    it(`${lang}: allowed shows no notice and an enabled Run`, () => {
      const html = seed(status("allowed"), lang);
      expect(runButton(html, lang)).not.toBe("");
      expect(runButton(html, lang)).not.toMatch(DISABLED);
      expect(html).not.toContain("data-evaluation-access");
      expect(html).not.toContain("data-evaluation-plan-gate");
      expectHistory(html, lang);
    });
  }

  it("mount → failed read → status-only Retry → allowed: no comparison, model task or history run", async () => {
    h.status.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(status("allowed"));
    expect(runButton(seed(undefined), "en")).toMatch(DISABLED); // first render: checking
    h.effects.splice(0).forEach((fn) => fn()); // mount effect: the first status read
    await vi.waitFor(() => expect(h.seeds[0]).toBeNull());
    let html = render();
    expect(html).toContain('data-evaluation-access="unavailable"');
    expectHistory(html, "en");

    h.clicks.get(translate("en", "common.retry"))!();
    expect(h.seeds[0]).toBeUndefined(); // back to checking while the status is re-read
    expect(render()).toContain('data-evaluation-access="checking"');
    await vi.waitFor(() => expect(h.seeds[0]).toMatchObject({ evaluationAccess: "allowed" }));
    html = render();
    expect(runButton(html, "en")).not.toMatch(DISABLED);
    expect(html).not.toContain("data-evaluation-access");
    expectHistory(html, "en");

    expect(h.status).toHaveBeenCalledTimes(2);
    for (const task of h.tasks) expect(task).not.toHaveBeenCalled();
    expect(h.addRun).not.toHaveBeenCalled();
  });
});

describe("a side refused mid-run shows the authored sentence in the active language (real ResultCard mapper)", () => {
  for (const access of ["restricted", "unavailable"] as const)
    for (const lang of LANGS)
      it(`${access} in ${lang}`, () => {
        // Exactly what crosses the wire: the thrown Error's message, kept by the orchestrator's runOne.
        const message = new AiEvaluationGateError(access).message;
        const html = renderToStaticMarkup(
          createElement(ResultCard, {
            title: "Candidate",
            result: { status: "error", error: message, latencyMs: 5 },
            side: "candidate",
            running: false,
            t: (k: string, vars?: Record<string, string | number>) => translate(lang, k, vars),
          }),
        );
        expect(html).toContain(translate(lang, `aiEvalAccess.${access}`));
        if (lang !== "en") expect(html).not.toContain(message);
      });

  it("an unknown error message is still shown exactly as received", () => {
    const html = renderToStaticMarkup(
      createElement(ResultCard, {
        title: "Candidate",
        result: { status: "error", error: "Something else entirely", latencyMs: 5 },
        side: "candidate",
        running: false,
        t: (k: string) => translate("pl", k),
      }),
    );
    expect(html).toContain("Something else entirely");
  });
});
