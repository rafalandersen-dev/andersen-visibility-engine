/* Local fixture smoke runner (NOT browser acceptance).
 *
 *   node scripts/native-findings-browser/smoke.cjs
 *
 * Bundles scripts/native-findings-browser/smoke.js for Node against THIS repository's CURRENT src only (the
 * product HEAD it is checked out at) — no machine-specific historical overlay — then runs it with a minimal
 * DOM/crypto shim. Backend/`.server` imports are refused at bundle time; bare packages resolve from the
 * repo's installed node_modules. No browser, no network, no server. */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const root = path.resolve(__dirname, "../..");
const esbuild = require(path.join(root, "node_modules/esbuild"));

// Resolve @/… and relative src imports against the current repository src ONLY, so the smoke tests exactly
// the committed product HEAD (reproducible on any machine). A relative import from a scripts file (outside
// src) falls through to esbuild's default resolution.
const SRC = path.join(root, "src");
function logicalOf(spec, importer) {
  if (spec.startsWith("@/")) return spec.slice(2);
  if (spec.startsWith(".")) {
    const rel = path.relative(SRC, importer).replaceAll("\\", "/");
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null; // importer is outside src
    return path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
  }
  return null;
}
function physical(logical) {
  for (const suf of ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"]) {
    const p = path.join(SRC, logical + suf);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

async function main() {
  // Temp bundle under the sandbox temp dir (claude-501), never a transient file inside the repo.
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "milo-native-findings-smoke-"));
  const outfile = path.join(outDir, "smoke.cjs");
  await esbuild.build({
    entryPoints: [path.join(__dirname, "smoke.js")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile,
    logLevel: "warning",
    // Installed dependencies (zod, …) resolve from the repo's node_modules.
    nodePaths: [path.join(root, "node_modules")],
    banner: {
      js: "if(!globalThis.window)globalThis.window=globalThis;if(!globalThis.crypto)globalThis.crypto=require('node:crypto').webcrypto;",
    },
    plugins: [
      {
        name: "repo-src-only",
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            const logical = logicalOf(args.path, args.importer);
            if (logical === null) return;
            if (logical.startsWith("integrations/supabase") || logical.endsWith(".server"))
              throw Error(`Forbidden backend import reached the smoke bundle: ${logical}`);
            const p = physical(logical);
            return p ? { path: p } : undefined;
          });
        },
      },
    ],
  });
  require(outfile); // runs the smoke, which calls process.exit with the pass/fail code
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
