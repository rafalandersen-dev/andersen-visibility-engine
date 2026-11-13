# CG-03C manual-capture local browser fixture

Loopback-only, synthetic-data fixture for recording one manually collected, original discovery observation. It mounts the actual pieces under a **real TanStack router on hash history**, so Back/Forward, router blocking and the unload guard are the browser's own:

- the `citation-review` route, with the **real AppShell** (project picker and navigation);
- `CitationPanelProtocolPanel`, `ManualCaptureEntry` and the Radix `Dialog`/`AlertDialog`;
- the real `manual-capture-ui` helpers and the central i18n catalogs.

The page seeds an initial predecessor entry with `/app/citation-review` pushed on top through the installed history API (indices 0 and 1), so Back has a real entry and Stay returns without a reload. The installed TanStack hash history coalesces the synchronous replace/push, so the predecessor at index 0 is not reliably `/app/today`.

**Synthetic parts:**

- **Store (`store.js`):** keeps the real `useStore` reading contract and adds a live session epoch. Every other export of `src/lib/store.ts` becomes a recorded refusal.
- **Auth (`auth.js`):** a synthetic actor that can be signed out.
- **Server functions:** every `*.functions.ts` export is replaced via `fixture.js`.
- **Placeholders:** the other citation-review panels are labelled placeholders.

## Build and open

```sh
node scripts/manual-capture-browser/build.cjs
python3 -m http.server 8770 --bind 127.0.0.1 --directory /tmp/milo-manual-capture-browser-20261030
```

Open `http://127.0.0.1:8770/?locale=en`, adding `&check=1` for the scripted report.

- **Parameters:** `locale` is one of `en|pl|sv|da`; `MILO_BROWSER_OUT` changes the output directory.
- **Build:** reads no `.env`, starts no app server and installs nothing. It uses a unique, exclusively created write probe.
- **Bundle check:** it refuses Supabase and `.server` modules, and confirms the route, AppShell, panel, entry, helper and dialogs are in the bundle.

## Synthetic data and server behaviour (`fixture.js`)

**Data:**

- One locked, approved discovery panel `d0d0d0d0-…-d1`, version 1, with ten questions `NO-D01…NO-D10`.
- Weekly 10:00 Stockholm rounds on day −15, −8, −1 and +6 relative to now, so rounds 1–3 are due and round 4 is not.
- `NO-D02` round 1 already holds an original; `NO-D02` round 2 is held by a deleted one.
- The panel plans collection country `NO` (so an unrecorded country is a gap); everything else in its collection context is unpinned.
- The version's report says `coverageComplete: true`; the answer-evidence read returns all ten prompt revisions. Single cases change these (incomplete occupancy, a deleted prompt).

**`importManualCaptureFn` outcomes** (queue `fixture.outcomes`):

| Outcome               | Behaviour                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `store` (default)     | Commits and returns the id. An identical input returns the existing id; a different input at an occupied slot is refused. |
| `commitThenReject`    | Commits, then throws the generic error.                                                                                   |
| `commitThenMalformed` | Commits, then returns a non-UUID.                                                                                         |
| `reject`              | Throws the generic error without committing.                                                                              |
| `prewriteCode`        | Throws `answer_evidence_unavailable` without committing.                                                                  |
| `otherOccupant`       | Stores a different input at the slot, then throws.                                                                        |
| `hang`                | Waits until `fixture.release("store" \| "reject")`.                                                                       |

**Reads:** these return the in-memory state. Every read fails while `fixture.failReads` is set; a single read fails while its name is in `fixture.failReadNames` (e.g. only `readAnswerEvidenceFn`). The resolved captures of committed records are synthetic (outcome = status) except their deviations, which come from the real canonical `protocolDeviations` against the stored panel; the rest is **not** the real resolver. `fixture.addUnrelatedAnswers(n)` adds non-panel records to reach the 100-record capacity.

**Audit:** every call is recorded with its exact input (`fixture.calls`).

**Session controls (labelled, outside the product):**

- **Sign out elsewhere:** user null, epoch +1, unhydrated.
- **Sign in.**
- **Same-actor re-sign-in:** the epoch advances and hydration passes through false, as `resetStore` and `hydrateForUser` do.
- **Sign out elsewhere in 30 s / Same-actor re-sign-in in 30 s:** the same, after a fixed 30-second delay, with the scheduled time shown next to the buttons. The controls are inside the app root, which an open entry makes inert, so for native checks schedule first, then open the entry, type something and open a leave dialog (Escape, X, Cancel or browser Back) before the time shown.

## Scripted check (`check=1`)

**Barriers and gestures.**

- Before acting, the script waits for the entry's committed render: its `data-reads-current`, `data-answer-count` and `data-selected-slot` attributes, or the expected round options. Waiting for the query cache alone is not enough.
- 44px targets are measured after animations finish.
- Outside clicks and Stay use a full pointerdown/mousedown/pointerup/mouseup/click gesture. After Stay, the script checks the confirmation stays closed and focus is inside the entry.
- Background isolation is checked per interactive control (its own or an ancestor's `aria-hidden`/`inert`), plus body pointer events.

**Isolation.** Every case starts with a verified clean start (`fresh()`):

- it closes any open entry through the entry's own controls (Close, or Cancel and then the leave dialog's Discard / Leave anyway; the guard is never bypassed);
- it settles a held request left by an earlier case (released as a refusal; its entry is already gone) and waits for reads in flight;
- it signs the synthetic actor back in if a case ended signed out, resets the synthetic data, refetches, and asserts there is no entry, no pending request and no queued outcome.

Each case declares its exact number of writes (`EXPECTED_WRITES`, 16 in total). `imports()` counts only the current case; the whole-run audit `fixture.calls` is never cleared. The report adds:

- `ledger`: per case, expected and actual writes and its call range;
- `totals`: case count, all writes, any call that is neither a read nor a write, and every store/auth call, with refusals listed;
- `ledgerComplete`.

`passed` requires every case, no overflow, no network attempt and a complete ledger. A failed case stays in the report with its error; a write-count mismatch fails the case.

Every entry is driven through the real step flow: step 1 (version, question, round, affirmation) → **Continue** → step 2 (result, answer, sources) → **Continue** → step 3 (required facts) → **Review before saving**.

1. **Round states:** occupied, deleted and future rounds are disabled for a new original. Question choices read "Question n: text", with no identifier.
2. **Eligibility guards:**
   - a version report with `coverageComplete: false` turns its free due rounds into "cannot be checked yet";
   - a deleted prompt makes all of its question's rounds "question no longer available" and leaves other questions alone;
   - a failed prompt read disables the open action, with nothing sent.
3. **Steps and retention:**
   - Continue reports only the current step's issues;
   - Back/Continue keep the affirmation, round, answer, required facts and an optional value;
   - the four optional groups have their labelled titles and start closed, and the required facts are visible;
   - every visible target in both dialogs (including the X, summaries and leave actions) measures at least 44px.
4. **Close paths:** Escape, an outside pointer gesture, X and Cancel each open the leave dialog. **Stay**, pressed with a full pointer gesture, keeps the entry on the same step, the confirmation stays closed and focus returns inside the entry; **Discard** clears it and a reopened entry starts empty on step 1. Nothing is sent.
5. **Background:** while the entry is open, every interactive background control (AppShell picker, navigation, fixture controls) is hidden through its own or an ancestor's `aria-hidden`/`inert`, body pointer events are off and the entry stays interactive. That is the real Radix modal isolation; `#root` itself keeps its live regions.
6. **Router and unload:**
   - browser `history.back()`, programmatic `router.navigate` and a same-route search change are blocked;
   - **Stay** keeps the URL and input;
   - a synthetic `beforeunload` is guarded while dirty and not after discard;
   - **Discard** proceeds.
7. **Local refusal:** a missing question affirmation stops Continue on step 1, with zero calls.
8. **Store:** Review shows the question number, round and text, the count of unknown optional details and the method. Saving gives one call for a double click. The audited payload checks:
   - owner scope;
   - the entered `…+00:00` time with seconds, in both fields;
   - the method literal and `supersedesId: null`;
   - the approved question text;
   - the 60-minute delay.

   The confirmation shows the question, round, collected time, the stored answer excerpt, source count and record ID, and the resolved outcome.

9. **Deviation:** a capture with "fresh conversation: no" shows the plain label for `session_not_fresh`.
10. **Between Review and the first Save:**
    - a failed prompt read gives "not sent" with the reason, keeps the reviewed entry and makes no call;
    - after recovery, a new occupant of the slot gives the same with "slot unavailable";
    - **Edit** returns to step 3 with the entry kept.
11. **Capacity after Review (R2):** 99 stored records at Review; one unrelated record arrives; Save shows the capacity reason, makes no call and keeps the reviewed entry.
12. **Exact resend at capacity (R2):** the first send is stored as the 100th record with its acknowledgement lost; the explicit resend sends the identical frozen entry and confirms the same record.
13. **Failure reason recovery (R2):** for Failed and Cut off, a typed reason stays visible after choosing Complete, with an explanation and a **Remove the failure description** button; Continue marks that visible field; after removal Continue proceeds; a failing status needs a reason again.
14. **Field limits (R2):** a 50,001-character answer and a 2,001-character reason are named on step 2 with the field, step, length and limit, and the text is not cut; 50,000 and 2,000 pass. An 81-character country in the closed "Language and location" group is named at Review and its group opens.
15. **Gap label (R2):** an unrecorded country against the planned `NO` shows the "recorded details do not match the plan (a different value, or not recorded)" label.
16. **Lost acknowledgement after commit, or malformed id:** unconfirmed (never "not sent"); **Check saved records** confirms the matched id.
17. **`reject` and `prewriteCode`:** unconfirmed; Check finds nothing and it stays unconfirmed; a warned abandon is required.
18. **`otherOccupant`:** Check does not treat the other record as this submission.
19. **Resends after a timeout while a new original is blocked** (the prompt read now fails and the slot is occupied):
    - nothing is resent automatically;
    - a refused resend keeps the uncertainty;
    - a stored resend confirms the **same** id;
    - the audit shows three identical payloads and one stored original.
20. **Read failure after a confirmed save:** stays confirmed, shows "updated view could not be loaded", and **Load the updated view** then shows the record.
21. **Leaving while sending:** shows "cannot be cancelled". The abandoned late success only refreshes the scoped reads; no entry is resurrected, and the next entry starts empty.
22. **Same-actor re-sign-in while sending:** the entry is purged without a prompt, and the late result makes no read or write.
23. **Session loss under an open leave dialog (R2):** with the leave dialog open, sign-out and same-actor re-sign-in each drop both dialogs without a prompt; the unload guard is off, `/auth` is reachable, and a new entry starts empty with nothing sent.
24. **Signed out elsewhere:** navigation to `/auth` is not blocked.

The report (`#results`, `window.__manualCaptureReport`) includes every call with its exact input, the network attempts and `passed`.

## What this does not prove

- **Real keyboard and pointer:** synthetic events are not real input. Real keyboard Tab containment, pointer clicks on the AppShell picker, mobile 390px, the native unload prompt, the four languages and the browser's own Back behaviour are for Codex's CUA run.
- **Fonts:** fixture fonts are system fallbacks.
- **Database:** fixture stubs prove UI behaviour only. Database authority, dedup, occupancy and capacity remain the existing migration tests and Codex's write-path review.
- **Production:** no production write is made or claimed.
