# Claude Code Review workflow repair — design and evidence (candidate C, 27 September 2026)

Isolated infrastructure change. Branch `codex/milo-ci-review-repair-20260927` from `main` at `1134899e`.
Contains only `.github/workflows/claude-code-review.yml`, `src/lib/ci-review-validator.test.ts` and this note.
No application, locale or SQL change. Repository is PUBLIC: every job log line is public, including the
runner's echo of each step's `env:` block before the step runs.

## History

- Run 36269228557 on PR151: plugin template, no SDK allowlist, 32 denials, nothing posted, green
  (`execution_only`). The PR-checkout diagnostic (finding 4112676405) was withdrawn.
- Candidate A: null structured output attested; regex-valid model filename printed; model JSON in step env
  (runner prints it); only p1 ≥ 80 blocked. Fixed in B (accepted by review B).
- Candidate B: collector recorded whole new-side hunk spans while claiming "added lines"; deletion-only
  changes and deleted files were outside the contract, so a guard removal could attest with zero findings;
  fixture diff was hand-written and malformed; head identity came from a separate mutable PR read; the model
  re-fetched the PR with a `gh` prefix allowlist. Fixed in C (this document).

## Design (C)

1. **Immutable identity.** The collector fetches GitHub's compare diff for `base.sha...head.sha` from the
   event (read-only job token). The manifest records both SHAs; the validator requires manifest head =
   expected head. No mutable "current PR" read exists anywhere.
2. **Hunk-consuming collector (inline workflow code).** For each `diff --git` entry it parses the header
   (`---`/`+++` paths with strict alphabet, rename/similarity, mode, binary markers) and then consumes every
   hunk body line against the `@@` header counts (`+` new, `-` old, ` `/blank context, `\` marker ignored).
   Any count mismatch, stray line, bad header, preamble, empty diff, oversize (20 MiB) or identity problem
   fails the step, so the model never runs and the validator fails closed. Per hunk it records
   `oldSpan`, `newSpan` (whole hunk spans, i.e. changed lines plus context, labelled as such), and
   `added`/`removed`/`context` counts. Per entry: `kind` add/delete/modify/rename/unsupported, `oldPath`,
   `newPath`. Entries with no hunk (rename-only, mode-only, no_hunks), binary content or unparseable paths are
   recorded as `unsupported` with the reason, never hidden. Both files are copied into `.ci-review/` for the
   model.
3. **Model with no command surface.** `claude_args` (verified against the action's v1 shell-quote parser,
   reproduced in the test): `--tools "Read,Grep,Glob"` (documented CLI option: the set of available built-in
   tools), `--allowed-tools "Read,Grep,Glob"`, `--disallowed-tools "Bash,Task,Agent,Edit,Write,MultiEdit,
NotebookEdit,WebFetch,WebSearch,TodoWrite,Skill"`, `--max-turns 30`, `--setting-sources user`,
   `--strict-mcp-config`, `--json-schema '<fixed>'`. The prompt tells the model to read `.ci-review/pr.diff`
   and `.ci-review/manifest.json`, inspect every entry and every hunk including removed lines and deleted files,
   and anchor findings to `{file, side new|old, line}` inside a hunk span on that side. In-repo `.claude/` and
   `.mcp.json` are removed from the runner checkout first (developer settings untouched). Job permissions
   unchanged; `persist-credentials: false`.
4. **No model content in any transport the runner prints.** Validator env: step outcome, runner temp dir,
   expected head. No `steps.*.outputs` referenced anywhere. The SDK result, including `structured_output`, is
   read solely from the runner-local execution file. `display_report`/`show_full_output` stay off.
5. **Fail-closed validator (inline workflow code).** Attests only when ALL hold: step `success`; manifest
   valid (exact keys, SHAs, kinds, spans, per-entry consistency, `hunkCount` and `unsupported` totals
   recomputed) with head = expected and ≥ 1 entry; execution file a JSON array whose last `result` is
   `subtype: success`, `is_error: false`, zero `permission_denials`; `structured_output` an object with exact
   keys (`null`/primitive/array → invalid); head = expected; outcome `reviewed`; `filesInspected` = entry count
   and `hunksInspected` = hunk total (`coverage: full`; else `none|partial|excess|hunks_mismatch`); each finding
   shape-valid with `side`, `file` equal to the entry's `newPath` (side new) or `oldPath` (side old) of a
   supported entry, `line` inside one of that entry's spans on that side (`unlisted_file` / `outside_hunks`
   otherwise); ≤ 20 findings. Output: fixed vocabulary; findings as
   `finding: <sev> <cat> file=<index> side=<side> line=<n> confidence=<n>`; `changed_file: <index> <kind>
<manifest paths>` for referenced indices; `unsupported_change: <index> <reason>` for unsupported entries.
6. **Gate.** Any p1/p2 with confidence ≥ 50 → `blocked`; any p1/p2 below 50 → `manual_review`; any
   unsupported entry → `manual_review` even with a clean result; only p3 or no findings on a fully supported
   change set → `attested`. Any other failure → `failed`. Exit 0 only for `attested`.

## What "attested" proves and does not prove

Proves: the SDK completed with zero refusals; the result is schema-valid for the exact head; the reported
file and hunk counts equal the trusted manifest's; every finding points at a changed file and a line inside
a hunk on the stated side; no p1/p2 was reported; no unsupported change exists. Does not prove: that the model
actually read every hunk (`filesInspected`/`hunksInspected` are its claims, bounded by the manifest), or that
a removed guard was judged correctly — a removal-only hunk with a zero-finding, full-coverage result attests.
The contract now makes such a removal representable (old side) and demands its inspection; it cannot verify
judgement. Independent review remains the review of record.

## Trust boundary (accurate statement)

The action's default-branch validation decides only whether the ACTION step runs; every `run:` step executes
as written on the PR merge ref. Bounds: read-only job token; fork PRs get no secrets and no OIDC token; no
PR-checkout code executed; `persist-credentials: false`; the session has only Read/Grep/Glob. Not bounded by
this file: a repository writer can change it — the repository's write boundary (branch protection / review of
`.github/workflows`). `id-token: write` is left as in the official template; its necessity for this repository
is unverified and a candidate for a later reduction.

## Local evidence (isolated worktree)

`src/lib/ci-review-validator.test.ts` — 70 tests. Both heredocs are extracted from the YAML and executed as
child processes. Diff fixtures are produced by real `git diff` between two real commits in temporary
repositories (removal-only authorization guard; whole-file deletion; mixed add/remove/context; rename without
change; rename with edit; mode-only change; binary add; new file; missing trailing newline; combined
multi-file commit). Verified: exact spans/counts for the guard removal (`oldSpan [2,9]`, `newSpan [2,6]`,
removed 3, context 5), old-side finding on the removed guard → `blocked`, new-side context anchor accepted,
lines outside the hunk rejected on both sides; deletion → `delete` kind, old side addressable, new side
unlisted; mixed → hunk invariants (`old span length = removed + context`, `new span length = added + context`),
ordered non-overlapping spans, totals 3 added / 2 removed; rename-only, mode-only and binary → `unsupported`
→ `manual_review`, never attested; rename with edit → both paths addressable on their own side only; combined
→ 3 entries / 3 hunks, hunk mismatch rejected; malformed variants (truncated body, injected `+` line, bad
header, prose preamble) → `malformed_diff` with no manifest written and no content echoed; identical SHAs or
invalid SHA → `invalid_identity`; empty → `empty`; 20 MiB + 1 → `too_large`. Plus the A1 null/primitive
table (now including manifest count/consistency mismatches), refusal cases, coverage cases, the A2 finding
table (with `side` cases), the A3 transport-boundary assertions (env keys, no output references, compare URL
with both SHAs, no `gh pr`, no `gh` in the prompt, step order, checkout options, rm step) and the parser
reproduction (`tools` = Read,Grep,Glob; no `Bash(` anywhere; schema requires `hunksInspected` and `side`).
ESLint, Prettier and `tsc --noEmit` clean.

## Known limits

- A PR that changes this file is skipped by the action's validation until merged; the validator reports
  `step: skipped` and fails. No live success is claimed before the file is on `main`.
- GitHub's compare endpoint refuses very large diffs; the collector then fails and the job is red (manual
  review, not a bypass). The compare diff is three-dot (merge base), the same content as the PR diff.
- Whole-hunk spans include context lines; a finding on a context line is accepted and labelled by side and
  line, not marked as "changed". Removal-only defects are reportable on the old side but their detection is
  the model's judgement.
- `--tools`, `--setting-sources user` and `--strict-mcp-config` are verified against the CLI help and the
  action's parser, not by a live run. `CLAUDE.md`/`AGENTS.md` remain readable instruction text.
- The Read tool may read any path the runner exposes (not only `.ci-review/`); the runner and action may expose sensitive temporary/configuration files, so do not treat the filesystem as secret-free. No write/command tool exists; output validation reduces disclosure surface but is not an OS-level file sandbox.
- The test uses js-yaml and shell-quote, present only as transitive lockfile dependencies; the collector,
  validator and git fixtures need neither.
- The inert `scripts/claude-review-diagnostic.mjs` and its test in pending PR151 are a separate release-boundary removal.

## Independent acceptance for opening the infrastructure PR

Codex27Sep independently reran all70tests successfully, reviewed the changed collector/validator/tool boundary, and ran the exact collector against the actual immutable GitHub compare for PR151: base1134899e19aeae526b10f4f857027bd9ddfa734b, headb214a39c0b86b65a43d07f2c28700029706a4eb3. The819617-byte diff parsed successfully:95files,147hunks,0unsupported entries. This proves real-diff collection only; it is not evidence that Claude reviewed that diff or that GitHubActions completed the new workflow.

Minimal Codex integration documentation correction: removed the author's incorrect secret-free-runner claim and clarified that the unused diagnostic helper is in pendingPR151, not verified as onmain. Application and SQL are unchanged. Candidate may be opened for independent exact-head code/security review. No infrastructure merge, live Claude run, application release or migration is approved by these local results alone.
