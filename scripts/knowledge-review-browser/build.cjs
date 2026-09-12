const fs = require("fs");
const root = process.cwd();
const esbuild = require(root + "/node_modules/esbuild");
const dir = "/tmp/milo-knowledge-review-browser";
fs.mkdirSync(dir, { recursive: true });
const sourceDir = __dirname;
fs.writeFileSync(
  dir + "/index.html",
  '<div id="root"></div><pre id="results">Running</pre><script src="/bundle.js"></script>',
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
  define: { "process.env.NODE_ENV": '"development"' },
});
