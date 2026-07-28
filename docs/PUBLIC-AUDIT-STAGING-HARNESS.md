# Public Audit Minimal Staging Harness

**Status:** code-only candidate; disabled by default; environment mutation
remains NO-GO under issue #43.

## Purpose

The staging Worker can serve a minimal audit page and the reviewed
`POST /api/public-audit` endpoint from one origin. This avoids purchasing a
permanent Vercel custom environment for the first isolated security pass.

The harness is not part of the Milo product UI and must never be enabled on the
production hostname.

## Fail-closed enablement

`GET /` returns the harness only when all of these checks pass:

1. `PUBLIC_AUDIT_STAGING_HARNESS_HOST` is a valid exact hostname;
2. that value and the request hostname are both exactly
   `staging.milogrowth.com`;
3. `PUBLIC_AUDIT_STAGING_TURNSTILE_SITE_KEY` is set and structurally valid;
4. the hostname is present in `PUBLIC_AUDIT_ALLOWED_HOSTS`;
5. the exact HTTPS origin is present in `PUBLIC_AUDIT_ALLOWED_ORIGINS`.

With the committed staging configuration all four public values are empty, so
the page remains disabled and the Worker returns the existing bounded `404`.
The API POST path is unchanged.

The page:

- is `noindex`, `noarchive` and `no-store`;
- uses a per-response CSP nonce and denies framing;
- submits only to same-origin `/api/public-audit`;
- uses `textContent` for the response and never renders returned HTML;
- uses the Cloudflare Access same-origin session only to cross the staging
  access gate;
- contains no Worker secret or production configuration;
- tells operators to use synthetic public websites only.

## Exact staging configuration names

Values remain prohibited from GitHub, evidence, logs and chat.

| Name                                      | Kind       | Committed state | Approved staging state           |
| ----------------------------------------- | ---------- | --------------- | -------------------------------- |
| `PUBLIC_AUDIT_ALLOWED_HOSTS`              | non-secret | empty           | SET, exact staging host          |
| `PUBLIC_AUDIT_ALLOWED_ORIGINS`            | non-secret | empty           | SET, exact HTTPS origin          |
| `PUBLIC_AUDIT_STAGING_HARNESS_HOST`       | non-secret | empty           | SET, exact staging host          |
| `PUBLIC_AUDIT_STAGING_TURNSTILE_SITE_KEY` | public key | empty           | SET, staging widget only         |
| `SUPABASE_URL`                            | secret     | NOT SET         | SET, isolated staging only       |
| `SUPABASE_SERVICE_ROLE_KEY`               | secret     | NOT SET         | SET, isolated staging only       |
| `PUBLIC_AUDIT_IP_SALT`                    | secret     | NOT SET         | SET, staging Worker only         |
| `TURNSTILE_SECRET_KEY`                    | secret     | NOT SET         | SET, staging widget only         |
| `GEMINI_API_KEY`                          | secret     | NOT SET         | SET, dedicated paid project only |
| `PUBLIC_AUDIT_AI_MODEL`                   | non-secret | NOT SET         | optional                         |

The staging Wrangler environment is separately named
`milo-public-audit-staging`, keeps `workers_dev=false` and
`preview_urls=false`, and defines no route or custom domain.

## Code-only verification

Run from `workers/public-audit`:

```sh
npm test
npm run typecheck
npm run build
npm run build:staging
```

The staging dry-run must show no routes, private-network bindings or secret
values. A dry-run does not authorise a deploy.

## Later mutation package — still unapproved

After the Product Lead approves one exact package, the assigned operator must:

1. confirm a disposable Supabase project and recovery point;
2. apply the two reviewed migrations to that project only;
3. create a staging-only Turnstile widget and secrets;
4. create a dedicated paid Gemini project/key with quota and budget controls;
5. configure the exact public names above without recording their values;
6. deploy the exact reviewed merge SHA without a public preview URL;
7. place `staging.milogrowth.com` behind Cloudflare Access;
8. execute the issue #43 abuse, privacy, provider-failure and rollback suite;
9. delete synthetic data and disable the custom domain after the test window.

Any requirement for production data, production credentials, a public preview,
an unapproved recurring charge or a different code tree is an immediate
NO-GO.
