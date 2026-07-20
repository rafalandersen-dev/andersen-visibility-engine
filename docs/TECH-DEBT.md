# Technical Debt Register

Tracked, deliberately-deferred engineering debt. Each entry names the problem,
its impact, and the intended (separate) remediation. Entries here are **not**
worked on inside feature branches — they get their own dedicated branch.

---

## TD-2 · Outbound source/sitemap fetch — DNS-rebinding residual & egress control

**Status:** OPEN — mitigated by fail-closed config; full fix deferred.
**Logged:** 2026-07-20 (Article Studio 2.0 adversarial-review fix, Phase D).

### Problem

`safe-fetch.ts` blocks every non-global IP LITERAL, but a public hostname whose DNS
record points at a private/metadata IP (DNS rebinding) cannot be blocked without
**resolve-before-connect**, which the Cloudflare Workers runtime does not expose
(no functional `node:dns`). This is a real SSRF class that would be exploitable on a
Node/self-hosted deployment. **Authenticated access is NOT a mitigation.**

### Current mitigation (in this branch)

- On Cloudflare Workers, a subrequest to an RFC1918 / loopback / link-local /
  metadata IP does not route (egress is via Cloudflare's edge; no VPC/IMDS), so the
  residual is **not currently exploitable** on the approved runtime.
- Outbound source/sitemap fetching is **fail-closed by config**: `safeFetch` refuses
  unless `MILO_OUTBOUND_FETCH_MODE` is `workers` or `egress-proxy` — an explicit
  operator declaration, not brittle runtime sniffing.

### DEPLOYMENT INVARIANT (must hold on every deploy)

- **Cloudflare Workers** (current): set `MILO_OUTBOUND_FETCH_MODE=workers`.
  _(Required — without it, source validation + sitemap inventory fail closed.)_
- **Node / self-hosted**: outbound source/sitemap fetch is only approved behind an
  **egress allowlist or safe proxy that pins the resolved destination IP**; set
  `MILO_OUTBOUND_FETCH_MODE=egress-proxy` only once that is in place. Otherwise leave
  it unset so the feature stays disabled.

### Intended remediation (separate)

Build the egress allowlist/proxy (or a resolve-then-pin fetch) for non-Workers
runtimes; then `egress-proxy` mode enforces it at connect time.

---

## TD-1 · Align ESLint/Prettier configuration and establish a clean repository formatting baseline

**Status:** OPEN — deferred. Do not fix inside feature branches.
**Logged:** 2026-07-20 (during P1 Article Studio 2.0 kickoff).

### Problem

The repository's lint/format baseline is dirty and unenforced:

- `eslint .` (the `lint` npm script) reports **~5,100 `prettier/prettier` errors on `main`** — pre-existing and repo-wide.
- The eslint-prettier integration disagrees with the standalone `prettier` CLI on many files. There **is** a real `.prettierrc` (`printWidth: 100`, `semi: true`, `singleQuote: false`, `trailingComma: "all"`), but large amounts of pre-existing code (e.g. `src/lib/ai.functions.ts`, the `src/i18n/*.ts` dictionaries) violate it — mostly line-length overruns and missing trailing commas.
- There is **no CI lint/format/test gate** (`.github/workflows/` contains only the two Claude bots), so nothing keeps the baseline clean.

### Impact

- "Is lint green?" is unanswerable at the repo level; per-file `prettier --check` is the only reliable signal for a given change.
- Forcing a single touched file prettier-clean can trigger a large reformat of **pre-existing, unrelated** lines (observed: one file reformats ~1,100 lines), which pollutes diffs and blame and conflates cleanup with feature work.
- New contributors cannot trust `npm run lint`.

### Intended remediation (separate, dedicated branch — NOT here)

1. Decide the single source of truth (align the eslint `prettier/prettier` rule options with `.prettierrc`, or drop the eslint-prettier plugin in favour of a standalone `prettier --check` step).
2. Run one repo-wide `prettier --write .` as an isolated, reviewable formatting-only commit (no logic changes), ideally recorded in `.git-blame-ignore-revs`.
3. Add a CI check (lint + `prettier --check` + tests + typecheck) so the baseline stays clean.
4. Document the standard in the repo README/contributing notes.

### Scope rule for feature branches (including P1 Article Studio 2.0)

- **Only** format newly-added code and directly-edited lines where practical.
- Do **not** run repository-wide prettier, reformat untouched legacy code, or mix baseline cleanup into a feature branch.
- Do **not** claim repo-wide lint is green. Verify changed-file formatting with `npx prettier --check <files>`, not `eslint .`.
