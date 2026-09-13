const fs = require("fs");
const root = process.cwd();
const esbuild = require(root + "/node_modules/esbuild");
const locale = process.argv[2] ?? "keys";
if (!["keys", "fi", "cs", "sk", "sl", "hr", "bg"].includes(locale))
  throw Error("Use keys, fi, cs, sk, sl, hr or bg");
const dir = "/tmp/milo-knowledge-review-browser";
fs.mkdirSync(dir, { recursive: true });
const sourceDir = __dirname;
fs.writeFileSync(
  dir + "/index.html",
  `<!doctype html><html lang="${locale === "keys" ? "en" : locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><pre id="results">Running</pre><script src="/bundle.js"></script></html>`,
);
esbuild.buildSync({
  stdin: {
    contents: fs.readFileSync(sourceDir + "/entry.jsx", "utf8"),
    resolveDir: root,
    sourcefile: "review-browser.jsx",
    loader: "jsx",
  },
  bundle: true,
  jsx: "automatic",
  outfile: dir + "/bundle.js",
  alias: {
    "@/lib/project-knowledge.functions": sourceDir + "/mock.js",
    "@/i18n": sourceDir + "/i18n.js",
  },
  define: { "process.env.NODE_ENV": '"development"', __REVIEW_LOCALE__: JSON.stringify(locale) },
});
