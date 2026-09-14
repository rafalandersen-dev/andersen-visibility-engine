# Calendar time-field editing — 12 September 2026

Reviewed source 62c0c6f. ScheduleDropDialog used an empty time string to replace its date-time input with a past-day warning. Clearing the input therefore removed the control and prevented re-entry in the same dialog, even for a future day. The recently added invalid-time message also classified an empty input as a nonexistent local time.

The dialog now distinguishes empty input, invalid nonempty input and a day with no available default slot. Clearing a future-day value keeps the labeled input visible, without an invalid-time alert; the schedule button remains disabled because strict parsing returns no instant. The past-day warning is retained when the selected day has no available default slot and the field is empty. The existing strict handler guard and server validation remain unchanged.

Full TypeScript passes (/tmp/milo-calendar-clear-types.log); scoped lint and whitespace checks pass. This small reversible UI condition change was reviewed in the diff; no new implementation-mirroring test or production build was added. Browser interaction/accessibility acceptance remains outstanding.

No target save, schedule, provider or deployment action occurred. Release and real-use acceptance gates remain open.
