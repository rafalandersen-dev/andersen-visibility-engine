const fs = require("node:fs"),
  path = require("node:path");
const root = process.cwd(),
  source = __dirname;
const locale = process.argv[2] ?? "en";
const mode = process.argv[3] ?? "component";
if (
  ![
    "component",
    "full",
    "generation",
    "auth",
    "multitab",
    "bookmark",
    "proposal",
    "lifecycle",
    "account",
    "firstuse",
  ].includes(mode)
)
  throw Error(
    "Choose component, full, generation, auth, multitab, bookmark, proposal, lifecycle, account or firstuse.",
  );
if (!["en", "pl", "sv", "da"].includes(locale)) throw Error("Choose en, pl, sv or da.");
// MILO_BROWSER_OUT keeps concurrent fixtures apart; firstuse never shares the older directory.
const out =
  process.env.MILO_BROWSER_OUT ||
  (mode === "firstuse" ? "/tmp/milo-first-use-browser-20261030" : "/tmp/milo-conversation-browser");
const styles = process.env.MILO_BROWSER_STYLES || "http://127.0.0.1:5189/src/styles.css?direct";
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
  path.join(out, "index.html"),
  mode === "firstuse"
    ? // One build serves every locale and fixture variant: ?locale=en|pl|sv|da&variant=...
      // The build locale is only the default. Unknown values fall back, never execute.
      `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Milo first-use browser check</title><link rel="stylesheet" href="${styles}"><style>#results{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,monospace;margin:0;padding:16px;background:#fff;color:#111}</style><script>(()=>{const q=new URLSearchParams(location.search).get("locale");globalThis.__miloFirstUseLocale=["en","pl","sv","da"].includes(q)?q:${JSON.stringify(locale)};document.documentElement.lang=globalThis.__miloFirstUseLocale;})();</script><script>{${fs.readFileSync(path.join(source, "network-guard.js"), "utf8")}}</script><div id="root"></div><pre id="results">Running</pre><script src="bundle.js"></script></html>`
    : `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Milo conversation browser check</title><link rel="stylesheet" href="${styles}"><style>#results{white-space:pre-wrap;overflow-wrap:anywhere}</style><div class="${mode === "component" ? "milo-app p-5" : ""}" id="root"></div><pre id="results">Running</pre><script src="/bundle.js"></script></html>`,
);
// The shell's producer-session imports the store relatively ("./store"), which the
// "@/lib/store" alias cannot catch; without this the full-page fixtures bundled the
// real store, Supabase client and server-only modules.
const fixtureStore = {
  name: "fixture-store",
  setup(build) {
    build.onResolve({ filter: /(^|\/)store$/ }, (args) =>
      path.resolve(args.resolveDir, args.path) === path.join(root, "src/lib/store")
        ? { path: path.join(source, "full-mock.js") }
        : undefined,
    );
  },
};
require(root + "/node_modules/esbuild")
  .build({
    stdin: {
      contents: fs.readFileSync(
        path.join(source, mode === "component" ? "entry.jsx" : `${mode}-entry.jsx`),
        "utf8",
      ),
      sourcefile: "milo-conversation-browser.jsx",
      resolveDir: root,
      loader: "jsx",
    },
    bundle: true,
    jsx: "automatic",
    outfile: path.join(out, "bundle.js"),
    alias: {
      "@/lib/milo-conversation-lifecycle.functions": path.join(source, "lifecycle-mock.js"),
      "@/lib/milo-conversation-account.functions": path.join(source, "account-mock.js"),
      "@/lib/milo-draft-proposal.functions": path.join(source, "proposal-mock.js"),
      "@/lib/milo-conversation.functions": path.join(
        source,
        mode === "multitab" ? "multitab-network.js" : "mock.js",
      ),
      "@/i18n": path.join(source, "i18n.js"),
      ...(["full", "generation", "firstuse"].includes(mode)
        ? {
            "@/lib/auth": path.join(source, "full-mock.js"),
            "@/lib/store": path.join(source, "full-mock.js"),
            "@/lib/project-team.functions": path.join(source, "full-mock.js"),
          }
        : {}),
      ...(["auth", "bookmark"].includes(mode)
        ? {
            "@/integrations/supabase/client": path.join(source, "auth-network.js"),
            "@/lib/project-team.functions": path.join(source, "auth-network.js"),
          }
        : {}),
      ...(mode === "generation"
        ? {
            "@/lib/generation-result.functions": path.join(source, "generation-mock.js"),
            "@/lib/image-preview.functions": path.join(source, "generation-mock.js"),
          }
        : {}),
    },
    plugins: ["full", "generation", "firstuse"].includes(mode)
      ? [fixtureStore]
      : ["auth", "bookmark"].includes(mode)
        ? [
            {
              name: "fixture-entitlement",
              setup(build) {
                build.onResolve({ filter: /^\.\/entitlements\.functions$/ }, (args) => {
                  if (args.importer === path.join(root, "src/lib/store.ts"))
                    return { path: path.join(source, "auth-network.js") };
                });
              },
            },
          ]
        : [],
    define: {
      "process.env.NODE_ENV": '"development"',
      "import.meta.env.DEV": "false",
      "import.meta.env.VITE_MILO_VISUAL_QA": '""',
      __MILO_CONVERSATION_LOCALE__:
        mode === "firstuse" ? "globalThis.__miloFirstUseLocale" : JSON.stringify(locale),
    },
  })
  .then(() =>
    mode === "multitab"
      ? require(root + "/node_modules/esbuild").build({
          entryPoints: [path.join(root, "src/lib/milo-conversation.ts")],
          bundle: true,
          platform: "node",
          format: "cjs",
          outfile: path.join(out, "contracts.cjs"),
        })
      : undefined,
  )
  .catch(() => {
    // esbuild has already printed the diagnostics.
    process.exitCode = 1;
  });
