import { describe, expect, it } from "vitest";
import {
  correctionDraftFrom,
  factChains,
  factDraftToRecord,
  factErrorKey,
  newFactDraft,
  normalizeInstant,
  validAt,
} from "./citation-business-fact-ui";
import type { CitationBusinessFactSummary } from "./citation-business-fact";

const owner = "00000000-0000-4000-8000-000000000001";
const FACT = "a1000000-0000-4000-8000-000000000001";
const row = (version: number, value: string, validFrom: string): CitationBusinessFactSummary => ({
  id: `b100000${version}-0000-4000-8000-000000000001`,
  version,
  supersedesId: version > 1 ? `b100000${version - 1}-0000-4000-8000-000000000001` : null,
  predecessorDeleted: false,
  createdAt: `2026-0${version}-01T00:00:00Z`,
  record: {
    factId: FACT,
    kind: "price",
    value,
    confirmedBy: owner,
    confirmedAt: "2026-01-01T00:00:00Z",
    validFrom,
    validUntil: null,
  },
});

describe("fact drafts → exact business-fact records", () => {
  it("builds a valid record with the owner as confirmer and normalized validity instants", () => {
    const d = {
      ...newFactDraft(FACT),
      value: "500 SEK / 60 min",
      validFrom: "2026-01-01",
      validUntil: "2026-06-30T12:00",
    };
    const out = factDraftToRecord(d, owner, "2026-09-26T10:00:00Z");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.fact).toMatchObject({
      factId: FACT,
      kind: "price",
      confirmedBy: owner,
      validFrom: "2026-01-01T00:00:00Z",
      validUntil: "2026-06-30T12:00:00Z",
    });
  });
  it("names the issues: empty value, bad instants, reversed order, sub-microsecond precision", () => {
    const base = newFactDraft(FACT);
    expect(factDraftToRecord({ ...base, validFrom: "2026-01-01" }, owner, "x").ok).toBe(false);
    const bad = factDraftToRecord(
      { ...base, value: "v", validFrom: "yesterday" },
      owner,
      "2026-09-26T10:00:00Z",
    );
    expect(bad.ok ? [] : bad.issues).toEqual(["validFrom"]);
    const order = factDraftToRecord(
      { ...base, value: "v", validFrom: "2026-02-01", validUntil: "2026-01-01" },
      owner,
      "2026-09-26T10:00:00Z",
    );
    expect(order.ok ? [] : order.issues).toEqual(["order"]);
    const precise = factDraftToRecord(
      { ...base, value: "v", validFrom: "2026-01-01T00:00:00.1234567Z" },
      owner,
      "2026-09-26T10:00:00Z",
    );
    expect(precise.ok ? [] : precise.issues).toEqual(["precision"]);
    expect(normalizeInstant("2026-01-01T00:00:00.123456Z")).toBe("2026-01-01T00:00:00.123456Z");
  });
  it("a correction keeps the logical id, prefills the value and pins the inspected head ROW (version + id)", () => {
    const head = row(2, "550 SEK", "2026-06-01T00:00:00Z");
    const d = correctionDraftFrom(head);
    expect(d).toMatchObject({
      factId: FACT,
      value: "550 SEK",
      kind: "price",
      expectedVersion: 2,
      expectedHeadId: head.id,
      validFrom: "",
    });
  });
  it("groups stored versions into chains with the newest head first and evaluates validity", () => {
    const chains = factChains([
      row(1, "500 SEK", "2026-01-01T00:00:00Z"),
      row(2, "550 SEK", "2026-06-01T00:00:00Z"),
    ]);
    expect(chains).toHaveLength(1);
    expect(chains[0].head.version).toBe(2);
    expect(chains[0].versions.map((v) => v.version)).toEqual([2, 1]);
    expect(validAt(chains[0].versions[1].record, "2026-03-01T00:00:00Z")).toBe(true);
    expect(validAt(chains[0].head.record, "2026-03-01T00:00:00Z")).toBe(false);
  });
  it("maps server codes to meaningful copy keys", () => {
    expect(factErrorKey("citation_business_fact_version_conflict")).toBe("versionConflict");
    expect(factErrorKey("citation_business_fact_capacity")).toBe("capacity");
    expect(factErrorKey("citation_record_unavailable")).toBe("unavailable");
  });
});
