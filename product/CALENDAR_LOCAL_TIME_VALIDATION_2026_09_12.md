# Calendar local-time validation — 12 September 2026

Reviewed source 05a40f8. The Plan calendar scheduling handler still parsed datetime-local values with permissive Date normalization, unlike the corrected editor. Its preferred-time helper could also shift a spring-gap time or overflow into another calendar day.

The calendar handler and dialog now use the shared strict local parser. Invalid selections disable scheduling and show the existing localized invalid-time message connected to the labeled input. The handler rejects invalid input before its target-saving or schedule calls. The default helper accepts a preferred time only if its local day, hour and minute survive construction unchanged; otherwise it follows the existing fallback to 09:00 or a valid later same-day slot, displayed for confirmation.

Two new default-slot regressions cover day overflow and a spring clock gap. All 44 calendar/formatter tests pass in each of Europe/Stockholm, America/Los_Angeles and Asia/Kolkata. Full types, production build, scoped lint and whitespace checks pass. Logs: /tmp/milo-calendar-gap-types.log and /tmp/milo-calendar-gap-build.log.

No live schedule or deployment occurred. Repeated autumn times retain the existing earlier-occurrence selection. Real-browser interaction/accessibility and live publication acceptance remain open; these local tests do not establish delivery.
