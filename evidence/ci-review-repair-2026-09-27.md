# Claude Code Review workflow repair — design and evidence (candidate I, 27 September 2026)

Isolated infrastructure change. Branch `codex/milo-ci-review-repair-20260927` (PR152); pushed HEAD `0d4e025c`
(D+E+F+G); H and I are the uncommitted delta on top of it. Files: `.github/workflows/claude-code-review.yml`,
`src/lib/ci-review-validator.test.ts`, this note. No application, locale or SQL change. Repository is PUBLIC.

## Status in one paragraph

Code boundaries addressed (trusted-base trigger limited to PRs into `main`, no PR checkout, tool-free model,
pinned action revision, fail-closed validator, fixed-enum output, credential-free visible result job). Owner
credential prerequisite COMPLETED and verified by metadata (environment `claude-review`, `main`-only policy,
repository copy removed; GitHub reply 4115078300); live provider authentication through it is still
unverified. Review 5330047655 (G: fork skip counted as success; mode/gitlink false attestation), review
5330090560 (H: literal "Subproject commit" text misclassified) and security review 5330105371 (I: model
self-attestation must not authorize merge) are addressed in the working tree. The automated result is
ADVISORY: a clean result is information for reviewers, never merge authorization. Independent exact-head
correctness and security reviews remain the review of record for every release. PR151 keeps its known
`too_large` → manual-review outcome. The whole goal is not done.

## History

- A → F: see earlier editions (null shapes, output disclosure, deletion coverage, trusted-base trigger,
  tool-free model, transport limit, credential prerequisite, sibling containment).
- G (4115099604 / 4115099605): credential-free always-running result job; entry-type classification for
  executable-bit changes with edits, gitlinks, symlinks and other non-regular modes.
- H (4115143680): explicit regular-file modes are authoritative; the gitlink content heuristic applies only
  when no mode metadata is present.
- I (4115159194, Medium): the reviewer offered "keep the result advisory" or "fresh trusted-human exact-head
  approval"; the advisory option is adopted. Vocabulary and comments changed so that a green model result
  cannot be described as trusted approval; no failure semantics changed; no rollout step makes this result a
  sufficient required merge gate.

## Advisory contract (I)

- The visible status is the job "Claude Review Result (advisory)" (`review-gate`). It is credential-free
  (no environment, no secret, `permissions: {}`, no checkout, no action, no PR content), depends on the review
  job with `if: always()`, and prints fixed enums only (`review-gate: v2`, `review_result`, `scope`, `gate`,
  `reason`). It reports `gate: advisory_clean` (exit 0) only when the scope is eligible (same repository, base
  `main`) AND the review job result is exactly `success`; every other case — fork or unknown scope, base not
  `main`, review skipped/failed/cancelled/missing/forged — is `gate: manual_review_required` with a reason
  enum (exit 1). No failure was turned into success.
- The validator's terminal line is `verdict: advisory_clean | blocked | manual_review | failed`; exit 0 only
  for `advisory_clean`. All fail-closed semantics (null/malformed/oversized/refused/stale/incomplete inputs,
  coverage mismatch, unsupported entries → manual review, p1/p2 → blocked or manual review) are unchanged.
- What `advisory_clean` means: the SDK completed with zero refusals; the structured result is schema-valid for
  the exact head; its reported counts equal the trusted manifest's; every finding is anchored to a changed
  entry, side and span; no p1/p2 was reported; no unsupported entry exists; the input was within the caps.
- What it does NOT mean (residual gap, stated): the model's counts and the absence of findings are
  self-reported. A same-repository diff can carry prompt injection that makes a tool-free model return
  matching counts and no findings; shape and count checks cannot prove inspection. The workflow therefore
  does not approve, auto-merge, or enforce or verify branch protection, and it must not be made the sole
  required merge gate. Release decisions rest on independent exact-head correctness and security reviews,
  closure of their findings, honest manual-review handling and release verification. This is a residual gap
  handled by process, not a claim that prompt injection is solved.
- The existing `main` ruleset carries only deletion and non-fast-forward protection; no status-check
  authorization condition exists and none is added. Nothing in the workflow prevents a settings user from
  selecting any job as a required check; that is a settings decision outside this file.

## G1 — credential-free always-running result job

Problem: GitHub reports a skipped job as a successful check. The review job is skipped by design for fork PRs
(and any ineligible scope), so a check named after the review job would read as passing for forks. Design: the
`review-gate` job above. PRs into branches other than `main` do not trigger the workflow (`branches:` filter).
Live verification of check names and their association with the PR head is a first-live-run acceptance
criterion; the tests exercise the YAML wiring and the script semantics only.

## G2/H — entry-type metadata classification

The collector records `old mode`, `new mode`, `new file mode`, `deleted file mode` and the mode suffix of
`index a..b <mode>`; hunk lines matching `[+-]Subproject commit <sha>` set a gitlink content flag.
Classification order at entry end: `mode_change` when old and new modes are both known and differ (with or
without hunks); `gitlink` when any mode is `160000`, or — only when the entry carries no mode metadata at all —
when the content flag is set (H: explicit regular-file modes are authoritative, so a literal "Subproject
commit" line in a 100644/100755 file is ordinary text); `symlink` when any mode is `120000`;
`mode_unsupported` for any other non-regular mode; then `rename_only` / `no_hunks` / `path`. Only regular
files (`100644`, `100755`) with an unchanged mode are supported. Any unsupported entry forces `manual_review`
even with a forged zero-finding, full-coverage result, and findings cannot reference unsupported entries.

## Local evidence (isolated worktree)

`src/lib/ci-review-validator.test.ts` — 78 tests. The complete previous coverage is kept (null shapes,
refusals, head/outcome/coverage, finding anchoring, real-git collector fixtures including G2 and H metadata
cases, prompt composition, transport boundary, tool-free parser path, sibling containment); I changes only the
expected vocabulary (`verdict: advisory_clean`, `gate: advisory_clean`, `review-gate: v2`, the job name) and
adds assertions on the advisory contract: the visible job name carries "(advisory)", the workflow text no
longer contains "Authoritative merge check" or "must require", and every failing case of the result script
still ends in `manual_review_required` with exit 1. ESLint, Prettier and `tsc --noEmit` clean.

## Known limits

- Advisory only: see the contract above; independent review is the review of record.
- Bounded input (100 KB diff / 120 KB prompt); larger PRs, including PR151, are red with `manifest: too_large`.
- The prompt (instructions + the PR's public diff) is printed in the public job log.
- Bot-authored PRs fail the action's actor checks → red.
- Live items: provider authentication through the environment secret; `restoreConfigFromBase` with the
  default-branch checkout; check names and their association with the PR head.
- `id-token: write` on the review job is kept as in the template; with the J change it is no longer used by
  the action (no OIDC request is made when `github_token` is provided) and can be dropped in a later
  reviewed reduction.
- The pin freezes action and CLI versions; updating it means re-verifying the chain.
- Mention automation (`claude.yml`) remains disabled until separately reviewed.
- js-yaml and shell-quote are transitive lockfile dependencies used by the test only.

## Independent H+I verification (Codex, 27 September 2026)

Reviewed the delta from `0d4e025c`: the regular-mode precedence fix and its real-git controls, the advisory
job name and verdict vocabulary, and removal of the proposed model-only merge authority. Independent run:
78/78 tests, TypeScript, ESLint, formatting and diff checks passed. Credential scope, trigger, tool-free
arguments, schema, negative verdicts and exit codes remain unchanged. The author was confirmed idle before
integration. This is local evidence only; exact-head external review and the recorded first-live-run
acceptance remain open. No repository settings or existing protection was changed.

## J — first live run: GitHub App token exchange failed before the model ran (27 September 2026)

Run 36316700989 on PR153 (`49bc2adf`, branch `codex/milo-ci-live-verification-20260927`): trusted checkout,
config removal and collector succeeded; the action step failed; the validator reported `step: failure`,
`execution_file: missing`, `verdict: failed`; the advisory job reported `review_result: failure`,
`gate: manual_review_required`, `reason: review_failure`. Every fail-closed control behaved as designed.

In-memory classification of the job log against the pinned action's fixed constants (`src/github/token.ts`),
counts only: `Requesting OIDC token` 1, `OIDC token successfully obtained` 1, `Exchanging OIDC token for app
token` 1, `App token exchange failed` 3 (retries), HTTP status `401`, message category "unauthorized" (no
workflow-validation, environment, claim, installation, ref or event wording), `App token successfully
obtained` 0, `Installing Claude Code` 0, `Running Claude Code via SDK` 0. So the failed stage is the
Anthropic-side exchange of the GitHub OIDC token for a GitHub App installation token, before CLI install and
before any Claude OAuth use. The owner Claude token was never exercised and is not implicated. Which OIDC
claim the exchange rejected (`pull_request_target` event, environment-scoped subject, or App installation
state) cannot be determined from the client side and is not claimed.

Correction (branch `codex/milo-ci-oidc-repair-20260927` from `main` `c2881e98`): the documented `github_token`
input is set to the job's own read-only token. Source-verified at the pinned revision: `setupGitHubToken`
returns a provided token before any OIDC request; `checkWritePermissions` (actor collaborator level via the
API), `checkHumanActor`, `configureGitAuth` (try/catch), `restoreConfigFromBase` (fetch of the base branch,
no submodule recursion) and the octokit client all run with that token; agent mode adds no MCP server here;
the post-step "Revoke app token" is skipped when `github_token` is set. Read scopes are unchanged; no secret,
PAT, App or provider is added; `id-token: write` becomes unused. Live verification of this path is still
required and is not claimed.
