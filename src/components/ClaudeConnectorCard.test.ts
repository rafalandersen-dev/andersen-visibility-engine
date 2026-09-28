/**
 * Static-markup regressions for the Claude connector card (AB): the Connectors + OAuth guidance and the
 * committable Claude Code project config are visible BEFORE any token exists; the retired Desktop config-file
 * snippet is gone; the one-time CLI snippet (which carries the token) is not rendered without a fresh token.
 * Event behaviour (generate → snippets) is exercised in the local fixture, not here (no DOM library).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    vars ? `${key} ${Object.values(vars).join(" ")}` : key,
}));
vi.mock("@/lib/mcp.functions", () => ({
  getMcpStatusFn: vi.fn(async () => ({
    endpoint: "https://milogrowth.com/api/mcp",
    toolNames: [],
    tokens: [],
    oauthEnabled: true,
  })),
  createMcpTokenFn: vi.fn(),
  revokeMcpTokenFn: vi.fn(),
}));
vi.mock("@/components/ConnectedAppsSection", () => ({ ConnectedAppsSection: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { ClaudeConnectorCard } from "./ClaudeConnectorCard";

describe("ClaudeConnectorCard (AB onboarding guidance)", () => {
  it("shows Connectors + OAuth guidance and the .mcp.json config before any token; no Desktop config-file route; no CLI token line", () => {
    const html = renderToStaticMarkup(createElement(ClaudeConnectorCard));
    // AD: before any authenticated status has loaded the OAuth route is "unknown" — no instructions, no
    // "enabled" claim; the block itself is still present so the token alternative is explained.
    expect(html).toContain("data-connectors-guidance");
    expect(html).toContain('data-oauth-availability="unknown"');
    expect(html).toContain("claude.oauthUnknownHeading");
    expect(html).not.toContain("claude.connectorsBody");
    expect(html).not.toContain("claude.oauthEnabledStatus");
    expect(html).toContain("data-mcp-json");
    expect(html).toContain("claude.mcpJsonHeading");
    expect(html).toContain("claude.mcpJsonNote");
    expect(html).toContain("&quot;type&quot;: &quot;http&quot;");
    expect(html).toContain("${MILO_MCP_TOKEN}");
    expect(html).not.toContain("claude.desktopHeading");
    expect(html).not.toContain("claude_desktop_config");
    expect(html).not.toContain("data-cli-snippet");
    expect(html).not.toContain("YOUR_TOKEN");
    // Every control is an explicit button (the card lives inside the setup page).
    for (const tag of html.match(/<button\b[^>]*>/g) ?? []) expect(tag).toContain('type="button"');
  });
});
