# Project panel isolation regression

Run `node scripts/project-panel-browser/build.cjs`, then serve `/tmp/milo-project-panel-browser` on a dedicated loopback port. Open its page and click **Run project switches** once. The result must have `completed: true`, `allPass: true`, and no errors.

This fixture extracts the three actual JSX panel call sites from Setup and renders them with real React. Synthetic stateful panel bodies make stale project drafts observable during A → B → A → B switches and final unmount. Before the correction, repeated sibling keys leave old project panels mounted and produce React key warnings. After the correction, exactly one panel of each kind belongs to the current project and all disappear on unmount.

No application store, backend, credentials, paid generation or network client is imported. CSP blocks outbound connections and forms. This proves reconciliation at the actual call sites; it does not replace live authorization, persistence or the complete Setup route acceptance. Never deploy this fixture.
