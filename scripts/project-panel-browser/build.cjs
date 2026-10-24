// Loopback-only React reconciliation test; no app/backend imports or credentials.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const ts = require(path.join(root, "node_modules/typescript"));
const source = fs.readFileSync(path.join(root, "src/routes/_authenticated/app.setup.tsx"), "utf8");
const ast = ts.createSourceFile(
  "setup.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const names = ["WeeklyPreparationPanel", "BrandIntelligenceCard", "PublishingCard"];
const panels = [];
function visit(node) {
  if (ts.isJsxSelfClosingElement(node) && names.includes(node.tagName.getText(ast))) {
    panels.push(node.getText(ast));
  }
  ts.forEachChild(node, visit);
}
visit(ast);
if (panels.length !== 3) throw Error("Expected the three actual project panel call sites");
const out = "/tmp/milo-project-panel-browser";
fs.mkdirSync(out, { recursive: true });
require(path.join(root, "node_modules/esbuild"))
  .build({
    stdin: {
      contents: fs
        .readFileSync(path.join(__dirname, "entry.jsx"), "utf8")
        .replace("{/* ACTUAL_PANEL_CALL_SITES */}", panels.join("\n")),
      resolveDir: root,
      loader: "jsx",
    },
    bundle: true,
    jsx: "automatic",
    outfile: path.join(out, "bundle.js"),
    define: { "process.env.NODE_ENV": '"development"' },
  })
  .then(() => {
    fs.writeFileSync(
      path.join(out, "index.html"),
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'"><title>Project panel isolation regression</title></head><body><h1>Project panel isolation regression</h1><p>Synthetic projects only; actual panel call sites and actual React reconciliation.</p><button id="run">Run project switches</button><div id="root"></div><pre id="result">Not run</pre><script src="/bundle.js"></script></body></html>`,
    );
    console.log("Built " + out);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
