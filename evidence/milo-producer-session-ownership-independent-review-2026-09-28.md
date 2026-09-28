# Producer session ownership — independent candidate review, 28 September 2026

Status: locally accepted candidate; release and real-use acceptance remain pending. Based on PR165 commit `02a94e8803ca4f7fed883e6e30bec33fbac9be71`. This change must not be merged into its prerequisite feature branch. After the prerequisite releases, integrate main normally and obtain code/security/checks for the resulting head.

## Behavior

Asynchronous client producers capture the original hydrated workspace user and epoch before work begins. They recheck ownership across asynchronous steps and before store writes. Pending work is scoped to that session and operation, separating unretained results, existing server-retained content, and external effects that must not be replayed. Same-session field updates preserve unrelated edits; canonical quality inputs changing during evaluation invalidate the old score; explicit human source decisions survive late reachability results.

Sign-out exposes an explicit choice when unretained results are pending and preserves the existing save-before-auth and failed-auth recovery paths. Each overlapping sign-out attempt owns its admission barrier. A second attempt cannot remove an already-issued request's barrier or send duplicate auth requests; it observes settlement. Original-user retained-result recovery reuses the existing path without regeneration.

## Independent evidence

- AY: full producer/registry/flow/UI review; 80 focused tests, types and build. Seven bad-outcome probes identified five follow-up issues.
- AZ: seven-file delta, 129 focused tests, types and build. Publisher rejection fences, canonical quality inputs, human source decisions and retention classification accepted. Pure recovery mutation and authenticated endpoint paths inspected; no live recovery or RLS claim. One overlapping-attempt defect reproduced with the real store and actual browser.
- BA: five-file delta, 136 focused tests across seven suites, types, build and diff checks passed. A separate corrected-outcome real-store regression verifies that the second Stay preserves the first admission barrier, refuses new work, and permits only one successful cleanup. The earlier bad-outcome probe requires the new authPending dependency; its failure alone is not acceptance evidence.
- Actual local browser: first auth request remains pending across shell remount, second Stay leaves closing true, real Milo Score entry refuses new work (quality queue stays zero), and first success resets/navigates once. With timed supplier refusal, a second Leave observes the first request, auth calls remain one, and refusal leads to the ordinary error choice. Stay then opens admission and the real quality producer starts.
- At 375 x 812, the refusal dialog fits without horizontal overflow; focus starts on Stay, Tab cycles through Retry and Stay, Enter closes the dialog, and resumed producer admission was observed after the exit animation. Viewport restored and review tab closed.

All browser flows use fictional local data, deferred fake auth/providers and an in-page fake backend. They do not prove production persistence, RLS, native beforeunload or full real-use acceptance. No production generation, publication, auth change or migration was executed.

## Limits and release requirements

A supplier request already issued cannot be cancelled. Old-session leases are invisible to a new session and are removed on their owners' settlement. An informational delayed link-resolution toast remains outside the store ownership fences; no store mutation is claimed for that toast. Server/background-job acceptance remains separate.

Preserve full R00–R24/D01–D08 obligations, exact code/security release gates, dependency ordering, USD50 monthly AI ceiling and manual budget for free AI. Existing production remains unchanged. No schema migration is introduced here. No previously applied migrations, accepted AI runs or publications may be replayed.

Claude authored implementation, tests and corrections. Codex independently reviewed, ran bounded checks and browser scenarios, recorded this evidence and integrated the candidate; no product-code edits by Codex in this stage.

## BC addendum (28 September 2026) — combined save/producer candidate and the shell print exclusion

Release direction: PR165 (`448ccd60`) does not release alone. Its fresh exact-head findings are covered by ONE
combined candidate on this branch (PR165 save controls + the accepted PR166 ownership correction + this print
correction), released directly to main after exact resulting-head checks; PR165 is closed as superseded after
that. This worktree's local merge of main (`d50db994`, tree identical to `790b9bc`) is preserved.

**P1 4126074735 — the first successful sign-out races active producers.** Already closed by the accepted
AY/AZ/BA ownership; nothing reimplemented. Mapping onto the code at the reviewed identity: the finding's
`generateSeoOpportunities` runs under `runOwnedProducer("opps:<project>", "unretained", …)` and calls
`session.check()` after the awaited `generateOpportunitiesFn` and before `replaceDiscoverySuggestions` /
`saveWorkspaceNow` (`src/lib/mock-ai.ts`, blob `e93e2ca7`) — a response settling after the sign-out cleanup is
a typed `stale_session` refusal, never a write into the signed-out shell or a replacement session. The sign-out
flow acquires a closing lease first (`acquireClosing`, `src/lib/sign-out-flow.ts` blob `a044ad46`, `start()`), so
no new producer work is admitted (`beginProducerWork` refuses with `signing_out`, `src/lib/producer-session.ts`
blob `5c23bf06`), then gates on `pendingUnretained()`: pending unretained work shows the explicit `pendingWork`
choice — Stay (releases the lease, work continues and its settled changes are saved before the later auth
request) or Sign out anyway (`leavePending`, recorded consent) — while retained content (server-retained,
recoverable through the existing Recent generations path) and external publication effects are classified
separately and are never dropped by the fence. The ownership code is byte-identical to the accepted BA
identities (`mock-ai.ts` e93e2ca7, `producer-session.ts` 5c23bf06, `sign-out-flow.ts` a044ad46, `AppShell.tsx`
59d23c8d, `SignOutDialog.tsx` 4d1bab7a). Accepted evidence: `producer-session.test.ts` (11), `sign-out-flow.test.ts`
(43, incl. the AY gate → Stay / wait / Leave cases and the AZ/BA lease cases), `mock-ai.session.test.ts` (AW (a)
sign-out cleanup, (b1)–(b3) replacement sessions, retained fence, closing refusal) and the AY/AZ/BA browser
scenarios recorded above. BC adds one focused regression naming the finding's producer: a pending discovery
generation counts as unretained work for the gate (`opps:p1`), and after the first successful sign-out cleanup
its late response is refused with the typed error, the shell snapshot is untouched (same reference), no batch is
sent and a replacement session of the same user starts with no pending work (`mock-ai.session.test.ts`, 23).

**P2 4126074747 — the workspace status printed on white-label reports.** `WorkspaceSaveStatusBar` is shell
chrome mounted by `AppShell` inside `main`; the report print stylesheet hid `aside`, `header` and the toaster but
not this bar, so "Workspace saved." / unsaved / saving / unconfirmed + Retry / conflict + Retry would print at the
top of every proof-report page. Correction (`src/components/WorkspaceSaveStatus.tsx`, blob `70a6cb38`, one
class): the shared `base` class list of every rendered state carries the existing `print:hidden` utility (the
same convention `AppShell`'s mobile header and `/app/report`'s controls use). Screen roles (`status` / `alert`),
live regions, Save now / Retry buttons, keyboard focus and all save/state/permission logic are unchanged; no
report content changed; `SignOutDialog` is a modal that is not reachable while the report's Print control is
used, so it was left alone. Regression: `workspace-save-status-ui.test.ts` (9) asserts the root element of every
rendered state carries `print:hidden` with nothing inside opting back in, and `notReady` still renders nothing
(fails on the previous component). Local print-media rendering (harness on 5191, real AppShell + real store +
real status bar, a FICTIONAL `#proof-report-print-root` report shell added to the fixture; every `@media print`
rule applied through the fixture's emulation switch and read back through computed styles, then restored):
`saved` — screen `display:flex` "Workspace saved.", print `none` (zero rect) while the report body stays `block`
and the header is `none`; `unconfirmed` after a refused save — screen `role="alert"` with a focusable
`type="button"` "Retry save", print `none` for the bar and its button while the report body stays `block`; after
restoring screen media the bar and Retry are visible and focusable again. No real print job, save, write or
production page was involved.

## Codex independent BC verification — combined release candidate

Reviewed the minimal shared `print:hidden` class change and both added regressions. Independent 4 focused suites /84 tests, TypeScript, Vite build, and diff checks passed. Ownership source is unchanged from accepted BA; normal main integration d50db994 preserves the same application tree as 790b9bc. The new discovery regression exercises the real producer and store with a mocked deferred transport; it checks pending classification and refusal of a late result after store reset, not live production authentication. Prior BA event/browser sign-out evidence remains applicable.

An independent Chrome tab on the local 5191 fixture used actual browser print-media emulation (`matchMedia('print') === true`), without applying the fixture's CSS rewrite switch. In saved and unconfirmed/error states the status root computes `display:none`, has zero width, and Retry has zero dimensions; the fictional proof report remains `display:block`. Restoring normal media restores the visible `flex` alert and an 86px Retry button; Tab then Shift+Tab focuses Retry. Emulation was reset and the review tab closed. This is genuine local print-media rendering of the real shell/status component, not a printed PDF or production report acceptance.

Release this combined save-status/sign-out/producer candidate directly to main after exact-head independent reviews and checks. PR165 must remain unmerged until it can be closed as superseded after this combined production release. No migration or provider call is introduced here.
