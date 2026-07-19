# Milo Growth — create→publish flow redesign

Analiza wielagentowa (28 agentów: 4 czytające kod, 4 research, 4 niezależne propozycje, 12 ocen, 3 ataki adwersaryjne, 1 synteza). 2026-07-19.

Autor analizy: Claude Code (workflow `milo-flow-redesign`). Wynik jest **rekomendacją do wdrożenia**, nie opisem stanu.


## Wynik panelu

| Propozycja | Suma /30 | ból właściciela | wykonalność | zrozumiałość dla laika |
|---|---|---|---|---|
| The Line — a production pipeline with one queue called "Up Next" | **24** | 8 | 8 | 8 |
| Repair the Wiring — Six Doors, No Dead Ends | **22.5** | 8 | 8.5 | 6 |
| Pages: the document is the product, the opportunity is the footnote | **22** | 8 | 7 | 7 |
| The Work Surface — one destination, three views, one detail pane | **21.5** | 8 | 7 | 6.5 |

Zwycięzca: **The Line — a production pipeline with one queue called "Up Next"**. Ataki adwersaryjne znalazły **10 blokerów**, wszystkie ujęte poniżej.


## Rekomendacja

Build "The Line" as the backbone — one derived pipeline stage, six named stages plus two exception lanes, one primary action per stage, and an "Up Next" queue on Home — but keep every URL, every destination, and every screen exactly where testers left them, which is what "Repair the Wiring" got right and The Line got wrong. Stage is derived by one pure function `pipelineStage(opportunity, asset)` that reads the workspace blob only (`asset.scheduledPublishAt` / `scheduledPublishStatus`), never a Postgres lookup; `scheduled_publishes` stays the executor and backs one global queue view. This kills the SSR flash, the multi-project gap, and the "zero new collections" contradiction the attacks exposed, at the cost of one small writeback that increment 0 adds anyway. Approve is severed from publishing permanently: "Looks good" is an editorial verdict that ships nothing, "Schedule" is a separate arming act whose button label carries the resolved timestamp, "Publish now" is the confirmed irreversible branch, and "Cancel" cancels the go-live, not the work. The `autoPublishApproved` mode is retired, not reinterpreted — read-time coercion to `manualLive` with a one-time blocking modal on first load, because both attack angles showed that any reinterpretation either auto-arms a historical backlog of Approved assets onto a customer's live site or silently degrades a tester's automation to nothing. Increment 1 does not build UI at all: it proves the committed cron runner actually fires and fixes the six publishing-safety defects the attacks found, because removing the only working publish path before the queue drains would take beta throughput to zero while the UI reports success. The Plan calendar keeps two layers from day one — ghosted `dueAt` target weeks and solid armed go-live dates — so no tester opens a blank month and reads it as data loss. Everything else (Live column, Needs fixing lane, Sent-to-site stage, orphan lane, stacked multi-asset cards) follows from the same derived vocabulary rendered by one chip on every surface.

## Dlaczego ta, a nie pozostałe

The Line won 24/30 on the strength of one idea the other three all independently reached for and none executed as cleanly: a single derived stage, computed rather than stored, so legacy values ('New', 'Linked', 'In Brief', 'Discarded') and the 20+ ungoverned `updateOpportunity` writes cannot corrupt it, and the failure mode of a bug is a wrong label rather than a corrupted workspace. Every other proposal's salvageable-ideas list names some version of that function, which is the clearest possible signal it is the right backbone. It also scored highest on the owner's stated pain because it answers his open question ("should Content be its own tab?") with a structural decision rather than an opinion: creation is not a place, it is the primary action of a stage. Its three deductions were all repairable inside the same architecture and are repaired here — the buildability judge's 43-typed-route-reference objection is fixed by dropping the renames entirely (Repair the Wiring's core insight, which scored 8.5 on that lens, the highest single score in the field); the pain judge's "the calendar goes blank" objection is fixed by the two-layer calendar; the novice judge's "The Line is factory jargon" objection is fixed by not naming a destination after the metaphor. Pages and The Work Surface both lost on the same fault: they rewrite `app.plan.tsx` (1348 lines, rewritten hours ago in c065e09) to change what a card *is*, priced at two days and realistically a week, on the file a second agent is most likely to touch. I verified the two load-bearing claims myself: `scheduleContentPublishFn` / `cancelScheduledPublishFn` / `listScheduledPublishesFn` have zero importers anywhere in `src/`, and `scheduledPublishAt` has zero writers anywhere in the repo despite being declared at `src/lib/types.ts:607`. The engine is real and completely dark, which is exactly why increment 1 lights it up instead of starting something new.

## Approve / Schedule / Publish / Cancel — dokładna semantyka

FOUR VERBS, NO OVERLAP.

1. LOOKS GOOD (replaces Approve). Sets `ContentAsset.status = 'Approved'` and writes `readyAt`. Zero distribution side effect, in every mode, with no exceptions and no setting that changes this. Toast: "Ready. Nothing is published yet." Next action on the card becomes "Set go-live date". Reversible via "Needs work", which returns the asset to Draft with a note. `runAutoPublishOnApprove` is removed from `approve()` (app.editor.tsx:358-385) AND 'Approved' is removed from the status `<Select>`'s side-effect path (app.editor.tsx:452-454) — a dropdown must never distribute to the public internet, and that dropdown is the path the owner was actually ambushed by.

2. SET GO-LIVE DATE → SCHEDULE. Two steps, deliberately. Picking a date is inert and freely editable; it writes `dueAt` only and shows "Target: Tue 21 Jul". Arming is a separate press of a button whose label is the resolved consequence — "Schedule for Tue 21 Jul, 09:00 CEST" — and only that press calls `scheduleContentPublishFn`. The client sends an offset-bearing ISO instant plus the IANA zone; the server rejects zoneless input outright. Arm-time guards: only assets deriving to Ready may be armed; assets carrying `publishedDraftUrl` (already sent to the site) may not be armed without an explicit re-publish confirmation; custom-endpoint projects must either have `publishStatus === 'sent'` or a configured draft endpoint, refused at arm time with the reason rather than accepted and failed silently at fire time. Arming writes `asset.scheduledPublishAt` + `scheduledPublishStatus` through `mutateWorkspace` — the field is declared at types.ts:607 and has zero writers today, so without this every scheduling UI renders blank.

3. PUBLISH NOW. The irreversible branch, kept because the owner needs it, demoted to a secondary control behind the real confirmation dialog that already exists on the manual path (app.editor.tsx:699-734), naming the article, the connector and the domain. The `publishStatus === 'sent'` render gate (app.editor.tsx:558) moves out of the condition and into per-connector capability data in `publish-targets.ts` — it is a custom-endpoint requirement leaking onto WordPress and Shopify.

4. CANCEL. Cancels the go-live, not the work. The draft survives and returns to Ready. `cancelActiveRows` is scoped to `status = 'pending'` only and returns a count; if a row is already `publishing`, the call returns `{cancelled:false, reason:'in_flight'}` and the UI says "This is going out right now and can no longer be stopped — you can unpublish it from your site." Never release the partial-unique-index guard on an in-flight row.

FATE OF autoPublishApproved: RETIRED, not reinterpreted, not deleted from the type union. On project read, `publishMode === 'autoPublishApproved'` is coerced to `manualLive` (read-time coercion, borrowed from The Work Surface) — nothing is written to any workspace blob, so there is no migration and no tester config becomes invalid. On first load after increment 2, any project whose stored mode was `autoPublishApproved` gets a one-time blocking modal: "Approving no longer publishes your article. Here are N approved articles that are not live — arm each one, or skip." Every item is listed with an explicit arm/skip choice and a resolved timestamp; nothing is armed silently. The Line's proposal to reinterpret the mode as "auto-arm at the next free cadence slot" is rejected outright: because stage is derived there is no transition event to hook, so "reaches Ready" can only be a predicate over the current set, which on a workspace like butelki-wodorowe would arm every historical Approved/Exported asset at once and publish an entire backlog to a customer's live site — a strictly worse version of the exact complaint this design exists to fix. The degrade-to-suggestion fallback is rejected for the same reason attack C found it: it silently takes automation to zero for three increments. Auto-scheduling may return later as an explicitly event-scoped, opt-in "Auto-schedule approved content" that only arms assets whose `approvedAt` is after the flag's activation timestamp, capped at N per project per week — but it is out of scope here and must not ship before metering.

FIRE-TIME RE-CHECK (non-negotiable). `publishAssetServerSide` currently never reads `asset.status`. It must re-derive the stage at fire time and refuse anything not deriving to Ready/Scheduled, throwing `PublishNotPossibleError` with "You sent this back for edits, so it was not published." Arm-time guards alone are insufficient: "Needs work", the status dropdown and draft deletion all currently leave the pending row armed. Symmetrically, every write that moves an asset out of Approved calls `cancelScheduledPublishFn` first and toasts "Also cancelled the go-live scheduled for Tue 09:00."

## Architektura informacji

FIVE nav destinations. ZERO URL changes — every route keeps its path, so no bookmark, no deep link, no typed route reference and no generated route tree entry moves. This is the single largest correction to the winner: `grep` counts 43 typed references across `"/app/plan"`, `"/app/editor"` and `"/app/analytics"`, and renaming them buys nothing a label change does not.

1. HOME (/app) — "Up Next": at most three cards, each one item, one stage, one primary action that either performs the action or deep-links to the exact record with context loaded. Below it, the pipeline strip as counts: "Ideas 12 · Queued 3 · Writing 1 · Ready 2 · Scheduled 4 · Live 9 · Needs fixing 1". Clicking a count filters the board. Ideas counts only suggestions with `status === 'suggested'` — never accepted or dismissed rows, which `replaceDiscoverySuggestions` retains forever (store.ts:585-588) and which would otherwise be double-counted as both Ideas and Queued. A persistent failure banner sits above Up Next whenever anything is in Needs fixing or the runner heartbeat is stale.

2. PLAN (/app/plan) — unchanged URL, label stays "Plan". Sub-nav children, all driven by the existing `search.view` (AppShell.tsx:386 must compare search params, not just pathname, or "Plan workspace" and "Discover" keep highlighting together): Board, Calendar, Ideas (today's Discover view), Drafts (the library list, a filter over Writing + Ready + Sent to site), plus the four analysis modules (Site audit, Competitors, Authority, AI visibility) whose CTAs now deep-link to `/app/plan?selected={id}`. Board columns become the derived stages including Live, Needs fixing and Sent to site — the `stages.filter(!== 'published')` line at app.plan.tsx:648 is deleted. Calendar renders two visually distinct layers permanently: ghosted `dueAt` target weeks labelled "Target — not scheduled" with an inline "Schedule for this date" action, and solid armed go-live dates from `publish_at`. An orphan lane renders assets whose opportunity is missing or soft-deleted, keyed on the asset itself, because those records still publish (`publish.server.ts` never reads `opportunityId`) and would otherwise be invisible everywhere.

3. DRAFT (/app/editor, unchanged URL, `?id=` search param preserved) — the full-page long-form surface, kept as a page and not crammed into a drawer. It leaves the top-level nav and becomes the "Drafts" child under Plan, so the word remains findable one level down for anyone scanning the sidebar for where their articles live. The header gains a breadcrumb back to its Plan card — today the editor's only outbound link in 39k characters is to Settings (app.editor.tsx:509) — and one "Where is this" chip rendering the derived stage plus, when Scheduled, "Goes live Tue 21 Jul 09:00 CEST — Change · Cancel", replacing three badges and the conditional live row. The brief (keyword, intent, evidence, business impact) sits directly above the draft, grafted from The Work Surface: it is the cheapest defence against Milo reading as a text generator.

4. INSIGHTS (/app/analytics) — Live items with GSC numbers, each linking back to its Plan card, and each able to write `needs_update` back onto the record so a refresh reuses the existing page instead of starting over.

5. SETTINGS (/app/setup). Backlinks (/app/backlinks) remains a paid add-on destination.

Removed as destinations: "Content" as a top-level group, "Proposals", and "AI evaluation" (moved behind the existing `isOwner` check used at route.tsx:67 — it is a founder's model A/B harness occupying half a customer-facing nav group). Deleted outright in increment 6: `app.calendar.tsx` and `app.opportunities.tsx`, which are redirect-only shells whose full implementations, including two dead `CreateContentDialog` mounts, still ship in the bundle. Two nav levels, no more.

## Idee przeszczepione z przegranych propozycji

- **Keep every URL; rename labels and i18n keys only. /app/plan, /app/editor and /app/analytics stay exactly where they are, and Content becomes a child of Plan rather than a renamed route.** (z: Repair the Wiring — Six Doors, No Dead Ends) — The winner's route renames touch 43 typed references plus a search-param-to-path-param conversion, are unbudgeted in its cost estimate and unscheduled in its migration path, and land on the three files churned hours ago in c065e09/fd08170 — the exact broad, low-value, merge-conflict-generating churn to avoid with a second agent in the repo. Repair the Wiring scored 8.5 on buildability, the highest single lens score in the field, largely on this discipline: 'a tester who logs in after this ships finds every screen exactly where they left it.'
- **Read-time coercion instead of data migration for retiring a config value: publishMode 'autoPublishApproved' is READ as manualLive, nothing is ever written to a workspace blob.** (z: The Work Surface — one destination, three views, one detail pane) — It removes the dangerous mode completely without removing a field from production project records, which in a flat JSONB blob is a migration. It also makes the change instantly revertible — one line in the read path — which matters for a live private beta.
- **One exported linkedAssetFor(item, content) called from every site that currently implements its own rule, and resolution by PRECEDENCE not recency: any asset with an active schedule wins, then any asset with a liveUrl, then currentContentAssetId, then newest.** (z: The Work Surface (the single-rule idea) + the production-data attack (the precedence ordering)) — Three different selection rules exist today for one relationship (app.plan.tsx:130-139 by updatedAt, store.ts:550-554 by currentContentAssetId, publish-outcome.ts:52-53 by the asset being published). Under newest-wins, generating a social pack on Wednesday hides an article armed for Tuesday: no armed treatment, no go-live line, no Cancel affordance anywhere in the product, and it publishes anyway. That is the owner's headline complaint reproduced by the fix for it.
- **Snapshotted provenance on the ContentAsset — kind / refId / title / rationale / capturedAt — rather than a live foreign key, plus Insights writing needs_update back onto the same record.** (z: Pages: the document is the product) — The 'why this exists' survives the opportunity being archived, restored (which today lies, app.plan.tsx:840-843), hard-deleted, or written by a connector with a legacy status. It is one optional field on an existing array member, needs no backfill thanks to a read-path shim, and it is the only mechanism in any proposal that closes the loop after publication — which is what keeps this feeling like an SEO product rather than a writing tool.
- **Reject maps back to a stage from which a new draft can be created, so rejection is an escape hatch rather than a trap; plus a compensating write on deleteContentAsset.** (z: Repair the Wiring) — contentStatus() has no Rejected branch (opportunities.ts:101-107), so a killed draft reports 'drafting' forever and inflates the dashboard counter. The winner's derived model fixes the stranding for free, but Repair the Wiring's framing — Reject is an action with a destination, not a terminal state — is what makes it usable.
- **Gate enabling pg_cron behind a UI surface for scheduledPublishError and the reaper's 'the outcome is unknown' sentence, and move the hardcoded production URL out of the migration first.** (z: Repair the Wiring (stated as a hard sequencing rule) and echoed by Pages) — scheduledPublishError is written by publish.server.ts and read by nothing. Turning on an unattended publisher that can fail invisibly, before the failure has a screen, is the single worst operational move available here. I verified the URL is still hardcoded at migration 20260719120000:182.
- **Home's hero counts the whole pipeline including un-accepted ideas, so a fresh workspace reads 'Milo found 12 ideas' rather than '0 of 0 actions complete' immediately after four successful AI calls.** (z: The Line, reinforced by all three runners-up) — Onboarding writes DiscoverySuggestions and never touches state.opportunities (mock-ai.ts:188), so every new account is greeted by a zero. Counting the AI's output at the moment it lands is the difference between 'it did nothing' and 'it did twelve things'.
- **Derive stage from the workspace blob (asset.scheduledPublishAt / scheduledPublishStatus), not from a scheduled_publishes row; Postgres stays authoritative for EXECUTION and backs only the global queue view.** (z: The migration-ordering attack (finding 3), against the winner's own stateModel) — scheduled_publishes is RLS deny-all, readable only via a per-project POST server fn that is not in ssrSnapshot or hydrate. Passing a scheduleRow into pipelineStage means either every armed item renders as Ready until a fetch resolves — with Up Next literally inviting the user to re-arm an already-armed item, which silently moves a go-live time they never intended to change — or putting the rows in the store, which is the State/emptyState/ssrSnapshot/hydrate edit the proposal claims to avoid. Blob-derivation gives correct SSR, works across all projects at once, and costs one writeback that increment 0 adds anyway.

## Plan wdrożenia — przyrosty


### 0. Truth-and-safety patch — no IA change, ships to beta the same evening

*rozmiar: evening · ryzyko: low*

**Co wchodzi:** Nine independent correctness fixes, each revertible alone. (a) MiloScorePanel's evaluate/improve route through the editor's existing aiAction guard (app.editor.tsx:291-296) so scoring stops silently discarding typed edits. (b) applyOutcome (publish-outcome.ts:54-66) guarded to the success path, so recording a FAILED scheduled publish on an asset that already has a liveUrl stops re-stamping the opportunity as published. (c) scheduleContentPublishFn writes asset.scheduledPublishAt + scheduledPublishStatus through mutateWorkspace, AND cancelActiveRows and both publish.server.ts writeback paths CLEAR them — verified: the field is declared at types.ts:607 and has zero writers anywhere in the repo. (d) scheduledPublishError rendered in the editor detail pane (three lines; today it reaches the user only via a database query). (e) delete replaceNewOpportunities (store.ts:735-742, zero callers, hard-deletes legacy 'New' records). (f) route mcp.server.ts:622 and pending-actions.server.ts:382 through newOpportunityRecord so the legacy-status surface stops growing. (g) the five module CTAs repointed from /app/opportunities to /app/plan?selected={id} — a route that exists today. (h) compensating write in deleteContentAsset. (i) move the cron URL out of migration 20260719120000:182 into a settings row, deployed against an empty queue.

**Dlaczego w tej kolejności:** Every later increment assumes the data it reads is the data the user typed. (c) in particular is a hard prerequisite: without both the write and the clear, a cancelled item keeps a go-live date forever, derives to Scheduled, and shows 'Goes live Tue 09:00' for something that will never publish.

### 1. Prove and harden the runner — engine only, zero UI

*rozmiar: day · ryzyko: medium · zależy od: 0*

**Co wchodzi:** The committed scheduling engine goes from dark to trustworthy. Enable pg_cron and smoke-test end to end on a real project: insert a pending row, confirm api.publish.run-scheduled claims it and the post appears. Add a runner heartbeat row. Then the six publishing-safety fixes: persist connector-returned ids (postId / articleGid) BEFORE validating liveUrl and treat a missing liveUrl as success-with-unknown-url, never a failure; narrow the retry class so only proven-nothing-created 4xx retries and every ambiguous timeout/5xx/unparseable response parks as failed; classify missing or invalid credentials as PublishNotPossibleError so they fail on attempt one instead of burning three; record the failure on the asset on EVERY attempt, not only at exhaustion; scope cancelActiveRows to pending only and report in_flight honestly; re-derive the stage at fire time inside publishAssetServerSide and refuse anything not Ready/Scheduled; give the custom-endpoint path the same send-then-publish sequence the manual path has.

**Dlaczego w tej kolejności:** I verified scheduleContentPublishFn, cancelScheduledPublishFn and listScheduledPublishesFn have zero importers anywhere in src/. Removing runAutoPublishOnApprove before this queue is proven to drain would take beta publishing throughput to zero while the UI reports success — strictly worse than the surprise-publish bug it fixes. It is also useful alone: it converts a committed-but-unverified engine into a verified one, and it fixes a live triple-publish path that exists today independent of any redesign.

### 2. Approve stops publishing; Schedule ships — the owner's headline complaint

*rozmiar: day · ryzyko: medium · zależy od: 1*

**Co wchodzi:** runAutoPublishOnApprove removed from approve() and 'Approved' removed from the status dropdown's side-effect path. The four verbs with their exact copy and toasts. The Ready-state schedule control in the editor, calling the now-proven scheduleContentPublishFn with a resolved-timestamp button label, an offset-bearing instant plus IANA zone (never a zoneless string), and the three arm-time guards. autoPublishApproved retired by read-time coercion plus the one-time blocking modal listing every approved-not-live asset with an explicit arm/skip choice. An overdue guard: a pending schedule more than 15 minutes past its time renders 'This should have gone live at 09:00 and did not.' Changelog entry and in-app notice.

**Dlaczego w tej kolejności:** First UI consumer of the engine, and the fix the owner actually asked for. It is shippable and useful with nothing else built — the vocabulary work behind it changes labels, not behaviour.

### 3. One vocabulary everywhere — pipeline.ts, StageChip and Up Next together

*rozmiar: multi-day · ryzyko: medium · zależy od: 2*

**Co wchodzi:** src/lib/pipeline.ts: PIPELINE_STAGES, pipelineStage(opportunity, asset) reading the blob only, nextAction(stage) as an exhaustive switch so a stage without an action fails typecheck. Execution classes inert/armed/terminal/blocked with a materially different treatment for armed. Exception stages: Needs fixing, Parked, Sent to site, Live (draft missing). Legacy mapping by EXCLUSION — parked = status in {'Discarded','archived'} or archivedAt set; dropped = deletedAt set; everything else active. Publish state strictly dominant over asset status, encoded as an ordered list with a test per pair. A vitest suite as the spec, with a case for every stored status actually observed in production and every asset-status × publish-state combination. Then StageChip on the board, the drafts list, Home and the draft header, and Up Next replacing buildNextActions. store.ts:542-562 splits read-model from write base.

**Dlaczego w tej kolejności:** Merged with what The Line called increment 3 because shipping the chip a week before Up Next puts two IA vocabularies on two destinations simultaneously — the exact incoherence this redesign exists to remove. Ships as four independently revertable commits (pure module with zero call sites; board; drafts list + draft header; store split) rather than one long-lived branch, because a second agent is in the repo and this touches the four largest recently-rewritten files.

### 4. The Plan surface tells the truth

*rozmiar: multi-day · ryzyko: medium · zależy od: 3*

**Co wchodzi:** Board columns become PIPELINE_STAGES, so Live, Needs fixing and Sent to site appear and the app.plan.tsx:648 filter is deleted. The two-layer calendar: ghosted dueAt target weeks with an inline 'Schedule for this date', solid armed go-live dates. Stacked cards for multi-asset opportunities so an armed asset is never hidden behind an inert one. The orphan lane for assets whose opportunity is deleted. 'Live (draft missing)' rendering with 'Open live page' and a rewrite path that carries the prior canonicalUrl forward. Batch bar.

**Dlaczego w tej kolejności:** Needs the vocabulary from 3. Independently useful: it is the increment where the owner's mission control stops hiding shipped work and stops rendering the payoff moment as the item disappearing.

### 5. The global queue and one gate in

*rozmiar: multi-day · ryzyko: medium · zależy od: 4*

**Co wchodzi:** A Scheduled / Live / Needs-fixing queue view over scheduled_publishes plus the derived stages — the 'what is going out this week and did anything break' surface that exists nowhere today, and where the surprise breeds. Module pages switch from addOpportunities to writing DiscoverySuggestion records via a new APPEND API (not replaceDiscoverySuggestions, which deletes every non-accepted suggestion for the project), with deduplicationKey minted per finding. acceptDiscoverySuggestions returns a per-suggestion outcome and the UI renders it: 'Added 3 · 2 already in your Line · 3 you parked earlier — [Unpark]'.

**Dlaczego w tej kolejności:** The queue view is the only place the whole week is visible at once. The suggestion switch depends on the Ideas view being real and on the stage vocabulary existing.

### 6. Cleanup and metering

*rozmiar: multi-day · ryzyko: low · zależy od: 5*

**Co wchodzi:** dueAt relabelled as a target week everywhere. CalendarItem generation deleted from onboarding (the generateContentCalendar call throws before reaching the model on every new project). app.calendar.tsx and app.opportunities.tsx deleted from the bundle with their two dead CreateContentDialog mounts. AI evaluation behind the existing isOwner check. Retired i18n keys nav.opportunities / nav.calendar swept in all four locales. And billing.ts:29-31's monthlyContentGenerations and monthlyMiloScores actually enforced — they are advertised on pricing.tsx:247 and have zero call sites.

**Dlaczego w tej kolejności:** Last because none of it blocks anything, but metering must land before any marketing push or any future auto-generation feature, and easier creation has been multiplying an unmetered AI cost since increment 3.

## Musi być naprawione przed wdrożeniem


- **BLOCKER — Reinterpreting autoPublishApproved as 'auto-arm at the next free cadence slot' would, on a workspace with historical Approved/Exported assets that never published (credentials missing at the time), arm the entire backlog at once and publish it to a customer's live site. Because stage is derived there is no transition event to hook, so 'reaches Ready' can only be a predicate over the current set.**
  - *Naprawa:* Retire the mode instead. Read-time coercion to manualLive, nothing written to any blob, plus a one-time blocking modal listing every approved-not-live asset with an explicit arm/skip choice. Never derive an arming decision from a derived stage.
  - *Źródło:* Production-data attack, finding 1; migration-ordering attack, finding 6

- **BLOCKER — An opportunity published months ago has canonicalUrl/publishedAt baked into storage by the old updateOpportunity. Its draft was later deleted. Under 'anything unknown → active' it derives to Queued with primary action 'Write it', Milo regenerates content for a page already live, and because the external id lived on the deleted asset the connector CREATES a second post at a new URL. Self-cannibalising duplicate content on an SEO product.**
  - *Naprawa:* pipelineStage returns a distinct stage 'Live (draft missing)' whenever opportunity.canonicalUrl or publishedAt is set with no resolvable asset, with primary action 'Rewrite this page' that carries the prior canonicalUrl into the new asset so the connector updates rather than creates. Add asset-missing × opportunity-published to the vitest matrix.
  - *Źródło:* Production-data attack, finding 2; migration-ordering attack, finding 4

- **BLOCKER — Resolving one asset per opportunity by newest updatedAt hides an armed asset behind a newer inert one: the card renders Writing, with no armed treatment, no go-live line and no Cancel affordance anywhere in the product, and the cron publishes the armed asset anyway.**
  - *Naprawa:* Resolve by precedence in one exported linkedAssetFor(): active schedule wins, then liveUrl, then currentContentAssetId, then newest. An opportunity with more than one asset renders a stacked card showing every asset's stage. Never collapse an armed asset behind an inert one.
  - *Źródło:* Production-data attack, finding 3

- **BLOCKER — A WordPress 200 whose response omits `link` makes publish.server.ts throw BEFORE the assetPatch containing the returned postId is applied. The runner classifies a plain Error as retryable, resets to pending, and the next tick re-runs with postId still absent, taking the CREATE branch again. Three identical live posts in ten minutes. Same shape for any ambiguous transport failure; Shopify has the identical path.**
  - *Naprawa:* Persist connector-returned ids via mutateWorkspace BEFORE validating liveUrl; treat a missing liveUrl as success-with-unknown-url. Retry only on proven-nothing-created 4xx; park every timeout, abort, 5xx and unparseable response as failed with the reaper's wording.
  - *Źródło:* Publishing-safety attack, finding 1

- **BLOCKER — publishAssetServerSide never reads asset.status. 'Needs work', the status dropdown and draft rejection all leave the pending row armed, so content the user explicitly rejected goes live on the customer's site.**
  - *Naprawa:* Re-derive the stage at fire time and refuse anything not deriving to Ready/Scheduled with 'You sent this back for edits, so it was not published.' Additionally, every write that moves an asset out of Approved calls cancelScheduledPublishFn first and toasts the cancelled go-live.
  - *Źródło:* Publishing-safety attack, finding 2

- **BLOCKER — cancelActiveRows updates rows with status IN ('pending','publishing'), so cancelling an in-flight run returns an unambiguous success while the article publishes anyway, and it releases the partial unique index so a second row can be armed for the same asset mid-run.**
  - *Naprawa:* Scope cancellation to status = 'pending' only and return the count. An in-flight row returns {cancelled:false, reason:'in_flight'} and the UI says it can no longer be stopped.
  - *Źródło:* Publishing-safety attack, finding 3

- **BLOCKER — The pg_cron job is not enabled and its URL is hardcoded in the migration. Shipping the arming UI first means testers arm articles, see 'Goes live Tue 09:00', and nothing ever fires — no row moves, no failure is recorded, and the stage keeps rendering Scheduled forever. The purest form of 'the user believes something is scheduled when it is not'.**
  - *Naprawa:* Increment 1 proves a live cron tick end to end before any UI ships, adds a runner heartbeat, and pipelineStage gains an overdue guard: a pending schedule more than 15 minutes past its time derives to Needs fixing.
  - *Źródło:* Publishing-safety attack, finding 4; migration-ordering attack, finding 1

- **BLOCKER — Nothing ever clears asset.scheduledPublishAt. cancelScheduledPublishFn only touches Postgres; the publish writeback sets status but never clears the date. A cancelled item derives to Scheduled forever and a published one carries a stale go-live date.**
  - *Naprawa:* cancelActiveRows and both publish.server writeback paths clear the field through mutateWorkspace, in the same increment-0 patch that first writes it. Three vitest cases as the spec: schedule→cancel→Ready, schedule→publish→Live with no residual date, schedule→fail→Needs fixing.
  - *Źródło:* Migration-ordering attack, finding 2

- **BLOCKER — pipelineStage's third argument (scheduleRow) has no data source. scheduled_publishes is RLS deny-all behind a per-project POST fn that is not in ssrSnapshot or hydrate, so every armed item renders as Ready until a fetch resolves, and Up Next invites the user to re-arm something already armed — which silently moves a go-live time they never chose. Wiring it into the store is the exact riskiest edit the design claims to avoid.**
  - *Naprawa:* pipelineStage takes (opportunity, asset) only and derives from the blob fields. Postgres stays authoritative for execution and backs only the global queue view, where a loading state is acceptable.
  - *Źródło:* Migration-ordering attack, finding 3; publishing-safety attack, finding 9

- **SERIOUS — 'archived' is not in the legacy map, so 'anything unknown → active' resurrects every deliberately archived opportunity as Queued work with a 'Write it' button. Soft-deleted records (deletedAt) resurface the same way.**
  - *Naprawa:* Map by exclusion, not enumeration: parked = status in {'Discarded','archived'} or archivedAt set; dropped = deletedAt set; everything else active. Vitest case per stored status observed in production, asserting archived and deleted never derive into a working stage.
  - *Źródło:* Production-data attack, finding 4

- **SERIOUS — The Plan calendar keys off dueAt and has been the working surface since the redesign; scheduled_publishes is empty in every workspace. A calendar that renders go-live dates only opens as a blank month and reads as data loss.**
  - *Naprawa:* Two visually distinct layers from day one, not deferred: solid armed go-live dates and ghosted dueAt target weeks labelled 'Target — not scheduled', each with an inline 'Schedule for this date'.
  - *Źródło:* Production-data attack, finding 5; pain-lens judgement of the winner

- **SERIOUS — In manual-publish mode (butelki-wodorowe) the owner publishes from the site's own admin, so assets end as 'Exported' or Approved with publishStatus 'sent' and no liveUrl. Mapping those to Ready means every hand-shipped article sits asking 'when should this go live?', the Live count reads 0 for a site with a dozen live articles, and the obvious next click creates a duplicate post.**
  - *Naprawa:* publishStatus 'sent' + publishedDraftUrl is its own stage, 'Sent to site', whose primary action is 'Mark as live / paste the live URL'. Scheduling is blocked for such assets unless the user explicitly confirms a re-publish.
  - *Źródło:* Production-data attack, finding 6

- **SERIOUS — acceptDiscoverySuggestions dedups against every non-deleted opportunity including archived and Discarded ones, silently swallowing suggestions: the button says 8, the board gains 3, and the UI says nothing. This is the first action a returning tester takes on the primary funnel.**
  - *Naprawa:* Return a per-suggestion outcome (created / matched-active / matched-parked) and render it: 'Added 3 · 2 already in your Line · 3 you parked earlier — [Unpark]'. Parked records must be re-activatable from that toast.
  - *Źródło:* Production-data attack, finding 7

- **SERIOUS — An asset whose opportunity was soft-deleted has no card anywhere once the library becomes a filter over opportunities, yet it still publishes on schedule because publish.server.ts never reads opportunityId. An invisible record puts a live post on a customer's site.**
  - *Naprawa:* Both: an orphan lane keyed on the asset itself (title, stage, Cancel), and deleteOpportunity cancels any active scheduled_publishes rows for its assets. Orphans already exist in production, so the lane is not optional.
  - *Źródło:* Production-data attack, finding 9

- **SERIOUS — The custom-endpoint connector requires a prior draft send; publishAssetServerSide refuses instead of sending, while the manual path auto-sends first. A scheduled publish therefore fails permanently where the manual equivalent would have succeeded, contradicting the shared-helper promise in publish.server.ts's own header.**
  - *Naprawa:* Extract the draft-send transport into a *Direct fn under publish-targets.ts and give the server path the same send-then-publish sequence. Arm-time guard refuses to arm when neither publishStatus 'sent' nor a configured draft endpoint exists, with the reason stated.
  - *Źródło:* Publishing-safety attack, finding 5

- **SERIOUS — A zoneless datetime string ('2026-07-21T09:00') is parsed as server-local (UTC) while the button label renders client-local CEST. The article goes live two hours late while the app still displays 09:00, for every Danish, Swedish and Polish tester.**
  - *Naprawa:* The client sends epoch milliseconds or a full offset-bearing ISO string plus the IANA zone; schedule.functions.ts rejects zoneless input outright. Every render resolves from the stored timestamptz through Intl.DateTimeFormat with the stored zone.
  - *Źródło:* Publishing-safety attack, finding 6

- **SERIOUS — The cron introduces a second writer to workspaces.data. A background publish bumps rev, the editor's debounced autosave conflicts, and rehydrateAfterConflict replaces local state wholesale with an info-level toast, silently discarding the paragraph being typed.**
  - *Naprawa:* Narrow the server-side publish write to the fields it owns, and on conflict merge rather than replace, preserving any locally-dirty content body and surfacing an error-level toast with a copy of the local text. At minimum, block the wholesale replace while an editor holds unsaved buffer state.
  - *Źródło:* Publishing-safety attack, finding 8

- **SERIOUS — Rotated or removed connector credentials throw a plain Error, so all three retries burn before the row parks, and the failure text lands in scheduledPublishError, a field with zero UI consumers. Between the arming UI shipping and the Needs-fixing lane existing, a connector failure is completely invisible.**
  - *Naprawa:* Classify missing or invalid credentials as PublishNotPossibleError at the publish-targets boundary so it fails on attempt one; record the failure on the asset on every attempt; and render scheduledPublishError in the editor plus a Home failure banner in increment 0, well before the lane itself exists.
  - *Źródło:* Publishing-safety attack, finding 10

- **SERIOUS — Repointing the five module CTAs to a route that does not exist yet, and to an Ideas view backed by discoverySuggestions while those pages still call addOpportunities, means one increment-0 step depends on two later ones and the destination has to change twice more.**
  - *Naprawa:* Increment 0 points them at /app/plan?selected={id}, which exists today. Because no route is renamed in this plan, the destination never has to change again. The addOpportunities → DiscoverySuggestion switch happens in increment 5, together with the append API and the per-suggestion outcome.
  - *Źródło:* Migration-ordering attack, finding 5

- **SERIOUS — Shipping the derived-stage chip a week before Up Next puts the board on the new vocabulary while Home still runs buildNextActions with no 'scheduled' branch, so the same item shows a stale 'approve this draft' prompt on one screen and Ready/Scheduled on another, and the tester re-approves.**
  - *Naprawa:* pipeline.ts, StageChip and Up Next ship together behind one flag, so flag-on and flag-off are each internally consistent. The pure module lands as an earlier commit with zero call sites.
  - *Źródło:* Migration-ordering attack, finding 7

- **SERIOUS/MINOR — 'Rejected' and 'liveUrl' can both apply to one asset with no stated precedence, so a live article either shows as Needs fixing and vanishes from Live and GSC attribution, or the user's explicit rejection is invisible. Separately, the Ideas count would include accepted and dismissed suggestions, which are retained forever.**
  - *Naprawa:* Publish state is strictly dominant over asset status, encoded as an ordered list in pipeline.ts with a test per pair: stage Live plus an orthogonal 'Needs rework' badge and a 'Rewrite and republish' action. Ideas counts only status === 'suggested', asserted with a fixture containing accepted and dismissed rows.
  - *Źródło:* Production-data attack, findings 10 and 8

- **MINOR but user-visible — MIN_LEAD_MS is 60 seconds while the runner ticks every five minutes, so a minute-precision label routinely lies by up to five minutes, and 'schedule for two minutes from now' is permitted and broken.**
  - *Naprawa:* Raise MIN_LEAD_MS to the tick interval and reject sub-five-minute slots with 'Use Publish now for anything in the next five minutes'. Do not render minute precision for a five-minute grid.
  - *Źródło:* Publishing-safety attack, finding 11

- **MINOR — The cron URL change performs an unconditional cron.unschedule + cron.schedule, so a row caught mid-flight is reaped and marked failed with a message no UI renders.**
  - *Naprawa:* Deploy that change as its own step against an empty queue (assert zero rows in pending or publishing first), and land the scheduledPublishError rendering in the same increment.
  - *Źródło:* Migration-ordering attack, finding 8

## Odrzucone i dlaczego

- **Renaming the routes: /app/plan → /app/line, /app/editor → /app/draft/:id, /app/analytics → /app/results.** — 43 typed route references across AppShell, Home, launch.ts, the five module pages and the i18n nav keys, plus TanStack's generated route tree, plus converting the editor's search.id into a path param — which breaks every deep link the design itself depends on. Unbudgeted in the winner's cost estimate and unscheduled in its migration path, on the three files churned hours ago, with a second agent in the repo. It breaks every tester's bookmark for a benefit a label change delivers in full.
- **Naming the destination 'The Line'.** — A factory metaphor a massage-studio owner does not carry, and it collides with 'Up Next' (the queue) and 'Queued' (a stage) — three names for adjacent concepts in one IA, in a design whose whole pitch is honest vocabulary. The pipeline is made visible by the stage names and the counts strip; the destination does not need to be named after the metaphor. It stays 'Plan'.
- **Reinterpreting publishMode 'autoPublishApproved' rather than retiring it.** — This was the winner's cleverest move and both attack angles killed it. State-scoped auto-arming publishes a historical backlog; event-scoping it requires an approvedAt timestamp that does not exist; degrading it to a suggestion silently takes a tester's automation to zero for three increments with no signal. Retirement by read-time coercion plus a blocking modal achieves the same 'no config becomes invalid' property with none of the risk.
- **Making the ContentAsset the primary object (the 'Pages' inversion).** — It scored 22 and its own author conceded the fatal shape: a document-centric board has no home for technical audit fixes, GBP work or backlink outreach, all of which are real opportunities minted by five module pages including the PAID Backlinks add-on. Exiling them to a secondary tab recreates the two-object problem in a new place. 'Page' is also wrong for five of the nine asset types. The provenance idea is grafted; the inversion is not.
- **Merging the editor into /app/plan as a detail pane (The Work Surface).** — 21.5, and the buildability judge was right that 'one evening, zero component rewrite' for lifting a 1063-line route body into a 1348-line route body that already hosts dnd-kit sensors and a calendar is off by an order of magnitude — before considering focus contention, scroll containment and a re-render-per-keystroke hazard. The winner's approach of keeping the editor a full page and fixing the seam with a breadcrumb and a stage chip gets the same outcome for a fraction of the risk.
- **Auto-pulling Queued → Writing (the winner's increment 5).** — Deferred out of this plan entirely rather than gated. It is the most attractive part of the proposal and the part that multiplies an AI cost that billing.ts:29-31 defines, pricing.tsx:247 advertises and zero call sites enforce. It can be revisited once metering is real in increment 6; committing to it now would put the most expensive feature behind the least likely increment to ship.
- **A hard three-item cap on Up Next and 'this week's three ideas'.** — Kept as a default, rejected as a rule. The calibration is for a solo single-project owner, and this owner runs a portfolio; a cap that cannot be raised will read as patronising. Up Next shows three by default with a 'show all' affordance, and the counts strip always shows the whole pipeline.
- **Removing the manual 'new opportunity' path so everything enters through acceptDiscoverySuggestions.** — 'One gate in' is architecturally clean and the winner owned the tradeoff honestly, but the novice lens is right that 'just write about the product I started stocking' is the most natural request a small-business owner makes of a writing tool. The existing manual opportunity form (app.plan.tsx:178-180) stays. It writes a normal opportunity that enters at Queued, so the pipeline is unchanged — only the claim of a single entrance is dropped.
- **Treating Live as terminal with no way back.** — The novice judge's strongest point: the one act correctly identified as irreversible was left both unassisted and un-undoable. Live is not terminal here. It carries a 'Needs rework' badge when an asset is rejected post-publish, accepts needs_update from Insights, and has an explicit 'Rewrite and republish' action that carries the canonicalUrl forward so the connector updates rather than creates. Full unpublish/take-down is not in this plan and is listed as an open decision.
- **Collapsing the middle board columns into a single 'In production' column.** — Repair the Wiring's tradeoffs argued for it and then declined; I decline too, but for a better reason. Under derived stages, Writing / Ready / Scheduled are no longer asset-vs-opportunity confusion — they are three genuinely different answers to 'what do I do next', with three different primary actions. Collapsing them would hide the one distinction the owner most needs: armed versus not armed.

## Decyzje dla właściciela


**Does Milo need an unpublish / take-down path in v1, or is 'rewrite and republish' enough?**

- Opcje: (a) Rewrite-and-republish only — the live page is always updated, never removed. (b) Add a real unpublish action per connector (WordPress set status draft, Shopify unpublish article, custom endpoint needs a new verb your integrations may not implement). (c) No action in-app, but a clear 'Remove it from your site' instruction on the Live card with a deep link to the CMS.
- Rekomendacja: (c) now, (a) already included, (b) only if a tester actually asks. Publishing is the one irreversible act in the product and the novice lens is right that leaving it un-undoable is the highest-anxiety moment — but a half-working unpublish across three connectors is worse than an honest instruction, and the custom endpoint contract does not support it today.

**Should the Milo Score become a real gate before an article can be armed, or stay advisory?**

- Opcje: (a) Advisory everywhere, as today. (b) Soft block on Publish now only — 'Not ready' requires a second click on 'Publish anyway'. (c) Soft block on both Publish now and Schedule.
- Rekomendacja: (b). This is a genuine judgement call about how paternalistic Milo is with a user who cannot evaluate SEO quality themselves, and it is the one place where your product opinion matters more than mine. My recommendation is (b) because a gate on scheduling would teach testers the score is theatre when they route around it, whereas a single extra click on the irreversible branch is proportionate. Do not require a typed justification — people type 'ok' and learn the gate is fake.

**Is Up Next single-project or cross-project?**

- Opcje: (a) Single-project, as everything in the app is today. (b) Cross-project queue on Home, with a project chip on each card.
- Rekomendacja: (a) for increments 3–5, then reassess. You run a portfolio and will feel the limit immediately, but the counts strip, the queue view and every selector in the codebase are project-scoped, and making Up Next the one cross-project surface means a per-project fetch fan-out and a second navigation model. Worth doing later as its own increment, not smuggled into this one.

**When do plan limits start being enforced, given that they are advertised and enforced nowhere?**

- Opcje: (a) Increment 6 as planned. (b) Pull metering forward to sit alongside increment 3, before creation gets meaningfully easier. (c) Leave unenforced through beta and treat AI spend as customer-acquisition cost.
- Rekomendacja: (b) if you can stomach one evening of unglamorous work early, otherwise (c) with a hard spend alarm on the Gemini key. Not (a) — increment 6 is the increment most likely to slip, and the whole point of increments 3–5 is that generating content stops being an eleven-click gauntlet. That gauntlet is currently your only rate limiter.

**Do beta testers get the increment-2 change silently, or with a forced interruption?**

- Opcje: (a) In-app notice plus changelog, non-blocking. (b) A one-time blocking modal for everyone. (c) Blocking modal only for projects whose stored publishMode was autoPublishApproved; non-blocking notice for everyone else.
- Rekomendacja: (c), which is what the plan assumes. Only the autoPublishApproved cohort has behaviour changing under them with content stranded in a new state, and only they have items that need an arm/skip decision. Blocking everyone to announce that Approve got safer trains people to dismiss your modals.
