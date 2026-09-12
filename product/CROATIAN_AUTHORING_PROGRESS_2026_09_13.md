# Croatian interface authoring — 13 September 2026

Croatian is staged only: 3,227 of the current 3,768 English interface keys across twenty-six complete batches. It is excluded from UI_CATALOGS and the language picker. Active UI remains EN/PL/SV/DA; FR/DE/ES/IT/PT/NL/FI/CS/SK/SL retain complete staged authoring and incomplete acceptance status.

| Batch | Keys | Composed English baseline |
| --- | ---: | --- |
| Authentication and password recovery | 42 | b450bc5 |
| Shared controls and navigation accessibility labels | 30 | b450bc5 |
| Core navigation, onboarding, setup and workflow | 202 | 9146c53 |
| Setup screen | 24 | cae5a6d |
| Services screen | 18 | cae5a6d |
| Audit screen | 29 | cae5a6d |
| Analytics screen | 36 | 84890e0 |
| Billing screen | 54 | 84890e0 |
| Competitor and AI-readiness evidence screen | 89 | 5b2f76a |
| Plan screen | 113 | 26439c1 |
| Editor screen | 148 | 7b5b342 |
| Public pricing | 40 | 9c59c24 |
| Public case studies | 30 | 9c59c24 |
| Public home | 100 | dce3a94 |
| Beta screen | 88 | 43e885c |
| Beta guidance | 125 | f59616e |
| Public beta | 100 | ca38a2c |
| Configuration | 220 | aedd7bf |
| Collaboration | 248 | cb473e8 |
| Knowledge | 242 | 9e0e08c |
| Technical | 238 | 6eb1efc |
| Measurements | 204 | f146e88 |
| Outreach | 158 | 11dab5c |
| Growth | 201 | 3a7929e |
| Commerce | 192 | c2a33a6 |
| Links | 256 | 7194081 |

The frozen staged registry assigns each key once. Namespace checks verify exact keys, current composed-English source fingerprints, nonempty values and preserved placeholders, numbers, URLs and email tokens. All 37 Croatian/catalog tests, scoped lint, whitespace and type checking pass. Changed code formatted. Type log: /tmp/milo-croatian-links-types.log.

Terminology: radni prostor (workspace), projekt, lozinka (password), ponovno postavljanje lozinke (password reset), bočna traka (sidebar), unos (network listing), paket (subscription plan), plan (workflow plan), smjernice za sadržaj (content brief), poveznica (link). Use polite plural explanatory instructions and concise action labels. Preserve provider/product names and placeholders.

Recovery text retains conditional eligibility without confirming account existence. Marketing and successful sign-in claims retain their implementation and real-use acceptance obligations. No authentication, email, account, credential or provider operation occurred.

Core wording distinguishes interface and content language, saved setup and unfinished generation, draft review, target dates, scheduled publication, sent-to-site and published states. Backlinks is translated as povratne poveznice; general links remain poveznice. Other core terms: otkrivanje (discovery), kontaktiranje (outreach), objava zakazana (scheduled publication), u pregledu (in review).

Setup copy preserves separate approval and publication actions, prior approved-draft uncertainty and configured destination/secret handling. Service actions retain named-item placeholders. Audit copy distinguishes readable homepage evidence from business-context-only fallback; scores remain assessments rather than rankings, measured performance or a whole-site crawl. No settings, provider, audit or publication action occurred.

Analytics copy preserves recorded-event versus unique-visitor distinctions, click-rate versus completed conversions, the 50,000-event/60-day bound and publication-history limitations. Billing retains linked legacy-portal conditions, manually granted plan eligibility, separate backlink purchase approval and configured-feature limits. Terms include besplatni pregled (free preview), povezivači (connectors) and izvješća pod vašim brendom (white-label reports). No portal, payment, tracking or provider action occurred.

Evidence-screen copy retains snapshot versus continuous-monitoring limits, failed retrieval as no competitor evidence, opposite gap/readiness score directions and the separation of readiness estimates, recorded answers and AI referrals. Terms include upit (prompt), nedostatak (gap), snimka stanja (snapshot) and odredišna stranica (landing page). No competitor retrieval, model request, analysis or opportunity creation occurred.

Plan copy distinguishes work targets from publication times, suggestion acceptance from content creation/scheduling, sample rows from project evidence, skipped batch items and unlinked drafts with still-active publication schedules. Terms include ciljni datum rada (work target), Ploča/Popis/Kalendar (Board/List/Calendar) and obnovi (restore). No generation, sample removal, scheduling, archive or restoration action occurred.

Editor copy preserves image privacy until approval, controlled-origin and alt-text requirements, explicit draft saving, unresolved-link blocks, source validation status, real-author consent, and structured-data delivery/search-engine limits. Terms include alternativni tekst (alt text), istaknuta slika (featured image), Izvori i autor (Sources & Author) and metapodaci (metadata). No upload, image generation, approval, source validation or publication action occurred.

Public pricing retains region versus billing eligibility, separate placement purchases, paid activation holds and no outcome guarantees. Case studies retain implementation/demo/internal-example scope, incomplete live destination/publication/measurement acceptance and no verified growth claims. Service terms: postavljanje uz pomoć (assisted setup), mjesečna podrška (monthly care), beta verzija uz pomoć (assisted beta). No checkout, activation, purchase, provider request or publication occurred.

Public home retains missing-data versus zero-activity distinctions, supported-connection/verified-destination requirements, linked-subscription portal limits and paid activation/purchase holds. The three headline fragments join as “Vaš mjesečni sustav rasta uz umjetnu inteligenciju”; src/routes/index.tsx joins them in this order with spaces. This is a copy/source check, not rendered acceptance. Existing marketing claims still require implementation and real-use evidence. No provider operation occurred.

Beta-screen copy preserves owner-only sales guidance, separate outreach-language selection and review, original CSV fields/values, validation cohort counts and prospect statuses. Sales discovery is utvrđivanje potreba, distinct from product discovery (otkrivanje). No outreach, recruitment, provider action or CSV data change occurred.

Beta guidance preserves target rather than observed validation counts, demos versus real-use evidence, pilot scope, no outcome guarantees, and separate authorization for outreach, audits, generation, publication and payments. Copying a template does not send it; manual billing status does not establish payment readiness. No prospect contact, audit, demo, generation, payment or provider operation occurred.

Public beta retains individually agreed pilot scope, one-time versus monthly price periods, demo-data limits, per-site connector testing and paid-launch/payment holds. The source statement naming four supported languages requires reconciliation at activation. No audit, application, email, payment or provider operation occurred.

Configuration copy preserves brand constraints, minimal connector permissions, server-side credential handling, read/write/propose distinctions, prohibition of self-approval/publication/deletion, and approval/publication separation. Coverage records retain source/version/expiry authority and do not verify live listings, NAP, language or performance. Provider navigation labels and technical identifiers remain recognizable. No connection, credential, authorization or publication operation occurred.

Collaboration copy preserves invitation creation versus email request versus granted access, owner assignment plus recipient consent, exact-version reviews, approval withdrawal on edits/policy changes, historical evidence limits and uncertain delivery/recovery outcomes. Roles: Čitatelj, Urednik, Pregledavatelj. Editorial lesson: uredničko pravilo. No invitation, email, role, consent, review or publication action occurred.

Knowledge copy preserves exact record/source versions, review validity and expiry, forgotten-evidence limits, separate knowledge/publication approval, bounded text/catalog capture and uncertain weekly recovery semantics. Source-reported acceptance is not independent verification. Owner fields retain precedence. No source fetch, upload, acceptance, review decision, scheduling or publication operation occurred.

Technical copy preserves ownership expiry, robots holds, crawl/sitemap/storage bounds, saved observation versus repair evidence, Google saved indexing versus live-page checks, lab versus real-user metrics and uncertain-request recovery without automatic repetition. Search Console property: entitet. No DNS, crawl, Google, measurement or provider request occurred.

Measurement copy preserves saved-publication versus live-page evidence, email acceptance versus delivery, AI referrals versus mentions/citations/bot activity, bounded CSV import, separate dates and declared source/property/aggregate semantics. Numeric CSV guidance and technical identifiers retain their source meaning. No email, tracking installation, Google connection, sync or import occurred.

Outreach copy preserves exact recipient/content confirmation, separate follow-up review, suppression and frequency controls, service-owned reservations, uncertain-delivery holds and receipt recovery limits. Hook and image-anchor review semantics retain source meaning. Opening hook: privlačan uvod. No generation, recipient contact, approval or sending operation occurred.

Growth copy preserves suggested authority outcomes, readiness versus ranking limits and the immediate application of owner-approved proposals. Duplicate/capacity skips, missing targets, private notes and unchanged setup-complete status retain their source meaning. No generation, audit, outreach, proposal approval or project mutation occurred.

Commerce copy preserves test-payment versus real-charge distinctions, retry reuse, manual activation states, pricing eligibility, connection-test limits and unverified saved-import provenance. Checklist completion remains distinct from paid-launch and real-site acceptance. No payment, billing-profile, activation, connection, import or publication operation occurred.

Links copy preserves network relevance limits, review requests versus explicitly approved paid orders, uncertain-outcome holds, incomplete provider-index evidence, UTC collection windows, paging limits and supplier-budget accounting. Pausing does not cancel already admitted collection; saved source labels do not independently verify live placements. No network listing, outreach, purchase, provider collection, monitoring activation or accounting operation occurred.

Remaining: 541 interface messages, fluent-language/terminology review, rendered mobile/desktop and accessibility checks, and activation acceptance. Next batch: evidence using the current composed English source. This staged work does not complete R20 or change release gates.
