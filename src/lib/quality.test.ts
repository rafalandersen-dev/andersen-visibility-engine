/**
 * Scenario 4 (weak article) offline controls — Milo Score normalisation.
 *
 * Expected outcomes are business requirements from the eight-scenario matrix
 * (AGENT_ARCHITECTURE_DECISION_2026_09_19.md §8 row 4) and the 28 Sep 2026 conservative-
 * evidence decisions (docs/MILO-SCORE-CONSERVATIVE-EVIDENCE-2026-09-28.md). They are not the
 * weighting formula copied back: every expectation holds for any positive weighting.
 */
import { describe, expect, it } from "vitest";
import {
  hasMinimumWords,
  CRITICAL_TRUST_THRESHOLD,
  MIN_EVALUABLE_WORDS,
  QUALITY_CATEGORY_KEYS,
  UNASSESSED_EXPLANATION,
  draftWordCount,
  normalizeQualityScore,
  parseCategoryScore,
  statusFromScore,
  tooShortScore,
} from "./quality";

const AT = "2026-09-28T12:00:00.000Z";
const category = (score: unknown, name: string) => ({
  score,
  explanation: `${name}: explicit reviewer finding for ${name}.`,
  suggestions: [
    `Fix ${name} first`,
    `Then re-check ${name}`,
    `Extra ${name} tip`,
    `dropped fourth`,
  ],
});
const allCategories = (score: unknown, over: Record<string, unknown> = {}) => ({
  ...Object.fromEntries(QUALITY_CATEGORY_KEYS.map((k) => [k, category(score, k)])),
  ...over,
});
const withoutTrust = (score: unknown) => {
  const c = allCategories(score) as Record<string, unknown>;
  delete c.trustSafety;
  return c;
};

describe("raw category score validation", () => {
  it.each([
    [0, 0],
    [100, 100],
    [72.4, 72],
    [99.6, 100],
    ["85", 85],
    [" 85 ", 85],
    ["72.5", 73],
    ["0", 0],
    ["100", 100],
  ])("accepts %j as %d", (raw, expected) => {
    expect(parseCategoryScore(raw)).toBe(expected);
  });
  it.each([
    "85%",
    "",
    "  ",
    "1e2",
    "+85",
    "-1",
    "85 points",
    -0.1,
    100.4,
    250,
    -40,
    NaN,
    Infinity,
    true,
    false,
    null,
    undefined,
    {},
    [],
    [85],
  ])("rejects %j (no guessed number)", (raw) => {
    expect(parseCategoryScore(raw)).toBeNull();
  });
});

describe("inflated model verdict versus explicitly weak categories", () => {
  const raw = {
    overall: 95,
    status: "strong",
    publishingRecommendation: "ready",
    categories: allCategories(30),
    topIssues: ["i1", "i2", "i3", "i4", "i5", "i6 dropped"],
    quickWins: ["w1"],
    summary: "Model says it is great.",
  };
  const score = normalizeQualityScore(raw, AT, "test-model");

  it("derives a sub-threshold overall from the categories and ignores the model's 95", () => {
    expect(score.overall).toBeLessThanOrEqual(30);
    expect(score.status).toBe("needsWork");
    expect(score.publishingRecommendation).toBe("notReady");
  });
  it("names every failing category and retains its caveat and suggestions (bounded)", () => {
    for (const key of QUALITY_CATEGORY_KEYS) {
      const c = score.categories[key];
      expect(c.status).toBe("needsWork");
      expect(c.explanation).toBe(`${key}: explicit reviewer finding for ${key}.`);
      expect(c.suggestions).toEqual([
        `Fix ${key} first`,
        `Then re-check ${key}`,
        `Extra ${key} tip`,
      ]);
    }
    expect(score.topIssues).toEqual(["i1", "i2", "i3", "i4", "i5"]);
    expect(score.quickWins).toEqual(["w1"]);
    expect(score.summary).toBe("Model says it is great.");
    expect(score.evaluatedAt).toBe(AT);
    expect(score.model).toBe("test-model");
  });
});

describe("honest valid scores still earn their verdict", () => {
  it("fully assessed, all categories high: strong and ready", () => {
    const score = normalizeQualityScore({ categories: allCategories(92) }, AT);
    expect(score.overall).toBeGreaterThanOrEqual(85);
    expect(score.status).toBe("strong");
    expect(score.publishingRecommendation).toBe("ready");
  });
  it("fully assessed with plain numeric strings: same verdict as numbers", () => {
    const score = normalizeQualityScore({ categories: allCategories("92") }, AT);
    expect(score.status).toBe("strong");
    expect(score.publishingRecommendation).toBe("ready");
  });
  it("fully assessed at the exact boundaries: 100 is strong/ready, 85 is strong/ready, 84 is okay/reviewFirst, 65 is okay/reviewFirst, 64 is needsWork/notReady, 0 is needsWork/notReady", () => {
    const at = (n: number) => normalizeQualityScore({ categories: allCategories(n) }, AT);
    expect([at(100).status, at(100).publishingRecommendation]).toEqual(["strong", "ready"]);
    expect([at(85).status, at(85).publishingRecommendation]).toEqual(["strong", "ready"]);
    expect([at(84).status, at(84).publishingRecommendation]).toEqual(["okay", "reviewFirst"]);
    expect([at(65).status, at(65).publishingRecommendation]).toEqual(["okay", "reviewFirst"]);
    expect([at(64).status, at(64).publishingRecommendation]).toEqual(["needsWork", "notReady"]);
    expect([at(0).status, at(0).publishingRecommendation]).toEqual(["needsWork", "notReady"]);
  });
  it("a fully assessed all-100 payload is exactly 100 (no floating-point residue rejection)", () => {
    expect(normalizeQualityScore({ categories: allCategories(100) }, AT).overall).toBe(100);
  });
  it("trustSafety exactly at the critical threshold is not critical", () => {
    const score = normalizeQualityScore(
      {
        categories: allCategories(100, {
          trustSafety: category(CRITICAL_TRUST_THRESHOLD, "trustSafety"),
        }),
      },
      AT,
    );
    expect(score.status).toBe("strong");
    expect(score.publishingRecommendation).toBe("ready");
  });
  it("statusFromScore keeps its numeric semantics for other consumers", () => {
    expect(statusFromScore(85)).toBe("strong");
    expect(statusFromScore(65)).toBe("okay");
    expect(statusFromScore(64)).toBe("needsWork");
  });
});

describe("explicitly critical trustSafety with high categories", () => {
  const score = normalizeQualityScore(
    {
      overall: 98,
      status: "strong",
      publishingRecommendation: "ready",
      categories: allCategories(100, {
        trustSafety: {
          score: 20,
          explanation: "Guarantees a first-page ranking and gives medical advice without caveats.",
          suggestions: ["Remove the guarantee", "Add a medical disclaimer"],
        },
      }),
    },
    AT,
  );
  it("is not ready and the headline is capped at okay, while the weighted number and the caveat are kept", () => {
    expect(score.overall).toBeGreaterThanOrEqual(85); // the number keeps its meaning
    expect(score.status).toBe("okay");
    expect(score.publishingRecommendation).toBe("reviewFirst");
    expect(score.categories.trustSafety.status).toBe("needsWork");
    expect(score.categories.trustSafety.explanation).toContain("Guarantees a first-page ranking");
    expect(score.categories.trustSafety.suggestions).toEqual([
      "Remove the guarantee",
      "Add a medical disclaimer",
    ]);
  });
  it("a critical trust score with a low aggregate stays needsWork / notReady", () => {
    const low = normalizeQualityScore(
      { categories: allCategories(40, { trustSafety: category(10, "trustSafety") }) },
      AT,
    );
    expect(low.status).toBe("needsWork");
    expect(low.publishingRecommendation).toBe("notReady");
  });
});

describe("unassessed critical category (trustSafety) never reads as verified safe", () => {
  it.each([
    ["missing entirely", withoutTrust(100)],
    ["a non-object string", { ...withoutTrust(100), trustSafety: "fine" }],
    ["a bare number", { ...withoutTrust(100), trustSafety: 95 }],
    ["an array", { ...withoutTrust(100), trustSafety: [95] }],
    ["an object without a score", { ...withoutTrust(100), trustSafety: { explanation: "ok" } }],
    ["a percent string score", { ...withoutTrust(100), trustSafety: { score: "85%" } }],
    ["an out-of-range score", { ...withoutTrust(100), trustSafety: { score: 250 } }],
    ["a boolean score", { ...withoutTrust(100), trustSafety: { score: true } }],
  ])("seven categories at 100 with trustSafety %s", (_label, categories) => {
    const score = normalizeQualityScore({ overall: 100, status: "strong", categories }, AT);
    expect(score.publishingRecommendation).not.toBe("ready");
    expect(score.status).not.toBe("strong");
    expect(score.status).toBe("okay");
    expect(score.publishingRecommendation).toBe("reviewFirst");
    expect(score.categories.trustSafety.score).toBe(0);
    expect(score.categories.trustSafety.status).toBe("needsWork");
    expect(score.categories.trustSafety.explanation).toContain(UNASSESSED_EXPLANATION);
    // No positive credit: the seven assessed categories alone bound the overall below 100.
    expect(score.overall).toBeLessThan(100);
  });
  it("keeps a bounded original caveat as an evaluator note, not as a verified assessment", () => {
    const score = normalizeQualityScore(
      {
        categories: {
          ...withoutTrust(100),
          trustSafety: {
            score: "n/a",
            explanation: "Looks fine to me.",
            suggestions: ["s1", "s2", "s3", "s4"],
          },
        },
      },
      AT,
    );
    const t = score.categories.trustSafety;
    expect(t.score).toBe(0);
    expect(t.explanation.startsWith(UNASSESSED_EXPLANATION)).toBe(true);
    expect(t.explanation).toContain("Evaluator note: Looks fine to me.");
    expect(t.suggestions).toEqual(["s1", "s2", "s3"]);
  });
});

describe("unassessed non-critical category", () => {
  it.each(["internalLinks", "structure", "localRelevance"] as const)(
    "seven categories at 100 with %s missing: not ready, headline capped at okay, category stored as unassessed zero",
    (missing) => {
      const categories = allCategories(100) as Record<string, unknown>;
      delete categories[missing];
      const score = normalizeQualityScore({ categories }, AT);
      expect(score.publishingRecommendation).toBe("reviewFirst");
      expect(score.status).toBe("okay");
      expect(score.categories[missing].score).toBe(0);
      expect(score.categories[missing].status).toBe("needsWork");
      expect(score.categories[missing].explanation).toContain(UNASSESSED_EXPLANATION);
      expect(score.overall).toBeLessThan(100);
    },
  );
  it("an invalid score in a non-critical category also prevents ready", () => {
    const score = normalizeQualityScore(
      { categories: allCategories(100, { internalLinks: { score: "high", explanation: "x" } }) },
      AT,
    );
    expect(score.publishingRecommendation).toBe("reviewFirst");
    expect(score.status).toBe("okay");
  });
});

describe("invalid numeric evidence never becomes credit", () => {
  it.each([250, "85%", "1e2", -40, NaN, null, true, {}, []])(
    "an invalid score %j is stored as unassessed zero, never as a high number",
    (bad) => {
      const score = normalizeQualityScore(
        { categories: allCategories(100, { trustSafety: { score: bad, explanation: "x" } }) },
        AT,
      );
      expect(score.categories.trustSafety.score).toBe(0);
      expect(score.categories.trustSafety.status).toBe("needsWork");
    },
  );
  it("payloads without usable categories are not ready and not strong", () => {
    for (const raw of [
      undefined,
      null,
      "strong",
      95,
      [],
      { categories: null },
      { categories: "all good" },
    ]) {
      const score = normalizeQualityScore(raw, AT);
      expect(score.overall).toBe(0);
      expect(score.status).toBe("needsWork");
      expect(score.publishingRecommendation).toBe("notReady");
      for (const key of QUALITY_CATEGORY_KEYS) {
        expect(score.categories[key].score).toBe(0);
        expect(score.categories[key].explanation).toBe(UNASSESSED_EXPLANATION);
      }
    }
  });
});

describe("empty or too-short draft helpers", () => {
  it("counts words without markdown syntax, so formatting cannot pad a draft past the threshold", () => {
    expect(draftWordCount("")).toBe(0);
    expect(draftWordCount("# ## ### > * _ ` ~ -")).toBe(0);
    expect(draftWordCount("**bold** _em_ `code` - item")).toBe(4);
    const thirtyNine = Array.from({ length: MIN_EVALUABLE_WORDS - 1 }, (_, i) => `w${i}`).join(" ");
    expect(draftWordCount(thirtyNine)).toBe(MIN_EVALUABLE_WORDS - 1);
    expect(draftWordCount(`# Title\n\n${thirtyNine}`)).toBe(MIN_EVALUABLE_WORDS);
  });
  it("gives a conservative, explained, not-ready result for a too-short draft", () => {
    const score = tooShortScore(AT);
    expect(score.overall).toBeLessThan(65);
    expect(score.status).toBe("needsWork");
    expect(score.publishingRecommendation).toBe("notReady");
    expect(score.model).toBeUndefined();
    for (const key of QUALITY_CATEGORY_KEYS) {
      expect(score.categories[key].status).toBe("needsWork");
      expect(score.categories[key].explanation).toMatch(/too short/);
      expect(score.categories[key].suggestions.length).toBeGreaterThan(0);
    }
    expect(score.topIssues.length).toBeGreaterThan(0);
  });
});

describe("hasMinimumWords: a bounded early-exit predicate that agrees with draftWordCount", () => {
  const w = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
  it("boundaries: 39 words is below the 40-word threshold, 40 and more are not", () => {
    expect(draftWordCount(w(39))).toBe(39);
    expect(hasMinimumWords(w(39), MIN_EVALUABLE_WORDS)).toBe(false);
    expect(draftWordCount(w(40))).toBe(40);
    expect(hasMinimumWords(w(40), MIN_EVALUABLE_WORDS)).toBe(true);
    expect(hasMinimumWords(w(41), MIN_EVALUABLE_WORDS)).toBe(true);
    expect(hasMinimumWords("", MIN_EVALUABLE_WORDS)).toBe(false);
    expect(hasMinimumWords("", 0)).toBe(true);
  });
  it("markdown punctuation and whitespace separate words exactly as the counter does", () => {
    const samples = [
      "# ## **  ** - - > `",
      "foo-bar_baz#qux>quux*corge`grault~garply",
      "a\u00a0b\u3000c\u2028d\u2029e\ufefff\u1680g\u2000h\u200ai\u202fj\u205fk",
      "a\tb\nc\vd\fe\rf",
      "word",
      "  leading and trailing  ",
      "emoji \u{1F600}\u{1F600} counts as one word",
      "\u2001\u2002\u2003",
      "---\n# Title\n\n> quote **bold** _em_ `code` ~~strike~~ - item\n",
    ];
    for (const s of samples)
      for (const min of [0, 1, 2, 3, 5, 8, 13, 40])
        expect(hasMinimumWords(s, min), JSON.stringify([s, min])).toBe(draftWordCount(s) >= min);
  });
  it("every UTF-16 code unit is classified exactly as the counter classifies it (separator or word character)", () => {
    // 65 536 probes: "a<c>b" has two words iff <c> is a separator for the counter.
    const mismatches: number[] = [];
    for (let c = 0; c <= 0xffff; c++) {
      const s = `a${String.fromCharCode(c)}b`;
      if (hasMinimumWords(s, 2) !== draftWordCount(s) >= 2) mismatches.push(c);
    }
    expect(mismatches).toEqual([]);
  });
  it("a pathological single token or separator run is one pass with the counter's answer (no threshold is faked)", () => {
    const token = "a".repeat(200_000);
    expect(hasMinimumWords(token, MIN_EVALUABLE_WORDS)).toBe(false);
    expect(draftWordCount(token)).toBe(1);
    const spaces = " ".repeat(200_000);
    expect(hasMinimumWords(spaces, 1)).toBe(false);
    expect(draftWordCount(spaces)).toBe(0);
    const dashes = "-".repeat(200_000) + " x";
    expect(hasMinimumWords(dashes, 1)).toBe(true);
    expect(hasMinimumWords(dashes, 2)).toBe(false);
    // The UI counter is untouched: it still reports the exact number, never the threshold.
    expect(draftWordCount(w(1000))).toBe(1000);
  });
});
