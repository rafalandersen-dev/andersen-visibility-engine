# Bulgarian interface authoring — 13 September 2026

Bulgarian is staged only: 2,971 of the current 3,768 English interface keys across twenty-five complete batches. It is excluded from UI_CATALOGS and the language picker. Four UI catalogs remain active; eleven other catalogs are completely authored in staging with acceptance still incomplete.

| Batch | Keys | Composed English baseline |
| --- | ---: | --- |
| Authentication and password recovery | 42 | 7a9ab2d |
| Shared controls and navigation accessibility labels | 30 | 7a9ab2d |
| Core navigation, onboarding, setup and workflow | 202 | 57f1c83 |
| Setup screen | 24 | 07d0f22 |
| Services screen | 18 | 07d0f22 |
| Audit screen | 29 | 07d0f22 |
| Analytics screen | 36 | 9ff877a |
| Billing screen | 54 | 9ff877a |
| Competitor and AI-readiness evidence screen | 89 | 7d62eb3 |
| Plan screen | 113 | b330d65 |
| Editor screen | 148 | eda0235 |
| Public pricing | 40 | 7e16ed1 |
| Public case studies | 30 | 7e16ed1 |
| Public home | 100 | 788b5ae |
| Beta screen | 88 | 4e56d69 |
| Beta guidance | 125 | 11a57eb |
| Public beta | 100 | c06deab |
| Configuration | 220 | abd962a |
| Collaboration | 248 | 67581a2 |
| Knowledge | 242 | a672ef5 |
| Technical | 238 | c6c451f |
| Measurements | 204 | 0846c03 |
| Outreach | 158 | 42f102e |
| Growth | 201 | e2f656c |
| Commerce | 192 | f995f32 |

The frozen registry assigns each key once. Namespace checks verify exact keys, current composed-English source fingerprints, nonempty values and preserved placeholders, numbers, URLs and email tokens. All 36 Bulgarian/catalog tests, scoped lint, formatting, whitespace and type checking pass. Type log: /tmp/milo-bulgarian-commerce-types.log. Full-catalog equality will be required when all batches are authored.

Terminology: работно пространство (workspace), акаунт (account), проект (project), парола (password), възстановяване на парола (password reset), странична лента (sidebar), запис (network listing), задания за съдържание (content briefs). Use polite plural explanations and concise imperative action labels; preserve provider/product names and placeholders.

Recovery text preserves conditional eligibility without confirming account existence. Successful sign-in and marketing copy still require implementation and real-use acceptance. No authentication, email, account, credential or provider operation occurred.

Core copy preserves interface/content-language distinctions, saved setup versus unfinished generation, draft review, target dates, scheduled publication, sent-to-site and published states. No setup, generation, schedule or publication operation occurred.

Setup copy preserves approval/publication separation, previously approved draft uncertainty and configured destination/secret handling. Service controls retain named-item parameters. Audit copy distinguishes readable homepage text from business-context fallback; scores remain assessments rather than rankings, measured performance or a whole-site crawl. No settings, credential, audit, provider or publication action occurred.

Analytics copy preserves recorded events versus unique visitors, click rate versus completed conversions, the 50,000-event/60-day bound and publication-history limits. Billing retains linked legacy-portal conditions, manually granted plan eligibility, separate backlink purchase approval and configured-feature limits. No portal, payment, tracking or provider operation occurred.

Evidence-screen copy preserves snapshot versus ongoing-monitoring limits, failed retrieval as no competitor evidence, opposite gap/readiness score directions, and the separation of readiness estimates, recorded answers and AI referrals. Prompt terminology is distinguished from questions; possible gaps remain suggestions. No competitor retrieval, model request, analysis or opportunity creation occurred.

Plan copy distinguishes work targets from publication times, suggestion acceptance from content creation/scheduling, sample rows from project evidence, skipped batch items and unlinked drafts with still-active publication schedules. Board/List/Calendar terminology is established for subsequent workflow copy. No generation, sample removal, scheduling, archive or restoration action occurred.

Editor copy preserves image privacy until approval, controlled-origin and alt-text requirements, explicit draft saving, unresolved-link blocks, source validation status, real-author consent and structured-data delivery/search-engine limits. No upload, image generation, approval, source validation or publication action occurred.

Public pricing retains region versus billing eligibility, separate placement purchases, paid activation holds and no outcome guarantees. Case studies retain implementation/demo/internal-example scope, incomplete live destination/publication/measurement acceptance and no verified growth claims. No checkout, activation, purchase, provider request or publication occurred.

Public home retains missing-data versus zero-activity distinctions, supported-connection/verified-destination requirements, linked-subscription portal limits and paid activation/purchase holds. The three headline fragments were reviewed in the concatenation order used by src/routes/index.tsx; this is a copy/source check, not rendered acceptance. Existing marketing claims still require implementation and real-use evidence. No provider operation occurred.

Beta-screen copy preserves owner-only sales guidance, separate outreach-language selection and review, original CSV fields/values, validation cohort counts and prospect statuses. Sales discovery is needs discovery, distinct from product opportunity discovery. No outreach, recruitment, provider action or CSV data change occurred.

Beta guidance preserves target rather than observed validation counts, demos versus real-use evidence, pilot scope, no outcome guarantees and separate authorization for outreach, audits, generation, publication and payments. Copying a template does not send it; manual billing status does not establish payment readiness. No prospect contact, audit, demo, generation, payment or provider operation occurred.

Public-beta copy preserves pilot scope, price periods, demo-evidence limits and paid/connector holds. The four-language statement requires reconciliation at activation. No audit, application, email, payment or provider operation occurred.

Configuration copy preserves brand constraints, connector permissions, approval/publication separation and coverage-evidence limits. Read-only, proposal and write scopes stay distinct; saved statements do not verify listings, languages, rankings or live coverage. No connection, credential, authorization or publication operation occurred.

Collaboration copy preserves invitation/email/access distinctions, consent, exact-version approvals, historical evidence and uncertain delivery/recovery outcomes. Viewer, Editor and Reviewer role labels are distinct. No invitation, email, role, consent, review or publication action occurred.

Knowledge copy preserves source/version/expiry limits, separate knowledge review and publication approval, bounded capture and weekly recovery semantics. Acceptance remains source-reported evidence; forgotten originals cannot be reconstructed by review. No source fetch, upload, acceptance, review decision, schedule or publication operation occurred.

Technical copy preserves crawl/ownership/robots limits, saved Google evidence, lab versus real-user measurements and uncertain-request semantics. Partial or missing evidence is not full-site, index or performance acceptance. No DNS, crawl, Google, measurement or provider request occurred.

Measurements copy preserves saved publication/delivery evidence, referral versus mention signals, bounded imports and separate source/date/aggregate semantics. Inherited analytics labels still require behavioral and real-use acceptance. No email, tracking installation, Google connection, sync or import occurred.

Outreach copy preserves exact-message approvals, separate follow-ups, suppression, uncertain-delivery holds and hook/placement review. Service delivery records remain distinct from editable workflow labels. No generation, recipient contact, approval or sending operation occurred.

Growth copy preserves suggested authority outcomes, readiness limits and immediate application of owner-approved proposals. Duplicates and workspace limits can reduce created item counts; inherited outcome labels require real-use acceptance. No generation, audit, outreach, proposal approval or project mutation occurred.

Commerce copy preserves test-payment and manual-activation limits, pricing eligibility, connection-test limits and saved-import provenance. Checklist labels and configuration do not establish paid launch or real-use acceptance. No payment, billing-profile, activation, connection, import or publication operation occurred.

Remaining: 797 interface messages, fluent-language/terminology review, rendered mobile/desktop and accessibility checks, and activation acceptance. Next: links using current composed English source. This staged work does not complete R20 or change release gates.
