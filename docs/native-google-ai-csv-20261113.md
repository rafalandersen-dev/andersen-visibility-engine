# Native Google AI export CSV parser — contract and limits (2026-11-13)

`src/lib/native-google-ai-csv.ts` parses a genuine, owner-supplied Google Search Console
**"Performance on Search — Generative AI features"** ZIP export, one already-unzipped CSV at a time,
into a validated import **preview** (`nativeReportImportInputSchema` from `src/lib/native-ai-report.ts`).
It is network-free, adds no dependency, and reuses the existing bounded CSV grid parser
(`parseCsvGrid`, now exported from `src/lib/gsc.ts` unchanged).

## Observed formats (the only ones accepted)

From an authorized `GenerativeAI onSearch` export. Comma CSV, standard quoted fields.

| File          | Exact header            | dimension          | GSC aggregation | reportKind |
| ------------- | ----------------------- | ------------------ | --------------- | ---------- |
| Chart.csv     | `Date,Impressions`      | date               | property        | chart      |
| Pages.csv     | `Top pages,Impressions` | page               | page            | table      |
| Countries.csv | `Country,Impressions`   | country            | property        | table      |
| Devices.csv   | `Device,Impressions`    | device             | property        | table      |
| Filters.csv   | `Filter,Value`          | — (filter context) | —               | —          |

Observed `Filters.csv` rows: `Search type = Web (text-based)`, `Date = Last 3 months`,
`Country = Sweden`. Chart/Countries/Devices are **property-aggregated**; Pages is **page-aggregated** —
the two totals are different measurements and are never summed or reconciled.

Sources: Google Search Console help 16984139 (aggregation, Pacific-Time dates, bare export zero,
page filter changes chart aggregation) and 6211453 (9–11 Nov 2026 logging anomaly → that real
window is **partial**).

## API

- `parseNativeGoogleFilters(bytes)` → `{ filters, marketScope }`. Preserves raw `Filter→Value`
  pairs; maps the observed `Country = Sweden` to `marketScope = { country: "SWE", exposed: true }`.
- `parseNativeGoogleReportCsv(file, bytes, meta)` → `Promise<NativeGoogleReportPreview>` =
  `{ input, withheldPageRows, partial }`. `file` is one of `"chart" | "pages" | "countries" |
"devices"`. `input` is the validated import-preview snapshot; `withheldPageRows` counts in-property
  pages withheld for privacy (always 0 off the pages table); `partial` is true when any row was
  withheld, so the result must not be treated as complete page evidence.

`meta` carries the **source-observed metadata the CSV cannot contain** and must not be derived from
the rows: `declaredProperty`, absolute `period` (`{start, end, timezone}`), `capturedAt`,
`completeness`, and the `filterContext` from `parseNativeGoogleFilters`.

The parser computes `artifact.sha256`/`bytes` over the real input bytes with WebCrypto; a
caller-supplied hash or size is never trusted. It never fabricates server-attributed fields
(`importedAt`, `provenance`, review receipts, snapshot identity) — those stay with the server.

`meta.filterContext` is treated as **untrusted input even though it is typed** — the report parser
re-runs the same `assertObservedFilterContext` checks as `parseNativeGoogleFilters` (shared, so they
cannot drift). A forged page filter, a market scope that contradicts the country filter, or an
unsupported Search type is rejected rather than ridden in under the hard-coded property aggregation.
When `completeness` is `preliminary`, positive cells are labelled `preliminary` (not `known_value`);
a bare exported zero still stays `unknown_export_zero`.

**Private page parameters (genuinely observed `?lang=sv`).** Page rows are classified with the
existing `classifyGscReportPage` (gsc.ts, unchanged): a clean in-property URL is **retained**; an
in-property page whose only private part is a query/fragment is **withheld** — counted in
`withheldPageRows`, never retained as a row key and never stripped into another page's URL; anything
else (credentials, another protocol, unsafe text, out-of-property) is **invalid** and rejected.
Withholding never drops a row silently (`withheldPageRows` + `partial` surface it) and never changes
the artifact hash, which is computed over the complete original bytes.

## What it rejects (never guesses, never silently drops)

Wrong/extra columns, ragged rows, duplicate dimension keys, non-day or out-of-period dates, a page
row that is malformed / uses credentials or another protocol / is outside the declared property, a
`declaredProperty` that is not a valid GSC property (URL-prefix or `sc-domain:`), empty/oversized
(>2 MB) input, non-UTF-8 input, duplicate/unobserved filter names, an unsupported Search type, a
country filter whose market scope is inconsistent, an unobserved country value, and — via the schema
— a GSC snapshot whose timezone is not Pacific Time. (An in-property query/fragment page is **not**
rejected — it is withheld and counted.)

## Limits (upgrade only against a genuine export)

- **Period/completeness are caller-supplied.** `Filters.csv Date = "Last 3 months"` is a relative
  label kept verbatim as a filter; it is never turned into an absolute period, and the window is
  never inferred from min/max row dates. The 9–11 Nov 2026 anomaly is not baked in — the caller
  passes `completeness` (e.g. `partial`).
- **Country mapping is observation-only.** Only `Sweden → SWE`. Any other country filter value is
  rejected rather than mapped from a speculative locale table. Country _dimension_ rows (Countries.csv)
  are preserved raw and unmapped.
- **Filter context is observation-only.** Only `Search type`, `Date`, `Country` filter names are
  accepted. A page/query filter is rejected because it changes the chart's aggregation and no such
  export was observed.
- **Reused `parseCsvGrid` bounds:** 1000 rows, 16 columns, 4000-char cells (observed exports are far
  smaller than the native 5000-row schema bound).
- **Page query/fragment rows are withheld, not imported.** Their impressions are not retained, so a
  pages table with withheld rows is explicitly `partial`; the withheld count is surfaced but the
  private parameter values never enter the preview. Credentials/other-protocol/out-of-property pages
  are still rejected outright.
- Per-CSV only; no ZIP parser. No click/CTR/position/traffic interpretation. GSC only — no Bing
  until a genuine Bing export exists.
