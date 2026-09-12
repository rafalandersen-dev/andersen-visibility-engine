# Plan localization — 12 September 2026

Status: release candidate. Includes released PR132 and canonical main `2190dd9987616d1d2a206b53892fd711e8e10b32` through a normal merge. No Plan migration or deployment has been issued.

Plan still mixed English controls and date labels with the selected interface language. This change adds 113 messages in English, Polish, Swedish and Danish, plus matching French authoring copy that stays outside the runtime and picker. It covers discovery, manual entry, board/calendar actions, orphan/stacked drafts, archived work and sample labels. All current dictionaries and staged French contain 2,963 keys.

Planning dates retain their original calendar meaning: date-only targets parse at local noon, scheduled instants display on the browser's local day, and audit-style risk dates stay UTC. Numeric date payloads, week boundaries and schedules are unchanged. Source labels share the existing provenance resolver with an optional translation callback; callers that omit it keep their original English labels. Manual intent and priority options retain explicit original values. The conditional impact field uses the same translated priority labels as the cards.

The wording distinguishes work targets from publication schedules, describes the actual project/services discovery inputs, retains duplicate/skip outcomes, and removes unsupported claims that every unlinked draft will publish or that archive deletion/recovery controls exist on this screen. Acceptance/manual-addition messages use the visible Idea stage while stored status stays captured. Supplied content, source evidence, authority, lifecycle transitions, provider calls and publication permissions are unchanged. No migration is required.

Validation: 166 focused checks across 13 files, full TypeScript and changed-file lint pass without diagnostics. Date-only targets and serialized local instants pass in Stockholm and Los Angeles. The full local suite passes 4,360 tests across 304 files with unchanged deadlines; the production build passes. The final conditional impact-label replacement is followed by targeted localization/source/date checks, full types and changed-file lint, with exact-head CI required for the final build and full suite. Shared service errors, route-head metadata, wider localization and actual fluent/signed-in acceptance remain open.

## Date and source contracts

The extracted `formatPlanningDate` helper preserves Plan's original distinction between date-only targets and full timestamps. Original English full/short forms remain; invalid source strings return unchanged and invalid Date objects display an em dash. Linked-draft memoization includes the selected locale. Publish-risk dates preserve UTC for audit-style timestamps and local clocks for armed schedules. Orphan and stacked draft dates use the same helper. Date inputs, `yyyy-MM-dd` payloads, scheduling eligibility and weekly boundaries retain their existing behavior.

`opportunitySourceLabel(opportunity, translateLabel?)` remains a pure helper. It normalizes legacy sources, respects primary-source precedence and distinguishes manual entry from Milo discovery. The optional callback localizes display only. Plan search uses the current locale without mutating supplied titles, reasons, evidence or stored provenance. Existing callers without the callback retain English labels.

## Validation and evidence

- Initial date foundation: 41 checks across three files in Europe/Stockholm; 23 checks across two files in America/Los_Angeles. Logs `/tmp/milo-ui-plan-date-{stockholm,los-angeles,types,lint}.log`.
- Orphan/archive extraction: 150 checks across 12 files, types/lint, followed by French grammar checks. Logs `/tmp/milo-ui-plan-archive-{tests,types,lint}.log` and `/tmp/milo-ui-plan-archive-french-tests.log`.
- Discovery/manual extraction: 123 checks across ten files, types/lint. Logs `/tmp/milo-ui-plan-discovery-{tests,types,lint}.log`.
- Combined 113-message candidate: 166 checks across 13 files, types/lint with no diagnostics. Logs `/tmp/milo-ui-plan-final-{focused,types,lint}.log`.
- Full local run: all 4,360 tests / 304 files pass with four workers and unchanged deadlines in 150.27 seconds. Production build succeeds. Logs `/tmp/milo-ui-plan-full-tests.log` and `/tmp/milo-ui-plan-build.log`.
- A final review found the conditional impact field still displayed an English enum. It now reuses translated priority labels; the final targeted checks/types/lint are recorded in `/tmp/milo-ui-plan-final-display-{tests,types,lint}.log`. Final-head CI must validate the resulting full build and suite.

All 2,963 keys match across the four current dictionaries and the staged French authoring catalog, now 14 batches. Placeholder, uniqueness, runtime-exclusion, source-precedence and unchanged-record tests pass. The static rendered-string inventory is down to three Plan proper-name candidates (Search Console and Milo Score), with zero in OrphanLane, StackedDeck and SampleBadge. This is a limited source triage; conditional/shared service descriptions and supplied values are not exhaustive screen acceptance. Inventory `/tmp/milo-ui-plan-embedded-inventory.json`.

## Remaining acceptance and progress

Shared service errors and check notes, route-head metadata, other screens, reports/policies, the remaining EU languages, selective loading and fluent/signed-in acceptance remain open. French is still staged outside the runtime and picker. No actual provider, generation, upload, publication, email, invitation, funding or credential action was performed.

Overall delivery remains about 60%, implementation about 75% (weighted 58.25% / 73.5%). This partial screen candidate does not change group scores or establish paid-launch readiness. Public paid launch remains NO-GO. Earlier incremental commits and checks are retained as history; do not repeat completed extraction.
