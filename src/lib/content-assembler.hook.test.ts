/**
 * Hook composition through the canonical assembler (Article Studio 3.0 / P1.2A).
 *
 * Proves the composition contract: the hook is emitted exactly once, before the
 * TL;DR, from `asset.hook` only; the ONE assembler output is what preview and
 * publish share (parity); and repeated assembly is idempotent (no duplication).
 */
import { describe, it, expect } from "vitest";
import { assembleContentAsset, composeCanonicalMarkdown } from "./content-assembler";
import { markdownToHtml } from "./markdown";
import type { ArticleHook, ContentAsset, Project } from "./types";

const project = (over: Partial<Project> = {}): Project =>
  ({ id: "p1", name: "Synergy", businessName: "Synergy Massage", ...over }) as Project;

const hook = (text: string): ArticleHook =>
  ({
    id: "h1",
    text,
    type: "question",
    provenance: "user-edited",
    approval: "approved",
  }) as ArticleHook;

const asset = (over: Partial<ContentAsset> = {}): ContentAsset =>
  ({
    id: "a1",
    projectId: "p1",
    title: "Deep tissue",
    slug: "deep-tissue",
    markdown: "",
    ...over,
  }) as ContentAsset;

const HOOK = "Sore muscles slowing you down?";
const occurrences = (s: string, sub: string) => s.split(sub).length - 1;

describe("hook composition (T3, T4, T5, T22-composition)", () => {
  it("composes the hook exactly once in markdown and html (T3)", () => {
    const a = asset({ hook: hook(HOOK), markdown: "## Body\n\nText." });
    const out = assembleContentAsset(a, project());
    expect(occurrences(out.markdown, HOOK)).toBe(1);
    expect(occurrences(out.html, HOOK)).toBe(1);
  });

  it("places the hook before the TL;DR (T4)", () => {
    const a = asset({ hook: hook(HOOK), tldr: "Quick summary.", markdown: "## Body\n\nText." });
    const md = composeCanonicalMarkdown(a, project());
    expect(md.indexOf(HOOK)).toBeGreaterThanOrEqual(0);
    expect(md.indexOf(HOOK)).toBeLessThan(md.indexOf("## TL;DR"));
  });

  it("preview/publish parity: one assembler output, html === markdownToHtml(markdown) (T5)", () => {
    const a = asset({ hook: hook(HOOK), markdown: "## Body\n\nText." });
    const first = assembleContentAsset(a, project());
    const second = assembleContentAsset(a, project());
    expect(second.markdown).toBe(first.markdown);
    expect(second.html).toBe(first.html);
    expect(first.html).toBe(markdownToHtml(first.markdown, { allowedImageUrls: new Set() }));
  });

  it("repeated composition is idempotent — the hook never duplicates (T22)", () => {
    const a = asset({ hook: hook(HOOK), markdown: "## Body\n\nText." });
    const once = composeCanonicalMarkdown(a, project());
    const twice = composeCanonicalMarkdown(a, project());
    expect(twice).toBe(once);
    expect(occurrences(twice, HOOK)).toBe(1);
  });

  it("no hook → body is unchanged (legacy parity preserved)", () => {
    const body = "# Deep tissue\n\nBody text only.";
    const a = asset({ markdown: body });
    expect(composeCanonicalMarkdown(a, project())).toBe(body);
  });
});
