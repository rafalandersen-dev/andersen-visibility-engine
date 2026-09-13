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

`component` renders the actual `MiloConversationWorkspace` with React Query and eight scenario groups:

1. A submission retains task identity, project scope and the explicit generation flag; rapid repeated submission dispatches once. Handoff, specialist response, receipt link and escaped untrusted text render.
2. Remounting reads retained history without executing again.
3. Failed history refresh hides the previous private content and prevents new work.
4. A late request from an unmounted client does not appear in another owner's identically named project ID; collaborators have no owner generation control.
5. Pending work is explicitly resumed; cancellation state is observed.
6. An uncertain submission is checked with the original immutable request, not a new paid attempt.
7. Keyboard submission, UTF-8 byte limits and older/latest history pagination remain coherent.
8. Long client names and task text fit the viewport, with associated composer labels and help text.

`full` renders the actual home route, shell and router. Four groups check the primary chat entry and Today destination; bookmarked own-project selection updates downstream editor context; the real client selector isolates repeated project IDs and keeps sidebar/composer/result destinations in that client; shared-only selection and a failed membership-directory refresh remove stale shared conversation content. Shared navigation intentionally exposes conversation/account destinations while broader project features still require independently authorized shared views.

`generation` renders the actual archive route and `GenerationResultsPanel`. Three groups check an exact receipt deep link and synchronized project context; withholding a same-owner result from another project; and ignoring a delayed read when the user has already selected a newer receipt. The fixture does not exercise restoration, deletion, image signing or download.

## Observed on 13 September 2026

All eight component groups passed at 390 × 844 in EN, PL, SV and DA. Four full-route groups passed in EN/PL at 390 × 844 and EN/SV/DA at 1280 × 900; the PL and DA desktop layouts were visually inspected, as were the English mobile layout and earlier component desktop/long-copy layouts. The generation mode passed all three groups in EN at desktop width. Manual mobile history selection collapsed the list and returned focus to its toggle; the actual mobile menu opened and closed, and the viewport override was reset. Browser checks are separate from the unit/SQL suite and do not establish live authentication, concurrent multi-tab execution, provider cost, target migration compatibility, fluent-language review or production acceptance.

The full-route check initially caught a real inconsistency: the chat switched to a client but the sidebar footer still named the previous owned project. The shell now receives explicit project context, own-project choices synchronize the existing store, and shared home/result links preserve owner/project scope. The failing assertion was retained and passed after the product correction.
