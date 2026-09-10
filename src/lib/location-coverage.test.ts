import { describe, expect, it } from "vitest";
import { coverageSchema, emptyCoverage, validCoverageRecord } from "./location-coverage";
import { coverageRows } from "./location-coverage-selection";
import {
  selectProjectKnowledge,
  type KnowledgeRecord,
  type KnowledgeSource,
} from "./project-knowledge";
const ownerId = "00000000-0000-4000-8000-000000000001";
const scope = { ownerId, projectId: "p" };
const now = "2026-09-10T12:00:00Z";
const source: KnowledgeSource = {
  ...scope,
  id: "00000000-0000-4000-8000-000000000002",
  revision: 1,
  kind: "owner",
  label: "Owner",
  fingerprint: "a".repeat(64),
  observedAt: now,
  status: "active",
};
const value = {
  ...emptyCoverage,
  target: "Stockholm",
  name: "Example",
  pageUrl: "https://example.com/local",
};
const record: KnowledgeRecord = {
  ...scope,
  id: "00000000-0000-4000-8000-000000000003",
  sourceId: source.id,
  sourceRevision: 1,
  revision: 1,
  key: "coverage.local.one",
  category: "fact",
  appliesTo: "text",
  value: JSON.stringify(value),
  locator: "Owner statement on 10 September",
  status: "accepted",
  updatedAt: now,
  reviewedAt: now,
};
const select = (records = [record], sources = [source]) =>
  selectProjectKnowledge(sources, records, scope, "text", now);
describe("local/global coverage source and publication boundaries", () => {
  it("retains exact source references for reviewed coverage without calling it verified", () => {
    expect(select().references[0]).toMatchObject({
      recordId: record.id,
      sourceRevision: 1,
      sourceFingerprint: source.fingerprint,
    });
    expect(coverageRows([source], [record], scope, now)[0].state).toBe("reviewed");
    expect(coverageRows([source], [record], scope, now)[0].canReview).toBe(true);
    expect(coverageSchema.parse(value)).not.toHaveProperty("verified");
  });
  it.each([
    "http://example.com",
    "https://user:pass@example.com",
    "https://example.com?token=x",
    "https://example.com#secret",
    "javascript:alert(1)",
  ])("rejects unsafe evidence URLs %s", (pageUrl) => {
    expect(coverageSchema.safeParse({ ...value, pageUrl }).success).toBe(false);
  });
  it("rejects invented verification, mismatched kinds and oversized entries", () => {
    expect(coverageSchema.safeParse({ ...value, verified: true }).success).toBe(false);
    expect(validCoverageRecord({ ...record, key: "coverage.global.one" })).toBe(false);
    expect(
      coverageSchema.safeParse({
        ...value,
        pageUrl: "https://example.com/" + "a".repeat(450),
        citationUrl: "https://example.com/" + "b".repeat(450),
        reviewUrl: "https://example.com/" + "c".repeat(450),
        gbpUrl: "https://example.com/" + "d".repeat(450),
      }).success,
    ).toBe(false);
  });
  it.each([
    { status: "revoked" as const },
    { revision: 2 },
    { observedAt: "2027-01-01T00:00:00Z" },
  ])("removes coverage when source is unavailable %#", (patch) => {
    expect(select([record], [{ ...source, ...patch }]).records).toEqual([]);
    expect(coverageRows([{ ...source, ...patch }], [record], scope, now)[0].canReview).toBe(false);
    expect(coverageRows([{ ...source, ...patch }], [record], scope, now)[0].state).toBe(
      "unavailable",
    );
  });
  it.each([
    { status: "proposed" as const },
    { validUntil: now },
    { reviewedAt: "2027-01-01T00:00:00Z" },
  ])("does not promote unavailable claims %#", (patch) =>
    expect(select([{ ...record, ...patch }]).records).toEqual([]),
  );
  it("excludes another project and owner in both UI and generation", () => {
    expect(coverageRows([source], [{ ...record, projectId: "other" }], scope, now)).toEqual([]);
    expect(select([{ ...record, ownerId: source.id }]).records).toEqual([]);
  });
  it("holds conflicting NAP across different service records in UI AND generation", () => {
    const other = {
      ...record,
      id: source.id,
      key: "coverage.local.two",
      value: JSON.stringify({
        ...value,
        target: " STOCKHOLM ",
        service: "Other service",
        name: "Different company",
      }),
    };
    expect(select([record, other]).records).toEqual([]);
    expect(select([record, other]).conflicts).toEqual([record.key, other.key]);
    expect(coverageRows([source], [record, other], scope, now).map((r) => r.state)).toEqual([
      "conflict",
      "conflict",
    ]);
  });
  it("does not mistake missing fields or different service URLs for conflicting NAP", () => {
    const other = {
      ...record,
      id: source.id,
      key: "coverage.local.two",
      value: JSON.stringify({
        ...value,
        name: "",
        service: "Other service",
        pageUrl: "https://example.com/other",
      }),
    };
    expect(select([record, other]).records).toHaveLength(2);
  });
  it("holds conflicting international URLs for the same market and language", () => {
    const global = {
      ...record,
      key: "coverage.global.one",
      value: JSON.stringify({ ...value, kind: "global", language: "sv" }),
    };
    const other = {
      ...global,
      id: source.id,
      key: "coverage.global.two",
      value: JSON.stringify({
        ...value,
        kind: "global",
        language: "sv",
        pageUrl: "https://example.com/different",
      }),
    };
    expect(select([global, other]).records).toEqual([]);
  });
  it("ignores malformed legacy coverage in generation but keeps it visible for repair", () => {
    const invalid = { ...record, value: "not-json" };
    expect(select([invalid]).records).toEqual([]);
    expect(coverageRows([source], [invalid], scope, now)[0].state).toBe("invalid");
  });
});

it("does not offer an ineffective review for elapsed expiry", () => {
  expect(coverageRows([source], [{ ...record, validUntil: now }], scope, now)[0].canReview).toBe(
    false,
  );
  expect(coverageRows([source], [{ ...record, status: "proposed" }], scope, now)[0].canReview).toBe(
    true,
  );
});
