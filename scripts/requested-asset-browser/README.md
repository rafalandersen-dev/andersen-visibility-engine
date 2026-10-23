# CX requested-asset browser harness

This harness renders the **real `useRequestedAsset` hook and the real workspace store** (`reloadWorkspaceForUser`, autosave and save status) in actual browser React.

**Fixture boundary:**

- `network.js` replaces `@/integrations/supabase/client` and the store's lazy entitlement import with an in-memory, synthetic per-user workspace backend.
- The bundle contains no `fetch`, no Supabase client and no server function, so no request leaves the page.
- Reads and saves can be held and released explicitly.

**Loopback only; never deploy.**

```sh
node scripts/requested-asset-browser/build.cjs
python3 -m http.server 8776 --bind 127.0.0.1 --directory /tmp/requested-asset-browser
```

Open `http://127.0.0.1:8776/` and click **Run all**. The JSON report in `#results` requires `completed: true`, `allPass: true` and an empty `pageErrors`. Group 2 waits for the real 15 s reload deadline. The same steps are available manually through `window.cx`.

## Groups

1. **Stale workspace.** It holds 53 drafts and the server then gains the 54th. One read opens the new draft, with no save.
2. **Stalled read.** It stays `loading` before the deadline and becomes `unavailable` at 15 s. The late answer containing the draft never applies. An explicit retry recovers.
3. **Dirty state.**
   - An unsaved edit refuses the read: nothing is read and the edit is kept.
   - A confirmed save triggers exactly one automatic attempt.
   - An edit typed during that read wins.
   - After the next confirmed save there is no second automatic attempt.
   - An explicit retry recovers, and both edits are kept.
4. **Navigation.** While A's read is pending, the id changes to B (present), then to no id, then back to A.
   - B never shows A's result.
   - Returning to A starts a fresh read rather than staying stuck.
5. **Account change** with the same requested id. The new account reads its own workspace, and the old account's late answer never applies.
6. **Unmount** during a read: there are no updates after unmount. A remount shows the draft without another read.
7. **Another project's draft** stays generically `missing`. The active project is unchanged and the other project's title is never shown.
8. **An already-present draft** never reads.

This harness does not exercise the TanStack editor route, authentication, real Supabase RPC timing or production data. Unit tests (`src/lib/requested-asset-cx.test.ts`) cover the store deadline and abort with fake timers.
