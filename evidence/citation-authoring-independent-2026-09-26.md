# Owner authoring — independent verification in progress (26 September)

Claude terminal CITATION-OWNER-AUTHORING confirmed in desktop: finished response. `.coordination/citation-authoring-result.md` reports final 400 files /6802 tests, types and scoped lint pass. Author did not run build or browser. No commit/deploy/migration application.

## Independent executed checks

- `npm run build` exit0. Log: author `.coordination/codex-authoring-build-20260926.log`.
- Five critical suites via repository `vitest.config.ts`: scope-binding migration, finding-review migration, candidate chain grant matrix, finding/fact function boundaries. **214/214 passed**,6.50s. Log: `.coordination/codex-authoring-critical-tests-20260926.log`. This includes actual PGlite SQL regressions and role checks, not real concurrent PostgreSQL transactions.
- `git diff --check` clean.
- Static A1–A4 follow-ups are recorded separately; test snapshots still need final delta check (author formatted and fixed function type declarations after early snapshot).

## Actual local browser interactions (fixture boundary only)

Existing Chrome tab1596627641 at127.0.0.1:5179, real components, in-memory server mocks. No production records or paid/provider actions.

1. **A4 new fact draft switch:** ProjectA entered `A-ONLY-LOCAL-ISOLATION-20260926`; switchingB removed form. NewB value `B-ONLY-LOCAL-FACT-20260926` saved asv1,row f0a8155e…, call projectId `harness-project-b`. SwitchingA restored no draft. The fixture intentionally shares stored records: this proves draft/call scope behavior, NOT datastore tenant isolation. Pending-request, finding-review and panel-lock switching still need testing.
2. **A2 lost response:** New source-gap finding `fd0a3989-4890-410e-b46e-2f506495cce4` reviewed; mock mode store-writes/response-lost. Firstcall13:12:37.679 storedv1 row`df5de462-6e35-46e9-b09a-497bcb37adbb`, then threw unavailable. UI preserved exact review. Invalidatedqueries/refetched; retry13:13:01.759 returned idempotentv1 SAMErow, expectedVersion0/headnull unchanged. Source review confirms mock idempotency compares JSON.stringify(entire stored record)===JSON.stringify(submittedfinding), so reviewedAt was unchanged. SQL persistence is independently covered by criticaltests; this UI result is not production proof.
3. **A3 conflict:** Edited savedv1 observation. Forced conflict + ownerdetailerror: current detail fetch failed; draft retained, NO acknowledgement/continue control. Restored detailok and retried forcedconflict: current record appeared next to edited record and explicit `I inspected version1` action. After acknowledgement and store-decides, save producedv2 row`dfe5e209…`, expectedHeadId originalv1. Picker shows onlyv2 for that identity, plus distinct legacyfindingv1. Force-conflict mode returns a chosen outcome without creating a genuinely newer head; this exercises UI reactions, not server contention.

## Newly confirmed B1, not yet dispatched

P2 source timestamp fails to render when reopening assessed support. Open legacy fixture `Citation / source gap · v1 ·2026-09-10`. Fixture record's sourceCapturedAt=`2026-09-10T09:30:00Z`; browser's visible `Source captured at` input is blank. DOM read: type=`datetime-local`, displayedValue=``, renderedValueAttribute=`2026-09-10T09:30:00Z`. `draftFromRecord` copies fullISO into that controlled input. Native datetime-local rejects offset-bearing ISO syntax, so the owner cannot inspect the actual saved date in the edit form. Fix with explicit timezone convention/display-safe conversion and instant-preserving resave; include Z/offset reopening and editing regression. Do not silently strip offset and reinterpret time. Collect remaining UI findings, then ONE packet to sameClaude.

Tooling note: CUA fill(datetime-local) set DOM value but did not notify React on this runtime; native ArrowUp+Tab did notify and persisted the value. This automation issue is not recorded as an app defect. Use native keyboard for date interaction; B1 is independent because it occurs on opening a stored record before any automation fill.

## Remaining before release

Complete actual panel draft/review/explicit lock, datedfact correction/lost-response, recommendation-accuracy path, stale references, project switch while pending, narrow viewport and keyboard; collect one correction packet includingB1. No full stage acceptance yet. Migration remains UNAPPLIED. Fullgoal and genuine pilot/native/destination/team evidence gates remain open.

## Additional browser pass

Discovery fixture explicit lock succeeded to v2 (13:18:31.316); no real pilot approval. Recommendation_accuracy finding b2451270-9a02-45e4-88b6-6b1a706e0eb0 saved v1 rowa02235ed underA, with fact795kr v1 selected. Pending button witnessed before switchingB, but no forced latency existed: timing race acceptance remains pending a deterministic delaycontrol. No old draft/success text appeared in B. Factcorrection underA storedv2 a979bcf0… at13:21:44.482 then response-loss; retry13:21:59.429 returned SAMEv2row. At390×844 viewport documentWidth390, actual form screenshot readable/wrapped; Tab moved to nextlabelledselect; Enter Cancel works. Native select keyboard option selection was not established in this automation runtime (not declared app defect); viewportreset. B2 confirmed summary-only unnamed approvaldialog lacks inspectable exactquestions/session/schedule, and lockedrecords have no detail view. PacketB prepared withB1/B2 and deterministic delayfixture request.


## Packet B — independent acceptance, 26 September 2026

Claude desktop finished B on the existing authorized account; CLI auth status is unrelated. B1/B2 source delta reviewed against the preserved post-A snapshot. Test translation mock now exposes interpolation values; assertions still check the real component's stored values. No SQL changes: candidate migration byte-identical to the one passing 214 independent critical tests.

Executed after B: production build exit 0; TypeScript exit 0; four focused component/helper suites, 42 tests passed; git diff --check clean. Logs are `.coordination/codex-authoring-b-{build,types,tests}-20260926.log` in the author worktree. Earlier full-suite results are author evidence, not a new independent full-suite run.

Actual isolated Chrome checks:
- Reopened the offset fixture: source capture visibly shows 2026-09-10T09:30 UTC and its exact stored 2026-09-10T11:30:00.123456+02:00 caption. The former blank control is fixed. Exact no-edit round trip and explicit edits are covered by executed helper tests; no production record was altered.
- Discovery review shows all ten question texts, prompt UUIDs/revisions/languages, service/mode, all session/location controls, timezone, four local plus stored UTC schedule slots. Opening review focuses its named heading. No write occurs on review opening or Cancel.
- At 390x844 the document width is 390; rendered details and long identifiers wrap. Keyboard Tab reaches Cancel and Enter dismisses review. This is bounded keyboard/visual evidence, not full assistive-technology acceptance.
- Inspect stored version opens the locked brand panel with exact approval instant and explicit no-schedule wording.
- With every mocked call delayed 4000ms, clicked Approve and lock under A; observed disabled pending control, then switched B before result. Owner subtree changed from instance1 to instance3, old review vanished. The completed lock log retains projectId harness_project at13:41:34.848; B remained a fresh form, no A success banner/draft. Fixture stores are deliberately shared: subsequent B reads show shared saved fixtures, which is NOT a database isolation test. Backend scope checks remain separately tested.

B release blockers are resolved within the local/mock evidence boundary. External exact-head code/security review and CI, new guarded migration once, deployment and live verification remain gates. Genuine pilot, two-person acceptance, native exports/parser and destination proof remain open. No paid/provider/production actions, permission or budget changes occurred.
