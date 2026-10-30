/* CG-03A answer-coverage fixture: loopback-only, synthetic data, no .env, no app server.
 *
 *   node scripts/answer-coverage-browser/build.cjs
 *
 * Bundles the ACTUAL AnswerEvidencePanel and answer-evidence helpers with React Query and the central i18n
 * catalogs. Auth, the store's interface-language read and src/lib/answer-evidence.functions.ts are
 * replaced; Supabase and `.server.ts` modules are refused at build time. Output defaults to
 * /tmp/milo-answer-coverage-browser-20261030 (MILO_BROWSER_OUT overrides it). */
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const source = __dirname;
const preferredOut = process.env.MILO_BROWSER_OUT || "/tmp/milo-answer-coverage-browser-20261030";
function makeOutDir() {
  for (const dir of [
    preferredOut,
    path.join(require("node:os").tmpdir(), "milo-answer-coverage-browser-20261030"),
  ]) {
    // An existing directory may still be unwritable here (e.g. created by another user or sandbox). The
    // probe is a NEW, uniquely named file created exclusively ("wx": never follows or truncates an existing
    // file or symlink), and only a probe this call actually created is removed.
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
const esbuild = require(path.join(root, "node_modules/esbuild"));
const replaced = {
  "lib/auth.tsx": "auth.js",
  "lib/store.ts": "store.js",
  "lib/answer-evidence.functions.ts": "functions.js",
};
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
    alias: { "@": path.join(root, "src") },
    plugins: [
      {
        name: "answer-coverage-boundaries",
        setup(build) {
          build.onResolve({ filter: /^(@\/|\.)/ }, (args) => {
            if (!args.importer.startsWith(path.join(root, "src")) && !args.path.startsWith("@/"))
              return;
            const spec = args.path.startsWith("@/")
              ? path.join(root, "src", args.path.slice(2))
              : path.resolve(path.dirname(args.importer), args.path);
            const rel = path.relative(path.join(root, "src"), spec).replaceAll("\\", "/");
            for (const [from, to] of Object.entries(replaced))
              if (rel === from || rel + ".ts" === from || rel + ".tsx" === from)
                return { path: path.join(source, to) };
            if (rel.startsWith("integrations/supabase") || /\.server(\.ts)?$/.test(rel))
              throw Error(
                `Forbidden backend import reached the fixture: ${rel} from ${args.importer}`,
              );
          });
        },
      },
    ],
    define: { "process.env.NODE_ENV": '"development"', "import.meta.env.DEV": "false" },
  });
  const inputs = Object.keys(result.metafile.inputs);
  const forbidden = inputs.filter(
    (p) =>
      p.includes("integrations/supabase") ||
      p.includes(".server.") ||
      p.endsWith("answer-evidence.functions.ts"),
  );
  if (forbidden.length) throw Error("Backend input in bundle: " + forbidden.join(", "));
  const required = [
    "src/components/AnswerEvidencePanel.tsx",
    "src/lib/answer-evidence.ts",
    "src/lib/pg-uuid.ts",
    "src/i18n/answer-coverage.ts",
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
    sources: [
      { base: path.join(root, "src"), pattern: "**/*.{ts,tsx}", negated: false },
      { base: source, pattern: "*.jsx", negated: false },
    ],
  });
  fs.writeFileSync(path.join(out, "styles.css"), compiler.build(scanner.scan()));
  const guard = fs.readFileSync(path.join(source, "network-guard.js"), "utf8");
  fs.writeFileSync(
    path.join(out, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; font-src 'self' data:; object-src 'none'; form-action 'none'; base-uri 'none'"><title>Milo answer coverage — local synthetic fixture</title><link rel="stylesheet" href="styles.css"><style>#results{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,monospace;margin:0;padding:16px;background:#fff;color:#111}#results:empty{display:none}</style><script>{${guard}}</script></head><body><div id="root"></div><pre id="results"></pre><script src="bundle.js"></script></body></html>`,
  );
  fs.writeFileSync(
    path.join(out, "build-info.json"),
    JSON.stringify(
      {
        builtAt: new Date().toISOString(),
        sourceRoot: root,
        actualSource: required,
        replaced: Object.keys(replaced),
        note: "Synthetic memory only. Actual panel and helpers; no backend, provider or live acceptance.",
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
