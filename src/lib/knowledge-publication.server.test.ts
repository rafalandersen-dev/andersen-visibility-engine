import { assertAssetSourcesCurrent, sourceIssuesForAsset } from "./source-publication.server";
import { describe, it, expect, vi } from "vitest";
import {
  evaluateAssetKnowledge,
  knowledgeIssuesForAsset,
  readOutputKnowledgeDependencies,
} from "./knowledge-publication.server";
import type { ContentAsset } from "./types";
import type { KnowledgeRecord, KnowledgeSource } from "./project-knowledge";
const owner = "00000000-0000-4000-8000-000000000001";
const source: KnowledgeSource = {
  ownerId: owner,
  projectId: "p",
  id: "00000000-0000-4000-8000-000000000002",
  revision: 1,
  kind: "document",
  label: "Brand",
  fingerprint: "a".repeat(64),
  observedAt: "2026-09-01T00:00:00Z",
  status: "active",
};
const record: KnowledgeRecord = {
  ownerId: owner,
  projectId: "p",
  id: "00000000-0000-4000-8000-000000000003",
  sourceId: source.id,
  sourceRevision: 1,
  revision: 1,
  key: "visual.product",
  category: "visualStyle",
  appliesTo: "both",
  value: "Blue glass",
  locator: "Page 1",
  status: "accepted",
  reviewedAt: source.observedAt,
  updatedAt: source.observedAt,
};
const ref = {
  recordId: record.id,
  recordRevision: 1,
  sourceId: source.id,
  sourceRevision: 1,
  sourceFingerprint: source.fingerprint,
};
const asset = {
  id: "a",
  projectId: "p",
  knowledgeReferences: [ref],
  images: [],
  markdown: "Owner text",
} as unknown as ContentAsset;
const now = "2026-09-10T23:00:00Z";
const state = () => ({ sources: [structuredClone(source)], records: [structuredClone(record)] });
describe("exact output knowledge publication", () => {
  it("allows unchanged reviewed references and leaves owner text untouched", () => {
    const before = structuredClone(asset);
    expect(evaluateAssetKnowledge(owner, asset, state(), [], now)).toEqual([]);
    expect(asset).toEqual(before);
  });
  it.each([
    "revoked",
    "expired",
    "disputed",
    "replaced",
    "fingerprint",
    "record-version",
    "conflict",
    "forgotten",
    "other-owner",
    "other-project",
    "wrong-medium",
  ])("holds %s", (reason) => {
    const s = state();
    if (reason === "revoked") s.sources[0].status = "revoked";
    if (reason === "expired") s.records[0].validUntil = now;
    if (reason === "disputed") s.records[0].status = "disputed";
    if (reason === "replaced") s.sources[0].revision = 2;
    if (reason === "fingerprint") s.sources[0].fingerprint = "b".repeat(64);
    if (reason === "record-version") s.records[0].revision = 2;
    if (reason === "conflict")
      s.records.push({ ...record, id: "00000000-0000-4000-8000-000000000004", value: "Red" });
    if (reason === "forgotten") s.records = [];
    if (reason === "other-owner") s.records[0].ownerId = "00000000-0000-4000-8000-000000000009";
    if (reason === "other-project") s.records[0].projectId = "other";
    if (reason === "wrong-medium") s.records[0].appliesTo = "visual";
    expect(evaluateAssetKnowledge(owner, asset, s, [], now)).toHaveLength(1);
  });
  it("checks immutable article references despite omitted browser fields", () => {
    const registry = [
      {
        assetId: "a",
        outputId: "a",
        kind: "content" as const,
        references: [ref],
        forgotten: false,
      },
    ];
    expect(
      evaluateAssetKnowledge(
        owner,
        { ...asset, knowledgeReferences: [] },
        { sources: [], records: [] },
        registry,
        now,
      ),
    ).toHaveLength(1);
  });
  it("checks retained image references; removing another image cannot clear their hold", () => {
    const imageAsset = {
      ...asset,
      knowledgeReferences: [],
      images: [
        {
          id: "im",
          concept: "Product",
          alt: "Blue glass",
          placement: "inline",
          status: "proposed",
        },
      ],
    } as ContentAsset;
    const registry = [
      { assetId: "a", outputId: "im", kind: "image" as const, references: [ref], forgotten: false },
    ];
    expect(
      evaluateAssetKnowledge(owner, imageAsset, { sources: [], records: [] }, registry, now),
    ).toHaveLength(1);
    expect(
      evaluateAssetKnowledge(
        owner,
        { ...imageAsset, images: [] },
        { sources: [], records: [] },
        registry,
        now,
      ),
    ).toEqual([]);
  });
  it("checks forgotten markers without exposing deleted identifiers", () => {
    const issues = evaluateAssetKnowledge(
      owner,
      { ...asset, knowledgeReferences: [] },
      state(),
      [{ assetId: "a", outputId: "a", kind: "content", references: [], forgotten: true }],
      now,
    );
    expect(issues[0]).toMatchObject({ key: "forgotten-knowledge", sourceId: "" });
  });
  it("holds known future expiry at planned publication time", () => {
    const s = state();
    s.records[0].validUntil = "2026-09-11T00:00:00Z";
    expect(evaluateAssetKnowledge(owner, asset, s, [], now)).toEqual([]);
    expect(evaluateAssetKnowledge(owner, asset, s, [], "2026-09-12T00:00:00Z")).toHaveLength(1);
  });
  it("reads service provenance even when all editable references are absent", async () => {
    const rpc = vi.fn(async (name: string) => ({
      error: null,
      data:
        name === "read_output_knowledge_dependencies"
          ? [{ assetId: "a", outputId: "a", kind: "content", references: [ref], forgotten: false }]
          : { sources: [], records: [] },
    }));
    expect(
      await knowledgeIssuesForAsset(owner, { ...asset, knowledgeReferences: [] }, now, rpc),
    ).toHaveLength(1);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      "read_output_knowledge_dependencies",
      "read_project_knowledge",
    ]);
  });
  it("rejects off-target and duplicate registry rows, errors and invalid responses", async () => {
    const row = {
      assetId: "a",
      outputId: "a",
      kind: "content",
      references: [ref],
      forgotten: false,
    };
    for (const data of [[{ ...row, assetId: "elsewhere" }], [row, row], null]) {
      await expect(
        readOutputKnowledgeDependencies(owner, "p", ["a"], async () => ({ data, error: null })),
      ).rejects.toThrow();
    }
    await expect(
      readOutputKnowledgeDependencies(owner, "p", ["a"], async () => ({ data: [], error: {} })),
    ).rejects.toThrow();
  });
});

describe("shared manual and scheduled publication gate", () => {
  it("holds a stripped article on withdrawn knowledge before any source refresh", async () => {
    const rpc = vi.fn(async (name: string) => ({
      error: null,
      data:
        name === "read_output_knowledge_dependencies"
          ? [{ assetId: "a", outputId: "a", kind: "content", references: [ref], forgotten: false }]
          : name === "read_project_knowledge"
            ? { sources: [], records: [] }
            : [],
    }));
    const stripped = { ...asset, knowledgeReferences: [] };
    await expect(assertAssetSourcesCurrent(owner, stripped, rpc)).rejects.toThrow(
      "Source facts need review",
    );
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      "read_output_source_dependencies",
      "read_output_knowledge_dependencies",
      "read_project_knowledge",
    ]);
    expect(await sourceIssuesForAsset(owner, stripped, now, rpc)).toMatchObject([
      { evidence: "knowledge", reason: "unavailable" },
    ]);
  });
  it("allows unchanged knowledge through the same gate without provider work", async () => {
    const rpc = vi.fn(async (name: string) => ({
      error: null,
      data: name === "read_project_knowledge" ? state() : [],
    }));
    await expect(assertAssetSourcesCurrent(owner, asset, rpc)).resolves.toBeUndefined();
    expect(rpc.mock.calls.some((c) => c[0].includes("refresh"))).toBe(false);
  });
});
