import { describe, it, expect, vi } from "vitest";
import {
  changedBrandOwnerFields,
  mergeOwnerBrandEdits,
  extractLabelledBrandProposals,
  filterBrandKnowledge,
  resolveKnowledgeBrand,
} from "./knowledge-brand";
import {
  selectProjectKnowledge,
  type KnowledgeRecord,
  type KnowledgeSource,
} from "./project-knowledge";
import { loadProjectKnowledgeContext } from "./project-knowledge.server";
const scope = { ownerId: "00000000-0000-4000-8000-000000000001", projectId: "p" };
const now = "2026-09-09T10:00:00Z";
const source: KnowledgeSource = {
  ...scope,
  id: "00000000-0000-4000-8000-000000000002",
  revision: 1,
  kind: "document",
  label: "Brand",
  fingerprint: "a".repeat(64),
  observedAt: now,
  status: "active",
};
const record: KnowledgeRecord = {
  ...scope,
  id: "00000000-0000-4000-8000-000000000003",
  revision: 1,
  sourceId: source.id,
  sourceRevision: 1,
  key: "brand.voice.tone",
  category: "voice",
  appliesTo: "both",
  value: "Calm",
  locator: "Page 2",
  status: "accepted",
  updatedAt: now,
  reviewedAt: now,
};
const select = (sources = [source], records = [record]) =>
  selectProjectKnowledge(sources, records, scope, "text", now);
describe("canonical source-backed brand values", () => {
  it("maps explicit multilingual text labels and keeps source locators without inferring visual rules", () => {
    const proposals = extractLabelledBrandProposals([
      {
        locator: "Page 2",
        text: "Tone: Calm\nWords to avoid: miracle; guaranteed\nColors: blue\nThis paragraph mentions tone: should not match",
      },
      {
        locator: "Paragraph 4",
        text: "Styl pisania: Krótko\nSkrivestil: Enkel\nOrd att använda: tydlig",
      },
    ]);
    expect(proposals.map((p) => p.key)).toEqual([
      "brand.voice.tone",
      "brand.voice.wordsToAvoid",
      "brand.voice.styleNotes",
      "brand.voice.styleNotes",
      "brand.voice.wordsToUse",
    ]);
    expect(proposals[0]).toMatchObject({ locator: "Page 2", excerpt: "Tone: Calm", value: "Calm" });
    expect(
      extractLabelledBrandProposals([{ locator: "P1", text: `Tone: ${"x".repeat(501)}` }]),
    ).toEqual([]);
  });
  it("deduplicates exact passages and caps review candidates", () => {
    const segments = Array.from({ length: 50 }, (_, index) => ({
      locator: `Page ${index}`,
      text: `Tone: Tone ${index}\nTone: Tone ${index}`,
    }));
    expect(extractLabelledBrandProposals(segments)).toHaveLength(30);
  });
  it("fills empty canonical fields while preserving unrelated settings without mutating storage", () => {
    const profile = { brandIntelligence: { voice: { wordsToAvoid: ["miracle"] } } };
    const snapshot = structuredClone(profile);
    expect(
      resolveKnowledgeBrand(profile, filterBrandKnowledge(select(), profile).records, now),
    ).toMatchObject({ voice: { tone: "Calm", wordsToAvoid: ["miracle"] } });
    expect(profile).toEqual(snapshot);
  });
  it.each([
    { brandIntelligence: { voice: { tone: "Owner choice" } } },
    { brandOwnerFields: ["voice.tone"] },
    { toneOfVoice: "Owner's existing tone" },
  ])("holds source values when an owner value or explicit clear takes precedence %#", (profile) => {
    expect(filterBrandKnowledge(select(), profile)).toMatchObject({
      records: [],
      references: [],
      omitted: 1,
    });
  });
  it("removes sourced values after revoke, replace, forget, expiry, rejection or conflicting acceptance", () => {
    const states = [
      select([{ ...source, status: "revoked" }]),
      select([{ ...source, revision: 2 }]),
      select([]),
      select([source], [{ ...record, status: "rejected" }]),
      select([source], [{ ...record, validUntil: now }]),
      select(
        [source],
        [record, { ...record, id: "00000000-0000-4000-8000-000000000004", value: "Loud" }],
      ),
    ];
    for (const selection of states)
      expect(
        resolveKnowledgeBrand({}, filterBrandKnowledge(selection, {}).records, now),
      ).toBeUndefined();
    expect(
      resolveKnowledgeBrand({ brandIntelligence: { voice: { tone: "Owner choice" } } }, [], now)
        ?.voice?.tone,
    ).toBe("Owner choice");
  });
  it("retains owner-clear markers and tracks changes in other canonical groups", () => {
    expect(
      changedBrandOwnerFields(
        { voice: { tone: "Old" }, ctas: { primaryCtaLabel: "Buy" } },
        { voice: {}, ctas: { primaryCtaLabel: "Book" } },
        ["voice.wordsToAvoid"],
      ),
    ).toEqual(["ctas.primaryCtaLabel", "voice.tone", "voice.wordsToAvoid"]);
  });
  it("does not claim untouched empty fields and merges only owner form changes", () => {
    expect(changedBrandOwnerFields(undefined, { voice: { tone: "Calm", wordsToUse: [] } })).toEqual(
      ["voice.tone"],
    );
    const baseline = { voice: { tone: "Calm" } };
    const edited = { voice: { tone: "Direct" } };
    const latest = { voice: { tone: "Calm", wordsToAvoid: ["miracle"] } };
    expect(mergeOwnerBrandEdits(baseline, edited, latest, now)).toMatchObject({
      voice: { tone: "Direct", wordsToAvoid: ["miracle"] },
    });
    expect(() =>
      mergeOwnerBrandEdits(baseline, edited, { voice: { tone: "Another owner's edit" } }, now),
    ).toThrow("brand_profile_changed");
  });
  it("server lookup uses authenticated canonical settings and no retained source copy", async () => {
    const rpc = vi.fn(async (name: string) => ({
      data:
        name === "read_project_knowledge"
          ? { sources: [source], records: [record] }
          : { brandIntelligence: null, brandOwnerFields: [], toneOfVoice: "" },
      error: null,
    }));
    const result = await loadProjectKnowledgeContext(scope, "text", now, rpc);
    expect(result.brandIntelligence?.voice?.tone).toBe("Calm");
    expect(result.references[0]).toMatchObject({
      recordId: record.id,
      sourceFingerprint: source.fingerprint,
    });
    expect(rpc).toHaveBeenLastCalledWith("read_project_knowledge_brand", {
      p_user: scope.ownerId,
      p_project: "p",
    });
    rpc.mockImplementation(
      async (name) =>
        ({
          data:
            name === "read_project_knowledge"
              ? { sources: [{ ...source, status: "revoked" }], records: [record] }
              : null,
          error: null,
        }) as never,
    );
    expect((await loadProjectKnowledgeContext(scope, "text", now, rpc)).references).toEqual([]);
  });
  it("refuses unknown canonical settings and excludes values that did not fit the prompt", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { sources: [source], records: [record] }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    await expect(loadProjectKnowledgeContext(scope, "text", now, rpc)).rejects.toThrow(
      "could not be confirmed",
    );
    rpc
      .mockResolvedValueOnce({
        data: { sources: [source], records: [{ ...record, value: "x".repeat(500) }] },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { brandIntelligence: null, brandOwnerFields: [], toneOfVoice: "" },
        error: null,
      });
    const result = await loadProjectKnowledgeContext(scope, "visual", now, rpc, 512);
    expect(result.references).toEqual([]);
    expect(result.brandIntelligence).toBeUndefined();
  });
});
