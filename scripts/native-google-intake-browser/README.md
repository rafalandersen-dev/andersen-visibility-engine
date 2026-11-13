# Native Google intake — local synthetic browser fixture

Loopback-only fixture that mounts the **actual** `NativeGoogleIntakePanel` (with the real parser, UI
helper, i18n and house Button) over a synthetic store/auth and synthetic server functions. No `.env`,
no app server, no network — the in-page guard refuses every request, and Supabase/`.server.ts`
imports are refused at build time.

```
node scripts/native-google-intake-browser/build.cjs
# open the printed output dir's index.html (default /tmp/milo-native-google-intake-browser-20261113)
#   index.html?locale=en|pl|sv|da          interactive
#   index.html?locale=en&check=1           scripted matrix → #results + window.__nativeIntakeReport
```

Interpretation is produced by the real client-safe parser over the stored bytes, so the preview and
the persisted report are genuinely derived; only transport/persistence is synthetic.

**Fixture controls (outside the product):** sign out, sign in, same-actor re-sign-in, switch project,
toggle read/stage failure, hang the next persist and release it (ok/fail). Use these to drive the
session/async guards, stale-read hiding, and deferred-response handling.

The `check=1` matrix is a **scaffold** for Codex's native-browser acceptance (including 390 px and
keyboard); it does not constitute browser acceptance until Codex runs it. No real customer data, no
production writes.

**Bing source.** The panel now also interprets Bing Webmaster Tools "AI Performance" (BETA): choose
the Bing source in the form (no Filters.csv) and upload an Overview or Pages CSV. The synthetic
`persist()` re-parses it with the real Bing parser and rejects a forged Bing market/timezone/filter.
Synthetic samples are on `window.__nativeIntakeBingSamples`. The scripted `check=1` matrix now drives
both paths: the Google journey plus Bing Overview/Pages preview/save/reopen (distinct metrics), a
source/CSV-kind switch that invalidates the preview and restores the Google Filters requirement, a
mismatched-CSV rejection, Bing's missing Filters input + oversize-before-read, and a scoped delete that
preserves the other source. This remains a scaffold, not acceptance: the real 390 px + keyboard browser
run in four languages and the real private export are Codex's gates.
