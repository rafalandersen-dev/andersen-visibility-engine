# Automatic scheduler guidance correction

Prepared after 840c80f on codex/milo-report-branding-authority-20260912. Unreleased; overall 60% / implementation 75%, paid NO-GO and existing release/provider/acceptance boundaries remain unchanged.

The automatic scheduler hint presented article preparation with approved hooks as unconditional; the mode hint described automatic mode as scheduling real go-lives at each slot. Current source shows conditional outcomes. auto-scheduler.server.ts caps new work to authoritative quota and available slots, resolves links using collected page data, holds drafts without a valid hook or with publishing blockers, and can leave a ready draft after a queue failure. scheduler-approval.server.ts re-reads current configuration and saved content, requires automatic mode, checks publication blockers and exact-version equality, then requests an atomic queue/approval commit. A configured mode is not proof of a future successful publication.

Corrected autoSched.hint and autoSched.modeHint in EN/PL/SV/DA and staged FR/DE/ES/IT. Guidance now describes attempted preparation and scheduling, review holds, available quota/page data, and the absence of guaranteed slot filling or successful publication. Approval-first preparation remains explicitly unscheduled. The description no longer hardcodes the approximate monthly trigger date; scheduling implementation is unchanged. Quotes match existing mode labels.

Two existing keys per catalog changed; no new keys, modes, automatic jobs, generation calls, saved settings, approvals or publishing controls changed. DE/ES/IT workflow fingerprints reflect the reviewed English change. Original source revision identifiers remain historical baselines with this document recording the follow-up.

Validation: runtime and four staged catalog suites plus existing hook-selection, scheduler-budget and scheduler-approval suites; full TypeScript and production build. Logs /tmp/milo-scheduler-claim-{tests,types,build}.log. These are local/mocked checks and do not establish real unattended generation/publication acceptance. Other recorded source-claim and language/interface acceptance work remains open.
