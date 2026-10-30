/* CG-02A task-continuity fixture: loopback-only, synthetic data, no .env, no app server.
 *
 *   node scripts/task-continuity-browser/build.cjs
 *
 * Bundles the ACTUAL citation-review, Plan and Editor route components (with the real
 * CitationForwardPanel, AppShell and Radix controls) under a real TanStack router on
 * hash history, so the URL, reload and Back/Forward are the browser's own. Store, auth
 * and every `*.functions.ts` server function are replaced at bundle resolution; Supabase
 * and `.server.ts` modules are refused at build time. Output defaults to
 * /tmp/milo-task-continuity-browser-20261030 (MILO_BROWSER_OUT overrides it). */
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const source = __dirname;
const preferredOut = process.env.MILO_BROWSER_OUT || "/tmp/milo-task-continuity-browser-20261030";
function makeOutDir() {
  for (const dir of [
    preferredOut,
    path.join(require("node:os").tmpdir(), "milo-task-continuity-browser-20261030"),
  ]) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    } catch (error) {
      if (error.code !== "EPERM" && error.code !== "EACCES") throw error;
    }
  }
  throw Error("No writable fixture output directory (tried " + preferredOut + " and os.tmpdir())");
}
const ts = require(path.join(root, "node_modules/typescript"));
const esbuild = require(path.join(root, "node_modules/esbuild"));
// Subsidiary panels outside CG-02A that read their own server data on mount. They are
// replaced by visibly labelled placeholders; the three routes and the forward panel are real.
const stubNames = new Set([
  "CitationReviewPanel",
  "CitationPanelProtocolPanel",
  "CitationBusinessFactsPanel",
  "CitationFindingAuthor",
  "CitationInspectionPanel",
  "EditorialLesson",
  "MiloScorePanel",
  "CreateContentDialog",
]);

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
        name: "task-continuity-boundaries",
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            const p = sourcePath(args.path.replace(/\?raw$/, ""), args.importer);
            if (!p) return;
            const rel = path.relative(path.join(root, "src"), p).replaceAll("\\", "/");
            if (rel.startsWith("..")) return;
            if (args.path.endsWith("?raw")) return { path: p, namespace: "raw" };
            if (rel === "lib/store.ts") return { path: p, namespace: "fixture-store" };
            if (rel === "lib/auth.tsx" || rel === "lib/auth.ts")
              return { path: path.join(source, "auth.js") };
            if (rel.startsWith("components/") && stubNames.has(path.basename(p, ".tsx")))
              return { path: p, namespace: "panel-stub" };
            if (rel.endsWith(".functions.ts")) return { path: p, namespace: "function-stub" };
            if (rel.startsWith("integrations/supabase/") || rel.endsWith(".server.ts"))
              throw Error(
                `Forbidden backend import reached the fixture: ${rel} from ${args.importer}`,
              );
          });
          build.onLoad({ filter: /.*/, namespace: "raw" }, (args) => ({
            contents: "export default " + JSON.stringify(fs.readFileSync(args.path, "utf8")),
            loader: "js",
          }));
          // Every real store export the synthetic store does not implement is a recorded refusal.
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
          build.onLoad({ filter: /.*/, namespace: "panel-stub" }, (args) => {
            const name = path.basename(args.path, ".tsx");
            return {
              contents: `import React from "react"; export function ${name}(){return React.createElement("aside",{"data-fixture-stub":${JSON.stringify(name)},className:"rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground"},${JSON.stringify("Fixture placeholder: " + name + " (outside CG-02A)")});}`,
              loader: "js",
              resolveDir: source,
            };
          });
          build.onLoad({ filter: /.*/, namespace: "function-stub" }, (args) => ({
            contents: [
              `import { invoke } from ${JSON.stringify(fixtureJs)};`,
              ...exportNames(args.path).map((n) =>
                /^[A-Z0-9_]+$/.test(n)
                  ? `export const ${n} = ${n === "SCHEDULE_TICK_MS" ? 300000 : "undefined"};`
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
      !/^(function-stub|panel-stub|fixture-store):/.test(p) &&
      (p.includes("integrations/supabase") || p.endsWith(".server.ts")),
  );
  if (forbidden.length) throw Error("Backend input in bundle: " + forbidden.join(", "));
  const required = [
    "src/routes/_authenticated/app.citation-review.tsx",
    "src/routes/_authenticated/app.plan.tsx",
    "src/routes/_authenticated/app.editor.tsx",
    "src/components/CitationForwardPanel.tsx",
    "src/components/AppShell.tsx",
    "src/lib/task-continuity.ts",
  ];
  const missing = required.filter((r) => !inputs.some((p) => p.endsWith(r)));
  if (missing.length) throw Error("Actual source missing from bundle: " + missing.join(", "));
  fs.writeFileSync(path.join(out, "metafile.json"), JSON.stringify(result.metafile, null, 2));

  // Real stylesheet, compiled locally (no dev server); font imports are dropped, so
  // system fallbacks render.
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
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; font-src 'self' data:; frame-src 'self' blob:; object-src 'none'; form-action 'none'; base-uri 'none'"><title>Milo task continuity — local synthetic fixture</title><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="bundle.css"><style>#results{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,monospace;margin:0;padding:16px;background:#fff;color:#111}#results:empty{display:none}</style><script>{${guard}}</script></head><body><div id="root"></div><pre id="results"></pre><script src="bundle.js"></script></body></html>`,
  );
  fs.writeFileSync(
    path.join(out, "build-info.json"),
    JSON.stringify(
      {
        builtAt: new Date().toISOString(),
        sourceRoot: root,
        actualSource: required,
        stubbedPanels: [...stubNames],
        replaced: ["lib/store.ts", "lib/auth.tsx", "*.functions.ts"],
        note: "Synthetic memory only. Actual route/UI source under a real router; no backend, no live acceptance.",
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
