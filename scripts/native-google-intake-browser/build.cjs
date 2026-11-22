/* Native Google intake fixture: loopback-only, synthetic data, no .env, no app server.
 *
 *   node scripts/native-google-intake-browser/build.cjs
 *
 * Bundles the ACTUAL NativeGoogleIntakePanel with its real parser, UI helper, i18n and house Button,
 * under a QueryClient. Store, auth and every `*.functions.ts` server function are replaced at bundle
 * resolution; Supabase and `.server.ts` modules are refused at build time. Output defaults to
 * /tmp/milo-native-google-intake-browser-20261113 (MILO_BROWSER_OUT overrides it). Interactive by
 * default; `?check=1` runs a scripted matrix. No live backend, no real acceptance here.
 *
 * The bundle/boundary pipeline is exported as `buildFixture(config)` so the sibling
 * scripts/native-findings-browser fixture reuses it verbatim (same resolver, same store/auth/function
 * stubbing, same backend refusals, same network guard) instead of copying the framework; this file's own
 * CLI behavior is unchanged. */
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const ts = require(path.join(root, "node_modules/typescript"));
const esbuild = require(path.join(root, "node_modules/esbuild"));

function makeOutDir(preferredOut, baseName) {
  for (const dir of [preferredOut, path.join(require("node:os").tmpdir(), baseName)]) {
    const probe = path.join(
      dir,
      `.write-probe-${process.pid}-${require("node:crypto").randomUUID()}`,
    );
    let created = false;
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.closeSync(fs.openSync(probe, "wx"));
      created = true;
      return dir;
    } catch (error) {
      if (error.code !== "EPERM" && error.code !== "EACCES") throw error;
    } finally {
      if (created) fs.unlinkSync(probe);
    }
  }
  throw Error("No writable fixture output directory (tried " + preferredOut + " and os.tmpdir())");
}
function sourcePath(spec, importer) {
  const p = spec.startsWith("@/")
    ? path.join(root, "src", spec.slice(2))
    : spec.startsWith(".")
      ? path.resolve(path.dirname(importer), spec)
      : null;
  if (!p) return null;
  for (const suffix of ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts"])
    if (fs.existsSync(p + suffix) && fs.statSync(p + suffix).isFile()) return p + suffix;
  return null;
}
function exportNames(file) {
  const ast = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const result = [];
  for (const node of ast.statements) {
    if (!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isVariableStatement(node))
      for (const d of node.declarationList.declarations)
        if (ts.isIdentifier(d.name)) result.push(d.name.text);
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name)
      result.push(node.name.text);
  }
  return result;
}

/**
 * Build one loopback fixture bundle. `config`:
 *   source        absolute fixture folder (holds entry.jsx, fixture.js, store.js, auth.js)
 *   entryFile     entry basename (default "entry.jsx")
 *   requiredSource  "src/…" paths that MUST appear in the bundle (actual-source proof)
 *   baseName      output dir basename (also the os.tmpdir() fallback name)
 *   preferredOut  MILO_BROWSER_OUT || `/tmp/${baseName}`
 *   htmlTitle     <title> text
 *   guardFile     network guard script (default the fixture folder's own; may point at a sibling to reuse it)
 */
async function buildFixture(config) {
  const {
    source,
    entryFile = "entry.jsx",
    requiredSource,
    baseName,
    preferredOut = process.env.MILO_BROWSER_OUT || `/tmp/${baseName}`,
    htmlTitle,
    guardFile = path.join(source, "network-guard.js"),
  } = config;
  const fixtureJs = path.join(source, "fixture.js");
  const storeJs = path.join(source, "store.js");
  const authJs = path.join(source, "auth.js");
  const out = makeOutDir(preferredOut, baseName);
  const crypto = require("node:crypto");
  const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
  const guardSrc = fs.readFileSync(guardFile, "utf8");
  const fixtureFiles = {};
  for (const name of fs.readdirSync(source).sort())
    if (/\.(js|jsx|cjs)$/.test(name))
      fixtureFiles[name] = sha(fs.readFileSync(path.join(source, name)));
  const bundleFile = path.join(out, "bundle.js");
  const result = await esbuild.build({
    entryPoints: [path.join(source, entryFile)],
    bundle: true,
    jsx: "automatic",
    platform: "browser",
    format: "iife",
    outfile: bundleFile,
    // Emitted in memory so the identity below hashes the ACTUAL bundled content (product + fixture code).
    write: false,
    metafile: true,
    logLevel: "warning",
    plugins: [
      {
        name: "milo-fixture-boundaries",
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            const p = sourcePath(args.path, args.importer);
            if (!p) return;
            const rel = path.relative(path.join(root, "src"), p).replaceAll("\\", "/");
            if (rel.startsWith("..")) return;
            if (rel === "lib/store.ts") return { path: p, namespace: "fixture-store" };
            if (rel === "lib/auth.tsx" || rel === "lib/auth.ts") return { path: authJs };
            if (rel.endsWith(".functions.ts")) return { path: p, namespace: "function-stub" };
            if (rel.startsWith("integrations/supabase/") || rel.endsWith(".server.ts"))
              throw Error(
                `Forbidden backend import reached the fixture: ${rel} from ${args.importer}`,
              );
          });
          build.onLoad({ filter: /.*/, namespace: "fixture-store" }, (args) => {
            const implemented = new Set(exportNames(storeJs));
            const refused = exportNames(args.path).filter((n) => !implemented.has(n));
            return {
              contents: [
                `export * from ${JSON.stringify(storeJs)};`,
                `import { record } from ${JSON.stringify(fixtureJs)};`,
                ...refused.map(
                  (n) =>
                    `export const ${n} = (...args) => { record("store.${n}", {}); throw Error("Fixture refuses store.${n}."); };`,
                ),
              ].join("\n"),
              loader: "js",
              resolveDir: source,
            };
          });
          build.onLoad({ filter: /.*/, namespace: "function-stub" }, (args) => ({
            contents: [
              `import { invoke } from ${JSON.stringify(fixtureJs)};`,
              ...exportNames(args.path).map((n) =>
                /^[A-Z0-9_]+$/.test(n)
                  ? `export const ${n} = undefined;`
                  : `export const ${n} = (...args) => invoke(${JSON.stringify(n)}, args);`,
              ),
            ].join("\n"),
            loader: "js",
            resolveDir: source,
          }));
        },
      },
    ],
    define: {
      "process.env.NODE_ENV": '"development"',
      "import.meta.env.DEV": "false",
      "import.meta.env.VITE_MILO_VISUAL_QA": '""',
    },
    loader: { ".woff2": "file", ".woff": "file" },
  });
  const inputs = Object.keys(result.metafile.inputs);
  const forbidden = inputs.filter(
    (p) =>
      !/^(function-stub|fixture-store):/.test(p) &&
      (p.includes("integrations/supabase") || p.endsWith(".server.ts")),
  );
  if (forbidden.length) throw Error("Backend input in bundle: " + forbidden.join(", "));
  const missing = requiredSource.filter((r) => !inputs.some((p) => p.endsWith(r)));
  if (missing.length) throw Error("Actual source missing from bundle: " + missing.join(", "));
  // EXECUTED-bundle identity, NOT circular: the hash of the emitted bundle content WITHOUT the marker line,
  // plus the network guard and title. Any product-only or fixture-only change changes it. The marker is then
  // prepended so the executed script carries its own id, and the HTML echoes it as the expected id: a fresh
  // index.html served with a cached old bundle.js mismatches (BDR2-05/BDR3-05).
  const mainOut = result.outputFiles.find((f) => f.path === bundleFile);
  if (!mainOut) throw Error("esbuild emitted no bundle.js");
  const bundleContentSha256 = sha(mainOut.contents);
  const sourceId = sha(
    JSON.stringify({ bundleContentSha256, guard: sha(guardSrc), htmlTitle }),
  ).slice(0, 32);
  for (const f of result.outputFiles) {
    fs.mkdirSync(path.dirname(f.path), { recursive: true });
    fs.writeFileSync(
      f.path,
      f === mainOut
        ? `window.__miloFixtureBundleId=${JSON.stringify(sourceId)};\n${f.text}`
        : f.contents,
    );
  }
  fs.writeFileSync(path.join(out, "metafile.json"), JSON.stringify(result.metafile, null, 2));

  const { compile } = require(require.resolve("@tailwindcss/node", { paths: [root] }));
  const { Scanner } = require(require.resolve("@tailwindcss/oxide", { paths: [root] }));
  const css = fs
    .readFileSync(path.join(root, "src/styles.css"), "utf8")
    .replace(/^@import "@fontsource\/[^\n]+\n/gm, "");
  const compiler = await compile(css, { base: path.join(root, "src"), onDependency: () => {} });
  // Scan src AND the fixture folder so any harness-only utility class is emitted (the controls use the
  // same house classes as src, but this keeps a narrowly-added fixture class from silently missing).
  const scanner = new Scanner({
    sources: [
      { base: path.join(root, "src"), pattern: "**/*.{ts,tsx}", negated: false },
      { base: source, pattern: "**/*.{js,jsx}", negated: false },
    ],
  });
  fs.writeFileSync(path.join(out, "styles.css"), compiler.build(scanner.scan()));
  const guard = guardSrc;
  // Final artifact hashes, kept SEPARATE from the marker: the written bundle (marker included), the compiled
  // CSS (which determines layout acceptance) and the network guard. The HTML echoes `sourceId` as the EXPECTED
  // bundle id plus these hashes, so the loaded page can be compared against what actually executed.
  const bundleSha256 = sha(fs.readFileSync(bundleFile));
  const stylesSha256 = sha(fs.readFileSync(path.join(out, "styles.css")));
  const guardSha256 = sha(guard);
  const builtAt = new Date().toISOString();
  const buildId = sha(bundleSha256 + Object.values(fixtureFiles).join("")).slice(0, 32);
  const pageInfo = {
    sourceId,
    buildId,
    bundleSha256,
    bundleContentSha256,
    stylesSha256,
    guardSha256,
    builtAt,
  };
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; font-src 'self' data:; frame-src 'self' blob:; object-src 'none'; form-action 'none'; base-uri 'none'"><title>${htmlTitle}</title><link rel="stylesheet" href="styles.css"><style>#results{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,monospace;margin:0;padding:16px;background:#fff;color:#111}#results:empty{display:none}</style><script>{${guard}}</script><script>window.__miloFixtureBuildId=${JSON.stringify(buildId)};window.__miloFixtureExpectedBundleId=${JSON.stringify(sourceId)};window.__miloFixtureBuiltAt=${JSON.stringify(builtAt)};window.__miloFixtureBuildInfo=${JSON.stringify(pageInfo)};</script></head><body><div id="root"></div><pre id="results"></pre><script src="bundle.js"></script></body></html>`;
  fs.writeFileSync(path.join(out, "index.html"), html);
  fs.writeFileSync(
    path.join(out, "build-info.json"),
    JSON.stringify(
      {
        builtAt,
        buildId, // combined source identity for the build-info
        // The EXECUTED-bundle marker: the bundle's first line sets window.__miloFixtureBundleId to this; the
        // root must compare it to window.__miloFixtureExpectedBundleId (HTML) AND to this value. A cached old
        // bundle emits an OLD id and fails the gate even with a fresh index.html. It hashes the emitted
        // bundle content (bundleContentSha256, marker excluded) + guard + title.
        sourceId,
        bundleContentSha256,
        bundleSha256,
        stylesSha256,
        guardSha256,
        htmlSha256: sha(html),
        fixtureFiles,
        sourceRoot: root,
        actualSource: requiredSource,
        replaced: ["lib/store.ts", "lib/auth.tsx", "*.functions.ts"],
        note: "Synthetic memory only. Actual component/parser source; no backend, no live acceptance.",
      },
      null,
      2,
    ),
  );
  console.log(
    `Built ${out} from ${root}; ${inputs.length} inputs, no backend inputs. buildId=${buildId} sourceId=${sourceId}`,
  );
  return { out, inputs: inputs.length, buildId, sourceId };
}

async function main() {
  await buildFixture({
    source: __dirname,
    baseName: "milo-native-google-intake-browser-20261113",
    htmlTitle: "Milo native Google intake — local synthetic fixture",
    requiredSource: [
      "src/components/NativeGoogleIntakePanel.tsx",
      "src/lib/native-google-ai-csv.ts",
      "src/lib/native-google-intake-ui.ts",
      "src/components/ui/button.tsx",
    ],
  });
}

module.exports = { buildFixture, makeOutDir, sourcePath, exportNames };

if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
