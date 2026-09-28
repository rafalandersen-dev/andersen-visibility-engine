/**
 * Static render of the real MiloScorePanel with fictional normalized scores (AG): the headline
 * status, recommendation and category rows must present the conservative-evidence outcomes
 * consistently — no "Strong"/"Ready" beside an unassessed or critical trust & safety row, while a
 * fully assessed high score still reads "Strong · Ready to publish". Real English copy; no server,
 * store or provider.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { translate } from "@/i18n/translate";
import { QUALITY_CATEGORY_KEYS, normalizeQualityScore } from "@/lib/quality";
import type { ContentAsset } from "@/lib/types";

const lang = vi.hoisted(() => ({ current: "en" as "en" | "pl" | "sv" | "da" }));
vi.mock("@/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    translate(lang.current, key, vars),
}));
vi.mock("@/lib/mock-ai", () => ({ evaluateContentQuality: vi.fn(), improveContentDraft: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { MiloScorePanel, qualityActionFailureMessage } from "./MiloScorePanel";
import { ProducerSessionError } from "@/lib/producer-session";

const AT = "2026-09-28T12:00:00.000Z";
const body = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
const cats = (score: number, over: Record<string, unknown> = {}) => ({
  ...Object.fromEntries(
    QUALITY_CATEGORY_KEYS.map((k) => [k, { score, explanation: `${k} note`, suggestions: [] }]),
  ),
  ...over,
});
/** Text of the two HEADLINE badges (status, recommendation); category rows use a smaller badge class. */
const headlineBadges = (html: string) =>
  [...html.matchAll(/tracking-\[0\.14em\][^>]*>([^<]+)</g)].map((m) => m[1]);
const render = (qualityScore: ReturnType<typeof normalizeQualityScore>) =>
  renderToStaticMarkup(
    createElement(MiloScorePanel, {
      asset: {
        id: "a1",
        projectId: "p1",
        title: "Fixture",
        slug: "fixture",
        markdown: body,
        qualityScore,
      } as unknown as ContentAsset,
    }),
  );

describe("MiloScorePanel presents conservative-evidence outcomes consistently", () => {
  it("high overall with an unassessed trust & safety row: Okay · Review first, trust row Needs work / Not assessed", () => {
    const seven = cats(100) as Record<string, unknown>;
    delete seven.trustSafety;
    const score = normalizeQualityScore({ overall: 100, categories: seven }, AT);
    const html = render(score);
    expect(html).toContain(`>${score.overall}<`);
    expect(headlineBadges(html)).toEqual(["Okay", "Review first"]);
    expect(html).toContain("Not assessed: the evaluator returned no valid score");
    // The trust row itself reads 0 / Needs work; the seven assessed rows may legitimately read Strong.
    expect(html).toMatch(/Trust &amp; safety<\/span>.*?>0<\/span>.*?>Needs work</s);
  });
  it("high overall with a critical trust & safety score: Okay · Review first, caveat shown", () => {
    const score = normalizeQualityScore(
      {
        categories: cats(100, {
          trustSafety: {
            score: 20,
            explanation: "Unsupported medical guarantee.",
            suggestions: [],
          },
        }),
      },
      AT,
    );
    const html = render(score);
    expect(headlineBadges(html)).toEqual(["Okay", "Review first"]);
    expect(html).toContain("Unsupported medical guarantee.");
  });
  it("valid high control: Strong · Ready to publish", () => {
    const html = render(normalizeQualityScore({ categories: cats(92) }, AT));
    expect(headlineBadges(html)).toEqual(["Strong", "Ready to publish"]);
    expect(html).not.toContain("Not assessed");
  });
});

describe("MiloScorePanel shows system fallbacks in the UI language, model notes verbatim (AI)", () => {
  const seven = cats(100) as Record<string, unknown>;
  delete seven.trustSafety;
  const unassessed = normalizeQualityScore({ categories: seven }, AT);
  const noted = normalizeQualityScore(
    {
      categories: {
        ...seven,
        trustSafety: { score: "n/a", explanation: "Wygląda dobrze (model)." },
      },
    },
    AT,
  );
  it.each([
    ["pl", "Nieocenione: ewaluator nie zwrócił prawidłowego wyniku", "Uwaga ewaluatora"],
    ["sv", "Inte bedömd: utvärderaren returnerade ingen giltig poäng", "Utvärderarens notering"],
    ["da", "Ikke vurderet: evaluatoren returnerede ingen gyldig score", "Evaluatorens note"],
    ["en", "Not assessed: the evaluator returned no valid score", "Evaluator note"],
  ] as const)("%s: translated fallback, note label and verbatim note", (l, fallback, label) => {
    lang.current = l;
    const plain = render(unassessed);
    expect(plain).toContain(`data-explanation="unassessed">${fallback}`);
    expect(plain).not.toContain('data-explanation="evaluatorNote"');
    const withNote = render(noted);
    expect(withNote).toContain(`data-explanation="unassessed">${fallback}`);
    expect(withNote).toContain(
      `data-explanation="evaluatorNote">${label}: Wygląda dobrze (model).`,
    );
    // The stored English system string itself is not what the UI shows in a non-English language.
    if (l !== "en") expect(withNote).not.toContain("Not assessed: the evaluator");
    lang.current = "en";
  });
  it("valid categories keep their model explanation verbatim in every language", () => {
    for (const l of ["pl", "sv", "da", "en"] as const) {
      lang.current = l;
      expect(render(normalizeQualityScore({ categories: cats(92) }, AT))).toContain(
        'data-explanation="model">Fictional trustSafety explanation (local fixture).'.replace(
          "Fictional trustSafety explanation (local fixture).",
          "trustSafety note",
        ),
      );
    }
    lang.current = "en";
  });
});

describe("BM: the action failure toast text", () => {
  const pl = (k: string, vars?: Record<string, string | number>) => translate("pl", k, vars);
  it("producer outcomes keep their meaning ahead of any refusal sentence", () => {
    expect(qualityActionFailureMessage(new ProducerSessionError("source_changed"), pl)).toBe(
      pl("shell.producer.sourceChanged"),
    );
  });
  it("known refusals are translated; unknown Error text is shown as received; non-errors fall back", () => {
    const incomplete =
      "The AI service did not complete its answer for this whole draft. Milo kept the draft unchanged and did not retry it.";
    expect(qualityActionFailureMessage(new Error(incomplete), pl)).toBe(
      pl("quality.refusal.incompleteOutput"),
    );
    expect(qualityActionFailureMessage(new Error("Custom text"), pl)).toBe("Custom text");
    expect(qualityActionFailureMessage(undefined, pl)).toBe(pl("quality.error"));
  });
});
