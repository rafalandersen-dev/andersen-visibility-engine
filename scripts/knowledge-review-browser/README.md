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

Build with `node scripts/knowledge-review-browser/build.cjs fi`, then start the same local server. The adapter imports the actual staged Finnish catalog, substitutes variables literally and throws for missing keys. The component receives `fi` for date formatting; the harness document declares Finnish and UTF-8. This does not register Finnish in the production catalog or language picker. Omit the argument (or use `keys`) to retain the original key-based checks. Other arguments are rejected.

On 12 September 2026, against candidate a44c5d4, all four interaction groups passed in the Codex in-app browser with Finnish copy. The original keys mode also passed after rebuilding. The temporary local server was stopped. The harness has no production stylesheet, so these results establish translated component interaction only, not responsive layout, visual clipping, keyboard/screen-reader acceptance, full-page locale semantics, fluent review, backend authorization or real-use acceptance.
