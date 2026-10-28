# Editor save confirmation — follow-up fixes (2026-10-28)

Addresses three gaps found in code/test review of the prior change.

## 1. `EditorSaveBar` — `notReady` was rendering as "saved"

The default (`else`) branch caught any status that wasn't dirty/retry-offering/saving/unsaved —
including `notReady` — and rendered "All changes saved". Added an explicit `kind === "saved"`
branch; `notReady` now renders nothing (neutral/hidden), never a saved claim.

Tests (`EditorSaveBar.test.ts`): all six `WorkspaceSaveStatusKind` values, `isDirty` priority
over every kind, and the four active languages (en/pl/sv/da) for both the "saved" and
"unconfirmed" copy. A `containsText` helper decodes `renderToStaticMarkup`'s `&#x27;` back to
`'` so the English "We couldn't confirm the save…" copy compares correctly against the raw
translation string.

## 2. `confirmWorkspaceSave` — any resolved `saveWorkspaceNow()` was treated as confirmation

`saveWorkspaceBody` no-ops (resolves without throwing) when the workspace isn't
browser/hydrated/ready, and a newer edit can land on the store while an older save is still in
flight — in both cases the old code called `saveWorkspaceNow()` and reported success anyway.

`confirmWorkspaceSave` now drives one attempt through `runDiscoverySave` (reused unchanged from
`discovery-save-recovery.ts`), using the store's real `getWorkspaceSaveContext` /
`hasUnsavedWorkspaceChanges`. `onConfirmed` fires only for `{ kind: "confirmed" }`: same session,
ready, and no unsaved diff remains against the current snapshot. No retry is added.

Test fix (`editor-save.test.ts`): the "newer edit during in-flight save" case previously
asserted the stale save's callback fired once, despite its own title saying it shouldn't — now
asserts it does **not** fire, since a newer unsaved edit is present when the old request
settles. `deferApply`'s network barrier is now one-shot (an `intercepted` flag), so the second,
unrelated save in that same test no longer hangs on the same never-released promise.

## 3. Save feedback wasn't bound to the view/request that started it

`app.editor.tsx`'s `confirmSave` now binds its success toast to a per-call request id and a
mounted ref: a save superseded by a later save on the same asset, or one whose network
confirmation settles after this `Editor` instance unmounted (it's keyed by `asset.id`, so an
asset switch already unmounts it), no longer fires a toast. Local-form-only edits (`f`) that
haven't reached the store are unaffected — the global diff guard in #2 already covers those via
`hasUnsavedWorkspaceChanges`.

## Prior round, verified
The three fixes above (`EditorSaveBar` `notReady` branch, `confirmWorkspaceSave`'s
`runDiscoverySave`-based outcome check, and `confirmSave`'s request-id/mounted-ref binding) were
reviewed and the affected suites — 54 tests across 4 files — were executed and passed.

## 4. `confirmSave` still false-confirmed a page-local form edit typed after Save, before confirmation

Gap found in follow-up review: #3's request-id/mounted-ref guard only protects against a later
*Save* or an unmount — it says nothing about the user continuing to type into the on-screen form
(`f`) without pressing Save again while the first Save's network write is still in flight. That
edit never reaches the store, so `hasUnsavedWorkspaceChanges` (used inside `runDiscoverySave`) is
blind to it: the store looks clean, `confirmWorkspaceSave` resolves `{ kind: "confirmed" }`, and
the success toast fires while the newer, still-unsaved form content sits on screen — the user
sees "Saved" for an edit that was never sent.

Fixed by giving `confirmWorkspaceSave` an optional third argument, `isStale`, checked immediately
before `onConfirmed` fires (`src/lib/editor-save.ts`). `confirmSave` (`app.editor.tsx`) now
captures the exact `ContentAsset` snapshot `save()` wrote (`saved`), and passes
`() => !!saved && editorFormDirty(latestFormRef.current, saved)` as `isStale` — `latestFormRef` is
a ref mirroring the live `f` state each render, so by confirmation time it reflects whatever the
user has since typed. Reuses the existing `editorFormDirty` field-by-field compare (unchanged,
untouched) rather than a new diff routine. `save()` itself still calls `setF(next)` synchronously
right after `write()` runs, which makes `f` (and so `latestFormRef`) equal to `saved` for a save
that wasn't followed by further edits — so a normal, no-further-typing Save still confirms
correctly; only a form that moved on past `saved` is suppressed.

## Not executed
Item 4's two new tests (`editor-save.test.ts`: "isStale: a page-local form edited after this save
started..." and "isStale: returning false still confirms...") were written but **not run** in
this session — no test runner was invoked. Typecheck/lint/build were likewise not run. The root
will rerun the affected suites, typecheck, lint, build, browser acceptance and the PR187 merge
check.
