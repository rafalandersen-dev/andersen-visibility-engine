# Local scheduling input minimum — 12 September 2026

Reviewed source d3c4e39. The editor used an ISO UTC slice for the minimum of its datetime-local input, although the input and submitted value use the browser-local clock. In Stockholm this produced a minimum two hours earlier in summer; in Los Angeles it produced one seven hours later. Near midnight it could also show the wrong local calendar day.

The minimum now uses local date components and the existing local time formatter. The future instant is rounded upward to minute precision so truncation cannot put the displayed minimum before the five-minute lead interval at render time. Server lead-time validation remains authoritative, including time elapsed while the form stays open. No scheduler permissions or dispatch behavior changed.

Three regression cases cover local midnight/calendar boundaries, summer late-evening values, ISO round trips and invalid input. All 17 format tests pass in each of Europe/Stockholm, America/Los_Angeles and Asia/Kolkata (51 executions, not 51 distinct tests). Full TypeScript and production build pass: /tmp/milo-schedule-local-min-types.log and /tmp/milo-schedule-local-min-build.log. Scoped lint and whitespace checks pass.

This verifies local serialization, not real scheduled publication or browser acceptance of every daylight-saving transition. No live schedule, publication or deployment occurred. Release and real-use acceptance gates remain.
