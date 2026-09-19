# Citation Intelligence — CI-2 protocol storage (P2 packet)

**Packet:** P2 — immutable panel/protocol storage, brand-run binding and manual capture context.
**Prepared:** 19 September 2026 · **Author:** Claude (implementation) · **Direction/review:** Codex.
**Base:** released `main` at `26b938c3`. Independent of the P1 raw-artifact worktree and the
conversation-live-fix worktree; this packet touches none of their files.
**Status:** source, migration, tests and docs authored offline. **Not** applied, deployed or run
here. Codex runs the prepared checks (CLI wrapper `E2BIG` previously blocked local execution). No
pilot data collected; the Swedish Appendix A/B panels remain owner-review PENDING and are never
auto-locked or seeded as fixtures into a live project.

This packet builds packet 3 ("complete accepted D03 workflow") storage/auth layer on top of the
released PR137 validity helpers (`src/lib/citation-panel.ts`, `src/lib/citation-finding.ts`) and the
existing answer stack (`src/lib/answer-evidence.*`). It reuses `ai_visibility_prompts` and
`ai_answer_evidence`; there is **no second capture table**. Findings/improvements storage (P3), a
native parser (P5) and UI (P4) are out of scope and untouched.

## What this packet adds

1. **Immutable versioned panels** (`public.citation_panels`). A panel id accumulates immutable
   versions. A draft (`status:"draft"`, `approval:null`) is saved; the owner reviews it out of band;
   the server then **locks** it by appending a new version whose content is copied verbatim from the
   reviewed draft (freezing client market, question/interface language, the one surface/mode, session
   controls and the collection country/city) and whose approval receipt (`approvedBy`, `approvedAt`)
   is minted from the authenticated caller and the database clock. A draft is not approved; validity
   of a `panelProtocolSchema` object is never, by itself, authority to lock.
2. **Brand runs** (`public.citation_brand_runs`). A brand diagnostic run is separately approved
   against a **locked brand** panel version, with an owner-set observation budget (1–50) and round
   cap (1–2) and a server-minted approval receipt. Runs are bound to an actual panel version by a
   foreign key; discovery is never scheduled here. Brand output is excluded from discovery
   denominators by construction (separate table, separate resolver branch, distinct question series).
3. **Manual capture context** on the existing answer record. `answerEvidenceSchema` gains one
   optional, opaque `captureContext` field so the existing read path tolerates capture-bound records;
   the citation layer validates its exact shape (`captureContextSchema`) and **resolves** it. A
   capture is stored through `save_citation_capture`, which resolves the referenced owner-locked panel
   version, the slot's versioned question (prompt id + revision + exact text), and — for a brand
   capture — the approved run (existence, panel/version match, prospective approval, round and
   observation budget) before reusing the legacy prompt-snapshot / hash-dedup / correction-chain /
   100-record insert into `ai_answer_evidence`. Legacy intake (`importAnswerEvidence`) now refuses a
   capture context so an unresolved binding can never enter through the panel-blind path.

### Authorization vs comparability (deliberate split)

- **The write RPC rejects integrity/reference failures**: missing/unlocked/cross-version panel,
  question not in panel or unbound (drifted prompt id/revision/text), a discovery capture carrying a
  brand run, a brand capture with no/foreign/cross-version run, a run approved after the capture, a
  round outside the panel or run, an over-budget new observation, a tampered capture instant, a
  changed prompt snapshot, and the 100-record capacity. These are refused at write; they can never be
  stored.
- **The read resolver flags methodology deviations** (`resolveStoredCaptures` → the PR137
  `protocolDeviations`/`slotOutcome`): a stored capture collected under a different session, surface,
  language or collection location is preserved honestly and marked `protocol_deviant`, never silently
  eligible for a complete-pair comparison. A panel later deleted leaves the raw capture in place but
  no longer resolves it (`panel_unresolved`), invalidating the dependent claim without cascading the
  raw version away.

This mirrors the spec: reject forged/foreign/cross-version/run-budget references (§8), but retain
failed/truncated/missed/deviant outcomes as real evidence (§5.2, §6).

## Post-review corrections (Codex review round)

An independent review found the earlier-stage focused tests passing but `tsc` failing, plus three
soundness gaps. All four are corrected within the same disjoint file ownership, with no added scope:

1. **`captureContext` type / serialization.** The optional field was typed `z.unknown()`, which the
   TanStack Start server-function return serializer cannot represent, so `readAnswerEvidenceFn`
   (consumed by `AnswerEvidencePanel`) failed to type-check. It is now a bounded, finite-depth,
   JSON-serializable value schema (`captureContextValue`) defined **inside** `answer-evidence.ts`
   — no import of the citation layer, which would be circular (`citation-panel.ts` already imports
   `answer-evidence.ts`). The bounds exceed every `captureContextSchema` field, so real captures
   round-trip; legacy reads (field absent) stay byte-identical; the citation layer still performs the
   strict parse. No `any`, no cast.
2. **Budget checked before dedup.** `save_citation_capture` charged the brand-run observation budget
   *before* the hash-dedup lookup, so an exact re-import at a budget-1 run failed instead of
   returning its existing id. Hash dedup now runs first (returning the persisted id without charge),
   and the budget check moved after it — alongside the 100-record capacity, which was already
   post-dedup. Authorization/reference resolution (panel, question, run existence, prospective
   approval, round) is unchanged and still precedes dedup.
3. **`supersedesId` correction loophole.** A correction was budget-exempt but only checked
   prompt/revision, so any same-prompt answer from another run, panel, slot or a legacy context-less
   record could be named as a "correction" to add unbudgeted observations. The predecessor is now
   bound to the **same observation identity** — stored `captureContext` matching on panel version,
   brand run, question, round, capture instant and surface; a context-less predecessor fails closed.
   Genuine same-observation corrections remain possible (a correction is not a new charge); any
   change to the observation must be a new, charged capture. Branching is already impossible via the
   pre-existing `UNIQUE(user_id,project_id,supersedes_id)` constraint, so chains stay linear and, by
   transitivity of the identity check, remain one observation. Raw originals and the deletion cascade
   are untouched.
4. **Record self-contradiction.** `parseManualCaptureInput` equated only `capturedAt`, so an answer's
   own `mode`/`modelVersion` could disagree with its `captureContext.surface.mode`/`modelLabel` — and
   the read resolver, reading only the context, could mark an API answer complete under a consumer/
   search context. Both are now required to agree, at the input boundary **and** as an SQL defence in
   `save_citation_capture`. This is internal consistency only: deviations *from the panel* remain
   storable and flagged by `protocolDeviations`; the free-text `surface` label is deliberately not
   equated to the structured `service`, to avoid over-constraining genuine records.

### Prospective panel approval (spec Appendix A — implemented)

Appendix A (owner review BEFORE USE, then save the immutable panel) makes a locked panel version a
usable baseline only from its owner-approval instant onward. Alongside the brand run's separate
prospective guard, a capture is now refused when its `capturedAt` predates the panel version's
DB-minted `approval.approvedAt`:

- **Write (`save_citation_capture`):** after resolving the locked panel, a new capture whose instant
  is before that panel version's approval — or whose approval instant is missing — fails closed
  (`citation_panel_approved_after_capture`), for both discovery and brand. The brand run's own
  prospective guard is unchanged and additional (both must hold for a brand capture).
- **Read (`resolveStoredCaptures`):** a raw pre-approval record already on disk stays inspectable (it
  still resolves against the panel) but is never an eligible complete slot — a would-be `complete` is
  demoted to `protocol_deviant` and flagged `panel_approved_after_capture`, while a genuine
  failure/truncation is preserved as itself (never masked). Missing/unparseable approval fails
  closed. No change to the released `citation-panel.ts` helpers and no rewrite of raw history.

Fixtures were corrected honestly: the capture suites stamp the locked panel with an explicit
historical approval instant (a raw test-fixture write, not a product path), so their post-approval
captures are legitimately after approval. New tests cover pre-lock rejection, at/after-lock
acceptance with correct timestamps, an older stored pre-approval record resolving as not-eligible,
and the still-required separate brand-run approval. No real owner pilot approval is assumed, no live
capture is collected, and the one migration (`…170000`) remains unapplied.

## Files

| File | Change |
| --- | --- |
| `src/lib/citation-protocol.ts` | New. Pure storage contract: `panelDraftSchema`, `lockedPanelSchema`, `citationProtocolStateSchema`, `brandRunApprovalSchema`, `parseManualCaptureInput`, `resolveStoredCaptures`, caps. Reuses PR137 schemas; never redefines them. |
| `src/lib/citation-protocol.server.ts` | New. Service RPC helpers: read, save draft, lock, approve brand run, import capture, read+resolve. Owner/time/approval derived server-side; network-free. |
| `src/lib/citation-protocol.functions.ts` | New. Six `requireSupabaseAuth` endpoints, each refusing an owner mismatch and never accepting a client approval/reviewer/timestamp. |
| `src/lib/citation-protocol.test.ts` | New. Pure-contract + mocked-server unit tests. |
| `src/lib/citation-protocol.functions.test.ts` | New. Endpoint authentication/validation tests. |
| `src/lib/citation-protocol-migration.test.ts` | New. Real PGlite SQL round trips (isolation, auth, missing project, reference forgery, approval version, protocol binding, capacity, deletion, idempotency). |
| `supabase/migrations/20260919170000_citation_protocol.sql` | New (one migration). Two tables + five service-only SECURITY DEFINER RPCs; RLS on, project-scoped FKs, project-deletion cascade. |
| `src/lib/answer-evidence.ts` | Additive only: optional opaque `captureContext` on `answerEvidenceSchema` so reads tolerate capture-bound records. Legacy documents are byte-identical (field absent). |
| `src/lib/answer-evidence.server.ts` | Additive only: `importAnswerEvidence` refuses a capture context (legacy path stays capture-blind; captures must use the panel-aware path). |
| `product/CITATION_PROTOCOL_IMPLEMENTATION_2026_09_19.md`, `evidence/citation-protocol-storage-2026-09-19.md` | New. This doc and the evidence record. |

No other files were touched. `citation-panel.ts`, `citation-finding.ts`, `native-ai-*`, the P1
migration/design/evidence and all conversation files are unmodified.

## Caps (checked against the existing stack)

Existing per-project caps are 200 prompt versions and 100 answer records (incl. history), 20
answer-set style bounds elsewhere. This packet adds: **200 panel versions** per project (mirrors the
prompt-version ceiling; a project holds only a few panels, versions accrue through draft→lock) and
**20 brand runs** per project (baseline/re-test diagnostics, well under the answer ceiling). Captures
reuse the existing 100-record answer capacity unchanged; brand captures are additionally bounded by
their run's observation budget. Nothing auto-deletes, silently truncates or raises a cap.

## Requirement / test mapping

Spec §5, §8 and decision packet 3. Acceptance-test intent (all fixtures; none is live evidence):
CI11-T13/T14 (panel/round shape, brand unscheduled), T15/T16 (protocol deviation flagged not
silently comparable — read resolver), T17 (unknown model preserved — inherited), T30/T31
(dedup/provenance — hash includes capture context), T32 (capacity, no bypass), T33 (imported data is
data; verified/approval never trusted from input), T34 (cross-project isolation), T35 (no trusted
`verified`/approval flag), T40 (no collector/API/cron/automation added), T42 (deletion invalidates
dependent claims). Panel approval version, reference forgery, brand run budget/prospective approval,
and idempotency are covered by the new migration tests.

## Checks to run (UNRUN here — Codex executes)

Status honesty: round one left 143 tests passing with `tsc` FAILING (the `z.unknown()` break); the
four fixes then passed 146 tests and `tsc`. Adding the prospective panel-approval guard, the latest
run was 148 focused tests at 147 PASS / 1 FAIL with `tsc` PASSING; the lone failure was a test-only
assertion (it expected the raw SQL guard message from `importManualCapture`, which by design maps DB
errors to `citation_protocol_unavailable`), now corrected to assert the wrapper refusal generically
plus the exact guard message through a direct SQL call. **All prior PASS counts are a prior stage and
do not carry over** — every check below is UNRUN in this worktree and must be re-executed by Codex.

- `npx vitest run src/lib/citation-protocol.test.ts`
- `npx vitest run src/lib/citation-protocol.functions.test.ts`
- `npx vitest run src/lib/citation-protocol-migration.test.ts`
- Regression: `npx vitest run src/lib/answer-evidence.test.ts src/lib/answer-evidence.functions.test.ts src/lib/answer-evidence-migration.test.ts src/lib/citation-panel.test.ts src/lib/citation-intelligence-scope.test.ts`
- `npx tsc --noEmit` (types) and the repository lint task.

The migration test loads `20260909200000_project_knowledge.sql`,
`20260910210000_answer_evidence.sql` and the new `20260919170000_citation_protocol.sql` into PGlite,
so it validates the new SQL against the actual prior schema without applying anything to a database.

## Migration / rollback

One new, **unapplied** migration adding two tables and five functions. It depends only on already
present objects (`assert_knowledge_project`, `ai_visibility_prompts`, `ai_answer_evidence`,
`workspace_entities`). It does not alter or replay any of the eight already-applied conversation
migrations or any other existing migration. Rollback = drop the two functions-set and two tables;
because everything is additive and service-only, dropping them leaves the legacy answer/knowledge
stack unchanged. The P1 migration remains separate and unapplied.

## Limitations and P3 dependency

- No UI (P4), no findings/improvements store (P3), no native parser (P5).
- Human-reviewed capture facts (own-citation, mention, recommendation, support, accuracy) and the
  descriptive counts belong to P3; this packet stops at storing and resolving capture provenance and
  slot outcome. `panelCounts`/`comparablePairs` (PR137) already accept the review facts P3 will add.
- Capture-level and panel-level deletion beyond project deletion reuse the existing
  `remove_ai_answer_evidence` path and project cascade; a dedicated panel-retirement RPC is deferred
  to P3/P4 and is not forged here.
- Real acceptance still requires an owner-approved locked panel, owner-run captures and a signed-in
  round trip; unit/migration tests and this document do not establish it.
- Owner Swedish pilot approval is PENDING; no draft is auto-locked and no fixture is saved live.
- The USD50/month global AI cap and manual-AI free grants are unchanged; this packet makes no
  provider/API/OAuth/scheduler/email/paid-data call and applies no migration.
