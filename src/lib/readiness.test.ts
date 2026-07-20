/**
 * Readiness & safety scores (Article Studio 2.0 / P1.1 I).
 *
 * T12 — a health/finance claim without support triggers the YMYL gate.
 * T15 — two assets targeting the same query/intent are flagged (advisory).
 * Plus: deterministic SEO checks, corpus duplication with exposed conflicts +
 * confidence + limitation, and method classification per dimension.
 */
import { describe, it, expect } from "vitest";
import { assessReadiness, toReadinessScore } from "./readiness";
import type { ContentAsset, Project } from "./types";

const project = (): Project =>
  ({ id: "p1", name: "N", businessName: "Biz", websiteUrl: "https://site.com" }) as Project;

const asset = (over: Partial<ContentAsset> = {}): ContentAsset =>
  ({
    id: "a1",
    projectId: "p1",
    title: "T",
    slug: "t",
    markdown: "Body.",
    ...over,
  }) as ContentAsset;

describe("method classification", () => {
  it("declares deterministic / heuristic methods per dimension", () => {
    const r = assessReadiness(asset(), project(), []);
    expect(r.seoReadiness.method).toBe("deterministic");
    expect(r.aiReadability.method).toBe("heuristic");
    expect(r.ymyl.method).toBe("deterministic");
    expect(r.duplication.method).toBe("deterministic");
    expect(r.cannibalisation.method).toBe("deterministic");
  });
});

describe("SEO readiness — deterministic on-page checks over the canonical asset", () => {
  it("scores a well-formed asset high and a thin one low", () => {
    const good = asset({
      title: "Deep tissue massage in Malmö",
      metaTitle: "Deep tissue massage in Malmö",
      metaDescription:
        "What to expect from a deep tissue massage session in Malmö, including benefits, aftercare and how to book your first appointment today.",
      markdown:
        "# Deep tissue massage\n\n## What it is\n\n" +
        "Deep tissue massage helps recovery. ".repeat(60) +
        "\n\n## Aftercare\n\nRest well.",
    });
    expect(assessReadiness(good, project(), []).seoReadiness.score).toBeGreaterThanOrEqual(80);

    const thin = asset({
      title: "x",
      metaTitle: "x",
      metaDescription: "y",
      markdown: "Too short.",
    });
    const r = assessReadiness(thin, project(), []);
    expect(r.seoReadiness.score).toBeLessThan(50);
    expect(r.seoReadiness.issues.length).toBeGreaterThan(0);
  });
});

describe("YMYL gate (T12)", () => {
  it("health claim without support → fail (needs a human)", () => {
    const a = asset({
      markdown: "This treatment cures chronic pain and eliminates every symptom.",
    });
    const r = assessReadiness(a, project(), []);
    expect(r.ymyl.level).toBe("fail");
    expect(r.ymyl.signals).toContain("medical");
    expect(r.ymyl.supported).toBe(false);
  });
  it("same claim WITH a verified source → review, not fail", () => {
    const a = asset({
      markdown: "This treatment can help reduce symptoms for some people.",
      sources: [{ url: "https://nih.gov/study", status: "verified" }] as never,
    });
    expect(assessReadiness(a, project(), []).ymyl.level).toBe("review");
  });
  it("ordinary non-medical content → pass", () => {
    const a = asset({ markdown: "Our studio offers relaxing sessions and friendly staff." });
    expect(assessReadiness(a, project(), []).ymyl.level).toBe("pass");
  });
});

describe("duplication — corpus comparison, exposes conflicts + confidence + limitation", () => {
  it("flags a near-duplicate sibling asset with the conflicting id", () => {
    const body =
      "Deep tissue massage relieves chronic back pain and improves mobility over several weeks of regular sessions.";
    const a = asset({ id: "a1", markdown: body });
    const b = asset({ id: "a2", title: "Other", markdown: body + " Slightly different ending." });
    const r = assessReadiness(a, project(), [a, b]);
    expect(r.duplication.conflicts.map((c) => c.assetId)).toContain("a2");
    expect(r.duplication.confidence).toBeGreaterThan(0.5);
    expect(r.duplication.limitation).toMatch(/not proof/i);
    expect(["review", "fail"]).toContain(r.duplication.level);
  });
  it("distinct assets do not conflict", () => {
    const a = asset({ id: "a1", markdown: "A guide to Swedish massage techniques for beginners." });
    const b = asset({
      id: "a2",
      title: "Nutrition",
      markdown: "Meal planning tips for busy professionals on a budget.",
    });
    expect(assessReadiness(a, project(), [a, b]).duplication.conflicts).toEqual([]);
  });
});

describe("cannibalisation (T15) — advisory, never proof", () => {
  it("flags two assets whose titles target the same query, as review not fail", () => {
    const a = asset({ id: "a1", title: "Deep tissue massage in Malmö", slug: "deep-tissue-malmo" });
    const b = asset({
      id: "a2",
      title: "Deep tissue massage in Malmö guide",
      slug: "deep-tissue-malmo-guide",
    });
    const r = assessReadiness(a, project(), [a, b]);
    expect(r.cannibalisation.conflicts.map((c) => c.assetId)).toContain("a2");
    expect(r.cannibalisation.level).toBe("review"); // never "fail" on lexical overlap
    expect(r.cannibalisation.limitation).toMatch(/confirm intent/i);
  });
});

describe("toReadinessScore", () => {
  it("produces the compact storable summary", () => {
    const s = toReadinessScore(assessReadiness(asset(), project(), []), "2026-07-20T00:00:00Z");
    expect(s).toMatchObject({
      seoReadiness: expect.any(Number),
      aiReadability: expect.any(Number),
      ymylRisk: "pass",
      duplicationRisk: "pass",
      cannibalisationRisk: "pass",
      evaluatedAt: "2026-07-20T00:00:00Z",
    });
  });
});
