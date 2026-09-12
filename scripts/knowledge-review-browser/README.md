# Knowledge review browser interaction check

Run from the repository root:

```sh
node scripts/knowledge-review-browser/build.cjs
python3 -m http.server 8769 --bind 127.0.0.1 --directory /tmp/milo-knowledge-review-browser
```

Open `http://127.0.0.1:8769` in a browser and read the final JSON result. Stop the local server after the check. The bundle imports the real KnowledgeOutputInspection component and Button. Only translations and the four server functions are replaced with local fixtures; no application backend is contacted. Build output stays outside the repository.

The script exercises rendered checkbox/button events and checks confirmation requirements, duplicate save suppression, successful save feedback, withdrawal resetting confirmations, failed-save feedback, and late results after a keyed remount. It uses short event-loop waits, so investigate timing before interpreting a failure on a heavily loaded browser. This is a focused development harness, not a replacement for full-page accessibility, real backend, or solo/team acceptance.

Verified 12 September 2026 against component implementation 73a9475 in the Codex in-app browser. All four result groups passed, including a repeat from the preserved harness. No component change was required. The separate Chrome DevTools session could not open because its profile was already in use; it was left untouched.
