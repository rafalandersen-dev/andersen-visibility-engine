# Citation Intelligence v1 — P3 findings/improvements storage + atomic invalidation (Claude, 20 September 2026)

Third accepted packet of `product/CITATION_WORKFLOW_IMPLEMENTATION_2026_09_19.md` (§2.5, §3, §6), on branch
`codex/milo-citation-findings-20260920` over released main `faaa195f`. P1 (native raw-artifact staging) is
RELEASED (migration `20260919165000` applied immutable; `evidence/citation-artifact-release-2026-09-20.md`
preserved). P2 (panel/session protocol) is a separate branch under review (PR146) and is NOT touched.
Conversation repair is another worktree (candidate `20260920180000`) and is NOT touched. This packet adds
the human-reviewed **findings** and **improvements** store, its authenticated server boundary, and atomic
invalidation of dependent claims. No genuine exports exist; no native rows/metrics/results are fabricated.
No git/DB(applied)/network/provider/deploy/credential/package/auto-memory action. USD50-global /
manual-free-grant unchanged.

## Owned NEW files (disjoint from released P1, P2 branch, and the conversation-repair worktree)

- `supabase/migrations/20260920200000_citation_findings_improvements.sql` — additive, **UNAPPLIED**
  candidate: `ai_citation_findings`, `ai_citation_improvements` (RLS, `REVOKE ALL … FROM
  PUBLIC,anon,authenticated,service_role`, `workspace_entities` composite FK `ON DELETE CASCADE`,
  `record_sha256` idempotency, `finding_id/improvement_id`+`version` immutable chains, `supersedes_id`
  fork guard, self-FK `NO ACTION` with `remove_*` unlinking the successor + a server-derived
  `predecessor_deleted` marker, bounded `octet_length`); `SECURITY DEFINER SET search_path=''` RPCs
  `save_/read_(list)/read_(one)/remove_ai_citation_finding` and `…_improvement` gated by
  `assert_knowledge_project` (account-first `FOR UPDATE` lock on writes); three internal
  `REVOKE`-closed helpers (`citation_finding_sources_available`, `citation_finding_head`,
  `citation_improvement_verified`); `EXECUTE` granted to `service_role` only.
- `src/lib/citation-record.ts` — client-safe stage schemas (reusing the accepted `findingSchema` /
  `improvementSchema` verbatim) + owner-declared panel/client scope + read-back summary/detail/state
  schemas, with an input byte-budget guard held under the DB `record::text` cap so an over-cap record is
  refused at the boundary rather than failing the RPC generically (the PR144 lesson).
- `src/lib/citation-record.server.ts` — `call()` 10 s-timeout wrapper (branded-error normalization: only
  the two capacity codes surface, every thrown/rejected/transport error collapses to
  `citation_record_unavailable`, no raw text); `save/read/get/remove` for findings and improvements.
- `src/lib/citation-record.functions.ts` — eight `createServerFn`+`requireSupabaseAuth` endpoints with the
  `context.userId !== expectedOwnerId → evidence_owner_changed` guard.
- `src/lib/citation-record-migration.test.ts`, `src/lib/citation-record.functions.test.ts` — the §6 P3
  cases (real PGlite SQL round-trips + endpoint auth).

Only NEW files are added; no released migration, P2 file, shared-helper behavior or the global candidate
inventory is edited. The implementation doc is appended (P1-released status + this P3 note) without
erasing historical evidence.

## Security constraints enforced

- **Authenticated provenance the pure helpers lack.** `citation-finding.ts`/`citation-panel.ts` are typed
  records and rules only. Here every row's `actor_id` (and a finding's `reviewer_id`) is the authenticated
  caller, never a caller claim. A finding whose top-level `review.reviewer` is not the actor, and an
  improvement whose `verification.reviewer` is not the actor, are **refused** — a review/verification can
  only be attributed to the authenticated reviewer.
- **`verified` is server-derived on every read, never accepted from the client.** There is no client
  `verified` field; `citation_improvement_verified` re-computes it from LIVE state: a verification receipt
  is present, `verifiedAt` is on/after `change.approvedAt`, there is ≥1 baseline capture and every one
  still resolves to a live `ai_answer_evidence` row, and every referenced finding still resolves to an
  in-scope finding whose own cited answer/native sources are still present. A forged `verified=true` is
  impossible, and a deleted source, finding or baseline collapses `verified` to false.
- **Improvement requires scoped finding / baseline / receipt (no circular gate).** Save resolves every
  `findingIds` entry to a stored finding sharing the improvement's declared panel/client scope (foreign /
  missing / out-of-scope → refused), and, when a receipt is present, resolves every `baselineCaptureIds`
  entry to `ai_answer_evidence`. The comparable **re-test** stays a read-side computation in the existing
  `comparablePairs` helper (fed by these records); storage never gates on the re-test, so completed proof
  adds the re-test rather than becoming a circular precondition.
- **Atomic deletion / invalidation of dependent claims.** Removing a finding preserves a distinct later
  correction (unlink successor + `predecessor_deleted`), and any dependent improvement's `verified`
  collapses to false on the next read because the finding no longer resolves — uniform with a released
  **source** deletion (`ai_answer_evidence` / `ai_native_report_artifacts`), which P3 cannot trigger on a
  released table and instead resolves at read time, marking a finding `sourceAvailable=false` and its
  dependent improvements unverified. Project deletion CASCADEs both tables via the `workspace_entities` FK.
- **Tenant isolation, immutable versions, bounded quota, account-first locking, idempotency.** Every RPC
  runs `assert_knowledge_project` (owner/project; `FOR UPDATE` on writes). Records are append-only
  versions with supersede chains; corrections never rewrite originals. Conservative provisional caps
  **200 findings / 100 improvements per project** (including versions; no eviction, no raise, no new
  spend). Identical re-save is idempotent by `record_sha256`. No provider calls, auto-approval or
  publication; the Capture API is not treated as consumer evidence anywhere here.

## Narrow integration points / residual dependencies (no guessed schema)

- **Panel/client scope is owner-declared, not authenticated against a P2 panel record.** P3 is independent
  of P2 (per §8): the finding/improvement rows carry a declared `(panelId, panelVersion, client)` used
  only to bind an improvement to findings of the *same* declared scope (string equality, exactly as
  `comparablePairs`' `panelClientKey`). Authenticating that a panel/version actually exists and is
  owner-locked is a P2/P4 concern; this packet neither invents the P2 `ai_citation_panels` contract nor
  depends on it.
- **Source resolution reads two RELEASED tables.** `citation_finding_sources_available` and
  `citation_improvement_verified` read `ai_answer_evidence` (released `20260910210000`) and
  `ai_native_report_artifacts` (released `20260919165000`) by `(user_id,project_id,id)`. Both are owned by
  the migration role, so the `SECURITY DEFINER` helpers resolve them; nothing is written to, or altered
  in, a released table. `'source'`-kind evidence is the inline passage on the finding and is always
  present. This read dependency is the only cross-packet coupling.
- **DB does not fully re-validate the large finding/improvement structure.** Unlike P1's small metadata,
  the full `findingSchema`/`improvementSchema` structure is validated at the Zod boundary; the DB
  independently enforces the security-critical invariants (actor/reviewer, family/decision enums, scope,
  caps, idempotency, dependency resolution, byte cap). Direct RPC access is `service_role`-only (REVOKEd
  from anon/authenticated), and the trusted server always validates with Zod first; a malformed direct-RPC
  record is out of the realistic threat model. Noted, bounded limitation.

## Tests prepared (offline, synthetic; NOT RUN here — Codex runs them under the recorded exception)

- `citation-record-migration.test.ts` (real PGlite over project_knowledge → answer_evidence →
  native_report_artifacts → this candidate): server-derived actor/reviewer + record round-trip; forged
  reviewer refused; idempotent re-save; corrected finding versions/supersedes; a finding marked
  `sourceAvailable=false` after its cited answer source is deleted; improvement `verified` true only when
  findings+sources+baselines resolve in scope; a cross-scope finding reference refused; a forged
  verification reviewer refused; `verified` downgraded when a baseline capture is deleted; a dependent
  improvement's `verified` invalidated when its finding is removed (record preserved); owner/project
  isolation; RLS closes both tables and the internal helper to every client role while `service_role` may
  call the list RPC.
- `citation-record.functions.test.ts` (mocked server): all eight endpoints require auth; reads/saves bind
  to the authenticated owner; foreign `expectedOwnerId → owner_changed`; caller-supplied owner, malformed
  project id/uuid, forged server-only extra key, an unconfirmed accepted finding, an empty `findingIds`
  and a receipt-without-baselines improvement all refused at the boundary; deletion owner-switch never
  touches storage.

These assert behavior (authenticated provenance, live `verified` derivation, atomic dependency
invalidation, scope binding, isolation, caps), not code structure. **No pass counts are claimed** and no
concurrency is claimed (single-connection PGlite verifies logical guards under the `FOR UPDATE` lock).

## Prepared commands — UNRUN (Codex executes)

```
npx vitest run src/lib/citation-record-migration.test.ts src/lib/citation-record.functions.test.ts
npx vitest run
npx tsc --noEmit
npx eslint src/lib/citation-record.ts src/lib/citation-record.server.ts src/lib/citation-record.functions.ts src/lib/citation-record-migration.test.ts src/lib/citation-record.functions.test.ts
npx prettier --check src/lib/citation-record*.ts supabase/migrations/20260920200000_citation_findings_improvements.sql
npm run build
```

## Outstanding real-acceptance gates (unchanged; cannot be self-certified)

Genuine authorized native exports (still absent), the owner-locked panel (P2/P4), the four-week manual
ChatGPT-Search captures, two distinct destination-verified improvements and one comparable re-test remain
the real-acceptance gates. This packet stores and binds those records with authenticated provenance and
atomic invalidation; it does not itself constitute that acceptance, and the P4 review UI / P5 parser are
out of scope. Migration `20260920200000` is UNAPPLIED.

## Review correction — six findings (20 September; SUPERSEDES the `verified`-boolean claims above)

The initial cut passed its 15 tests but did not meet acceptance: it over-claimed verification and under-
resolved sources/identity/locking/idempotency. All six review findings are fixed together in the same
UNAPPLIED candidate `20260920200000` (no released migration, no P2 file, no shared-helper edit). **This
packet is storage + server boundary; it does NOT system-verify an improvement.** Candid corrected state:

1. **Verification is no longer `verified: true` from caller strings.** The RPCs now return a server-derived
   `verificationStatus` re-computed on every read: `owner_attested` (the authenticated PROJECT OWNER
   recorded an `owner_inspection` over evidence that still resolves — an authenticated owner attestation,
   not a probed/causal system proof), `unresolved` (a `publication_receipt`/`index_inspection` method:
   there is no safe contract here to bind the caller receipt to a trusted `publication_evidence` /
   `google_index_inspections` record, so it is explicitly NOT authenticated), or `unverified`. A forged
   approver and `approvedBy`/`approvedVersion`/`taskId` are declared, **unresolved** references (no Plan/
   Studio approval-resolution contract is invented). A caller receipt or forged approver can never reach
   an authenticated state.
2. **Source resolution is real, and opaque/unparsed evidence is never elevated.** `kind:'source'` now
   resolves against the trusted `public.project_knowledge_sources` (the finding carries only an id, so a
   missing source is *unavailable*, not "always available"); `kind:'answer'`/`'native'` are presence-only
   and a `pending_parser` artifact or a raw answer is never treated as validated measurement. A finding is
   refused unless **every** embedded reviewer identity (top, `secondReview`, `recommendation`, each
   `support[]`/`accuracy[]`) is the authenticated actor — a foreign/forged reviewer is rejected via a
   `jsonpath $.**.reviewer` scan; two-person review needs a trusted reviewer-resolution boundary (below).
3. **Account lock fails closed.** Each write RPC calls a P3-owned `citation_lock_account` that takes the
   `workspace_meta` `FOR UPDATE` lock and RAISES when the row is missing (the shared
   `assert_knowledge_project` does not check `FOUND`), so a missing account row fails before any
   quota/idempotency/version mutation. No shared helper was edited.
4. **Idempotency binds scope.** `record_sha256` is computed over the canonical declared scope plus the
   record, and a logical `finding_id`/`improvement_id` reused under a different panel/client is refused as
   scope drift — an identical record under a different scope can never silently return the prior scope's
   row or resurrect a cross-panel claim through the version chain.
5. **Version dependencies are pinned; deletion invalidates, never rebinds.** An improvement stores the
   exact `ai_citation_findings.id` version rows it resolved at save (`bound_finding_row_ids`); verification
   requires those exact rows to still exist, so deleting the referenced correction collapses the dependent
   claim to `unverified` instead of silently rebinding to an older superseded version. No deleted content
   is retained (only the `predecessor_deleted` marker on the direct successor).
6. **Byte bounds aligned; guards fail closed.** The table caps for `client_name`/`client_market` are 600/
   360 bytes to admit the client's 200/120 UTF-16-unit multilingual bounds (a BMP char is ≤3 bytes), so a
   valid CJK name is not rejected at INSERT. Missing/forged reviewer, an unorderable/pre-approval or null
   timestamp, and an empty pinned-finding set all yield `unverified` (never authenticated).

New/updated regressions in `citation-record-migration.test.ts` cover each: owner_attested vs. always-
`unresolved` receipt methods; forged top/nested reviewer refusal; `kind:'source'` resolution + removal;
multilingual byte bound; scope-drift refusal; baseline-deletion downgrade; pinned-version deletion
invalidation without rebind; missing-account-row refusal then success; and direct fail-closed status
checks. Still NOT RUN here (Codex runs them).

### Precise remaining wiring (NOT implemented here; storage-only is not complete P3)

- **System (causal) verification of a `publication_receipt`/`index_inspection`.** A future packet must
  define the binding contract from an improvement's `destination`/receipt to a trusted
  `public.publication_evidence` (outcome `published`) or `public.google_index_inspections` (status
  `succeeded`, matching `url`) record for the same project, and only then may a status stronger than
  `owner_attested` be derived. Until then those methods are `unresolved`.
- **Two-person / independent reviewer authentication.** P3 accepts only self-attested (actor-equals-
  reviewer) findings; authenticating a distinct `secondReview`/support/accuracy reviewer needs a trusted
  reviewer-identity/membership resolution boundary.
- **Dated business-fact resolution.** `accuracy[].factId` is a declared reference; there is no
  business-fact table yet, so an accuracy assessment's fact is not authenticated.
- **Panel authentication.** Panel/client scope stays owner-declared until the P2 `ai_citation_panels`
  contract is available to authenticate it.

Acceptance is therefore NOT met by this packet: it is a correct, forgery-resistant storage/boundary layer
with explicit unresolved statuses, not the end-to-end verified-improvement workflow.
