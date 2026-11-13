/* Native Google intake fixture: loopback-only, synthetic data, no .env, no app server.
 *
 *   node scripts/native-google-intake-browser/build.cjs
 *
 * Bundles the ACTUAL NativeGoogleIntakePanel with its real parser, UI helper, i18n and house Button,
 * under a QueryClient. Store, auth and every `*.functions.ts` server function are replaced at bundle
 * resolution; Supabase and `.server.ts` modules are refused at build time. Output defaults to
 * /tmp/milo-native-google-intake-browser-20261113 (MILO_BROWSER_OUT overrides it). Interactive by
 * default; `?check=1` runs a scripted matrix. No live backend, no real acceptance here. */
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const source = __dirname;
const preferredOut =
  process.env.MILO_BROWSER_OUT || "/tmp/milo-native-google-intake-browser-20261113";
function makeOutDir() {
  for (const dir of [
    preferredOut,
    path.join(require("node:os").tmpdir(), "milo-native-google-intake-browser-20261113"),
  ]) {
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
const ts = require(path.join(root, "node_modules/typescript"));
const esbuild = require(path.join(root, "node_modules/esbuild"));

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
const fixtureJs = path.join(source, "fixture.js");
const storeJs = path.join(source, "store.js");

async function main() {
  const out = makeOutDir();
  const result = await esbuild.build({
    entryPoints: [path.join(source, "entry.jsx")],
    bundle: true,
    jsx: "automatic",
    platform: "browser",
    format: "iife",
    outfile: path.join(out, "bundle.js"),
    metafile: true,
    logLevel: "warning",
    plugins: [
      {
        name: "native-google-intake-boundaries",
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            const p = sourcePath(args.path, args.importer);
            if (!p) return;
            const rel = path.relative(path.join(root, "src"), p).replaceAll("\\", "/");
            if (rel.startsWith("..")) return;
            if (rel === "lib/store.ts") return { path: p, namespace: "fixture-store" };
            if (rel === "lib/auth.tsx" || rel === "lib/auth.ts")
              return { path: path.join(source, "auth.js") };
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
  const required = [
    "src/components/NativeGoogleIntakePanel.tsx",
    "src/lib/native-google-ai-csv.ts",
    "src/lib/native-google-intake-ui.ts",
    "src/components/ui/button.tsx",
  ];
  const missing = required.filter((r) => !inputs.some((p) => p.endsWith(r)));
  if (missing.length) throw Error("Actual source missing from bundle: " + missing.join(", "));
  fs.writeFileSync(path.join(out, "metafile.json"), JSON.stringify(result.metafile, null, 2));

  const { compile } = require(require.resolve("@tailwindcss/node", { paths: [root] }));
  const { Scanner } = require(require.resolve("@tailwindcss/oxide", { paths: [root] }));
  const css = fs
    .readFileSync(path.join(root, "src/styles.css"), "utf8")
    .replace(/^@import "@fontsource\/[^\n]+\n/gm, "");
  const compiler = await compile(css, { base: path.join(root, "src"), onDependency: () => {} });
  const scanner = new Scanner({
    sources: [{ base: path.join(root, "src"), pattern: "**/*.{ts,tsx}", negated: false }],
  });
  fs.writeFileSync(path.join(out, "styles.css"), compiler.build(scanner.scan()));
  const guard = fs.readFileSync(path.join(source, "network-guard.js"), "utf8");
  fs.writeFileSync(
    path.join(out, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; font-src 'self' data:; frame-src 'self' blob:; object-src 'none'; form-action 'none'; base-uri 'none'"><title>Milo native Google intake — local synthetic fixture</title><link rel="stylesheet" href="styles.css"><style>#results{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,monospace;margin:0;padding:16px;background:#fff;color:#111}#results:empty{display:none}</style><script>{${guard}}</script></head><body><div id="root"></div><pre id="results"></pre><script src="bundle.js"></script></body></html>`,
  );
  fs.writeFileSync(
    path.join(out, "build-info.json"),
    JSON.stringify(
      {
        builtAt: new Date().toISOString(),
        sourceRoot: root,
        actualSource: required,
        replaced: ["lib/store.ts", "lib/auth.tsx", "*.functions.ts"],
        note: "Synthetic memory only. Actual panel/parser source; no backend, no live acceptance.",
      },
      null,
      2,
    ),
  );
  console.log(`Built ${out} from ${root}; ${inputs.length} inputs, no backend inputs.`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
