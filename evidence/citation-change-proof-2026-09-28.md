# Citation change evidence — R / R1 / R2 (28 September 2026)

Isolated worktree `/Users/rafi/Projects/milo-citation-change-proof-20260928`, branch
`codex/milo-citation-change-proof-20260928` from exact `ce09f2380f07ff66dcc4de18384370c9c6da03d8` (PR156 head; the
PR156 worktree stays frozen). Nothing committed, pushed, applied, deployed or sent to any provider. Candidate
migration `supabase/migrations/20260928120000_citation_change_evidence.sql` is UNAPPLIED and additive; v3
(`20260927190000`, candidate) and v2 (`20260926190000`, APPLIED) are untouched.

## What the change adds (product decisions of packet R, corrections R1 and R2)

1. **Change artifacts** (`ai_citation_change_artifacts`): the intended listing/configuration change as enumerated
   NON-SECRET fields only (listing: name, address, phone, openingHours, website, description, category,
   priceRange; configuration: siteTitle, siteTagline, defaultPostType, businessName, businessAddress,
   businessPhone, businessHours, robotsIndexing, canonicalUrl, structuredDataType, websiteUrl). R1/1: the nested
   shape is EXACT (`after` required text, `before` optional text/null, no other nested key), enforced by the RPC,
   by the table CHECK and by a read-side projection (`citation_change_fields_project`) so no read path can surface
   a refused nested key. Deletion removes content and keeps only identifiers + `artifact_deleted_at`.
2. **Version-bound approval** (`ai_citation_change_approvals` + `ai_citation_change_approval_decisions`): owner or
   delegate (same reviewer/editor policy predicate as citation reviews, with the granted membership/policy
   revisions). R1/2: the approval carries its OWN `revision`; a writer names the reviewed revision
   (`citation_change_stale` otherwise), and every request carries a frozen `requestId` whose replay returns its
   historical decision (never a new approval, never a conflict). R2/1: live actor/owner account + delegate
   authorization run BEFORE any replay (a revoked/expired/banned/removed delegate is refused like a fresh
   request). R2/2: an identical delegate decision is a no-op only while its recorded authority is the live one; a
   changed membership/policy revision makes the explicit re-decision a real new revision with the live revisions.
3. **Performed declarations** (`ai_citation_change_receipts`): a person declares the change was carried out at a
   bounded instant (≥ approval, ≤ now+5 min); digest-idempotent; never delivery proof (`receipt_recorded`).
4. **Improvement binding** (`save_ai_citation_improvement_v4`, explicit change branch, never delegated into the
   connector-only validation): artifact digest = approved version, approver = the artifact's CURRENT approver,
   destination = kind + reference; owner inspection derives the verification block; head + reviewed-row guards;
   public-URL saves delegate to the unchanged v3.
5. **Owner and independent inspection**: `ai_citation_inspection_assignments` (owner-granted per improvement row,
   R1/4 `revision` bumped on re-grant) and `ai_citation_improvement_inspections` (append-only per-inspector chain;
   a withdrawal is a NEW head; R1/3 the digest names the caller's frozen reviewed head so a lost-response retry
   replays and a fresh inspection after renewed authority is a new receipt). R1/4 receipt validity
   (`citation_inspection_receipt_effective`) is bound to the assignment/membership/policy revisions the receipt was
   submitted under plus live independence; a negative head is sticky against owner-side gates. R1/5 dissent is
   scoped by the bound identity (same artifact digest + receipt, or same publication attempt + version) across
   every row, exposed as `dissent` provenance; a cosmetic owner correction never sheds it. `verifiedEligible` =
   not disputed AND (owner_attested OR positive independent over a delivered/receipted change with resolving
   baselines and an uncapped finding gate) — the single predicate `isVerifiedImprovement`, `comparablePairs` and
   `retestReadiness` consume.
6. **Performer provenance**: `publication_evidence_actors` + `record_publication_actor`, written best-effort by
   `withPublicationEvidence` for FUTURE interactive (editor) and scheduler publications; older publications have
   an unknown performer → independence unavailable → inspection refused.

## Files

- SQL: `supabase/migrations/20260928120000_citation_change_evidence.sql` (sha256 dcecd0db20b48999a7605017fb248d2276778f735e77d6243efd2639be927a65).
- Server: `src/lib/citation-change.ts`, `citation-change.server.ts`, `citation-change.functions.ts`,
  `citation-record.ts`, `citation-record.server.ts`, `citation-record.functions.ts`, `citation-finding.ts`,
  `citation-panel.ts`, `citation-forward.ts`, `citation-review-ui.ts`, `publication-evidence.server.ts`,
  `publish.server.ts`, `publish.functions.ts`, `publish-cron.server.ts`.
- UI: `src/components/CitationChangeArtifacts.tsx` (owner artifact/approval/declaration + binding choice),
  `CitationInspectionAssignments.tsx` (owner independent section: status, eligibility, dissent provenance, chains
  with validity reasons, grant/revoke, inspector link), `CitationInspectionPanel.tsx` (assigned inspector's masked
  surface), `CitationForwardPanel.tsx` (binding kind, change detail, readiness lines, status labels),
  `src/routes/_authenticated/app.citation-review.tsx` (inspector mode via `?inspection=<row>`).
- i18n: `src/i18n/citation-change.ts` (122 keys × en/pl/sv/da, registered in `catalogs.ts`), 20 staged modules
  `src/i18n/staged/<xx>-citation-change.ts` registered per locale with the pinned English fingerprint
  `cc37fb633fb2b666d752a789c9ba76feeab0442e8ab98716a4ea8db47e26ae9f` (staged key count 4334 → 4456; no locale activated).
- Tests: `src/lib/citation-change-evidence-migration.test.ts` (19 PGlite tests incl. R1/1–5 and R2/1–2
  regressions; sha256 ef374c4ecb50a8185565ad6508958e0c02eab9d41c4e189975297bab2f7be9e6), `citation-change.test.ts`, `citation-change.functions.test.ts`,
  `citation-forward.test.ts` (+4), `CitationForwardPanel.test.ts` (+1), `CitationInspectionPanel.test.ts`,
  the five existing PGlite suites now load the candidate (they caught a real defect: the public-path v4 save
  returned detail-only keys — fixed).
- Harness (untracked): `.coordination/harness/` copy of the authoring harness on port 5180 with
  `fixtures-change.ts`, `mocks/citation-change.functions.ts`, extended record mock, inspector actor, README
  recipes 43–49.

## Commands and results (isolated worktree)

| Command (isolated worktree, dependency symlink) | Result |
| --- | --- |
| `node node_modules/.bin/tsc -p tsconfig.json --noEmit` | exit 0 |
| `node node_modules/.bin/eslint <changed src files>` | no findings (one pre-existing react-refresh warning outside this packet unchanged) |
| `node node_modules/.bin/prettier --check <changed/new files + harness>` | all formatted |
| `git diff --check` | exit 0 |
| `vitest run` (full suite, `/tmp/claude/milo-vitest-changeproof.config.mjs`) | 409 files, 7028 tests passed |
| `vitest run src/lib/citation-change-evidence-migration.test.ts` | 19 passed (12 R + R1/1–5 + R2/1–2) |
| `vitest run src/i18n` | 31 files, 804 tests passed (20 staged locales × fingerprint/parity/count 4456) |
| `node node_modules/.bin/vite build` | success (nitro/cloudflare output generated locally, not deployed) |

Identities: base `ce09f2380f07ff66dcc4de18384370c9c6da03d8`; migration sha256 `dcecd0db20b48999a7605017fb248d2276778f735e77d6243efd2639be927a65`; migration test sha256 `ef374c4ecb50a8185565ad6508958e0c02eab9d41c4e189975297bab2f7be9e6`;
citationChange English fingerprint `cc37fb633fb2b666d752a789c9ba76feeab0442e8ab98716a4ea8db47e26ae9f` (122 keys). Nothing committed: `git status` lists 57 modified
and 34 untracked paths (all under `src/`, `supabase/migrations/`, `evidence/` and the untracked
`.coordination/`).

## Browser evidence (LOCAL harness, port 5180, fixtures only)

Real components through the LOCAL harness (`preview_start citation-change-harness`, port 5180, in-memory mocks, no
network/provider/database). Every step below was driven through the browser tools and read back from the DOM and
the mocked call log; the log lines are the harness's own records of the calls the real components made.

- **Artifact (R1/1 shape) → approval (R1/2, R2) → declaration.** Owner surface → binding kind _Listing /
  configuration change_ → artifact `listing · google-business-profile:milo-harness-massage · openingHours
  Mon-Fri 9-17 → Mon-Sat 9-18` → `saveChangeArtifactFn → ok → <id> sha <digest>`; the binding radio stays
  DISABLED until approval. _Approve this version_ → the call carried `expectedRevision: 0` + a fresh `requestId`
  → `approved → revision 1 (owner)`, chip "Approved by me (owner)" + "approval revision 1". _Declare performed
  now_ → `saveChangeReceiptFn → ok`, "Declaration recorded."
- **Bind + review + save.** Artifact and declaration radios, description, baseline (2026-09-10) → the reviewed
  audit JSON showed `changeBinding.{artifactId, artifactSha256, receiptId, ownerInspection: null}`,
  `change.approvedVersion` = artifact digest, `change.approvedBy` = owner, `destination = listing · reference`
  → `saveCitationImprovementFn → ok → v1 (receipt_recorded)`; list row `v1 · performed declaration recorded (not
  delivery proof) · no baseline recorded`; readiness "Performed declarations only: 1", "Independently inspected:
  0", "Disputed (excluded): 0", "Owner-attested distinct changes: 0 of 2".
- **Detail + grant + link.** "Bound listing / configuration change" block (kind, reference, approved artifact
  version, declaration id); owner inspection block without hyperlink/snapshot; independent section "no
  independent inspection" + "not counted as verified"; the candidate select offered only
  `reviewer@harness.invalid · reviewer`; _Grant inspection_ → `grantInspectionAssignmentFn → ok → assignment
  revision 1`; the assignment row shows `effective · Revoke · Copy the inspector's link`.
- **Inspector (masked view, fail-closed row).** Actor _Assigned inspector_ on the v1 row → reference (no link),
  approved version + instant, fields table, "Approver and performer identities: effective", three radios, no
  baselines/notes in the page text. On a row WITHOUT an assignment (the owner's later v2) the surface shows the
  honest "could not be loaded" and the log `THROW citation_improvement_unavailable`.
- **Dissent and R1/5 in the real UI.** Inspector _Does not show it_ → `v1 does_not_show`. Owner list: `disputed`
  chip, readiness "Disputed (excluded): 1". Owner records a POSITIVE inspection → `v2 · owner attested · baseline
  recorded · disputed`, detail "not counted as verified", "Active dissent about this delivered change →
  reviewer@harness.invalid · row <v1 id> · <instant>", readiness "Owner-attested distinct changes: 0 of 2",
  "Disputed (excluded): 1" (dissent recorded on v1 reaches the v2 correction of the SAME artifact+receipt).
- **Resolution by the inspector only (R1/3 head chain).** Inspector on the v1 row → _Withdraw my current
  inspection_ → `v2 withdrawn` with `expectedVersion: 1, expectedHeadId: <v1 receipt>`; history `v2 · withdrawn
  · current / v1 · Does not show it`. Owner: v2 head now `owner attested · independently inspected` (the
  reviewer's positive on v2, recorded before the withdrawal, counts once the dissent is gone), readiness
  "Independently inspected: 1", "Disputed (excluded): 0", "Owner-attested distinct changes: 1 of 2".
- **Renewed authority (R1/4).** _Bump reviewer membership revision_ → owner detail: chain head `no longer
  effective · your team authority changed`, independent status back to "no independent inspection", readiness
  "Independently inspected: 0" (the owner attestation still counts alone, 1 of 2). Inspector surface:
  `data-fresh-needed="authority"` prompt; _Record inspection_ again → `v2 shows_approved_content` with
  `expectedVersion: 1, expectedHeadId: <v1 receipt>` (a NEW receipt, not the old digest) → effective again.
- **Mobile / keyboard.** Inspector surface and the owner detail at 375×812: `scrollWidth === innerWidth (375)`, no
  element beyond the viewport; controls are native inputs/selects/buttons; Tab moves focus through the harness
  controls and the panel controls (activeElement observed on the actor buttons after tabbing from the row).
- **Not exercised in the browser:** the approval lost-response replay (SQL-tested; UI keeps the frozen
  `requestId` and shows "Retry the same decision"), delegate approval/declaration (no delegate UI), a
  configuration-kind artifact (same component path as listing; SQL-tested).

## Uncertainties, unsupported cases, what only genuine production/owner evidence can prove

- The migration is UNAPPLIED; PGlite proves the SQL, not the Lovable-managed database. Release still depends on
  PR156 + applied `20260927190000` + separate review.
- Delegate approval/declaration endpoints exist and are SQL-tested; no delegate UI is built (owner UI approves).
  The approval replay (lost response → identical request) is SQL-tested and wired in the owner UI (frozen
  `requestId` per click, "Retry the same decision"), but the harness has no approval lost-response mode, so the
  replay was not exercised in the browser.
- `citation_change_fields_valid` proves the allow-list, not that arbitrary bounded text is secret-free.
- Public-URL rows: independence needs a recorded publication actor; every publication made BEFORE this candidate
  is applied stays "identity unavailable" for inspectors (refused, by design).
- Negative-head stickiness: an inspector's dissent survives owner-side revocation/membership edits; only the
  inspector's withdrawal/replacement or a distinct approved+performed change resolves it (packet R1/5). A removed
  member's dissent therefore persists until a new delivery is bound — documented decision, not a defect.
- Inspector candidates in the owner UI mirror the finding-review policy; the server additionally refuses the
  known performer/approver. Team roster/policy reads are the released endpoints.
- The harness dev server shares the dependency cache with Vitest: running tests reloads the page (in-memory
  state lost) — a harness limitation, not a product one.


## R3 addendum (28 September 2026): owner artifact form correctness and lost-response recovery

Three P2s from `codex-citation-change-proof-review-r3-20260928.md`, fixed together in the same worktree; the R1/R2
SQL is untouched (migration sha256 still `dcecd0db20b48999a7605017fb248d2276778f735e77d6243efd2639be927a65`, its
test still `ef374c4e…`, 19 tests).

- **R3/1 duplicate field rows.** `src/lib/citation-change-ui.ts` owns the draft rows: `addFieldRow` picks the next
  UNUSED key (the control is disabled once the kind is exhausted), `duplicateRowIndexes` flags every repeat,
  `serializeFieldRows` REFUSES a duplicate form (never `Object.fromEntries` over repeats). The component marks the
  offending select `aria-invalid` with an `aria-describedby` `role="alert"` message, keeps both values in the
  draft, disables Save until the key is changed or the row removed. Browser (Codex's own reproduction, listing
  `google-business-profile:codex-local`, two `name` rows `FIRST VALUE` / `SECOND VALUE`): alert + disabled Save;
  after choosing `phone` the persisted table reads `name · FIRST VALUE`, `phone · SECOND VALUE`.
- **R3/2 approval retry intent.** The COMPLETE request (project, artifact, digest, decision, reviewed revision,
  request id) is frozen by `frozenWritesReducer` on the first click; _Retry the same decision_ re-sends exactly
  it; a fresh decision needs the explicit _Discard it and decide anew_; terminal outcomes (`stale`, `forbidden`,
  `unsupported`, `unapproved`, `receipt_invalid`, `capacity`) drop the frozen request; a replayed result is shown
  as historical ("This was a replay of an earlier request…") and the refetched read shows the current decision.
  Browser (harness mode "store writes, response lost"): approve → stored revision 1, response lost, refetch shows
  approved rev 1 while the frozen note names "Approve, reviewed revision 0" → Retry → the same `requestId`,
  `REPLAY of revision 1 (current 1)`, no revoke. Intervening decision: revoke lost (rev 2) → delegate approves
  (rev 3, no owner refetch) → Retry → `REPLAY of revision 2 (current 3)`, chip "Approved by a delegate reviewer ·
  revision 3", nothing new created. Stale head: delegate revokes (rev 4, no refetch) → owner Revoke with
  `expectedRevision: 3` → `citation_change_stale`, "The artifact changed since you looked at it; reopen it.", no
  retry control, refetch shows revision 4.
- **R3/3 declaration retry.** The declared instant is frozen on the first click; _Retry the same declaration_
  re-sends it (the SQL digest of artifact digest + actor + instant then returns the SAME receipt); _Declare a new
  performance_ is the explicit separate action. Browser: declare → stored `4fc582be`, response lost, one
  declaration row → Retry → `idempotent → 4fc582be` with the same `performedAt`, still one row → new performance
  → a second receipt with a new instant.
- **Layout/keyboard/configuration.** Before/After inputs wrap to full rows at 375 px (no horizontal overflow);
  Tab order reference → key select → before → after → Add field → description; kind `Configuration` offers
  exactly the eleven configuration keys.
- **Tests.** `src/lib/citation-change-ui.test.ts` (event-driven transitions: the duplicate reproduction,
  exhaustion, frozen approval never reversed by a fresher read, terminal vs uncertain codes, frozen declaration),
  `src/components/CitationChangeArtifacts.test.ts` (static markup: aria-invalid/alert/disabled Save, retry +
  discard only while frozen, pending notes, declare disabled without approval). No DOM library exists in the
  dependency set (no jsdom/testing-library; no new dependency allowed), so the real click/change events are
  proven in the browser harness, not in Vitest. Harness: modes `changeApproval` / `changeReceipt` = lostResponse
  (consumed once), `interveningDelegateDecision`, README recipes 50–53. Copy: 7 new `citationChange` keys in
  en/pl/sv/da and all 20 staged modules (129 keys; fingerprint `319c67bb789c2f8c0e0ae9899a063ec7208f48ffbbddca0213282b4668b445a6`; staged count 4463).
- **Results.** tsc 0 · eslint 0 on the changed files · prettier clean · `git diff --check` 0 · full Vitest 411
  files / 7038 tests · `vite build` success. Mock outcomes are not production proof.


## R4 addendum (28 September 2026): cross-artifact recovery, publication actor coverage, live chronology

Packet `codex-citation-change-proof-review-r4-20260928.md`; same worktree/session; R1/R2 SQL (`dcecd0db…`) and
the R3 single-artifact fixes untouched.

- **R4/1 cross-artifact frozen writes.** Rule chosen: ONE unresolved request per kind per owner+project; every
  OTHER artifact's same-kind write control is disabled and labelled ("Resolve the pending decision on
  <reference> first…", `data-blocked`), the subject's deletion is disabled, and a handler never sends what the
  reducer refuses to register. The frozen state is kept in a per-session registry (`rememberFrozenWrites` /
  `recallFrozenWrites`) so closing and reopening the improvement draft does not drop it. Browser A/B (Codex's
  reproduction): lost revoke on A → B's approve disabled with the note naming A, B's declaration/deletion free,
  A's deletion disabled; draft cancelled and reopened → A's frozen note and retry still there; Retry A → `REPLAY
  of revision 2 (current 2)`; B enabled → approve B (own request id, revision 1) → A untouched. Declarations:
  lost declaration on B → A's declaration blocked (`data-blocked="receipt"`), B's deletion disabled → Retry B →
  `idempotent → 2dfcf8fe`, one receipt → controls released.
- **R4/2 manual publisher actor.** `publishWordPressContentFn` and `publishShopifyContentFn` now pass
  `actor: { actorId: context.userId, initiator: "interactive" }` into `withManualPublicationEvidence` (the
  authenticated session, never the connector owner or a payload value). Tests: `publication-evidence.test.ts`
  proves the order begin → record_publication_actor → transport → finish, the scheduler initiator, no record
  without an actor, and that a failing actor record leaves the publish/outcome intact (manual wrapper);
  `manual-publication-actor.functions.test.ts` proves both endpoints forward the session actor and that the
  Shopify missing-blog short-circuit sends no evidence. No provider call, backfill or replay.
- **R4/3 live chronology.** `liveVerifiedAt` uses the server `verifiedAt` authoritatively for a current v4
  projection (fail-closed on null/invalid; never the immutable owner instant), and falls back to the record's
  owner verification only for a legacy read. `citation-panel.test.ts` covers Codex's reproduction
  (receipt_recorded / independently_inspected / eligible, live 12:00, immutable owner 09:00): `liveVerifiedAt` =
  12:00, a 10:00 follow-up is `follow_up_before_both_improvements`, a 13:00 follow-up pairs; null/invalid live
  instants → null and not verified; legacy reads unchanged.
- **Results.** tsc 0 · eslint 0 errors (one pre-existing unused-disable warning in `wordpress.functions.ts:42`,
  not this packet) · prettier clean · `git diff --check` 0 · full Vitest 412 files / 7045 tests · `vite build`
  success. Copy: 2 new `citationChange` keys (131 keys; fingerprint
  `a9bdd59005e0512b0397c18508f0ec7cd8efcc1360de9b9cc7906a2f83c9cd8b`; staged count 4465). Harness README recipe 54.


## R5 addendum (28 September 2026): independent-only presentation and the owner's approved-content view

Packet `codex-citation-change-proof-review-r5-20260928.md`; same worktree/session; SQL (`dcecd0db…`), R1–R4 and
the PR156 freeze untouched. Two presentation corrections only; no transport, architecture, authority or SQL change.

- **R5/1 independent-only path presented as what it is.** The list/detail evidence chip is chosen by
  `evidenceLabelKey` from the authoritative v4 projection: when the server marks the head `verifiedEligible` with
  `independentStatus = independently_inspected` and no owner attestation, the chip reads "baseline resolves for
  the independent proof (no owner attestation on this row)"; every other state keeps the released owner-axis
  label (so a genuinely absent owner baseline still says so, and unknown is never turned into confirmed). The
  readiness line is neutral: "Verified distinct changes: N of M required (each counts through the proof the
  server marks eligible…)" plus "Qualifying proof among current heads: owner-attested A, independently inspected
  I" (`data-readiness="verified"` / `"sources"`), computed from the existing `retestReadiness` counts. No live
  baseline resolution is inferred from stored ids; a disputed head never qualifies; withdrawal returns to 0.
- **R5/2 owner approved-content view.** For a change row the owner inspection block now shows the EXACT bound
  artifact's supported before/after fields, matched from the owner-scoped artifact read by bound `artifactId`
  AND `artifactSha256` (a newer or different artifact never matches), with the reference-appropriate
  instruction "Open the listing or setting at the exact reference, compare it with the approved fields below…"
  (`citationChange.inspect.ownerIntro`). States: `data-owner-content="loading"` while the read is pending,
  `"fields"` with the table, `"unavailable"` (deleted artifact, read error, or digest mismatch) with a visible
  notice; in the unavailable state the positive radio is disabled and the Record button refuses a positive
  outcome, while negative/inconclusive remain recordable. No URL is invented, no refetch/provider verifier, no new
  authority; the public-URL flow is unchanged.
- **Browser (LOCAL harness 5180, mocks).** Configuration `site-settings:general`, `siteTitle → Milo fixture
  title`, approved + declared + bound to the 2026-09-10 baseline, no owner inspection → owner detail shows the
  fields table (`siteTitle · — · Milo fixture title`) and the reference instruction, no URL/snapshot control,
  positive radio enabled. Reviewer positive inspection → owner chip "baseline resolves for the independent
  proof…", readiness "1 of 2 required", sources "owner-attested 0, independently inspected 1". Inspector
  withdrawal → "0 of 2", sources 0/0, chip back to "no baseline recorded". 375 px: fields table width 215, no
  horizontal overflow; arrow keys move the radios, Tab reaches _Record inspection_ (enabled). Deleted artifact →
  deleted notice, no inspection controls. The mock has no read-error or digest-mismatch mode; those states are
  proven by the static test only.
- **Tests.** `citation-forward.test.ts` ("Codex R5: evidence label by proof source": independent-only eligible
  → independent label; owner-attested, not eligible, disputed and legacy → released label).
  `CitationForwardPanel.test.ts` ("Codex R5: …"): chip label, neutral count and sources (1 of 2 / 0 and 1),
  owner fields table with `ownerIntro`, hash mismatch / read error / loading / deleted → unavailable or loading
  with the positive radio `disabled=""`, owner-only row keeps the released labels. Readiness expectations across
  the suite moved to `citationChange.readiness.verified`.
- **Copy.** 5 new `citationChange` keys (`readiness.verified`, `readiness.sources`,
  `evidence.independentBaseline`, `inspect.ownerIntro`, `inspect.contentUnavailable`) in en/pl/sv/da and all 20
  staged modules (136 keys; fingerprint `01d6709af20c25f7e7688d50704ffcd7d9f1dcbc7374a8f627785e18c568ee18`;
  staged count 4470; inactive, machine-authored, no fluency claim). Harness README recipe 55.
- **Results.** tsc 0 · eslint 0 on the changed files · prettier clean · `git diff --check` 0 · full Vitest 412
  files / 7047 tests · `vite build` success. Mock outcomes are not production proof.


## R5 copy closeout (28 September 2026): source counts are recorded observations

Packet `codex-citation-change-proof-r5-copy-20260928.md`. Codex's browser case (independent positive → owner
positive v2 → independent negative) showed "Verified distinct changes 0 of 2, Disputed 1" next to "Qualifying
proof among current heads: owner-attested 1, independently inspected 0": `retestReadiness.attested` counts raw
owner-attested statuses, including disputed ones, so the phrase overstated the counts. Copy-only correction,
no app/SQL/server/test-behaviour change:

- `citationChange.readiness.sources` now reads "Recorded observations on current changes: owner-attested
  {owner}, independently inspected {independent} (these are counts of recorded observations, not qualifying
  proof; disputes and exclusions decide the verified count above)".
- `citationChange.readiness.verified` now uses plain language: "… (a change counts once its proof qualifies:
  your own attestation, or an independent inspection of a delivered change; a disputed or excluded change never
  counts)".
- Only these two key values changed, in en/pl/sv/da and the 20 staged modules (still 136 keys, staged count
  4470). Because the English source changed, the staged fingerprint moved from `01d6709a…` to
  `9d524198e991d34317b960ac5f970e0ca02ff270ed6dc8b5dba425091a7791c1` and was re-pinned in the 20 staged
  registrations (`sourceHash`) and `de-source.ts`; no count fixture changed. Targeted checks: prettier clean,
  `git diff --check` 0, tsc 0, Vitest `src/i18n` + `CitationForwardPanel.test.ts` + `citation-forward.test.ts`
  32 files / 831 tests. No full suite, build or browser rerun (text only).
