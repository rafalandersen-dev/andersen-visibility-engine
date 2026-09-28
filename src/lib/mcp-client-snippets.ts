/**
 * Client configuration snippets shown by the Claude connector card. Pure and testable.
 *
 * - `cliSnippet` embeds the freshly generated connection token: it is shown ONCE, labelled as containing the
 *   token, and is meant for the user's own shell, never for a shared file.
 * - `mcpJsonSnippet` is Claude Code's project configuration (`.mcp.json`, documented at
 *   https://code.claude.com/docs/en/mcp): `"type": "http"` is required for a URL entry, and the header value is
 *   the environment variable expansion `${MILO_MCP_TOKEN}` so the file can be committed without a secret.
 *   It never receives a token.
 */
export const MCP_TOKEN_ENV = "MILO_MCP_TOKEN";

export function cliSnippet(endpoint: string, token: string): string {
  return `claude mcp add --transport http milo-growth ${endpoint} --header "Authorization: Bearer ${token}"`;
}

export function mcpJsonSnippet(endpoint: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        "milo-growth": {
          type: "http",
          url: endpoint,
          headers: { Authorization: `Bearer \${${MCP_TOKEN_ENV}}` },
        },
      },
    },
    null,
    2,
  );
}
