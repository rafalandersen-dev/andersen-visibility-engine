# Workspace save and sign-out review — 28 September 2026

A global shell status now makes unsaved, saving and unconfirmed workspace changes visible. Explicit retry/save-now controls preserve local edits. Sign-out performs one save attempt and offers Stay, Retry, or explicit Leave when persistence is not confirmed. Pending authentication is fenced against view disposal and session replacement while preserving normal auth-store-reset cleanup.

Claude implemented AS/AT/AU; Codex independently reviewed coherent stages. AS: 861 tests, types and build. AT: 821 tests, types/build plus 15 independent lifecycle regression checks; real-browser normal auth cleanup navigates once, stale/remounted/replaced sessions do not navigate, and failed stale auth does not show a new-session error. Save now persists unscheduled dirty state in one batch. These are local fixtures, not production acceptance.

AU changed only SignOutDialog relative to the accepted AT source manifest. Independent types/diff check and 47 focused tests pass. Actual desktop and 375px browser checks read initial focus without first targeting dialog controls: pending-save and rejected-save focus Stay; Tab cycles Stay/Retry/Leave inside the dialog. Pending auth focuses the alertdialog itself; refusal restores Stay. Escape returns focus to the desktop or mobile Sheet sign-out opener. The mobile viewport was reset and reviewer tab closed. Save algorithms, store and locales remain byte-identical to accepted AT.

The native beforeunload prompt has not been independently proved; only synthetic event behavior is verified. No real auth/provider/database/publication/deployment action occurred in these fixtures. Existing USD50 monthly budget and manual free-account allocation remain unchanged.

This candidate is stacked on the discovery-save-recovery branch (PR164) and depends on PR163 then PR164. Do not merge into that feature branch. After prerequisites release, integrate main normally and obtain checks for the resulting commit. Exact code/security reviews and non-generative release checks remain required. No migration accompanies this candidate.
