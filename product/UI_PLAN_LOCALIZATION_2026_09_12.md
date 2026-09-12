# Plan localization — date display foundation

This separate candidate starts from reviewed editor PR132 head `5ffcf17c362260184ac6024059c04acdbe50cca9`. The editor candidate remains unchanged. No Plan PR, migration or release has been issued.

Plan's date labels now use the selected interface language across linked draft summaries, calendar-drop target/arming messages, the scheduling dialog, opportunity cards, archived records and drawer dates. The shared risk banner, orphan draft cards and stacked draft disclosure also receive the selected interface language. Memoized linked-draft details include locale in their dependencies.

The extracted `formatPlanningDate` helper preserves the existing Plan distinction: date-only targets parse at local noon, while full timestamps keep their browser-local calendar day. The original English full/short date forms are retained. Invalid source strings are returned as before. Shared audit-style risk dates stay UTC; armed risk dates retain local clocks. Numeric `yyyy-MM-dd` payloads, datetime inputs, due dates, weekly boundaries, actual schedules, eligibility and publishing rules are unchanged. This is display formatting only.

Validation:41 date/calendar checks across3files pass in Europe/Stockholm,23 date checks across2files pass in America/Los_Angeles, full TypeScript and changed-file lint pass with no diagnostics. Logs `/tmp/milo-ui-plan-date-{stockholm,los-angeles,types,lint}.log`. Date-only New Year targets and serialized local instants retain their intended day in both time zones. These checks do not establish real browser/signed-in acceptance.

The Plan screen still contains embedded English labels, conditional messages and shared service descriptions. Those are the next extraction work; no additional interface language is enabled. Keep supplied content, email/content language choices, market/currency settings and owner authority separate. Overall60%/implementation75% estimates remain unchanged while this follow-up is unreleased.
