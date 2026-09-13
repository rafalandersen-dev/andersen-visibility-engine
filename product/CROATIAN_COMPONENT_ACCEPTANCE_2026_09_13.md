# Croatian focused component checks — 13 September 2026

Baseline: 1c1eeac (complete staged Croatian catalog; existing component focus-return implementation). The local harness now accepts hr, loads HR_STAGED_CATALOG and throws on missing translations. Croatian is passed to the component for language/date formatting. Runtime catalogs and picker remain unchanged.

The Codex in-app browser returned passed: true, locale: hr for all nine interaction groups:

1. Confirmed save, pending duplicate suppression and success feedback.
2. Withdrawal clears saved status and requires fresh confirmation.
3. Failed save shows an alert and requires reinspection.
4. Unmounted scope ignores late mutation feedback.
5. Confirmed save refreshes the parent despite history failure; retry remains held.
6. Confirmed withdrawal clears acknowledgements and refreshes the parent despite history failure.
7. Forgotten/ineligible evidence has no approval controls.
8. Current facts with unavailable history remain unsavable.
9. Closing inspection returns focus to its opener.

The existing harness assertions additionally check current/original evidence descriptions, panel language and busy states. The final browser state showed focus on Pregledaj spremljeno znanje. English fixture article/source text is intentional; interface text came from the actual Croatian staged catalog. No application backend or provider was contacted. The loopback server was stopped with exit 0.

Focused source comparison found consistent terms across matching English keys: Radni prostor, U pregledu, Popis/Ploča/Kalendar, Privlačan uvod, Izvori i autor, Besplatni pregled, Postavljanje uz pomoć and Mjesečna podrška. No copy change was required by this comparison. All 40 Croatian/catalog checks pass after extending the harness. Application TypeScript did not change; baseline 1c1eeac passed type checking.

This is focused component interaction with local fixtures and no production stylesheet. It does not establish full-page responsive layout, absence of clipping, a complete keyboard journey, screen-reader announcements, fluent-language review, backend authorization or real-use acceptance. Croatian remains staged and all full-roadmap release gates remain open.
