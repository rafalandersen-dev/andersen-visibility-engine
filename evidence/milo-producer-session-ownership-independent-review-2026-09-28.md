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
