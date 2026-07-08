# Milo Claude Action Connector v1 — Technical/Product Blueprint

> Status: **proposal for review — documentation only. No code, no deploy,
> `MCP_OAUTH_ENABLED` stays off.**
> Builds on the verified read-only OAuth connector (E2E passed 2026-07-08,
> commit `afe91c34`).
> Companion docs: `docs/CLAUDE-OAUTH-CONNECTOR-BLUEPRINT.md`,
> `docs/CLAUDE-OAUTH-E2E-READINESS.md`.

## 0. Executive summary

The goal is to let Claude *operate* Milo — set up projects, write briefs, create opportunities and drafts, run audits — while keeping a hard line: **Claude produces drafts and staged changes; humans approve anything that leaves Milo.** External publishing execution is explicitly out of v1.

Two architectural facts dominate the design (found by inspection, §1):

1. **The workspace is one client-owned JSONB blob.** Every AI server function (`generateOpportunitiesFn`, `generateContentAssetFn`, `improveContentDraftFn`, …) is a *stateless generator* — it returns data, and the **client** store persists it by debounce-upserting the entire `workspaces.data` blob (`store.ts`). There is no server-side write path today. If the MCP server writes the blob while the user has the app open, the client's next whole-blob save **silently clobbers the MCP write** (last writer wins). Action tools therefore require a **server-side write layer with optimistic concurrency** before the first write tool ships.
2. **The generators we need already exist.** Website scan (`scanWebsiteFn`), opportunities, calendar, content generation (9 asset types), metadata/FAQ/CTA regeneration, Milo Score (`evaluateContentQualityFn`), draft improvement (`improveContentDraftFn`), and audits are all server functions. The action connector is mostly *plumbing + governance*: expose them as MCP tools, persist results server-side safely, meter them, and log them.

---

## 1. Current-state inventory (verified in code)

**MCP read tools (8, `src/lib/mcp.server.ts`):** `list_projects`, `get_project_brief`, `list_opportunities`, `list_content`, `get_content`, `get_latest_audit`, `get_gsc_summary`, `list_authority_opportunities`. Scope map in `TOOL_SCOPES`; `toolAllowed()` enforces per-call; `tools/list` filters; legacy dev tokens = full read (`scopes: null`).

**AI server functions (`src/lib/ai.functions.ts`, all auth-gated, all return-only):**

| Function | What it does | Cost profile |
|---|---|---|
| `scanWebsiteFn` | Fetch homepage (`fetchSiteContext`: http/https only, 8s timeout, ≤5 internal links) → extract business profile + services | 1 fetch + 1 AI call |
| `generateOpportunitiesFn` / `generateCalendarFn` | SEO opportunities / content calendar | 1 AI call each |
| `generateContentAssetFn` / `generateContentFn` | Full content asset (9 types) | 1 large AI call |
| `regenerateMetadataFn` / `regenerateFaqFn` / `regenerateCtaFn` | Partial regeneration | 1 small AI call |
| `evaluateContentQualityFn` | Milo Score | 1 AI call |
| `improveContentDraftFn` | Improve existing draft | 1 large AI call |
| `generateAuditFn` / `generateCompetitorGapFn` / `generateAuthorityFn` / `generateAiVisibilityFn` / `generateAuthorityOpportunitiesFn` | Module analyses | 1–4 fetches + 1 AI call |

**Publishing (`src/lib/publish.functions.ts`):** `publishContentFn` (draft to client site) and `publishLiveFn` — secret in `x-milo-publish-secret` header, per-project endpoints, modes draftOnly/manualLive/autoPublishApproved. These are the **danger surface**; they push content to external websites.

**Persistence model:** client store (`src/lib/store.ts`) mutates in-memory arrays (`projects/services/opportunities/calendar/content/audits/authorityOpportunities/…`) → debounced whole-blob upsert. Content has statuses (Draft/In Review/Approved/Rejected) and publish state machines already — ideal hooks for draft-only tooling.

**Existing OAuth surface:** consent fns only (`getConsentRequestFn`, `approve/denyOAuthConsentFn`). No connected-apps list/revoke, no refresh tokens, no `/api/oauth/revoke` (advertised in metadata but 404), fire-and-forget audit-write bug (`task_3a036b52`, partially manifests: `mcp_call` rows persisted in E2E, `last_used_at` never did).

**Gap summary:** no server-side workspace writer, no write scopes, no rate limiting, no connected-apps/activity UI, no SSRF guard on `fetchSiteContext` beyond protocol check (fine today when only the owner triggers it; must harden before Claude can pass arbitrary URLs).

---

## 2. What is safe to expose as write tools in v1

**Safe (drafts and internal state only, reversible, human-reviewable):**

- Create/update **project brief fields** and **services** (Claude fills what the user dictated or the scan found).
- Create a **project** (empty shell + brief; capped by the existing project-cap logic).
- Create **opportunities** (status `New`/`Linked` — already designed to be regenerable/deletable in-app).
- Create/improve **content drafts** (status forced to `Draft`, flagged as Claude-created; never Approved by a tool).
- Run **website scan, Milo Score, audits** (compute + persist results; read-only toward the outside world, but costs money → metered).
- **Prepare a publishing package** (assemble slug/destination/metadata/markdown into a staged, in-Milo object).

**Not safe for v1 (excluded):**

- `publishContentFn` / `publishLiveFn` execution (writes to external client websites).
- Any **status promotion** to Approved (that's the human gate that `autoPublishApproved` mode fires on — a Claude tool that approves content is a publish tool in disguise).
- Any **delete** (opportunities, content, projects, services).
- Publishing **settings** (endpoints/secrets), billing, connections/tokens, analytics, GSC imports, user/account data.

---

## 3. Phased tool set

Tool names are `verb_noun`; all new tools carry MCP annotations (`readOnlyHint:false`, `destructiveHint:false`, `idempotentHint` where true) so Claude clients render confirmation UX correctly.

**A. Setup tools (Phase 1)**

- `create_project` — name, websiteUrl, market, language → new project shell (respects project cap). Idempotent-ish via client-supplied `requestId` dedup.
- `update_project_brief` — partial update of whitelisted brief fields only (businessName, businessType, description, audience, tone, USPs, locations, market, language). Never touches publishing/billing/connector fields.
- `upsert_services` — add/update service items (no delete; max N per call).
- `scan_website` — runs `scanWebsiteFn`, returns extraction, does **not** auto-apply (Claude then calls `update_project_brief` with what the user confirmed in chat).

**B. Planning tools (Phase 2)**

- `create_opportunities` — insert 1–10 opportunities (status `Linked`, `source:"claude"` added to the `OpportunitySource` union so regeneration never wipes them).
- `generate_opportunities` — run the existing generator and stage the results (metered).
- `update_opportunity_status` — only transitions `New ↔ Linked` and `→ Dismissed`… **recommendation: defer status changes; v1 = create only.**

**C. Content draft tools (Phase 3)**

- `create_content_draft` — run `generateContentAssetFn`/`generateContentFn` for an opportunity or a free brief; persist with status `Draft`, `origin:"claude"`.
- `improve_content_draft` — run `improveContentDraftFn` on an existing Draft/In Review asset; persists as a **new revision** of the draft (keep previous markdown in a `previousVersions[]` cap-3 list so a bad improvement is recoverable — the no-delete rule needs an undo story).
- `update_content_metadata` — meta title/description/slug/FAQ/CTA edits (regeneration fns or direct values), Draft/In Review assets only.

**D. Audit/scoring tools (Phase 4)**

- `run_site_audit` — `generateAuditFn` + persist result (metered, rate-limited).
- `score_content` — `evaluateContentQualityFn` + persist Milo Score (metered).
- (Optional later: `run_authority_analysis`, `run_ai_visibility_analysis` — same pattern, higher cost.)

**E. Publishing preparation tools (Phase 5)**

- `prepare_publish_package` — validates asset (must be In Review/Approved *by a human*, Milo Score present, project has publishing configured), assembles `{assetId, destinationType, slug, metaTitle, metaDescription, checklist}` into a **staged package row** with status `awaiting_user_approval`. Returns a deep link to Milo's review UI. **Does not POST anywhere.**
- `get_publish_package_status` — read-back.

**F. Publishing execution tools (post-v1, Phase 6 — design only)**

- `execute_publish_draft` / `execute_publish_live` — only ever run against a package the user approved **inside Milo** (approval recorded server-side with timestamp + user id; chat-level "yes" is not sufficient). Not shipped in v1.

---

## 4. OAuth scopes

**Existing read scopes (unchanged):** `milo.projects.read`, `milo.content.read`, `milo.insights.read`, `milo.authority.read`.

**New safe write scopes (v1):**

| Scope | Tools | Consent label |
|---|---|---|
| `milo.projects.write` | create_project, update_project_brief, upsert_services, scan_website | "Create projects and update your project brief" |
| `milo.opportunities.write` | create_opportunities, generate_opportunities | "Add growth opportunities" |
| `milo.content.write` | create_content_draft, improve_content_draft, update_content_metadata | "Create and improve content drafts (drafts only — never published)" |
| `milo.audits.run` | run_site_audit, score_content | "Run audits and content scoring (uses your AI credits)" |
| `milo.publish.prepare` | prepare_publish_package, get_publish_package_status | "Prepare publishing packages for your approval" |

**Dangerous scopes (defined in the model, NOT issuable in v1; token endpoint rejects them):**

- `milo.publish.execute` — Phase 6 only, per-project grant, short TTL, requires in-app approval flow.
- `milo.content.approve` — probably never; approval should stay a human UI action.

**Scopes that must not exist (never define, so they can never be granted):**

- Any `*.delete` scope.
- `milo.settings.*` / `milo.billing.*` / `milo.connections.*` (publishing endpoints & secrets, tokens, OAuth clients, billing).
- `milo.analytics.write`, `milo.gsc.write`, `milo.users.*`.
- A wildcard `milo.write` umbrella — every write grant is enumerated.

Consent screen gains a second section: read scopes as today, write scopes visually distinct (amber), and the "Claude will NOT be able to" list updated: *"publish anything to your website · approve content · delete anything · change publishing, billing or connection settings."*

---

## 5. Confirmation rules

MCP has no server-initiated confirmation channel, so confirmation is layered: (a) tool annotations + descriptions instruct the Claude client to confirm, (b) the Milo server enforces what a tool *can't* do regardless of chat, (c) the Milo UI is the only place terminal approvals happen.

| Tier | Tools | Rule |
|---|---|---|
| **Auto-run** | all 8 read tools, `get_publish_package_status` | No confirmation. `readOnlyHint:true`. |
| **Chat-confirm** (Claude asks in conversation; description says "confirm with the user before calling") | `update_project_brief`, `upsert_services`, `create_opportunities`, `update_content_metadata` | Cheap, reversible, internal. Server still validates + logs. |
| **Chat-confirm + metered** | `scan_website`, `generate_opportunities`, `create_content_draft`, `improve_content_draft`, `run_site_audit`, `score_content`, `create_project` | Spends AI credits or creates top-level objects → rate-limited server-side (§7), so a runaway conversation is bounded even if the client under-confirms. |
| **Draft-only enforced** | all content tools | Server forces `status:"Draft"`, `origin:"claude"`; transitions to In Review/Approved are rejected at the tool layer, full stop. |
| **In-app approval required** | `prepare_publish_package` output | The package is inert until the user clicks Approve in Milo's review queue. No MCP tool can consume an unapproved package. |
| **Not exposed** | publish execution, deletes, approvals, settings | No tool, no scope, no code path in v1. |

---

## 6. Audit logging requirements (every write)

Prerequisite: **Phase 0 fixes the fire-and-forget bug** — Workers terminates the isolate after the response, so audit inserts must be awaited before responding or passed to `ctx.waitUntil`/nitro's `event.waitUntil`. E2E showed `mcp_call` rows *can* persist but `last_used_at` didn't; make both deterministic and add a regression test.

Every write tool logs to `oauth_audit_log` (extended `detail` contract), written **synchronously before the tool returns success**:

- `event`: `mcp_write` (plus existing `mcp_call`/`mcp_denied` for reads/scope failures) and `mcp_rate_limited`.
- `detail` (no content bodies, no secrets): `tool`, `projectId`, `entityType`, `entityIds[]`, `action` (`create|update|stage`), `fieldsChanged[]` (names only), `payloadHash` (SHA-256 of canonicalized input), `resultHash`, `requestId` (client-supplied idempotency key), `tokenId`, `client_id`, `scopeUsed`, `aiCreditsUsed` (if metered), `durationMs`.
- Failures log too (`ok:false` + error class, not message internals).
- Retention: 90 days minimum; rows power the user-facing Activity Log (§9), so shape them for display from day one.
- Invariant tested in CI: *a write that isn't logged doesn't commit* — wrap the workspace write + audit insert so a failed audit insert fails the tool (accept the strictness for v1).

---

## 7. Rate limits and cost limits (audit/scoring/generation)

New `oauth_rate_limits` counter table (token-scoped + user-scoped windows), checked server-side before executing metered tools:

| Tool class | Per-token limit | Per-user daily cap | Rationale |
|---|---|---|---|
| `run_site_audit` | 1 / project / hour | 5 | multi-fetch + big AI call |
| `score_content` | 10 / hour | 40 | 1 AI call each |
| `create_content_draft` / `improve_content_draft` | 4 / hour | 15 | largest AI calls |
| `generate_opportunities` / `scan_website` | 4 / hour | 15 | fetch + AI |
| Non-AI writes (brief, services, opportunities, metadata) | 30 / hour | 200 | abuse guard only |
| `create_project` | 2 / day | 3 | cap pressure + spam |
| All writes global | 60 / hour / token | — | circuit breaker |

Over-limit → JSON-RPC error `-32003` ("Rate limit reached for this tool — try again later") + `mcp_rate_limited` audit row. Limits are config constants (env-tunable), evaluated against the DB (not memory — Workers isolates don't share state). Additionally a **monthly AI-spend soft ceiling per user** (estimate per tool class; when exceeded, metered tools return a friendly "AI budget reached" error) so a connector can never drain the Lovable gateway balance unattended. Also rate-limit `/api/oauth/register` and `/token` in the same phase (carried over from the readiness doc's launch blockers).

---

## 8. Data validation (enforced server-side in every write tool)

- **Ownership/workspace scope:** all reads and writes go through the resolved grant's `user_id` → their single workspace row, same as today. `projectId`/`opportunityId`/`contentId` must exist **inside that blob** or the tool errors — IDs from other users can never resolve. No cross-workspace parameter exists on any tool.
- **Workspace write safety (new, prerequisite):** add `rev integer` to `workspaces`. Server writes are read-modify-write with `UPDATE … SET data=…, rev=rev+1 WHERE user_id=… AND rev=<read rev>` (retry ×3 on conflict). Client `saveWorkspaceNow` sends its last-seen `rev`; on mismatch it re-fetches and re-applies its delta (or, minimal v1: re-hydrates and replays the in-memory action queue). **This closes the clobber hazard and must ship before the first write tool.**
- **URL validation** (`scan_website`, `create_project.websiteUrl`, `run_site_audit`): http/https only (exists), plus new SSRF guard — reject IP-literal hosts, localhost, `.internal`/`.local`, RFC-1918/link-local ranges after DNS-shape check; cap redirects; keep 8s timeout; response size cap. Applied inside `fetchSiteContext` so the app benefits too.
- **Content length limits:** markdown ≤ 60 KB, meta title ≤ 70 chars, meta description ≤ 320, title ≤ 200, ≤ 20 FAQ items, ≤ 10 services/call, ≤ 10 opportunities/call, total tool payload ≤ 128 KB. Reuse the existing `cleanString`-style clipping + loose-zod pattern that already works in this codebase.
- **Field whitelists:** `update_project_brief` accepts only the enumerated brief fields; unknown keys rejected (not ignored) so scope creep is visible.
- **No delete actions:** no tool removes anything. "Improve" creates revisions (§3C). Arrays only grow or update-in-place by id.
- **Idempotency:** every write accepts optional `requestId`; a repeated `requestId` (per token, 24h) returns the original result instead of duplicating — protects against Claude retries.
- **Status invariants:** content writes may only produce/modify `Draft` (or In Review → metadata edits only); publish-state fields (`publishStatus`, `liveUrl`, …) are never writable by any tool.

---

## 9. UI/UX changes in Milo

1. **Connected apps** (Settings or Project Setup, alongside `ClaudeConnectorCard`): list active OAuth grants — client name, scopes (read vs write badges), connected date, last used (works after Phase 0), token expiry. Backed by new `getConnectedAppsFn`/`revokeConnectedAppFn` + the missing `/api/oauth/revoke` (RFC 7009) so both Milo UI and Claude can revoke. *(This plus refresh tokens are the already-identified launch blockers — they ride in Phase 0/1.)*
2. **Permissions display:** consent screen gets the write-scope section (§4); connected-apps rows expand to show the exact can/cannot list per grant.
3. **Revoke:** one click → sets `revoked_at`, kills the token family; verified pattern already exists for dev tokens.
4. **Activity log** (`/app/activity` or a card): human-readable feed from `oauth_audit_log` — "Claude created draft 'X' (2 min ago)", "Claude ran a site audit", "Rate limit hit". Filter by project/tool/date. This is the trust surface that makes write access acceptable.
5. **Draft review queue:** filtered views + badges — content list shows an "AI-created via Claude" origin badge (`origin:"claude"`); a "Needs review" filter (Draft + origin claude); publish-package review card (package details, diff-style preview, Approve/Reject buttons — Approve is what Phase 6 execution would key off).
6. **Editor affordances:** revision history dropdown for Claude-improved drafts (from `previousVersions[]`), one-click restore.

---

## 10–11. Implementation phases (tools · scopes · DB · tests · risks · rollback)

Global rollback posture, all phases: everything remains behind `MCP_OAUTH_ENABLED`, plus a new **`MCP_WRITE_TOOLS_ENABLED`** second flag (off = action tools absent from `tools/list`, scopes not issuable, connector degrades to today's read-only). Migrations stay additive.

### Phase 0 — Trust foundation (audit persistence + revoke + connected apps + refresh)

- *Tools:* none new.
- *Fixes/features:* `waitUntil`/awaited audit + `last_used_at` writes (`task_3a036b52`); refresh tokens (rotation + reuse-detection → family revoke, per original blueprint §3 — columns already exist); `/api/oauth/revoke`; `getConnectedAppsFn`/`revokeConnectedAppFn` + connected-apps UI; rate limiting on `/register`/`/token`.
- *Scopes:* re-advertise `offline_access` (+ `refresh_token` grant) once implemented.
- *DB:* `oauth_rate_limits` table; no schema change for refresh (columns exist).
- *Tests:* audit rows + `last_used_at` persist deterministically under Workers; refresh rotation + reuse→family-revoke; revoke → immediate 401; connected-apps list accuracy.
- *Risks:* refresh-token theft (mitigated by rotation/reuse detection); awaited audit writes add latency (~1 DB insert per call — acceptable).
- *Rollback:* flag off; refresh code inert without OAuth surface.

### Phase 1 — Workspace write layer + project brief tools

- *Tools:* `create_project`, `update_project_brief`, `upsert_services`, `scan_website`.
- *Scopes:* `milo.projects.write`.
- *DB:* `workspaces.rev` column; client save sends rev (small client change + conflict re-hydrate path). New `workspace.server.ts` (server read-modify-write with rev retry).
- *Tests:* concurrent client-save vs MCP-write (no clobber, both survive); rev conflict retry; field whitelist rejection; SSRF guard cases (localhost, 10.x, IP literal, redirect chain); project cap respected; idempotent `requestId`.
- *Risks:* **highest-risk phase architecturally** (concurrency model); brief overwrite of user-entered data → mitigate with `fieldsChanged` audit + activity log before enabling for others.
- *Rollback:* `MCP_WRITE_TOOLS_ENABLED` off; `rev` column is harmless if unused.

### Phase 2 — Opportunity tools

- *Tools:* `create_opportunities`, `generate_opportunities`.
- *Scopes:* `milo.opportunities.write`.
- *DB:* none (blob arrays; `source:"claude"` union member).
- *Tests:* status `Linked` (regeneration never wipes), per-call cap 10, dedup vs `requestId`, rate limits.
- *Risks:* low — opportunities are cheap, deletable in-app.
- *Rollback:* flag off; created rows remain (user-deletable in UI).

### Phase 3 — Content draft tools

- *Tools:* `create_content_draft`, `improve_content_draft`, `update_content_metadata`.
- *Scopes:* `milo.content.write`.
- *DB:* none structural; `ContentAsset` gains `origin`, `previousVersions[]` (blob-level, additive).
- *Tests:* status forced Draft; approve-transition rejected; revision push/restore; length caps; improve on Approved asset rejected; Milo Score untouched unless re-scored.
- *Risks:* content quality/brand safety (mitigated: drafts only + Brand Intelligence context already feeds generators + review queue); AI cost (metered).
- *Rollback:* flag off; drafts remain as reviewable/deletable assets.

### Phase 4 — Audit/scoring trigger tools

- *Tools:* `run_site_audit`, `score_content`.
- *Scopes:* `milo.audits.run`.
- *DB:* none (results into blob as today).
- *Tests:* rate limits enforced (the main test surface); audit persisted equals in-app run; spend ceiling behavior.
- *Risks:* cost abuse (rate limits + monthly ceiling); SSRF via audit URL (guard from Phase 1 reused).
- *Rollback:* flag off.

### Phase 5 — Publish package preparation

- *Tools:* `prepare_publish_package`, `get_publish_package_status`.
- *Scopes:* `milo.publish.prepare`.
- *DB:* `publish_packages` table (service-role only, RLS on, no client policies — read via server fn): id, user_id, project_id, asset_id, payload jsonb, status `awaiting_user_approval|approved|rejected|expired`, created_by_client_id, approved_at/by, expires_at (~7d).
- *Tests:* package for un-reviewed asset rejected; package never triggers `publishContentFn`; approval only via authed in-app fn; expiry.
- *Risks:* users mistaking "prepared" for "published" → explicit copy ("Nothing has been sent to your website").
- *Rollback:* flag off; table inert.

### Phase 6 — Approved publishing execution (post-v1, separate go/no-go)

- *Tools:* `execute_publish_draft` (execute-live later still).
- *Scopes:* `milo.publish.execute` — issuable only after a dedicated re-consent, ideally per-project.
- *DB:* package approval audit columns.
- *Tests:* execution without approved package impossible; approval revocation; idempotent re-execution (existing connector upserts by slug — verified in Publishing v1 E2E).
- *Risks:* highest — external side effects; gate behind its own flag and an owner-only window like the OAuth E2E.
- *Rollback:* scope revocation + flag; packages revert to prepared.

---

## 12. Recommended safest first slice

**Ship Phase 0, then Phase 1 with exactly two write tools: `update_project_brief` + `upsert_services` (defer `create_project` and `scan_website` within Phase 1).**

Rationale:

- Phase 0 is non-negotiable groundwork: you cannot give an agent write access while audit logging is unreliable and the user has no way to see or revoke the grant. It also clears three of the four already-known launch blockers (refresh, revoke, connected-apps) in one motion.
- `update_project_brief`/`upsert_services` are the smallest writes that prove the entire new machinery — server write layer with rev-based concurrency, write scopes, consent UX for writes, chat-confirm flow, audit trail, activity log — on data that is low-stakes, fully visible in Project Setup, and trivially correctable by hand. No AI spend, no external effects, no new top-level objects.
- `create_project` adds cap/ownership edge cases and `scan_website` adds the SSRF surface; both slot in a week later once the write layer is proven. Everything after that is repetition of a validated pattern with rising stakes.

**Suggested v1 definition of done:** Phases 0–3 + the UI in §9 = "Claude can set up and draft in Milo, humans approve everything" — with Phases 4–5 as fast-follows and Phase 6 explicitly a separate product decision.
