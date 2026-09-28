# Milo Growth — release and acceptance checkpoint, 28 September 2026

**Status:** Dated reconciliation of the canonical product records with the releases already verified on 27–28
September 2026. Documentation only: it adds no product scope, waives no acceptance gate and is not a new
production check. Later checkpoints supersede it; earlier "current" statements in the canonical files are
historical where they conflict with this page.

**Product Lead / Outcome Owner:** Rafal Andersen

## Why this page exists

The canonical files still open with 9–13 September checkpoints that predate the owner-authoring release of
27 September and everything after it. Read alone, they omit those later releases and can mislead a reader into
treating the owner-authoring migration as unapplied or an earlier build as current. This page is the durable
current entry point; the historical sections are kept and are not rewritten.

## Current production identity (verified live, 28 September 2026)

| Item                                            | Recorded value                                                                                                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production commit (`main`)                      | `94cc2edd1fa39e9ea648b0809f37aba1b8c90342` — normal merge of [PR #158](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/158) at 09:47:24 UTC           |
| Build / fingerprint (public `/api/app-version`) | build `1790588904187`, `modified: false`, fingerprint `fac2f3d258f1086b87ff9074a8541e3ad06b8925581e74af7e957cbc6a65c413`                                                   |
| Previous production                             | [PR #151](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/151) merge `64db7a4b18085bf1d3b80ec4dc5f384acd98c169`, build `1790536369307` (27 September) |
| PR #158 content                                 | One CSS-only change: the Notifications email-settings reload control wraps its long label on phone widths (`src/components/OperationalEmailSettings.tsx`); no migration    |
| PR #151 content                                 | Citation Intelligence owner authoring: panel protocol, dated business facts, finding authoring, with migration `20260926190000`                                            |

## Migrations — applied versus unapplied

| Migration                                            | Where                                                      | Status                                                                                                                          | Source SHA-256                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `20260926190000_citation_scope_binding_versions.sql` | in `main` (PR #151)                                        | **APPLIED once** on 27 September before the application merge; journal hash verified; never replay                              | `17d022bf65d698c7c453f0f33e9e9e1b2f8faa2cf2a29c2ebc6d61857694dea5` |
| `20260927190000_citation_improvement_head_guard.sql` | PR #156 candidate only (not in `main`)                     | **UNAPPLIED**; guarded apply script prepared, unexecuted                                                                        | `a86b4b626c2144db95c23c366079228842f31e5fe57e21712840ce636cc75784` |
| `20260928120000_citation_change_evidence.sql`        | PR #157 candidate only (not in `main`, stacked on PR #156) | **UNAPPLIED**; guarded apply script prepared for these exact bytes, unexecuted; depends on `20260927190000` being applied first | `f1984efbc21d8023493eb58ae703b60d58922b95442f28bdead5c65a4797b649` |

Only the three migrations above were reconciled here. For any other migration, its presence in `main` is not
proof of application: the status of record is the individual release evidence linked from
[CURRENT_STATE.md](./CURRENT_STATE.md), and no already-applied migration is ever replayed. The 10 September
"P4" specialist-workspace release and the later Citation Intelligence "P4" review release are different
releases; neither is the current build.

## Candidate pull requests (not production)

| PR                                                                                                                                                            | Head                                                                                                                                                          | Independent code review                                                                            | Security review                                                                 | Local checks                                                | Notes                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [#156](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/156) public-URL finding → Plan → Studio → approval/publication → owner inspection | `03b51886b762aa1265b05b13d0b21bca623a0cf2` (released `main` normally integrated; only delta since the reviewed `ce09f238` is the already-released CSS change) | clean on the exact head                                                                            | **UNKNOWN** — the latest security summary covers the older head `5e366062` only | frozen locks (Bun 1.3.3/1.4.0), build/types and Vercel pass | migration `20260927190000` unapplied                                                                                                       |
| [#157](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/157) listing/configuration change evidence and independent inspection             | `ad1daadb952e97062aee9109b95a9d0846df2428` (stacked on PR #156)                                                                                               | clean on the exact head after the T/U/V corrections; earlier findings on `dee6d813` are historical | **UNKNOWN** — the latest security summary covers `dee6d813` only                | local suites, types, build, local guard rehearsal           | migration `20260928120000` unapplied; **must never be merged into the PR #156 branch**; retarget/integrate normally after PR #156 releases |

Local test passes, static renders and mock-harness browser runs recorded in the candidate evidence are
implementation evidence, not security or production acceptance.

## Auxiliary model review CI

The optional Claude advisory workflow reported `FAILURE` / `too_large` / `manual_review_required` (or an SDK
error) on the oversized PRs #151 and #156 and on PR #158. Per the recorded decision
[milo-advisory-ci-manual-release-decision-2026-09-27.md](../evidence/milo-advisory-ci-manual-release-decision-2026-09-27.md),
releases rely on independent exact-head code and security review plus non-generative checks; a `too_large`
outcome or an SDK "success" is never a completed model review, and the provider acceptance item stays open.

## What live evidence exists (recorded scope only)

- PR #151 on production: authenticated owner read of the citation-review surfaces, draft-panel open/cancel,
  fact-form native validation and keyboard entry at 390 px; no AI request, approval, fixture or publication.
- PR #158 on production: the Polish reload control measured at a true 375×812 viewport with no horizontal
  document overflow, visible keyboard focus; the earlier defect is closed for that control only.
- 28 September read-only owner journeys on production: Notifications → correct project/task routing for an
  existing owner project; the historical uncertain-publication explanation (no retry); Today and an empty
  Calendar week/day at 375 px inside a contained scroller with keyboard navigation; the specialist team view
  and the knowledge review empty states with the owner's saved brand tone. Nothing was edited, sent, generated,
  approved or published.
- Earlier accepted real-use evidence (the retained accepted AI turn and the four verified article
  publications) stands for its recorded scope and is never replayed.

## Remaining gates (unchanged; no percentage assigned)

The full R00–R24 / D01–D08 register — [ROADMAP.md](./ROADMAP.md) with the scope register in
[PLAN_REVIEW_2026_09_07.md](./PLAN_REVIEW_2026_09_07.md), the decisions in [DECISIONS.md](./DECISIONS.md), the
gates in [LAUNCH_READINESS.md](./LAUNCH_READINESS.md) and the remaining-acceptance record — remains binding in
full. In particular: exact-head security results for PR #156 and PR #157; the guarded
one-time application of `20260927190000` and then `20260928120000` with pre/post verification; real
authenticated write journeys (setup → saved knowledge → work result), execution modes, logged-out background
work, notification delivery to real recipients, bounded specialist runs; genuine native AI-answer exports and
the owner-approved four-week pilot with human review and two verified changes; billing (Stripe owner-deferred,
paid launch NO-GO); EU language quality beyond the four active locales; beta testers, recordings and demos.
Unknowns above are recorded as unknown.

## Next actions (in order)

1. Obtain exact-head security results for `03b51886` (PR #156) and `ad1daadb` (PR #157); close any finding
   with a reviewed change, never by waiver.
2. Release PR #156 in the normal way: fresh read-only preflight, guarded once-only apply of `20260927190000`,
   application publish, deployed identity check, then authenticated owner journeys on production.
3. Retarget/integrate PR #157 onto the released `main` and obtain gates on the resulting head. The prepared
   guard is regenerated and rehearsed only if the migration source, its prerequisites or the integration
   identity change; already independently verified guard work is not repeated otherwise. Then release the same
   way.
4. Continue the R01–R07 acceptance journeys already identified (setup/knowledge, team/mode states,
   notifications feed and delivery history), recording each under its recorded per-action authority and the
   remaining evidence obligations. Specific pending decisions stay pending: real pilot panel/protocol approval
   and human collection, real second-person/tester participation, deferred billing, genuine native export
   inputs where unavailable, and the recorded publication holds. Routine in-scope implementation and fixes
   continue under the existing authorization; no new external communication or spend authority is created.

## Working arrangement and budget (unchanged)

Claude: implementation, research, tests and documentation in isolated worktrees; candidates only, no commit,
push, migration, provider, deployment or production action. Codex: independent direction, review, integration,
migration application and live verification. Owner: the specific recorded pending decisions named above.
Budget: one shared USD 50 per month Milo AI cap; free accounts use AI only after a manual allocation, and every
such allocation counts within that same cap (no extra pool); no purchases or new paid channels. This checkpoint
adds no permission requirement and removes no obligation.
