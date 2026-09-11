import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(new URL("../package.json", import.meta.url));
const manifest = require("./package.json");
let folder = dirname(require.resolve("entities"));
let installed;
while (true) {
  try {
    const candidate = JSON.parse(readFileSync(join(folder, "package.json"), "utf8"));
    if (candidate.name === "entities") {
      installed = candidate;
      break;
    }
  } catch {}
  const parent = dirname(folder);
  if (parent === folder) throw new Error("Could not identify the root entities dependency");
  folder = parent;
}
assert.equal(
  installed.version,
  manifest.dependencies.entities,
  "The application entities resolution must match its exact compatibility pin",
);
console.log(`Application entities resolution matches ${installed.version}`);
