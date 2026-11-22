/* Native-findings review/authoring fixture: loopback-only, synthetic data, no .env, no app server.
 *
 *   node scripts/native-findings-browser/build.cjs
 *
 * Reuses the native-google-intake fixture's bundle/boundary pipeline verbatim (`buildFixture`): the same
 * @/ resolver, the same store/auth/`*.functions.ts` stubbing, the same Supabase/`.server.ts` build-time
 * refusals, and the same inlined network guard — no copied framework. It bundles the ACTUAL
 * CitationFindingAuthor + CitationReviewPanel (owner & reviewer) + native ReportView with their real i18n,
 * house controls (Select/Button) and parser. Output defaults to
 * /tmp/milo-native-findings-browser-20261114 (MILO_BROWSER_OUT overrides it). No live backend, no real
 * acceptance here — the browser/keyboard/390px matrix is a later stage against the coherent UI. */
const path = require("node:path");
const { buildFixture } = require("../native-google-intake-browser/build.cjs");

async function main() {
  await buildFixture({
    source: __dirname,
    baseName: "milo-native-findings-browser-20261114",
    htmlTitle: "Milo native findings review — local synthetic fixture",
    // Reuse the intake fixture's network guard rather than copy it.
    guardFile: path.join(__dirname, "../native-google-intake-browser/network-guard.js"),
    // Actual-source proof: these MUST appear in the bundle, or the build fails (no fake UI slipped in).
    // Covers the author, both review modes, the intake panel + ReportView, the house controls, the real
    // parsers/helpers, and all FOUR active i18n catalogs.
    requiredSource: [
      "src/components/CitationFindingAuthor.tsx",
      "src/components/CitationReviewPanel.tsx",
      "src/components/NativeGoogleIntakePanel.tsx",
      "src/components/ui/select.tsx",
      "src/components/ui/button.tsx",
      "src/lib/citation-authoring.ts",
      "src/lib/citation-review-ui.ts",
      "src/lib/native-google-ai-csv.ts",
      "src/lib/native-bing-ai-csv.ts",
      "src/lib/native-ai-artifact.ts",
      "src/lib/native-google-intake-ui.ts",
      "src/i18n/en.ts",
      "src/i18n/pl.ts",
      "src/i18n/sv.ts",
      "src/i18n/da.ts",
    ],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
