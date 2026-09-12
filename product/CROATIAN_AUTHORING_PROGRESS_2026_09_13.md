# Croatian interface authoring — 13 September 2026

Croatian is staged only: 855 of the current 3,768 English interface keys across thirteen complete batches. It is excluded from UI_CATALOGS and the language picker. Active UI remains EN/PL/SV/DA; FR/DE/ES/IT/PT/NL/FI/CS/SK/SL retain complete staged authoring and incomplete acceptance status.

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

The frozen staged registry assigns each key once. Namespace checks verify exact keys, current composed-English source fingerprints, nonempty values and preserved placeholders, numbers, URLs and email tokens. All 24 Croatian/catalog tests, scoped lint, whitespace and type checking pass. Changed code formatted. Type log: /tmp/milo-croatian-pricing-studies-types.log.

Terminology: radni prostor (workspace), projekt, lozinka (password), ponovno postavljanje lozinke (password reset), bočna traka (sidebar), unos (network listing), paket (subscription plan), plan (workflow plan), smjernice za sadržaj (content brief), poveznica (link). Use polite plural explanatory instructions and concise action labels. Preserve provider/product names and placeholders.

Recovery text retains conditional eligibility without confirming account existence. Marketing and successful sign-in claims retain their implementation and real-use acceptance obligations. No authentication, email, account, credential or provider operation occurred.

Core wording distinguishes interface and content language, saved setup and unfinished generation, draft review, target dates, scheduled publication, sent-to-site and published states. Backlinks is translated as povratne poveznice; general links remain poveznice. Other core terms: otkrivanje (discovery), kontaktiranje (outreach), objava zakazana (scheduled publication), u pregledu (in review).

Setup copy preserves separate approval and publication actions, prior approved-draft uncertainty and configured destination/secret handling. Service actions retain named-item placeholders. Audit copy distinguishes readable homepage evidence from business-context-only fallback; scores remain assessments rather than rankings, measured performance or a whole-site crawl. No settings, provider, audit or publication action occurred.

Analytics copy preserves recorded-event versus unique-visitor distinctions, click-rate versus completed conversions, the 50,000-event/60-day bound and publication-history limitations. Billing retains linked legacy-portal conditions, manually granted plan eligibility, separate backlink purchase approval and configured-feature limits. Terms include besplatni pregled (free preview), povezivači (connectors) and izvješća pod vašim brendom (white-label reports). No portal, payment, tracking or provider action occurred.

Evidence-screen copy retains snapshot versus continuous-monitoring limits, failed retrieval as no competitor evidence, opposite gap/readiness score directions and the separation of readiness estimates, recorded answers and AI referrals. Terms include upit (prompt), nedostatak (gap), snimka stanja (snapshot) and odredišna stranica (landing page). No competitor retrieval, model request, analysis or opportunity creation occurred.

Plan copy distinguishes work targets from publication times, suggestion acceptance from content creation/scheduling, sample rows from project evidence, skipped batch items and unlinked drafts with still-active publication schedules. Terms include ciljni datum rada (work target), Ploča/Popis/Kalendar (Board/List/Calendar) and obnovi (restore). No generation, sample removal, scheduling, archive or restoration action occurred.

Editor copy preserves image privacy until approval, controlled-origin and alt-text requirements, explicit draft saving, unresolved-link blocks, source validation status, real-author consent, and structured-data delivery/search-engine limits. Terms include alternativni tekst (alt text), istaknuta slika (featured image), Izvori i autor (Sources & Author) and metapodaci (metadata). No upload, image generation, approval, source validation or publication action occurred.

Public pricing retains region versus billing eligibility, separate placement purchases, paid activation holds and no outcome guarantees. Case studies retain implementation/demo/internal-example scope, incomplete live destination/publication/measurement acceptance and no verified growth claims. Service terms: postavljanje uz pomoć (assisted setup), mjesečna podrška (monthly care), beta verzija uz pomoć (assisted beta). No checkout, activation, purchase, provider request or publication occurred.

Remaining: 2,913 interface messages, fluent-language/terminology review, rendered mobile/desktop and accessibility checks, and activation acceptance. Next batch: public home using the current composed English source. This staged work does not complete R20 or change release gates.
