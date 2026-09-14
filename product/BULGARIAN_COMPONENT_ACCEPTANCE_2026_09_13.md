# Bulgarian focused component checks - 13 September 2026

Baseline: f62988c (complete staged Bulgarian catalog; existing component focus-return implementation). The local harness accepts bg, loads BG_STAGED_CATALOG and throws on missing translations. Bulgarian is passed to the component for language/date formatting. Runtime catalogs and picker remain unchanged.

The Codex in-app browser returned passed: true, locale: bg for all nine interaction groups:

1. Confirmed save, pending duplicate suppression and success feedback.
2. Withdrawal clears saved status and requires fresh confirmation.
3. Failed save shows an alert and requires reinspection.
4. Unmounted scope ignores late mutation feedback.
5. Confirmed save refreshes the parent despite history failure; retry remains held.
6. Confirmed withdrawal clears acknowledgements and refreshes the parent despite history failure.
7. Forgotten/ineligible evidence has no approval controls.
8. Current facts with unavailable history remain unsavable.
9. Closing inspection returns focus to its opener.

The existing assertions additionally check current/original evidence descriptions, panel language and busy states. The final browser state showed focus on the translated inspection opener. English fixture article/source text is intentional; interface text came from the actual Bulgarian staged catalog. The final alert is intentional failed-history fixture state. No application backend or provider was contacted. The loopback server was stopped with exit 0.

Application TypeScript did not change; baseline f62988c passed all 40 Bulgarian/catalog checks and type checking. Integrated candidate validation follows separately.

This is focused component interaction with local fixtures and no production stylesheet. It does not establish full-page responsive layout, absence of clipping, a complete keyboard journey, screen-reader announcements, fluent-language review, backend authorization or real-use acceptance. Bulgarian remains staged and all full-roadmap release gates remain open.
