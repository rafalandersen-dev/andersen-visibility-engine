# Citation Intelligence v1 — P1 raw-artifact staging (Claude, 19 September 2026)

First implementation packet of the accepted v1 workflow (product/CITATION_WORKFLOW_IMPLEMENTATION_2026_09_19.md), delivered under the 19 September working agreement: Claude owns this new source / tests / candidate migration / doc; Codex runs the prepared tests and reviews. This packet is **raw-artifact staging**, corrected away from the earlier "accepted parsed snapshots" design: no speculative parser exists, so P1 only stores owner-supplied opaque export bytes with server-derived attribution under an explicit `pending_parser`/`unsupported` status. A staged artifact contributes **no** rows, metrics, presence, comparability or verified claims. No provider calls, collection, network, SQL applied, deployment, credentials, packages or auto-memory. The USD50-global / manual-free-grant budget is unchanged; the 20-artifact / 40-MiB bounds are provisional engineering limits needing no new subscription or spend.

## Owned files (disjoint from the PR137 `.ts` helpers and the conversation-repair worktree)

- `supabase/migrations/20260919150000_native_report_artifacts.sql` — `ai_native_report_artifacts` (RLS, `REVOKE ALL … FROM PUBLIC,anon,authenticated,service_role`, `workspace_entities` FK via `project_collection`, self-FK `supersedes_id` **`NO ACTION`** with `remove_*` unlinking the successor before delete, bounded `octet_length`); `SECURITY DEFINER SET search_path=''` RPCs `save_/read_(list)/read_(one)/remove_ai_native_report_artifact` gated by `assert_knowledge_project`, function EXECUTE granted to `service_role` only.
- `src/lib/native-ai-artifact.ts` — client-safe, network-free schemas/bounds/logical-scope predictor; imports the PR137 `native-ai-report.ts`, reusing the now-**exported** `nativePeriodSchema` (the packet's only change to that file) plus `NATIVE_REPORT_SOURCES`, `nativeMarketScopeSchema`, `MAX_NATIVE_REPORT_BYTES`, `GSC_REPORT_TIMEZONE`, `nativeSnapshotScopeKey` (all otherwise unchanged).
- `src/lib/native-ai-artifact.server.ts` — `call()`-style 10 s RPC wrapper (`native_artifact_unavailable`); sends no scope key (the DB derives the canonical identity), encoded-body bound before any decode.
- `src/lib/native-ai-artifact.functions.ts` — `createServerFn` + `requireSupabaseAuth`, `expectedOwnerId` guard (`evidence_owner_changed`), stage/list/get/remove.
- `src/lib/native-ai-artifact-migration.test.ts`, `src/lib/native-ai-artifact.functions.test.ts` — PGlite SQL round-trips + endpoint auth.

The only change to the PR137 helpers is a single `export` modifier added to the existing `nativePeriodSchema` in `native-ai-report.ts` so the artifact metadata reuses its exact real-calendar/ordered date validation; no other logic there, and none of `citation-panel.ts`, `citation-finding.ts` or the conversation-repair worktree, was touched.

## Security constraints enforced

- **Server-derived facts, never imported.** The DB derives `artifact_sha256` from the decoded bytes (a caller-claimed hash is never trusted), and sets `id`, `created_at`, `actor_id`, `status='pending_parser'`, `byte_length`, `scope_key` and `supersedes_id`. The save RPC accepts a **strict allowlist** of exactly the ten declared keys (`source`,`declaredProperty`,`reportKind`,`dimension`,`aggregation`,`period`,`marketScope`,`filters`,`capturedAt`,`filename`) and its strict sub-object shapes — any other key, whether a parsed/server field or an arbitrary extra, is refused with `invalid_native_artifact`. The strict Zod metadata schema refuses the same extras at the wrapper/endpoint boundary.
- **Owner-declared metadata validated against shared contracts, at the DB boundary too.** `source` (shared list), the shared **real-calendar/ordered `nativePeriodSchema`** (exported from `native-ai-report.ts` — the packet's only edit there — and reused verbatim by the artifact metadata), `marketScope` (shared "country only if exposed" rule, alpha-3) and the GSC Pacific-Time contract are enforced; `declaredProperty`/`reportKind`/`dimension`/`aggregation`/`filters`/`filename`/`capturedAt` are declared, bounded, and never publisher-verified. The **SQL save re-validates all of this independently** (enums — each required enum is guarded as a JSON **string** drawn from its allowlist, so a JSON `null`/missing/wrong-typed value cannot slip through SQL three-valued `NOT IN` logic, where `NULL NOT IN (...)` is `UNKNOWN` rather than `TRUE` — strict shapes, real ordered Gregorian dates via a `::date` cast that rejects `2026-02-30`/`2027-02-29`/`2026-13-01`, GSC timezone, alpha-3/exposed rule, bounded filters, offset-ISO `capturedAt` in `[2020, now]`) so an impossible or forged value cannot enter through a direct RPC call and cannot poison a later read/list. The nullable `timezone`/`country`/`filename` keep their explicit null-or-string handling.
- **DB-derived canonical scope identity (no caller key to forge).** The save RPC **takes no scope-key parameter**; it derives the canonical scope key itself as `sha256` over the ordered, canonicalized declared fields (source / normalized property with scheme+host lowercased but path/query case-significant / reportKind / dimension / aggregation / period start-end / timezone / uppercased country / exposed / filters embedded as a jsonb object so filter key order is irrelevant). Same canonical identity → same key → one lineage; any different meaning → a different key → a separate lineage. `UNIQUE(user,project,scope_key,artifact_sha256)` makes same-bytes+same-scope idempotent; same-scope reimport supersedes the current head; `UNIQUE(user,project,supersedes_id)` blocks forged/competing successors. The client `nativeArtifactScopeKey` (now a bare delegate to the PR137 `nativeSnapshotScopeKey`, which already folds in `aggregation`) is a client-visible **predictor** of that identity used only in tests, not an authority: a forged or unrelated key can no longer be supplied.
- **Bounded, opaque bytes; strict base64 at the DB, no execution/fetch/extraction.** Encoded body length-bounded (2 796 204 = base64 of 2 MiB), strict-base64-regex-checked and length-multiple-of-four-checked **before** decode; after decode a **canonical round-trip** (`replace(encode(decode(x)),'\n','')=x`) rejects embedded whitespace, misplaced padding, non-alphabet characters and non-canonical trailing-bit encodings, and the actual byte bound (1–2 MiB) is re-checked. No JSON parse, no archive extraction, no file-format assumption, no fabricated CSV headers. Corrupt or non-canonical encoding and oversize bodies are refused, never coerced or partially stored.
- **Auth, quota, race-safety, non-destructive deletion.** Every RPC runs `assert_knowledge_project` (owner/project, `FOR UPDATE` account lock on write), so count/byte quotas are held transactionally. Per-project caps (20 artifacts incl. versions/corrections; 40 MiB raw bytes — coincident at the 2 MiB per-artifact cap) with no eviction and no raise. List returns bounded metadata only (never 20×2 MiB); single retrieval is explicit + authenticated and returns exact bytes as base64 (JSON export retains bytes verbatim; `escapeForSpreadsheet` is not applied to canonical JSON and is reserved for a real spreadsheet/CSV path in P5). **Deletion removes only the selected artifact's row and raw bytes and frees only its quota:** the self-FK is `NO ACTION` (not `CASCADE`), and `remove_*` atomically unlinks any direct successor (`supersedes_id → NULL`) before deleting, so erasing a predecessor never destroys a distinct later version the owner kept — the successor survives as a lineage root and a subsequent same-scope reimport supersedes the surviving head. When a direct predecessor is removed the orphaned successor also records a **server-derived `predecessor_deleted=true` marker** (returned and validated through save/list/get), so a partial-history gap is visible in the data — a genuine first version stays `false` and is distinguishable from an orphaned root — while no deleted id/metadata/bytes are retained and it is never caller-writable; this flags, but does not prove complete, lineage. Project deletion still CASCADEs the whole set via the `workspace_entities` FK.

## Corrections in this packet (Codex source review + independent PGlite probes)

Six material bugs found against the actual source were corrected, each now covered by a regression (the first four from the earlier Codex source review + PGlite probes, the last two completed in this worktree):

1. **Impossible dates accepted** (`impossibleDateAccepted=true` for `2026-02-30`). The metadata schema had a shape-only `isoDate` regex and the SQL never validated dates. Now the metadata reuses the shared real-calendar/ordered `nativePeriodSchema` (its `export` is the packet's only `native-ai-report.ts` change) and the SQL enforces real ordered Gregorian dates and the GSC timezone at the DB boundary; invalid metadata cannot persist to poison a read/list.
2. **Newer version destroyed on predecessor delete** (`NewerVersionSurvivedPredecessorDelete=false`). The self-FK `ON DELETE CASCADE` erased successors. Now the self-FK is `NO ACTION` and `remove_*` atomically unlinks the direct successor before deleting, so only the selected artifact's bytes/quota leave; the deleted-predecessor history gap is now recorded in the data itself by the `predecessor_deleted` marker (correction 6), so an orphaned lineage root is distinguishable from a genuine first version and never presented as a complete lineage.
3. **Forged scope accepted** (`ForgedScopeAccepted=true` with `p_scope_key='forged-unrelated-key'`). The caller supplied the scope key. Now there is **no scope-key parameter**: the DB derives the canonical identity from strictly-validated metadata, with property scheme/host canonicalized, path/query case-significant, and filter key order irrelevant.
4. **Permissive base64 at the DB.** `decode(...,'base64')` tolerated whitespace/non-canonical input. Now the SQL bounds the encoded length before decode, applies the strict base64 regex + multiple-of-four check, and requires a canonical round-trip after decode. No new dependencies.
5. **Null / wrong-typed required enum accepted at the DB** (independent PGlite proof `/tmp/milo-artifact-p1-null-probe-20260919.mjs` + `.log`: `nullAccepted:true` for each of `source`, `reportKind`, `dimension`, `aggregation`). A bare `p_metadata->>'k' NOT IN (...)` yields `UNKNOWN` for a JSON `null` (three-valued logic), so the `IF` did not reject and an off-contract row could persist and then break the strict read/list parse for the whole project. Now each required enum is guarded with `jsonb_typeof(...)='string'` before the `NOT IN`, refusing null/missing/wrong-typed values; the nullable `timezone`/`country`/`filename` keep their explicit null-or-string handling, and the remaining guards were audited for the same `NOT IN`/`<>` NULL gap (the enum four were the only cases; `declaredProperty`/`capturedAt` already used `jsonb_typeof='string'`, and `period`/`marketScope`/`filters` are object-typed with `?&`-required keys and `jsonb_typeof`-checked sub-fields).
6. **Deleted-predecessor gap invisible in data.** `remove_*` left the orphaned successor at `supersedes_id=NULL`, indistinguishable from a genuine first version; the gap was only asserted in a comment. Now `remove_*` additionally sets a **server-derived `predecessor_deleted=true`** marker on that direct successor (and only then), returned/validated through save/list/get; a genuine new root stays `false`, the marker is not caller-writable and retains no deleted id/metadata/bytes. A later chain can detect the partial history without it being presented as complete lineage proof.

## Tests prepared (offline, synthetic; NOT RUN here — Codex runs them after staging)

- `native-ai-artifact-migration.test.ts` (PGlite, real server round-trips + raw SQL boundary probes): server-derived sha (asserted against an in-test `node:crypto` sha256) / DB-derived scope hash / pending status / actor; list omits bytes; single retrieval decodes to the original bytes; idempotent same-scope+same-bytes; **canonical equivalence collapses (scheme/host case, country case, filter order) while different meaning does not (path case, filter value)**, aligned with the client predictor; distinct scope (aggregation / period / filters) never collapses; same-scope reimport supersedes the head; competing successor rejected; **predecessor deletion (oldest / middle / latest) never cascades away a kept later version, frees only the deleted quota, leaves the unrelated lineage, and re-heads reimports correctly**; a **server-derived `predecessor_deleted` marker set only on the direct successor of a removed predecessor (oldest / middle / latest), left `false` on a genuine root and on a further-down chain link, and preserved across an idempotent restage**, with no unintended cascade/quota on a head deletion; impossible/reversed periods and wrong/missing GSC timezone refused at the DB while a real leap day and the correct GSC timezone are accepted; forged server/parsed fields and arbitrary/off-contract keys refused; **null / missing / wrong-typed required enums (`source`/`reportKind`/`dimension`/`aggregation`) refused directly at the DB with no row persisting and a valid stage/list still working**; strict base64 (oversize / whitespace / bad padding / non-multiple-of-four / non-alphabet / non-canonical alias) refused while a valid opaque body round-trips; owner/project isolation for list/get/remove; 20-artifact cap boundary and deletion-frees-quota; project-delete CASCADE; RLS denies anon/authenticated/service_role direct reads while `service_role` may call the list RPC.
- `native-ai-artifact.functions.test.ts` (mocked server): four endpoints require auth; reads/staging bind to the authenticated owner; foreign `expectedOwnerId` → `owner_changed`; caller-supplied owner, malformed project id, forged metadata extra, GSC-missing-timezone, impossible calendar date and non-base64 body all refused; removal owner-switch never touches storage.

These deliberately assert behavior (server-derived hash/scope, canonical equivalence, non-destructive deletion, date/timezone/base64 refusal, cap/quota), not code structure. **No pass counts are claimed and no concurrency is claimed** — the PGlite harness is a single connection, so it verifies logical guards (unique supersession, transactional caps under the `FOR UPDATE` lock), not true concurrent races; and the recorded sandbox `posix_spawn` E2BIG condition blocks `vitest`/`tsc`/`eslint`/`prettier` at dispatch, so Codex runs and formats them under the recorded exception.

## Corrected full v1 sequence (not narrowed)

P1 (this packet) raw-artifact staging → P2 panel/session protocol + embedded capture-context (reuse `ai_answer_evidence.document`) + dated owner-confirmed business facts (server-derived classification/reviewer; source-helper reference binding does not authenticate client claims, so storage resolves actual trusted records) → P3 findings/improvements + atomic deletion rules (dependencies invalidate inspectable claims) → P4 review UI (draft → lock → intake → findings → Plan/Studio change → receipt → re-test/report) → P5 native column parser + preflight, only after a genuine export, transitioning staged `pending_parser` artifacts into parsed snapshots (or an explicit `unsupported` status — never claiming raw bytes parse). No whole-framework or five-new-tables mandate.

## Outstanding real-acceptance gates (unchanged, cannot be self-certified)

Genuine authorized native exports (availability stays unknown until parsed), the owner-locked panel, the four-week manual ChatGPT-Search captures, two distinct destination-verified improvements and one comparable re-test. This packet, its mocks and this document are preparation, not that acceptance.

## Codex independent verification and integration — 19 September, 17:17 UTC

The integrated source base is main `26b938c3`; initial P1 source commit `052d9532`
was integrated as `eadd6beb`. The independent actual-PGlite null probe now refuses
all four required enum nulls (previous evidence accepted all four). The final
focused artifact and full-chain set passed **37 tests / 3 files**, and the final
full suite passed **6057 tests / 379 files** in 51.20 seconds. Type checking,
scoped ESLint, whitespace checks and production build passed. Logs:
`/tmp/milo-artifact-p1-final-focused-20260919.log`,
`/tmp/milo-artifact-p1-chain-focused-20260919.log`,
`/tmp/milo-artifact-p1-final-full-20260919.log`,
`/tmp/milo-artifact-p1-integrated-types-20260919.log`,
`/tmp/milo-artifact-p1-build-20260919.log`.

The first integrated suite had one inventory failure: its explicit migration
list omitted the new candidate and still called the eight released conversation
migrations unapplied. Codex reconciled this integration test with the verified
release receipt, retained execution of all real prerequisites, and added all four
new RPC grant checks plus the new table's closed-access check. The unknown-future-
migration failure remains in place. This minimal integration-test change,
Prettier formatting and one ESLint prefer-const fix are recorded exceptions to
Claude's source/test authorship; application and SQL implementation remain Claude's.
The repeated full run above followed that integration correction; no assertion
was skipped or weakened.

Read-only production preflight: artifact table absent, candidate journal count 0,
`assert_knowledge_project(uuid,text,boolean)` present, conversation dispatch OFF.
No P1 SQL applied, no live upload/parse/pilot claim. P1 has server functions but
no user-facing intake yet; P4 supplies that UI, and P5 requires genuine exports.

## PR144 review correction — aggregate declared-metadata byte cap (P2 4053980122), 19 September

External review completed (code 17:20:22, security 17:20:54) with one P2 finding
(4053980122) against the save-RPC candidate at SQL line 59. The database bounds the
whole metadata object at `octet_length(metadata::text)<=8000` UTF-8 bytes (table
CHECK line 18 and the save RPC guard), but the shared Zod metadata schema only
bounded each field on its own — up to 20 filters of a 200-**character** value, a
500-char `declaredProperty`, a 255-char `filename`. Those per-field maxima **sum**:
20 filter values of 200 CJK characters are ~12 KB of UTF-8 (each ideograph is one
JS char but three bytes), so a payload every field validated as in-bounds could
clear the boundary and then fail the RPC with the generic `native_artifact_unavailable`
size error. The finding is a validation/size-alignment gap, not a data-safety hole:
no forged attribution, no cap raise, and the DB always refused the oversize row.

Correction (source/tests/docs only; **no SQL/migration change**, the 8 000-byte DB
cap is unchanged and stays authoritative):

- `src/lib/native-ai-artifact.ts` — added `MAX_NATIVE_ARTIFACT_METADATA_BYTES = 8000`
  (a documented shared constant that mirrors the migration's literal, not a new DB
  limit) and `nativeArtifactMetadataJsonbBytes`, an **exact** projection of
  PostgreSQL's canonical `jsonb::text` byte length. It accounts for jsonb's
  formatting overhead — one space after every `:` and every `,` (never against a
  `{}`/`[]` bound) — measures **UTF-8 bytes** (not JS UTF-16 char length), escapes
  exactly the JSON control set (byte-identical to `JSON.stringify` for a string body,
  non-ASCII kept raw), and relies on this metadata having only string/boolean/null/
  nested-object values (no numbers or arrays, whose canonicalization would differ) and
  on jsonb key order not changing the byte count. The shared metadata schema's
  `superRefine` now rejects any declared metadata whose projected bytes exceed the cap,
  so the check runs at the public input boundary (stage input, endpoint) and is the
  same conservative-but-exact bound the DB applies — an accepted canonical payload can
  no longer fail *only* on DB size, and no accepted input exceeds the DB's 8 000 bytes.
  Read-back is unaffected: stored metadata was already `<=8000`, and the projection
  equals the DB `octet_length`, so summaries/details/state never spuriously reject.
- Raw artifact bytes are untouched (metadata-only change); no parser, no new metric,
  no new endpoint, and no relaxation of any prior null/date/base64/auth/history-marker/
  scope/cap guard.

New regressions added to `native-ai-artifact-migration.test.ts` (real PGlite SQL),
each targeting the finding and its alignment with the actual database:

- a per-field-valid payload (20 filters, each key `<=64` and value exactly 200 CJK
  chars) whose aggregate exceeds the cap is refused at the client boundary **before
  any RPC** (no row created) **and** refused by the database itself via `rawSave`
  (`invalid_native_artifact`), proving the boundary mirrors a real DB rejection rather
  than an invented undersized limit;
- a multibyte payload packed to just under the cap (bounded by bytes, not the 20-filter
  count) stages, retrieves byte-exactly, and its stored `octet_length(metadata::text)`
  equals the client projection and stays `<=8000`; adding one further in-bounds filter
  crosses the cap and is refused by both the schema and the DB;
- for ASCII, multibyte, escaping-heavy (quote / backslash / newline / tab / control
  char) and spacing-sensitive (20 tiny filters maximizing `", "`/`": "` overhead)
  payloads, the client projection equals the DB canonical `octet_length` exactly, so a
  JS-accepted canonical payload cannot fail solely on the database size check.

These new checks and a re-run of the full suite/types/build are **NOT RUN in this
worktree** (Codex executes the prepared checks). The previously recorded **6057
tests / 379 files**, type-check, scoped ESLint, whitespace and production-build passes
were the **prior integration stage only** (17:17 UTC) and are not re-asserted here;
this correction adds three real-SQL regressions whose results are pending Codex's run.

### Codex validation of PR144 metadata-byte correction — 2026-09-19

The three new real-SQL regressions pass. Focused artifact tests: **22/22 in 2 files**; full suite: **6060/6060 in 379 files**, 47.05 s. TypeScript, scoped ESLint, whitespace check and production build pass. Logs: `/tmp/milo-artifact-byte-{focused,types,full,build}-20260919.log`. These supersede the preceding correction's UNRUN status, without changing the historical prior-stage results. Exact UTF-8 accounting was compared against PGlite jsonb text for multibyte, ASCII, escape-heavy and separator-heavy metadata. No SQL applied, no upload UI enabled, no live artifact acceptance claimed.

## PR144 review correction — base64 decoded-byte boundary (finding 4054080563), 19 September

External review 5256813193 raised one finding (4054080563) against `nativeArtifactBase64Schema`
at HEAD `5896b55b`. `MAX_NATIVE_ARTIFACT_BASE64` (2 796 204) caps only the *encoded* length, and the
canonical base64 of 2 097 153 decoded bytes (2 MiB + 1, no padding) is the **same length** as
2 097 152 bytes (2 MiB, one `=`) — so the public schema accepted a one-byte-oversize body that the SQL
byte bound then refused with the generic `native_artifact_unavailable` size error. Codex inspected the
schema and save/stage path and confirmed the arithmetic gap; the DB byte cap already protected storage,
so this is an input-boundary alignment fix, not a data-safety hole (no forged attribution, no cap raise).

Correction (source/tests/docs only; **no SQL/migration change**, the 1–2 MiB DB byte bound is unchanged
and stays authoritative):

- `src/lib/native-ai-artifact.ts` — added `nativeArtifactBase64ByteLength`, an O(1) pre-decode
  projection of the decoded byte count from the string length and trailing padding (no decode, no large
  allocation), and a `nativeArtifactBase64Schema` refine that enforces the real `MAX_NATIVE_REPORT_BYTES`
  cap on that count — catching the 2 MiB + 1 body whose encoded length equals the 2 MiB body's. The
  unchanged 2 MiB limit, the `.max()` encoded-length ceiling, the strict alphabet regex and the
  multiple-of-four refine are all preserved. A second refine mirrors the DB's **canonical trailing-bit
  padding**: one `=` requires the final data char's alphabet index to be a multiple of 4
  (`[AEIMQUYcgkosw048]`), `==` a multiple of 16 (`[AQgw]`), refusing a non-canonical alias such as `Qh==`
  (canonical `Qg==`) at the boundary as the DB's canonical round-trip already does. Nothing decodes or
  rewrites owner bytes; the DB re-enforces every guard.
- No parser, no new metric/endpoint/UI, and no relaxation of any prior null/date/metadata-byte/auth/
  history-marker/scope/cap guard. The P2 panel/session protocol, chat/candidate-chain files and the SQL
  are untouched.

New regressions added to `native-ai-artifact-migration.test.ts` (existing artifact test file):

- `2 MiB - 1` / `2 MiB` / `2 MiB + 1` zero-filled bodies confirmed to share the identical
  `MAX_NATIVE_ARTIFACT_BASE64` encoded length while carrying two / one / zero `=`; the pre-decode
  arithmetic recovers each true byte count, and the schema accepts the two in-cap bodies and rejects the
  `+1`;
- exactly 2 MiB stages and round-trips to the exact bytes through real SQL, whereas `2 MiB + 1` of the
  identical encoded length is refused at the client boundary **before any RPC** (no row created) and the
  DB itself still refuses that oversize body via `rawSave` — the boundary mirrors a real DB rejection;
- short canonical/non-canonical padding pairs (`Qg==` vs `Qh==`, `AAA=` vs `AAB=`) accepted/refused at the
  schema, and a canonical short body passes through byte-for-byte.

These new checks and a re-run of the full suite / types / build are **NOT RUN in this worktree** (Codex
executes the prepared checks). The **6060 tests / 379 files**, type-check, scoped ESLint, whitespace and
production-build passes recorded above were the **prior stage only** (the metadata-byte correction) and
are **not re-asserted** for this base64 change; results for these regressions are pending Codex's run. No
SQL applied, no upload UI enabled, no live artifact acceptance claimed; the USD50-global / manual-free
budget and every scope/security boundary are unchanged.

### Codex verification of decoded-byte correction — 19 September 2026

After explicit owner authorization for scoped Claude file tools, the author applied this correction with zero permission denials. Independent delta review confirms exact decoded-byte arithmetic and canonical trailing-bit checks preserve the 2 MiB cap without decoding or changing raw input.

**25 focused tests/2 files PASS**, **6063 full-suite tests/379 files PASS** (97.38 s); TypeScript, scoped ESLint, whitespace and production build PASS. Logs `/tmp/milo-artifact-decoded-{focused,types,full,build}-20260919.log`. Codex integration exception: Prettier corrected one line wrap in the authored migration test after lint identified it; no application behavior authored by Codex. No SQL applied or real upload accepted in production.

## PR144 review correction — capacity-code passthrough + UTF-16 free-text bounds (findings 4054786664, 4054786666), 19 September

Code review 21:23:39 raised two P2 findings against HEAD `06b497d1`; the security review at
21:23:01 (comment 5745398466) was clean. Codex inspected the server `call()` wrapper (line 28) and
the SQL `char_length` filter guard (line 127) and confirmed both. Source/tests/docs only; **no cap
raise, no shared native `.ts` helper rewrite, no parser/UI/P2/chat/inventory change**.

- **Finding 4054786664 — generic wrapper swallowed the deterministic capacity refusal.**
  `src/lib/native-ai-artifact.server.ts` collapsed *every* RPC error to `native_artifact_unavailable`,
  so an owner who hit the per-project cap got an opaque "unavailable" instead of the actionable capacity
  signal. The `call()` wrapper now surfaces exactly the DB's allowlisted capacity codes —
  `native_artifact_capacity` (20-artifact count cap) and `native_artifact_byte_capacity` (40 MiB raw-byte
  quota), both resolvable by deleting an artifact — verbatim, while **every** other failure (validation,
  auth, a missing row, any raw database error, network, or the client-side timeout) still collapses to the
  generic code. Only those two exact tokens pass an allowlist `Set` membership check on the error message,
  so no raw database text escapes and unknown/auth/network failures stay opaque. No client-side count
  precheck was added (race-unsafe); the deterministic refusal comes from the DB's transactional check, and
  a same-scope+same-bytes re-stage still short-circuits to the existing row *before* the cap check.
- **Finding 4054786666 — DB counted code points where Zod counts UTF-16 units.** The SQL bounded every
  free-text metadata field with `char_length` (Unicode code points), but Zod and every strict read/list
  parse bound by UTF-16 code units, and a supplementary (astral, > U+FFFF) character is one code point yet
  two units. A direct service RPC could therefore persist e.g. a 150-emoji filter value (150 code points
  ≤ 200, but JS length 300) that then failed the whole project's strict list/get parse. The candidate
  migration `20260919150000_native_report_artifacts.sql` (still **UNAPPLIED**, edited in place) gains an
  internal `public.native_artifact_utf16_length(text)` — `IMMUTABLE`, `search_path=''`, EXECUTE revoked
  from PUBLIC/anon/authenticated/service_role and reached only by the SECURITY DEFINER callers as owner —
  computing `char_length + (count of 4-byte UTF-8 code points)`, i.e. UTF-16 units, with `char_length('')=0`
  preserving the existing 1..N lower bounds. It replaces `char_length` in the bounds for **every** bounded
  free-text field: `declaredProperty` (500), filter keys (64) / values (200), `filename` (255) and
  `timezone` (64). The 8 KB UTF-8 metadata cap, raw bytes, null/date/base64/scope-history rules and the
  nullable timezone/country/filename branches are all unchanged, and no TypeScript length contract moved.

New/updated regressions in `native-ai-artifact-migration.test.ts` (existing artifact test file):

- the capacity test now asserts the exact `native_artifact_capacity` code is surfaced at the real
  20-artifact cap, that an idempotent same-scope+same-bytes re-stage still succeeds at capacity, and that
  deletion frees quota;
- a wrapper-mapping test (injected RPC stubs) confirms both allowlisted capacity codes pass through
  verbatim while `invalid_native_artifact`, `native_artifact_too_large`, a `permission denied` string, a
  network drop and a unique-violation string all collapse to exactly `native_artifact_unavailable` (raw
  text never leaked);
- a data-driven real-SQL test drives astral boundaries via `rawSave` for filter value/key,
  `declaredProperty`, `filename`, Bing `timezone` and a mixed BMP+astral value: one UTF-16 unit over the
  cap is refused with no poison row, exactly at the cap is accepted and the list stays readable through the
  strict Zod parse; plus null-timezone/null-filename Bing acceptance and a full client+DB round-trip of an
  at-cap astral filter value with the over-cap value refused before the RPC. The existing ASCII/CJK
  metadata-byte and base64 decoded-cap regressions are untouched (BMP CJK has no astral chars, so its
  UTF-16 length equals its code-point count and those bounds are unchanged).

These new checks and a re-run of the full suite / types / build are **NOT RUN in this worktree** (Codex
executes the prepared checks). The prior stage recorded **6063 tests / 379 files** (the base64
decoded-byte correction, run by Codex above); that figure is the **prior stage only** and is **not
re-asserted** for this change — results for these regressions are pending Codex's run. No SQL applied, no
upload UI enabled, no live artifact acceptance claimed; the USD50-global / manual-free budget and every
scope/security boundary are unchanged.

### Codex verification of capacity and Unicode correction — 19 September 2026

Independent delta review confirmed the exact capacity-code allowlist and closed internal SQL helper align stored text with the existing UTF-16 schema bounds. **35 focused tests/2 files PASS** (1.31 s), **6073 full-suite tests/379 files PASS** (62.12 s); TypeScript, scoped ESLint, whitespace and production build PASS. Logs: `/tmp/milo-artifact-unicode-{focused,types,lint,full,build}-20260919.log`. Boundary fixtures cover accepted and rejected astral/mixed values; some exceed by two UTF-16 units, and the filename accepted fixture is 254 units against a 255-unit cap (the earlier “one unit / exactly at cap” prose is not literal for every fixture). No live upload or parser acceptance is claimed; the candidate migration remains unapplied. Claude authored application/SQL/tests; Codex ran checks and recorded this evidence.

## PR144 review correction — capturedAt persistence/reader parity (finding 4054871438), 19 September

New-code review raised one P2 finding (4054871438) against HEAD `f150622a`; the security review
(comment 5745551780) was clean. Independently reproduced with actual PGlite + Zod: the string
`2026-08-29T24:00:00Z` **casts successfully** in PostgreSQL (`::timestamptz` rolls hour `24` over to the
next midnight, `2026-08-30T00:00:00Z`), but the read-back Zod `z.string().datetime({offset:true})`
**rejects** hour `24`. The candidate save RPC's `capturedAt` regex used `\d{2}:\d{2}:\d{2}`, which admits
`24` (and `60` minutes/seconds), and then stores the ORIGINAL string verbatim — so a direct service RPC
could persist an off-contract `capturedAt` that fails the strict list/get parse for the whole project.
The DB always cast to a real instant; the gap is persistence/reader parity, not attribution or a cap.

Fix (candidate migration `20260919150000_native_report_artifacts.sql` only, still **UNAPPLIED**; no
public-schema/cap change, no coercion):

- The `capturedAt` regex now bounds the time components to exactly the reader's ranges — hour
  `([01]\d|2[0-3])`, minute and second `[0-5]\d`, an optional `(\.\d+)?` fraction, and a terminating
  uppercase `Z` or `[+-]\d{2}:\d{2}` offset — closing the whole rollover/leap-second class (hour 24,
  minute 60, second 60) while retaining the existing rejection of lowercase-`t`/`z` and space-separator forms.
  The `::timestamptz` cast still enforces the real calendar (e.g. `2026-02-30` raises and is refused) and
  the `2020-01-01..now` instant, and the original valid string is stored verbatim. The offset stays
  colon-required, which is stricter than the reader's optional-colon form: that only refuses writes, it
  never persists a value the reader cannot read, so it introduces no poison.

New regressions in `native-ai-artifact-migration.test.ts` (existing artifact test file), table-driven,
real SQL via `rawSave` (which bypasses the client schema, the exact direct-RPC path):

- seven rejected `capturedAt` strings — hour `24` (the finding), minute `60`, second `60`, lowercase `t`,
  lowercase `z`, a space separator and a missing zone — each asserted rejected by BOTH the reader schema
  (`safeParse` false) and the DB (`invalid_native_artifact`), with no row persisted and a valid stage +
  list still readable afterward;
- one write-only tightening — an omitted-seconds `capturedAt` (`2026-08-29T12:00Z`) that the reader
  **accepts** (`safeParse` true) but the DB refuses because it requires `HH:MM:SS`. It is asserted as a
  reader-accept / DB-reject case, **not** a mutual rejection: refusing it at write never persists an
  unreadable row, so it introduces no poison. (The earlier both-reject categorization of this one string
  was the sole focused-run failure and is corrected here; the DB regex is unchanged.)
- seven accepted boundary strings — canonical midnight, the maximum in-day time `23:59:59Z`, a fractional
  second, positive and negative offsets, a real leap day `2024-02-29`, and the inclusive lower instant
  bound `2020-01-01T00:00:00Z` — each asserted reader-valid, accepted by the DB, stored **verbatim**, and
  readable back through the strict schema. These fixtures verify reader compatibility for the tested accepted values; they do not prove
  equivalence for every possible timestamp.

Codex's first focused run of this packet was **49 PASS / 1 FAIL / 2 files** (not a complete pass): the
single failure was the omitted-seconds fixture, mis-categorized as a mutual rejection when the reader in
fact accepts it. TypeScript passed; lint reported only two Prettier-format items on the new test lines
(780 / 793), which Codex formats after this edit. This narrow test/docs recategorization fixes that one
failure without changing the SQL or public schema; the corrected checks and a re-run of the full suite /
types / build are **NOT RUN in this worktree** (Codex executes them), so no complete pass is claimed. The
capacity + UTF-16 stage — **35 focused / 2 files** and **6073 / 379 files** (run by Codex above) — is the
**prior stage only** and is **not re-asserted** for this change. No SQL applied, no upload UI enabled, no
live artifact acceptance claimed; the USD50-global / manual-free budget and every scope/security boundary
are unchanged.

### Codex timestamp correction verification — 20 September 2026

Corrected test categorization passes: 50 focused tests/2 files (1.34 s), 6088 full-suite tests/379 files (46.51 s), types, scoped lint and build. Logs `/tmp/milo-artifact-time-final-{focused,types,lint}-20260919.log` and `/tmp/milo-artifact-time-{full,build}-20260919.log`. Codex integration exception: test-only Prettier formatting and evidence wording correction to avoid claiming universal timestamp equivalence. Candidate remains unapplied; no live artifact acceptance.

## PR144 review correction — staging input applies the DB timestamp grammar (finding 4054952996), 20 September

New-code review raised one P2 finding (4054952996) against HEAD `3bdb58a`; the security review
(comment 5745686496) was clean. Codex confirmed the input/DB grammar mismatch: the public stage-input
metadata reuses the shared reader schema, whose `.datetime({offset:true})` accepts an omitted seconds
field (`12:00Z`) and a colon-less offset (`+0200`), but the save RPC requires `HH:MM:SS` plus a colon
offset. The prior packet kept the stricter DB rule (to prevent a read-poisoning row), which is correct,
but a valid-looking submission still cleared the public schema and then failed the RPC with a generic
`native_artifact_unavailable` — a UX gap at the write boundary, not a data-safety hole.

Fix (input-only; **no SQL/migration change** — the candidate stays UNAPPLIED and its DB grammar is
unchanged and never loosened, and no timestamp is coerced):

- `src/lib/native-ai-artifact.ts` adds `NATIVE_ARTIFACT_CAPTURED_AT_RE`, a TS regex mirroring the save
  RPC's `capturedAt` grammar exactly — required `HH:MM:SS` (hour 00-23, minute/second 00-59), optional
  `.fraction`, terminating uppercase `Z` or colon offset `[+-]HH:MM` — and a staging-only
  `nativeArtifactStageMetadataSchema` (the shared metadata schema plus one field-specific `capturedAt`
  `superRefine`). `nativeArtifactStageInputSchema` now uses that stricter metadata, so **both** consumers
  of the stage boundary — the `stageNativeArtifactFn` server function (via `.shape`) and the
  `stageNativeArtifact` server wrapper (via `.parse`) — reject a DB-incompatible `capturedAt` up front
  with a `metadata.capturedAt` field error. The shared `nativeArtifactMetadataSchema` used for read-back
  (summary/detail/state) is **unchanged**, so already-stored values (always DB-grammar by construction)
  keep parsing and historical reader compatibility is retained. The stage input object keeps its `.shape`
  (the refinement lives on the metadata field, not the top-level object), so the server function's
  `scope.extend(nativeArtifactStageInputSchema.shape)` merge still works.

New regressions in `native-ai-artifact-migration.test.ts` (existing artifact test file), table-driven:

- two reader-valid-but-DB-incompatible `capturedAt` forms — omitted seconds `2026-08-29T12:00Z` and
  colon-less offset `2026-08-29T12:00:00+0200` — each asserted still accepted by the shared reader schema
  (`safeParse` true, read-back compatibility) yet refused by `nativeArtifactStageInputSchema` with a
  `metadata.capturedAt` issue path AND refused end-to-end by `stage(...)` before any RPC (no row created);
- four canonical forms — `Z`, a fractional second, and `+02:00` / `-05:30` colon offsets — accepted at
  the stage input boundary and staged through real SQL, with `capturedAt` stored and read back verbatim.

These new checks and a re-run of the full suite / types / build are **NOT RUN in this worktree** (Codex
executes the prepared checks). The prior stage recorded **50 focused / 2 files** and **6088 / 379 files**
(the capturedAt DB-grammar correction, run by Codex above); that figure is the **prior stage only** and is
**not re-asserted** for this change — results for these new regressions are pending Codex's run. No SQL
applied, no upload UI enabled, no live artifact acceptance claimed; the USD50-global / manual-free budget
and every scope/security boundary are unchanged.

### Codex staging-input and current-main integration verification — 20 September 2026

Staging-input delta56 focused/2 PASS(1.36s), types PASS. Normal merge includes released diagnostic main b441a9e7. Candidate-chain resolution retained artifact and diagnostic grant checks, marked160000 released and left150000 as the only candidate. Integrated76 focused/3 PASS(1.58s), full6137 tests/381 files PASS(43.64s), types/scoped lint/whitespace/build PASS. Logs `/tmp/milo-artifact-integrated-{focused,types,lint,full,build}-20260920.log`. Codex integration exceptions: one test line-wrap formatting fix and migration-inventory merge resolution; application behavior remains Claude-authored. No artifact SQL applied or live acceptance claimed.

## PR144 review correction — normalize thrown/rejected rpc errors in call() (finding 4055003613), 20 September

Codex verified this finding against exact head `c746ebb2`: `native-ai-artifact.server.ts`'s `call()`
had a `finally` (timer cleanup) but **no `catch`**, so only a RETURNED `r.error` passed through the
`surfacedArtifactError` allowlist — a rejected or synchronously-thrown rpc promise (a transport/client
failure, the dynamic `import`, or the 10 s timeout) escaped to the caller with its **raw message intact**,
potentially leaking internal text through the client-visible error surface. The regression tests use synthetic error messages; no actual secret exposure was observed.

Fix (`src/lib/native-ai-artifact.server.ts` only; no SQL/UI/schema change):

- Added a private `NativeArtifactError extends Error` marker and a `catch` to `call()`. The returned-error
  path now throws a **branded** `NativeArtifactError(surfacedArtifactError(r.error))`, so the two exact
  capacity codes (`native_artifact_capacity`, `native_artifact_byte_capacity`) still surface verbatim and
  any other returned error collapses to `native_artifact_unavailable`. The `catch` **rethrows a branded
  error verbatim** but normalizes **every other** thrown/rejected value — a rejected/synchronously-thrown
  rpc promise, the dynamic import, and the timeout — to the generic `native_artifact_unavailable`, so no
  raw or secret-like text escapes. A capacity code is preserved only when it arrives as the DB's RETURNED
  response; the same token arriving as a REJECTION is treated as an ambiguous transport failure (generic),
  and no ambiguous write is retried on its basis. The `finally` timer cleanup is unchanged. The stage-only
  `capturedAt` timestamp refinement from the prior packet is untouched and was not reimplemented.

New regressions in `native-ai-artifact-migration.test.ts` (existing artifact test file), injected-rpc
stubs (no DB needed for the mapping cases):

- a rejected rpc promise carrying a secret-like internal message (a `password=`, a DNS `ENOTFOUND`, a
  leaked service key) collapses to exactly `native_artifact_unavailable`;
- a synchronously-thrown rpc collapses to the generic code;
- a RETURNED `native_artifact_capacity` is surfaced verbatim, while the same token arriving as a REJECTION
  collapses to the generic code (rejection is transport, not the DB's cap signal);
- a successful response returns its data and, under fake timers, leaves `vi.getTimerCount()` at 0 —
  verifying the timeout timer is cleared.

These new checks and a re-run of the full suite / types / build are **NOT RUN in this worktree** (Codex
executes the prepared checks). The prior stage recorded **50 focused / 2 files** and **6088 / 379 files**
for the staging-input correction, since integrated by Codex to **6137 tests / 381 files** (above); those
figures are the **prior stage only** and are **not re-asserted** for this change — results for these new
regressions are pending Codex's run. No SQL applied, no upload UI enabled, no live artifact acceptance
claimed; the USD50-global / manual-free budget and every scope/security boundary are unchanged.

### Codex RPC-error correction verification — 20 September 2026

Reviewed the completed wrapper delta: no ambiguous-write retry; only mapped returned capacity errors survive, other thrown/rejected values become generic.60 focused tests/2 files PASS(1.38s), full6141 tests/381 files PASS(42.51s), types/scoped lint/whitespace/production build PASS. Logs `/tmp/milo-artifact-rpc-{focused,types,lint,full,build}-20260920.log`. No SQL, provider call, deployment or live artifact acceptance. Claude authored source/tests; Codex corrected an unsupported evidence assurance and recorded executed checks.

## PR144 review correction — bound the staging capturedAt offset to PostgreSQL's displacement range (finding 4055076298), 20 September

Codex independently confirmed against exact head `648e5395`: the stage-input `capturedAt` grammar
(`NATIVE_ARTIFACT_CAPTURED_AT_RE`) permitted the offset `[+-]\d{2}:\d{2}`, which accepts `+16:00` and
unrestricted minute digits (`+01:60`). The reader Zod / `Date.parse` also tolerate `+16`, but PostgreSQL
rejects any UTC displacement outside ±15:59 — Codex's actual PGlite casts: `+15:59` accepted, `+16:00`
and `+01:60` rejected with SQLSTATE 22009. So a valid-looking out-of-range offset cleared the public
schema and then failed the RPC with a generic `native_artifact_unavailable`. Client-boundary UX only; the
DB always rejected the value at the cast.

Fix (`src/lib/native-ai-artifact.ts` only; **no SQL change** — the DB already rejects an out-of-range
displacement via the cast, so its regex/released paths are untouched; no coercion or normalization):

- `NATIVE_ARTIFACT_CAPTURED_AT_RE`'s offset alternative is now `[+-](0\d|1[0-5]):[0-5]\d` — hour `00..15`,
  minute `00..59`, both signs — matching PostgreSQL's accepted ±15:59 range while the already-required
  `HH:MM:SS`, colon and uppercase `Z`/`T` are preserved. Only the staging boundary tightens; the shared
  `nativeArtifactMetadataSchema` used for read-back keeps `.datetime({ offset: true })`, so an
  already-stored value (always ≤ ±15:59 by the cast) stays readable, and the finite `Date.parse` /
  2020..now instant-range semantics in the shared superRefine are unchanged.

New regressions in `native-ai-artifact-migration.test.ts` (existing artifact test file), table-driven:

- four out-of-range offsets — `+16:00`, `-16:00`, `+01:60`, `+15:60` — each refused by
  `nativeArtifactStageInputSchema` (a `metadata.capturedAt` issue path) AND by `stage(...)` before any RPC
  (no row created);
- the shared reader schema still accepts `+16:00` / `-16:00` (read-back compatibility preserved, so the
  write-only tightening never rejects a stored value);
- boundary and normal offsets — `+15:59`, `-15:59`, `+00:00`, `-05:30`, `Z`, and the lower instant bound
  `2020-01-01T00:00:00Z` — accepted at the stage input and round-tripped through real SQL, stored and read
  back verbatim (no silent normalization; lower date-boundary semantics unchanged).

These new checks and a re-run of the full suite / types / build are **NOT RUN in this worktree** (Codex
executes the prepared checks). The prior stage recorded **60 focused / 2 files** and **6141 tests / 381
files** (the thrown/rejected-error normalization, run by Codex above); that figure is the **prior stage
only** and is **not re-asserted** for this change — results for these new regressions are pending Codex's
run. No SQL applied, no upload UI enabled, no live artifact acceptance claimed; the USD50-global /
manual-free budget and every scope/security boundary are unchanged.

### Codex offset-boundary verification — 20 September 2026

71 focused tests/2 files PASS(1.40s), full6152 tests/381 files PASS(43.29s), types/scoped lint/whitespace/production build PASS. Logs `/tmp/milo-artifact-offset-{focused,types,lint,full,build}-20260920.log`. Codex exception: one test formatting wrap and comment clarification; source behavior Claude-authored. No SQL change, migration application, deployment or live acceptance.
