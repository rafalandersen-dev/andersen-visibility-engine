/*
 * Loopback-only browser harness for the REAL billing route and commercial panel.
 *
 * It bundles `src/routes/_authenticated/app.billing.tsx` and
 * `src/components/billing/StripeCommercialPanel.tsx` unchanged, with actual
 * React, actual Radix controls and the project's compiled Tailwind. Only the
 * boundaries are synthetic: store, auth, router, toasts, shell and the server
 * functions, each replaced at RESOLUTION time with an in-memory adapter whose
 * shape is the accepted caller API.
 *
 * It does not load `.env`, start the application server, install anything or
 * contact a service. Any `.server.ts` or Supabase module reaching the bundle
 * is a build failure, asserted twice: once while resolving and once against
 * esbuild's own input inventory.
 */
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const source = __dirname;

// Build output never lands in the repository. MILO_FIXTURE_OUT and the
// os.tmpdir() fallback only exist so this also runs in a sandboxed checkout
// where /tmp itself is not writable.
const preferredOut = process.env.MILO_FIXTURE_OUT || "/tmp/milo-billing-ui-browser";
function makeOutDir() {
  for (const dir of [
    preferredOut,
    path.join(require("node:os").tmpdir(), "milo-billing-ui-browser"),
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

/** Modules served by the single fixture file, by the name it exports them as. */
const FIXTURE_MODULES = {
  "lib/store.ts": "store",
  "lib/auth.tsx": "auth",
  "lib/auth.ts": "auth",
  "components/AppShell.tsx": "shell",
  "components/StripeSandboxPanel.tsx": "sandbox",
  "lib/stripe-commercial.functions.ts": "commercial",
  "lib/entitlements.functions.ts": "entitlements",
  "lib/billing.functions.ts": "paddle",
};

/** What each fixture-backed module re-exports from `fixture.js`. */
const FIXTURE_EXPORTS = {
  store: ["useStore", "setBillingProfile", "refreshEntitlement", "saveWorkspaceNow", "getState"],
  auth: ["useAuth"],
  shell: ["AppShell"],
  sandbox: ["StripeSandboxPanel"],
  commercial: [
    "getStripeCommercialStatusFn",
    "getStripeCommercialSummaryFn",
    "prepareStripeSubscriptionChangeFn",
    "confirmStripeSubscriptionChangeFn",
    "cancelStripeSubscriptionFn",
    "reverseStripeCancellationFn",
  ],
  entitlements: ["getMyEntitlementFn", "setManualEntitlementFn"],
  paddle: ["createPaddleCheckoutFn", "createPaddlePortalSessionFn"],
  router: ["createFileRoute", "Link", "useNavigate", "useRouter", "useLocation"],
  toasts: ["toast", "Toaster"],
};

function sourcePath(spec, importer) {
  const base = spec.startsWith("@/")
    ? path.join(root, "src", spec.slice(2))
    : spec.startsWith(".")
      ? path.resolve(path.dirname(importer), spec)
      : null;
  if (!base) return null;
  for (const suffix of ["", ".ts", ".tsx", ".js", "/index.ts"])
    if (fs.existsSync(base + suffix) && fs.statSync(base + suffix).isFile()) return base + suffix;
  return null;
}

/** Exported names of a module, so an unused server function can be stubbed
 * without guessing its API. */
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
  const out = makeOutDir();
  const metafile = await esbuild.build({
    entryPoints: [path.join(source, "entry.jsx")],
    bundle: true,
    jsx: "automatic",
    platform: "browser",
    format: "iife",
    outfile: path.join(out, "bundle.js"),
    metafile: true,
    loader: { ".woff2": "file", ".woff": "file" },
    plugins: [
      {
        name: "milo-billing-fixture-boundaries",
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            if (args.path === "@tanstack/react-router")
              return { path: "router", namespace: "fixture-module" };
            if (args.path === "sonner") return { path: "toasts", namespace: "fixture-module" };
            const resolved = sourcePath(args.path, args.importer);
            if (!resolved) return;
            const rel = path.relative(path.join(root, "src"), resolved).replaceAll("\\", "/");
            // The hard boundary: no backend module may enter a browser bundle.
            if (rel.startsWith("integrations/supabase/") || rel.endsWith(".server.ts"))
              throw new Error(
                "Forbidden server/backend import reached the billing fixture: " +
                  rel +
                  " from " +
                  args.importer,
              );
            const fixtureName = FIXTURE_MODULES[rel];
            if (fixtureName) return { path: fixtureName, namespace: "fixture-module" };
            // Any other server function is stubbed and refuses to run.
            if (rel.endsWith(".functions.ts")) return { path: resolved, namespace: "refused" };
          });
          build.onLoad({ filter: /.*/, namespace: "fixture-module" }, (args) => {
            const names = FIXTURE_EXPORTS[args.path];
            if (!names) throw new Error("Unknown fixture module: " + args.path);
            return {
              contents: `export { ${names.join(", ")} } from "./fixture.js";`,
              loader: "js",
              resolveDir: source,
            };
          });
          build.onLoad({ filter: /.*/, namespace: "refused" }, (args) => ({
            contents: exportNames(args.path)
              .map(
                (name) =>
                  `export const ${name} = (...args) => window.miloBillingFixture.refuse(${JSON.stringify(name)}, args);`,
              )
              .join("\n"),
            loader: "js",
            resolveDir: source,
          }));
        },
      },
    ],
    define: {
      "process.env.NODE_ENV": '"development"',
      // The dev visual-QA hardcode is explicitly OFF: a hardcoded Pro/active
      // account cannot establish provider, price, operation or recovery.
      "import.meta.env.DEV": "false",
      "import.meta.env.VITE_MILO_VISUAL_QA": '""',
    },
  });

  const inputs = Object.keys(metafile.metafile.inputs);
  const forbidden = inputs.filter(
    (file) =>
      !file.startsWith("fixture-module:") &&
      !file.startsWith("refused:") &&
      (file.includes("integrations/supabase") || file.endsWith(".server.ts")),
  );
  if (forbidden.length) throw Error("Backend input in bundle: " + forbidden.join(", "));

  const realRouteInputs = inputs.filter(
    (file) =>
      file.endsWith("src/routes/_authenticated/app.billing.tsx") ||
      file.endsWith("src/components/billing/StripeCommercialPanel.tsx") ||
      file.endsWith("src/lib/stripe-commercial-ui.ts") ||
      file.endsWith("src/lib/billing-presentation.ts"),
  );
  if (realRouteInputs.length < 4)
    throw Error(
      "The real route, panel, controller and presentation must all be bundled; saw " +
        realRouteInputs.join(", "),
    );

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
      { base: source, pattern: "*.{js,jsx}", negated: false },
    ],
  });
  fs.writeFileSync(path.join(out, "styles.css"), compiler.build(scanner.scan()));

  fs.writeFileSync(
    path.join(out, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; font-src 'self' data:; frame-src 'self' blob:; object-src 'none'; form-action 'none'; base-uri 'none'"><title>Milo billing — local synthetic fixture</title><link rel="stylesheet" href="/styles.css"><style>
body{margin:0;background:hsl(var(--background,0 0% 100%))}
/* The scaffold must never sit on top of the product it exists to show. At
   390px the toolbar is tall enough to cover a Radix modal (z-index 50)
   entirely, which hid the dialog heading and swallowed pointer input during
   mobile review. It now scrolls with the page and stays BELOW the modal
   layer, so an unmodified build supports reading, pointing and focus checks
   on a narrow viewport. */
.fixture-bar{position:relative;z-index:40;background:#111;color:#f5f5f5;padding:8px 12px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
.fixture-bar button,.fixture-bar select{font:inherit;margin:2px 4px 2px 0;padding:2px 6px}
.fixture-bar [aria-pressed="true"]{outline:2px solid #ffd479}
/* A dialog is open: take the scaffold out of the way entirely, including for
   hit-testing, so nothing it contains can intercept a click meant for the
   product. */
body:has([role="dialog"][data-state="open"]) .fixture-bar{display:none}
.fixture-log{max-height:220px;overflow:auto;white-space:pre-wrap;background:#000;color:#9fe3a0;padding:8px}
.fixture-error{white-space:pre-wrap;color:#b00020;padding:12px}
.fixture-shell{max-width:1100px;margin:0 auto;padding:24px 16px 64px}
</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`,
  );

  fs.writeFileSync(
    path.join(out, "build-info.json"),
    JSON.stringify(
      {
        builtAt: new Date().toISOString(),
        sourceRoot: root,
        realSources: realRouteInputs.sort(),
        fixtureModules: Object.keys(FIXTURE_EXPORTS).sort(),
        blockedBackendInputs: forbidden,
        visualQaHardcode: "disabled",
        note: "Synthetic in-memory adapters with the accepted caller API shapes. No backend, no network, no credentials, no live acceptance.",
      },
      null,
      2,
    ),
  );
  console.log(
    "Built " + out + "; source " + root + "; real route/panel bundled; no backend inputs.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
