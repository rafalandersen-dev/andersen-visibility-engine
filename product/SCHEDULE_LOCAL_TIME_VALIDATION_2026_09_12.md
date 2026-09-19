# Local scheduling time validation — 12 September 2026

Reviewed source 0d64c0f. The editor previously accepted any local datetime that JavaScript Date could normalize. A spring clock-change gap such as Stockholm 2026-03-29 02:30 silently became 03:30. Invalid calendar days could similarly overflow.

The local input parser now requires the minute-precision datetime-local shape and exact local round-trip equality. Nonexistent local times and calendar overflow are rejected. The editor disables scheduling for an invalid selection and connects the existing localized invalid-time message to the field with aria-describedby and aria-invalid. The existing handler guard also prevents scheduling when parsing fails. Server validation remains unchanged.

Seven new cases cover malformed/offset input, impossible calendar dates, 24:00 normalization, an ordinary minute and spring gaps. All 24 formatter tests pass separately in Europe/Stockholm, America/Los_Angeles and Asia/Kolkata. Full TypeScript, build, scoped lint and whitespace checks pass. Logs: /tmp/milo-schedule-gap-types.log and /tmp/milo-schedule-gap-build.log.

Repeated autumn clock times retain JavaScript Date's earlier-instant selection; this change does not introduce an occurrence selector. Real-browser accessibility and live publication acceptance remain open. No schedule, generation, provider call or deployment occurred.
