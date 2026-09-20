# Citation Intelligence v1 — P3 findings/improvements storage + publication-evidence binding (Claude, 20 September 2026)

Bounded P3 packet on branch `codex/milo-citation-findings-20260920` over released main `faaa195f`. P1
(native raw-artifact staging) is RELEASED (migration `20260919165000` applied immutable; its release
evidence `evidence/citation-artifact-release-2026-09-20.md` is preserved and authoritative). P2
(panel/session protocol) is a separate branch under review; its real table will be `citation_panels` and
this packet does NOT depend on or guess it. Conversation repair is another worktree. Everything here is in
the single additive candidate `20260920200000_citation_findings_improvements.sql`, **UNAPPLIED**. No
git/DB-apply/network/provider/deploy/paid action; USD50-global / manual-free unchanged.

**This packet is storage + server boundary + a structured publication/approval binding. It is NOT the
complete P3 workflow and is NOT production-accepted.** It does not perform, and never claims, an
independent/system check that a destination actually shows the approved content, and it makes no causal
claim.

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
- `src/lib/citation-record-migration.test.ts`, `src/lib/citation-record.functions.test.ts` — real-PGlite
  SQL + endpoint tests.

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

## Remaining wiring (NOT implemented; storage/binding-only is not complete P3)

- **Independent destination content check.** No trusted record proves a destination shows the approved
  content; `owner_attested` is the strongest status and is an owner attestation, not a system check. A
  future packet would need an authenticated independent check to go beyond it.
- **Two-person / independent reviewer authentication** (P3 accepts only self-attested findings),
  **dated business-fact resolution** (`accuracy[].factId` is a declared reference; no fact table yet), and
  **panel authentication** (panel/client scope stays owner-declared until the P2 `citation_panels`
  contract exists) all remain unresolved and are documented here rather than guessed.

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
and `unresolved`-status descriptions are superseded by the two axes above.

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
auth, bind to the owner, and refuse off-contract records.

No pass counts are claimed; single-connection PGlite verifies logical guards, not true concurrency.

## Prepared commands — UNRUN (Codex executes)

```
npx vitest run src/lib/citation-record-migration.test.ts src/lib/citation-record.functions.test.ts
npx vitest run
npx tsc --noEmit
npx eslint src/lib/citation-record.ts src/lib/citation-record.server.ts src/lib/citation-record.functions.ts src/lib/citation-record-migration.test.ts src/lib/citation-record.functions.test.ts
npx prettier --check "src/lib/citation-record*.ts" supabase/migrations/20260920200000_citation_findings_improvements.sql
npm run build
```

Migration `20260920200000` is UNAPPLIED. This packet binds improvement evidence to trusted
publication/approval records with honest, distinct statuses; it is not P3 completion and not production
acceptance, and the outstanding real-acceptance gates (genuine exports, the owner-locked panel, the manual
pilot, independent destination proof) remain.

## Codex checkpoint — 20 September, binding corrections

The corrected packet was independently inspected against the released publication contracts. Focused SQL/server tests: 35 passed across two files (1.39s); TypeScript passed. ESLint and git diff --check passed after a formatter-only Codex integration exception on the five citation-record TypeScript files. Logs: /tmp/milo-p3-binding-recheck-focused-20260920.log and /tmp/milo-p3-binding-recheck-types-20260920.log. No full-suite, deployment, destination or real-use acceptance is claimed by this checkpoint. Remaining fact resolution, reviewer authentication and panel integration stay open.
