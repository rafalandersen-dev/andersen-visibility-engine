# R20 language coverage matrix — 12 September 2026

Latest authoring checkpoint — 13 September (core English source 9146c53): four active complete catalogs, ten complete staged catalogs (FR/DE/ES/IT/PT/NL/FI/CS/SK/SL), Croatian partial at 274/3,768 and nine unauthored catalogs. Remaining UI authoring backlog: 37,406 messages. Croatian authentication/shared/core copy passes all 14 focused tests, types, scoped lint and whitespace. The original audit and incremental history below retain their dated baselines; none constitutes activation or fluent/rendered acceptance.

Prior Slovak authoring checkpoint (source aef1c2c plus Slovak workflow): Slovak now has all 3,768 current English UI keys across 28 staged batches. Four catalogs are active and nine are fully staged (FR/DE/ES/IT/PT/NL/FI/CS/SK); eleven remain unauthored. Remaining UI authoring backlog: 41,448 messages (11 × 3,768). All 40 Slovak/catalog tests, types, scoped lint and whitespace pass. This is authoring coverage, not activation or language/rendered acceptance. The original audit and incremental history below retain their own evidence baselines.

Evidence baseline: 166eca8. This audit reads the current content registry, composed UI catalogs, all seven staged catalogs, operational/authentication/report email catalogs and local Intl support. Counts describe authored code, not deployment, fluency or real-use acceptance. No language was activated and no message was sent.

The current English UI contains 3,768 keys. Four languages are active in the candidate runtime, seven have exact full-key staged catalogs, and thirteen have no UI catalog in this worktree. The remaining UI authoring backlog is 48,984 messages at the present English baseline (13 × 3,768), before source changes or quality corrections.

| Language | Code | UI state | UI keys | Exact English key set | Operational / auth / report email strings |
| --- | --- | --- | ---: | --- | --- |
| Bulgarian | bg | not authored | 0 | No catalog | 19 / 6 / 18 |
| Croatian | hr | not authored | 0 | No catalog | 19 / 6 / 18 |
| Czech | cs | not authored | 0 | No catalog | 19 / 6 / 18 |
| Danish | da | active | 3,768 | Yes | 19 / 6 / 18 |
| Dutch | nl | staged | 3,768 | Yes | 19 / 6 / 18 |
| English | en | active | 3,768 | Yes | 19 / 6 / 18 |
| Estonian | et | not authored | 0 | No catalog | 19 / 6 / 18 |
| Finnish | fi | staged | 3,768 | Yes | 19 / 6 / 18 |
| French | fr | staged | 3,768 | Yes | 19 / 6 / 18 |
| German | de | staged | 3,768 | Yes | 19 / 6 / 18 |
| Greek | el | not authored | 0 | No catalog | 19 / 6 / 18 |
| Hungarian | hu | not authored | 0 | No catalog | 19 / 6 / 18 |
| Irish | ga | not authored | 0 | No catalog | 19 / 6 / 18 |
| Italian | it | staged | 3,768 | Yes | 19 / 6 / 18 |
| Latvian | lv | not authored | 0 | No catalog | 19 / 6 / 18 |
| Lithuanian | lt | not authored | 0 | No catalog | 19 / 6 / 18 |
| Maltese | mt | not authored | 0 | No catalog | 19 / 6 / 18 |
| Polish | pl | active | 3,768 | Yes | 19 / 6 / 18 |
| Portuguese | pt | staged | 3,768 | Yes | 19 / 6 / 18 |
| Romanian | ro | not authored | 0 | No catalog | 19 / 6 / 18 |
| Slovak | sk | not authored | 0 | No catalog | 19 / 6 / 18 |
| Slovenian | sl | not authored | 0 | No catalog | 19 / 6 / 18 |
| Spanish | es | staged | 3,768 | Yes | 19 / 6 / 18 |
| Swedish | sv | active | 3,768 | Yes | 19 / 6 / 18 |

All 24 are present in the content-language registry and the independently selected email-language registry. Each operational email catalog has 19 string leaves covering digest copy, seven notification reasons, invitations and three roles; authentication has six strings; proof-report email has 18 keys. These are selected surface inventories, not a claim that every future or provider-owned email is translated.

Validation at this baseline:

- All 264 tests in 15 language-directory files pass, including staged key/source/parameter checks, composed catalog checks and language-preference behavior. Log: /tmp/milo-all-language-checks-20260912.log.
- All 199 tests across content-languages, email-languages, format, auth-email-presentation and proof-report-email-eu pass. They cover registered content aliases, digest/invitation rendering, authentication templates and report email rendering/formatting, including escaping and locale isolation. Log: /tmp/milo-language-surfaces-20260912.log.
- Local Intl.DateTimeFormat and Intl.NumberFormat report support for every registered code. That proves this local runtime can format those locales, not that every application call site passes the correct locale or every target browser has passed acceptance.
- Existing date tests cover selected locale examples, UTC versus local schedule semantics and invalid dates. They do not provide full 24-language UI formatting acceptance. The inspected shared formatter callers in editor, plan, risk banner and analytics pass the locale, but this sample does not exhaust all rendering code.

Requirement disposition:

| R20 requirement | Evidence | Disposition |
| --- | --- | --- |
| Canonical 24-language domain selection and aliases | content-languages.ts and passing tests | Implemented locally; real content quality unproven |
| Prompt/content language behavior | Registry plumbing and historical records | Full per-language generated output acceptance still required; this audit ran no generation |
| UI authoring | Exact composed/staged key inventory above | 11 complete catalogs; 13 absent |
| UI availability | UI_LANGUAGE_CODES | Four active; seven staged; staged activation remains open |
| Email copy and local rendering | Three catalogs and 24-locale rendering tests | Selected surfaces implemented and locally checked; delivery/client/fluency acceptance open |
| Formatting | Shared date helpers, email rendering tests, local Intl support | Partial evidence; full date/number/currency and per-surface/browser review open |
| App/content/email/market separation | Separate registries/preferences and focused tests | Locally evidenced; end-to-end real-use matrix open |
| Locale quality and accessibility | Catalog tests; targeted Finnish component browser evidence | Partial; fluent review, full-page mobile/desktop and assistive-technology acceptance open |

Next safe work: author the absent UI catalogs using the current composed English source, beginning with Czech authentication and shared controls, then complete each namespace with exact key and placeholder checks. Continue rendered acceptance for the seven staged catalogs without treating key coverage as approval to activate. Real-use and release actions remain subject to the recorded project boundaries. R20 and G11 remain incomplete; this matrix does not reduce their scope.

Post-audit authoring update: Czech authentication/shared controls now have 72 staged keys (English source baseline 78cd575). The baseline table above is retained as dated audit evidence. Current UI authoring has four active full catalogs, seven complete staged catalogs, one partial Czech catalog and twelve absent catalogs; the unfilled-key backlog is now 48,912. Czech activation and quality acceptance remain open. See CZECH_AUTHORING_PROGRESS_2026_09_12.md.

Further Czech progress: core adds 202 messages, bringing the partial catalog to 274/3,768. The remaining UI authoring backlog across incomplete/absent catalogs is 48,710 messages at this English baseline. Acceptance and activation status are unchanged.

Czech setup/services/audit adds 71 messages: partial coverage is now 345/3,768, and the remaining UI authoring backlog across incomplete/absent catalogs is 48,639 at this source baseline. Active language availability and acceptance gates are unchanged.

Czech analytics/billing adds 90 messages: partial coverage is now 435/3,768 and the remaining UI authoring backlog is 48,549 messages at this English baseline. Quality and activation gates remain open.

Czech evidence screen adds 89 messages: partial coverage is 524/3,768 and the remaining UI authoring backlog is 48,460 messages at this source baseline. Language availability and acceptance status remain unchanged.

Czech plan screen adds 113 messages: partial coverage is 637/3,768, leaving 48,347 UI messages across incomplete/absent catalogs at this English baseline. Activation and acceptance remain open.

Czech editor screen adds 148 messages: partial coverage is 785/3,768 and the UI authoring backlog is 48,199 messages at this baseline. Activation and quality acceptance remain open.

Czech public pricing/case studies adds 70 messages: partial coverage is 855/3,768, leaving 48,129 UI messages across incomplete/absent catalogs at this source baseline. Activation and quality acceptance remain open.

Czech public home adds 100 messages: partial coverage is 955/3,768 and the remaining UI authoring backlog is 48,029 at this source baseline. Activation and quality acceptance remain open.

Czech beta screen adds 88 messages: partial coverage is 1,043/3,768, leaving 47,941 UI messages across incomplete/absent catalogs at this baseline. Activation and quality acceptance remain open.

Czech beta guidance adds 125 messages: partial coverage is 1,168/3,768 and the remaining UI authoring backlog is 47,816 at this source baseline. Activation and quality acceptance remain open.

Czech public beta adds 100 messages: partial coverage is 1,268/3,768 and the remaining UI authoring backlog is 47,716 at this source baseline. Activation and quality acceptance remain open.

Czech configuration adds 220 messages: partial coverage is 1,488/3,768 and the UI authoring backlog is 47,496 messages at this English baseline. Activation and quality acceptance remain open.

Czech collaboration and notifications adds 248 messages: partial coverage is 1,736/3,768 and the UI authoring backlog is 47,248 messages at this English baseline. Activation and quality acceptance remain open.

Czech knowledge, weekly preparation and approval adds 242 messages: partial coverage is 1,978/3,768 and the UI authoring backlog is 47,006 messages at this English baseline. Activation and quality acceptance remain open.

Czech technical diagnostics adds 238 messages: partial coverage is 2,216/3,768 and the UI authoring backlog is 46,768 messages at this English baseline. Activation and quality acceptance remain open.

Czech analytics, Search Console and reports adds 204 messages: partial coverage is 2,420/3,768 and the UI authoring backlog is 46,564 messages at this English baseline. Activation and quality acceptance remain open.

Czech outreach, opening hooks and image placement adds 158 messages: partial coverage is 2,578/3,768 and the UI authoring backlog is 46,406 messages at this English baseline. Activation and quality acceptance remain open.

Czech authority opportunities, public audit and action proposals adds 201 messages: partial coverage is 2,779/3,768 and the UI authoring backlog is 46,205 messages at this English baseline. Activation and quality acceptance remain open.

Czech billing, launch checklist and beta limits adds 192 messages: partial coverage is 2,971/3,768 and the UI authoring backlog is 46,013 messages at this English baseline. Activation and quality acceptance remain open.

Czech links, marketplace and backlink monitoring adds 256 messages: partial coverage is 3,227/3,768 and the UI authoring backlog is 45,757 messages at this English baseline. Activation and quality acceptance remain open.

Czech publication, AI-answer and log evidence adds 196 messages: partial coverage is 3,423/3,768 and the UI authoring backlog is 45,561 messages at this English baseline. Activation and quality acceptance remain open.

Czech final workflow adds 345 messages, completing 3,768/3,768 current composed-English keys across 28 batches. Current authoring status is four active full catalogs, eight complete staged catalogs and twelve absent UI catalogs; the remaining UI authoring backlog is 45,216 messages at this baseline. Full Czech key equality and 40 focused tests pass. This is authoring completion only: fluent-language, rendered-interface and activation acceptance remain open.

Slovak authoring begins with 72 authentication/shared-control messages (English baseline e72328d). Current UI authoring is four active full catalogs, eight complete staged catalogs, one partial Slovak catalog and eleven absent catalogs; the unfilled-key backlog is 45,144. Slovak activation and quality acceptance remain open. See SLOVAK_AUTHORING_PROGRESS_2026_09_12.md.

Slovak core adds 202 messages, bringing staged coverage to 274/3,768 across three batches. The remaining UI authoring backlog is 44,942 messages at this composed-English baseline. All 14 focused tests, types, scoped lint and whitespace pass. Activation and language/rendered acceptance remain open.

Slovak setup/services/audit adds 71 messages, bringing staged coverage to 345/3,768 across six batches. The remaining UI authoring backlog is 44,871 messages at this composed-English baseline. All 17 focused tests, types, scoped lint and whitespace pass. Activation and language/rendered acceptance remain open.

Slovak analytics/billing adds 90 messages, bringing staged coverage to 435/3,768 across eight batches. The remaining UI authoring backlog is 44,781 messages at this composed-English baseline. All 19 focused tests, types, scoped lint and whitespace pass. Activation and language/rendered acceptance remain open.

Slovak evidence screen adds 89 messages, bringing staged coverage to 524/3,768 across nine batches. The remaining UI authoring backlog is 44,692 messages at this composed-English baseline. All 20 focused tests, types, scoped lint and whitespace pass. Activation and language/rendered acceptance remain open.

Slovak plan screen adds 113 messages, bringing staged coverage to 637/3,768 across ten batches. The remaining UI authoring backlog is 44,579 messages at this composed-English baseline. All 21 focused tests, types, scoped lint and whitespace pass. Activation and language/rendered acceptance remain open.

Slovak editor screen adds 148 messages, bringing staged coverage to 785/3,768 across eleven batches. The remaining UI authoring backlog is 44,431 messages at this composed-English baseline. All 22 focused tests, types, scoped lint and whitespace pass. Activation and language/rendered acceptance remain open.

Slovak public pricing/studies adds 70 messages, bringing staged coverage to 855/3,768 across thirteen batches. The remaining UI authoring backlog is 44,361 messages at this composed-English baseline. All 24 focused tests, types, scoped lint and whitespace pass. Activation and language/rendered acceptance remain open.

Slovak public home adds 100 messages, bringing staged coverage to 955/3,768 across fourteen batches. The remaining UI authoring backlog is 44,261 messages at this composed-English baseline. All 25 focused tests, types, scoped lint and whitespace pass. Activation and language/rendered acceptance remain open.

Slovak beta screen adds 88 messages, bringing staged coverage to 1,043/3,768 across fifteen batches. The remaining UI authoring backlog is 44,173 messages at this composed-English baseline. All 26 focused tests, types, scoped lint and whitespace pass. Activation and language/rendered acceptance remain open.

Slovak beta guidance adds 125 messages, bringing staged coverage to 1,168/3,768 across sixteen batches. The remaining UI authoring backlog is 44,048 messages at this composed-English baseline. All 27 focused tests, types, scoped lint and whitespace pass. Activation and language/rendered acceptance remain open.

Slovak public beta adds 100 messages, bringing staged coverage to 1,268/3,768 across seventeen batches. The remaining UI authoring backlog is 43,948 messages at this composed-English baseline. All 28 focused tests, types, scoped lint and whitespace pass. Activation and language/rendered acceptance remain open.

Slovak configuration adds 220 messages, bringing staged coverage to 1,488/3,768 across eighteen batches. The remaining UI authoring backlog is 43,728 messages at this composed-English baseline. All 29 focused tests, types, scoped lint and whitespace pass. Activation and language/rendered acceptance remain open.

Slovak collaboration/notifications adds 248 messages, bringing staged coverage to 1,736/3,768 across nineteen batches. The remaining UI authoring backlog is 43,480 messages at this composed-English baseline. All 30 focused tests, types, scoped lint and whitespace pass. Activation and language/rendered acceptance remain open.

Slovak knowledge/weekly/approval adds 242 messages, bringing staged coverage to 1,978/3,768 across twenty batches. The remaining UI authoring backlog is 43,238 messages at this composed-English baseline. All 31 focused tests, types, scoped lint and whitespace pass. Activation and language/rendered acceptance remain open.

Slovak technical diagnostics adds 238 messages, bringing staged coverage to 2,216/3,768 across twenty-one batches. The remaining UI authoring backlog is 43,000 messages at this composed-English baseline. All 32 focused tests, types, scoped lint and whitespace pass. Activation and language/rendered acceptance remain open.

Slovak analytics/Search Console/reports adds 204 messages, bringing staged coverage to 2,420/3,768 across twenty-two batches. The remaining UI authoring backlog is 42,796 messages at this composed-English baseline. All 33 focused tests, types, scoped lint and whitespace pass. Activation and language/rendered acceptance remain open.

Slovak outreach/hooks/placement adds 158 messages, bringing staged coverage to 2,578/3,768 across twenty-three batches. The remaining UI authoring backlog is 42,638 messages at this composed-English baseline. All 34 focused tests, types, scoped lint and whitespace pass. Activation and language/rendered acceptance remain open.

Slovak authority/public audit/proposals adds 201 messages, bringing staged coverage to 2,779/3,768 across twenty-four batches. The remaining UI authoring backlog is 42,437 messages at this composed-English baseline. All 35 focused tests, types, scoped lint and whitespace pass. Activation and language/rendered acceptance remain open.

Slovak billing/launch/beta adds 192 messages, bringing staged coverage to 2,971/3,768 across twenty-five batches. The remaining UI authoring backlog is 42,245 messages at this composed-English baseline. All 36 focused tests, types, scoped lint and whitespace pass. Activation and language/rendered acceptance remain open.

Slovak link network/backlinks/marketplace/monitoring adds 256 messages, bringing staged coverage to 3,227/3,768 across twenty-six batches. The remaining UI authoring backlog is 41,989 messages at this composed-English baseline. All 37 focused tests, types, scoped lint and whitespace pass. Activation and language/rendered acceptance remain open.

Slovak publication proof/AI answers/logs/evaluation adds 196 messages, bringing staged coverage to 3,423/3,768 across twenty-seven batches. The remaining UI authoring backlog is 41,793 messages at this composed-English baseline. All 38 focused tests, types, scoped lint and whitespace pass. Activation and language/rendered acceptance remain open.

Slovak workflow adds the final 345 messages, completing 3,768/3,768 across twenty-eight batches. Whole-catalog equality now verifies every current composed English key in addition to individual namespace/source/parameter checks. All 40 focused tests, types, scoped lint and whitespace pass. Language, rendered and activation acceptance remain open.

Slovenian authoring begins at source 5f7faa9 with authentication (42) and shared controls (30): 72/3,768 keys in two staged batches. Four catalogs are active, nine fully staged, one partially staged and ten unauthored. Remaining UI authoring backlog: 41,376 messages. All 13 Slovenian/catalog tests, types, scoped lint and whitespace pass. Slovenian stays outside the runtime/language picker; quality, rendered and activation acceptance remain open.

Slovenian core adds 202 messages at source ddee742: 274/3,768 in three staged batches. Remaining UI authoring backlog: 41,174 messages. All 14 focused tests, types, scoped lint and whitespace pass. Runtime activation and language/rendered acceptance remain open.

Slovenian setup/services/audit adds 71 messages at source 32a8a48: 345/3,768 in six staged batches. Remaining UI authoring backlog: 41,103 messages. All 17 focused tests, types, scoped lint and whitespace pass. Runtime activation and language/rendered acceptance remain open.

Slovenian analytics/billing adds 90 messages at source 1113cc5: 435/3,768 in eight staged batches. Remaining UI authoring backlog: 41,013 messages. All 19 focused tests, types, scoped lint and whitespace pass. Runtime activation and language/rendered acceptance remain open.

Slovenian competitor/AI-readiness evidence adds 89 messages at source b51ac1f: 524/3,768 in nine staged batches. Remaining UI authoring backlog: 40,924 messages. All 20 focused tests, types, scoped lint and whitespace pass. Runtime activation and language/rendered acceptance remain open.

Slovenian plan adds 113 messages at source b949563: 637/3,768 in ten staged batches. Remaining UI authoring backlog: 40,811 messages. All 21 focused tests, types, scoped lint and whitespace pass. Runtime activation and language/rendered acceptance remain open.

Slovenian editor adds 148 messages at source 9d577d4: 785/3,768 in eleven staged batches. Remaining UI authoring backlog: 40,663 messages. All 22 focused tests, types, scoped lint and whitespace pass. Runtime activation and language/rendered acceptance remain open.

Slovenian public pricing/studies adds 70 messages at source 187b94e: 855/3,768 in thirteen staged batches. Remaining UI authoring backlog: 40,593 messages. All 24 focused tests, types, scoped lint and whitespace pass. Runtime activation and language/rendered acceptance remain open.

Slovenian public home adds 100 messages at source f1846ab: 955/3,768 in fourteen staged batches. Remaining UI authoring backlog: 40,493 messages. All 25 focused tests, types, scoped lint and whitespace pass. Runtime activation and language/rendered acceptance remain open.

Slovenian beta screen adds 88 messages at source 63e1a10: 1,043/3,768 in fifteen staged batches. Remaining UI authoring backlog: 40,405 messages. All 26 focused tests, types, scoped lint and whitespace pass. Runtime activation and language/rendered acceptance remain open.

Slovenian beta guidance adds 125 messages at source 75198c7: 1,168/3,768 in sixteen staged batches. Remaining UI authoring backlog: 40,280 messages. All 27 focused tests, types, scoped lint and whitespace pass. Runtime activation and language/rendered acceptance remain open.

Slovenian public beta adds 100 messages at source 6a24f17: 1,268/3,768 in seventeen staged batches. Remaining UI authoring backlog: 40,180 messages. All 28 focused tests, types, scoped lint and whitespace pass. Runtime activation and language/rendered acceptance remain open.

Slovenian configuration adds 220 messages at source b8f7f14: 1,488/3,768 in eighteen staged batches. Remaining UI authoring backlog: 39,960 messages. All 29 focused tests, types, scoped lint and whitespace pass. Runtime activation and language/rendered acceptance remain open.

Slovenian collaboration adds 248 messages at source 0698092: 1,736/3,768 in nineteen staged batches. Remaining UI authoring backlog: 39,712 messages. All 30 focused tests, types, scoped lint and whitespace pass. Runtime activation and language/rendered acceptance remain open.

Slovenian knowledge adds 242 messages at source 99fd1c8: 1,978/3,768 in twenty staged batches. Remaining UI authoring backlog: 39,470 messages. All 31 focused tests, types, scoped lint, formatting and whitespace pass. Runtime activation and language/rendered acceptance remain open.

Slovenian technical adds 238 messages at source 4ae023a: 2,216/3,768 in twenty-one staged batches. Remaining UI authoring backlog: 39,232 messages. All 32 focused tests, types, scoped lint, formatting and whitespace pass. Runtime activation and language/rendered acceptance remain open.

Slovenian measurements adds 204 messages at source 324d5f5: 2,420/3,768 in twenty-two staged batches. Remaining UI authoring backlog: 39,028 messages. All 33 focused tests, types, scoped lint, formatting and whitespace pass. Runtime activation and language/rendered acceptance remain open.

Slovenian outreach adds 158 messages at source 2705f3f: 2,578/3,768 in twenty-three staged batches. Remaining UI authoring backlog: 38,870 messages. All 34 focused tests, types, scoped lint, formatting and whitespace pass. Runtime activation and language/rendered acceptance remain open.

13 September: Slovenian growth adds 201 messages at source 0704f32: 2,779/3,768 in twenty-four staged batches. Remaining UI authoring backlog: 38,669 messages. All 35 focused tests, types, scoped lint and whitespace pass; changed code formatted. Runtime activation and language/rendered acceptance remain open.

13 September: Slovenian commerce adds 192 messages at source d3313ba: 2,971/3,768 in twenty-five staged batches. Remaining UI authoring backlog: 38,477 messages. All 36 focused tests, types, scoped lint and whitespace pass; changed code formatted. Runtime activation and language/rendered acceptance remain open.

13 September: Slovenian links adds 256 messages at source bf2af3a: 3,227/3,768 in twenty-six staged batches. Remaining UI authoring backlog: 38,221 messages. All 37 focused tests, types, scoped lint and whitespace pass; changed code formatted. Runtime activation and language/rendered acceptance remain open.

13 September: Slovenian evidence adds 196 messages at source d30a733: 3,423/3,768 in twenty-seven staged batches. Remaining UI authoring backlog: 38,025 messages. All 38 focused tests, types, scoped lint and whitespace pass; changed code formatted. Runtime activation and language/rendered acceptance remain open.

13 September: Slovenian workflow adds 345 messages at source 166a4cf, completing 3,768/3,768 in twenty-eight staged batches. Whole-catalog key equality now passes alongside per-batch source/parameter checks. Remaining UI authoring backlog: 37,680 messages. All 40 focused tests, types, scoped lint and whitespace pass; changed code formatted. Active UI remains EN/PL/SV/DA; complete staged catalogs are FR/DE/ES/IT/PT/NL/FI/CS/SK/SL. Runtime activation and language/rendered acceptance remain open.

13 September: complete staged Slovenian passed nine local knowledge-review browser groups at a575210 with actual translated copy, plus focused repeated-label terminology checks. All 40 Slovenian/catalog tests pass. Evidence and limitations: SLOVENIAN_COMPONENT_ACCEPTANCE_2026_09_13.md. Counts and activation status are unchanged; full-page/fluent-language/screen-reader and real-use acceptance remain open.

13 September: Croatian authoring starts with 72 authentication/shared messages at b450bc5. All 13 focused tests, types, scoped lint and whitespace pass; changed code formatted. Runtime exclusion is checked. See CROATIAN_AUTHORING_PROGRESS_2026_09_13.md. Remaining UI authoring backlog: 37,608; activation and language/rendered acceptance remain open.


13 September Croatian core checkpoint: 202 navigation, onboarding, setup and pipeline messages added at English source 9146c53; total 274/3,768 across three batches. All 14 Croatian/catalog tests, types, scoped lint, formatting and whitespace pass. Recovery and target/publication distinctions remain explicit. Croatian stays excluded from runtime and picker. Remaining Croatian authoring: 3,494 messages; next setup, services and audit screens.
