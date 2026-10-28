# Milestone editor UI reconciliation — 28 October 2026

Branch `codex/milo-ui-reconcile-20261028`, integration base `f4db050a` (normal merge of
PR187 `f8be9241` and main `a3c7f68b`). The merge deliberately kept the editor from current
main as a temporary conflict resolution, so the accepted PR187 editor UX had to be re-applied
on top of the PR192 confirmed-save editor. This packet does that and nothing else.

## What was reconciled

The merge resolution left `src/routes/_authenticated/app.editor.tsx` with main's editor, and a
prior partial integration attempt had re-invented the header layout and the anchor target rather
than restoring the reviewed one. Both are now corrected to the accepted PR187 structure:

- **Exact-input primary action.** `editorPrimaryAction({ ...live, status: f.status }, isDirty, approvalState)`
  — publication fields come from the live store copy (publish writes do not bump
  `updatedAt`), the editorial status from the form the user is reading. The partial attempt passed
  bare `live`, which would show a stale editorial step after an unsaved status change.
- **`PublicationApprovalSnapshot` scope.** `editorApprovalState` is fed the same
  asset/project/paths/revision/user that were actually checked, so a `current` approval is never
  carried into changed editor inputs; no project reads as `unavailable`.
- **Layout.** Top row = unsaved/status text plus one primary action; secondary actions moved below
  into `<details>`, with the status dropdown inside it. The partial attempt kept the status
  dropdown in the top row and nested `<details>` inside the action row.
- **Anchor.** `Review publication` is a `Button asChild` wrapping `<a href="#publication-controls">`,
  targeting the publication controls (not the checklist). That target carries `tabIndex={-1}`,
  `scroll-mt-4` and a visible `focus-visible` ring, so activating the link moves focus for
  keyboard/screen-reader users instead of only scrolling. The pre-existing
  `#publishing-checklist` id and its `scrollIntoView` caller are untouched.
- **Tabs.** `TabsList` is `h-auto max-w-full flex-wrap justify-start` — wrapping, width-bounded.

Divergence from the reviewed PR187 editor is now limited to the PR192 save semantics below, plus
two added explanatory comments.

## Preserved save invariants

PR187 called `save()` directly from these handlers. On this base every one of them goes through
`void confirmSave(...)`: primary Save, primary Mark in review, the status dropdown, Save draft,
Mark in review, Reject, Export, and the `EditorSaveBar` footer. `confirmSave` reports success only
on a `confirmed` outcome from `runDiscoverySave`, so a pending, unconfirmed, rejected, conflicted
or session-changed save stays silent and is reported by the workspace status bar with its own
Retry. Its `mounted`/request-identity guards and the `latestFormRef` staleness check (form B typed
after this save started) are unchanged, as are `workspaceSaveStatus` and the footer.

The only remaining direct `save()` calls are inside `confirmSave` itself and inside `approve()`,
which was not modified and already awaits `saveWorkspaceNow()` before writing the approval.
Exact-version approval stays independent of the editorial `Approved` status and never publishes;
`Review publication` only links to the existing controls — it never sends, publishes, reschedules
or changes approval.

## Offline fixture

`scripts/milestone-ui-browser/` is synthetic memory with no network (fetch is denied, server and
`.server.ts` imports fail the build). Two genuine incompatibilities with the confirmed-save editor
were fixed, and nothing more:

- `getWorkspaceSaveContext()` returned no `hydrated` field, so `runDiscoverySave` classified
  **every** fixture save as `notReady` and no save in the fixture could ever confirm. It now
  reports `hydrated: true` (synthetic memory has nothing to fetch; the epoch never changes because
  the fixture has no sign-out/re-hydration).
- `hasUnsavedWorkspaceChanges()` was hardcoded `false`, which bypassed the exact guard
  `confirmSave` exists for. It now diffs against the synthetic baseline that `saveWorkspaceNow`
  and `reset` record.

`build.cjs` gained an output-directory fallback (`MILO_FIXTURE_OUT`, then `os.tmpdir()`) so the
gate can run in a sandboxed checkout where `/tmp` is not writable. The default path and everything
built or asserted are unchanged.

## Checks actually run

- `npx tsc --noEmit` — clean.
- `vitest run` over `src/lib/editor-save.test.ts`, `src/components/EditorSaveBar.test.ts`,
  `src/lib/editor-primary-action.test.ts`, `src/lib/editor-form.test.ts` — 4 files, 82 tests
  passed.
- `node scripts/milestone-ui-browser/build.cjs --ssr-smoke` — 9 route/scenario renders plus the
  approval and save contract assertions passed.
- `node scripts/milestone-ui-browser/build.cjs` — built, no server/backend bundle inputs.
- `npx eslint` on the four changed files — clean.
- `npx prettier --check` on the four changed files — clean.

Two qualifications on how these ran. The test suites were executed with an import-free `.mjs`
mirror of `vitest.config.ts` (same alias, `node` environment, same include) because this
checkout's `node_modules` symlink resolves outside the worktree and vite could not write its
config temp file there; the configuration is otherwise identical. The DE49 and full suites were
out of scope for this packet and were **not run**.

New coverage is limited to three cases added to the offline smoke, exercising the integrated
contract end to end against the fixture store: a settled save confirms exactly once, a newer
unsaved form is never reported as saved, and a refused save never reports success while the local
write survives for retry. No new unit regressions were added — `editor-primary-action.test.ts`
already covers the helper exhaustively and needed no change.

## Gates still pending

These are **not** covered by anything above and remain open:

- **Real browser interaction.** The SSR smoke renders static markup and runs no React effects. The
  `<details>` disclosure, the focus move to `#publication-controls`, the status dropdown and the
  save toasts have not been exercised in a browser.
- **Mobile/responsive.** The wrapping `TabsList` and the header's two-row behaviour at narrow
  widths are unverified at real viewport sizes.
- **Keyboard and screen-reader pass.** Native `<details>` and `tabIndex={-1}` are the accepted
  mechanisms, but no assistive-technology check was performed.
- **Live/production behaviour.** Everything here is unit tests, a type check and a synthetic
  no-network fixture. No live save, approval read/write, publication or scheduled run was
  exercised; the fixture's `confirmed` outcome is synthetic and is not evidence that a real
  network save confirms. Release and production verification stay with Codex.
- **Independent review.** Not committed, pushed or released; no dependency, server, Stripe or
  migration file was touched.
