/**
 * Author & E-E-A-T (Article Studio 2.0 / P1.1 F).
 *
 * T13 — author entity + author JSON-LD present and consistent; the visible byline
 * matches the schema. Plus: never invented, the YMYL author gate, and NOT
 * requiring credentials for ordinary non-medical content.
 */
import { describe, it, expect } from "vitest";
import {
  isAuthorResolved,
  authorRequiredUnresolved,
  authorBlockMarkdown,
  authorSchemaInput,
} from "./author";
import { assembleContentAsset, composeCanonicalMarkdown } from "./content-assembler";
import type { ContentAsset, ContentAuthor, Project } from "./types";

const author = (over: Partial<ContentAuthor> = {}): ContentAuthor => ({
  name: "Dr Lena Vy",
  ...over,
});
const project = (): Project => ({ id: "p1", name: "N", businessName: "Synergy" }) as Project;
const asset = (over: Partial<ContentAsset> = {}): ContentAsset =>
  ({
    id: "a1",
    projectId: "p1",
    title: "T",
    slug: "t",
    markdown: "Body.",
    ...over,
  }) as ContentAsset;

describe("isAuthorResolved", () => {
  it("needs a name plus at least one identity/qualification signal", () => {
    expect(isAuthorResolved(author({ bio: "20 years in sports therapy" }))).toBe(true);
    expect(isAuthorResolved(author({ url: "https://clinic.se/lena" }))).toBe(true);
    expect(isAuthorResolved(author())).toBe(false); // bare name
    expect(isAuthorResolved(undefined)).toBe(false);
  });
});

describe("authorRequiredUnresolved — YMYL gate, but not for ordinary content", () => {
  it("YMYL + unresolved author → gate unmet", () => {
    expect(authorRequiredUnresolved(asset({ author: author() }), true)).toBe(true);
  });
  it("YMYL + resolved author → gate met", () => {
    expect(
      authorRequiredUnresolved(asset({ author: author({ credentials: "PT, MSc" }) }), true),
    ).toBe(false);
  });
  it("non-YMYL never requires an author (no clinical credentials for ordinary posts)", () => {
    expect(authorRequiredUnresolved(asset({}), false)).toBe(false);
    expect(authorRequiredUnresolved(asset({ author: author() }), false)).toBe(false);
  });
});

describe("authorBlockMarkdown — visible byline, nothing invented", () => {
  it("renders name, role/credentials and bio; links the name when a URL is given", () => {
    const md = authorBlockMarkdown(
      author({
        role: "Lead therapist",
        credentials: "PT, MSc",
        bio: "20 years experience.",
        url: "https://clinic.se/lena",
      }),
    );
    expect(md).toContain("## About the author");
    expect(md).toContain("[Dr Lena Vy](https://clinic.se/lena)");
    expect(md).toContain("Lead therapist, PT, MSc");
    expect(md).toContain("20 years experience.");
  });
  it("emits nothing without a name", () => {
    expect(authorBlockMarkdown(undefined)).toBe("");
    expect(authorBlockMarkdown({ name: "  " } as ContentAuthor)).toBe("");
  });
});

describe("assembler — author section + consistent Person JSON-LD (T13)", () => {
  it("composes the byline and emits a matching Person author in JSON-LD", () => {
    const a = asset({
      markdown: "Massage helps recovery.",
      author: author({
        credentials: "PT",
        url: "https://clinic.se/lena",
        sameAs: ["https://linkedin.com/in/lena"],
      }),
    });
    const out = assembleContentAsset(a, project());
    expect(out.markdown).toContain("## About the author");
    expect(out.html).toContain("About the author");
    const article = out.jsonLd.find((o) => o["@type"] === "Article");
    expect(article?.author).toEqual({
      "@type": "Person",
      name: "Dr Lena Vy",
      url: "https://clinic.se/lena",
      sameAs: ["https://linkedin.com/in/lena"],
    });
  });

  it("falls back to the Organization author when no author is set", () => {
    const article = assembleContentAsset(asset({ markdown: "x" }), project()).jsonLd.find(
      (o) => o["@type"] === "Article",
    );
    expect((article?.author as Record<string, unknown>)["@type"]).toBe("Organization");
  });

  it("does not duplicate an author section already in the body", () => {
    const a = asset({
      markdown: "Body.\n\n## About the author\n\n**Existing**",
      author: author({ bio: "new bio" }),
    });
    const md = composeCanonicalMarkdown(a, project());
    expect((md.match(/^##\s+About the author/gim) || []).length).toBe(1);
    expect(md).not.toContain("new bio");
  });

  it("authorSchemaInput returns undefined for a nameless author", () => {
    expect(authorSchemaInput(undefined)).toBeUndefined();
    expect(authorSchemaInput({ name: " " } as ContentAuthor)).toBeUndefined();
  });
});
