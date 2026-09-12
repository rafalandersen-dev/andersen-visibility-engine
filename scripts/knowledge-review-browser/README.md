# Knowledge review browser interaction check

Run from the repository root:

```sh
node scripts/knowledge-review-browser/build.cjs
python3 -m http.server 8769 --bind 127.0.0.1 --directory /tmp/milo-knowledge-review-browser
```

Open `http://127.0.0.1:8769` in a browser and read the final JSON result. Stop the local server after the check. The bundle imports the real KnowledgeOutputInspection component and Button. The four server functions use local fixtures, and the default translation adapter displays keys; no application backend is contacted. Build output stays outside the repository.

The script exercises rendered checkbox/button events and checks confirmation requirements, duplicate save suppression, successful save feedback, withdrawal resetting confirmations, failed-save feedback, and late results after a keyed remount. It uses short event-loop waits, so investigate timing before interpreting a failure on a heavily loaded browser. This is a focused development harness, not a replacement for full-page accessibility, real backend, or solo/team acceptance.

Verified 12 September 2026 against component implementation 73a9475 in the Codex in-app browser. All four result groups passed, including a repeat from the preserved harness. No component change was required. The separate Chrome DevTools session could not open because its profile was already in use; it was left untouched.

## Staged Finnish interaction mode

Build with `node scripts/knowledge-review-browser/build.cjs fi`, then start the same local server. The adapter imports the actual staged Finnish catalog, substitutes variables literally and throws for missing keys. The component receives `fi` for date formatting; the harness document declares Finnish and UTF-8. This does not register Finnish in the production catalog or language picker. Omit the argument (or use `keys`) to retain the original key-based checks. Czech is also supported with `cs` and Slovak with `sk`; other arguments are rejected.

On 12 September 2026, against candidate a44c5d4, all four interaction groups passed in the Codex in-app browser with Finnish copy. The original keys mode also passed after rebuilding. The temporary local server was stopped. The harness has no production stylesheet, so these results establish translated component interaction only, not responsive layout, visual clipping, keyboard/screen-reader acceptance, full-page locale semantics, fluent review, backend authorization or real-use acceptance.

Accessibility follow-up: the rendered check also resolves each fact checkbox description to its evidence context, checks the panel language and verifies busy-state changes during inspection/save. This checks DOM relationships and lifecycle state; an actual screen-reader session remains necessary to assess announcement quality.

## Staged Czech interaction mode

Build with `node scripts/knowledge-review-browser/build.cjs cs`. The adapter imports the actual completed Czech staged catalog and passes `cs` to the real component for dates and panel language. Against candidate 7b9a1c6, all four interaction groups passed in the Codex in-app browser, including evidence-description, language and busy-state assertions. No production stylesheet is included: this proves focused translated component interaction, not full-page responsiveness, fluent-language, screen-reader, backend or real-use acceptance.

After adding Czech, Finnish and keys modes were rebuilt and each passed all four groups again. The temporary local server was stopped.

History-failure follow-up: the harness now has six result groups. It also confirms that a successful save or withdrawal notifies the parent when its subsequent history read fails; withdrawal clears acknowledgements, stale active history disappears and save remains held. All six passed with Czech text against the history-refresh candidate.

Eligibility follow-up against f475095: the positive fixture now includes an accepted current fact and active source at revision 2, distinct from the original revision 1 references. Assertions require current fact text, source label and current-version context in the fact acknowledgement description. Two additional groups verify that forgotten/ineligible evidence has no acknowledgement or save controls, and that a successful fact read with failed history remains unsavable even after selecting confirmations. All eight groups passed in the Codex in-app browser with Czech text. This is component evidence with local fixtures, not server eligibility validation. Temporary server stopped. No application implementation change was needed for these cases.

## Staged Slovak interaction mode

Build with `node scripts/knowledge-review-browser/build.cjs sk`. The adapter imports the complete staged Slovak catalog and passes `sk` to the component for dates and panel language. Against component/catalog baseline 5cd8e2a, all eight interaction groups passed in the Codex in-app browser: confirmation and duplicate suppression, withdrawal reset, failed-save reinspection, late unmount results, confirmed save/history failure, confirmed withdrawal/history failure, ineligible evidence and unavailable-history blocking. Evidence descriptions, language and busy state assertions passed. The temporary server was stopped. This harness excludes production styling and uses local server fixtures; full-page mobile/desktop, fluent-language, keyboard/screen-reader, backend and real-use acceptance remain open.

Focus-return follow-up: a ninth group focuses the close control, closes inspection and requires focus to return to the opener. This failed on d84b853 and passed after adding the component opener ref/focus return. All nine groups passed with Slovak copy. See product/KNOWLEDGE_REVIEW_FOCUS_RETURN_2026_09_12.md for scope and validation.
