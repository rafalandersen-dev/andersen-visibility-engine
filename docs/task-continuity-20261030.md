# CG-02A — exact task and asset continuity (30 October 2026)

**Context**

- **Author and base:** Claude, the same implementation author, using the existing Claude Desktop subscription (the app now labels it Ultra; no plan was changed for this work). Base `881a422d`, branch `codex/milo-task-continuity-20261030`.
- **State:** working tree only. Nothing has been committed, pushed, deployed or published.
- **Ownership:** Codex owns independent review, browser acceptance, PR, CI and release.
- **Scope:** a continuity repair within CG-02, not all of CG-02.
- **Unchanged:** provider executions, approval/publication contracts, schemas, migrations, budgets (USD50/month AI, manual Free grants), accounts, permissions, integrations and observers. The WordPress/Shopify duplicate guards are also unchanged. No dependency was added.

## Behaviour

1. **Finding pin → exact Plan task.**
   - `CitationForwardPanel`'s `onOpenPlan` now receives the pinned task's id, and `app.citation-review` opens `/app/plan?selected=<id>`.
   - A deleted pin's Plan control is disabled. An archived pin still opens Plan, which explains it (see 4).
2. **Editor selection = URL.**
   - In `app.editor`, an explicit `?id=` is the selection.
   - Choosing a draft in the sidebar pushes `?id=` through the router, so reload and Back/Forward show the draft the URL names. `aria-current` marks it.
   - The old `search.id` follow-effect is gone, so there is no local copy for the URL to undo and no history loop.
   - **Delete:** deleting the open draft moves the URL first (a replace, to the next draft or the bare URL), then deletes. The requested-asset recovery therefore never starts a reload for an id being deleted.
   - **Fail-closed:** an explicitly requested missing or other-project id still fails closed (`useRequestedAsset` is unchanged) and is never substituted.
3. **Back to task.**
   - The editor's source line gains a secondary **Back to task** link to `/app/plan?selected=<task>`.
   - It appears only when `taskTarget` (`src/lib/task-continuity.ts`) proves all of the following:
     - the signed-in actor's own hydrated workspace (`store.userId` equals the actor) holds that task;
     - the task is in the draft's project, and that is the project Plan shows;
     - the task is not deleted.
   - A missing, deleted, other-project, stale-user or pre-hydration source gets no link.
   - While the form has unsaved changes, the link is shown inactive with "Save your changes before going back to the task."
   - Navigation never consents, approves, publishes, schedules, generates, writes or reports a save.
4. **Plan explains instead of substituting.**
   - When `?selected=` names a task its list does not render, `planSelectionNotice` decides:
     - **Archived task:** an archived notice with **Show archived**, which selects that task in the Archived view.
     - **Deleted, other-project or unknown task:** an unavailable notice.
   - Both notices say no other task was selected.
   - **No notice:** before this actor's workspace is hydrated, or when an active task is hidden only by the owner's own search or Archived toggle.
   - Plan's archive rule (`archived` or `Discarded`) is reused, so the resolver and the list agree.

**Codex R1 correction (stale default).**

- `editorSelection` replaces the held `defaultId`. The bare-URL default is kept while its asset exists, so reorders and new drafts never swap the open draft.
- Once that asset is gone (deleted here or elsewhere, or a pre-hydration placeholder), the default moves to the first remaining asset. A route effect re-holds it.
- The unreachable "clear" branch was removed.

**Dirty work: what is and isn't protected.** The new Back to task link is gated on unsaved changes. The sidebar, AppShell navigation and SPA Back/Forward still do not block an unsaved form, exactly as at base; only `beforeunload` covers unload. No universal unsaved-navigation protection is claimed.

## Internationalisation

**New namespace.** `taskContinuity.*` lives in `src/i18n/task-continuity.ts`: five keys with English, Polish, Swedish and Danish text, registered last in the central catalog.

**Staged locales.** Following the CG-01A pattern:

- `src/i18n/staged/task-continuity-fallback.ts` and its test resolve exactly these 5 keys to the reviewed English source, as declared fallback pending translation. This is not a translation or readiness claim.
- One `task continuity` batch was added to each of the 20 aggregators, with fingerprint `fd3a25a3…66da`; German records it in `de-source.ts`.
- The staged total moved from 4710 to 4715 in the 15 locale tests and `billing-screen-fallback.test.ts`.
- The five unchanged-English suites (ga, mt, lt, lv, ro) each gained an exact 5-key partition.
- No language was activated, and no other key changed.

Codex accepted this i18n stage in review R1.

## Browser fixture

`scripts/task-continuity-browser/` (see its README) mounts the actual citation-review, Plan and Editor routes under a real TanStack router on hash history. It uses:

- a synthetic store that keeps the real selector contract;
- a synthetic actor;
- generated stubs for every server function: reads get synthetic answers, anything else is refused and recorded;
- refusal of Supabase and `.server.ts` modules at build time;
- an inlined strict network guard and CSP `connect-src 'none'`.

It has six variants: `ready`, `sole`, `backbare`, `unhydrated`, `stale` and `empty`. With `check=1` it runs a scripted journey through the real controls, including one real page reload (all variants except `sole` and `empty`). It reports the network attempts and server calls, plus every store write with its payload, order, page, step and confirmation phase, from both sides of the reload.

**Fixture correction R2 (Codex), fixture and doc only; all `src` files unchanged since R1:**

- **Exact Back after reload:** before reloading, the script records the exact router location it ended on and the state that location must show. These are: `ready`, the archived notice for `task-archived`; `backbare`, the bare editor showing surviving draft B with deleted A absent; `unhydrated`/`stale`, Plan on `task-deleted` with no notice and no inspector. After Back it requires that exact location and that state; an unhandled case fails. A synthetic deletion now survives the reload in the same tab, so `backbare` cannot pass on a re-seeded draft.
- **Exact deletion audit:** a write is allowed only inside the confirmation phase. That phase runs from the click on the dialog's confirming Delete until that confirmation's save is recorded.
  - Each expected asset (`sole`: `asset-a1`, then `asset-c1`; `backbare`: `asset-a1`) must have exactly one phase, in order, containing exactly its `deleteContentAsset` and then `saveWorkspaceNow`.
  - Any other write fails, as do writes while opening the dialog or navigating.
  - Store writes are never evicted from the bounded diagnostic log.
  - This is synthetic fixture evidence, not production database or policy proof.

## Validation (this checkout, 30 October 2026)

| Check                                                                                                                                              | Result                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx --no-install vitest run` on the new and affected suites¹                                                                                      | exit 0 — 37 files, 1052 tests                                                                                                                                                     |
| `npx --no-install tsc --noEmit`                                                                                                                    | exit 0                                                                                                                                                                            |
| `npx --no-install eslint` on the 49 changed/new `src` files, and separately on `scripts/task-continuity-browser`                                   | exit 0 / exit 0                                                                                                                                                                   |
| `npx --no-install prettier --check` on the same files and every harness file                                                                       | exit 0, after `--write` on four new files of mine (first check: exit 1)                                                                                                           |
| `node scripts/task-continuity-browser/build.cjs`                                                                                                   | exit 0; 0 backend inputs; the required actual sources were confirmed in the metafile. The sandbox could not write `/tmp/milo-…`, so it used the documented `os.tmpdir()` fallback |
| R2 fixture correction: `prettier --check` and `eslint` on `scripts/task-continuity-browser`, then `node scripts/task-continuity-browser/build.cjs` | exit 0 / exit 0 / exit 0 (same `os.tmpdir()` fallback). No `src` file changed, and the unchanged product suites were not rerun                                                    |

¹ The suites: `src/lib/task-continuity.test.ts`, `src/i18n/task-continuity.test.ts`, `CitationForwardPanel.test.ts`, `requested-asset-cx`, `draft-selection`, `discovery-selection-ui`, `markdown-parity`, `opportunities`, `catalogs`, `parity`, `language-claims`, `device-preference`, `first-use`, `conversation` and all of `src/i18n/staged`.

**What the new tests cover**

- **`src/lib/task-continuity.test.ts`:**
  - `taskTarget` for active, archived/Discarded, missing, deleted, other-project, unhydrated, stale-user and project-moved cases;
  - `planSelectionNotice`;
  - the R1 regressions for `editorSelection`. These cover: sole deletion followed by a new asset, from both a bare and an explicit URL; Back to a bare URL after the former fallback was deleted, from both implicit and explicit starts; no substitution for an explicit missing id; no swap on reorder; and the pre-hydration placeholder.
  - The bare-URL sole-deletion case fails under the pre-R1 logic.
- **`CitationForwardPanel.test.ts`:** each pin's Plan control is enabled for active and archived tasks and disabled for a deleted one; this fails at base.

The whole suite was not rerun; per Codex, that is left to normal CI.

**Author headless attempt (diagnostic only, not acceptance)**

- **What ran:** before Codex required all remaining browser acceptance to go through its CUA tool, I attempted local headless runs of the `ready` fixture in a cached headless Chromium shell. They used a local `file://` page, a temporary profile and outbound DNS mapped to nothing.
- **How it ran:** the first attempt inside the command sandbox exited 133, because the sandbox refused Chromium's Mach port. The next attempt, outside the sandbox, read a wrong path because `$TMPDIR` differs there. Two runs then completed outside the sandbox under the Desktop session's existing execution permissions. Codex gave no new human or action approval and observed none, and no extra permission change was authorized.
- **Source state:** those runs used the pre-R1 source and the first fixture version; they are diagnostic only. 5 of 13 steps failed.
- **Passed (8 steps):** pin → exact `selected=task-a` inspector, with the deleted pin's control disabled; inspector → exact draft; Back to task → same task; no link for missing, deleted or other-project sources; archived notice and Show archived; unavailable notices for deleted, other-project and unknown tasks; archived pin → archived notice; Back after reload. That last pass used the loose post-reload assertion that R2 replaced, so it proves nothing.
- **Network and writes:** the report showed 0 network attempts, 0 store writes and 0 server calls, but that fixture version kept only the post-reload page's records, so the pre-reload page is not covered.
- **Failed (5 steps):** every step after a scripted `history.back()`, and the post-reload editor check. The diagnostics showed router locations like `/app/editor?id=asset-a1%3Fcheck%3D1&variant=…`. `@tanstack/history`'s `createHashHistory.parseLocation` appends `location.search` to the hash path, so the fixture's own page query leaked into the route. The editor then correctly failed closed on that id.
- **Fixture fix:** parameters now move to `sessionStorage` before the router starts.
- **Not rerun:** neither that fix, the R1 variants, nor the R2 report logic was rerun, as instructed. No author result is claimed for the corrected fixture. Browser results for it are Codex's.

## Codex acceptance evidence (reported by Codex, not run by Claude)

Recorded as Codex reported it. Claude ran none of it. The receipts are in `/Users/rafi/.codex/.chatgpt-projects/g-p-6a732f6015948191999fb9beb8f7bc81/workstreams/competitive-upgrade-20261029/task-continuity/`.

- **Source review:** R1 product correction accepted; the source stays frozen and accepted. Codex's static R2 fixture review is in `review-fixture2/review-result.json`.
- **Browser acceptance (`browser-acceptance.json`, per-case `browser-r2-*.json`):** Codex ran the final R2 fixture with its CUA browser tool.
  - **Coverage:** all 6 variants in English at desktop 1710×885 and in Polish at mobile 390×844. `ready` was also run in Polish, Swedish and Danish at desktop and in English, Swedish and Danish at mobile.
  - **Result:** 18 cases and 130 assertion groups, all passed. That includes the exact post-reload Back, the exact synthetic delete/save audit, zero network attempts, zero unexpected writes and no horizontal overflow.
- **Keyboard (reported):** manual Tab/Enter from the editor's **Back to task** opened exactly `task-a` at desktop and mobile, with visible focus. The target was 26px tall at desktop and 44px on mobile.
- **Production build (`local-build-receipt.json`):** Codex's `bun run build` passed. The generated `routeTree` changes (formatting and order only) were restored to the pre-build state, and all 49 source hashes were unchanged.

## Not done or not established here

- **Browser acceptance:** done by Codex, as reported above; it is synthetic local fixture evidence, not production or customer acceptance.
- **PR, CI and release** are pending (Codex).
- **Language review:** fluent-speaker review of the new Polish, Swedish and Danish copy has not happened, and neither has human usability review.
- **Project switch:** if the active project is switched while Plan shows `?selected=` from the other project, Plan shows the unavailable notice. This is deliberate and truthful, but not separately reviewed.
- **Synergy pilot:** the pilot and the PR187/192 workflow outcomes are outside this package. Nothing here claims customer, CMS or native evidence.
