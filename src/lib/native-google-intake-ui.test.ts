import { describe, expect, it } from "vitest";
import {
  MAX_NATIVE_INTAKE_FILE_BYTES,
  fileTooLarge,
  intakeBadge,
  isGoogleArtifactSource,
  isNativeIntakeSource,
  normalizeUtcCapturedAt,
  overviewDateCoverage,
  persistErrorKey,
  rawCellText,
  reviewFingerprint,
  sourceIncomplete,
  type NativeIntakeFingerprintInputs,
} from "./native-google-intake-ui";

const base: NativeIntakeFingerprintInputs = {
  source: "gsc_generative_ai_search",
  file: "chart",
  property: "https://example.test/",
  start: "2026-09-01",
  end: "2026-11-13",
  capturedAt: "2026-11-13T09:00",
  completeness: "partial",
  limitationNote: "outage",
  data: { name: "Chart.csv", size: 100, lastModified: 1 },
  filters: { name: "Filters.csv", size: 50, lastModified: 1 },
};

describe("file bounds before reading", () => {
  it("rejects a file over the 2 MiB cap and accepts one at the cap", () => {
    expect(fileTooLarge(MAX_NATIVE_INTAKE_FILE_BYTES + 1)).toBe(true);
    expect(fileTooLarge(MAX_NATIVE_INTAKE_FILE_BYTES)).toBe(false);
  });
});

describe("UTC capturedAt normalization (disclosed, never silent local→Z)", () => {
  it("appends seconds+Z to a minute-precision UTC value and Z to a seconds value", () => {
    expect(normalizeUtcCapturedAt("2026-11-13T09:00")).toBe("2026-11-13T09:00:00Z");
    expect(normalizeUtcCapturedAt("2026-11-13T09:00:30")).toBe("2026-11-13T09:00:30Z");
    // An already-zoned value is passed through unchanged.
    expect(normalizeUtcCapturedAt("2026-11-13T09:00:00Z")).toBe("2026-11-13T09:00:00Z");
  });
});

describe("review fingerprint invalidation", () => {
  it("changes when any material input changes, including either file", () => {
    const fp = reviewFingerprint(base);
    expect(reviewFingerprint({ ...base })).toBe(fp);
    for (const changed of [
      { ...base, source: "bing_ai_performance" },
      { ...base, file: "pages" },
      { ...base, property: "https://other.test/" },
      { ...base, start: "2026-09-02" },
      { ...base, end: "2026-11-14" },
      { ...base, capturedAt: "2026-11-13T10:00" },
      { ...base, completeness: "complete" },
      { ...base, limitationNote: "" },
      { ...base, data: { name: "Chart.csv", size: 101, lastModified: 1 } },
      { ...base, filters: { name: "Filters.csv", size: 50, lastModified: 2 } },
      { ...base, data: null },
    ])
      expect(reviewFingerprint(changed)).not.toBe(fp);
  });
});

describe("primary state badge", () => {
  it("never shows an unknown/unloaded parse state as stored, and flags unsupported", () => {
    expect(intakeBadge("pending_parser", "parsed", true)).toBe("ready");
    expect(intakeBadge("pending_parser", "unparsed", true)).toBe("stored");
    expect(intakeBadge("unsupported", "unparsed", true)).toBe("attention");
    // Overview not loaded yet / missing → unknown, not "stored".
    expect(intakeBadge("pending_parser", null, true)).toBe("unknown");
    expect(intakeBadge("pending_parser", "parsed", false)).toBe("unknown");
  });
});

describe("source and display helpers", () => {
  it("labels Google, admits both intake sources, and flags incomplete/unknown sources", () => {
    expect(isGoogleArtifactSource("gsc_generative_ai_search")).toBe(true);
    expect(isGoogleArtifactSource("bing_ai_performance")).toBe(false);
    expect(isNativeIntakeSource("gsc_generative_ai_search")).toBe(true);
    expect(isNativeIntakeSource("bing_ai_performance")).toBe(true);
    expect(isNativeIntakeSource("some_other_source")).toBe(false);
    expect(sourceIncomplete("partial")).toBe(true);
    expect(sourceIncomplete("preliminary")).toBe(true);
    // Unknown completeness is never presented as full.
    expect(sourceIncomplete("unknown")).toBe(true);
    expect(sourceIncomplete("complete")).toBe(false);
  });
  it("reports date coverage, flagging an endpoint or interior gap, and skips a page table", () => {
    const period = { start: "2026-08-13", end: "2026-08-16" };
    // Full endpoints but an interior gap (14th missing).
    const gapped = overviewDateCoverage(
      "date",
      [{ key: "2026-08-13" }, { key: "2026-08-15" }, { key: "2026-08-16" }],
      period,
    );
    expect(gapped).toMatchObject({
      observedDays: 3,
      expectedDays: 4,
      firstObserved: "2026-08-13",
      lastObserved: "2026-08-16",
      hasGaps: true,
    });
    // Every day present → no gaps.
    expect(
      overviewDateCoverage(
        "date",
        [
          { key: "2026-08-13" },
          { key: "2026-08-14" },
          { key: "2026-08-15" },
          { key: "2026-08-16" },
        ],
        period,
      ),
    ).toMatchObject({ observedDays: 4, expectedDays: 4, hasGaps: false });
    // A short window that ends before the period end is a missing endpoint → gap.
    expect(overviewDateCoverage("date", [{ key: "2026-08-13" }], period)).toMatchObject({
      observedDays: 1,
      expectedDays: 4,
      hasGaps: true,
    });
    // A page table has no row dates and an empty report has no coverage.
    expect(overviewDateCoverage("page", [{ key: "https://x/" }], period)).toBeNull();
    expect(overviewDateCoverage("date", [], period)).toBeNull();
  });
  it("renders raw cell text spreadsheet-safe, never evaluating a formula", () => {
    expect(rawCellText("=1+2")).toBe("'=1+2");
    expect(rawCellText("12")).toBe("12");
    expect(rawCellText(null)).toBe("");
  });
});

describe("error key mapping", () => {
  it("maps conflict/unsupported/mismatch/hash/parse/capacity and falls back", () => {
    expect(persistErrorKey("native_parsed_conflict")).toBe("err.conflict");
    expect(persistErrorKey("native_parsed_unsupported")).toBe("err.unsupported");
    expect(persistErrorKey("native_parsed_metadata_mismatch")).toBe("err.mismatch");
    expect(persistErrorKey("native_parsed_hash_mismatch")).toBe("err.hash");
    expect(persistErrorKey("native_parse_failed:Malformed page URL.")).toBe("err.parseFailed");
    expect(persistErrorKey("native_artifact_capacity")).toBe("err.capacity");
    expect(persistErrorKey("native_parsed_unavailable")).toBe("err.save");
    expect(persistErrorKey("evidence_owner_changed")).toBe("err.save");
  });
});
