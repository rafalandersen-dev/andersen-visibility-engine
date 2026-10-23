// Builds the CX requested-asset browser harness (see README.md). Local fixture only.
const fs = require("node:fs"),
  path = require("node:path");
const root = process.cwd(),
  source = __dirname;
const out = "/tmp/requested-asset-browser";
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
  path.join(out, "index.html"),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CX requested-asset harness</title><style>body{font:14px system-ui,sans-serif;margin:16px;max-width:900px}#results{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f4f4;padding:8px}button{margin:4px 0}</style><h1>CX requested-asset harness</h1><p>Synthetic in-memory workspaces only. Run all executes eight groups (group 2 waits for the real reload deadline). Manual steps: <code>window.cx</code>.</p><button id="run" type="button">Run all</button><div id="probe-root"></div><pre id="results">Not run</pre><script src="/bundle.js"></script></html>`,
);
const network = path.join(source, "network.js");
require(root + "/node_modules/esbuild")
  .build({
    entryPoints: [path.join(source, "entry.jsx")],
    bundle: true,
    jsx: "automatic",
    outfile: path.join(out, "bundle.js"),
    alias: { "@/integrations/supabase/client": network },
    plugins: [
      {
        name: "fixture-paths",
        setup(build) {
          // The store's lazy entitlement import becomes the fixture's synthetic answer.
          build.onResolve({ filter: /^\.\/entitlements\.functions$/ }, (args) => {
            if (args.importer === path.join(root, "src/lib/store.ts")) return { path: network };
          });
        },
      },
    ],
    define: {
      "process.env.NODE_ENV": '"development"',
      "import.meta.env.DEV": "false",
      "import.meta.env.VITE_MILO_VISUAL_QA": '""',
    },
  })
  .catch(() => {
    process.exitCode = 1;
  });
