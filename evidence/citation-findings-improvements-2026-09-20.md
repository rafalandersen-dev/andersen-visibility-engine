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
- **Independent (two-person) finding review is implemented** as authenticated receipts with a narrow
  evidence-inspection read (see the section below). The reviewer CAN now open this finding's extant cited
  evidence (the captured answer excerpt + capture time, the cited source's presence/status, and the dated
  fact behind each accuracy claim) — enough to actually perform the review, not just receipt metadata. What
  remains: a NATIVE report artifact stays opaque unparsed bytes (never independently inspectable until the P5
  parser), and there is still no independent DESTINATION content check. Business facts remain
  owner-self-confirmed (no independent fact attestation, only read access for the reviewer).
- **Panel authentication** (panel/client scope stays owner-declared until the P2 `citation_panels` contract
  exists) remains unresolved and is documented here rather than guessed. The UI surface for facts/accuracy
  and for the review queue is also later work.

## Independent (two-person) finding review

Spec §4.5 ("a second studio reviewer checks ambiguous or high-impact claims when available"; "a collector
may also be reviewer, but that is not independent verification"). The finding record already refuses every
embedded reviewer identity that is not the authenticated owner, so a genuine second reviewer's decision
**cannot** be a field of the owner-authored record without becoming a forged provenance claim. Independent
review is therefore a SEPARATE additive table, `ai_citation_finding_reviews` (still in the UNAPPLIED
candidate), of authenticated receipts:

- **Authority is the actual released team ADMISSION contract, reused not reinvented.** Eligibility is the
  same predicate the asset-review authority uses (`role='reviewer'` under a
  `separate_reviewers`/`editors_can_approve` policy, or `role='editor'` under `editors_can_approve`) — but
  the policy/role predicate is NOT the whole authorization. Every review RPC also runs the real account
  admission: an OPTIMISTIC, lock-free check that BOTH the owner and the actor are current `auth.users` (not
  deleted, not banned) with an active, non-expired membership — so a stale/suspended/non-member session is
  refused *before* it can queue on an arbitrary victim owner's workspace lock — and then, on the write path,
  the AUTHORITATIVE `assert_project_team_account` (the released `FOR SHARE` account check) for both owner and
  actor under the owner workspace + account lock, plus a membership/policy re-read. The reads enforce the
  same current account admission. The migration test applies the REAL `20260911020000_project_team_reads.sql`
  (real `project_team_members` + `assert_project_team_account`), so a suspended owner/actor is proven to be
  refused. Reusing asset-review authority as the *eligibility* test still does **not** hand the reviewer the
  owner-only findings list / business-fact management / native artifact bytes / exports.
- **Receipts are forgery- and replay-resistant.** The reviewer id and time are server-derived from the
  authenticated caller (the owner cannot impersonate another reviewer; the reviewer field is not a payload
  input). Each receipt is bound to the EXACT immutable finding row + version + `record_sha256` the reviewer
  pinned; a hash that no longer matches that row is refused (`citation_review_stale`), and because a new
  finding version is a new row, a receipt never replays onto changed evidence. No self second-review. One
  receipt per reviewer per row; the same decision AND note on the same content is idempotent, but a *changed*
  decision OR a *changed note* is refused (`citation_review_conflict`) — a recorded human decision (and its
  note) is preserved as history, never silently flipped or a new note reported as saved. Idempotency/conflict
  is decided BEFORE the per-project capacity charge, so an identical retry still returns at the 2000 cap.
- **The reviewer inspects the real substantive evidence; incomplete/opaque evidence is only an opinion.**
  The narrow reviewer read resolves THIS finding's cited evidence to its actual readable content: an
  `answer` yields its FULL content (the whole `rawAnswer`, contract-capped at 50000 chars, with
  `contentLength`/`contentTruncated` so truncation is never silently treated as complete), the supplied
  citation URLs, and capture provenance (surface/mode/method/capturedAt/status/promptId/promptRevision); a
  `source` yields its identity/provenance (label, url, content fingerprint, capture time, status) AND its
  substantive MATERIAL — the released `project_knowledge_records` bound to THIS source at its current
  revision (`value`/`excerpt`/`locator`/`category`/`status`, plus each record's `recordId`/`recordRevision`
  for provenance), returned IN FULL up to the project record cap (300, so an ordinary source is entirely
  inspectable), deterministically ordered by record id, with `materialCount`/`materialTruncated`; scoped to
  the cited source only (never the whole knowledge corpus, never the raw document bytes which stay
  service-only). A source whose material overflows 300 is `materialTruncated` and NOT inspectable (its last
  records would be unreachable, so review stays incomplete rather than falsely complete). A `native` artifact
  is present-or-not but `inspectable:false`
  (opaque bytes; parser is P5); and each assessed-accuracy fact pin its dated value — every item with an
  authentic `available:false` when the reference was deleted. `inspectionComplete` is true ONLY when EVERY
  cited item is genuinely inspectable: an answer fully within the content cap, a source active WITH
  substantive bound material (attribution/provenance alone is NOT support, §4.2), and NO native item — so a
  native-only OR a **mixed native+answer** finding, a metadata-only / revoked / wrong-source / stale-revision
  source, a deleted reference, or a truncated answer is incomplete. An `approved` receipt on a non-inspectable finding is stored `inspection_complete=false` and
  reads `independent_opinion`: honestly exposed but NEVER completing a required second review or lifting an
  improvement. A valid answer-only or source-only review with real evidence DOES complete (review is not
  disabled), and `inspectionComplete` is a CURRENT-availability signal distinct from the historical receipt.
- **Read-eligibility wiring.** The canonical finding reads return a server-derived `reviewStatus`
  (`owner_only` / `second_review_pending` / `independent_reviewed` / `independent_opinion` /
  `independent_dissent`), recomputed live over ALL of a row's receipts. A `needs_second_review` finding reads
  `second_review_pending` until a COMPLETED (inspection-complete) independent approval exists. An improvement
  bound to a finding that is `second_review_pending` or `independent_dissent` is capped below `owner_attested`
  (down to `connector_receipt`), mirroring the accuracy-unresolved gate. The receipt reads are paginated
  (`reviews` ≤100) with an explicit `reviewTotal`/`reviewsTruncated` and full-population `activeDissent` /
  `activeApproved` / `reviewStatus`, so a dissent beyond the displayed page is never silently erased.
- **Withdrawal is reviewer-only, auditable, and non-sanitising.** ONLY the receipt's own reviewer may
  withdraw it — the OWNER cannot delete another reviewer's decision (which would let an owner clear a dissent
  and leave a standing approval reading as `independent_reviewed`). Withdrawal is a content-free soft
  tombstone: the note is erased, the decision/reviewer/timestamps stay for audit, and a withdrawn receipt no
  longer counts. The acting account must be current (`assert_project_team_account`), but current MEMBERSHIP is
  not required — a reviewer whose membership was later revoked may still retract their own historical
  attestation, and (conversely) a historically valid receipt keeps counting after that reviewer's membership
  is revoked (current permission vs historical review are distinct).
- **Separation of powers preserved.** These endpoints take the authenticated actor and a supplied
  owner/project/finding (like the released asset-review server), and the database — not the client — decides
  authority. Publication and spend permissions are untouched; no owner-only raw endpoint was broadened.

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
legacy/malformed finding is inspectable and deletable, tested through the actual `getCitationFinding`. A
following review then required the malformed-detail fallback to be a concrete serializable type (a
`Record<string,unknown>` return failed `tsc` against the server-function transport contract), fixed by a
discriminated `recordValid` detail whose invalid branch is a bounded, depth/size-capped JSON-safe value
(never `unknown`). A prior packet added **independent (two-person) finding review**: a separate
`ai_citation_finding_reviews` receipt table, authority reusing the live project team membership/policy, a
`reviewStatus` on the finding reads, and the improvement gate capping `owner_attested` when a bound finding's
required second review is missing or dissented. A follow-up review then found four concrete gaps, all fixed
in the MOST RECENT packet: (1) the authority only checked two tables, skipping the released admission
(`auth.users` deleted/banned + account locks) so a stale/suspended owner/actor session could reach review
data — now every review RPC runs the optimistic pre-lock account+membership check AND the authoritative
`assert_project_team_account` under the lock, the reads enforce the same admission, withdrawal requires a
current acting account, and the test applies the REAL `20260911020000` team migration; (2) the reviewer read
aggregated all receipts under a max-100 response and charged capacity before the idempotency lookup — now the
receipts are a bounded page with an explicit total/truncation and a full-population dissent aggregate, and an
identical retry is resolved before the capacity charge (a changed note is an explicit conflict, never a
silent save); (3) the reviewer could not actually inspect the underlying evidence — now the narrow read
resolves this finding's answer excerpt/capture time, source presence and dated accuracy facts, a native
artifact stays explicitly non-inspectable, and an un-inspectable approval is an `independent_opinion` that
never completes verification or promotes an improvement; (4) the owner could remove a dissent and leave a
standing approval reading as reviewed — now withdrawal is reviewer-only and a content-free auditable
tombstone, historical receipts survive later membership revocation, and the canonical improvement gate is
tested. A subsequent review found the evidence-inspection itself was still too shallow — all fixed in the
LATEST packet: `citation_finding_inspectable` accepted ANY answer/source and returned only source
status/kind, only the first 4000 of the allowed 50000 answer chars, and treated a mixed native+answer
finding as complete despite the opaque native — so a reviewer could complete a review on incomplete proof.
A further review found the SOURCE half of that fix still shallow — a source was counted complete on
`status='active'` + non-empty `label` alone and the read returned only metadata (label/url/fingerprint are
attribution, not support, §4.2). Fixed in this packet: a source is inspectable ONLY when actual substantive
MATERIAL exists — at least one released `project_knowledge_records` row bound to THIS source (`source_id`)
at its CURRENT `revision` with a non-empty `value` — and the reviewer read exposes that bound material
(`value`/`excerpt`/`locator`/`category`/`status`, scoped to the cited source, bounded page, never the raw
document bytes or the wider corpus). So inspection now requires EVERY cited item genuinely readable (an
answer fully within the 50000-char content cap; a source active WITH bound current-revision material; NO
native item); a mixed native+answer, a metadata-only / wrong-source / stale-revision / revoked source, and a
deleted or truncated reference all read `inspectionComplete:false` (opinion only), while a valid answer-only
OR a source-only review with real bound material still completes. The metadata-only source test was
corrected to expect incomplete, and material/wrong-source/stale-revision/revoked cases added. That packet's
focused run then FAILED (all four source reads → `citation_review_unavailable`) from two bugs, both fixed
here: (1) the material subquery selected only `payload,revision` while `jsonb_agg(... ORDER BY id)`
referenced `id`, raising at runtime — the inner select now exposes `id` and each material record carries its
`recordId`; and (2) completeness was `EXISTS`/`materialCount>0` while the read capped the page at 10, so an
11-record source falsely read complete with its later records unreachable — both the gate and the read now
use the same 300 bound (the project record cap), returning the material IN FULL up to 300 (an ordinary
source is entirely inspectable) and marking any overflow `materialTruncated` → NOT inspectable → incomplete.
The prior focused run does not carry over — the source material read/cap and the tests all changed and must
be re-run.

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

`citation-finding-review-migration.test.ts` (real PGlite over the same chain PLUS the actual released
`20260911020000_project_team_reads.sql` — real `project_team_members` + `assert_project_team_account` +
`auth.users(deleted_at,banned_until)` — with only the approval-policy lookup created directly):
a current reviewer records a receipt bound to the exact row+content and `reviewStatus` flips to
`independent_reviewed` on BOTH canonical reads; the owner is refused as an independent reviewer AND refused
the reviewer-only read (no self second-review); a non-member, a viewer, an editor under `separate_reviewers`,
and any actor under a `disabled` policy are all refused, while an editor under `editors_can_approve` is
allowed; a revoked or expired membership and a foreign project are refused; **a suspended (deleted/banned)
actor OR owner account is refused on submit, withdraw AND the reviewer read (the real account-admission
contract)**; a stale/foreign content hash is refused and a new finding version carries no receipt
(anti-replay); an identical decision+note is idempotent while a changed decision OR a changed note is
refused; **the receipts page is bounded to 100 with an explicit total, but an off-page dissent still shows in
`activeDissent`/`reviewStatus`**; **idempotency is decided before capacity, so an identical retry still
returns at the 2000 cap while a new reviewer hits it**; **the reviewer read exposes the FULL answer content
past the old 4000-char cut (a `TAILMARKER-AT-END` beyond char 4200 is present, `contentTruncated:false`) plus
citations/provenance and the dated accuracy fact; a source-only finding exposes the bound knowledge-record
MATERIAL (`value`/`excerpt`/`locator` + `recordId`/`recordRevision`) and COMPLETES (`independent_reviewed`)
only when real material is bound to the cited source at its current revision — including a source with MORE
than 10 records where ALL are returned (a `LAST-RECORD-MARKER` eleventh record is reachable,
`materialTruncated:false`) — while a metadata-only source (active + label/url but NO material), a
wrong-source or stale-revision record, a revoked source, a source whose material OVERFLOWS the 300 cap
(`materialTruncated:true` → not inspectable), a native-only finding, and a MIXED native+answer finding are
all `inspectionComplete:false` so an approval is only an `independent_opinion`/pending that never completes a
required second review; and a deleted answer reads `available:false`**; a `needs_second_review` finding reads `second_review_pending` until a
COMPLETED independent approval and a dissent reads `independent_dissent`; **withdrawal is reviewer-only (the
owner cannot sanitise a dissent — A dissents + B approves stays `independent_dissent` until A retracts), a
content-free auditable tombstone, and a historically valid receipt keeps counting after the reviewer's
membership is revoked**; and — with the full publication/approval/baseline fixture — a bound
`needs_second_review` finding holds the improvement at `connector_receipt` until an independent approval lifts
it to `owner_attested`, and an independent `needs_changes` dissent drops a would-be `owner_attested`
improvement back to `connector_receipt`.
`citation-finding-review.functions.test.ts`: the four review endpoints require auth and ALWAYS use the
authenticated caller as the actor (the reviewer is never a payload field, so an owner cannot impersonate a
reviewer), passing the supplied owner/project/finding through, and reject malformed ids, a bad content
hash, an off-list decision and a malformed project/owner.

`milo-candidate-chain-migration.test.ts` (the whole-repo candidate inventory) is reconciled to the current
tree: `native_report_artifacts` (20260919165000) and the conversation checkpoint lock-wait (20260920180000)
are enumerated as APPLIED, and the P3 citation candidate `20260920200000` is the SOLE unapplied candidate.
It is applied in the combined chain on top of its REAL released prerequisites (project knowledge, publication
approval/evidence, answer evidence, native artifacts, project-team reads/policy — reused verbatim, never
invented substitutes), so the migration actually executes end-to-end; the chain then asserts that all
seventeen P3 service RPCs are `service_role`-only, the eleven P3 internal helpers are REVOKEd from every
role (reachable only from the definer RPCs), and the four P3 stores
(`ai_citation_findings`/`_improvements`/`_finding_reviews`/`_business_facts`) have RLS on, no policies and no
client-role table grants. There is no P2 citation panel candidate in this worktree (a separate open author
owns PR146); it is deliberately absent, not duplicated or cherry-picked.

No pass counts are claimed and the earlier focused run does not carry over — the schema, canonical reads,
improvement gate, storage, the candidate-chain inventory and tests all changed and must be re-run.
Single-connection PGlite verifies logical guards, not true concurrency.

## Prepared commands — UNRUN (Codex executes)

```
npx vitest run src/lib/citation-record-migration.test.ts src/lib/citation-business-fact-migration.test.ts src/lib/citation-finding-review-migration.test.ts src/lib/citation-record.functions.test.ts src/lib/citation-business-fact.functions.test.ts src/lib/citation-finding-review.functions.test.ts src/lib/milo-candidate-chain-migration.test.ts
npx vitest run
npx tsc --noEmit
npx eslint src/lib/citation-record.ts src/lib/citation-record.server.ts src/lib/citation-record.functions.ts src/lib/citation-business-fact.ts src/lib/citation-business-fact.server.ts src/lib/citation-business-fact.functions.ts src/lib/citation-finding.ts src/lib/citation-finding-review.ts src/lib/citation-finding-review.server.ts src/lib/citation-finding-review.functions.ts src/lib/citation-record-migration.test.ts src/lib/citation-business-fact-migration.test.ts src/lib/citation-finding-review-migration.test.ts src/lib/citation-record.functions.test.ts src/lib/citation-business-fact.functions.test.ts src/lib/citation-finding-review.functions.test.ts src/lib/milo-candidate-chain-migration.test.ts
npx prettier --check "src/lib/citation-record*.ts" "src/lib/citation-business-fact*.ts" "src/lib/citation-finding-review*.ts" src/lib/citation-finding.ts supabase/migrations/20260920200000_citation_findings_improvements.sql
npm run build
```

Migration `20260920200000` is UNAPPLIED. This packet binds improvement evidence to trusted
publication/approval records with honest, distinct statuses; it is not P3 completion and not production
acceptance, and the outstanding real-acceptance gates (genuine exports, the owner-locked panel, the manual
pilot, independent destination proof) remain.

## PR149 review corrections — source-revoke availability + inspection reuses the accuracy resolver + withdrawal authorizes before locking

Two independently confirmed review findings (against the UNAPPLIED candidate `20260920200000`) are fixed here; both make a status that was silently over-strong honest, and both reuse existing canonical logic rather than adding a parallel check.

1. **A released-side source REVOKE no longer reads as available.** `citation_finding_sources_available` checked only that the `project_knowledge_sources` row existed. A released-side revoke KEEPS the row (its `payload.status` flips to `revoked` and its bytes are cleared), so a finding's `sourceAvailable` stayed `true` and a bound improvement could preserve `approval_bound` / `connector_receipt` / `owner_attested`. The source branch now requires the source still `status='active'`, mirroring the inspectable gate. Every consumer of the helper — the finding list/detail/save-echo reads, the for-review read, and the improvement-status gate (a bound finding whose source is no longer active forces `unverified`) — downgrades together. The for-review per-item evidence detail still reports `available:true, status:'revoked', inspectable:false`, so a revoked source stays DISTINCT from a nonexistent one and its reason stays visible; a stored historical review receipt (recorded while the source was active) is never rewritten — this is the CURRENT-validity signal only. Regression added: a delivered (`connector_receipt`) improvement over a source-citing finding re-reads `unverified` after the revoke, while the source row survives (count 1, `status='revoked'`) and the finding's live `sourceAvailable` is `false`.

2. **The independent inspection gate now honours the canonical accuracy resolver.** `citation_finding_inspectable`'s accuracy loop SKIPPED an absent or malformed `factRowId` and, for a well-shaped pin, checked only that the fact ROW existed — so `inspection_complete` could be `true` while the canonical `citation_accuracy_resolve` reported `unpinned` / `fact_missing` / `wrong_kind` / `out_of_period` / `capture_unresolved` / `ambiguous` / `superseded_correction`. The loop now delegates each accuracy entry to that ONE resolver (the same one the finding reads, the accuracy endpoint and the improvement gate use) and requires `resolved` — exempting only `not_assessed`, the resolver's verdict for the legitimately unassessed `not_checked` / `unclear` statuses. There is no second partial identity/validity implementation, so `inspection_complete` now agrees with `accuracyStatus` and the resolver by construction. Because an `approved` receipt stores `inspection_complete` from this gate, an assessed-but-unresolved accuracy makes an independent approve only an OPINION that never completes a required second review. Tests (in the review-migration suite) hold three cases distinct, all against the real strict contract (`accuracySchema`: `factId`/`review` are required-nullable, `factRowId`/`factVersion`/`captureEvidenceId` optional, `factKind` a valid business-fact kind):

- **Legitimate unassessed** — `not_checked` / `unclear` entries carrying `factId:null`/`review:null` complete with no fact binding.
- **Schema-valid but unresolved** — an assessed entry whose optional `factRowId` is omitted, or whose well-formed pin disagrees with the stored fact (non-existent row, a disagreeing `factId`, a wrong pinned version, a valid fact kind the row does not carry, an unbound capture, an out-of-period capture, an ambiguous overlapping fact, a superseding correction) each leave the inspection incomplete through the for-review read. A fully-resolved assessed entry completes; the required-second-review consequence (approve → opinion → `second_review_pending`, via a valid `hours` kind against a `price` row) is asserted end-to-end.
- **Malformed historical record** — a genuinely malformed stored pin (a non-uuid `factRowId`, which the strict for-review response schema refuses to echo, and whose owner-detail invalid-record handling already exists) is exercised at the SQL boundary: `citation_finding_inspectable` fails closed to `unpinned`, the same defensive normalization the accuracy audit reports.

The resolver's own per-branch verdicts remain proven in the business-fact suite; these tests prove the inspection gate honours them, without weakening the strict schema.

3. **Withdrawal no longer queues a write on the victim before authorization (security finding 4057887799).** `remove_ai_citation_finding_review` took the victim owner's `workspace_meta FOR UPDATE` (via `assert_knowledge_project(...,true)` + `citation_lock_account`) BEFORE checking that the target receipt belonged to the acting reviewer, and re-took it even for an already-withdrawn receipt — so an authenticated outsider who merely knew owner+project could queue owner-scoped writes / contend the owner's workspace lock with guessed receipt ids. It is reordered to the same optimistic-before-lock shape the save path uses: a lock-free ownership read (only the receipt's OWN reviewer proceeds; a random, foreign or non-existent id — and the owner trying to erase another reviewer's decision — is refused here) → the released per-account FOR SHARE admission `assert_project_team_account` for owner and actor (a suspended/deleted/banned session is refused; current MEMBERSHIP is deliberately NOT required, so a former member may still retract their own historical receipt) → an already-withdrawn own receipt returns idempotently WITHOUT taking the victim workspace lock at all. The `assert_project_team_account` admission is `FOR SHARE NOWAIT` on `auth.users` — fail-fast, never a wait. Only a genuinely-pending own withdrawal proceeds to the owner account+workspace locks, where the account admission and the actor-scoped write are re-checked before the content-free tombstone (decision/reviewer/timestamps retained, note erased, no longer counts toward reviewStatus).

Bounded wait (corrected — an earlier draft wrongly claimed the released helpers were already bounded): `assert_knowledge_project(...,true)` (20260909200000) and `citation_lock_account` each take a BLOCKING `FOR UPDATE` with **no** `NOWAIT` and **no** timeout of their own, so a genuinely-authorized pending withdrawal could otherwise wait unbounded on a contended owner lock. This RPC therefore declares its own `SET lock_timeout='1500ms'` in the function config — the released checkpoint-migration convention (`20260920180000`) mirrored, with **no edit to any released migration** and no new lock framework or function. Per the same released reasoning, `lock_timeout` is **per lock acquisition, not a whole-RPC deadline**; an exceeded wait raises `55P03` **before any mutation**, so a contended withdrawal fails cleanly and the receipt is preserved (never a partial tombstone). The account-first lock ORDER matches the other write RPCs, so converting nothing new to blocking adds no deadlock cycle.

Regressions (review-migration suite): an authenticated outsider's random and foreign receipt ids, and the owner's guessed id, are all refused with `citation_review_forbidden` BEFORE the lock — proven deterministically at the SQL boundary by deleting the owner's `workspace_meta` (the fail-closed lock would otherwise surface `citation_record_unavailable`) and asserting the authorization refusal wins and nothing is mutated; the already-withdrawn path is idempotent `true` AND — under the same missing-`workspace_meta` tripwire — still returns `true`, proving it takes **no** workspace lock (not merely that it returns true); a former member withdraws their own receipt; a suspended account is refused; and a function-config/boundary regression asserts `proconfig` declares `lock_timeout=1500ms` and the pinned `search_path`. A single in-memory PGlite connection cannot exercise genuine concurrent lock-wait/queueing (nor an observed timeout), which the tests note explicitly; those assertions are the observable ORDERING (authorization strictly precedes the blocking lock) and the DECLARED per-lock bound.

Scope: only the candidate migration SQL plus `citation-record-migration.test.ts` (active-source seed + the revoke regression) and `citation-finding-review-migration.test.ts` (the inspection-resolver describe and the withdrawal lock-ordering regressions). The candidate stays UNAPPLIED; no P2, no already-applied SQL, no global inventory, no provider/commit/deploy, no production-acceptance claim. The USD 50 manual-free rule is unchanged, and no immutable receipt is rewritten. Panel binding, destination-content proof, UI, the native parser and real-use acceptance remain open.

## PR149 evidence-lifecycle corrections — forget cascade + current-material gate

Two linked, independently-confirmed P1 evidence-lifecycle findings against the UNAPPLIED candidate.

4. **Forgetting a source OR a record now erases the copied passages a finding retained (finding 4057991794).** `ai_citation_findings.record` kept its OWN copy of inspected source text in `support[].sourcePassage`, returned verbatim by the owner detail and for-review reads, so a forget was honored in the live source read while the copy lingered. A shared redactor `citation_forget_redact_source` (`SECURITY DEFINER SET search_path=''`, granted to no role) erases every copied passage — a visible `[redacted: source forgotten]` marker, never the original — in EVERY version of every finding of the SAME `user_id`+`project_id` that cites the source, across the supersede chain, and stamps a new `evidence_erased_at`. It is fired by AFTER DELETE triggers on BOTH released tables:
   - `project_knowledge_sources` (source forget) → redact findings citing `OLD.id`.
   - `project_knowledge_records` (record forget — this IS an erasure too, corrected from the earlier draft) → redact findings citing `OLD.source_id`. Because `support` carries NO record-id pin, a record forget conservatively erases every copied passage of findings citing that record's SOURCE — it errs toward erasure rather than leaving possibly-forgotten text, and never falsely claims per-passage attribution. Multi-source findings are erased wholesale for the cited source for the same reason.
   - **Case-safe match:** the evidence id is a case-insensitive uuid string (input allows uppercase; `sources_available` casts it), so the match is `lower(e->>'id') = source::text`, not a raw `= OLD.id::text` that would leave an uppercase-cited source un-erased. Non-uuid ids (native/answer evidence) simply never match.
   - **Documented scope boundary:** only the STRUCTURED `support[].sourcePassage` is auto-erased. `observation`/`hypothesis`/`support[].reason` are free-text reviewer analysis in the accepted contract with no structured source-copy semantics; auto-wiping all reviewer prose on any forget would destroy legitimate independent analysis and cannot be attributed to a forgotten source. This is a stated retention boundary, not an assumption that prose can never contain pasted text.
   **Transparent audit (finding 4057991796's sibling concern).** `record_sha256` is kept (a one-way digest reveals nothing) but is now explicitly a PRE-erasure anchor: the new `evidence_erased_at` is surfaced as `evidenceErased` on the owner detail and for-review responses, so the retained hash (and any receipt referencing it) reads as historic, never an attestation of the current redacted payload. `save_ai_citation_finding_review` REFUSES a new review on an evidence-erased finding (`citation_finding_unavailable`), so an old hash can never be freshly approved onto a redacted payload; existing receipts are retained (their hash historic). Resurrection is blocked at save, not by an identical-hash coincidence: `save_ai_citation_finding` checks the source tombstones and, if a NEW version (identical OR altered) still cites a forgotten source, strips the passage before store and marks the row erased. A source REVOCATION (row kept) is NOT a delete, fires no trigger, and downgrades CURRENT validity via `sources_available` / `citation_finding_inspectable` instead; a forget with a mismatched expected revision raises before the delete, so nothing is erased. Tenant- and source-scoped; no unrelated project content is touched.

5. **The improvement gate now checks CURRENT substantive material, not just an active source row (finding 4057991796).** `citation_improvement_status` guarded bound findings only with `citation_finding_sources_available` (the active source ROW exists), while `citation_finding_inspectable` correctly requires each cited source to still carry substantive material at the CURRENT revision. So after a record-only forget or a source-revision advance — the active source row surviving — a stale `inspection_complete` receipt could still lift an improvement to `owner_attested` with no matching material. The gate's bound-finding loop now also evaluates the canonical `citation_finding_inspectable` (reused, not a divergent copy — it also never treats an opaque native artifact as parsed proof); if any bound finding is no longer inspectable NOW, `owner_attested` is forfeited (dropping to `connector_receipt`, the delivery fact), exactly parallel to the existing `acc_unresolved`/`review_incomplete` forfeits. The historical receipt is untouched and stays auditable — current validity is recomputed at the read/status/promotion boundary, never rewritten into a claimed human re-review.

6. **Record-forget resurrection closed, and current status honors erasure everywhere (completing the record-forget no-resurrection / current-truth requirement).** Two follow-ups. **(a) Resurrection after a record forget.** The save-time guard checked only `kind='source'` tombstones, but a RECORD forget keeps the source alive and leaves no source-mapped tombstone — so an altered re-save or a fresh finding citing the surviving source could re-store the passage. A new CONTENT-FREE table `ai_citation_source_erasures(user_id, project_collection, project_id, source_id, erased_at)` (RLS-on, REVOKEd from every role, `workspace_entities` FK so it is cleaned on project delete, ids + a timestamp only — nothing to leak) records per source that copied evidence was forgotten; the shared redactor upserts it on BOTH forget kinds, and `save_ai_citation_finding` now redacts the submitted passages (never blocking the finding — unrelated input is unaffected) whenever a cited source carries the marker. Records are only ever DELETEd by a forget or a source/project cascade — an ordinary record update UPDATEs in place and a source refresh inserts without deleting — so a record delete is always an erasure and safely marks the source (ordinary-DELETE/replacement handled explicitly). **(b) Current status honoring the flag.** `citation_finding_review_status` and `citation_improvement_status` now inspect `evidence_erased_at`: with two current records, forgetting one erases + flags the finding while the other keeps `citation_finding_inspectable` structurally satisfiable — so the flag, not inspectability, is decisive. An erased finding's historical approvals no longer read as current `independent_reviewed` (the status collapses to `owner_only`; a dissent is still surfaced, never sanitised) and no longer lift a bound improvement past `connector_receipt`, while the receipts stay in the list as historic. Because a new review is refused on an erased finding and a resave is re-redacted, later new material does NOT silently resurrect the old review or attestation — re-verification would require legitimately new approved evidence under an explicit mechanism that does not exist here, so the conservative erased state holds.

7. **Whole-project/account deletion no longer fails on the erasure marker; revoked-source live material is withheld; marker cardinality documented accurately.** **(a) Project-delete FK (P1 regression from fix 6a).** Deleting a `workspace_entities` project removes the project row FIRST, then the released `purge_deleted_project_knowledge` AFTER DELETE trigger purges its sources/records — which fired the forget-cascade trigger, which unconditionally inserted an `ai_citation_source_erasures` row referencing the now-gone project (SQLSTATE 23503), failing the delete for any project with a knowledge source. The shared redactor now NO-OPS when the project's `workspace_entities` row no longer exists: during a whole-project (or account, which cascades `workspace_entities` from `auth.users` first) removal the findings/improvements/erasure rows are cascade-deleted anyway, so there is nothing to redact and no orphan provenance is written; a source/record forget while the project SURVIVES still runs, preserving erasure + no-resurrection. **(b) Revoked-source live material withheld (finding 4057999313).** `read_ai_citation_finding_for_review` marked a revoked source non-inspectable but still queried and serialized its live records' `value`/`excerpt`/`locator` in `material`/`materialCount`. Material retrieval is now GATED on the source being `active`, so a revoked (or missing) source returns `material:[]`/`materialCount:0` — access-time withholding of LIVE source material. This is DISTINCT from erasure: revocation does NOT destroy the owner's own copied `support[].sourcePassage` in the finding record (only a forget erases that), so owner data survives on revocation and the reviewer still sees `status:'revoked'` attribution and can inspect a co-cited ACTIVE source in the same finding. **Copied-field withholding (completing the whole-response requirement).** The live-material gate alone was not enough: `read_ai_citation_finding_for_review` returned the finding `record` verbatim, so the owner's copied `support[].sourcePassage` — a copy of the now-revoked source's text — was still delivered to the reviewer. The reviewer response now builds a REDACTED RESPONSE COPY of the record (never the stored row) that blanks every non-null support passage to a `[withheld: source revoked]` marker whenever a cited source is revoked/missing; because `support[]` carries no per-passage source pin, the withholding is conservative over ALL support passages once ANY cited source is deactivated. A new `sourcePassagesWithheld` flag surfaces this so the returned record is never mistaken for the `recordSha256` preimage (that digest still pins the UNREDACTED stored record; a reviewer cannot attest withheld bytes as fully inspected, and a revoked source already forces `inspectionComplete=false`). This is response-only ACCESS-TIME withholding, NOT erasure and NOT a stored mutation: the owner's stored `ai_citation_findings.record` and the owner's OWN detail read (`read_ai_citation_finding`) still return the real passage; an all-active finding is never withheld; an already-erased finding keeps its stored `[redacted: source forgotten]` copy (no live passage to leak, so `sourcePassagesWithheld` stays false there). **(c) Cardinality documented accurately.** The earlier "bounded by the source population" note was wrong: `ai_citation_source_erasures` holds one row per DISTINCT source id ever forgotten in the project — monotonic, NOT bounded by the live-source cap — deliberately mirroring the released `project_knowledge_tombstones` (also uncapped, because forget provenance must persist to prevent resurrection; a cap that evicted markers would fail erasure or re-open resurrection). The only lifecycle bound is project deletion via the `workspace_entities` FK cascade.

8. **An owner-DISMISSED finding can no longer become a verified improvement (finding 4058545412).** `citation_finding_head_id` resolves the NEWEST unsuperseded head of a finding chain but ignores its `decision`, and `citation_improvement_status` checked sources/accuracy/review/erasure of each pinned row but never the decision — so an owner-**dismissed** finding (one the owner REJECTED as not a real gap) could be bound at improvement save and read back as `approval_bound`/`connector_receipt`/`owner_attested`, advertising a spurious verified improvement for a non-gap. Two gates close it, with an explicit CURRENT-truth vs IMMUTABLE-HISTORIC-pin split: **(a) Save-time binding.** After `citation_finding_head_id` returns the head, `save_ai_citation_improvement` now REFUSES a `dismissed` current head (`citation_improvement_finding_unresolved`) and deliberately does NOT fall back to an older accepted version of the same chain (binding a superseded accepted row would ignore the owner's current dismissal) — while a genuine ACCEPTED correction resave resolves to that exact new accepted head, so idempotent rebinding to the current correction is preserved. **(b) Current status.** `citation_improvement_status` now, per bound row, resolves the chain's CURRENT head (mirroring `citation_finding_head_id`'s ordering) and returns `unverified` if that head is `dismissed`. This catches BOTH a historic row bound to a dismissed head before the save guard AND a prior accepted pinned row whose owner LATER dismissed the finding via a new head — the owner's current rejection is honored and never bypassed through the old pinned row. The stored pin (`boundFindingRowIds`) is NEVER rewritten: the historic binding stays fully inspectable/auditable via the detail read; only the LIVE verification status collapses on a dismissed basis. **The gate is scoped to `dismissed`, deliberately NOT "any non-accepted".** A `needs_second_review` head is a PROVISIONAL (not rejected) finding: it stays bindable and reaches `connector_receipt` (an honest delivery fact), while the pre-existing review-incomplete gate already caps it below `owner_attested` until an independent approval lifts it — the shipped deliver-then-attest flow (§ finding 6, and its `needs_second_review → connector_receipt → owner_attested-after-approval` regressions). Blocking the binding of a `needs_second_review` head instead would break that flow and the established baseline, and is unnecessary: the owner's not-yet-confirmed state is already honored by the owner_attested cap, and only an owner REJECTION (dismissed) must void the whole ladder. `citation_finding_head_id` itself is unchanged (still the decision-agnostic chain-head resolver); the dismissed check lives at the two call sites. **Current-head review gate + composite-key scoping (delta correction).** Retaining `connector_receipt` for a provisional `needs_second_review` head is only sound if `owner_attested` stays capped by the CURRENT head's review state. The first cut resolved `head_dec` but the review-incomplete gate still inspected the PINNED old row, so turning an accepted, independently-reviewed f1 into a `needs_second_review` f2 could keep the old improvement at `owner_attested` — the stale f1 approval standing in for the unreviewed new head. The review gate now evaluates `citation_finding_review_status` on the **current head row** (`head_row`, fetched alongside `head_dec`): the new head f2 carries no receipts (they are keyed to f1's `finding_row_id`), so it reads `second_review_pending` and the improvement drops to `connector_receipt` — SpecCI-3's accepted-AND-reviewed requirement enforced on the head (the dismissed gate is the accepted half, this is the reviewed half), the stale approval never approving the new head, and the immutable pin/receipt untouched (f1 still reads `independent_reviewed` on its own). Both the status head-resolution join (`a.id=p_bound[i]`) and the save-time decision lookup (`id=row_id`) are additionally scoped by `user_id`+`project_id`, since these tables use composite `(user_id,project_id,id)` keys with no global id uniqueness — a row must never resolve cross-tenant.

9. **`save_ai_citation_finding_review` no longer lets a reviewer queue DB work behind an arbitrary owner's workspace lock (finding 4058559524).** The RPC checked membership before the owner lock, but then took the owner workspace lock (`assert_knowledge_project(...,true)` + `citation_lock_account`) BEFORE resolving the finding/hash, and declared no `lock_timeout` — so an authenticated reviewer sending a schema-valid but RANDOM finding id / stale hash could enqueue blocking DB work on any owner's workspace lock (and the server's `Promise.race` timeout cannot cancel work already queued in Postgres). Restructured to the PROVEN withdrawal boundary (`remove_ai_citation_finding_review`): (1) optimistic membership admission (`citation_review_authorized`) before any lock; (2) **optimistic finding / hash / erasure / self-review validation before the victim lock** — a bogus/foreign finding → `citation_finding_unavailable`, an erased finding → `citation_finding_unavailable`, a self second-review → `citation_review_forbidden`, a stale hash → `citation_review_stale`, all lock-free; (3) fail-fast account admission (`assert_project_team_account`, a `FOR SHARE NOWAIT` probe, not the workspace lock); (4) **identical-receipt idempotency assessed before the lock** — a pure no-op returns the existing receipt without ever taking the workspace lock; (5) only a genuine MUTATION (new receipt, withdrawn-receipt reactivation, changed-decision conflict, capacity cap) proceeds under `assert_knowledge_project` + `citation_lock_account`, now bounded by a function-local `SET lock_timeout='1500ms'` (per lock acquisition; an exceeded wait raises 55P03 before any mutation); (6) an AUTHORITATIVE re-check under the lock re-probes both accounts, re-reads membership/policy, and re-reads the finding/hash/erasure/self-review — so a version bump, erasure, suspension or membership change landing after the optimistic reads is caught, and nothing trusts the optimistic-only state for the write. Dissent / withdrawal / receipt-cap semantics are unchanged. The historical advisory 4057887799 (authorization-before-lock) was already fixed and is NOT redone; this adds the finding/hash-before-lock + bounded-wait half.

10. **A failed/empty answer capture no longer completes an independent inspection (finding 4058688610).** `citation_finding_inspectable`'s answer branch accepted any non-null `rawAnswer` of length `<= 50000` — so `''` passed (`'' IS NOT NULL`, `char_length('')=0`), and the reviewer per-item gate (`char_length(coalesce(rawAnswer,''))<=50000`) had the same hole. A FAILED capture (empty answer) could therefore read `inspectable`/`inspectionComplete`, earn an `independent_reviewed` receipt, and lift an improvement to `owner_attested` with no material behind it. Both the canonical predicate and the per-item reviewer gate now require SUBSTANTIVE answer content — the value must be a JSON `string`, non-empty after trimming ASCII whitespace (`btrim(..., E' \t\n\r\f\v')`, so a spaces/tabs/newlines-only body is rejected too), and within the SAME `50000` upper bound (kept aligned between the two). An empty / whitespace-only / missing-key / explicit-null / non-string historical `rawAnswer` is not counted complete. The failed attempt stays VISIBLE and truthful: the reviewer item still reads `available:true` with its real (possibly empty) `content`/`contentLength`, only `inspectable:false` — nothing is fabricated or silently dropped. A substantive but partial capture (real text, `<= 50000`) remains inspectable; a truncated (`> 50000`) capture stays non-inspectable as before, so `answerComplete`/`citationsComplete` finding-authoring semantics are untouched. Downstream this flows through the canonical predicate: the `independent_opinion` vs `independent_reviewed` distinction, the receipt's `inspection_complete`, and the improvement's `owner_attested` cap all now honor it, with no separate divergent check. (Fail-closed boolean correction: for a MISSING `rawAnswer` key `jsonb_typeof(...)` is SQL NULL, so the per-item reviewer `inspectable` expression evaluated to NULL — which the strict `z.boolean()` schema rejected — rather than `false`. The per-item expression is now wrapped in `coalesce(..., false)` so every missing/null/non-string case yields a hard `false`; the canonical predicate was already fail-closed via null-safe `IS DISTINCT FROM` + explicit `RETURN false`.)

11. **The reviewer's audit digest is masked when the reviewed material is hidden, closing an offline brute-force oracle (finding 4058700102).** An erased finding's reviewer still received the PRE-erasure `record_sha256` (the forget redactor rewrites `record` + stamps `evidence_erased_at` but deliberately leaves `record_sha256` as the historic digest), on the for-review detail AND every receipt surface (standalone list + embedded `reviews[]`). Because the reviewer sees the rest of the record, a SHORT forgotten value (a price, opening hours) is offline brute-forceable against that digest — a guess oracle. The same applies to a REVOKED-source finding whose copied passage is withheld (finding 8/8b): the record is unchanged, so its digest is an oracle for the withheld passage. Fix: an internal helper `citation_finding_review_digest_masked(user,project,row)` reports when a finding's reviewed material is hidden (erased, or any cited source not `active`), and every REVIEWER-facing digest is masked to `null` — `read_ai_citation_finding_for_review` masks its top-level `recordSha256` and each embedded receipt's (computed inline from the erased/withheld values it already resolves, which equals the helper), and `read_ai_citation_finding_reviews` masks each receipt's for a reviewer (`p_actor<>p_owner`). The real digests are RETAINED SERVER-SIDE (`ai_citation_findings.record_sha256` + each receipt row) for audit and are never destroyed; no historic row is rewritten; no HMAC/secret is introduced; and the response never claims the old SHA hashes the redacted payload (the field is simply absent/`null`). **Owner retention vs reviewer access is explicit:** the OWNER (`p_actor=p_owner`) always sees the real digest; only reviewers are masked. **Usable reviewers keep their pin:** a fully-visible finding still exposes the exact `recordSha256` a reviewer needs to submit; an erased finding already blocks new reviews, and a withheld (revoked-source) finding is non-inspectable, so neither needs the pin. The client-safe `citationFindingForReviewSchema.recordSha256` and `citationFindingReviewEntrySchema.recordSha256` (list + embedded) become `sha256.nullable()`; the save-return `citationFindingReviewReceiptSchema.recordSha256` stays non-null (a receipt is only ever returned for a fully-visible finding the reviewer could pin — now ENFORCED, see below). **Save-side enforcement (masking the read alone was insufficient).** `save_ai_citation_finding_review` previously blocked only an *erased* finding, then compared the caller's `expected_sha` and returned the real digest in the new/idempotent receipt — so a masked (revoked-source) finding was still submittable: a newly-authorized reviewer could ENUMERATE short withheld passages online (guessed-sha `citation_review_stale` vs correct-sha success), and a reviewer who already had the hash could obtain an unmasked receipt. The save now calls `citation_finding_review_digest_masked` and raises `citation_finding_unavailable` for any masked (erased OR revoked/missing-source) finding **before the hash comparison and before idempotency, in BOTH the optimistic pre-lock and the locked authoritative paths** — so a correct and a guessed hash raise the SAME error at the SAME point (no stale-vs-success oracle), and no receipt (new or idempotent) ever returns the real digest for a masked finding. This makes the "opinion vs blocked" boundary explicit: a genuinely-visible-but-incomplete finding (a native-only/answer-only/cap-overflow finding) still admits an `independent_opinion`, but a finding whose copied material is HIDDEN (erased/revoked) blocks new reviews entirely. **Withdrawal is unaffected** (a reviewer may still withdraw their own historical receipt on a masked finding), and the owner audit is unchanged. **Status-condition unification.** The for-review read's `passages_withheld` used `(src->>'status')<>'active'`, which is NULL (not true) for a source with a missing/null status key — diverging from the helper's null-safe `IS DISTINCT FROM 'active'` and leaving the copied passage AND digest visible for a statusless source. Both now use the null-safe `IS DISTINCT FROM 'active'` (fail-closed boolean), so a missing/null status withholds and masks consistently across the read, the digest helper, and the save block.

12. **Deleting an answer now erases the answer-derived copies a finding kept (finding 4058893312).** The released source/record forget triggers redact `support[].sourcePassage`, but nothing propagated an ANSWER deletion — so a finding's copied answer text (`recommendation.passage`, `support[].claimSpan`, `accuracy[].claimSpan`) survived in the stored record and both reads even after the cited answer was gone (`available:false`). A candidate **AFTER DELETE trigger on the released `ai_answer_evidence`** now fires on EVERY answer-deletion path — `remove_ai_answer_evidence('answer')`, `remove_ai_answer_evidence('prompt')` cascade, the `supersedes_id` correction-chain cascade, and a project delete — and calls `citation_forget_redact_answer`, which erases exactly the three STRUCTURED answer-derived fields (via the shared pure `citation_redact_answer_fields`) to a `[redacted: answer forgotten]` marker in EVERY version of EVERY finding of the same owner+project that cites the answer (matched by SEMANTIC uuid `lower(e->>'id')=answer::text`), and stamps `evidence_erased_at`. Reusing `evidence_erased_at` means all existing erasure machinery applies for free: the reviewer digest + all receipt surfaces are masked (`citation_finding_review_digest_masked`), new reviews are blocked, and review/improvement current status downgrade. **Scope is honest:** only the structured answer copies are auto-erased; `support[].citedUrl`/`answerCapturedAt` are attribution (kept, mirroring the source redactor keeping label/url), and `observation`/`hypothesis`/`support[].reason` are free reviewer analysis (kept — the same documented boundary as the source redactor, not a claim that all pasted prose is gone). **Resurrection is closed** by a content-free `ai_citation_answer_erasures` marker (ids + timestamp, RLS-closed, `workspace_entities` FK ON DELETE CASCADE): an altered resave or a fresh finding citing a forgotten answer is re-redacted at `save_ai_citation_finding` (parallel to the source-erasure guard, independent of it). The redactor carries the same **project-delete guard** as the source redactor (skip when the `workspace_entities` project row is already gone — no orphan 23503), so a whole-project delete cascades cleanly. `record_sha256` is left as the pre-erasure digest (masked from reviewers). Owner and reviewer reads both show only the marker; the answer/source/native distinction stays explicit (the trigger keys on `kind='answer'` evidence; a source/native id never coerces).

Rollback inventory (objects added to the candidate): one column `ai_citation_findings.evidence_erased_at`; two CONTENT-FREE tables `ai_citation_source_erasures` and `ai_citation_answer_erasures` (both RLS-on, no policies, REVOKEd from every role, `workspace_entities` FK ON DELETE CASCADE — asserted closed by the candidate-chain closed-table inventory); the three source/record forget-cascade functions `citation_forget_redact_source(uuid,text,uuid)`, `citation_forget_source_passages()`, `citation_forget_record_passages()`; the three answer-forget functions `citation_redact_answer_fields(jsonb)` (shared pure field redactor), `citation_forget_redact_answer(uuid,text,uuid)`, `citation_forget_answer_passages()`; plus one internal reviewer-audit-digest helper `citation_finding_review_digest_masked(uuid,text,uuid)` (all REVOKEd from every role); three triggers `citation_forget_source_passages_trg` on `project_knowledge_sources`, `citation_forget_record_passages_trg` on `project_knowledge_records`, and `citation_forget_answer_passages_trg` on `ai_answer_evidence` (all released tables — the released migration files are NOT edited). A candidate rollback drops the three triggers, then the answer/source functions and the digest helper, then the two tables, then the column. `citation_forget_redact_source` and `citation_forget_redact_answer` (both project-exists guarded), `save_ai_citation_finding` (source AND answer resurrection guards), `save_ai_citation_finding_review` (pre-lock finding/hash/self validation + pre-lock idempotency return + a masked-material block via `citation_finding_review_digest_masked` — subsuming the old erased-only check — raised before the hash comparison and idempotency in BOTH paths, plus a new `SET lock_timeout='1500ms'` function config), `citation_finding_review_status`, `citation_finding_inspectable` (the answer branch now requires substantive `rawAnswer` content), `citation_improvement_status` (revoked-material dependency + the dismissed-head decision downgrade + the current-head review gate, composite-key scoped), `save_ai_citation_improvement` (dismissed-head binding refusal, composite-key scoped) `read_ai_citation_finding_for_review` (revoked-material gate + response-only copied-passage withholding adding a `sourcePassagesWithheld` field + the aligned substantive-`rawAnswer` per-item inspectable gate + reviewer audit-digest masking) and `read_ai_citation_finding_reviews` (reviewer audit-digest masking) gain in-body guards only (no signature change); `citation_finding_head_id` is unchanged in body (comment-only, documenting the caller's accepted-head requirement); the client-safe `citationFindingForReviewSchema` gains the matching `sourcePassagesWithheld: boolean`, and `recordSha256` on both `citationFindingForReviewSchema` and `citationFindingReviewEntrySchema` becomes `nullable` (masked-to-null on reviewer surfaces; the save-return `citationFindingReviewReceiptSchema.recordSha256` stays non-null). The candidate-chain inventory (`milo-candidate-chain-migration.test.ts`) asserts all seven new internal functions (the source/record forget trio, the three answer-forget functions, and the digest-mask helper) are granted to no role and both new erasure tables are RLS-closed with no client grant. No new client-facing RPC or grant.

Regressions (real released `forget_project_knowledge` RPC, in `citation-finding-review-migration.test.ts`): a source forget erases the copied passage in storage and on both the owner and reviewer surfaces across BOTH versions of a superseded finding, surfacing `evidenceErased`, while an unrelated source's finding keeps its passage and stays un-erased; a source cited in UPPERCASE is still matched (semantic uuid) and erased across versions; a record-only forget likewise erases (and downgrades a previously `owner_attested` improvement to `connector_receipt` with the receipt still auditable); a source-revision advance downgrades without erasing (no delete); a NEW review on an evidence-erased finding is refused while the pre-existing receipt remains auditable; an identical re-save maps to the redacted row and an ALTERED re-save is stripped by the save-time guard (no resurrection either way); a REVOCATION (row kept) retains the passage (not an erasure); a mismatched forget expectation erases nothing; the redactor is tenant-scoped (a different owner's finding citing the same source id is untouched); and a passage-free finding is a no-op. Completeness cases: after a RECORD forget (source + another record surviving), both an altered re-save AND a fresh finding citing the surviving source are redacted at save (no resurrection via the source marker), while the source stays usable; with two records + an independent review + an `owner_attested` improvement, forgetting one record retains the stored receipt but collapses the current `reviewStatus` to `owner_only` and downgrades the improvement to `connector_receipt` — owner detail and reviewer read agreeing (`evidenceErased`) even though the other record is still readable; and new material appearing later does NOT resurrect the review/attestation (status stays downgraded, a new review is refused). Deletion + revocation cases: a real whole-project `DELETE workspace_entities` (with sources, records, findings and a preexisting erasure marker) succeeds atomically — every `project_knowledge_sources`/`_records`/`ai_citation_findings`/`ai_citation_source_erasures` row for the project is gone and another project of the same owner is untouched (no 23503 orphan); a finding citing a REVOKED source with a distinctive live value + excerpt returns `material:[]`/`materialCount:0`/`inspectable:false` for it (the distinctive text absent from the entire serialized reviewer response) while a co-cited ACTIVE source stays inspectable, `evidenceErased` is false, and the owner's stored copied passage is retained in the DB (`storedPassage`); and — the copied-field boundary — a finding whose `support[].sourcePassage` holds a distinctive SECRET copied while the source was ACTIVE reads that SECRET back to the reviewer with `sourcePassagesWithheld:false` before revocation, then after revoking one cited source the reviewer response WITHHOLDS the passage (marker, `sourcePassagesWithheld:true`, the SECRET absent from the whole serialized response) while a co-cited active source's material is still served, and BOTH the stored row (`storedPassage`) and the owner's own detail read still return the real SECRET (revocation is not erasure; `evidenceErased:false`). Decision-gate cases (in `citation-record-migration.test.ts`): an accepted-head improvement delivered at `connector_receipt` collapses to `unverified` — with its `boundFindingRowIds` pin unchanged — once the owner dismisses the finding via a new head, so the dismissal is not bypassed through the old accepted pinned row; a NEW improvement binding to that dismissed head is refused at save (no fallback to the older accepted version), while a `needs_second_review` head stays bindable and delivers `connector_receipt` (the provisional finding is not rejected — its owner_attested cap is proved in the review-migration suite); an unrelated accepted finding's improvement in the same project stays `connector_receipt` (finding-scoped, not project-wide); the status helper called directly on a bound dismissed head returns `unverified` (the historical-bad-row path); and — idempotency preserved — resaving after an ACCEPTED correction supersedes the head rebinds to the exact new accepted head (v2, `boundFindingRowIds` = the new row) while the prior version stays pinned to the immutable old row. Current-head review gate (in `citation-finding-review-migration.test.ts`): an accepted, independently-APPROVED f1 with a delivered `owner_attested` improvement drops to `connector_receipt` once the owner turns the finding into a `needs_second_review` f2 — the new head has no receipts, so the stale f1 approval never approves it — while `boundFindingRowIds` stays `[f1]` and f1 read on its own is still `independent_reviewed` (pin and receipt untouched). Save-review pre-lock boundary (in `citation-finding-review-migration.test.ts`, with the owner's `workspace_meta` deleted so `citation_lock_account` fails closed if the lock is reached): an authorized reviewer's RANDOM finding id fails `citation_finding_unavailable` and a STALE hash fails `citation_review_stale` — both before the lock — while a genuine new-receipt submission (real finding + correct hash) reaches the lock and surfaces `citation_record_unavailable`, and no receipt is written for any; an IDENTICAL resubmit returns the same receipt id idempotently WITHOUT taking the lock, whereas a CHANGED decision on the same content is a mutation that reaches the (unavailable) lock and leaves the stored decision unchanged; and `pg_proc.proconfig` for `save_ai_citation_finding_review` declares `lock_timeout=1500ms` and a pinned `search_path`. (PGlite's single in-memory connection cannot exercise a real concurrent lock wait; these assert the observable pre-lock ORDERING and the DECLARED bound, not an observed timeout.) Failed-answer cases (in `citation-finding-review-migration.test.ts`, simulating a failed/historical capture by overwriting or removing a stored `rawAnswer`): a finding citing an EMPTY or WHITESPACE-only answer reads `available:true` but `inspectable:false` in the reviewer item with `inspectionComplete:false`, an `approved` receipt on it records `inspectionComplete:false` and the finding's `reviewStatus` is `independent_opinion` (never `independent_reviewed`), and a delivered improvement caps at `connector_receipt` (never `owner_attested`); a missing-key, explicit-null, and non-string historical `rawAnswer` are likewise non-inspectable; and a normal substantive answer is unaffected — `inspectable:true`, `inspectionComplete:true`, an `approved` receipt is `inspection_complete`, `reviewStatus` is `independent_reviewed`, and the improvement reaches `owner_attested`. Reviewer audit-digest masking cases (in `citation-finding-review-migration.test.ts`): while the finding is active the reviewer's for-review `recordSha256` is the real 64-hex hash (the pin they submit with); after a source FORGET the finding is erased and the reviewer's for-review `recordSha256`, its embedded `reviews[].recordSha256`, and the reviewer's standalone receipt-list `recordSha256` are all `null` (the real hash absent from the entire serialized reviewer response), while the OWNER's receipt list still returns the real hash and the server rows (`ai_citation_findings.record_sha256` + the receipt row) retain it; the same masking holds when a cited source is REVOKED (not erased — `evidenceErased:false`, `sourcePassagesWithheld:true`), with owner + server retention intact — so the copied-text visibility boundary is not bypassed via the digest/receipt fields. Save-side masked block: a review recorded while a source is active, then the source revoked and the owner's `workspace_meta` deleted (so the lock would fail closed) — the correct old hash AND a guessed hash BOTH raise `citation_finding_unavailable` before the lock (no stale-vs-success oracle), an identical retry cannot unmask, the pre-existing receipt is untouched server-side, and a fully-visible save still works; the revoked-source inspection-gate test now asserts the review is BLOCKED (masked digest, guessed hash refused) rather than recording an opinion. Fail-closed status unification: a finding citing a source whose payload has a MISSING/null status key withholds the copied passage AND masks the digest (`recordSha256:null`, `sourcePassagesWithheld:true`), not left visible by a `<>`-NULL comparison, while the owner's stored copy is retained. The failed-answer missing/null/non-string fixture now imports all placeholders while valid before corrupting them (so no `importAnswerEvidence` read strict-parses an already-corrupted row) — isolating the test without weakening the production strict input schema. Answer-delete erasure cases (in `citation-finding-review-migration.test.ts`, driving the REAL released `remove_ai_answer_evidence`): a real `remove_ai_answer_evidence('answer')` erases `recommendation.passage` + `support[].claimSpan` + `accuracy[].claimSpan` to the marker in ALL versions of the citing finding (free-analysis prose kept), sets `evidenceErased`, masks the reviewer digest + the embedded receipt, blocks a new review, and leaves the owner detail read showing only markers — while a finding citing a DIFFERENT answer keeps its copies (answer-scoped); an altered resave AND a fresh finding citing the deleted answer are re-redacted at save (answer-erasure marker, no resurrection); a `remove_ai_answer_evidence('prompt')` cascade erases the finding under it (`evidence_erased_at` set); and a whole-project `DELETE workspace_entities` cascades prompts → answers, firing the trigger after the project row is gone so the project-exists guard skips (no orphan 23503) — every `ai_citation_findings`/`ai_citation_answer_erasures`/`ai_answer_evidence` row for the project is gone and another project of the same owner is untouched. The candidate stays UNAPPLIED; no P2, no released-migration edit, no provider/commit/deploy; the USD 50 manual-free rule is unchanged. Panel binding, destination-content proof, UI, the native parser and real-use acceptance remain open.

## Codex checkpoint — 20 September, binding corrections

The corrected packet was independently inspected against the released publication contracts. Focused SQL/server tests: 35 passed across two files (1.39s); TypeScript passed. ESLint and git diff --check passed after a formatter-only Codex integration exception on the five citation-record TypeScript files. Logs: /tmp/milo-p3-binding-recheck-focused-20260920.log and /tmp/milo-p3-binding-recheck-types-20260920.log. No full-suite, deployment, destination or real-use acceptance is claimed by this checkpoint. Remaining fact resolution, reviewer authentication and panel integration stay open.


### Business-fact boundary verification checkpoint, 2026-09-20

Codex independently checked the completed correction packet: actual saved capture date binding, microsecond normalization, historical read identities, and discriminated bounded JSON detail. Focused tests: 67 passed across four files (2.08s); TypeScript passed. ESLint and git diff --check passed after a formatter-only Codex integration exception. Logs: /tmp/milo-p3-serializable-focused-20260920.log, /tmp/milo-p3-serializable-types-20260920.log, /tmp/milo-p3-facts-lint-20260920.log. This is a local checkpoint; full integration checks, reviewer authorization, panel binding, destination proof, release and real-use acceptance remain open.

### Codex reviewer/source checkpoint — 20 September 2026

Completed scoped review of real account admission, bounded receipt display with full dissent aggregation, reviewer withdrawal, and actual source material inspection. Focused six suites passed 98 tests (2.52s); TypeScript passed. Formatting-only Codex integration exception applied to seven changed TypeScript files; scoped ESLint and whitespace checks passed. Full suite: 6279 passed, one failed (44.51s), specifically the stale candidate migration inventory, which still listed artifact staging as unapplied and omitted the new P3 candidate. Production build independently passed. Logs: /tmp/milo-p3-source-bounds-{focused,types}-20260920.log and /tmp/milo-p3-review-checkpoint-{format,lint,full,build}-20260920.log. This is a local checkpoint, not release acceptance. Reconcile current main and migration inventory next; panel binding, destination verification, UI, genuine exports and real-use acceptance remain open.

### Codex integrated chain verification — 20 September 2026

After normal merge of released main bd0afee8, the combined migration chain test applies the P3 candidate over its real released dependencies and verifies service RPCs, internal helpers and closed stores. All 52 chain tests passed (1.07s); TypeScript, scoped ESLint, full 6322-test suite across 388 files (43.21s), production build and whitespace checks passed. Formatter-only Codex integration exception on the chain test. Logs: /tmp/milo-p3-chain-{focused,types,format,lint,full,build}-20260920.log. No migration applied or production deployment performed. P2 panel binding, destination-content proof, UI and real-use acceptance remain outstanding.


### Codex revocation, accuracy and withdrawal verification — 20 September 2026

Reviewed current active-source availability, reuse of the canonical accuracy resolver, ownership-before-workspace-lock withdrawal and explicit function-scoped 1500ms per-lock timeout. Focused seven suites passed 164 tests (3.28s); TypeScript passed. Full suite passed 6336 tests across 388 files (47.36s); scoped ESLint, production build and whitespace checks passed. Formatter-only Codex integration exception on two changed test files. Logs: /tmp/milo-p3-withdrawal-bound-{focused,types,format,lint,full,build}-20260920.log. The earlier fixture failures are superseded by this actual run; strict schemas and malformed-record coverage remain intact. Lock ordering and idempotent avoidance use missing-workspace tripwires; timeout configuration is read from pg_proc. No actual concurrent wait/deadlock experiment, production migration or deployment is claimed. Candidate remains unapplied; panel binding, independent destination proof, UI, genuine native parsing and real acceptance remain open.


## Codex retention and reviewer-withholding verification — 21 September 2026

Reviewed actual project-delete cleanup, record/source erasure provenance, prevention of copied-passage resurrection, current-status downgrade and response-only withholding of revoked copied passages while owner data remains intact. Seven focused suites183PASS(7.59s); TypeScriptPASS. Scoped ESLint, full6355tests/388filesPASS(105.33s), production build and git diff --checkPASS. Logs /tmp/milo-p3-copy-final-{focused,types,format,lint,full,build}-20260921.log. Formatting-only Codex integration exception on five changed TypeScript files. Earlier181/1failed parameter fixture is superseded. Erasure provenance cardinality is cumulative per distinct source, not bounded by concurrent live-source cap; project lifecycle cleanup is explicit, no invented finite cap. Candidate20260920200000UNAPPLIED. Exact-head code/security review, P2 integration, independent destination proof, UI, genuine parsing, release and real acceptance remain open.

## Codex current-decision and bounded review-save verification — 21 September 2026

Reviewed owner dismissal against current scoped finding head, preserved historical pins, current-head second-review gate, optimistic finding/hash/erasure checks before owner workspace locking, identical-receipt no-op and authoritative rechecks for mutations. Seven focused suites189PASS4.15s; TypeScriptPASS. Scoped ESLint, full6361tests/388filesPASS45.62s, production build and git diff --checkPASS. Logs /tmp/milo-p3-save-lock-{focused,types,format,lint,full,build}-20260921.log. Formatter-only Codex integration exception on two changed tests. Provisional findings retain truthful connector receipts but pending review caps owner attestation; dismissed current findings yield unverified. Missing-workspace tripwires prove pre-lock rejection/idempotency ordering; pg_proc confirms1500ms per-lock timeout. No empirical concurrent wait experiment or production acceptance claimed. Candidate20260920200000UNAPPLIED; exact-head reviews, P2 integration, destination proof, UI and real-use acceptance remain open.

## Codex substantive-answer and digest-visibility verification — 21 September 2026

Reviewed empty/malformed answer inspection, null-safe status handling, reviewer digest masking across detail and receipt lists, and masked-finding rejection before hash comparison and idempotency in optimistic and authoritative save paths. Server audit digests and owner data remain intact. Seven focused suites198PASS4.14s; TypeScriptPASS. Scoped ESLint, full6370tests/388filesPASS43.54s, production build and git diff --checkPASS. Logs /tmp/milo-p3-digest-final-{focused,types,format,lint,full,build}-20260921.log. Formatter-only Codex integration exception on three changed TS files. Earlier failed fixture/schema checks superseded by this actual run; no production acceptance inferred. Candidate20260920200000UNAPPLIED; exact-head review, P2 integration, destination verification, UI, genuine parsing and real-use acceptance remain outstanding.

### Independent verification — 2026-09-21, answer-forget propagation

205 focused tests across seven suites and 6377 full tests across 388 files passed (full run 45.85s). TypeScript, scoped ESLint, production build and git diff --check passed. Independent review covered answer-delete redaction, content-free provenance, altered-resave protection, project deletion and internal function/table permissions. Codex exception: formatter-only edits on two changed tests and this verification checkpoint. Structured answer copies are erased; free reviewer prose remains explicitly outside automatic erasure scope. Candidate remains unapplied; no production or concurrent-connection proof is implied.
