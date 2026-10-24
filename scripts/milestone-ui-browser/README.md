# First-milestone local browser fixture

This **loopback-only** fixture mounts the real current route components for pricing, Setup, Today, Editor and Analytics in actual React, using the real Radix controls and compiled source Tailwind styles. It never starts the application server or loads `.env`. All workspace data is synthetic and lives in page memory.

## Build and open

From the isolated implementation checkout:

```sh
node scripts/milestone-ui-browser/build.cjs
python3 -m http.server 8766 --bind 127.0.0.1 --directory /tmp/milo-milestone-ui-browser
```

Open `http://127.0.0.1:8766/`. Reuse the parent's existing static server on that port if running; do not start a competing listener. Stop that dedicated static server after review. Build output is outside the repository; rebuild whenever source authors finish another UI change. `build-info.json` records time, source root and limitations; `metafile.json` records bundled inputs. No dependency installation is needed.

Optional finite render smoke, with no browser or services:

```sh
node scripts/milestone-ui-browser/build.cjs --ssr-smoke
```

This checks nine renders across the five actual route components and five Today scenarios. It also checks the synthetic approval adapter against the actual publication-version algorithm and primary-action helper: needed, current, stale after an edit, explicitly stale, unavailable and explicit approval write. Fetch denial and unsupported-operation refusal are asserted. It does not run React effects or interactions and is not a substitute for browser review. The smoke writes only `smoke.cjs`, leaving a currently open browser bundle unchanged. Rebuild normally afterwards if testing freshly changed source in the browser.

## Controls and inspection

- Top buttons select actual route components: **pricing**, **setup**, **today**, **editor**, **analytics**.
- Scenario selector resets memory to **ready**, **review**, **draft**, **armed**, **blocked**, or **empty**. Ready is approved but has no schedule or live publication. Armed has a future pending schedule. Blocked has a synthetic failed schedule.
- **Publication approval** selects **needed**, **current**, **stale**, or **unavailable** and resets the fixture. This is independent of editorial status: the ready scenario starts with `status: Approved` in all four modes. Current creates a synthetic receipt with the actual `publicationVersion` and `buildActiveInternalPaths` helpers for the reset-time asset and project. The existing mocked `readPublicationApprovalFn` is its only UI read. The receipt is calculated once and reused, so an edit never silently receives new approval. Stale hashes an earlier title. Unavailable rejects the read. These are local fixtures, not server-owned approval records.
- UI language selects EN/PL/SV/DA; every reset starts the project with conflicting historical language values (`primaryLanguage: English`, `primaryContentLanguage: sv`). Setup must show the real resolver's effective language and only explicit save should synchronize the pair.
- **Intent log** shows navigation, store edits, mock calls, errors and denied network attempts. `window.miloFixture.snapshot()` provides complete synthetic state, approval receipts and logs. `window.miloFixture.failSave=true` injects a fixture save refusal; `failRead=true` refuses fixture reload. These flags do not simulate real PostgreSQL or complete persistence behavior.
- **Reset fixture** discards only in-memory edits. **Clear log** clears fixture diagnostics.
- Route links always prevent real navigation. Supported fixture screens switch locally; other links, including `/auth?mode=register`, record the exact `to`/`search` intent without following it.

## Suggested checks

1. Pricing: click Start free preview and inspect navigation intent for `mode: register`; explicit signin intent remains separate. This is the real pricing CTA and synthetic router, not an actual signup/email/OAuth journey.
2. Setup: count content-language controls, confirm Swedish is effective, change it and save. Inspect `updateProject` patch for synchronized compatibility fields and unchanged unrelated settings. Verify interface language remains a separate selection. No actual provider setup button is supported.
3. Today: ready shows actual available work; review shows review work; armed keeps real scheduled wording; blocked remains actionable; only empty shows an empty state. Follow its real primary link and inspect destination intent.
4. Editor: choose ready + needed; the saved Approved article should show **Approve**. Choose current; after the existing approval read resolves, the main action should be **Review publication**. Stale and unavailable must not imply current approval. Starting in current, edit the title: the main action becomes **Save**; after saving, approval is needed until explicitly approved again. Inspect the intent log for finite reads and for no automatic `setPublicationApprovalFn`, schedule or publish call. Actual title/body/form/toolbars, menus, approval-status component, checklist, assembler and preview run. Save/approval handlers run against synthetic adapters. Scheduling/publishing/generation is deliberately refused, even though the UI can expose its entry point. Check the visual hierarchy, keyboard focus, 375px overflow and dirty text preservation. Do not interpret synthetic approval as server authorization proof.
5. Analytics: actual route metric layout and actual `LogEvidencePanel` run. Tracking metrics are fabricated and the GSC section is explicitly a stub. Verify the raw importer is hidden under its intended disclosure, opens by keyboard and can close without losing the page. No tracking install, sync or real import occurs.

## Explicit fixture boundaries

- **Store** is a small in-memory adapter; it exercises the route's edit/save/merge calls but does not test real autosave, database revision conflicts, persistence after page reload, entitlements or server policy. Existing unit tests and `scripts/requested-asset-browser` cover the real store/recovery separately.
- **Router** exposes real route definitions and records navigation rather than using full TanStack routing/hydration.
- **Auth** is a synthetic owner. This does not prove team permissions.
- **Server functions and generation layer** are replaced at bundle resolution. Analytics/log reads and approval receipts have explicit synthetic responses; unsupported calls throw. Schedule intent is logged and refused; no real queue/publication exists.
- **Shared AppShell** is a minimal fixture wrapper. This harness does not verify actual sidebar/header wiring. **GscLiteSection** is a labelled synthetic card. WeeklyPreparationPanel, BrandIntelligenceCard, ClaudeConnectorCard, EditorialLesson, CreateContentDialog and MiloScorePanel are visibly labelled placeholders. They are unchanged heavy subsidiary features, not the controls under this milestone's review.
- Actual `PublicationApprovalStatus`, `PublishingChecklist`, `LogEvidencePanel`, editor fields and route JSX are retained. Fonts use system fallbacks; source colors/spacing/layout/utilities are compiled locally. Product glyphs and actual Radix behavior are included.
- The builder refuses any real Supabase integration or `.server.ts` module reaching the bundle and independently checks the bundle input inventory. It writes no source files, reads no `.env`, uses no credentials and starts no application server. Runtime `fetch` (including the Node smoke global), XHR, WebSocket, EventSource, sendBeacon and `window.open` are denied. HTML CSP has `connect-src 'none'`, same-origin asset/frame restrictions and `form-action 'none'`. Non-blob, non-fragment anchor clicks are intercepted; synthetic router links never follow the destination. Clipboard writes are logged as intents without changing the system clipboard. Local blob downloads/preview remain available. No service worker is created. Run it only on the dedicated loopback origin with synthetic data; these controls are fixture boundaries, not a general-purpose sandbox.

Fixture changes are limited to `scripts/milestone-ui-browser/`; the builder consumes but never rewrites product source. Diagnostics subscribe separately from route mounting, and the memory store retains shallow-equal selector results. Those adapters prevent logging and newly allocated filtered arrays from driving artificial editor effect loops.

This is local interaction evidence with synthetic data, never production/customer acceptance. Do not deploy the fixture or use it to operate the existing overnight test.
