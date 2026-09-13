const fs = require("node:fs"),
  path = require("node:path");
const root = process.cwd(),
  source = __dirname;
const locale = process.argv[2] ?? "en";
const mode = process.argv[3] ?? "component";
if (!["component", "full", "generation"].includes(mode))
  throw Error("Choose component, full or generation.");
if (!["en", "pl", "sv", "da"].includes(locale)) throw Error("Choose en, pl, sv or da.");
const out = "/tmp/milo-conversation-browser";
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
  path.join(out, "index.html"),
  `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Milo conversation browser check</title><link rel="stylesheet" href="http://127.0.0.1:5189/src/styles.css?direct"><style>#results{white-space:pre-wrap;overflow-wrap:anywhere}</style><div class="${mode === "component" ? "milo-app p-5" : ""}" id="root"></div><pre id="results">Running</pre><script src="/bundle.js"></script></html>`,
);
require(root + "/node_modules/esbuild").buildSync({
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
    "@/lib/milo-conversation.functions": path.join(source, "mock.js"),
    "@/i18n": path.join(source, "i18n.js"),
    ...(mode !== "component"
      ? {
          "@/lib/auth": path.join(source, "full-mock.js"),
          "@/lib/store": path.join(source, "full-mock.js"),
          "@/lib/project-team.functions": path.join(source, "full-mock.js"),
        }
      : {}),
    ...(mode === "generation"
      ? {
          "@/lib/generation-result.functions": path.join(source, "generation-mock.js"),
          "@/lib/image-preview.functions": path.join(source, "generation-mock.js"),
        }
      : {}),
  },
  define: {
    "process.env.NODE_ENV": '"development"',
    "import.meta.env.DEV": "false",
    "import.meta.env.VITE_MILO_VISUAL_QA": '""',
    __MILO_CONVERSATION_LOCALE__: JSON.stringify(locale),
  },
});
