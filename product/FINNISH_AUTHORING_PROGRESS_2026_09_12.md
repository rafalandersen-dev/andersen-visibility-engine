# Finnish interface authoring — 12 September 2026

Finnish is staged only: 72 of the current 3,768 English interface keys, across two complete namespaces. It is not registered in UI_CATALOGS or the language picker. Active UI remains EN/PL/SV/DA; the fully authored FR/DE/ES/IT/PT/NL catalogs retain their separate acceptance status.

| Batch | Keys | English baseline |
| --- | ---: | --- |
| Authentication and password recovery | 42 | 4fbdd66 |
| Shared controls and navigation accessibility labels | 30 | 4fbdd66 |

Source material was reviewed in auth-screen.ts and shared-ui.ts; tests compare the composed English catalog and its SHA-256 fingerprint, exact namespace key coverage, nonempty translations, placeholders, numbers, URLs and email tokens. The combined Finnish catalog is frozen with unique key ownership. Tests also confirm runtime exclusion.

Terminology: työtila (workspace), projekti (project), salasana (password), palautuslinkki (reset link), sivupalkki (sidebar), arkistoi (archive). Use direct, concise Finnish UI instructions. Preserve conditional password-recovery wording and source placeholders. Do not translate product/provider names as ordinary words.

Validation: 13 Finnish/catalog tests pass; TypeScript, scoped lint and whitespace pass. These mechanical checks do not constitute fluent-language or rendered accessibility acceptance. Source claims about monthly planning and successful sign-in after password update retain their existing implementation/acceptance boundaries.

Remaining: 3,696 English keys, fluent review, consistent terminology across the rest of the product, rendered mobile/desktop and accessibility checks, and approved activation. Next authoring batch is core shell/onboarding/setup/market/language copy, using the current composed English values rather than historical raw base strings. R20 still requires all 24 EU languages across its registered surfaces; this initial batch does not satisfy it.
