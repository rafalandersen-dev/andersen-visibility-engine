# Owner Google native-report intake — design & acceptance (2026-11-13)

Bounded stage after the accepted `native-google-ai-csv` parser: an owner uploads **one** real
supported Google "Performance on Search — Generative AI features" CSV (Chart/Pages/Countries/Devices)
plus its `Filters.csv`, previews the typed interpretation, and persists it. Claude authors + tests;
Codex reviews SQL/security/evidence + a real browser before any release. No publication/commit/DB
apply by Claude.

## What already exists (reused unchanged)

- **Raw staging** — `ai_native_report_artifacts` (migration `20260919165000`) + `save/read/read_one/
remove` RPCs + `native-ai-artifact.{ts,server.ts,functions.ts}`. Stores opaque bytes with a
  server-derived hash/scope/actor/time under `status='pending_parser'`, strict **exactly-10**
  owner-declared metadata keys, 20-count / 40-MiB caps, supersession lineage, delete with
  successor-unlink + `predecessor_deleted` masking. **All of this is kept byte-for-byte.**
- **Parser** — `native-google-ai-csv.ts` (`parseNativeGoogleFilters`, `parseNativeGoogleReportCsv` →
  `{ input, withheldPageRows, partial }`). Client-safe, deterministic, network-free.

## Design rejection corrected

The staging save RPC rejects **any** metadata key outside the exact 10 (lines 79–84). So
`completeness` and the owner's source-limitation note **cannot** ride in staging metadata, and an
ephemeral recomputed preview would not satisfy "retain the typed interpretation." Therefore: a
**strictly additive** migration adds **nullable** parsed columns to the existing table and
**new service-only RPCs**; the 10-key staging contract and `pending_parser` status are untouched.

## Additive persistence (new migration, not applied by Claude)

`ALTER TABLE public.ai_native_report_artifacts ADD COLUMN` (all nullable, move together):

- `parsed jsonb` — the typed parser result, `CHECK(parsed IS NULL OR (jsonb_typeof(parsed)='object'
AND octet_length(parsed::text) <= 4194304))`. shortcut: 4 MiB cap (raw ≤2 MiB; parsed is larger
  with raw keys + per-cell value-statuses); raise only against a genuine larger export.
- `parsed_at timestamptz`, `parsed_actor_id uuid` — server-attributed on write.
- `CHECK((parsed IS NULL) = (parsed_at IS NULL) AND (parsed IS NULL) = (parsed_actor_id IS NULL))`.

**Parse state is separate from staging status.** `status` stays `pending_parser`/`unsupported`
(never relabelled "verified"); the interpreted state is derived (`parsed IS NULL ? 'unparsed' :
'parsed'`) and surfaced with its own label. A staged `pending_parser` row is **not** a persisted
verified metric.

New service-only RPCs (REVOKE from anon/authenticated, GRANT service_role only; `SET search_path=''`;
`assert_knowledge_project`):

- `save_ai_native_report_parsed(p_user,p_project,p_id,p_parsed jsonb)` — binds the interpretation to
  an **existing** row: requires the row to exist in scope; requires `p_parsed->>'artifactSha256'`
  (and `p_parsed->'input'->'artifact'->>'sha256'`) to equal the row's server-derived
  `artifact_sha256` (browser-claimed hash never trusted); sets `parsed_at=clock_timestamp()`,
  `parsed_actor_id=p_user`. **Idempotent / conflict:** if already parsed and `parsed = p_parsed`
  (jsonb equality) → return existing (deterministic retry); if already parsed and different → raise
  `native_parsed_conflict` (never silently overwrites a different completeness/note). Bounds + object
  shape re-checked at the DB.
- `read_ai_native_report_parsed(p_user,p_project,p_id)` — full interpretation for one row
  (`{id, parseState, parsed|null, parsedAt|null, parsedActorId|null}`).
- `read_ai_native_report_parse_states(p_user,p_project)` — lightweight per-row overview
  (`id, parseState, parserVersion, completeness, partial, withheldPageRows, rowCount, parsedAt`), no
  rows/bytes, for list badges.

**Deletion & lineage:** unchanged. `parsed` lives on the same row, so the existing
`remove_ai_native_report_artifact` removes the raw bytes **and** the attached parsed data together;
successor-unlink + `predecessor_deleted` masking stay intact. Superseding creates a new row that
starts `unparsed`. No sum across dimensions or snapshots — each artifact's interpretation stands alone.

## Server re-parse (never trusts the browser)

New `native-google-intake.server.ts` + `.functions.ts`:

- Staging uses the **existing** `stageNativeArtifactFn` (bytes + the 10-key metadata; `filters` /
  `marketScope` come from the owner's `Filters.csv`, parsed client-side to pre-fill, re-validated at
  the DB).
- `persistNativeReportFn` fetches the staged bytes by id (`getNativeArtifact`, server-side),
  re-derives the file kind from the declared `dimension`, and **re-parses the actual stored bytes**
  with `parseNativeGoogleReportCsv` — the browser's preview cells/hash/aggregation/market are never
  trusted. It then verifies the parser's aggregation/reportKind/dimension equal the declared
  metadata (else `native_parsed_metadata_mismatch`) and the parser's content hash equals the stored
  `artifact_sha256` (else `native_parsed_hash_mismatch`), and persists via the save RPC.
  `completeness` + `limitationNote` are owner inputs supplied here (not in staging metadata) and
  persisted inside the typed record. Only `gsc_generative_ai_search` + the four observed dimensions
  are supported; anything else → `native_parsed_unsupported`.
- `readNativeReportParsedFn` / `readNativeReportParseStatesFn` read back the persisted record.
- Errors collapse to generic codes except a small surfaced allowlist (`native_parsed_conflict`,
  `native_parsed_unsupported`, `native_parsed_metadata_mismatch`) the owner can act on; no raw DB
  text leaks (mirrors `native-ai-artifact.server`).

Shared strict shape in `native-google-intake.ts` (client-safe): `nativeReportParsedRecordSchema`
reuses `nativeReportImportInputSchema` for `input` and adds `artifactId/artifactSha256/parserVersion/
file/withheldPageRows/partial/limitationNote`, with hard bounds and cross-checks (hash binds to
`input.artifact.sha256`; `partial === withheldPageRows>0`; withheld only on `pages`). `limitationNote`
rejects jsonb-unstorable NUL / lone surrogates so the `$1::jsonb` cast cannot fail opaquely.

## UI (owner-only, citation-review owner subtree)

`NativeGoogleIntakePanel`, keyed `owner+project`, mounted only in the owner subtree of
`app.citation-review` (hidden for reviewer/inspector modes). House controls/query patterns/i18n
(en/pl/sv/da). No new route/nav/score/provider/dependency/scheduler; no credit-consuming action.

- Owner picks the CSV kind, uploads the data CSV + `Filters.csv`, and declares property / absolute
  source period (GSC timezone fixed to Pacific) / capturedAt / completeness / plain limitation note.
- **Preview** is client-side (same deterministic parser) — advisory, shows native label, source
  window/timezone/filter, property-vs-page aggregation, source limitations, partial + withheld count,
  and **raw status vs interpreted status distinctly**. Parse errors are meaningful but never echo URL
  credentials or private query params (the parser's page errors are already generic).
- **Save** stages the raw bytes, then calls `persistNativeReportFn` (server re-parse). On reload the
  owner sees the persisted interpretation with rows + value statuses + provenance
  (parserVersion, parsedAt, server actor), and the limitation note survives.
- **Delete** confirms (with pending-state protection) and uses the existing raw-artifact delete,
  removing the attached parsed data. Transient save failure preserves the owner's inputs.
- Auth/session/project change hides and clears any stale/pending preview (keyed remount).

## Remaining gate (do NOT claim P5 complete)

The existing native-report-only **independent review** path (`native-ai-report.ts` review receipts,
`known_zero` resolution) is **not** integrated here and stays explicitly incomplete: this slice
persists an owner-declared, server-re-parsed interpretation, with **no reviewer**, **no review
receipt**, and **no `known_zero` bulk upgrade**. Reviewer raw-byte disclosure is not added. Source
limits remain: country-only / SWE, Pacific timezone, impressions only, source declaration not
authenticated, `unknown_export_zero` unchanged and distinct from a real zero.

## R2 corrections (UI hardening + browser fixture)

- **Concurrency:** the save RPC's `assert_knowledge_project(…, true)` already takes the account-wide
  `workspace_meta FOR UPDATE` lock, which serialises competing same-artifact saves (writer A commits
  note A; writer B then gets `native_parsed_conflict`; note A is intact). No extra row lock is added —
  it would be redundant. (Codex verified this against the full migrations on real PostgreSQL.)
- **Auth/async guards:** `NativeGoogleIntakePanel` now captures mount authority (`actor/epoch/project`
  via `getWorkspaceSaveContext`, `useStore`) and checks the live session before each operation and
  after every await before any dependent request/state/refetch — mirroring `ManualCaptureEntry`. A
  forced sign-out, same-actor new session, hydration loss or project change hides/clears the
  preview/opened detail and drops dependent calls; an already-dispatched write may still finish (no
  false promise of undo), but its late result never applies to a new scope.
- **Preview integrity:** Preview binds an immutable snapshot (reviewed bytes + metadata + completeness
  - note + fingerprint). Any material input change (both file inputs included) invalidates it, and
    Save re-checks the exact fingerprint — so Save never persists un-previewed inputs. Transient failure
    preserves inputs; a failed persist leaves the raw file stored-but-not-finished and an idempotent
    exact retry makes no duplicate. Double-submits and late delete confirmations are guarded.
- **File bounds:** both files are size-checked against `MAX_NATIVE_REPORT_BYTES` **before**
  `arrayBuffer()`, with a localized reason and no request; server caps are unchanged.
- **Report meaning:** the report view shows the native label, metric+unit (Impressions/count),
  Pacific window, property vs page aggregation, country filter, **source completeness** with a
  distinct source-partial warning (separate from the privacy-withheld-pages warning), the plain note,
  and each row's **raw exported cell text** (spreadsheet-safe, never evaluated) separate from the
  interpreted value/status. Persisted reads show the server actor/time/parser provenance in a
  secondary details block. No zero/coverage claim; no sum across dimensions or snapshots.
- **Freshness/recovery:** a failed fresh read clears any stale opened detail; the error offers a
  working scoped Refresh. The Google panel lists **only** `gsc_generative_ai_search` artifacts (the
  shared raw API also stores Bing, which is not mislabelled here); an unknown/unloaded parse state
  reads as "Checking…", never "stored".
- **Copy/timezone:** primary flow uses plain "Stored file / Report ready / Needs attention" labels
  with implementation detail in a collapsible section; the conflict message does not tell the owner to
  delete first (that would erase the source) and states the interpretation is immutable; `capturedAt`
  is labelled and treated as UTC (never a silent local→Z). en/pl/sv/da kept consistent; no language
  activation. `src/lib/native-google-intake-ui.ts` holds the pure, unit-tested rules (file bounds,
  review fingerprint, badge, error mapping, raw-cell display, UTC normalization).
- **Browser fixture:** `scripts/native-google-intake-browser/` mounts the actual panel with synthetic
  store/auth/server functions (real parser) and controls for sign-out / same-actor re-sign-in /
  project switch / deferred stage/read responses, for Codex's native-browser acceptance (incl. 390 px
  - keyboard). `NativeGoogleIntakePanel` is added to the CG-03C fixture's out-of-scope `stubNames` so
    that fixture's accepted scope stays isolated.

## R3 corrections (pre-final)

- **Stale detail on failed refresh:** `refreshAll` now clears the opened detail before refetching, a
  failed detail read clears any opened detail (including a previously opened artifact's result), and
  the cached list **and** opened detail render only when the current reads succeed
  (`!list.isError` / `!states.isError`). Unknown/unloaded parse state reads "Checking…", never
  "stored"; the error path has a working scoped Refresh.
- **Unhydrated/mismatched requests:** the wrapper mounts the querying panel **only** when the live
  workspace `userId` matches the signed-in actor and the session is hydrated; an unstable/mismatched
  session renders nothing (no reads issued). Query keys are scoped by the session epoch so a new
  same-actor session never reuses an old "ready" cache, and each `queryFn` re-checks the live scope
  before issuing its request. The in-flight `mounted`/`opId`/post-await guards remain.
- **Parse-error privacy:** the server maps any `NativeGoogleCsvError` to a **static**
  `native_parse_failed` — the parser's message (which can embed a malformed date/filter/page key) is
  never reflected into the thrown transport code or logs. The UI already shows generic localized
  guidance. Regression: a synthetic secret-looking invalid key proves the surfaced code is generic.
- **Fixture fidelity (scripts only):** the fixture binds the requested `?locale=` to the store's
  `appLanguage` so the actual `useT` renders that locale (h2 asserted per EN/PL/SV/DA); rows carry an
  owner+project and are keyed by the real `nativeArtifactScopeKey`, with reads/get/delete/idempotency
  scoped accordingly; a new call validates the current fixture actor while a mid-flight (hung) call
  still finishes in its original scope. New controls: Hang next stage, sustained Pause/Resume
  workspace. New scripted cases: failed-refresh masked, deferred-stage project switch and same-actor
  re-sign-in (no dependent persist), transient persist failure + exact retry (one row), delete
  cancel/confirm. The scripted matrix is a scaffold — not browser acceptance until Codex runs it.
- **Copy clarity:** the intro notes the export is a ZIP to unzip (one CSV + its Filters.csv; no ZIP
  parser built), and the limits line states the country mapping currently supports Sweden or no
  country filter. Source cap / raw schema / SQL unchanged.

## Acceptance checks (Claude runs; Codex re-verifies + browser)

Focused: the parser tests (regression), a new `native-google-intake` contract/server test (shape
bounds, hash binding, idempotent-vs-conflict, unsupported/mismatch, owner isolation via injected
rpc), a new PGlite SQL migration test (additive columns, new RPC checks/RLS/grants/service-only
scope, delete removes parsed, idempotent/conflict, no raw-stage API regression), plus `tsc` + lint.
No full-suite duplication; no SQL applied; no release claim.

## Codex protection/integration exception — 13 November 2026

After the sole Claude R3 author stopped, Codex expanded only the four active-language delete confirmations to disclose permanent removal, linked evidence/review-note erasure and status downgrades. This preserves the existing `citation_forget_redact_native` behavior (applied migration `20260920200000`); no delete logic changed. Codex also removed the synthetic fixture HTML link to a nonexistent `bundle.css`; the real compiled `styles.css` remains. These are bounded data-loss protection and verification-integration exceptions to the normal Claude-author role. Browser, final-source and production acceptance remain separate gates.

Codex also corrected the browser fixture oversized-file audit to start after its own preparation refetch, and checked both oversized inputs with actual `File.arrayBuffer` call counters. The product file-size gate is unchanged. This is a verification-integration exception; the earlier 8/9 result was a fixture baseline failure, not an upload-boundary failure.

Codex completed one existing-field integration in the report view: the preserved source `capturedAt` is now displayed with the existing UTC download-time label. No parsing, persistence or authorization logic changed.
