/**
 * Publishing checklist (Article Studio 2.0 / P1.1 J).
 *
 * A deterministic safety failure must block publishing; a warning must not. This
 * is the SHARED gate used by the editor and the server/cron runner, so proving it
 * here proves every publish path refuses the same unsafe content.
 */
import { describe, it, expect } from "vitest";
import { buildPublishingChecklist, publishBlockers, isPublishBlocked } from "./checklist";
import type { ContentAsset, Project } from "./types";

const project = (): Project =>
  ({ id: "p1", name: "N", businessName: "Biz", websiteUrl: "https://site.com" }) as Project;

const asset = (over: Partial<ContentAsset> = {}): ContentAsset =>
  ({
    id: "a1",
    projectId: "p1",
    title: "Relaxing studio sessions",
    slug: "relaxing",
    markdown: "Our studio offers relaxing sessions and friendly staff in a calm space.",
    ...over,
  }) as ContentAsset;

const item = (list: ReturnType<typeof buildPublishingChecklist>, key: string) =>
  list.find((i) => i.key === key)!;

describe("a clean asset is publishable", () => {
  it("has no failing hard blockers", () => {
    const a = asset();
    expect(isPublishBlocked(a, project(), [a])).toBe(false);
    expect(publishBlockers(a, project(), [a])).toEqual([]);
  });
});

describe("hard blockers (deterministic safety) — each blocks", () => {
  it("unresolved internal link blocks", () => {
    const a = asset({ markdown: "See [invented](/made-up-page)." });
    expect(item(buildPublishingChecklist(a, project(), [a]), "links").passed).toBe(false);
    expect(isPublishBlocked(a, project(), [a])).toBe(true);
  });

  it("an invalid cited (verified) source blocks", () => {
    const a = asset({ sources: [{ url: "http://127.0.0.1/x", status: "verified" }] as never });
    expect(item(buildPublishingChecklist(a, project(), [a]), "sources").passed).toBe(false);
    expect(isPublishBlocked(a, project(), [a])).toBe(true);
  });

  it("a YMYL claim WITH a resolved author + source does not block", () => {
    const a = asset({
      markdown: "This treatment can help reduce symptoms for some people.",
      sources: [{ url: "https://nih.gov/s", status: "verified" }] as never,
      author: { name: "Dr Lena", credentials: "PT, MSc" },
    });
    expect(item(buildPublishingChecklist(a, project(), [a]), "ymyl").passed).toBe(true);
    expect(isPublishBlocked(a, project(), [a])).toBe(false);
  });

  it("an approved image without alt text blocks (T8)", () => {
    const a = asset({
      images: [
        {
          id: "i1",
          concept: "hero",
          url: "https://site.com/media/a.jpg",
          alt: "",
          placement: "featured",
          status: "accepted",
        },
      ] as never,
    });
    expect(item(buildPublishingChecklist(a, project(), [a]), "imageAlt").passed).toBe(false);
    expect(isPublishBlocked(a, project(), [a])).toBe(true);
  });

  it("a required content image that isn't approved blocks", () => {
    const a = asset({
      images: [
        {
          id: "i1",
          concept: "hero",
          url: "",
          alt: "x",
          placement: "featured",
          status: "proposed",
          required: true,
        },
      ] as never,
    });
    expect(item(buildPublishingChecklist(a, project(), [a]), "requiredImage").passed).toBe(false);
    expect(isPublishBlocked(a, project(), [a])).toBe(true);
  });
});

describe("YMYL & author are advisory, not hard blockers (owner decision 2026-07-22)", () => {
  it("an unsupported YMYL claim with no author WARNS but does not block publish", () => {
    const a = asset({ markdown: "This treatment cures back pain and removes every symptom." });
    const list = buildPublishingChecklist(a, project(), [a]);
    // both still flagged (passed=false) so the nudge shows...
    expect(item(list, "ymyl").passed).toBe(false);
    expect(item(list, "author").passed).toBe(false);
    // ...but both are non-blocking, so publishing is allowed
    expect(item(list, "ymyl").blocking).toBe(false);
    expect(item(list, "author").blocking).toBe(false);
    expect(isPublishBlocked(a, project(), [a])).toBe(false);
    expect(publishBlockers(a, project(), [a]).map((b) => b.key)).not.toContain("ymyl");
    expect(publishBlockers(a, project(), [a]).map((b) => b.key)).not.toContain("author");
  });

  it("a genuine hard blocker STILL blocks even on YMYL content (safety not weakened)", () => {
    // health claim (would trip ymyl/author warnings) PLUS an unresolved internal link
    const a = asset({
      markdown: "This treatment cures back pain. See [invented](/made-up-page).",
    });
    expect(item(buildPublishingChecklist(a, project(), [a]), "links").passed).toBe(false);
    expect(isPublishBlocked(a, project(), [a])).toBe(true); // still blocked by `links`
  });
});

describe("warnings never block", () => {
  it("an optional missing image / low soft score / SEO suggestion do not block publish", () => {
    const a = asset({
      metaTitle: "x", // triggers an SEO warning
      metaDescription: "y",
      qualityScore: { overall: 60 } as never, // soft score below target → warning
      images: [
        {
          id: "opt",
          concept: "decor",
          url: "",
          alt: "",
          placement: "inline",
          status: "proposed",
          required: false,
        },
      ] as never,
    });
    const list = buildPublishingChecklist(a, project(), [a]);
    expect(item(list, "seo").blocking).toBe(false);
    expect(item(list, "miloScore").passed).toBe(false);
    expect(item(list, "miloScore").blocking).toBe(false);
    expect(isPublishBlocked(a, project(), [a])).toBe(false); // warnings only → publishable
  });

  it("cannibalisation is a warning, not a block", () => {
    const a = asset({ id: "a1", title: "Deep tissue massage in Malmö", slug: "dt-malmo" });
    const b = asset({
      id: "a2",
      title: "Deep tissue massage in Malmö guide",
      slug: "dt-malmo-guide",
    });
    const list = buildPublishingChecklist(a, project(), [a, b]);
    expect(item(list, "cannibalisation").blocking).toBe(false);
    expect(isPublishBlocked(a, project(), [a, b])).toBe(false);
  });
});
