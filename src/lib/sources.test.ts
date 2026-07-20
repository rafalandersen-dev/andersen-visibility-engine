/**
 * Grounded sources (Article Studio 2.0 / P1.1 C).
 *
 * T2 — verified sources render as real, resolvable links in the assembled body.
 * T3 — an unreachable/unsupported source is labelled, excluded from citations,
 *      never fabricated, never silently dropped (stays on the asset).
 */
import { describe, it, expect } from "vitest";
import {
  isValidHttpSourceUrl,
  citableSources,
  nonCitableSources,
  sourcesBlockMarkdown,
  ymylClaimsNeedingReview,
  normalizeSourceUrl,
  dedupeSources,
  selectSourcesToValidate,
  classifyReachability,
  SOURCE_MAX_PER_ASSET,
  SOURCE_MAX_PER_RUN,
  SOURCE_RECHECK_COOLDOWN_MS,
} from "./sources";
import { assembleContentAsset } from "./content-assembler";
import type { ContentAsset, ContentSource, Project } from "./types";

const src = (over: Partial<ContentSource>): ContentSource =>
  ({ url: "https://example.com/a", status: "verified", ...over }) as ContentSource;

const project = (): Project => ({ id: "p1", name: "N", businessName: "Biz" }) as Project;
const asset = (over: Partial<ContentAsset> = {}): ContentAsset =>
  ({
    id: "a1",
    projectId: "p1",
    title: "T",
    slug: "t",
    markdown: "Body.",
    ...over,
  }) as ContentAsset;

describe("isValidHttpSourceUrl — SSRF / scheme guard", () => {
  it("accepts public http/https", () => {
    expect(isValidHttpSourceUrl("https://nih.gov/study")).toBe(true);
    expect(isValidHttpSourceUrl("http://example.org")).toBe(true);
  });
  it("rejects non-http schemes and internal/loopback/metadata hosts", () => {
    for (const bad of [
      "ftp://example.com",
      "javascript:alert(1)",
      "http://localhost/x",
      "http://127.0.0.1/x",
      "http://10.0.0.5/x",
      "http://192.168.1.1/x",
      "http://169.254.169.254/latest/meta-data",
      "not a url",
    ]) {
      expect(isValidHttpSourceUrl(bad)).toBe(false);
    }
  });
});

describe("citable vs non-citable partition", () => {
  const sources = [
    src({ url: "https://a.com", status: "verified" }),
    src({ url: "https://b.com", status: "unreachable" }),
    src({ url: "https://c.com", status: "unsupported" }),
    src({ url: "https://d.com", status: "unchecked" }),
    src({ url: "http://127.0.0.1", status: "verified" }), // verified but unsafe URL
  ];
  it("only verified + URL-safe sources are citable", () => {
    expect(citableSources(sources).map((s) => s.url)).toEqual(["https://a.com"]);
  });
  it("everything else is retained as non-citable (never dropped) — T3", () => {
    expect(nonCitableSources(sources).map((s) => s.url)).toEqual([
      "https://b.com",
      "https://c.com",
      "https://d.com",
      "http://127.0.0.1",
    ]);
  });
});

describe("sources block composition — T2 / T3", () => {
  it("renders verified sources as markdown links, using the title when present", () => {
    const md = sourcesBlockMarkdown([
      src({ url: "https://nih.gov/s", title: "NIH study", status: "verified" }),
    ]);
    expect(md).toContain("## Sources");
    expect(md).toContain("[NIH study](https://nih.gov/s)");
  });
  it("emits nothing when there are no citable sources", () => {
    expect(sourcesBlockMarkdown([src({ status: "unreachable" })])).toBe("");
    expect(sourcesBlockMarkdown([])).toBe("");
    expect(sourcesBlockMarkdown(undefined)).toBe("");
  });
});

describe("assembler composes citable sources as active links; excludes the rest (T2/T3)", () => {
  it("verified → active <a>; unreachable/unsupported → not published, not fabricated", () => {
    const a = asset({
      markdown: "Massage helps recovery.",
      sources: [
        src({ url: "https://nih.gov/verified", title: "NIH", status: "verified" }),
        src({ url: "https://dead.example/gone", title: "Dead", status: "unreachable" }),
        src({ url: "https://loads.example/off", title: "Off-topic", status: "unsupported" }),
      ],
    });
    const html = assembleContentAsset(a, project()).html;
    expect(html).toContain('<a href="https://nih.gov/verified">NIH</a>');
    expect(html).not.toContain("dead.example");
    expect(html).not.toContain("loads.example");
    expect(html).not.toContain("Dead");
    expect(html).not.toContain("Off-topic");
  });

  it("an asset with no sources composes byte-identically (parity preserved)", () => {
    const a = asset({ markdown: "Just a body." });
    expect(assembleContentAsset(a, project()).markdown).toBe("Just a body.");
  });
});

describe("YMYL claims needing review (C25)", () => {
  it("flags ymyl sources that are not yet verified", () => {
    const needing = ymylClaimsNeedingReview([
      src({ url: "https://a", ymyl: true, status: "unchecked" }),
      src({ url: "https://b", ymyl: true, status: "verified" }),
      src({ url: "https://c", ymyl: false, status: "unchecked" }),
    ]);
    expect(needing.map((s) => s.url)).toEqual(["https://a"]);
  });
});

describe("abuse controls (C follow-up)", () => {
  it("normalizeSourceUrl drops the fragment and a trailing slash", () => {
    expect(normalizeSourceUrl("https://a.com/x/#frag")).toBe("https://a.com/x");
    expect(normalizeSourceUrl("https://a.com/")).toBe("https://a.com/");
    expect(normalizeSourceUrl("  https://a.com/x  ")).toBe("https://a.com/x");
  });

  it("dedupeSources removes duplicate URLs and caps per asset", () => {
    const dup = [src({ url: "https://a.com/x" }), src({ url: "https://a.com/x/#y" })];
    expect(dedupeSources(dup)).toHaveLength(1);
    const many = Array.from({ length: SOURCE_MAX_PER_ASSET + 5 }, (_, i) =>
      src({ url: `https://a.com/${i}` }),
    );
    expect(dedupeSources(many)).toHaveLength(SOURCE_MAX_PER_ASSET);
  });

  it("selectSourcesToValidate skips unsupported, honours the cooldown, caps the run", () => {
    const now = 1_000_000_000_000;
    const recent = new Date(now - 1000).toISOString();
    const old = new Date(now - SOURCE_RECHECK_COOLDOWN_MS - 1).toISOString();
    const chosen = selectSourcesToValidate(
      [
        src({ url: "https://a.com/unsupported", status: "unsupported" }),
        src({ url: "https://a.com/recent", status: "unreachable", checkedAt: recent }),
        src({ url: "https://a.com/stale", status: "unreachable", checkedAt: old }),
        src({ url: "https://a.com/new", status: "unchecked" }),
      ],
      now,
    );
    expect(chosen.map((s) => s.url).sort()).toEqual(["https://a.com/new", "https://a.com/stale"]);
    // force overrides the cooldown but never revives an "unsupported" verdict.
    const forced = selectSourcesToValidate(
      [src({ url: "https://a.com/recent", status: "verified", checkedAt: recent })],
      now,
      true,
    );
    expect(forced).toHaveLength(1);
    const capped = selectSourcesToValidate(
      Array.from({ length: SOURCE_MAX_PER_RUN + 8 }, (_, i) =>
        src({ url: `https://a.com/${i}`, status: "unchecked" }),
      ),
      now,
    );
    expect(capped).toHaveLength(SOURCE_MAX_PER_RUN);
  });

  it("classifyReachability never counts a failure as verified; keeps an explicit note", () => {
    expect(classifyReachability({ kind: "timeout" })).toEqual({
      status: "unreachable",
      note: "timeout",
    });
    expect(classifyReachability({ kind: "blocked" })).toEqual({
      status: "unreachable",
      note: "blocked",
    });
    expect(classifyReachability({ ok: true, status: 200 })).toEqual({
      status: "verified",
      note: "ok",
    });
    expect(classifyReachability({ ok: false, status: 404 })).toEqual({
      status: "unreachable",
      note: "http_404",
    });
  });
});
