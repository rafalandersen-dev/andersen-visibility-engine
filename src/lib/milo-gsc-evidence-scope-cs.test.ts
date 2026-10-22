/**
 * CS — saved GSC preview omissions vs source privacy withholding (22 October 2026).
 *
 * Live: Research read import gsc_api_88be6ed1… (231 saved rows, 12 previewed, 44
 * query/fragment page variants withheld at sync) and said 44 of the 219 omitted rows
 * were withheld variants. They are different populations: the 219 are saved rows left
 * out of the bounded agent preview; the 44 were never saved. These tests pin explicit,
 * machine-readable scopes, the byte-cap trimming bookkeeping, zero vs unknown and
 * legacy numeric withholding. Pure module; no fetch, sync or provider call.
 */
import { describe, expect, it } from "vitest";
import { READER_EVIDENCE_MAX_BYTES, searchConsoleEvidence } from "./milo-specialist-context";
import type { GscImport, GscRow } from "./types";

type Scopes = {
  savedRows: number | null;
  previewRows: number;
  savedRowsNotInPreview: number | null;
  sourceWithheldPageVariants: number | null;
  sourceRowLimitReached: boolean | null;
};
type Item = {
  id: string;
  basis: string;
  summary: { clicks: number | null; impressions: number | null; savedRows: number | null };
  topRowsByClicks: unknown[];
  rowScopes: Scopes;
} & Record<string, unknown>;
type Evidence = {
  content: { imports: Item[]; rowScopeGuide: string } & Record<string, unknown>;
  partial: boolean;
};
const read = (imports: unknown[]) => {
  const raw = searchConsoleEvidence(imports);
  return { raw, data: JSON.parse(raw) as Evidence };
};

const queryRow = (i: number, text = `massage malmö ${i}`): GscRow => ({
  type: "query",
  query: text,
  clicks: 231 - i,
  impressions: 1000 + i,
  ctr: null,
  position: 9.5,
});
/** The released production shape: an integrity-v2 API sync with an independent aggregate. */
function apiImport(
  id: string,
  rows: GscRow[],
  extra: Partial<GscImport> = {},
  importedAt = "2026-10-22T19:00:00Z",
): GscImport {
  return {
    id,
    importedAt,
    integrityVersion: 2,
    source: "api",
    importType: "queries",
    rows,
    aggregate: { clicks: 118, impressions: 2962, ctr: 3.98, position: 14.2 },
    summary: {
      totalClicks: 1,
      totalImpressions: 1,
      averageCtr: 1,
      averagePosition: 1,
      rowCount: 1,
    },
    selectedSiteUrl: "sc-domain:synergymassage.se",
    dateRange: { start: "2026-09-22", end: "2026-10-19", label: "28d · PT · web · final" },
    truncated: false,
    withheldPageRows: { queryOrFragment: 44 },
    ...extra,
  };
}
const production = () =>
  apiImport(
    "gsc_api_88be6ed1-3e2a-46c0-88ad-29d22bedaa38",
    Array.from({ length: 231 }, (_, i) => queryRow(i)),
  );

describe("CS distinct GSC row scopes", () => {
  it("231 saved / 12 previewed / 219 not previewed and 44 source-withheld are separate populations", () => {
    const { data } = read([production()]);
    const [item] = data.content.imports;
    expect(item.rowScopes).toEqual({
      savedRows: 231,
      previewRows: 12,
      savedRowsNotInPreview: 219,
      sourceWithheldPageVariants: 44,
      sourceRowLimitReached: false,
    });
    expect(item.topRowsByClicks).toHaveLength(12);
    // The preview identity covers saved rows only; the withheld variants are outside it.
    expect(item.rowScopes.previewRows + item.rowScopes.savedRowsNotInPreview!).toBe(
      item.rowScopes.savedRows,
    );
    expect(item.summary.savedRows).toBe(231);
    // No ambiguous generic omission or withheld field that could be read as a subset.
    for (const legacyField of ["omittedRows", "withheldPageRows", "sourceTruncated"])
      expect(item).not.toHaveProperty(legacyField);
    const guide = data.content.rowScopeGuide;
    expect(guide).toMatch(
      /previewRows and savedRowsNotInPreview partition the saved rows \(savedRows = previewRows \+ savedRowsNotInPreview\)/,
    );
    expect(guide).toMatch(
      /NOT saved rows, so never add them to, or count them within, savedRows, previewRows or savedRowsNotInPreview/,
    );
    expect(guide).not.toMatch(/never add or nest them/);
    expect(data.partial).toBe(true);
  });

  it("aggregate totals are independent of preview trimming and of source withholding", () => {
    const withheld = read([production()]).data.content.imports[0];
    const none = read([
      apiImport("other", [queryRow(0), queryRow(1)], { withheldPageRows: { queryOrFragment: 0 } }),
    ]).data.content.imports[0];
    expect(withheld.basis).toBe("aggregate");
    for (const item of [withheld, none])
      expect(item.summary).toMatchObject({ clicks: 118, impressions: 2962 });
    expect(none.rowScopes).toMatchObject({
      savedRows: 2,
      previewRows: 2,
      savedRowsNotInPreview: 0,
      sourceWithheldPageVariants: 0,
    });
    expect(read([production()]).data.content.rowScopeGuide).toMatch(
      /summary totals are the separately reported property aggregate/,
    );
  });

  it("byte-cap trimming moves rows from the preview to savedRowsNotInPreview, never into withholding", () => {
    // JSON-escaping-heavy query text so three full previews exceed the evidence cap.
    const heavy = (i: number) => queryRow(i, `"\\${'\\"'.repeat(70)}${i}`);
    const imports = [0, 1, 2].map((n) =>
      apiImport(
        `heavy-${n}`,
        Array.from({ length: 40 }, (_, i) => heavy(i)),
        { withheldPageRows: { queryOrFragment: 44 + n } },
        `2026-10-2${n}T10:00:00Z`,
      ),
    );
    const { raw, data } = read(imports);
    expect(new TextEncoder().encode(raw).byteLength).toBeLessThanOrEqual(READER_EVIDENCE_MAX_BYTES);
    expect(data.partial).toBe(true);
    const items = data.content.imports;
    expect(items.some((item) => item.rowScopes.previewRows < 12)).toBe(true);
    for (const item of items) {
      expect(item.rowScopes.previewRows).toBe(item.topRowsByClicks.length);
      expect(item.rowScopes.previewRows + item.rowScopes.savedRowsNotInPreview!).toBe(40);
      expect(item.rowScopes.savedRows).toBe(40);
    }
    // Withheld counts are per import and untouched by trimming.
    expect(
      Object.fromEntries(items.map((item) => [item.id, item.rowScopes.sourceWithheldPageVariants])),
    ).toEqual(
      Object.fromEntries(items.map((item) => [item.id, 44 + Number(item.id.split("-")[1])])),
    );
  });

  it.each([
    ["an API sync that recorded zero", { withheldPageRows: { queryOrFragment: 0 } }, 0],
    ["an API sync from before withholding was recorded", { withheldPageRows: undefined }, null],
    ["an API sync with a malformed count", { withheldPageRows: { queryOrFragment: -1 } }, null],
    ["an integrity-v2 manual CSV, which refuses such URLs", { source: "manual_csv" as const }, 0],
    ["an unknown source", { source: "other" }, null],
    ["a missing source", { source: undefined }, null],
    [
      "a legacy import, even with a forged count",
      { integrityVersion: undefined, withheldPageRows: { queryOrFragment: 7 } },
      null,
    ],
  ])("withheld variants for %s: %s", (_, extra, expected) => {
    const item = read([apiImport("x", [queryRow(0)], extra as Partial<GscImport>)]).data.content
      .imports[0];
    expect(item.rowScopes.sourceWithheldPageVariants).toBe(expected);
  });

  it.each([
    ["explicit true", { truncated: true }, true],
    ["explicit false", { truncated: false }, false],
    ["missing", { truncated: undefined }, null],
    ["non-boolean", { truncated: "yes" }, null],
  ])("source row-limit metadata %s → %s", (_, extra, expected) => {
    const item = read([apiImport("x", [queryRow(0)], extra as Partial<GscImport>)]).data.content
      .imports[0];
    expect(item.rowScopes.sourceRowLimitReached).toBe(expected);
  });

  it("legacy and over-cap imports keep every numeric scope unknown, never zero", () => {
    const legacy = apiImport(
      "legacy",
      [queryRow(0), queryRow(1)],
      { integrityVersion: undefined, truncated: true, withheldPageRows: { queryOrFragment: 7 } },
      "2026-09-06T08:00:00Z",
    );
    const overCap = apiImport(
      "over-cap",
      Array.from({ length: 1001 }, (_, i) => queryRow(i)),
      { truncated: true },
      "2026-09-07T08:00:00Z",
    );
    for (const source of [legacy, overCap]) {
      const { raw, data } = read([source]);
      const [item] = data.content.imports;
      expect(item.rowScopes).toEqual({
        savedRows: null,
        previewRows: 0,
        savedRowsNotInPreview: null,
        sourceWithheldPageVariants: null,
        sourceRowLimitReached: null,
      });
      expect(item.summary).toMatchObject({ clicks: null, impressions: null, savedRows: null });
      expect(item.topRowsByClicks).toEqual([]);
      expect(item.numericBasisUnavailable).toEqual(expect.any(String));
      if (source === legacy) expect(raw).not.toMatch(/massage malmö|\b231\b|\b1000\b/);
    }
  });
});
