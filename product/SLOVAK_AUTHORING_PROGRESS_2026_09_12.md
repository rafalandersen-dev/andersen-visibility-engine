# Slovak interface authoring — 12 September 2026

Slovak is staged only: all 3,768 current English interface keys, across twenty-eight complete batches. It is excluded from UI_CATALOGS and the language picker. Active UI remains EN/PL/SV/DA; FR/DE/ES/IT/PT/NL/FI/CS retain separate staged acceptance status.

| Batch | Keys | Composed English baseline |
| --- | ---: | --- |
| Authentication and password recovery | 42 | e72328d |
| Shared controls and navigation accessibility labels | 30 | e72328d |
| Core navigation, onboarding, setup and pipeline | 202 | 4ad3d13 |
| Setup screen | 24 | 24ddc69 |
| Services screen | 18 | 24ddc69 |
| Audit screen | 29 | 24ddc69 |
| Analytics screen | 36 | e274ada |
| Billing screen | 54 | e274ada |
| Competitor and AI-readiness evidence screen | 89 | 23cb569 |
| Plan screen | 113 | 6b99354 |
| Editor screen | 148 | 120b4dc |
| Public pricing | 40 | c3a04a7 |
| Public case studies | 30 | c3a04a7 |
| Public home | 100 | c5c37bb |
| Beta screen | 88 | 38b917f |
| Beta guidance | 125 | 6d09db8 |
| Public beta | 100 | 865b87a |
| Configuration | 220 | b5e84bf |
| Collaboration and notifications | 248 | 6ee209c |
| Knowledge, weekly preparation and approval | 242 | b65e680 |
| Technical diagnostics | 238 | 9079fb6 |
| Analytics, Search Console and reports | 204 | 2f06d69 |
| Outreach, hooks and image placement | 158 | 8b4032a |
| Authority opportunities, public audit and proposals | 201 | 7c7795f |
| Billing, launch checklist and beta limitations | 192 | a5d2a42 |
| Link network, backlinks, marketplace and monitoring | 256 | 58c329a |
| Publication proof, AI answers, logs and evaluation | 196 | 482aa28 |
| Scheduling, editor, plan, recovery and workflow | 345 | aef1c2c |

The staged registry has unique key ownership and a frozen combined catalog. Namespace tests verify exact keys, nonempty values, current English source fingerprints and preserved placeholders, numbers, URLs and email tokens. All 40 Slovak/catalog tests, scoped lint, whitespace and type checking pass. Type log: /tmp/milo-slovak-workflow-types.log.

Terminology: pracovný priestor (workspace), projekt, heslo (password), obnovenie hesla (password recovery), bočný panel (sidebar), archivovať (archive). Prefer formal-plural instructions and infinitive actions. Program denotes a subscription plan; workflow plans use plán. Network listing is zápis. Preserve provider/product names and placeholders.

Recovery text preserves conditional eligibility and does not confirm that an account exists. Source claims about monthly planning and successful sign-in after password update retain implementation/acceptance obligations; translation does not prove them. No email, authentication, password, account or provider operation occurred.

Authoring coverage is complete against the current composed English key set, enforced by a whole-catalog equality test. Remaining: fluent-language/terminology review, rendered mobile/desktop and accessibility checks, and activation acceptance. Next: terminology consistency and local rendered review. This staged work does not complete R20 or alter release gates.

Core copy preserves interface versus content language, work target dates versus publication times, sent drafts versus published pages, and partial-generation recovery. Navigation uses Plán, Obsah, Viditeľnosť, Nastavenia and Analytika; publication scheduling is Čas zverejnenia nastavený. No generation, scheduling or publication occurred. Current source fingerprints are checked against composed English.

Setup/services/audit copy preserves approval versus publication, removed automatic-on-approval behavior, configured draft versus live endpoints, and homepage-read versus supplied-context evidence. Audit scores remain indicative assessments rather than measured rankings or technical performance; technical crawling is separate. No secret, endpoint, provider, crawl or publication operation occurred.

Analytics/billing preserves recorded events versus unique visitors, tracked clicks versus completed transactions, bounded history and publication-time limits. The 50,000-event ceiling is written 50 000 in Slovak with unchanged value. Subscription program terminology, legacy Paddle eligibility, manual grants and separate backlink purchase approval retain their source meaning. Checkout failure describes order completion, without asserting a failed charge. No payment, portal, tracking installation or provider operation occurred.

Evidence-screen copy preserves competitor snapshots versus ongoing monitoring, absent evidence on failed retrieval, competitor-gap versus readiness score direction, and readiness estimates versus measured AI answers/rankings. AI referral visits remain separate from mentions and citations. Discovery means finding options in this context. No competitor fetch, analysis, model request or opportunity creation occurred.

Plan copy preserves work target dates versus publication schedules, discovery acceptance versus content creation/publication, skipped batch items, sample data provenance and archive/restore behavior. Drafts without linked opportunities explicitly retain active publication schedules. Discovery is hľadanie príležitostí; Plan is Plán, Board Nástenka, List Zoznam and Calendar Kalendár. No generation, sample removal, scheduling or archive operation occurred.

Editor copy preserves upload privacy until image approval, controlled-origin eligibility, alt-text requirements and the separate Save step. Source validation, author identity/consent guidance, link-resolution blocks and sent/published/attempt timestamps retain their source meanings. Zdroje a autor names the Sources & Author tab; zadanie obsahu is content brief. Structured-data copy retains CMS and search-engine limits without adding guarantees. No image upload, generation, approval, validation or publication occurred.

Public pricing/studies preserves billing-country eligibility versus interface region, separate add-on purchases and payment/supplier acceptance holds. Case examples retain incomplete live connector, publication and measurement acceptance, with no observed growth/customer outcome or performance guarantee. Program is subscription plan; Agency, Backlinks, Brand Intelligence and Milo Scores remain names. No checkout, activation, purchase, provider request or publication occurred.

Public home preserves missing-data semantics, separate publication prerequisites, linked-subscription portal conditions and paid-service holds. The composed hero reads Váš mesačný systém rastu s AI; source component concatenation was checked. Visibility remains Viditeľnosť, case studies Príklady použitia, and the Captured stage is Zachytené for later workflow alignment. Inherited marketing claims still require implementation/product acceptance; authoring is not proof. No provider operation occurred.

Beta-screen copy preserves owner-only sales guidance, separate outreach language and unchanged CSV semantics. Sales discovery uses zisťovanie potrieb, distinct from product hľadanie príležitostí. Prospect labels describe recorded stages without creating evidence of contact or acceptance. Validation counts remain source targets. No outreach, recruitment, provider action or CSV data change occurred.

Beta guidance retains prospect/demo counts as validation targets, separates demonstrations from real-use verification and preserves authorization/cost checks for audits, generation and outreach. Manual billing status does not prove payment; payment and supplier acceptance remain open. Copying a template does not send it. No prospect contact, audit, demo, generation, payment or provider operation occurred.

Public beta preserves pilot availability/scope, one-time versus monthly prices, payment holds and incomplete per-site connector/measurement acceptance. Demo data remains distinct from growth evidence. The current four-language page statement matches the active source baseline but must be reconciled during additional-language activation. No audit, application, email, payment or provider operation occurred.

Configuration preserves read/propose/write distinctions, connector draft/approval/publication states, token expiry/revocation and owner-reviewed versus verified coverage evidence. Publication receipts do not establish live coverage or performance. The 2,000-character limit is localized as 2 000 with unchanged value. Shopify menu labels are retained as source UI names; translation does not verify current provider setup instructions. No token, connection test, provider request or settings mutation occurred.

Collaboration/notifications preserves exact-version review versus publication/resuming holds, owner assignment plus recipient consent, uncertain saves and delivery outcomes, and historical records versus current/live verification. Roles match existing Slovak invitation email: Čitateľ, Editor, Posudzovateľ (email-copy-eu.ts). Project lessons are explicit instructions, not factual proof; shared preparation capacity does not promise completed articles. No invitation, email, access change, recovery or publication occurred.

Knowledge/weekly/approval copy preserves source acceptance versus independent verification, exact reviewed versions, expiry, owner-setting precedence and irreversible forgetting. Saved, approved and actually queued drafts remain distinct; cancellation preserves retained work and does not retry uncertain research. PDF/text-only limits and partial catalog evidence retain their source meaning. No source fetch, upload, knowledge mutation, generation or publication occurred.

Technical copy preserves bounded crawl/sitemap observations, DNS verification expiry, historical Google index evidence and unknown request outcomes. Page versus origin and lab versus real-user measurements remain distinct. Search Console property is služba; origin is pôvod with its page-scope explanation retained. No DNS change, crawl, Google request or measurement occurred.

Measurements/report copy retains historical publication and email-delivery limits, AI-referral versus mention/citation distinctions, missing-data semantics and CSV/window/aggregate boundaries. Search Console property remains služba; the elapsed-days label uses a count-neutral construction. Existing metric/marketing labels retain their source meaning and still require real-use acceptance. No email, tracking installation, Google operation or CSV import occurred.

Outreach/hooks/placement preserves exact-recipient/message approval, separate follow-up review, provider acceptance versus inbox outcomes and uncertain-attempt holds. Hook is pútavý úvod; Zdroje a autor matches the editor tab. Follow-up timing uses Odstup v dňoch to avoid implying automatic dispatch. No generation, approval, email or image-placement operation occurred.

Growth copy preserves suggested authority work, public-audit readiness limits and approximate homepage signals. Proposal approval applies changes immediately; duplicate and capacity exclusions remain explicit and setup-complete status is unchanged. Authority listing uses zápis and publication-style labels remain source workflow labels. No audit, generation, outreach or proposal application occurred.

Commerce copy preserves test checkout versus actual charges, manual activation versus payment verification, subscription program terminology and incomplete live payment/CMS acceptance. Checklist completion does not establish readiness for paid self-service; historical GSC imports do not establish current connection provenance. No payment, activation, connector, Google or publication operation occurred.

Links copy preserves index observations versus verified placements, missing metrics versus zero, exact-price purchase authorization versus demo requests, quote expiry and uncertain-outcome retry holds. Recurring collection retains UTC windows, supplier funding and cap conditions, skipped runs and the possibility of costs after pausing already admitted requests. No supplier request, purchase, outreach, placement verification or monitoring change occurred.

Evidence copy preserves owner-supplied and unverified provenance, connector reports versus independent live-page confirmation, comparable measurement windows versus causation, correction history and irreversible removal. Log privacy, local user-agent reduction, deduplication and inclusive/exclusive UTC limits remain explicit. The benchmark retains its source $5 authorization/expiry wording; this authoring does not renew or exercise that authorization. No model request, benchmark, evidence import, publication or removal occurred.

Workflow copy preserves approval versus publication, target dates versus publication schedules, overdue/unconfirmed attempts, generation recovery without renewed generation and source-review holds. Image previews and local structured-data checks do not confirm destination fidelity or delivery. Numeric/placeholder checks and whole-catalog equality pass. No generation, approval, scheduling, publication or recovery mutation occurred.
