# Claude Code Review workflow repair — design and evidence (candidate G, 27 September 2026)

Isolated infrastructure change. Branch `codex/milo-ci-review-repair-20260927` (PR152); pushed HEAD `2b2d2524`
(D+E+F); G is the uncommitted delta on top of it. Files touched by G: `.github/workflows/claude-code-review.yml`,
`src/lib/ci-review-validator.test.ts`, this note. No application, locale or SQL change. Repository is PUBLIC.

## Status in one paragraph

Code boundaries addressed (trusted-base trigger limited to PRs into `main`, no PR checkout, tool-free model,
pinned action revision, fail-closed validator, fixed-enum output). Owner credential prerequisite COMPLETED and
verified by metadata: `claude-review` environment with a `main`-only deployment branch policy holds the
secret, the repository-level copy is removed (GitHub reply 4115078300); live provider authentication through it
is still unverified. External review 5330047655 on `2b2d2524` found two defects, fixed here: G1 — the fork
skip of the review job counted as a passing check; G2 — mode/gitlink metadata could be falsely attested.
Exact-head review of the G delta, the branch-protection bootstrap (require "Claude Review Gate") and the
first live run remain. PR151 keeps its known `too_large` → manual-review outcome. The whole goal is not done.

## History

- A → B → C → D → E → F: see the F edition of this note (null shapes, output disclosure, deletion coverage,
  trusted-base trigger, tool-free model, transport limit, credential prerequisite, sibling containment).
- G (4115099604 / 4115099605): credential-free authoritative gate job; entry-type classification for
  executable-bit changes with edits, gitlinks, symlinks and other non-regular modes.

## G1 — authoritative gate job "Claude Review Gate"

Problem: GitHub reports a skipped job as a successful check and does not block merges on it. The review job is
skipped by design for fork PRs (and any ineligible scope), so a fork PR could pass a required check named
after the review job.

Design: a second job `review-gate` (check name "Claude Review Gate") with `needs: [claude-review]` and
`if: always()`, so it runs for every event of this workflow, including fork PRs. It is credential-free by
construction: no `environment`, no `secrets.` reference, `permissions: {}` (the job token has no scopes, no
OIDC), no checkout, no `uses:` step, no PR content; its env holds only event metadata (`needs.claude-review.result`,
head repository name, base ref, repository). An inline script prints fixed enums (`review-gate: v1`,
`review_result`, `scope`, `gate`, `reason`) and exits 0 only when the scope is eligible (same repository, base
`main`) AND the review job result is exactly `success`. Fork/unknown scope and `skipped`, `failure`,
`cancelled` or missing/forged results exit 1 with `gate: manual_review_required` and a reason enum. The review
job (which GitHub would report as skipped-success) deliberately has no display name so that branch protection
is configured against "Claude Review Gate". PRs into branches other than `main` do not trigger the workflow at
all (`branches:` filter); a required "Claude Review Gate" then stays missing/pending, which also blocks merge.

Bootstrap (owner, repository settings, not performed here): branch protection or ruleset on `main` → require
status check "Claude Review Gate" (and NOT `claude-review`). Live verification of the check name, its
association with the PR head and its blocking behaviour is a first-live-run acceptance criterion; the tests
below exercise the YAML wiring and the script semantics only and do not prove hosted branch protection.

## G2 — entry-type metadata classification

Problem: the collector marked mode metadata unsupported only when an entry had no hunks, so an executable-bit
change combined with a text edit lost its mode change, and `new file mode 160000` / `index … 160000` gitlinks
(submodule pointers) or `120000` symlinks were treated as ordinary text hunks — an opaque "Subproject commit"
line could be attested as inspected code.

Design (smallest explicit classification, no parser framework): the collector records `old mode`, `new mode`,
`new file mode`, `deleted file mode` and the mode suffix of `index a..b <mode>`; hunk lines matching
`[+-]Subproject commit <sha>` set a gitlink flag. Classification order at entry end: `mode_change` when old and
new modes are both known and differ (with or without hunks); `gitlink` when any mode is `160000` or the gitlink
content flag is set; `symlink` when any mode is `120000`; `mode_unsupported` for any other non-regular mode;
then the existing `rename_only` / `no_hunks` / `path` rules. Only regular files (`100644`, `100755`) with an
unchanged mode are supported (`add`/`delete`/`modify`/`rename`). The validator's allowlist of unsupported
reasons is `binary, rename_only, mode_change, gitlink, symlink, mode_unsupported, no_hunks, path`; any
unsupported entry forces `manual_review` even with a forged zero-finding, full-coverage result, and findings
cannot reference unsupported entries. Hunk, old/new-span, path, head and count invariants are unchanged.

## Local evidence (isolated worktree)

`src/lib/ci-review-validator.test.ts` — 77 tests (F: 74; G: +3; the `mode_only` expectation became
`mode_change`). Real-git fixtures added: chmod + text edit (`old mode 100644` / `new mode 100755` with a hunk)
→ `mode_change`; gitlink add (`git update-index --cacheinfo 160000,…`, `new file mode 160000`,
`+Subproject commit …`), gitlink update (`index … 160000`), gitlink delete (`deleted file mode 160000`) →
`gitlink`; symlink add (`new file mode 120000`) → `symlink`; regular file → symlink type change, which git
renders as a supported `delete` plus an unsupported `symlink` entry → manual review; positive control: editing
an already-executable regular file (`index … 100755`, mode unchanged) stays a supported `modify` and attests.
For every unsupported case a forged zero-finding result yields `verdict: manual_review`, and a finding on the
entry's path is `unlisted_file`. Gate: YAML wiring assertions (job order, name, `needs`, `if: always()`, no
environment, `permissions: {}`, env keys, single run step, no `uses`, no `secrets.`/`id-token`/`checkout`/
`head.sha` in the job) and script cases run as a child process: eligible+success → passed; fork+skipped,
fork+success, base not main, head repo unknown → `scope_*`; same repo + skipped/failure/cancelled/missing/
forged (`"SUCCESS "`) → `review_*`; the fork repository name is never printed; all lines match the fixed
line pattern. ESLint, Prettier and `tsc --noEmit` clean.

## What "attested" and "Claude Review Gate: passed" prove and do not prove

Unchanged for the validator: SDK completed with zero refusals; schema-valid result for the exact head; counts
equal the manifest's; every finding anchored; no p1/p2; no unsupported entry; input within the caps. The gate
additionally proves only that the review job reported `success` for an eligible PR. Neither proves the model
read every hunk or judged a removal correctly. Independent review remains the review of record.

## Known limits

- Bounded input (100 KB diff / 120 KB prompt); larger PRs, including PR151, are red with `manifest: too_large`.
- The prompt (instructions + the PR's public diff) is printed in the public job log.
- Bot-authored PRs fail the action's actor checks → red.
- Live items: provider authentication through the environment secret; `restoreConfigFromBase` with the
  default-branch checkout; check names and their association with the PR head; branch-protection behaviour of
  "Claude Review Gate".
- `id-token: write` on the review job and the action's App-token exchange are kept as in the template.
- The pin freezes action and CLI versions; updating it means re-verifying the chain.
- Mention automation (`claude.yml`) remains disabled until separately reviewed.
- js-yaml and shell-quote are transitive lockfile dependencies used by the test only.

## Independent G verification (Codex, 27 September 2026)

Reviewed only the delta from `2b2d2524`: collector metadata classification, unsupported-result handling,
credential-free final gate, actual YAML dependencies and real-git fixtures. Independently ran 77/77 tests,
TypeScript, ESLint and formatting checks successfully; `git diff --check` passed. Claude completed the
packet before integration. No provider run or hosted gate behaviour is claimed.

Read-only repository settings inspection: active ruleset `main-baseline-protection` (21937885) currently
contains deletion and non-fast-forward protections, not a required status check. This supplements the
legacy branch-protection endpoint's 404; neither is permission to bypass review. Requiring the new gate
and defining the honest manual-review release path remain explicit bootstrap decisions, with existing
protections preserved. No repository settings were changed in G.
