# Claude Connector (MCP) — Setup

Milo Growth exposes a **read-only MCP server** so you can work with your Milo
data from inside Claude (Claude Code and Claude Desktop). You generate a
connection token in Milo and add it to your Claude MCP client.

- **Endpoint:** `https://milogrowth.com/api/mcp`
- **Transport:** MCP over HTTP (JSON-RPC 2.0)
- **Auth:** `Authorization: Bearer <token>` (token generated in Milo)
- **Access:** read-only, scoped to the token owner's workspace

## 1. Generate a connection token in Milo
1. Open **Project Setup** (`/app/setup`) → **Claude connector (MCP)**.
2. (Optional) add a label, e.g. "My laptop".
3. Click **Generate connection token**.
4. **Copy the token now — it is shown only once.** Milo stores just a hash and
   can never show it again. If you lose it, revoke it and generate a new one.

The connection is **account-level**: one token gives Claude read-only access to
every project in that workspace.

## 2a. Add to Claude Code (CLI)
```bash
claude mcp add --transport http milo-growth https://milogrowth.com/api/mcp \
  --header "Authorization: Bearer YOUR_TOKEN"
```
Then in a Claude Code session, the `milo-growth` tools become available.

## 2b. Add to Claude Desktop
Edit `claude_desktop_config.json` (Settings → Developer → Edit config):
```json
{
  "mcpServers": {
    "milo-growth": {
      "url": "https://milogrowth.com/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}
```
Restart Claude Desktop. (The exact `mcpServers` HTTP shape depends on your
Claude Desktop version; use its remote/HTTP MCP option and supply the URL +
Authorization header.)

## 3. Available tools (read-only)
| Tool | Returns |
|---|---|
| `list_projects` | All projects (id, business, website, connector, market, language). |
| `get_project_brief` | Brand brief: audience, tone, services, Brand Intelligence, connector. |
| `list_opportunities` | SEO/content opportunities for a project. |
| `list_content` | Content assets with status, Milo Score and publish/live status. |
| `get_content` | One asset in full: meta, outline, markdown, FAQ + full Milo Score. |
| `get_latest_audit` | Latest AI Visibility Readiness audit: scores, fixes, findings. |
| `get_gsc_summary` | Latest Search Console import (CSV or API): totals, top queries/pages. |
| `list_authority_opportunities` | Authority Builder items with status and targets. |

Most tools take an optional `projectId` (from `list_projects`); with a single
project it is inferred. `get_content` takes a `contentId` from `list_content`.

Example prompts in Claude once connected:
- "List my Milo projects."
- "Show the Milo Score and top issues for my latest draft."
- "Summarize my latest AI Visibility audit and the top 3 fixes."
- "What are my best-performing Search Console queries this period?"

## 4. Disconnect
In **Project Setup → Claude connector (MCP)**, click the trash icon next to a
token to **revoke** it. Also remove the server from your Claude client config.
Revoking is immediate — the token stops working on the next request.

## Security
- **Read-only.** The v1 tools never modify Milo data, never publish, and never
  touch billing.
- Tokens are stored **hashed** (SHA-256) in a service-role-only table; the
  plaintext is shown once and never logged.
- Each token is scoped to its owner's workspace — it cannot read other accounts.
- Treat the token like a password. Revoke and regenerate if exposed.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `401 Unauthorized` | Token missing/wrong/revoked. Regenerate in Milo and update the client config. |
| Tools don't appear | Confirm the client points at `https://milogrowth.com/api/mcp` and sends the `Authorization: Bearer` header. |
| Empty results | The workspace has no data yet for that project, or the wrong `projectId`. |

## Deferred (roadmap)
- **claude.ai one-click custom connector.** claude.ai's hosted connectors
  require an OAuth 2.1 authorization server with dynamic client registration on
  Milo's side. v1 uses Bearer tokens (Claude Code / Desktop / any header-auth
  MCP client). OAuth is the planned upgrade to enable claude.ai's connector UI.
- **Write actions** (e.g. generate an opportunity/draft, send to a connector)
  are intentionally out of v1; the current tool set is read-only.
