# Claude Code Review workflow repair — design and evidence (final reconciliation F, 27 September 2026)

Isolated infrastructure change. Branch `codex/milo-ci-review-repair-20260927` (PR152), candidate C committed
as `c1141d9b`; D, E and F are the uncommitted delta on top of it. Files:
`.github/workflows/claude-code-review.yml`, `.github/workflows/claude.yml` (F: containment only),
`src/lib/ci-review-validator.test.ts`, this note. No application, locale or SQL change. Repository is PUBLIC.

## Status in one paragraph

Code boundaries are addressed (trusted-base trigger limited to PRs into `main`, no PR checkout, tool-free
model, pinned action revision, fail-closed validator, fixed-enum output). The credential relocation and the
removal of the repository-level secret copy are REQUIRED and NOT yet performed; until they are, P1
4113585903 stays open and the repaired job must not be merged or enabled. Exact-head external reviews of
PR152 remain required. PR151 has a known CI outcome of `manifest: too_large` → manual review required; it is
NOT a completed bounded review. Live status association of `pull_request_target` runs is unverified. The
sibling mention workflow is temporarily fail-closed (F) pending its own review. The whole goal is not done.

## History

- Run 36269228557 on PR151: plugin template, no allowlist, 32 denials, nothing posted, green.
- A → B: null attested; model filename printed; model JSON in step env; only p1 ≥ 80 blocked.
- B → C: whole-span mislabelled; deletions outside the contract; hand-written fixture; mutable PR read.
- C → D (4113585903 / 4113585908): PR merge-ref workflow held the credential; unrestricted reads.
- D → E: credential isolation is an owner prerequisite; 100 KB cap excludes PR151; action pinned;
  prompt-file transport investigated and rejected (action.yml overwrites `INPUT_PROMPT_FILE`, agent mode
  rewrites the prompt directory, run.ts reads that fixed path).
- E → F: prerequisite order corrected (repository copy removed BEFORE P1 is called closed and BEFORE the
  repaired job is merged/enabled); sibling `claude.yml` credential job fail-closed; the categorical model
  context-window claim withdrawn (byte transport limit alone is the proof).

## Design (unchanged from E; summary)

1. `on: pull_request_target` with `branches: [main]`; job `if` requires a same-repository head and
   `base.ref == 'main'`; `environment: claude-review`; ref-less default-branch checkout with
   `persist-credentials: false`; `.claude`/`.mcp.json` removed from the runner copy.
2. Trusted collector: immutable compare diff `base.sha...head.sha` (read-only token), hunk consumption with
   old/new spans and counts, unsupported entries recorded, prompt = fixed instructions + manifest + diff as
   delimited untrusted data, delivered through a random-delimiter `GITHUB_OUTPUT` to the action's `prompt`
   input. Caps: diff ≤ 100 000 bytes, prompt ≤ 120 000 bytes (the only supported transport is one
   environment string; Linux limit 128 KiB). Oversize → `diff_bytes: N`, `manifest: too_large`, exit 1.
3. Action pinned to `anthropics/claude-code-action@756cc22e19660d20e8cc9496b4f242475a7f7790` (the commit `v1`
   resolved to on 27 September 2026). Preprocessing chain source-verified at that revision (context mapping,
   token, actor checks, agent-mode prepare with prompt-dir rewrite and no MCP servers without `mcp__github_*`
   allow entries, CLI 2.1.283 install, config restore from the base branch, `preparePrompt`, shell-quote
   `claude_args` parser, Agent SDK argv).
4. Tool-free session: `--tools=""` (reaches the CLI as `--tools=`; local init shows only the synthetic
   StructuredOutput tool, no MCP), `--disallowed-tools` incl. Bash/Read/Grep/Glob, `--max-turns 10`,
   `--setting-sources user`, `--strict-mcp-config`, `--json-schema`.
5. Validator (`review-result: v3`): SDK result read from the runner-local execution file only; completion,
   zero denials, exact head, full file+hunk coverage, side-aware anchoring to manifest spans, fixed
   vocabulary; p1/p2 → blocked / manual review; unsupported → manual review; all else fail closed.

## Credential isolation — REQUIRED owner prerequisite, not performed (P1 4113585903 open)

Measured read-only: repository Actions secret `CLAUDE_CODE_OAUTH_TOKEN` exists; environments `Preview`,
`Production` exist without branch policies; `claude-review` does not exist.

Order (corrected in F): prepare protection and the same-token entry first; remove the repository-level copy
BEFORE P1 is called closed and BEFORE PR152 is merged or the repaired job enabled. An interval in which the old
workflows cannot authenticate is honest fail-closed maintenance, not a reason to keep the insecure copy.
Verification is by GitHub metadata (names and policies), never by a provider run.

Owner UI steps (owner only; the existing token entered directly in GitHub; no token in files or chat; no
rotation; no new provider):

1. Settings → Environments → New environment → name `claude-review`. Deployment branches and tags → "Selected
   branches and tags" → Add deployment branch or tag rule → `main`. Leave "Required reviewers" and "Wait timer"
   off.
2. Same environment → Environment secrets → Add secret → name `CLAUDE_CODE_OAUTH_TOKEN`, value = the existing
   token.
3. Settings → Secrets and variables → Actions → Repository secrets → delete `CLAUDE_CODE_OAUTH_TOKEN`.
4. Read-only acceptance (names/policies only): `GET /repos/{o}/{r}/environments/claude-review` shows
   `deployment_branch_policy.custom_branch_policies: true`; `GET …/environments/claude-review/deployment-branch-policies`
   lists exactly `main`; `GET …/environments/claude-review/secrets` lists `CLAUDE_CODE_OAUTH_TOKEN`;
   `GET /repos/{o}/{r}/actions/secrets` no longer lists it. Only when all four hold is P1 closable.
5. Then the independent exact-head review of PR152 and the merge decision (Codex). After merge, the first
   same-repository PR into `main` is the live acceptance run (status association, action behaviour with the
   default-branch checkout, validator lines).

## Sibling workflow `claude.yml` — temporary security containment (F)

`claude.yml` is the official tag-mode mention workflow: it runs the same OAuth credential in an unrestricted
session (full tool set, `additional_permissions: actions: read`) on comment/issue/review events. After the
secret moves into the environment, adding `environment: claude-review` to that job would hand the relocated
credential to an unrestricted model again through another path. F therefore fail-closes its job: the
original trigger condition is preserved as a comment and the job condition is replaced by `if: false`.
Events still fire, the job is skipped, no step runs, no credential is read. This is a temporary containment
of comment automation pending its own review, not a redesign; the authorized Claude desktop session remains
available. Regression: the test suite parses `claude.yml` and asserts the single job's condition is exactly
`false`, that no `environment` is declared there, and that the file otherwise still carries the original
trigger events and credential reference (nothing else changed). Restoring the automation is a separate,
reviewed change.

## PR151 — known CI outcome

Immutable compare diff `1134899e...b214a39c`: 819 617 bytes, 95 files, 147 hunks (measured read-only; file
deleted after). The committed collector: `diff_bytes: 819617`, `manifest: too_large`, exit 1 → the workflow
outcome for PR151 is "manual review required", not a completed review. With the byte caps raised in a
throwaway copy the collector handled all 95 files / 147 hunks with 0 span-invariant violations and the prompt
would be 845 052 bytes — far beyond the single-environment-string transport, which alone proves the
blocker. No claim is made about any model's context window. No truncation, chunking, waiver or history
rewrite; PR151's review of record is the independent reviews already performed, a release decision for Codex.

## What "attested" proves and does not prove

Unchanged: SDK completed with zero refusals; schema-valid result for the exact head; reported file and hunk
counts equal the manifest's; every finding anchored to a changed entry, side and span; no p1/p2; no
unsupported change; input within the caps. It does not prove the model read every hunk or judged a removal
correctly.

## Local evidence (isolated worktree)

`src/lib/ci-review-validator.test.ts`: the E suite plus the `claude.yml` containment regression. ESLint,
Prettier and `tsc --noEmit` clean. The collector was exercised on the real PR151 diff (E) without a provider
call.

## Known limits

- Bounded input (100 KB diff / 120 KB prompt); larger PRs are red with `manifest: too_large`.
- The prompt (instructions + the PR's public diff) is printed in the public job log.
- Bot-authored PRs fail the action's actor checks → red (fail closed).
- `restoreConfigFromBase` and status association are first-live-run acceptance criteria.
- `id-token: write` and the action's App-token exchange are kept as in the template.
- The pin freezes action and CLI versions; updating it means re-verifying the chain.
- Mention automation (`claude.yml`) is disabled until separately reviewed.
- js-yaml and shell-quote are transitive lockfile dependencies used by the test only.
