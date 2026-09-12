# Slovenian focused component checks — 13 September 2026

Baseline: a575210 (complete staged Slovenian catalog; component focus-return implementation already present). The local knowledge-review harness now accepts `sl`, loads SL_STAGED_CATALOG, substitutes variables and fails on missing translations. The document and component use Slovenian language/date formatting. Production catalogs and the language picker remain unchanged.

The Codex in-app browser returned `passed: true`, `locale: sl` for all nine groups:

1. Confirmed save, pending duplicate suppression and success feedback.
2. Withdrawal clears saved status and requires fresh confirmation.
3. Failed save shows an alert and requires reinspection.
4. Unmounted scope ignores late mutation feedback.
5. Confirmed save refreshes the parent when history fails; retry remains held.
6. Confirmed withdrawal clears acknowledgements and refreshes the parent despite history failure.
7. Forgotten/ineligible evidence displays its limits without approval controls.
8. Current facts with unavailable history cannot be saved as reviewed.
9. Closing inspection returns keyboard focus to its opener.

Existing assertions also check fact/evidence descriptions, current versus original revisions, panel language and busy state. The browser displayed the Slovenian opener with focus after completion. Fixtures deliberately retain English article/source data; translated interface text came from the real staged catalog. No application backend or provider was contacted. The temporary loopback server was stopped with exit 0 after the check.

Focused terminology comparison confirmed consistent labels across matching English keys: Delovni prostor, V pregledu, Seznam/Tabla/Koledar, Privlačen uvod, Viri in avtor, Brezplačni predogled, Vodena nastavitev and Mesečna skrb. No translation change was required by this check. All 40 Slovenian/catalog tests pass after the harness extension; these include whole-catalog equality and batch source/parameter invariants. The preceding authoring baseline passed type checking; no application TypeScript changed here.

This is focused rendered component interaction with local fixtures and no production stylesheet. It does not establish full-page responsive layout, absence of clipping, a complete keyboard journey, actual screen-reader announcements, fluent-language review, backend authorization, provider/CMS behavior or real-use acceptance. Slovenian remains staged. Full R00–R24/D01–D08 release/acceptance gates remain open.
