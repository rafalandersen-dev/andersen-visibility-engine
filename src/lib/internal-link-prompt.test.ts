/**
 * Generation must never teach or tolerate invented internal paths (the
 * "/services" bug: every service mention linked to a path that didn't exist).
 * With a real page map the rule whitelists it verbatim; without one it forbids
 * guessing entirely.
 */
import { describe, it, expect } from "vitest";
import { internalLinkRule, promptLinkPaths, MAX_PROMPT_PATHS } from "./internal-link-prompt";
import type { Project } from "./types";

const project = (over: Partial<Project> = {}): Project =>
  ({
    id: "p1",
    name: "N",
    businessName: "Biz",
    websiteUrl: "https://synergymassage.se",
    ...over,
  }) as Project;

const withInventory = (paths: string[], over: Partial<Project> = {}) =>
  project({
    sitemapInventory: {
      paths,
      fetchedAt: "2026-07-23T00:00:00.000Z",
      urlCount: paths.length,
      sitemapCount: 1,
      truncated: false,
    },
    ...over,
  });

describe("promptLinkPaths — the model's allowed link targets", () => {
  it("combines sitemap inventory with user-approved paths, deduplicated", () => {
    const p = withInventory(["/", "/treatments", "/massage-recovery/red-light-therapy"], {
      approvedInternalPaths: ["/treatments", "/book"],
    });
    const paths = promptLinkPaths(p);
    expect(paths).toContain("/massage-recovery/red-light-therapy");
    expect(paths).toContain("/book");
    expect(paths.filter((x) => x === "/treatments")).toHaveLength(1);
  });

  it("ignores junk entries and is bounded", () => {
    const many = Array.from({ length: 200 }, (_, i) => `/page-${i}`);
    const p = withInventory([...many, "not-a-path" as string]);
    const paths = promptLinkPaths(p);
    expect(paths.length).toBeLessThanOrEqual(MAX_PROMPT_PATHS);
    expect(paths).not.toContain("not-a-path");
  });

  it("empty when the project has no inventory and no approvals", () => {
    expect(promptLinkPaths(project())).toEqual([]);
    expect(promptLinkPaths(undefined)).toEqual([]);
  });
});

describe("internalLinkRule — the prompt bullet", () => {
  it("with a page map: whitelists the real paths and forbids inventing", () => {
    const rule = internalLinkRule(
      withInventory(["/", "/treatments", "/massage-recovery/swedish-massage"]),
    );
    expect(rule).toContain("/massage-recovery/swedish-massage");
    expect(rule).toContain("/treatments");
    expect(rule).toMatch(/never invent/i);
    // The old bug: the prompt itself taught "/services" as the example. Never again.
    expect(rule).not.toContain("/services");
  });

  it("without a page map: forbids invented paths outright (names the old failure)", () => {
    const rule = internalLinkRule(project());
    expect(rule).toMatch(/do NOT invent/i);
    expect(rule).toMatch(/plain text/);
    // "/services" may appear ONLY as the named forbidden example, never as guidance.
    expect(rule).toContain(`no "/services"`);
  });
});
