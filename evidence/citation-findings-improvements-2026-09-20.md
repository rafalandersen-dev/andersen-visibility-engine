# Citation Intelligence v1 — P3 findings/improvements storage + publication-evidence binding (Claude, 20 September 2026)

Bounded P3 packet on branch `codex/milo-citation-findings-20260920` over released main `faaa195f`. P1
(native raw-artifact staging) is RELEASED (migration `20260919165000` applied immutable; its release
evidence `evidence/citation-artifact-release-2026-09-20.md` is preserved and authoritative). P2
(panel/session protocol) is a separate branch under review; its real table will be `citation_panels` and
this packet does NOT depend on or guess it. Conversation repair is another worktree. Everything here is in
the single additive candidate `20260920200000_citation_findings_improvements.sql`, **UNAPPLIED**. No
git/DB-apply/network/provider/deploy/paid action; USD50-global / manual-free unchanged.

**This work is storage + server boundary + a structured publication/approval binding + dated
owner-confirmed business facts with an accuracy→fact binding. It is NOT the complete P3 workflow and is NOT
production-accepted.** It does not perform, and never claims, an independent/system check that a destination
actually shows the approved content; it makes no causal claim; and a stored fact is never treated as
automatic proof that a human accuracy judgement is correct.

## Owned NEW files (disjoint from released P1, the P2 branch, the conversation-repair worktree)

- `supabase/migrations/20260920200000_citation_findings_improvements.sql` — additive, **UNAPPLIED**:
  `ai_citation_findings`, `ai_citation_improvements` (RLS, `REVOKE ALL`, `workspace_entities` FK CASCADE,
  `record_sha256` idempotency, `finding_id/improvement_id`+`version` immutable chains, `supersedes_id`
  fork guard, self-FK `NO ACTION` + `predecessor_deleted`, bounded `octet_length`); `SECURITY DEFINER`
  RPCs `save_/read_(list)/read_(one)/remove_` for each; `assert_knowledge_project` + a P3-owned
  fail-closed `citation_lock_account`; internal `REVOKE`-closed helpers
  (`citation_finding_sources_available`, `citation_finding_head_id`, `citation_improvement_status`);
  EXECUTE granted to `service_role` only.
- `src/lib/citation-record.ts` — client-safe stage schemas (reusing the accepted `findingSchema`/
  `improvementSchema`) + the owner-declared panel/client scope + the STRUCTURED
  `citationPublicationBindingSchema` + read-back summary/detail/state schemas and the
  `CITATION_VERIFICATION_STATUSES` enum.
- `src/lib/citation-record.server.ts`, `src/lib/citation-record.functions.ts` — the `call()` wrapper
  (branded-error normalization) and the eight `requireSupabaseAuth` + `expectedOwnerId` endpoints.
- `src/lib/citation-business-fact.ts` / `.server.ts` / `.functions.ts` — dated business-fact client schema,
  authenticated server boundary, and endpoints (facts + the accuracy→fact resolution read).
- `src/lib/citation-finding.ts` — narrow additive `factVersion` + `answerCapturedAt` on `accuracySchema`
  only (fact-version/dated provenance); the pure schema framework is unchanged.
- `src/lib/citation-record-migration.test.ts`, `src/lib/citation-business-fact-migration.test.ts`,
  `src/lib/citation-record.functions.test.ts` — real-PGlite SQL + endpoint tests.

## Publication/approval binding and the verification-status ladder

An improvement carries an optional **structured** binding (never free receipt text): `publicationId`
(→ released `public.publication_evidence.id`), `assetId`, `versionHash`, and an optional owner inspection
`{observedAt, checkResult, observedUrl}`. The server resolves every field against the released contracts
(`publication_evidence`, `publication_approvals` from `20260910170000`/`20260910200000`) and, on save,
**refuses** a wrong publication/project, wrong asset, wrong version, a non-current/unrelated approval
(`publication_approvals` must currently hold `approved=true` at that exact `version_hash` for the asset),
a Plan-action/task mismatch (`publication_evidence.snapshot->>'actionId'` must equal the improvement's
`taskId`), a destination-url mismatch (for a published attempt the improvement's `destination.reference`
must equal `outcome_data.liveUrl`), and a manufactured owner inspection (only a PUBLISHED `liveUrl` the
inspection actually names). The resolved binding is stored and **folded into `record_sha256`**, so a
resave with a different binding is a new version — a binding is never silently rebound. The pinned finding
version rows (`bound_finding_row_ids`) and the binding are re-resolved on every read, so a deleted
publication, a withdrawn/changed approval, a deleted asset, or a deleted pinned finding collapses the
status.

Two SEPARATE server-derived axes are returned (never a caller boolean, no causal/system claim):

`verificationStatus` — the approval + delivery ladder:

- `unverified` — no binding, an unresolved pinned finding/source, a deleted publication, or a version no
  longer currently approved.
- `approval_bound` — the pinned `version_hash` is CURRENTLY approved for the asset in this project.
- `connector_receipt` — plus a `published` attempt carrying a connector response (`outcome_data`,
  `verification='connector_response_only'`) whose `liveUrl` matches the destination and whose Plan action
  matches the task. **This is an authentic connector response, NOT proof the destination actually shows
  the approved content**; a `rejected`/`unknown`/`started` outcome never reaches this.
- `owner_attested` — plus a STRUCTURED owner inspection of that exact `liveUrl` recording
  `checkResult='shows_approved_content'` at a finite, on/after-(publication `finished_at` AND current
  approval `updated_at`), non-future time (5-minute clock-skew policy), AND a still-resolving scoped
  baseline (`evidenceStatus='baseline_recorded'`). An authenticated **owner before/after attestation**,
  explicitly distinct from — and never promoted to — a system/independent verification.

`evidenceStatus` — the SEPARATE before/after baseline axis, reported so baseline eligibility is never
silently dropped: `baseline_absent` (no verification block), `baseline_missing` (a verification block whose
baselines no longer all resolve in this project — deleted or out-of-scope), or `baseline_recorded` (all
resolve live). An `owner_attested` before/after proof is therefore never reached without a live scoped
baseline; a deleted baseline drops it back to `connector_receipt` while the honest delivery fact stands.

There is deliberately no `system_verified` / independent-destination-check status: no such trusted record
proves destination contents, and this packet adds no autonomous checker, provider call or network request.

**Declared approval facts are reconciled, not trusted.** When a binding resolves, the record's declared
`change.approvedVersion` must equal the bound `version_hash` and `change.approvedBy` must be the
authenticated owner who holds the approval (`publication_approvals` is owner-keyed and records no separate
approver or human approval time, so those declared fields are reconciled to real facts and not otherwise
endorsed); a forged approver/version alongside a real binding is refused rather than co-existing with an
authenticated `approval_bound`.

**Auditable detail.** The single-improvement (detail) read returns the exact pinned dependency identity —
the resolved finding version row ids and the stored structured binding (including any owner inspection),
which carry no secret/provider material — so an owner can audit or export what a claim is bound to; the
list read stays metadata-only. The resolved pinned finding rows AND the binding are folded into the
idempotency digest, so resaving the identical payload after a referenced finding is superseded records a
new version pinning the current correction instead of silently returning the stale row.

## Security constraints (unchanged from the corrected P3 boundary, plus the binding)

- **Server-derived, forgery-resistant provenance.** `actor_id`/`reviewer_id` are the authenticated owner;
  a finding is refused unless every embedded reviewer identity (top, `secondReview`, `recommendation`,
  each `support[]`/`accuracy[]`, via a lax `$.**.reviewer` scan) is the actor; an improvement's
  `verification.reviewer` (when present) must be the actor. Verification status is derived from the
  binding, never from a caller boolean or receipt string.
- **Trusted-record resolution.** `kind:'source'` finding evidence resolves against
  `project_knowledge_sources`; `answer`/`native` are presence-only (a `pending_parser` artifact or raw
  answer is never elevated to measurement). Improvement→finding pins exact version rows.
- **Tenant isolation, immutable versions, bounded quota (200 findings / 100 improvements per project),
  account-first fail-closed lock, scope-bound idempotency (now including the binding), atomic dependency
  invalidation.** No provider calls, auto-approval or publication; no shared released SQL or provider
  client changed.

## Dated owner-confirmed business facts + accuracy binding (this packet)

New PRIVATE, per-owner/project versioned fact storage (`ai_citation_business_facts` in the same UNAPPLIED
candidate) plus authenticated endpoints and a pure client schema in NEW `citation-business-fact.ts` /
`.server.ts` / `.functions.ts`. It reuses the accepted `businessFactSchema` verbatim; there is no shared
cross-client corpus.

- **Server-derived confirmation; declared validity.** `confirmedBy` must be the authenticated owner (a
  foreign confirmer is refused) and `confirmedAt` is stamped from the authenticated action; the declared
  `[validFrom, validUntil)` interval is owner-supplied but validated finite and ordered, and is kept
  distinct from the confirmation instant. The idempotency digest binds the NORMALIZED declared meaning
  (`factId, kind, value` + canonical validity computed from the parsed instants, NOT the raw date text), so
  re-confirming identical content — even restaged as `Z` vs `+00:00` — neither mints a fake correction
  version nor moves the recorded confirmation time; `confirmedBy`/`confirmedAt` are excluded.
- **One consistent precision, no silent truncation.** Validity is represented at the database's native
  MICROSECOND resolution everywhere — accepted input, stored columns, export and digest all agree at
  canonical `.US` ISO-8601, so `…100100Z` and `…100900Z` stay distinct (they no longer collapse to one
  digest, and a sub-microsecond interval keeps distinct endpoints). Precision beyond microseconds
  (>6 fractional digits) is REFUSED at BOTH the client boundary (a `boundedBusinessFact` refine) and the SQL
  RPC rather than silently truncated.
- **Immutable, dated versions.** A later price change is a NEW version that supersedes the head; it never
  retroactively rewrites an older version's meaning (spec §4.2 / CI11-T28). The stored record is
  reconstructed from canonical strict keys, so an accepted direct-SQL record round-trips the strict client
  schema. Deletion/export/retention are supported (delete unlinks successors + marks the gap, retaining no
  deleted content); there is no auto-confirmation.
- **Accuracy → the immutable fact ROW, recomputed on read, wired into the canonical consumers.**
  `accuracySchema` gains three narrow, back-compatible provenance fields (`factRowId`, `factVersion`,
  `captureEvidenceId`; the pure framework/superRefine is unchanged). An assessed entry pins the exact
  immutable fact **row UUID** (not the reusable numeric version — a deleted-then-recreated fact reuses the
  version but never the row id, so the old assessment stays `fact_missing` with no silent rebind), verified
  to agree with its logical id / version / kind. The capture instant is resolved server-side from the SAVED
  answer-evidence record named by `captureEvidenceId` (which must be one of the finding's OWN answer
  references), read from the ACTUAL saved contract `document.input.capturedAt` (the shape
  `importAnswerEvidence` writes) — never owner free-text, and a fake TOP-LEVEL `document.capturedAt` does
  not resolve; a native-only or unbound/missing/deleted reference is `capture_unresolved`. Its casts are
  staged behind regex/shape guards (a malformed uuid/decimal/huge version cannot crash the read), the audit
  echo NORMALIZES any non-canonical pin to null, and the read-back audit fields use a READ-ONLY canonical
  (hex `pgUuid`) type so a legacy NON-RFC identifier already in storage echoes through instead of failing
  `z.string().uuid()` (the write-side contract keeps the strict `.uuid()`). A malformed/legacy stored entry
  therefore reads as explicit `unpinned` without failing the strict response, and the DETAIL is a
  discriminated union on a server-derived `recordValid`: a well-formed finding returns the EXACT strict
  `findingSchema` record (`recordValid:true`), a legacy/malformed one returns the raw record as a bounded,
  JSON-serializable value (`recordValid:false`) — depth-capped and byte-capped to the finding storage
  budget, a concrete transport-safe type (never `unknown`) so it satisfies the server-function contract —
  so a malformed finding stays inspectable and deletable rather than crashing the detail, and a
  pathologically deep/oversized record is refused (fails closed) rather than returned. A single shared
  helper (`citation_accuracy_resolve`) returns a distinct status —
  `not_assessed` / `unpinned` / `capture_unresolved` / `fact_missing` / `wrong_kind` / `out_of_period` /
  `ambiguous` / `superseded_correction` / `resolved` — and is reused by the standalone read, the **canonical
  finding reads** (`accuracyStatus` on the list, full `accuracy` entries on the detail) and the
  **improvement eligibility gate** (a bound finding with unresolved accuracy drops the improvement's
  `owner_attested` before/after claim to `connector_receipt`), so deleting a bound fact downgrades those
  consumers, not only the standalone endpoint. Temporal-change vs correction is explicit: a newer
  NON-overlapping version preserves the old observation's dated meaning (`resolved`), while a newer
  OVERLAPPING correction of the same fact is surfaced (`superseded_correction`) and a conflicting DISTINCT
  fact of the same kind — any version, so a later non-overlapping version cannot hide a historical conflict
  — is `ambiguous` (needs review, never first-match). **A fact existing is not proof the claim is true** —
  the human accuracy `status` is preserved as `humanStatus` history; the resolution reports only binding
  integrity.

## Remaining wiring (NOT implemented; not complete P3)

- **Independent destination content check.** No trusted record proves a destination shows the approved
  content; `owner_attested` is the strongest status and is an owner attestation, not a system check.
- **Two-person / independent reviewer authentication** (P3 accepts only self-attested findings and
  self-confirmed facts) and **panel authentication** (panel/client scope stays owner-declared until the P2
  `citation_panels` contract exists) remain unresolved and are documented here rather than guessed. The UI
  surface for facts/accuracy is also later work.

## Review history (short note; superseded, not erased)

The initial P3 cut returned a `verified: boolean` from extant findings/baselines/timestamps; a review
found six issues (over-claimed verification, always-available `source` evidence, a fail-open account lock,
scope-blind idempotency, silent version rebinding, and misaligned byte bounds), all corrected (see git
history / the prior evidence revision). A follow-up review required binding to real publication/approval
records instead of an indefinite `unresolved` status. A further review of that binding packet found six
issues, all fixed here: a focused-test setup crash (untyped seed params feeding `jsonb_build_object`, and
runtime status calls passing four arguments to the five-argument status helper — the RPC now passes the
binding on every save/list/detail call and the seed params are explicitly typed); the status helper had
dropped the before/after baseline requirement (now a separate `evidenceStatus` axis gates `owner_attested`
and a deleted baseline invalidates); the owner inspection time was only cast (now finite, on/after
publication and approval, non-future); declared `change.approvedVersion/approvedBy` could contradict the
bound approval (now reconciled or refused); the detail read omitted the pinned binding/finding rows (now
returned for audit/export); and the idempotency digest excluded the resolved pinned rows (now folded in, so
a superseded finding yields a new version rather than a silent stale rebind). Earlier `verified`-boolean
and `unresolved`-status descriptions are superseded by the two axes above. A subsequent packet added dated
business-fact storage and the accuracy→fact binding (above) and fixed two further guard gaps in the same
candidate: `citation_improvement_evidence` could fall through three-valued on a MISSING `baselineCaptureIds`
and wrongly earn `baseline_recorded` (now explicit `IS DISTINCT FROM` + separate non-empty guard), and a
non-null non-object `p_binding` was ignored until the table CHECK (now refused explicitly at the save RPC
boundary; SQL NULL alone means "no binding"). A later real-contract review then found the accuracy→fact
work still had concrete gaps, all fixed in this batch: (1) the resolver read the capture time from the
WRONG path `document.capturedAt` while the tests invented that same top-level shape, so every genuinely
saved answer would have been `capture_unresolved` behind green tests — it now reads the actual
`document.input.capturedAt`, both accuracy test suites seed answers through the released
`saveEvidencePrompt`/`importAnswerEvidence` service, and a test proves a fake top-level date does not
resolve; (2) the audit echo passed malformed pins through, so a legacy/direct-SQL malformed entry could
fail the strict response on `getCitationFinding` — casts are now staged behind guards and invalid pins are
normalized to null (explicit `unpinned`) with resilience tested through the list and standalone service
reads; (3) the canonical stored validity truncated sub-seconds and the digest hashed raw date text — it
now preserves millisecond precision and hashes the normalized meaning, so a sub-second boundary is kept and
an equivalent `Z`/`+00:00` restage is idempotent (no fake correction). A final boundary review then found
three residual precision/schema gaps, fixed in this batch: (A) the stored/digest representation still
truncated to milliseconds while the columns kept microseconds (so `…100100Z`/`…100900Z` collapsed to one
digest and a sub-millisecond interval exported equal endpoints) — validity is now represented at one
consistent MICROSECOND precision across input, columns, export and digest, with sub-microsecond input
REFUSED (not truncated) at both the TS and SQL boundaries; (B1) the accuracy audit echo used a hex regex
that accepts a non-RFC identifier which `z.string().uuid()` rejects — the read-back audit pins now use a
read-only canonical (hex `pgUuid`) type matching what the database echoes, so a legacy non-RFC id round-
trips instead of crashing the read (the write path keeps strict `.uuid()`); and (B2) `getCitationFinding`
still strict-parsed a malformed `record` and would crash despite the doc claiming it inspectable — it now
returns `recordValid:false` with the raw record present (valid records stay strictly typed), so a
legacy/malformed finding is inspectable and deletable, tested through the actual `getCitationFinding`. The
prior focused run does not carry over — the precision representation, read schemas, detail contract and
tests all changed.

## Tests prepared (offline, synthetic; NOT RUN here — Codex runs them)

`citation-record-migration.test.ts` (real PGlite over project_knowledge → publication_approval →
publication_evidence → answer_evidence → native_report_artifacts → this candidate; temporal fixtures are
derived from the DB clock, so they are robust to the runner wall clock): finding provenance + forged
(nested) reviewer refusal + `source` resolution/removal + multilingual byte bound; the delivery ladder
(`approval_bound`, `connector_receipt`, `owner_attested`) with its `evidenceStatus` counterpart; an unbound
improvement is `unverified`; a `rejected`/`unknown` outcome never reaches `connector_receipt`;
arbitrary/unknown publication id, wrong asset/version, non-current approval, task mismatch, destination-url
mismatch and a manufactured/unpublished owner inspection are all refused at save; **declared
approvedVersion/approvedBy must reconcile with the bound approval (a forged approver or off-version is
refused)**; **the before/after axis gates `owner_attested` (inspection-without-baseline stays
`connector_receipt`+`baseline_absent`; a deleted baseline drops `owner_attested`→`connector_receipt`+
`baseline_missing`; an other-project baseline is refused at save)**; **the owner inspection time must be a
finite, on/after-publication, non-future instant (pre-publication and future observations refused; a
non-finite `observedAt` refused at the RPC even if it bypasses the client schema)**; **the detail read
round-trips the exact binding, owner inspection and pinned finding rows, and resaving after a finding head
is superseded records a new version pinning the new head**; live invalidation on
publication/approval/asset/finding removal (record preserved but status downgraded); owner/project
isolation; fail-closed status helper; RLS closes tables + internal helpers to every client role while
`service_role` may call the list RPC. `citation-record.functions.test.ts`: the eight endpoints require
auth, bind to the owner, and refuse off-contract records. Two guard-gap tests were added: the evidence axis
never earns `baseline_recorded` from a missing/malformed/empty `baselineCaptureIds`, and a non-object
binding (array/scalar/json null) is refused at the save RPC boundary.

`citation-business-fact-migration.test.ts` (real PGlite over the same chain; **answers are seeded through
the released `saveEvidencePrompt`/`importAnswerEvidence` service**, so the accuracy tests run against the
actual saved `document.input.capturedAt` shape): server-stamped confirmedBy/confirmedAt with a full-record
export; a forged confirmer refused; a submitted confirmedAt ignored (idempotent re-save, first stamp
preserved); owner/project isolation; immutable version supersession; direct-SQL malformed/null input
refused AND an accepted non-canonical direct-SQL record normalized so it round-trips the strict schema; an
equivalent `Z`/`+00:00` restage is idempotent (no fake correction), a microsecond validity boundary is
preserved (`…100000Z`/`…900000Z`), `…100100Z` vs `…100900Z` stay distinct versions (no collapsed digest),
and sub-microsecond precision (>6 fractional digits) is refused at both the client and SQL boundaries; and
the accuracy→fact resolution — `resolved` (preserved across a later non-overlapping change),
`superseded_correction` (newer overlapping correction), `ambiguous` (a conflicting distinct fact whose HEAD
later moves off the instant still conflicts), `out_of_period`, `wrong_kind`, `unpinned`, `not_assessed`,
`capture_unresolved` (unbound reference, a fake TOP-LEVEL `document.capturedAt`, and after the bound answer
is deleted), `fact_missing` (delete-then-recreate same content stays `fact_missing`, no numeric rebind), a
malformed/legacy stored pin staying inspectable as explicit `unpinned` (normalized to null) through the
list, standalone AND `getCitationFinding` reads (whose detail discriminates on `recordValid`: a valid
record stays strict `recordValid:true`, a malformed one returns `recordValid:false` with the raw record
still present as a bounded JSON-serializable value — no whole-list or detail crash), a record nested beyond
the bounded depth being refused (fails closed) rather than crashing the detail while its list row still
reads `accuracyStatus:'none'`, a legacy NON-RFC hex pin echoing through the canonical
reads without failing the schema, and the **canonical-read downgrade** (`accuracyStatus` on
`readCitationFindings` and `resolution` on `getCitationFinding` flip when the bound fact is deleted, with
`humanStatus` preserved). `citation-record-migration.test.ts` additionally shows a bound finding's
unresolved accuracy downgrading a dependent improvement from `owner_attested` to `connector_receipt`
through the EXISTING `readCitationImprovements`. `citation-business-fact.functions.test.ts`: the five fact
endpoints require auth, bind to the owner (mismatch → `evidence_owner_changed`), and refuse a wrong
project, an off-contract fact and malformed ids.

No pass counts are claimed and the earlier focused run does not carry over — the schema, canonical reads,
improvement gate, storage and tests all changed and must be re-run. Single-connection PGlite verifies
logical guards, not true concurrency.

## Prepared commands — UNRUN (Codex executes)

```
npx vitest run src/lib/citation-record-migration.test.ts src/lib/citation-business-fact-migration.test.ts src/lib/citation-record.functions.test.ts src/lib/citation-business-fact.functions.test.ts
npx vitest run
npx tsc --noEmit
npx eslint src/lib/citation-record.ts src/lib/citation-record.server.ts src/lib/citation-record.functions.ts src/lib/citation-business-fact.ts src/lib/citation-business-fact.server.ts src/lib/citation-business-fact.functions.ts src/lib/citation-finding.ts src/lib/citation-record-migration.test.ts src/lib/citation-business-fact-migration.test.ts src/lib/citation-record.functions.test.ts src/lib/citation-business-fact.functions.test.ts
npx prettier --check "src/lib/citation-record*.ts" "src/lib/citation-business-fact*.ts" src/lib/citation-finding.ts supabase/migrations/20260920200000_citation_findings_improvements.sql
npm run build
```

Migration `20260920200000` is UNAPPLIED. This packet binds improvement evidence to trusted
publication/approval records with honest, distinct statuses; it is not P3 completion and not production
acceptance, and the outstanding real-acceptance gates (genuine exports, the owner-locked panel, the manual
pilot, independent destination proof) remain.

## Codex checkpoint — 20 September, binding corrections

The corrected packet was independently inspected against the released publication contracts. Focused SQL/server tests: 35 passed across two files (1.39s); TypeScript passed. ESLint and git diff --check passed after a formatter-only Codex integration exception on the five citation-record TypeScript files. Logs: /tmp/milo-p3-binding-recheck-focused-20260920.log and /tmp/milo-p3-binding-recheck-types-20260920.log. No full-suite, deployment, destination or real-use acceptance is claimed by this checkpoint. Remaining fact resolution, reviewer authentication and panel integration stay open.


### Business-fact boundary verification checkpoint, 2026-09-20

Codex independently checked the completed correction packet: actual saved capture date binding, microsecond normalization, historical read identities, and discriminated bounded JSON detail. Focused tests: 67 passed across four files (2.08s); TypeScript passed. ESLint and git diff --check passed after a formatter-only Codex integration exception. Logs: /tmp/milo-p3-serializable-focused-20260920.log, /tmp/milo-p3-serializable-types-20260920.log, /tmp/milo-p3-facts-lint-20260920.log. This is a local checkpoint; full integration checks, reviewer authorization, panel binding, destination proof, release and real-use acceptance remain open.
