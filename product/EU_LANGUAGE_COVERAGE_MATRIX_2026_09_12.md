# R20 language coverage matrix — 12 September 2026

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
