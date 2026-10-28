# Bounded weekly observation — table privacy follow-up, 28 October 2026

Author: Claude (implementation role, working agreement 19 September 2026).
Baseline: clean `a87044de049728b6c9094db2be786fad121dd444`, branch
`codex/milo-bounded-table-privacy-20261028`, worktree
`/Users/rafi/Projects/milo-owner-mail-recovery-20261028`.

This records prepared code and locally executed tests only. **Nothing is
deployed, activated, funded or granted.** Deployment and rollout are PENDING and
the strict production installation wrapper is RETAINED unchanged. No production
database was inspected or connected; no network, provider, Lovable, git, funding
or credential action was taken. This is not evidence of production success.

## The defect being repaired

Root merged PR194 after CI passed, but the strict production installation guard
rolled the `20261028170000` transaction back **BEFORE COMMIT**: that
environment's `DEFAULT PRIVILEGES IN SCHEMA public` grant `SELECT` and `INSERT`
on newly created tables to the optional environment role `sandbox_exec`, which
is verified **LOGIN, BYPASSRLS, not SUPERUSER** — a genuine reader, not a
harmless owner alias. The original migration revokes the four bounded tables
from `PUBLIC`, `anon`, `authenticated` and `service_role` only, so the inherited
default grant survived table creation and the guard correctly refused.

The guarded rollback left no bounded object and no journal row; budgets and the
old function identities stayed unchanged. The guard is **not** weakened here,
and default privileges are **not** altered.

## File scope — exactly four files

| Path | Change |
| --- | --- |
| `supabase/migrations/20261028211000_bounded_window_table_privacy.sql` | NEW. Conditional, scoped `REVOKE ALL PRIVILEGES` on exactly the four bounded tables from `sandbox_exec`. |
| `src/lib/weekly-test-window-table-privacy-migration.test.ts` | NEW. 25 focused PGlite cases over the real migrations, with role-absent and role-present default-grant fixtures. |
| `src/lib/milo-candidate-chain-migration.test.ts` | AMEND (integration). One `independentCandidates` entry + comment. 6 inserted lines, nothing else touched. |
| `product/evidence/bounded-window-table-privacy-2026-10-28.md` | NEW. This record. |

`git status` shows one tracked modification (`+6` lines) and three new files,
including this evidence record.
No source, function, role, policy, budget, lifetime bound, global/default ACL,
operator RPC grant, historical migration or unrelated table was changed. No new
privileged endpoint or function was added, and no general ACL cleanup was done.

### Hashes (actual, this worktree)

| File | SHA256 |
| --- | --- |
| `20261028170000_bounded_weekly_test_windows.sql` (unchanged) | `25019b0874493109258de5c8380cfb32bb12d4853e324bd2d8077bb067503263` |
| `20261028211000_bounded_window_table_privacy.sql` (new) | `0e899751ad2fe26e157ad59f484d858c6d924dc5ae4e1313a7374502a32832e7` |
| `weekly-test-window-table-privacy-migration.test.ts` (new) | `05a863237b959f9191d5bba593c6beb695189f327d9b1e2c2bb6c6e253e5bd6c` |
| `milo-candidate-chain-migration.test.ts` (amended) | `dc2c7236d9fd246d4a559ddea39bc3717e7f68c8bb943c7e49b8475946d869b5` |

The original migration retains its reviewed identity `25019b08…`; a test case
asserts that hash, so an edit to it fails the suite.

## What the migration does

Two `DO` blocks, no function, no endpoint, no dynamic identifier building
(static role and table names, quoted normally):

1. **Prerequisite check.** If any of the four tables is absent, raise
   `bounded_window_tables_absent: <names>`. A missing prerequisite is never
   silently ignored — a silent no-op would be indistinguishable from a
   successful privacy install.
2. **Conditional revoke.** If `pg_roles` has no `sandbox_exec`, `RETURN` — a
   documented no-op that creates no role and changes no ACL, so the migration is
   safe where that optional role is absent. Otherwise
   `REVOKE ALL PRIVILEGES ON public.weekly_test_windows,
   public.weekly_test_window_slots, public.weekly_test_window_contracts,
   public.weekly_test_window_allowances FROM sandbox_exec`, then **verify the
   end state** and raise `bounded_window_table_privacy_incomplete: <names>` if
   any right survives. The verification is deliberately three-way:
   `has_table_privilege` over the seven classic rights,
   `has_any_column_privilege`, and a privilege-name-free scan of `relacl` for any
   entry granted to the role. The last one catches a right the list does not
   enumerate (`MAINTAIN` on PostgreSQL 17, or anything later) **without** naming
   a keyword an older server would reject. A privilege still reachable through
   column grants, role membership or a superuser attribute therefore fails
   closed rather than being reported as privacy.

Function-level default privileges are a **different** question and are
deliberately out of scope: see the open items below.

## Executed local checks — exact commands, run separately and unmasked

Existing `node_modules`; no installs.

| Command | Result |
| --- | --- |
| `./node_modules/.bin/vitest run src/lib/weekly-test-window-table-privacy-migration.test.ts src/lib/milo-candidate-chain-migration.test.ts` | **2 files, 114 passed, 0 failed**, exit 0, 12.19s |
| `./node_modules/.bin/tsc --noEmit` | clean, no output, exit 0 |
| `./node_modules/.bin/eslint` on the two test files | clean, no output, exit 0 |
| `./node_modules/.bin/prettier --write` on the two test files (optional, scoped) | 1 file reformatted; the chain test was already formatted |

Per file: **25 passed** in the new privacy suite, **89 passed** in the candidate
chain suite (its inventory guard accepts the new entry). The lint errors from the
first `eslint` run were 6 `prettier/prettier` formatting findings only; after the
scoped format pass all three checks were re-run and are green at the hashes
above. No other suite was run: **no full suite, no DE49 harness**, and no
host-dependent test was added under `src`.

### Negative controls — the tests were confirmed able to fail

Each control was applied by temporarily editing only the new migration and then
restored; the restore was verified by SHA256 (`025b001f…` for the pre-hardening
body, `0e899751…` for the final body).

| Temporary defect | Observed |
| --- | --- |
| Whole conditional block neutralised (`RETURN` before the revoke) | **5 failed / 20 passed** — denial (SELECT and INSERT), per-right `has_table_privilege`, ACL-entry and reapply-denial cases all caught it. The INSERT case reported the real `23502` instead of `42501`, i.e. the grant genuinely survived. |
| Revoke removed, verification kept | migration raised `bounded_window_table_privacy_incomplete: weekly_test_window_allowances,weekly_test_window_contracts,weekly_test_window_slots,weekly_test_windows` and the install refused (18 cases skipped) — the self-check fails closed. |
| Revoke removed **and** verification reduced to the `relacl` branch only | same named refusal for all four tables — the privilege-name-free branch detects a leftover on its own, so it is a live check and not decoration. |

## What the tests establish

Both fixtures execute the real prerequisite chain (nine released migrations),
then the real `20261028170000`, then the exact new follow-up. The bootstrap and
chain pattern mirrors `weekly-test-window-migration.test.ts`; that module is
**neither imported nor modified**.

**Role-present fixture (LOCAL FIXTURE ONLY).** `CREATE ROLE sandbox_exec LOGIN
BYPASSRLS`, then `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT
ON TABLES TO sandbox_exec` **before** the original migration creates the four
tables. Neither the repository nor the migration creates a role or changes a
default privilege anywhere.

- The role is asserted `rolcanlogin=true, rolbypassrls=true, rolsuper=false`.
- **The defect is reproduced, not assumed:** after the original migration the
  role holds exactly `SELECT` and `INSERT` on all four tables, and with one
  fixture row per table it **actually reads all four** (1 row each) with RLS
  enabled — the `BYPASSRLS` attribute is present, so denial is never fabricated
  via RLS.
- After the follow-up: real `SET ROLE` `SELECT` and `INSERT` on each of the four
  tables are refused with **SQLSTATE `42501`** and a `permission denied`
  message; `has_table_privilege` is **false for all 7 × 4 direct table rights**;
  no `sandbox_exec` entry remains in `relacl` and no column ACL exists.
- `PUBLIC`, `anon`, `authenticated` and `service_role` were closed before and
  are byte-identically closed after.
- Unchanged: every function signature, full `pg_get_functiondef` body and
  `proacl` in `public` (so no definition, no EXECUTE grant and no added
  function); the four operator RPCs stay `service_role`-only with the three
  internal evaluators granted to nobody, and `sandbox_exec` has EXECUTE on none
  of the seven; RLS, forced-RLS and zero policies per table; the exact row
  contents of all four tables; the role list; and the `pg_default_acl` snapshot
  (which still contains the `sandbox_exec` default). Permits, requests and
  budgets are 0 — nothing is funded.
- **Scope of the revoke:** an unrelated local sentinel table created while the
  default grant was in force keeps its inherited `SELECT`/`INSERT` and is
  really readable and writable by the role after the follow-up; a **future**
  unrelated table created after the follow-up still inherits the same
  `SELECT`/`INSERT`, proving the default privileges themselves were untouched.
- **Reapply idempotency:** applying the follow-up a second time is a no-op
  (identical ACL, function, default-ACL, role and data snapshots) and every
  bounded table stays denied with `42501`.

**Role-absent fixture.** The follow-up applies cleanly with no `sandbox_exec`
anywhere: no role is created or changed, `pg_roles` still has no such role, no
table ACL / RLS setting / policy / function changes, `pg_default_acl` stays
empty, the four tables stay closed to every client role, and data is unchanged
and empty.

**Missing prerequisite.** Against a bare database the follow-up refuses with
`bounded_window_tables_absent` naming all four tables.

## Honest limitations

- **Local only.** These are prepared code and unit tests, not verified
  production behaviour. Nothing here establishes the deployed SQL identity, the
  production ACL state, or that the strict installation guard now passes there.
  Deployment and rollout are **pending**.
- **PGlite runs one in-process superuser connection.** `SET ROLE` proves the
  server's ACL decision for that role, but not a separate authenticated login,
  and not a concurrent session. The focused real **PostgreSQL 17**
  ACL/`SET ROLE` probe against the existing external fixture is Codex's
  independent step after a coherent candidate; it is not performed here and the
  seven concurrency tests are deliberately not re-run.
- **Production default privileges are taken from the reported finding**, not
  from an inspection: this packet carries no authorization to inspect or connect
  production, and none was attempted. The role-present fixture reproduces the
  reported default grant locally.
- The test asserts PostgreSQL 17 behaviour as PGlite implements it; the
  `relacl` branch exists precisely because the privilege vocabulary differs
  across major versions, but only PGlite's version was exercised locally.

## Codex independent review and integration evidence

Codex appended this section as necessary release-evidence integration. No
executable product or test bytes were changed after Claude's coherent handoff.
Independent source review found no blocking issue. Independent checks passed:
114/114 focused tests, typecheck exit 0, scoped lint exit 0 and diff check exit 0.

The separate real PostgreSQL 17.11 proof passed at 21:27:16 UTC. With the actual
LOGIN/BYPASSRLS/non-superuser role, all four seeded tables were readable before
the correction; all eight SELECT/INSERT attempts returned 42501 afterward.
All 160 effective role/table/right checks, including MAINTAIN, were false, with
zero non-owner table ACL entries. Function definitions and grants, default ACLs,
role flags, RLS/policies, seeded rows and local budget/permit/request state were
preserved. The service read RPC remained callable, reapplication was a no-op,
and unrelated and future table access remained intact. The owned PostgreSQL
process, socket and temporary directory were verified removed. An earlier
ad hoc probe's project-name mismatch was corrected in the external harness only;
its failed result is retained separately and is not a product defect.

A fresh read-only production diagnostic at 21:15:41 UTC found no sandbox_exec
function EXECUTE default among the queried postgres/supabase_admin public and
global defaults. This is evidence for those queried scopes only. Function
changes remain out of scope and the strict installer function ACL check remains.
The V2 installer also retains the strict owner-only table ACL check; it is not
replaced by a named-role exception. It installs both exact migrations in one
transaction before any commit and journals each complete source once.

Canonical operational evidence is in the project mirror's
`evidence/live-readiness-20261028/bounded-table-privacy-pg-result.json`,
`production-function-default-acl-diagnostic.json` and
`bounded-release-wrapper-manifest-v2.json`. Local V2 installer validation passed
with the same BYPASSRLS role/default grants and all preservation checks intact.
These local successes do not establish production installation or publication.

Deployment evidence and the activation decision remain pending. The USD 50
global ceiling, manual-budget prerequisite for free accounts and existing cron
jobs are unchanged. No window, funding or observation clock has started.
