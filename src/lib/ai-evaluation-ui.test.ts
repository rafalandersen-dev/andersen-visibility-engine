/**
 * AI Evaluation result cards (AK) — static render of the route's exported `ResultCard` with real copy.
 * Terminal states never show a spinner or a model latency for a side that ran no model; the in-flight
 * spinner appears only while an attempt is running; skipped-existing and skipped-candidate use distinct,
 * truthful copy; notRun explains why the candidate was not invoked. Checked in en and pl.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { translate } from "@/i18n/translate";
import type { SideResult } from "@/lib/ai-evaluation";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => () => undefined,
}));
vi.mock("@/components/AppShell", () => ({ AppShell: () => null }));
vi.mock("@/components/WorkflowComparisonPanel", () => ({ WorkflowComparisonPanel: () => null }));
vi.mock("@/lib/store", () => ({
  useStore: () => undefined,
  addAiEvaluationRun: vi.fn(),
  updateAiEvaluationRun: vi.fn(),
  uid: () => "id",
}));
vi.mock("@/lib/ai.functions", () => ({
  getAiRouterStatusFn: vi.fn(),
  generateContentFn: vi.fn(),
  improveContentDraftFn: vi.fn(),
  evaluateContentQualityFn: vi.fn(),
  generateAuthorityOpportunitiesFn: vi.fn(),
}));
vi.mock("@/i18n", () => ({ useT: () => (k: string) => translate("en", k) }));
import { ResultCard } from "@/routes/_authenticated/app.ai-evaluation";

const render = (
  result: SideResult | null,
  side: "existing" | "candidate",
  running: boolean,
  lang: "en" | "pl" = "en",
) =>
  renderToStaticMarkup(
    createElement(ResultCard, {
      title: side,
      result,
      side,
      running,
      t: (k: string) => translate(lang, k),
    }),
  );
const badge = (html: string) => html.match(/tracking-\[0\.12em\][^>]*>([^<]+)</)?.[1] ?? null;

describe("ResultCard terminal presentation", () => {
  it("shows the in-flight spinner only while running; a null result after completion renders no spinner", () => {
    expect(render(null, "candidate", true)).toContain("data-in-flight");
    expect(render(null, "candidate", false)).not.toContain("animate-spin");
  });
  it("existing skipped: Skipped badge, no latency, existing-side copy, no spinner", () => {
    const html = render({ status: "skipped", reason: "tooShort" }, "existing", false);
    expect(badge(html)).toBe("Skipped");
    expect(html).not.toMatch(/\d+ms/);
    expect(html).not.toContain("animate-spin");
    expect(html).toContain('data-side-skipped="existing"');
    expect(html).toContain("No model was run");
    expect(html).not.toContain("The existing model ran");
  });
  it("candidate skipped: Skipped badge, no latency, candidate-side copy (existing ran, candidate did not)", () => {
    const html = render({ status: "skipped", reason: "tooShort" }, "candidate", false);
    expect(badge(html)).toBe("Skipped");
    expect(html).not.toMatch(/\d+ms/);
    expect(html).toContain('data-side-skipped="candidate"');
    expect(html).toContain("The existing model ran, but the candidate returned");
    expect(html).not.toContain("No model was run");
  });
  it("candidate not run after an existing skip: Not run badge, explanation, no spinner, no latency", () => {
    const html = render({ status: "notRun", cause: "existingSkipped" }, "candidate", false);
    expect(badge(html)).toBe("Not run");
    expect(html).toContain("data-side-not-run");
    expect(html).toContain("the candidate model was not invoked");
    expect(html).not.toContain("animate-spin");
    expect(html).not.toMatch(/\d+ms/);
  });
  it("success and error keep their latency; notConfigured has none", () => {
    expect(
      render({ status: "success", output: "Milo Score 70/100", latencyMs: 123 }, "existing", false),
    ).toContain("123ms");
    expect(
      render({ status: "error", error: "provider down", latencyMs: 45 }, "candidate", false),
    ).toContain("45ms");
    const nc = render({ status: "notConfigured" }, "candidate", false);
    expect(badge(nc)).toBe("Not configured");
    expect(nc).not.toMatch(/\d+ms/);
  });
  it("Polish copy: skipped sides and not-run state are translated", () => {
    expect(render({ status: "skipped", reason: "tooShort" }, "existing", false, "pl")).toContain(
      "Nie uruchomiono żadnego modelu",
    );
    expect(render({ status: "skipped", reason: "tooShort" }, "candidate", false, "pl")).toContain(
      "Istniejący model został uruchomiony, ale kandydat",
    );
    const nr = render({ status: "notRun", cause: "existingSkipped" }, "candidate", false, "pl");
    expect(badge(nr)).toBe("Nie uruchomiono");
    expect(nr).toContain("model kandydujący nie został wywołany");
  });
});
