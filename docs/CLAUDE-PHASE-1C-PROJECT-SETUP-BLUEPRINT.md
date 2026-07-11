# Phase 1C — Project Setup from Website Blueprint

> Documentation only. No runtime code, routes, migrations, env vars, or database
> state are changed by this document. Nothing in it is implemented yet.

**Status:** design blueprint (1C.0) — **owner decisions OPEN, see §12** · **Builds on:** Phase 0 (read connector, live), Phase 1 (rev-guarded write foundation), Phase 1A (direct write tools, live-proven and darkened), Phase 1B (pending actions / proposal workflow, live-proven and darkened — chain `200de5b..006eaf8`, smoke evidence `zo5vhtzp` applied / `y1nztpin` rejected) · **Current prod:** `006eaf8`, `MCP_OAUTH_ENABLED=true`, `MCP_WRITE_TOOLS_ENABLED` off/unset, metadata read-only/write-free/propose-free, live Claude.ai read connector untouched.

**One-sentence goal:** let a user hand Claude a website URL and get back a complete, reviewable **project setup proposal** — business profile, services, target audience, locations, competitors, and first opportunities — that the owner approves once in the Milo UI and Milo applies atomically, reusing the entire 1B propose→review→apply machinery with **one new pending-action type and zero new tools, scopes, flags, or endpoints**.

> **Roadmap naming note:** older docs and a comment in `oauth.server.ts` reserved "Phase 1C" for *publish approvals* and the non-issuable `milo.content.publish` scope. The roadmap has since been renumbered — publishing moves to a later phase (Phase 4+). `MCP_PUBLISH_SCOPE` stays reserved and non-issuable; nothing in this phase touches it.

---

## 1. Product principle

- **Same contract as 1B: Claude proposes; the owner disposes.** Claude researches the website and drafts the setup; only the UI-authenticated owner approves, and apply happens in Milo, atomically, after one explicit confirmation.
- **Setup is one decision, so it is one proposal.** 1B deliberately deferred composite proposals; 1C is the deliberate first composite, because "set up this project" is a single coherent owner intent — splitting it into three fragments (fields / services / opportunities) would force three review moments for one decision. The apply stays hand-written, additive/merge-only, and atomic.
- **Claude fills in a project; it does not define one.** Project identity (`name`, `websiteUrl`) and everything operational (publishing connectors, GSC, market/currency/app-language, billing) are owner-only and not expressible in the payload.
- **Hard exclusions unchanged:** no publish, no delete, no settings, no billing — not as a type, not as an apply side-effect.
- **Everything reviewable before it lands:** server-derived preview + a field-level current→proposed diff for project fields, plus explicit "will create N services / N opportunities" lists.
- **Fail dark:** flag off ⇒ the propose tools vanish exactly as today; PRM/AS metadata remain propose-free; the read connector is untouched.

## 2. The Phase 1C flow

1. Owner creates (or already has) a project in Milo with at minimum `name` + `websiteUrl` — a stub is fine (`setupComplete` false). *(Creating brand-new projects from MCP is an open decision, §12.1 — recommended out of scope for the first cut.)*
2. In a Claude.ai chat, the user gives Claude the website (or says "set up my Milo project for X"). Claude reads the project via the existing read tools (`list_projects`, `get_project_brief`), researches the website **with its own web tools** (§4), and drafts the setup.
3. Claude calls `create_pending_action` with `type: "project_setup_proposal"` (flag-on + `milo.actions.propose` scope, as in 1B).
4. The proposal appears in `/app/actions` with a business-profile diff and the create-lists. The owner reviews, optionally against the live site, and **Approve & apply** or **Reject**.
5. On approve, one `mutateWorkspace` mutation merges the project fields, creates the services and opportunities, records `appliedEntityIds`, and transitions the action to `applied`. Audit records every step, content-redacted.

## 3. Data model

### 3.1 One new pending-action type

`PendingActionType` gains `"project_setup_proposal"`. The 1B envelope (`PendingAction` in `types.ts`) is unchanged — `projectId` (must exist at create, re-checked at apply), server-minted id/timestamps, `requestId` dedupe, 14-day lazy expiry, cap 200, payload ≤16KB, preview ≤4KB all apply as-is.

### 3.2 Payload (strictly whitelisted, unknown fields rejected at every level)

```ts
interface ProjectSetupProposalPayload {
  projectFields?: {                      // whitelisted merge onto the target project
    businessName?: string;               // 1..200
    businessType?: string;               // 1..200
    description?: string;                // 1..2000  (the business summary)
    targetAudience?: string;             // 1..500
    toneOfVoice?: string;                // 1..500
    uniqueSellingPoints?: string;        // 1..1000
    brandNotes?: string;                 // 1..1000
    mainLocation?: string;               // 1..120
    targetLocations?: string[];          // ≤10, each 1..120
    primaryLanguage?: Language;          // enum-checked
    additionalLanguages?: Language[];    // ≤3, enum-checked, deduped
    competitorUrls?: string[];           // ≤5, https URLs, each ≤300 — NEW field, §3.3
  };
  services?: Array<{                     // ≤10 — created as ServiceItem rows
    name: string;                        // 1..120
    kind: "Service" | "Product";
    description?: string;                // ≤400
    targetAudience?: string;             // ≤200
    locationRelevance?: string;          // ≤120
    priority?: Priority;                 // enum, default "Medium"
  }>;
  opportunities?: Array<{                // ≤10 — created as Opportunity rows
    title: string;                       // 1..200
    contentType?: ContentType;           // enum, default "Blog Article"
    searchIntent?: SearchIntent;         // enum, default "Informational"
    targetAudience?: string;             // ≤200
    businessValue?: string;              // ≤500 (setup-stage rationale is short by design)
    recommendedCta?: string;             // ≤200
    priority?: Priority;                 // enum, default "Medium"
  }>;
}
```

- **At least one** of the three groups must be present and non-empty.
- **Keywords are not a separate concept** — Milo's model for "what to rank for" is the Opportunity, so keyword research lands as `opportunities[]` (and inside `businessValue` rationales). No new keyword field.
- The 16KB payload cap remains the binding envelope; the per-field bounds above keep a realistic full setup at ~6–10KB. A maximal-everything payload can exceed 16KB → `-32010`, and Claude trims (the tool description says so).
- Validation follows the 1B idiom in `pending-actions.ts` (`str()` bounds, runtime enum mirrors for `Language`/`ContentType`/`SearchIntent`/`Priority`, byte-size cap checked first, unknown keys rejected recursively).

### 3.3 One new optional Project field — `competitorUrls?: string[]`

Today competitor URLs are typed into onboarding, fed to the one-shot competitor-gap analysis, and **not persisted**. 1C adds `competitorUrls?: string[]` (≤5) to `Project` — additive and optional, so no migration and no impact on existing workspaces. It gives the setup proposal a place to land competitors, gives the UI something to show, and gives future competitor-gap runs a stored default. *(Open decision §12.2.)*

### 3.4 Explicitly NOT in the payload

`name`, `websiteUrl`, `setupComplete`, `market`, `currency`, `appLanguage`, `primaryContentLanguage`, `growthGoals`, all publishing/connector fields, `gscLite`/`gscOAuth`, `brandIntelligence`, `onboardingSourceData` — plus, as apply side-effects: no edits or deletions of *existing* services or opportunities (creation only), no status changes to anything already in the workspace.

## 4. Analysis path — where the website intelligence comes from

**Recommendation: Claude-side research, no new server-side fetch surface in 1C.** *(Open decision §12.6.)*

- Claude.ai already has web search/fetch; "Claude researches, Claude analyzes, Claude proposes" is the core operating model, and it produces richer extractions (multiple pages, competitor comparison) than Milo's homepage-only scanner.
- Milo's existing `scanWebsiteFn` (`ai.functions.ts` — `fetchSiteContext` + AI JSON extraction feeding the onboarding wizard) **stays owner-session-only and untouched**. The MCP layer gains no external-fetch capability, so no new SSRF/cost/abuse surface, no new rate-limit design, no crawler policy questions — 1C's entire server-side delta stays inside the proven pending-actions machinery.
- A future `analyze_website` MCP read tool (Milo-side extraction on demand) remains possible later if Claude-side research proves insufficient; deliberately out of scope now.

The `create_pending_action` tool description gains type-specific guidance: research the site first, check the existing project state via `get_project_brief` so the proposal fills gaps rather than blindly overwriting, confirm the draft with the user in chat before proposing, and pass a stable `requestId`.

## 5. MCP tool design — reuse, no new surface

**No new tools, no new scopes, no new flags, no new env vars.** The 1B trio (`create_pending_action`, `list_pending_actions`, `get_pending_action`) carries 1C:

- `PENDING_TYPES` in `mcp.server.ts` gains `"project_setup_proposal"`; the `create_pending_action` input schema's payload branch is extended per §3.2 (server-side re-validation per type, as today).
- Scope stays `milo.actions.propose` (explicit-only, never advertised, amber consent copy unchanged — it already reads "suggestions never apply until you approve them in Milo").
- Gating identical to 1B: flag off ⇒ tools absent + `-32602`; missing scope ⇒ `-32002`; dev tokens excluded; `list`/`get` remain visibility-filtered to the caller's own proposals.
- **Preview derivation** (`derivePendingPreview`) gains a setup renderer: a markdown summary with a *Business profile* section (field → proposed value, truncated), *Services to create (N)*, *Opportunities to create (N)*, *Competitors* — ≤4KB, counts + clipped lists rather than full payload echo.
- **Errors and limits unchanged:** `-32010` validation, `-32011` uniform not-found (unknown project), `-32012` conflict, `-32013` cap; create rides the existing `write` rate bucket (30/h/token), list/get the general bucket.
- **Idempotency:** `requestId` dedupe exactly as 1B — replay returns the same `actionId` + `deduped:true`.

## 6. UI design

Extends `/app/actions` (no new route):

- **Type badge** "Project setup" + risk chip (medium ⇒ amber, per §12.7).
- **Preview:** the server-derived markdown, plus a structured render:
  - *Business profile* — field-level **current → proposed** diff via an extended `pendingActionDiff` (project fields instead of opportunity fields). Fields that would **overwrite** a non-empty current value get an explicit overwrite marker; fields filling an empty value render as plain additions. If the project changed since the proposal was created, show the existing "target has changed since this was suggested" warning.
  - *Services to create* and *Opportunities to create* — additive lists (no diff), with per-item title/kind/priority.
  - *Competitors* — the proposed `competitorUrls` list. **Rendered as plain text, never as clickable links** (proposal content is untrusted input).
- **Controls unchanged:** Approve & apply (AlertDialog confirm), Reject with optional note; pending-only, unexpired-only.
- i18n: en/pl/sv/da `actions.*` keys for the new sections, per house rule.
- Project surface: the existing "Pending actions (N)" card already covers discovery; no new entry point.

## 7. Approval / apply behavior

`resolvePendingActionForWorkspace` gains a `project_setup_proposal` apply branch — same skeleton as 1B (owner-auth via `resolvePendingActionFn`, load-and-check inside `mutateWorkspace`, lazy-expire if past `expiresAt`, re-validate against current state, rev-guarded atomic mutation, fail-closed to `rejected` with `resolution.error` on apply-time validation failure):

1. **Re-validate:** target project still exists; payload still passes §3.2 validation.
2. **Merge `projectFields`** onto the project — whitelisted fields only, overwrite-what's-provided semantics (identical to the 1B opportunity merge; the diff made it reviewable — §12.3).
3. **Create services:** server-minted ids, `projectId` from the envelope, defaults for omitted optionals. **Dedupe by case-insensitive name** against the project's existing services — duplicates are skipped, not errors.
4. **Create opportunities:** server-minted ids, `source: "claude"`, `status: "New"` (§12.4), `language` = project `primaryLanguage`, 1A-parity defaults. **Dedupe by case-insensitive title** against the project's existing opportunities; respect `MAX_OPPORTUNITIES` (overflow items are skipped and counted, not fatal).
5. **Never flips `setupComplete`** (§12.5) — the owner's wizard/setup page remains the authority for declaring setup done.
6. **Resolution record:** `appliedEntityIds` = created service + opportunity ids; `appliedAtRev`; skipped-duplicate counts land in the audit detail (§9), not in owner-visible content.
7. All of the above — field merge, both create-sets, status transition — is **one `mutateWorkspace` call, atomic by construction**; a concurrent owner edit triggers the standard pure-mutation conflict retry.

Reject and expiry behavior are untouched 1B code paths.

## 8. Security and safety

- **Double-gated as ever:** `MCP_WRITE_TOOLS_ENABLED` + `milo.actions.propose`; owner-only resolution in the UI; no MCP approve/apply/reject/cancel tools (unchanged).
- **No new attack surface:** no server-side fetching triggered by MCP (§4), no new endpoint, no new scope, no metadata change — the dark posture and DCR behavior (`invalid_scope` flag-off) are bit-for-bit the 1B posture.
- **Composite ≠ powerful:** the apply branch is hand-written, additive/merge-only; it cannot delete, cannot edit existing services/opportunities, cannot touch excluded fields (§3.4) — a hostile payload can at worst propose ugly text the owner reads and rejects.
- **Untrusted-content discipline:** competitor URLs render as text, never links; all strings length-clipped and trimmed; previews render through the existing safe markdown renderer; payloads are read field-by-field, never interpreted.
- **Overwrite risk is surfaced, not prevented:** the diff marks every non-empty field being overwritten; risk level medium ⇒ amber confirm dialog.
- **Caps:** ≤10 services, ≤10 opportunities, ≤5 competitors per proposal; payload ≤16KB; `pendingActions[]` cap 200; apply respects `MAX_OPPORTUNITIES`.
- **Idempotency and replay:** `requestId` dedupe at create; state-guarded transitions at resolve (double-approve returns the resolved outcome, never applies twice) — plus the apply-side name/title dedupe makes even a *re-proposed and re-approved* setup near-idempotent in effect.
- **Rev safety:** everything through `mutateWorkspace`; stale proposals fail closed with a reason.

## 9. Audit model

Reuses every 1B event type; only the `detail` composition extends (names/ids/counts only — never free text):

| Event | Detail additions for `project_setup_proposal` |
|---|---|
| `mcp_pending_action_created` | `{type:"project_setup_proposal", fieldsChanged: sorted projectField NAMES, serviceCount, opportunityCount, competitorCount}` |
| `pending_action_approved` / `pending_action_applied` | `{appliedEntityIds, appliedAtRev, fieldsChanged, createdServices, createdOpportunities, skippedDuplicates}` |
| `pending_action_rejected` / `pending_action_expired` | unchanged |

`fieldsChanged` intersects with the §3.2 whitelist (the `006eaf8` hardening applies to the new type from day one). **Never in any detail:** field values, titles, names, descriptions, URLs, previews, notes, token material, family ids, client secrets. The 1C smoke re-runs the planted-string probe with setup-specific planted values (business name, service name, opportunity title, competitor URL).

## 10. Implementation phases (small commits, each deployable dark)

| Commit | Scope | Tests |
|---|---|---|
| **1C.0** | This blueprint (docs only) | — |
| **1C.1** | `project_setup_proposal` in `PendingActionType`/`PENDING_ACTION_TYPES`/`RISK_BY_TYPE`; payload interface + strict validator in `pending-actions.ts`; `Project.competitorUrls` in `types.ts` | unit: validator matrix (bounds, enums, unknown keys, byte cap, empty-groups rule) |
| **1C.2** | Server: create-time target check + apply branch in `pending-actions.server.ts` (atomic merge + creates + dedupe + caps); audit detail composition | unit: apply outcomes, dedupe, overflow, fail-closed, conflict retry |
| **1C.3** | MCP: `PENDING_TYPES`, `create_pending_action` schema extension, `derivePendingPreview` setup renderer, tool-description guidance | unit: gating matrix, idempotent replay, preview bounds, audit shape |
| **1C.4** | UI: `pendingActionDiff` project-fields extension + setup card sections in `app.actions.tsx` + overwrite markers + i18n (en/pl/sv/da) | unit: diff/preview helpers; manual review |
| **1C.5** | Smoke runbook doc (house §-format, 1B loopback-DCR pattern) | — |
| **1C.6** | Owner-only smoke window (flag on → propose → inbox → approve + reject paths → audits → flag off dark verification) | live evidence |
| **1C.7** | Results/evidence doc + memory update | — |

Every code commit lands flag-off-invisible on prod (dark deploy, behavioral fingerprint), with the standing env-edit gotcha called out: **verify both flags survive every env change.**

## 11. Acceptance criteria (pass/fail before 1C is "complete")

1. Flag off: unchanged 1B dark posture — tools absent, `-32602` on call, PRM/AS metadata propose-free, propose DCR → `invalid_scope`. Live read connector unaffected throughout (fresh-chat `list_projects` check).
2. Flag on + `milo.actions.propose`: `create_pending_action` with a valid `project_setup_proposal` → pending action visible in DB and inbox with correct preview/diff; unknown field anywhere → `-32010`; bogus project → `-32011`; >10 services / >10 opportunities / >5 competitors / >16KB → `-32010`; verbatim replay → same `actionId` + `deduped:true`.
3. Inbox renders: profile diff with overwrite markers, create-lists, text-only competitor URLs, changed-target warning when the project was edited post-proposal.
4. Owner approve → one atomic rev bump containing field merge + created services + created opportunities + status transition; `appliedEntityIds` complete and correct; duplicates skipped and counted; double-approve cannot double-apply; `setupComplete` untouched; excluded fields (§3.4) untouched.
5. Reject and expiry paths behave exactly as 1B (evidential rows, no deletion).
6. Rev safety: concurrent owner edit during approve → clean retry-apply or fail-closed rejection, never partial (smoke rev accounting).
7. Audit: every transition emits exactly its §9 row; planted-string probe (incl. setup-specific values) → 0 hits; token-material probe → 0 hits; `fieldsChanged` never contains a non-whitelisted key.
8. Full unit suite green; rollback (flag off) leaves proposals and applied setup intact while the tools vanish.

## 12. Owner decisions — OPEN

1. **Target model:** fill an **existing** project only (owner creates a stub with name + URL first) — *recommended* — or also support a create-new-project mode. Create-new relaxes the 1B "projectId must exist" invariant, adds apply-time project minting, and touches `MAX_PROJECTS_PER_USER`; recommended as a later increment only if the stub step proves annoying in practice.
2. **`Project.competitorUrls?: string[]`:** add the field (additive, no migration) — *recommended* — or stash competitors in `onboardingSourceData` (invisible to the UI, dead-ends future competitor-gap reuse).
3. **Overwrite semantics:** provided fields overwrite current values, with explicit overwrite markers in the diff — *recommended* (1B-consistent; review makes it safe) — or a fill-empty-only mode (safer default, but blocks the "improve my thin setup" use case and complicates apply semantics).
4. **New opportunities' status:** `"New"` (enters normal triage flow alongside generated opportunities) — *recommended* — or `"Linked"` (1A `create_project_recommendation` parity).
5. **`setupComplete`:** apply never flips it; the owner finishes/declares setup in the UI — *recommended* — or auto-set when `isProjectSetupComplete()` passes after merge.
6. **Analysis source:** Claude-side web research only, no MCP-triggered server fetch — *recommended* — or add a Milo-side `analyze_website` read tool in 1C (new fetch/cost/abuse surface; deferred).
7. **Risk level:** `medium` (static, per `RISK_BY_TYPE`) — *recommended* — matching `opportunity_update_proposal`; `high` would only add a heavier confirm and isn't warranted for an additive/merge apply.
8. **Composite type confirmed?** One `project_setup_proposal` covering fields + services + opportunities — *recommended* — or split types per fragment (three review moments for one decision; more machinery, no added safety).

---

### Bottom line

Phase 1C turns the proven 1B proposal loop into Milo's first real *workflow*: URL in, reviewed-and-applied project setup out. The entire server-side delta is one pending-action type (validator + apply branch + preview), one optional `Project` field, and inbox rendering — no new tools, scopes, flags, endpoints, or fetch surfaces, so the security posture, dark posture, and smoke methodology carry over from 1B verbatim. The recommended first cut (fill an existing stub project, Claude-side research, composite proposal) is small enough to build and deploy dark in one session and proves the composite-apply pattern that Phases 2 and 3 (audit findings → opportunity batches, content calendars) will reuse.
