# CG-03C — record one manually collected discovery observation (30 October 2026)

**Context**

- **Author and base:** Claude, the same sole author, on the existing Claude Desktop subscription. Base `d8ac0559` (CG-03B merged, main CI accepted), branch `codex/milo-manual-discovery-20261030`.
- **Inputs:** `cg03c-implementation-packet.md`, `cg03c-author-assessment-r1.md` and `cg03c-design-acceptance-r1.json`.
- **Correction:** R1 (`cg03c-correction-r1.json`) and the supplemental R2 (`cg03c-correction-r2.json`, `569ba158…afeda`) applied on top of the stage1 snapshot; see "R1 corrections" and "R2 corrections" below.
- **State:** working tree only. Nothing committed, pushed, merged or published. CG-03B completed its bounded live acceptance (PR 201, merge `d8ac0559`, build `1793393714525`; receipt `cg03b-completion-receipt.json`, `b006dc90…07a2`), so that prerequisite is met. CG-03C itself is not accepted or released: it still needs its own independent review, CUA, normal PR/CI and release checks, which Codex owns.
- **Scope:** one owner-scoped **original** manual **discovery** observation through the existing `importManualCaptureFn`.
- **Not in scope:** brand capture, corrections, retries, deleted-slot reuse, bulk or native import, artifact upload, collectors or schedules.
- **Unchanged:** server, functions, schema, SQL, storage contract, store, AppShell, dependencies, accounts, providers, budgets (USD50/month AI, manual Free grants) and the protected 168h observer. CG-02A navigation and CG-03A/B behaviour are preserved.

## What was built

| File                                            | Role                                                                                                                                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/manual-capture-ui.ts` (pure)           | eligible versions and rounds; form model; exact capture time; delay; local validation; payload build and **freeze**; positive match; sticky submission state; leave classification |
| `src/components/ManualCaptureEntry.tsx`         | one labelled action and a controlled modal entry with guards and the submission state machine                                                                                      |
| `src/components/CitationPanelProtocolPanel.tsx` | mounts the action under the CG-03B coverage view, fed by the same resolved read and the raw protocol read                                                                          |
| `src/i18n/manual-capture.ts`                    | `manualCapture.*`, 217 keys, EN/PL/SV/DA                                                                                                                                           |
| staged fallback                                 | English fallback for the 20 inactive catalogs (fingerprint `074e44c7…5774`); totals 4765 → 4982; five exact 217-key partitions; German record; no activation                       |

**Eligible choices.**

- **Versions:** locked, approved discovery versions with a valid weekly schedule. Older locked versions behind a newer draft are included; null-schedule versions are not offered.
- **Unavailable rounds:** for a new original, these rounds are disabled with a reason:
  - not due yet (the approved slot is in the future);
  - already has a record (a live original in the resolved read);
  - used by a deleted record (an erased slot).

  These are informational; the server stays authoritative.

- **Capacity:** 100 or more stored answer records is refused locally.

**Payload.** Every payload is bound from stored records and frozen.

- **From the stored panel:** the approved question text, used only after the owner ticks "I asked exactly this question"; the prompt id/revision and panel id spelling as stored; the slot; and `intendedSlotAt` verbatim.
- **Capture time:** date + time (seconds kept when entered) + an explicit UTC offset, e.g. `…T11:00:17+00:00`. It is used as the same string in both time fields and is never the import time or rewritten. `delayMinutes` uses the server's floor.
- **Observed surface:** the answer's mode, model and surface label come from the one observed-surface input.
- **Defaults:** unknown enums default to `unknown` and nullable facts to `null`. "Fresh conversation" and "prior messages" need an explicit answer, and citation completeness defaults to unticked.
- **Method:** the fixed, non-localized literal `manual entry (MILO form) v1`, shown as "Entry method".
- **Freeze:** the payload is the **output of the server's own `parseManualCaptureInput`** (labels trimmed, capture context passed through), deep-frozen. Every send, resend and stored-record comparison uses that one object.

## Design acceptance details

1. **Live session checks.** The entry binds to actor + workspace epoch + project when opened. `sessionCurrent()` re-reads `useAuth` (via a ref updated each render) and `getWorkspaceSaveContext()` at every interaction and every callback.
   - **Retired session:** if the user signs out, another user signs in or the same user signs back in, the entry purges all raw values and closes without a prompt. The router blocker and unload guard turn off. Late callbacks do nothing: no state, no refresh, no message.
2. **No `/auth` exemption.** The blocker blocks while the entry holds something _and_ the session is still valid. There is no path exemption; real session loss passes because the session check fails.
3. **Occupied/deleted slots versus resend.** Occupied and deleted rounds are unavailable only when choosing a **new** original. "Send this exact entry again" re-sends the frozen object without local occupancy or capacity checks. A refused resend never resets the earlier uncertainty.
4. **Capture time.** The time is exactly as entered (seconds and offset kept), and is never changed on resend.
5. **Native guards.** The entry is a controlled Radix modal `Dialog`, which makes the background inert. That covers the AppShell project picker and navigation, and the other in-page `setActiveProject` buttons.
   - **Close paths:** the X (via `onOpenChange`), Escape (`onEscapeKeyDown`), outside pointer (`onInteractOutside`) and Cancel all lead to one leave request. A nested `AlertDialog` offers **Stay** (default focus; its own Escape means Stay) or Discard / Leave anyway.
   - **Router:** the installed `useBlocker({ shouldBlockFn, withResolver: true, enableBeforeUnload })` covers Back/Forward, links, programmatic navigation and same-route search changes, using the same dialog, plus the native unload prompt.
   - **Wording by state:** unsent "has not been sent"; sending "already sent and cannot be cancelled"; unconfirmed "may already be stored; leaving does not undo a save".
   - **Proof:** the actual-browser proof is Codex's CUA run.
6. **Abandoned late results.** After explicit abandonment the entry gets a new identity. A late result rechecks the session, invalidates only the three scoped reads (`answer-evidence`, `citation-protocol`, `citation-coverage`), never restores raw values or state, and cannot affect a replacement entry.
7. **No registry and no storage.** Raw values live only in the open entry's component state. There is no module map, browser storage, URL state, persistence or logging of raw text.

**Sticky uncertainty (C3).**

- **Not sent:** only a local refusal before the call.
- **Confirmed:** only a valid UUID response, or **Check saved records** finding a stored record whose `input` is structurally identical to the frozen object (key order ignored, array order and exact strings kept) in a read for the same owner and project.
- **Unconfirmed:** every outcome after dispatch, including codes that would occur before the write, malformed or missing ids and transport errors. It stays unconfirmed until confirmed.
- **Confirmed is final:** a failed refresh after confirmation shows "updated view could not be loaded" without downgrading.
- **Editing:** an unconfirmed entry cannot be edited, only resent exactly, checked or abandoned with a warning.
- **One request:** a single request runs at a time (a double click sends once).

## R1 corrections (30 October 2026)

**ELIGIBILITY1 — authoritative occupancy and current reads.**

- A round is offered for a **new** original only while all three scoped reads (protocol, resolved coverage, answer evidence) currently succeed for the same owner and project, and the selected version has a matching report with `coverageComplete === true`.
- Otherwise the round shows a reason instead of "can be recorded":
  - a failed read (cached data or not) gives "records could not be loaded";
  - a missing report or `coverageComplete: false` gives "cannot be checked yet".
- Known facts keep their own reason (occupied, deleted, not due).
- `coverageComplete` is read per version. A truncated tombstone read, or a malformed capture with an unrecognizable slot, blocks only that version. A known-slot failed, truncated or malformed record occupies only its own slot. The global `erasureOverflow` is not an input.
- **Before the first send** the slot is re-derived from the current reads. If it is no longer available (read failed, slot taken), nothing is sent: the reviewed entry stays, with the reason shown.
- **Resend and Check** never re-run eligibility. They keep the exact frozen object, the explicit buttons and the sticky uncertainty.
- The open action is disabled while any of the three reads is pending or failed.

**ELIGIBILITY2 — exact prompt revision.**

- A question needs its prompt in the current scoped prompt set, matched by canonical UUID (case-insensitive) and **integer** revision.
- A deleted prompt, a different revision, a non-integer revision or another project's prompt gives "question no longer available".
- No server change; frozen recovery is unchanged.

**UX1 — progressive steps.**

- The flow is "Step n of 3": choose (version, question, round, affirmation) → answer (result, text, sources, completeness) → context, then Review.
- Continue checks only the current and earlier steps. Back and Continue keep every value, the guards stay as before, and Review jumps back to the first step with an issue.
- **Context step:**
  - Required facts are always visible: date, time, offset, service, app or website, kind, fresh conversation and prior messages.
  - Optional context sits in four closed native `<details>` groups (model and web search; account and conversation; language and location; additions, screenshot, cost and notes). Each is labelled as optional, with empty/unchosen meaning unknown.
  - Nothing is pre-filled. Affirmation, capture time, completeness and truthful unknowns are unchanged.
- **Review** shows:
  - question number, round and text;
  - planned time and the collected time as entered;
  - result, answer excerpt, source count and completeness;
  - service, app and kind; fresh conversation and prior messages;
  - how many optional details are left unknown;
  - the method literal.

**UX2 — meaningful labels.**

- Question choices read "Question n: text", with no ID prefix.
- The confirmation shows the question, round and collected time. From the refreshed saved record it shows the stored answer excerpt and source count, then the record ID as secondary text, or the read failure.
- The resolved outcome uses the option label.
- Each deviation code the resolver can emit for a discovery capture (39, collected from `citation-panel.ts`/`citation-protocol.ts`) has a plain label. Any other code shows as "Other difference (code …)".

**UX3 — 44px targets.**

- Every new control uses `min-h-11` with no `sm:` override: buttons, selects, inputs, textareas, `<summary>`, checkbox rows, and leave-dialog actions.
- The shared dialog's X gets `h-11 w-11` through `[&>button]:…` on this `DialogContent` only; the shared component is unchanged. The rule is present in the fixture's compiled CSS.

**Tests added.**

- **Helper (+7):**
  - truncated per-version tombstones, through the real `citationReports`;
  - an unrecognizable-slot malformed capture affecting only its version;
  - known-slot failed/malformed records not blocking;
  - a missing report and failed reads;
  - prompt deletion, wrong revision, non-integer revision, foreign prompt and UUID case;
  - the specific not-sent reasons and their step;
  - exact resend after eligibility changed, uncertainty kept.
- **Catalog (+1):** every slot state, issue and deviation code has a label that is not the code; question and record-ID wording.
- **Panel (+1):** the open action needs all three reads current; a failed prompt read with cached data disables it.

**Fixture.** The scripted check now drives the real step flow and adds these cases:

- incomplete occupancy, a deleted prompt and a failed prompt read;
- Back/Continue retention with an opened optional group and a measured 44px audit of both dialogs;
- the review and confirmation content;
- a deviation label;
- a read failure, then a new occupant, between Review and the first Save (no call, entry kept, Edit returns to step 3);
- an exact resend while a new original is blocked.

`fixture.js` gained per-function read failures and the two session deviations. **I did not run it in any browser.**

## R2 corrections (30 October 2026)

**FIRST_SEND_CAPACITY.**

- Right before a **new** first send, `firstSendIssues` rechecks the chosen slot against the current reads **and** the current successful answer count. 100 or more stored records (any kind), or an unknown count, blocks the send with the capacity or reads reason. The reviewed frozen entry is kept.
- "Send this exact entry again" never runs this check. The server dedups an identical input before its capacity rule, and uncertainty stays sticky.

**VISIBLE_STATUS_RECOVERY.**

- A typed failure reason stays visible whenever it is non-empty, whatever the status.
- With **Complete** selected, the reason shows an explanation and a 44px **Remove the failure description** button. `failureNotAllowed` marks that visible field.
- Failed and Cut off still require a reason.

**ACTIONABLE_FIELD_BOUNDS.**

- `MANUAL_CAPTURE_FIELD_LIMITS` mirrors every free-text bound of the stored schemas:
  - answer 50,000 (verbatim), failure 2,000;
  - service and app 100, search mode 100, model 120, account plan 40;
  - languages 40, country 80, city and place 120;
  - addition 2,000, screenshot reference 200, missing-screenshot reason 500.
- These are checked locally, before the parser, as `tooLong:<field>` on that field's own step. The answer and failure limits therefore block Continue on step 2 even while step 3 is empty.
- Notes (20 lines × 500), link length (2,048) and control characters in the account plan are named too.
- Any remaining parser refusal is mapped from its schema path to the field (`invalid:<field>`); only an unmappable one stays generic.
- The message names the field, its step and optional section, the current length and the limit, and says nothing was cut. The section holding a flagged field opens.
- The answer and reason fields show a live character count; there is no `maxLength`, so pasted text is never truncated.
- Exact limits pass, and the frozen payload and parser are unchanged.

**TRUTHFUL_CONTEXT_LABELS.**

- These 13 codes, which the resolver also emits for unknown-versus-planned values, now read "<setting>: the recorded details do not match the plan (a different value, or not recorded)" in all four languages: personalisation, sign-in, memory, custom instructions, connected tools, service/app/mode/search mode, model, web search, country, city, location permission, VPN and interface language.
- Account plan and question language (compared only when both are known) read "the recorded value differs from the plan".
- Fact-based labels say "Recorded …".
- No label says "differed". The no-deviation line reads "no gaps or differences … were found in the recorded details".
- Canonical codes, resolver and comparability are unchanged.
- Not applied: the review's two non-blocking wording suggestions (the "at or after the planned time" help text and the links-in-text note).

**Tests added.**

- **Helper (+4):**
  - capacity reviewed at 99 then blocked at 100, an unknown count, and slot plus capacity;
  - Failed and Cut off then Complete, with the visible field, the removal and the reason required again;
  - every limit passing at its exact maximum and refused one character over, on the right step and with no generic `invalid`;
  - the real `protocolDeviations` for known-different, observed-unknown and both-unknown country, against the labels in all four languages.
- **Catalog (+1):** no label says "differed"; the 13 gap codes mention "not recorded"; the no-deviation wording.

**Fixture.**

- `fixture.js` now takes deviations from the real `protocolDeviations`, and the seed panel plans country `NO`.
- New labelled controls schedule sign-out or same-actor re-sign-in 30 s ahead and show the scheduled time. They are needed because the open entry makes the app root (and these controls) inert, so a person schedules first and then opens a leave dialog.
- New scripted cases:
  - capacity after Review;
  - exact resend at capacity;
  - failure-reason recovery;
  - answer, reason and optional-field limits;
  - the gap label;
  - session loss (both kinds) with the leave dialog already open.
- The script now has 24 checks. **I did not run it in any browser.**

## R2 addendum (fixture isolation and account plan)

Applied from `cg03c-r2-fixture-addendum.json` (`5a592249…1dc2`), with details from `cg03c-fixture-review-stage2.json` (`ef075e99…24f9`).

**Fixture isolation.**

- The finding was that `fresh()` left a confirmed entry open (so the next case could not start on step 1) and that `imports()` counted the whole run.
- `fresh()` now closes any entry through its own controls (Close, or Cancel then Discard / Leave anyway). It settles a held request and in-flight reads, signs the actor back in if needed, resets, refetches, and asserts a clean start.
- The three cases that used to continue from the previous one (close paths, background, router) now start clean themselves.
- Each of the 25 cases declares its exact writes (16 in total). `imports()` is per case, and the whole-run audit is kept.
- A final ledger requires:
  - every case ran;
  - per-case writes sum to all writes and to the expected total;
  - no call other than reads and writes;
  - no refused store/auth call.
- `passed` includes the ledger. A failed case keeps its error, and a write-count mismatch fails that case.
- I did not run the fixture in a browser.

**Account plan normalization.**

- The control-character check now runs on the trimmed value, as the stored schema does. Tab+Free+tab is stored as `Free`; whitespace or tabs only are omitted (not known); an internal control character is still refused.
- Focused cases were added to the helper limits test.

## R3 corrections (native pointer and fixture runtime)

Applied from `cg03c-correction-r3.json` (`7fa9dffd…d571b`), after root's actual Chrome run (`cg03c-browser-failure-r3.json`). That run was a diagnostic, not acceptance.

**NATIVE_POINTER_STAY (product).**

- **Defect:** a real mouse click on **Stay** left or reopened the leave confirmation, while Enter and Escape closed it.
- **Cause (installed Radix Dialog 1.1.17, DismissableLayer 1.1.13):**
  - The entry's dismissable layer defers its outside-pointer handling to the document `click`.
  - The confirmation was a sibling outside the entry's React tree, so the press on Stay counted as outside.
  - At click time Stay had already closed the confirmation, so the entry's `onInteractOutside` asked to leave again.
- **Fix:** the confirmation (`AlertDialog`) is now rendered inside the entry's `DialogContent` in the React tree. It still renders in its own portal. Radix marks a pointer press inside a nested portal as inside the owning layer (its `onPointerDownCapture` React-tree check), so Stay no longer counts as outside.
- **Focus:** on close, the confirmation returns focus to the entry control that had it when it opened (if still present), or else to the first entry control. Without this, focus could fall outside the entry.
- **Unchanged:** a genuine outside click, X, Escape, Cancel, router blocking, the unload guard, sticky uncertainty and session retirement are all unchanged.
- **Read-only attributes:** the entry exposes three data attributes so a check can wait for its committed render: `data-reads-current`, `data-answer-count` and `data-selected-slot`.
- **Tests:** there is no DOM test environment in this project and no dependency was added, so the regression is in the browser fixture. Stay is pressed with a full pointerdown/mousedown/pointerup/mouseup/click gesture. The fixture then checks the confirmation stays closed after the deferred handling and animations, and that focus is inside the entry.
- **Proof:** root's native retest of pointer Stay is still required.

**Fixture runtime.**

- **History:** an initial predecessor and citation-review are seeded through the installed TanStack history API (`replace`, then `push`), so they carry indices 0 and 1. The installed hash history coalesces the synchronous replace/push, so the index-0 predecessor is not reliably `/app/today`. Before, two null native states made Back compute delta 0 and Stay call `go(0)`, which reloaded the page and lost the report. The router case asserts index ≥ 1 before Back. Native Back and the same-route search case are kept.
- **Render barriers:** the cache settling is not the consumer render. Before each Save that must not send, the script now waits for the entry's committed attributes: the failed read, the recovery, the occupied slot, and 99 then 100 records. Round-state checks wait for the expected rendered options. Expected writes stay 0 per case and 16 in total.
- **Animation:** 44px targets are measured only after `document.getAnimations()` has finished. The 44px requirement and production CSS are unchanged.
- **Background:** instead of `#root[aria-hidden]` (Radix keeps live regions exposed and hides each background branch), every interactive background control must be hidden through its own or an ancestor's `aria-hidden`/`inert`. Body pointer events must be off and the entry interactive.
- **Outside click:** a full pointer gesture on the page body, matching Radix's deferred handling.
- **Unchanged:** all 25 cases, the per-case write declarations (16), the ledger and the network guard.

**Documentation facts.**

- The State line now records CG-03B as completed, with its receipt.
- The exact-match line now says object key order is ignored, while array order and exact strings stay significant.
- The "proven in the fixture" wording now reads as exercised in a planned fixture run.

## Validation (this checkout, 30 October 2026)

| Check                                                                                                                                                                                                                                                                                                                                             | Result                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npx --no-install vitest run` on `manual-capture-ui` (new), `manual-capture` (new), `CitationPanelProtocolPanel`, `CitationFindingAuthor`, `citation-panel-ui`, `citation-protocol`, `citation-protocol.functions`, `citation-panel`, `panel-coverage`, `catalogs`, `parity`, `language-claims`, `device-preference` and all of `src/i18n/staged` | exit 0 — 39 files, 1364 tests, on two consecutive runs after R2, once at the addendum freeze and once at the R3 freeze (stage1: 1266). An earlier run under load (70 s instead of ~26 s) reported 1 failed test; I did not capture which, and it did not reproduce |
| `npx --no-install tsc --noEmit`                                                                                                                                                                                                                                                                                                                   | exit 0                                                                                                                                                                                                                                                             |
| `npx --no-install eslint` on the changed/new `src` files, and on `scripts/manual-capture-browser`                                                                                                                                                                                                                                                 | exit 0 / exit 0                                                                                                                                                                                                                                                    |
| `npx --no-install prettier --check` on all 55 changed/new files                                                                                                                                                                                                                                                                                   | exit 0                                                                                                                                                                                                                                                             |
| `node scripts/manual-capture-browser/build.cjs`                                                                                                                                                                                                                                                                                                   | exit 0, to the `os.tmpdir()` fallback. The real store, auth and function modules are present only as fixture namespaces; there are no backend inputs; the route, AppShell, panel, entry, helper, both dialogs and `useBlocker` are bundled                         |

**What the tests cover**

- **Helper (21 after R2; stage1 items below):**
  - eligibility, including an older locked version, a null schedule, a draft, a brand panel, and future/occupied/erased rounds with an UPPERCASE panel id;
  - exact capture time and offset;
  - the delay floor at 59 s and 60 s across offset spellings;
  - the exact frozen payload;
  - every local refusal;
  - an identical rebuild matches, and so does the same input with object keys in another order (key order is ignored); a different array order, UUID case, time-offset spelling or answer text never matches (array order and exact strings stay significant);
  - only a UUID confirms; a refused resend stays unconfirmed; Check confirms only on an exact match;
  - leave classification.
- **Catalog (16 after R2):** completeness, placeholders, copy authored rather than copied, the translator, no "not saved"/"cancelled" claim, and the method literal kept out of the copy.
- **Panel (2 after R1):** the action stays mounted on a cached snapshot after a failed refresh and waits for the record read.
- **Not static-testable:** Radix portals don't render in static markup, so the modal and guards are exercised by the browser fixture (planned for Codex's CUA run) rather than in unit tests.
- **Fixture:** `scripts/panel-coverage-browser` is unchanged. The new `scripts/manual-capture-browser` scripts 24 checks (25 runs; one loop covers two outcomes) through the real controls with exact call audit (see its README). **I did not run it in any browser.**
- **Full suite:** not run; that is left to normal CI.

## Limits and not done

- **Browser behaviour is unproven by me:** real keyboard Tab containment, pointer clicks on the picker, Back behaviour while blocked and the URL after Stay, the native unload prompt, 390px and the four rendered languages all need Codex's CUA run.
- **Fixture limits:** synthetic events stand in for real input, and the fixture's resolved captures are synthetic, not the real resolver.
- **Error transport:** whether server error messages survive to the browser is unverified. That is why every post-dispatch failure is "unconfirmed".
- **Selection changes:** version, question and round stay changeable on step 1. Typed values are kept and the question affirmation is reset, so nothing is lost. The R1 sketch had proposed locking the selection instead.
- **Eligibility snapshot:** "current" means the latest scoped query has data and no error. A read still in flight after a successful one counts as current, and the server stays authoritative for the slot either way.
- **Localized dates:** planned and approval dates use `Intl` for the UI language. The collected time is shown exactly as entered, with its offset.
- **Out of scope:** a confirmed save proves storage only, not comparable measurement. No production write was made or is claimed; a genuine write needs Codex's safe, non-protected scope.
- **Language review:** fluent-speaker review of the Polish, Swedish and Danish copy, and human usability review, are pending.
- **Separate obligations:** brand capture, corrections/retry identity, artifacts, native exports, true cost and automatic collection remain open.
