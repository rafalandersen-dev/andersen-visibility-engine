/**
 * CT — draft evidence stays valid, versioned and bounded (23 October 2026).
 *
 * Live: Content read draft d8mi9sn3 through draft_read and said no version was
 * available, with the body ending mid-phrase; the SEO tool on the same draft kept
 * workspaceRevision 835 and its hash. Cause: the generic tool result clipped the
 * whole serialized JSON to 5000 bytes, cutting through strings and dropping the
 * trailing version and partial marker. These tests drive the real tool path with a
 * long, escape-heavy Unicode draft and check the FINAL evidence: valid JSON, a true
 * byte bound, the draft id and version retained, explicit body/metadata truncation,
 * and full-document SEO counts independent of the excerpt. No provider or network.
 */
import { describe, expect, it, vi } from "vitest";
import {
  runSpecialistTool,
  type SpecialistToolContext,
  type SpecialistToolDeps,
} from "./milo-specialist-tools.server";
import { draftEvidence, READER_EVIDENCE_MAX_BYTES } from "./milo-specialist-context";

const owner = "00000000-0000-4000-8000-000000000001",
  actor = "00000000-0000-4000-8000-000000000002",
  operationId = "00000000-0000-4000-8000-000000000003";
const HASH = "3e48edece258c7e822490e8895e5fcbe7cbd7814d76d96fd4b71fa829e1e76ae";
const bytes = (text: string) => new TextEncoder().encode(text).byteLength;

type Draft = Record<string, unknown> & { markdown: string };
function harness(draft: Draft) {
  const controller = new AbortController();
  const context: SpecialistToolContext = {
    actorId: actor,
    target: { ownerId: owner, projectId: "p" },
    role: "content",
    operationId,
    jobId: operationId,
    signal: controller.signal,
    beforeDispatch: vi.fn(async () => {}),
  };
  const rpc = vi.fn(async (name: string, params: Record<string, unknown>) => {
    if (name === "acquire_project_team_preview") return { data: operationId, error: null };
    if (name === "release_project_team_preview") return { data: null, error: null };
    return {
      data: {
        actorId: actor,
        ownerId: owner,
        projectId: "p",
        canEdit: true,
        draftHash: params.p_asset ? HASH : null,
        membershipRevision: 1,
        workspaceRevision: 835,
        project: { id: "p", name: "Synergy", publishSecret: "fixture-private" },
        drafts: [],
        remaining: 0,
        draft: params.p_asset
          ? {
              id: "d8mi9sn3",
              projectId: "p",
              status: "In Review",
              updatedAt: "now",
              importReceipt: "fixture-private",
              ...draft,
            }
          : null,
      },
      error: null,
    };
  });
  const deps = { rpc } as unknown as SpecialistToolDeps;
  return { context, deps, rpc };
}
type Body = { excerpt: string; complete: boolean; originalBytes: number; excerptBytes: number };
type Envelope = { content: Record<string, unknown> & { body: Body }; partial: boolean };
async function run(name: "draft_read" | "draft_seo_review", draft: Draft) {
  const h = harness(draft);
  const result = await runSpecialistTool(
    { name, assetId: "d8mi9sn3" },
    { ...h.context, role: name === "draft_read" ? "content" : "seo" },
    h.deps,
  );
  expect(result.state).toBe("completed");
  expect(result.reference).toEqual({ kind: "draft", id: "d8mi9sn3" });
  // The FINAL evidence, escaping included, is bounded and is one valid JSON object.
  expect(bytes(result.evidence)).toBeLessThanOrEqual(READER_EVIDENCE_MAX_BYTES);
  const parsed = JSON.parse(result.evidence) as Envelope;
  expect(typeof parsed.content).toBe("object");
  expect(result.evidence).not.toContain("fixture-private");
  return parsed;
}

/** A long Swedish/Polish article with quotes, backslashes, emoji, control and
 * combining characters, and headings spread far past any excerpt. */
function longDraft() {
  const paragraph = (i: number) =>
    `Avsnitt ${i}: "Återhämtning" för löpare & cyklister i Malmö — zażółć gęślą jaźń 🏃‍♀️🚴 \\ C:\\väg\\${i} \u0007 é (e\u0301) ${'\\"'.repeat(20)} Klienter med skador bör rådgöra med vårdpersonal.`;
  const sections: string[] = ["# Professionell återhämtning och massage i Malmö & Limhamn"];
  for (let i = 1; i <= 30; i++) {
    sections.push(`## Del ${i}`, paragraph(i), paragraph(i + 100));
    if (i % 3 === 0) sections.push(`### Detalj ${i}`, paragraph(i + 200));
  }
  return sections.join("\n\n");
}
const longMeta = {
  title: "Advanced Marathon and Cycling Recovery Services in Malmö",
  metaTitle: "Återhämtning för löpare och cyklister i Malmö | Synergy Massage",
  metaDescription: `Optimera din återhämtning i Malmö. ${'"\\'.repeat(600)} Normatec 🔴`,
};

describe("CT draft_read evidence", () => {
  it("keeps a long escape-heavy draft valid, bounded, versioned and explicitly partial", async () => {
    const markdown = longDraft();
    expect(bytes(markdown)).toBeGreaterThan(10000);
    const { content, partial } = await run("draft_read", { ...longMeta, markdown });
    expect(content.source).toBe("saved_draft");
    expect(content.draft).toMatchObject({
      id: "d8mi9sn3",
      status: "In Review",
      title: longMeta.title,
      metaTitle: longMeta.metaTitle,
    });
    expect(content.version).toEqual({
      workspaceRevision: 835,
      draftHash: HASH,
      observedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    const body = content.body;
    expect(body.complete).toBe(false);
    expect(body.originalBytes).toBe(bytes(markdown));
    expect(body.excerptBytes).toBe(bytes(body.excerpt));
    expect(body.excerptBytes).toBeLessThan(body.originalBytes);
    expect(body.excerptBytes).toBeGreaterThan(0);
    expect(markdown.startsWith(body.excerpt)).toBe(true);
    // The 1000-byte metadata clip is named, never silent.
    expect(content.shortenedFields).toEqual(["metaDescription"]);
    expect(partial).toBe(true);
  });

  it("returns a small draft complete and not partial", async () => {
    const markdown = "## Första\nKänd text\n### Detalj\nMer text";
    const { content, partial } = await run("draft_read", {
      ...longMeta,
      metaDescription: "Kort",
      markdown,
    });
    expect(content.body).toEqual({
      excerpt: markdown,
      complete: true,
      originalBytes: bytes(markdown),
      excerptBytes: bytes(markdown),
    });
    expect(content.shortenedFields).toEqual([]);
    expect(partial).toBe(false);
  });

  it("names every metadata field that had to shrink once the body excerpt is exhausted", async () => {
    const heavy = (n: number) => '"\\'.repeat(n);
    const { content, partial } = await run("draft_read", {
      title: heavy(500),
      metaTitle: heavy(500),
      metaDescription: heavy(2000),
      markdown: heavy(10000),
    });
    expect(content.draft).toMatchObject({ id: "d8mi9sn3" });
    expect(content.version).toMatchObject({ workspaceRevision: 835, draftHash: HASH });
    expect(content.body.complete).toBe(false);
    expect(content.body.excerptBytes).toBe(bytes(content.body.excerpt));
    expect(content.shortenedFields).toEqual(expect.arrayContaining(["metaDescription"]));
    expect(partial).toBe(true);
  });
});

describe("CT draft_seo_review evidence", () => {
  it("counts the complete saved draft, not the excerpt, and keeps its version", async () => {
    const markdown = longDraft();
    const { content, partial } = await run("draft_seo_review", { ...longMeta, markdown });
    const trimmed = markdown.trim();
    expect(content).toMatchObject({
      source: "saved_draft_structure",
      liveWebsiteChecked: false,
      rankingMeasured: false,
      draftId: "d8mi9sn3",
      workspaceRevision: 835,
      draftHash: HASH,
      countsCover: "complete_saved_draft",
      h2Count: 30,
      h3Count: 10,
      wordCount: trimmed.split(/\s+/u).length,
      metaTitleCharacters: [...longMeta.metaTitle].length,
      metaDescriptionCharacters: [...longMeta.metaDescription].length,
      hasTitle: true,
      hasBody: true,
    });
    // The excerpt alone holds far fewer headings than the counted document.
    expect((content.body.excerpt.match(/^##\s+.+/gm) ?? []).length).toBeLessThan(30);
    expect(content.body.complete).toBe(false);
    expect(content.body.originalBytes).toBe(bytes(markdown));
    expect(content.limitations).toMatch(/Counts cover the complete saved draft/);
    expect(partial).toBe(true);
  });

  it("is complete for a small draft", async () => {
    const markdown = "## A\ntext\n### B\nmore\n## C";
    const { content, partial } = await run("draft_seo_review", {
      ...longMeta,
      metaDescription: "Kort",
      markdown,
    });
    expect(content).toMatchObject({ h2Count: 2, h3Count: 1, wordCount: 8 });
    expect(content.body.complete).toBe(true);
    expect(partial).toBe(false);
  });
});

describe("CT unknown metadata", () => {
  const version = { workspaceRevision: null, draftHash: null, observedAt: "2026-10-23T08:39:58Z" };
  it("keeps absent or non-text metadata unknown (null), never empty or zero", () => {
    const draft = { id: "x", title: "Saved", markdown: "## A\ntext", metaDescription: 7 };
    const read = JSON.parse(draftEvidence("read", draft, version)) as Envelope;
    expect(read.content.draft).toEqual({
      id: "x",
      title: "Saved",
      status: null,
      metaTitle: null,
      metaDescription: null,
    });
    expect(read.content.version).toEqual(version);
    expect(read.partial).toBe(false);
    const seo = JSON.parse(draftEvidence("seo_review", draft, version)) as Envelope;
    expect(seo.content).toMatchObject({
      metaTitleCharacters: null,
      metaDescriptionCharacters: null,
      workspaceRevision: null,
      draftHash: null,
    });
  });
});
