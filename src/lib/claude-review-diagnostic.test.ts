/**
 * `scripts/claude-review-diagnostic.mjs` — the bounded, failure-only CI diagnostic for the Claude Code Review
 * workflow. Runs the script as a child process exactly as the workflow does and asserts (a) only enum/count
 * lines are printed, (b) synthetic secrets, URLs, prompts, commands, paths and exception text never leak, and
 * (c) missing/malformed/oversized inputs fail closed with a category only.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = join(process.cwd(), "scripts", "claude-review-diagnostic.mjs");
const dir = mkdtempSync(join(tmpdir(), "claude-review-diagnostic-"));
const run = (file: string, env: Record<string, string> = {}) =>
  execFileSync(process.execPath, [script, file], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
const write = (name: string, content: string) => {
  const p = join(dir, name);
  writeFileSync(p, content);
  return p;
};
const SENTINELS = [
  "sk-ant-api03-SENTINEL_SECRET",
  "ghp_SENTINELTOKEN",
  "https://sentinel.example/leak?token=abc",
  "PROMPT_SENTINEL_TEXT",
  "--body SENTINEL_COMMENT_BODY",
  "/home/runner/work/SENTINEL_PATH",
  "SENTINEL_EXCEPTION_DETAIL",
  "SENTINEL_RESULT_TEXT",
];
const LINE = /^[a-z_-]+: [A-Za-z0-9_=,\- ]+$/;

describe("claude-review-diagnostic (bounded failure-only CI diagnostic)", () => {
  it("prints only allowlisted enums and counts for a denied-permission failure, never the content", () => {
    const messages = [
      {
        type: "system",
        subtype: "init",
        model: "claude-opus-5-5",
        session_id: "s-SENTINEL",
        cwd: SENTINELS[5],
      },
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: `Reading the PR ${SENTINELS[3]}` },
            {
              type: "tool_use",
              name: "Bash",
              input: { command: `gh pr diff 151 ${SENTINELS[2]}` },
            },
            {
              type: "tool_use",
              name: "mcp__github_inline_comment__create_inline_comment",
              input: { body: SENTINELS[3] },
            },
            { type: "tool_use", name: "SomethingNew", input: {} },
          ],
        },
      },
      {
        type: "user",
        message: {
          content: [
            { type: "tool_result", is_error: true, content: `Permission denied ${SENTINELS[0]}` },
          ],
        },
      },
      {
        type: "result",
        subtype: "success",
        is_error: true,
        num_turns: 6,
        duration_ms: 29586,
        result: `I could not proceed: permission to run gh was denied. ${SENTINELS[7]} ${SENTINELS[1]}`,
        permission_denials: [
          {
            tool_name: "Bash",
            tool_use_id: "t1",
            tool_input: { command: `gh pr comment 151 ${SENTINELS[4]}` },
          },
          {
            tool_name: "Bash",
            tool_use_id: "t2",
            tool_input: { command: `/usr/bin/gh api repos/x/y ${SENTINELS[2]}` },
          },
          { tool_name: "Bash", tool_use_id: "t3", tool_input: { command: `curl ${SENTINELS[2]}` } },
          { tool_name: "WebFetch", tool_use_id: "t4", tool_input: { url: SENTINELS[2] } },
          {
            tool_name: "mcp__github__create_pull_request_review",
            tool_use_id: "t5",
            tool_input: {},
          },
        ],
        errors: [`Exception: ${SENTINELS[6]} ENOTFOUND api.github.com`],
      },
    ];
    const outText = run(write("denied.json", JSON.stringify(messages)));
    for (const s of SENTINELS) expect(outText).not.toContain(s);
    expect(outText).not.toContain("SENTINEL");
    expect(outText).not.toContain("claude-opus"); // model ids are not part of the allowlist either
    const lines = outText.trim().split("\n");
    for (const l of lines) expect(l).toMatch(LINE);
    expect(lines).toEqual([
      "claude-review-diagnostic: v1",
      "file: present",
      "messages: 4",
      "init: true",
      "assistant_messages: 1",
      "tool_calls: Bash=1,mcp_github=1,other=1",
      "tool_result_errors: 1",
      "result: present",
      "subtype: success",
      "is_error: true",
      "num_turns: 6",
      "duration_ms: 29586",
      "permission_denials: 5",
      "denied_tools: Bash=3,WebFetch=1,mcp_github=1",
      "denied_bash_programs: curl=1,gh=2",
      "denied_gh_subcommands: api=1,pr=1",
      "error_categories: permission=1,auth=0,quota=0,unknown_command=0,network=1,other=0",
    ]);
  });
  it("classifies a no-denial error result and an unknown subtype as enums only", () => {
    const messages = [
      { type: "system", subtype: "init" },
      {
        type: "assistant",
        message: {
          content: [{ type: "text", text: "Unknown slash command /code-review:code-review" }],
        },
      },
      {
        type: "result",
        subtype: "weird_new_subtype",
        is_error: true,
        num_turns: 4,
        duration_ms: 10796,
        result: `Unknown command: /code-review:code-review ${SENTINELS[3]}`,
        permission_denials: [],
      },
    ];
    const outText = run(write("unknown.json", JSON.stringify(messages)));
    expect(outText).not.toContain("SENTINEL");
    expect(outText).not.toContain("/code-review");
    expect(outText).toContain("subtype: other");
    expect(outText).toContain("permission_denials: 0");
    expect(outText).toContain("denied_tools: none");
    expect(outText).toContain(
      "error_categories: permission=0,auth=0,quota=0,unknown_command=1,network=0,other=0",
    );
  });
  it("a successful result reports no error categories and no denials", () => {
    const messages = [
      { type: "system", subtype: "init" },
      {
        type: "result",
        subtype: "success",
        is_error: false,
        num_turns: 40,
        duration_ms: 500000,
        result: "Review posted",
        permission_denials: [],
      },
    ];
    const outText = run(write("ok.json", JSON.stringify(messages)));
    expect(outText).toContain("is_error: false");
    expect(outText).toContain(
      "error_categories: permission=0,auth=0,quota=0,unknown_command=0,network=0,other=0",
    );
  });
  it("fails closed on a missing, malformed, non-array or oversized file — category only, exit 0, nothing else", () => {
    expect(run(join(dir, "does-not-exist.json")).trim().split("\n")).toEqual([
      "claude-review-diagnostic: v1",
      "file: missing",
    ]);
    expect(
      run(write("bad.json", `{not json ${SENTINELS[0]}`))
        .trim()
        .split("\n"),
    ).toEqual(["claude-review-diagnostic: v1", "file: malformed"]);
    expect(
      run(write("obj.json", `{"secret":"${SENTINELS[0]}"}`))
        .trim()
        .split("\n"),
    ).toEqual(["claude-review-diagnostic: v1", "file: not_array"]);
    const big = run(write("big.json", JSON.stringify([{ type: "result", result: SENTINELS[0] }])), {
      CLAUDE_REVIEW_DIAGNOSTIC_MAX_BYTES: "10",
    });
    expect(big.trim().split("\n")).toEqual(["claude-review-diagnostic: v1", "file: too_large"]);
    // Hostile shapes inside a well-formed array never throw or leak.
    const hostile = run(
      write(
        "hostile.json",
        JSON.stringify([
          null,
          42,
          "str",
          { type: "result", permission_denials: "x", num_turns: -5, errors: [null, 1], result: 7 },
        ]),
      ),
    );
    expect(hostile).toContain("result: present");
    expect(hostile).toContain("num_turns: -1");
    expect(hostile).toContain("permission_denials: 0");
    for (const l of hostile.trim().split("\n")) expect(l).toMatch(LINE);
  });
  it("without a file argument prints usage only and exits 2", () => {
    let code = 0;
    try {
      execFileSync(process.execPath, [script], { encoding: "utf8" });
    } catch (e) {
      code = (e as { status: number }).status;
    }
    expect(code).toBe(2);
  });
});
