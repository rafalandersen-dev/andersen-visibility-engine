/** Offline evaluator: reads one explicitly supplied project file; no network/provider execution. */
import { readFile, writeFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { compareWorkflows } from "../src/lib/workflow-comparison.ts";
const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath || resolve(inputPath) === resolve(outputPath))
  throw Error("Usage: bun scripts/compare-workflows.ts input.json separate-report.json");
if ((await stat(inputPath)).size > 250000) throw Error("Comparison input exceeds 250 kB");
const report = await compareWorkflows(JSON.parse(await readFile(inputPath, "utf8")));
await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
console.log(
  JSON.stringify({
    verdict: report.verdict,
    fixedBriefHash: report.fixedBriefHash,
    cases: report.input.cases.length,
    autoRelease: report.autoRelease,
    independentlyVerified: report.independentlyVerified,
  }),
);
