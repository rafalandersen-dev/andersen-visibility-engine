# Knowledge review close focus — 12 September 2026

Baseline: d84b853. Closing an open KnowledgeOutputInspection removed its focused close control and left browser focus on the document. Keyboard users lost their position at the review entry point.

The component now keeps a ref to its existing inspection opener and focuses it when closing the snapshot. The change does not perform another inspection or change server review authority.

The preserved browser harness focuses the close control, closes the panel, verifies the close control is removed and checks document.activeElement against the opener. Before the component change, the Slovak fixture failed this new assertion after the existing eight interaction groups passed. After the change, all nine groups passed in the Codex in-app browser. The final accessibility snapshot also located focus on the remaining opener. The temporary local server was stopped.

The browser evidence uses the real component/Button and local fixtures without production styles. It establishes focus return after close, not complete keyboard navigation, full-page responsive behavior, actual screen-reader announcements, backend authorization or real-use acceptance.

Validation: all 42 focused component/Slovak/catalog tests, scoped component lint, whitespace checks and type checking passed. Type log: /tmp/milo-knowledge-review-focus-types.log.
