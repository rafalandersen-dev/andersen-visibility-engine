# Current project work in Notifications

The top of Notifications now offers a private, read-only view of the selected saved project. Choose a project, then refresh to check its current records. Each queue page checks up to 50 candidates; use the page controls to inspect the rest. The database filters pending/review-required rows before applying the bound, so terminal history cannot hide current holds. Its exact matching count must equal the returned data and stay within 1,000 records or the check fails visibly. No truncated queue is represented as empty.

Review-required queue rows appear even when their original dates have passed or their browser status says Approved. Milo rederives the saved publication version and reads its private approval. A valid approval on a held queue is shown as **Approved version is still held**; it does not resume publication. Pending rows due within 24 hours or already late also appear when their exact version lacks approval. Cancelled, published, publishing and failed rows do not become approval demands. Existing failure/recovery inbox entries remain available below.

Open the editor to review the current deliverable. Use the calendar for an explicit resume, reschedule or cancellation decision. Dates are never moved by this view. A valid approval is not proof of fresh sources, passed destination checks or publication readiness; the actual publication path still applies all those gates. An intentional automation pause is shown separately from existing publication holds.

For enabled weekly projects, the view reads this week and next week in the saved project timezone. It shows actual queue/slot states, retained cancellation and uncertain stage states. The last saved summary has its own timestamp and is explicitly historical: an earlier capacity-required or context-changed result is not a fresh capacity/source diagnosis. Open schedule settings to inspect the existing weekly controls, summary history and cancellation actions.

Rows are derived on demand and identified by queue ID. They naturally disappear when their source state changes; they are not dismissible incident records. Refresh runs every minute while the view is open, with manual refresh available. A failed recheck hides the previous report and shows an error. Account/project changes use separate query keys and reset pagination. Workspace revisions are checked again before returning the report; database state can still change after the check, and all action handlers revalidate their own authority.

## Email and scope boundaries

This feed has a separate authenticated server function and does not call the operational-notification synchronizer, persist notification rows, queue a digest or call delivery. It cannot enter either the existing email queue selection or its delivery recheck. The existing inbox/outbox and timers are unchanged. No migration, notification sweep, email test, provider call, source refresh, account change or client publication is required for this feature.

This is owner/project awareness, not team membership or delegated recipients. It does not complete all R06 team delivery, browser acceptance or broader R00–R24/D01–D08 acceptance. HTTP/static component checks do not establish signed-in browser acceptance.
