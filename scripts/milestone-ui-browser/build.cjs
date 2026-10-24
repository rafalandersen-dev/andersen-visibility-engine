/* Loopback-only browser fixture. Does not load .env, start the app or contact a service. */
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const source = __dirname;
const out = "/tmp/milo-milestone-ui-browser";
const ts = require(path.join(root, "node_modules/typescript"));
const esbuild = require(path.join(root, "node_modules/esbuild"));
const stubNames = new Set([
  "WeeklyPreparationPanel",
  "BrandIntelligenceCard",
  "ClaudeConnectorCard",
  "EditorialLesson",
  "CreateContentDialog",
  "MiloScorePanel",
]);

function sourcePath(spec, importer) {
  let p = spec.startsWith("@/")
    ? path.join(root, "src", spec.slice(2))
    : spec.startsWith(".")
      ? path.resolve(path.dirname(importer), spec)
      : null;
  if (!p) return null;
  for (const suffix of ["", ".ts", ".tsx", ".js", "/index.ts"])
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
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const smoke = process.argv.includes("--ssr-smoke");
  const metafile = await esbuild.build({
    entryPoints: [path.join(source, smoke ? "smoke.jsx" : "entry.jsx")],
    bundle: true,
    jsx: "automatic",
    platform: smoke ? "node" : "browser",
    format: smoke ? "cjs" : "iife",
    outfile: path.join(out, smoke ? "smoke.cjs" : "bundle.js"),
    metafile: true,
    banner: smoke
      ? {
          js: `global.window={addEventListener(){}};global.document={addEventListener(){}};global.localStorage={removeItem(){},getItem(){return null}};`,
        }
      : undefined,
    plugins: [
      {
        name: "milo-fixture-boundaries",
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            if (args.path === "@tanstack/react-router")
              return { path: path.join(source, "router.jsx") };
            if (args.path === "sonner") return { path: path.join(source, "toasts.jsx") };
            const p = sourcePath(args.path.replace(/\?raw$/, ""), args.importer);
            if (!p) return;
            const rel = path.relative(path.join(root, "src"), p).replaceAll("\\", "/");
            if (args.path.endsWith("?raw")) return { path: p, namespace: "raw" };
            if (rel === "lib/store.ts") return { path: path.join(source, "store.js") };
            if (rel === "lib/auth.tsx" || rel === "lib/auth.ts")
              return { path: path.join(source, "auth.js") };
            if (rel === "hooks/use-auth-language.ts")
              return { path: path.join(source, "auth-language.js") };
            if (rel === "components/AppShell.tsx") return { path: path.join(source, "shell.jsx") };
            if (rel === "components/GscLiteSection.tsx")
              return { path: path.join(source, "gsc.jsx") };
            if (rel.startsWith("components/") && stubNames.has(path.basename(p, ".tsx")))
              return { path: p, namespace: "panel-stub" };
            if (rel.endsWith(".functions.ts") || rel === "lib/mock-ai.ts")
              return { path: p, namespace: "function-stub" };
            if (rel.startsWith("integrations/supabase/") || rel.endsWith(".server.ts"))
              throw new Error(
                "Forbidden server/backend import reached fixture: " +
                  rel +
                  " from " +
                  args.importer,
              );
          });
          build.onLoad({ filter: /.*/, namespace: "raw" }, (args) => ({
            contents: "export default " + JSON.stringify(fs.readFileSync(args.path, "utf8")),
            loader: "js",
          }));
          build.onLoad({ filter: /.*/, namespace: "panel-stub" }, (args) => {
            const name = path.basename(args.path, ".tsx");
            return {
              contents: `import React from 'react'; export function ${name}(){return React.createElement('aside', {'data-fixture-stub':${JSON.stringify(name)},className:'fixture-stub'},${JSON.stringify("Fixture: " + name + " omitted")});}`,
              loader: "js",
              resolveDir: source,
            };
          });
          build.onLoad({ filter: /.*/, namespace: "function-stub" }, (args) => ({
            contents: exportNames(args.path)
              .map((n) =>
                n === "SCHEDULE_TICK_MS"
                  ? `export const ${n}=300000;`
                  : `export const ${n}=(...args)=>window.miloFixture.invoke(${JSON.stringify(n)},args);`,
              )
              .join("\n"),
            loader: "js",
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
  const forbidden = Object.keys(metafile.metafile.inputs).filter(
    (p) =>
      !p.startsWith("function-stub:") &&
      !p.startsWith("panel-stub:") &&
      (p.includes("integrations/supabase") || p.endsWith(".server.ts")),
  );
  if (forbidden.length) throw Error("Backend input in bundle: " + forbidden.join(", "));
  if (smoke) {
    await require(path.join(out, "smoke.cjs")).smokeDone;
    return;
  }
  fs.writeFileSync(path.join(out, "metafile.json"), JSON.stringify(metafile.metafile, null, 2));
  const { compile } = require(require.resolve("@tailwindcss/node", { paths: [root] }));
  const { Scanner } = require(require.resolve("@tailwindcss/oxide", { paths: [root] }));
  const css = fs
    .readFileSync(path.join(root, "src/styles.css"), "utf8")
    .replace(/^@import "@fontsource\/[^\n]+\n/gm, "");
  const compiler = await compile(css, { base: path.join(root, "src"), onDependency: () => {} });
  const scanner = new Scanner({
    sources: [
      { base: path.join(root, "src"), pattern: "**/*.{ts,tsx}", negated: false },
      { base: source, pattern: "*.jsx", negated: false },
    ],
  });
  fs.writeFileSync(path.join(out, "styles.css"), compiler.build(scanner.scan()));
  fs.writeFileSync(
    path.join(out, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; font-src 'self' data:; frame-src 'self' blob:; object-src 'none'; form-action 'none'; base-uri 'none'"><title>Milo milestone — local synthetic fixture</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/bundle.css"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`,
  );
  fs.copyFileSync(path.join(source, "fixture.css"), path.join(out, "fixture.css"));
  fs.writeFileSync(
    path.join(out, "build-info.json"),
    JSON.stringify(
      {
        builtAt: new Date().toISOString(),
        sourceRoot: root,
        routes: ["pricing", "setup", "today", "editor", "analytics"],
        approvalModes: ["needed", "current", "stale", "unavailable"],
        serverInputs: forbidden,
        stubbedPanels: [...stubNames, "GscLiteSection", "AppShell"],
        note: "Synthetic memory only. Real route/UI source, actual React/Radix; no backend or live acceptance.",
      },
      null,
      2,
    ),
  );
  console.log("Built " + out + "; source " + root + "; no server/backend bundle inputs.");
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
