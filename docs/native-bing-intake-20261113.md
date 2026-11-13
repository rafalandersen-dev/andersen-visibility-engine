# Owner Bing native-report intake — design & acceptance (2026-11-13)

Bounded stage after the released Google native intake (PR203). An owner uploads **one** real Bing
Webmaster Tools **"AI Performance" (BETA)** CSV, previews the typed interpretation, and persists it.
It reuses the same generic raw-staging table, parsed-interpretation columns/RPCs, server re-parse and
owner panel — Bing is added as a strict **source variant**, not a new provider framework. Claude
authors + tests; Codex reviews security/evidence and the real browser + the real private export
before any release. No publication/commit/DB apply by Claude.

## Observed source (real exports stay PRIVATE, outside the repo)

Bing Webmaster Tools "AI Performance" (BETA); citation sources are Microsoft Copilot / Bing / select
partners (blogs.bing.com, 16 June 2026). The acquired export declared an owner URL-prefix property, a
UI-selected 3-month absolute period, and exposed **no** country filter, language, or timezone (the
concrete private property/domain stays out of this doc and the repo). Two row-bearing CSVs, both
UTF-8, no ZIP, no Filters.csv:

1. **Overview** — exact header `Date,Citations,Cited Pages`; dates are the lexeme `M/D/YYYY 12:00:00 AM`
   (always midnight); non-negative integer counts. The rows end before the selected period end
   (missing trailing days), so the selected period and the actual observed row coverage are **both**
   preserved — never back-filled with invented zero rows.
2. **Pages** — exact header `Page,Citations`; clean in-property URLs; page aggregation, distinct from
   the property-level Overview. No row dates, so a Pages CSV is **never** assigned a date coverage.

`GroundingQueries`, `DownloadAll`, `CitationShare` and the displayed `Avg. Cited Pages = 0` are **not**
available/zero: a rounded `0` average is a display artifact, not "zero pages" (the page table has rows).
No schema/API is invented for any of these.

## What is reused unchanged

- **Raw staging** (`ai_native_report_artifacts`, migration `20260919165000`) + its RPCs and
  `native-ai-artifact.*` — the exact 10-key owner metadata, `pending_parser` status, 20-count / 40-MiB
  caps, lineage/retry/deletion. `source` already enumerates `bing_ai_performance`; Bing stages with
  `marketScope {country:null,exposed:false}`, `filters {}`, `period.timezone null`.
- **Parsed persistence** (migration `20261113120000`) — the generic `parsed jsonb` columns and
  service-only `save/read/read_states` RPCs. **No new SQL**: the storage is source-agnostic jsonb,
  bound to the row's server-derived hash, idempotent on a byte-identical re-parse. An old Google v1
  parsed record stays byte-identical and readable (the record schema gained no new required field).
- **Value-status rules** (`native-ai-report.ts`) — `interpretExportCell`, `unknown_export_zero`, the
  import schema. A bare exported `0` stays **unknown** (no real zero receipt exists in this packet).

## New / changed code

- **`native-bing-ai-csv.ts`** (new) — strict offline parser for the two observed layouts. Only the
  exact headers are accepted; `bingOverviewDateToIso` accepts **only** the observed
  `M/D/YYYY 12:00:00 AM` lexeme and validates a real calendar date; dates are deduped and bounded to
  the selected period (duplicate / out-of-period / wrong-format rejected). Pages reuse the GSC page
  classifier (`classifyGscReportPage`): a query/fragment in-property page is **withheld** (counted,
  never retained as a key, never stripped), out-of-property / credentialed / other-protocol pages are
  rejected. The hash is computed over the complete original bytes. Scope is **forced**
  unknown/unsegmented regardless of any caller-supplied market/timezone/filter.
  - **Whole-event count guard (Bing-local).** `isBingCountLexeme` / `interpretBingCountCell` accept a
    Bing `count` only as a **nonnegative run of decimal digits that is a JS safe integer and
    round-trips to the same lexeme**; `1.5`, `1.0`, `0.0`, `9007199254740993`, `1e2`, `1,000`, a
    negative or a formula is `invalid`, never a rounded/known value. A bare `0` is a safe-integer
    lexeme, so it stays `unknown_export_zero`. This is strictly **Bing-local** — it does not tighten
    the shared Google-v1 parser.
  - **Period coverage (Overview only).** `bingOverviewCoversPeriod` counts, in bounded O(1) day
    arithmetic (civil JDN; no `Date`, no timezone), whether the observed distinct dates cover **every**
    calendar day of the inclusive selected period. If the owner requests `complete` but a day is
    missing (a missing endpoint **or** an interior gap), the parser deterministically derives
    `partial` — the selected period and the actual observed rows are preserved, nothing is zero-filled,
    and an exact server re-parse returns the same immutable interpretation. Never applied to Pages
    (which borrows no date coverage); privacy withholding stays a separate flag.
- **`native-ai-report.ts`** — the shared value-status rules are **unchanged**: a `count` cell still
  keeps whatever whole or fractional value a genuine export shows (so a previously accepted Google v1
  record with e.g. a fractional/average count stays readable), and a percent is bounded at 100. The
  whole-event rule lives in the Bing boundary above, not in this shared parser.
- **`native-google-intake.ts`** — `nativeReportParsedRecordSchema` routes every invariant by
  `input.source`: per-source parser version, CSV file set, descriptor, page-table name; a Bing record
  must carry `marketScope {null,false}`, `filters {}`, `timezone null`. It additionally enforces the
  **exact observed Bing variant** at the read/trust boundary: an Overview row carries exactly
  `citations` + `cited_pages` and a Pages row exactly `citations` (no arbitrary / missing / extra
  measure — an impressions-only Overview is rejected); every Bing measure is a count honouring the
  whole-event lexeme guard (`isValidBingCountCell`); and a `complete` Overview must carry a row on
  every day of the period (a forged complete-with-gap claim is refused). The Google contract is
  unchanged for a Google record.
- **`native-google-intake.server.ts`** — the re-parse is source-routed. For Bing it **rejects** a
  staged metadata that forges a market, timezone or filter (`native_parsed_metadata_mismatch`) rather
  than silently normalizing it, then re-parses the stored bytes with the Bing parser and re-checks the
  aggregation/reportKind/dimension and hash exactly as for Google. Parser messages (which can embed
  owner input) never reach the transport: a parse failure maps to the static `native_parse_failed`.
- **`native-google-intake-ui.ts`** — `reviewFingerprint` now includes `source` (changing source
  invalidates the preview and never relabels an already-opened record); `sourceIncomplete` now also
  treats `unknown` completeness as not-a-complete reading; `overviewDateCoverage` derives, for a
  date-dimension report only, how many distinct in-period days carry a row vs how many the period
  spans and whether any day inside the period is missing (an endpoint **or** interior gap) — pure UTC
  epoch arithmetic, never persisted (so old records stay readable), never computed for a page table.
- **`NativeGoogleIntakePanel.tsx`** — one owner panel, now source-aware (Report source selector). Bing
  shows the Overview/Pages CSV kinds and **no** Filters.csv; the form period carries no timezone. The
  report view renders **each** metric the report actually carries (Impressions for Google; Citations
  **and** Cited pages for a Bing overview; Citations for a Bing page table) — never a hard-coded
  single metric — plus the row coverage, a gap warning that blocks a complete-period claim **even if
  the owner marked the source complete**, the unknown-timezone and unsegmented-scope lines, the
  source-partial warning and the privacy-withheld-pages warning **separately**. The list now shows
  both Google and Bing artifacts (`isNativeIntakeSource`). All session/hydration/project/epoch guards,
  file-bounds-before-read, immutable preview snapshot and delete disclosure are unchanged.
- **i18n** — the `nativeIntake` namespace gained Bing keys (source selector, Bing CSV kinds, Citations
  / Cited pages metrics, unknown-timezone, unsegmented-scope, coverage heading + gap warning) and its
  provider-specific intro / native label / limits lines are now source-suffixed; `title` /
  `declaration` / period labels are provider-neutral. EN/PL/SV/DA complete (machine-authored PL/SV/DA,
  human acceptance pending). The namespace grew 86 → 100 keys; the 20 inactive staged locales keep the
  established English-fallback batch (`stagedNativeIntake()`), so only the recorded source fingerprint
  (`native-intake-fallback.ts`, `de-source.ts`) and the per-locale/total counts in the staged suites
  were updated — no language activated, no translated value changed.

## Scope and honesty boundaries (do NOT claim P5 / native review complete)

Bing is a **partial, aggregated preview** signal — not clicks/traffic/recommendations/ranking/quality,
not full-answer observation, not proof of consumer-app output. Source partiality (completeness) and
privacy-withheld pages are shown **separately**, and either a declared-incomplete source **or** a
coverage gap **or** withheld pages blocks a complete-evidence claim. Scope stays unknown/unsegmented
even if a caller forges market/timezone/filter fields. No native independent review / finding
authoring / zero-resolution is added here (that is the next distinct stage); `nativeReportImportInput`
still rejects forged review receipts. Availability of a Bing feature elsewhere does not mean it was in
the acquired export.

## Acceptance checks (Claude runs; Codex re-verifies + real export + browser)

Focused: the new Bing parser tests (headers, observed date lexeme, dedupe/out-of-period, page
withhold/reject, forced scope, the whole-event count lexeme guard and its non-integer/`0.0`/oversize
cases, the `complete`→`partial` coverage derivation and the never-borrow-for-Pages rule, UTF-8/empty);
the shared value-status regression confirming the Google-v1 contract (a fractional count stays a known
value) is **unchanged**; the UI-helper tests (source fingerprint, coverage, incomplete/unknown); the
`native-google-intake` record-schema Bing-variant tests (exact Overview/Pages measures, a rejected
impressions-only Overview, a rejected forged fractional count, a rejected complete-with-gap Overview)
+ PGlite migration round-trip (Bing persist + idempotent retry + forged-market/timezone/filter
rejection + old Google record still readable); the Google parser/schema regression (unchanged); the
i18n fallback/parity suites; plus `tsc`, changed-file ESLint and `git diff --check`. No full-suite
duplication; no SQL applied; no release claim. The browser harness interprets Bing via the real parser
and now drives a scripted Bing journey (Overview/Pages preview/save/reopen with distinct metrics,
source/CSV-kind switch invalidation + restored Google Filters requirement, mismatched-CSV rejection,
Bing-no-Filters + oversize-before-read, scoped delete preserving the other source); the real 390 px +
keyboard browser acceptance in four languages and the real private export remain Codex's gates.
