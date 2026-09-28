import { describe, expect, it } from "vitest";
import { MCP_TOKEN_ENV, cliSnippet, mcpJsonSnippet } from "./mcp-client-snippets";

const ENDPOINT = "https://milogrowth.com/api/mcp";
const TOKEN = "milo_mcp_FIXTURE_0000000000000000";

describe("Claude client snippets (AB)", () => {
  it("the project config is parseable JSON with a typed HTTP entry and an environment placeholder, never a token", () => {
    const text = mcpJsonSnippet(ENDPOINT);
    const parsed = JSON.parse(text) as {
      mcpServers: Record<string, { type: string; url: string; headers: Record<string, string> }>;
    };
    const entry = parsed.mcpServers["milo-growth"];
    expect(entry.type).toBe("http");
    expect(entry.url).toBe(ENDPOINT);
    expect(entry.headers.Authorization).toBe(`Bearer \${${MCP_TOKEN_ENV}}`);
    expect(text).not.toContain("milo_mcp_");
    expect(text).not.toContain("claude_desktop_config");
    // The helper cannot even receive a token: the signature has no token argument.
    expect(mcpJsonSnippet.length).toBe(1);
  });
  it("the CLI line carries the one-time token and the documented HTTP transport flag", () => {
    const line = cliSnippet(ENDPOINT, TOKEN);
    expect(line).toContain("claude mcp add --transport http milo-growth " + ENDPOINT);
    expect(line).toContain(`--header "Authorization: Bearer ${TOKEN}"`);
  });
});
