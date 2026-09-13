# Milo conversation browser checks

These local fixtures render the real conversation component, central UI catalogs, application shell and selected TanStack routes. They use synthetic users, project directories, conversation responses and generated-result payloads. No provider call, real session, invitation, generation, payment or production write occurs. The full and generation modes use a fixture authenticated parent (`Outlet`), not the actual authentication/hydration layout. Their shared-only case verifies the home page's behavior, not live sign-in or the production onboarding gate.

From this worktree, start the development server on a free local port. The stylesheet link in `build.cjs` currently expects `http://127.0.0.1:5189/src/styles.css?direct`; adjust that local address if Vite uses another port. Do not stop a different task's server to acquire its port.

```sh
npm run dev -- --host 127.0.0.1 --port 5189
node scripts/milo-conversation-browser/build.cjs en component
python3 -m http.server 8774 --bind 127.0.0.1 --directory /tmp/milo-conversation-browser
```

Open `http://127.0.0.1:8774/` through the supported browser control. The fixture runs automatically and puts a JSON report in `#results`; success requires `completed: true` and every group passing. Rebuild with `pl`, `sv` or `da` and reload the page to change locale. Rebuild with `full` or `generation` as the third argument to change mode. Test at desktop and mobile widths; restore the browser viewport override afterwards. Stop only the servers started for this check.

## Coverage

`component` renders the actual `MiloConversationWorkspace` with React Query and nine scenario groups:

1. A submission retains task identity, project scope and the explicit generation flag; rapid repeated submission dispatches once. Handoff, specialist response, receipt link and escaped untrusted text render.
2. Remounting reads retained history without executing again.
3. A history-only read failure hides both the private answer and cached conversation titles, even if the directory request succeeded; recovery restores them.
4. Failed directory/history refresh hides the previous private content and prevents new work.
5. A late request from an unmounted client does not appear in another owner's identically named project ID; collaborators have no owner generation control.
6. Pending work is explicitly resumed; cancellation state is observed.
7. An uncertain submission is checked with the original immutable request, not a new paid attempt.
8. Keyboard submission, UTF-8 byte limits and older/latest history pagination remain coherent.
9. Long client names and task text fit the viewport, with associated composer labels and help text.

`full` renders the actual home route, shell and router. Four groups check the primary chat entry and Today destination; bookmarked own-project selection updates downstream editor context; the real client selector isolates repeated project IDs and keeps sidebar/composer/result destinations in that client; shared-only selection and a failed membership-directory refresh remove stale shared conversation content. Shared navigation intentionally exposes conversation/account destinations while broader project features still require independently authorized shared views.

`generation` renders the actual archive route and `GenerationResultsPanel`. Three groups check an exact receipt deep link and synchronized project context; withholding a same-owner result from another project; and ignoring a delayed read when the user has already selected a newer receipt. The fixture does not exercise restoration, deletion, image signing or download.

## Observed on 13 September 2026

All eight component groups passed at 390 × 844 in EN, PL, SV and DA. Four full-route groups passed in EN/PL at 390 × 844 and EN/SV/DA at 1280 × 900; the PL and DA desktop layouts were visually inspected, as were the English mobile layout and earlier component desktop/long-copy layouts. The generation mode passed all three groups in EN at desktop width. Manual mobile history selection collapsed the list and returned focus to its toggle; the actual mobile menu opened and closed, and the viewport override was reset. Browser checks are separate from the unit/SQL suite and do not establish live authentication, concurrent multi-tab execution, provider cost, target migration compatibility, fluent-language review or production acceptance.

The full-route check initially caught a real inconsistency: the chat switched to a client but the sidebar footer still named the previous owned project. The shell now receives explicit project context, own-project choices synchronize the existing store, and shared home/result links preserve owner/project scope. The failing assertion was retained and passed after the product correction.


## Auth/session follow-up

`node scripts/milo-conversation-browser/build.cjs en auth` renders the **actual AuthProvider, authenticated layout, workspace store, home route and conversation component**. The Supabase network interface, entitlement response and project-team responses are synthetic. It does not mock the session observer, store hydration, account-change guards or authenticated parent. Six groups check the signed-out redirect and preserved client URL; same-account token refresh retaining the exact composer and unsent text; account switching with delayed hydration and shared-only access; continued onboarding for owner-only views; sign-out clearing the actual store; and failure/retry with a late response after another account has started loading.

The first run exposed a redirect loop: while the old layout was still mounted during navigation, it could wrap `/auth` into another login redirect and overwrite the original destination. Auth/onboarding effects now apply only to workspace paths. The redirect assertion is unchanged and passed after correction. Earlier role requests are independently checked with the unit-tested session observer. An auth event supersedes the initial session read; only the current role observation can settle `isOwner`/`roleLoaded`; failures remain unconfirmed. No client-side role substitutes for server authorization.

Follow-up observations: all nine component groups passed in EN and PL after the additional title-hiding guard. All six actual auth/layout/store groups passed in EN and PL. New loading copy uses the existing translated `common.loading` key, so no language catalog size or activation changed.

## Two real browser tabs with local SQL

Build `node scripts/milo-conversation-browser/build.cjs en multitab`, then run `node scripts/milo-conversation-browser/multitab-server.mjs` from the worktree. Open `http://127.0.0.1:8775/` in two tabs. Keep the stylesheet server available at port 5189. This is a disposable, unauthenticated **loopback-only fixture** and must never be deployed. It allows only the fixed synthetic actor, bounded schema-validated conversation requests, static fixture files and the displayed fixture controls. There are no real credentials or provider calls. The in-memory database is discarded when the fixture process ends.

The fixture uses the real `20260911020000_project_team_reads.sql` and `20260913120000_milo_conversations.sql` procedures and public input schemas, with fixed synthetic users/memberships. Server-function HTTP middleware, native specialist execution and monetary admission are not invoked here; their separate backend tests remain necessary. Each acquired SQL claim holds a simulated response until the **release** control is clicked. **pending** seeds a saved pending turn, **expire** makes the fixture's current claim lease expire, and **revoke** removes access to the first client. Controls are test infrastructure only.

Observed in two independent browser tabs on 13 September, in this order:

| Scenario | Evidence |
| --- | --- |
| Two different simultaneous submissions into the same conversation | 2 begin requests, 1 rejected begin, 1 acquired simulated execution |
| Cancellation from the other tab, followed by release of a late result | 1 cancellation, 1 rejected late result; no completed simulated answer |
| Reload both tabs | Both read the same cancelled turn; execution count stayed 1 |
| Simultaneous resume of one saved pending turn | 2 resume requests; execution count increased by exactly 1 |
| Expire that claim and release the late result | UI showed unknown outcome with no resume button; second late result rejected |
| Explicitly submit a distinct new task after the unknown outcome, then release | Third acquired simulated execution; exactly 1 simulated answer completed and retained |
| Reload both tabs again | Same retained answer and historical unknown state; execution count stayed 3 |
| Revoke first-client membership | Automatic refresh removed private history and the composer in both tabs |
| Select second client with the same project ID | Empty second-client conversation; first-client content did not appear |

Final fixture counters: `beginCalls=3`, `rejectedBegin=1`, `resumeCalls=2`, `simulatedExecutions=3`, `cancelled=1`, `completed=1`, `lateRejected=2`, `seededPending=1`, `revoked=true`, `held=0`. SQL retained two completed turns (one is the initial seed), one cancelled turn and one unknown turn. After revocation, an attempted manual history-refresh click found no matching control because automatic polling had already unmounted the conversation; inspection of both tabs confirmed the unavailable state. The rejected selector was not evidence of a failed cancellation or a reason to repeat work.

PGlite serializes queries on one local connection. These browser/SQL checks prove the observed UI and SQL state transitions and deduplication across simultaneous HTTP submissions; they do **not** prove live PostgreSQL lock contention/MVCC, authenticated multi-user operation, target migration compatibility, provider cost or production acceptance. Run those separately before release. Stop only the task-owned fixture and stylesheet servers after inspection.

## Independent dispatch follow-up

The current multi-tab server additionally applies `20260913160000_milo_conversation_dispatch.sql`. Its SQL `net.http_post` stub stores only synthetic identifier envelopes; a local delivery loop processes them independently of the browser request. The fixture never calls the real network destination. Its retry loop invokes the real pending dispatcher once per minute. The initial completed seed precedes this migration; the **pending** control now deliberately creates an unarmed legacy-style task, so explicit resume is required. `send` and `resume` return saved state immediately, matching the new public server functions. Simulated execution still uses actual claim/check/advance SQL, with the **release** control standing in for a provider response.

Observed after this change on 13 September:

1. Submit a task, see **Request saved**, physically close the submitting browser tab, open a new tab: the same task is **Working**. Release its simulated response, reload: one retained specialist answer appears.
2. Submit another task, close that tab, reopen, cancel from the new tab, then release: the late response is rejected and the cancellation remains.
3. Seed an unarmed pending task, explicitly resume it, close that tab, reopen: precisely one additional execution is running. Expire the claim, release, reload: the UI shows an unconfirmed outcome and no resume control.

Final counters: `beginCalls=2`, `rejectedBegin=0`, `resumeCalls=1`, `simulatedExecutions=3`, `queuedDeliveries=3`, `rejectedDelivery=0`, `cancelled=1`, `completed=1`, `lateRejected=2`, `seededPending=1`, `held=0`. Raw SQL contains two completed rows (including the baseline), one cancelled row and one running row with an expired lease; the last projects to **unknown** in the UI and cannot be reclaimed. Both task-owned servers were stopped afterwards. Vite rejected font requests outside its worktree allowlist because of the shared dependency symlink; these state/interaction checks used fallback fonts and are not new typography acceptance.

These tests prove the observed browser lifecycle with local SQL and synthetic queue transport. They do not establish real pg_net delivery, production request duration, live PostgreSQL contention, current-session HTTP authentication or native provider cost. The separate backend integration test runs the actual private HTTP handler, executor and safe project tool against real SQL with synthetic model replies, and confirms that a duplicate delivery does not call the model again.
