#!/usr/bin/env node
/**
 * Bounded, failure-only diagnostic for the "Claude Code Review" workflow.
 *
 * Reads the execution file the claude-code-action writes to `$RUNNER_TEMP/claude-execution-output.json` (a JSON
 * array of Agent SDK messages, written BEFORE the action assesses `is_error`) and prints ONLY predefined enums,
 * booleans and counts. It never prints message text, prompts, tool inputs, command arguments, URLs, paths taken
 * from the content, stderr/exception details, credentials, or any raw value from the file: every printed token
 * comes from a fixed allowlist in this file or is a bounded integer. Anything unrecognised is reported as
 * `other`; a missing/unreadable/oversized/malformed file is reported by category and nothing else.
 *
 * This is a diagnosis aid, not a fix: it does not change the job outcome (the review step's failure keeps the
 * job red), requests no permissions and uploads nothing. Usage: `node scripts/claude-review-diagnostic.mjs <path>`.
 */
import { readFileSync, statSync } from "node:fs";

const MAX_BYTES = Number(process.env.CLAUDE_REVIEW_DIAGNOSTIC_MAX_BYTES) || 64 * 1024 * 1024;
const MAX_TEXT_SCAN = 20000; // characters scanned per string when matching error categories (never printed)
const MAX_COUNT = 1_000_000;

// Fixed allowlists: only these literals can appear in the output.
const RESULT_SUBTYPES = new Set([
  "success",
  "error_max_turns",
  "error_during_execution",
  "error_max_budget_usd",
  "error_max_structured_output_retries",
]);
const TOOL_NAMES = new Set([
  "Bash",
  "Read",
  "Edit",
  "MultiEdit",
  "Write",
  "Grep",
  "Glob",
  "LS",
  "WebFetch",
  "WebSearch",
  "Task",
  "TodoWrite",
  "NotebookEdit",
  "Skill",
  "AskUserQuestion",
]);
const BASH_PROGRAMS = new Set([
  "gh",
  "git",
  "npm",
  "npx",
  "node",
  "bun",
  "curl",
  "cat",
  "ls",
  "grep",
]);
const GH_SUBCOMMANDS = new Set(["pr", "api", "issue", "repo", "auth", "run"]);
const ERROR_CATEGORIES = ["permission", "auth", "quota", "unknown_command", "network", "other"];
const ERROR_PATTERNS = {
  permission: /permission|not allowed|denied|not permitted|requires approval/i,
  auth: /unauthori[sz]ed|\b401\b|invalid (api key|token)|authentication|oauth|not logged in|log ?in required/i,
  quota:
    /rate.?limit|\b429\b|\b529\b|quota|usage limit|overloaded|out of extra usage|weekly limit/i,
  unknown_command:
    /unknown (slash )?command|command not found|no such (command|skill)|not a valid command|unknown skill/i,
  network:
    /ENOTFOUND|ECONNRE|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|fetch failed|network error|socket hang up|certificate/i,
};

const bounded = (n) => (Number.isInteger(n) && n >= 0 && n <= MAX_COUNT ? n : -1);
const lines = [];
const out = (k, v) => lines.push(`${k}: ${v}`);
const countMap = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const fmtCounts = (map) =>
  [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${bounded(v)}`)
    .join(",") || "none";

function toolName(name) {
  if (typeof name !== "string") return "other";
  if (TOOL_NAMES.has(name)) return name;
  if (name.startsWith("mcp__github")) return "mcp_github";
  if (name.startsWith("mcp__")) return "mcp_other";
  return "other";
}
function bashProgram(input) {
  const cmd =
    input && typeof input === "object" && typeof input.command === "string" ? input.command : "";
  const first = cmd.trimStart().split(/\s+/)[0] ?? "";
  const base = first.split("/").pop() ?? "";
  return BASH_PROGRAMS.has(base) ? base : "other";
}
function ghSubcommand(input) {
  const cmd =
    input && typeof input === "object" && typeof input.command === "string" ? input.command : "";
  const parts = cmd.trimStart().split(/\s+/);
  const sub = parts[1] ?? "";
  return GH_SUBCOMMANDS.has(sub) ? sub : "other";
}
function categorize(text, categories) {
  if (typeof text !== "string" || !text) return;
  const t = text.slice(0, MAX_TEXT_SCAN);
  let matched = false;
  for (const [cat, re] of Object.entries(ERROR_PATTERNS)) {
    if (re.test(t)) {
      countMap(categories, cat);
      matched = true;
    }
  }
  if (!matched) countMap(categories, "other");
}
function blocks(message) {
  const content =
    message && typeof message === "object" && message.message && typeof message.message === "object"
      ? message.message.content
      : undefined;
  return Array.isArray(content) ? content : [];
}

function analyse(messages) {
  const toolCalls = new Map();
  const toolErrors = new Map();
  const deniedTools = new Map();
  const deniedBash = new Map();
  const deniedGh = new Map();
  const categories = new Map();
  let init = false;
  let result = null;
  let assistantTurns = 0;
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    if (m.type === "system" && m.subtype === "init") init = true;
    if (m.type === "assistant") {
      assistantTurns += 1;
      for (const b of blocks(m))
        if (b && b.type === "tool_use") countMap(toolCalls, toolName(b.name));
    }
    if (m.type === "user") {
      for (const b of blocks(m))
        if (b && b.type === "tool_result" && b.is_error === true)
          countMap(toolErrors, "tool_result");
    }
    if (m.type === "result") result = m;
  }
  out("init", init ? "true" : "false");
  out("assistant_messages", bounded(assistantTurns));
  out("tool_calls", fmtCounts(toolCalls));
  out("tool_result_errors", bounded(toolErrors.get("tool_result") ?? 0));
  if (!result) {
    out("result", "absent");
    return;
  }
  out("result", "present");
  out("subtype", RESULT_SUBTYPES.has(result.subtype) ? result.subtype : "other");
  out(
    "is_error",
    result.is_error === true ? "true" : result.is_error === false ? "false" : "unknown",
  );
  out("num_turns", bounded(result.num_turns));
  out("duration_ms", bounded(result.duration_ms));
  const denials = Array.isArray(result.permission_denials) ? result.permission_denials : [];
  out("permission_denials", bounded(denials.length));
  for (const d of denials) {
    const name = toolName(d && d.tool_name);
    countMap(deniedTools, name);
    if (name === "Bash") {
      const program = bashProgram(d.tool_input);
      countMap(deniedBash, program);
      if (program === "gh") countMap(deniedGh, ghSubcommand(d.tool_input));
    }
  }
  out("denied_tools", fmtCounts(deniedTools));
  out("denied_bash_programs", fmtCounts(deniedBash));
  out("denied_gh_subcommands", fmtCounts(deniedGh));
  // Coarse error categories, matched internally against the result's error list and final text; only the
  // category names above are printed, never the matched text.
  if (Array.isArray(result.errors)) for (const e of result.errors) categorize(e, categories);
  if (result.is_error === true || result.subtype !== "success")
    categorize(result.result, categories);
  out(
    "error_categories",
    ERROR_CATEGORIES.map((c) => `${c}=${bounded(categories.get(c) ?? 0)}`).join(","),
  );
}

function main(argv) {
  const path = argv[2];
  if (!path) {
    process.stdout.write("claude-review-diagnostic: v1\nusage: missing file argument\n");
    return 2;
  }
  out("claude-review-diagnostic", "v1");
  let size;
  try {
    size = statSync(path).size;
  } catch {
    out("file", "missing");
    return 0;
  }
  if (size > MAX_BYTES) {
    out("file", "too_large");
    return 0;
  }
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    out("file", "unreadable");
    return 0;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    out("file", "malformed");
    return 0;
  }
  if (!Array.isArray(parsed)) {
    out("file", "not_array");
    return 0;
  }
  out("file", "present");
  out("messages", bounded(parsed.length));
  try {
    analyse(parsed);
  } catch {
    out("diagnostic", "internal_error");
  }
  return 0;
}

let code = 0;
try {
  code = main(process.argv);
} catch {
  lines.length = 0;
  lines.push("claude-review-diagnostic: v1", "diagnostic: internal_error");
}
process.stdout.write(lines.join("\n") + "\n");
process.exitCode = code;
