# Hungarian focused component checks - 13 September 2026

Baseline: c0d4a3b plus the complete Hungarian workflow batch and hu harness mode (existing component focus-return implementation). The local harness accepts hu, loads HU_STAGED_CATALOG and throws on missing translations. Hungarian is passed to the component for language/date formatting. Runtime catalogs and picker remain unchanged.

The Codex in-app browser returned passed: true, locale: hu for all nine interaction groups:

1. Confirmed save, pending duplicate suppression and success feedback.
2. Withdrawal clears saved status and requires fresh confirmation.
3. Failed save shows an alert and requires reinspection.
4. Unmounted scope ignores late mutation feedback.
5. Confirmed save refreshes the parent despite history failure; retry remains held.
6. Confirmed withdrawal clears acknowledgements and refreshes the parent despite history failure.
7. Forgotten/ineligible evidence has no approval controls.
8. Current facts with unavailable history remain unsavable.
9. Closing inspection returns focus to its opener.

The existing assertions additionally check current/original evidence descriptions, panel language and busy states. The final browser state showed focus on the translated inspection opener. English fixture article/source text is intentional; interface text came from the actual Hungarian staged catalog. The final alert is intentional failed-history fixture state. No application backend or provider was contacted. The loopback server was stopped with exit 0.

All 40 Hungarian/catalog checks pass. Application type checking and integrated candidate validation are recorded separately; no live provider acceptance is inferred.

This is focused component interaction with local fixtures and no production stylesheet. It does not establish full-page responsive layout, absence of clipping, a complete keyboard journey, screen-reader announcements, fluent-language review, backend authorization or real-use acceptance. Hungarian remains staged and all full-roadmap release gates remain open.
