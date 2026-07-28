# Public Audit Staging Harness — Code-only Evidence — 2026-07-28

**Issue:** #43

**Branch:** `agent/public-audit-staging-harness`

**Authority:** code, tests and documentation only; no environment mutation

## Implemented boundary

- a separately named `milo-public-audit-staging` Wrangler environment;
- `workers_dev=false`, `preview_urls=false`, no route and no custom domain;
- all committed staging public variables empty;
- no committed secret, secret placeholder or production value;
- `GET /` remains disabled unless the exact host is
  `staging.milogrowth.com`, the Turnstile site key is structurally valid and
  the exact host/origin allowlists agree;
- production `milogrowth.com` is rejected even if an operator tries to enable
  the harness through configuration;
- the reviewed `POST /api/public-audit` code path is unchanged;
- the page is no-store/noindex, denies framing, uses a per-response CSP nonce
  and renders API output through `textContent`;
- the page submits only to the same-origin API and contains no Worker secret.

## Verification

| Check                                     | Result                                               |
| ----------------------------------------- | ---------------------------------------------------- |
| Worker unit/integration/adversarial tests | PASS — 3 files / 49 tests                            |
| Worker TypeScript                         | PASS                                                 |
| Worker production dry-run                 | PASS — 40.23 KiB upload, 11.79 KiB gzip, no bindings |
| Worker staging dry-run                    | PASS — four empty public bindings only               |
| Full Milo test suite                      | PASS — 89 files / 1165 tests                         |
| Milo production build                     | PASS                                                 |
| Changed-file ESLint                       | PASS                                                 |
| Prettier and `git diff --check`           | PASS                                                 |

The production dry-run explicitly selects the top-level Wrangler environment.
The staging dry-run explicitly selects `--env staging`. Neither command
authenticated, deployed a Worker, created a route or changed an account.

## Review findings resolved before commit

1. The first candidate accepted any syntactically valid configured staging
   host. It was tightened to the single planned
   `staging.milogrowth.com` hostname, with a regression test proving that the
   production hostname cannot enable the page.
2. The first production dry-run emitted a multiple-environment warning. The
   production build command now explicitly selects `--env=""`, preventing an
   operator from targeting staging accidentally.
3. The stricter hostname rule initially exposed a stale `audit.test` fixture.
   The fixture was corrected and the complete Worker gate rerun.

## Non-claims

- no Cloudflare zone, Access policy, Worker, custom domain or route exists as a
  result of this branch;
- no Supabase project or migration was created or changed;
- no Turnstile widget, secret or site key was created;
- no Google Cloud project, Gemini key, quota, budget or billing setting was
  created;
- no staging or production deployment occurred;
- live Cloudflare Access, Turnstile, Supabase, Gemini, abuse and rollback
  verification remains blocked on a separately approved environment mutation
  package under issue #43.
