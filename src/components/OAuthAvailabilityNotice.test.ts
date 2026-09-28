/**
 * Static-markup regressions (AD): OAuth setup instructions render only for a verified "enabled" status;
 * "disabled" shows the unavailable-on-this-deployment guidance with the token alternative; "unknown" shows the
 * not-verified guidance. Neither non-enabled state renders the instructions or the enabled status line.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/i18n", () => ({ useT: () => (key: string) => key }));
import { OAuthAvailabilityNotice } from "./OAuthAvailabilityNotice";
import type { OAuthAvailability } from "@/lib/mcp-oauth-availability";

const render = (availability: OAuthAvailability) =>
  renderToStaticMarkup(createElement(OAuthAvailabilityNotice, { availability }));

describe("OAuthAvailabilityNotice", () => {
  it("enabled: instructions and status line", () => {
    const html = render("enabled");
    expect(html).toContain('data-oauth-availability="enabled"');
    expect(html).toContain("claude.connectorsHeading");
    expect(html).toContain("claude.connectorsBody");
    expect(html).toContain("claude.oauthEnabledStatus");
    expect(html).not.toContain("claude.oauthUnavailable");
    expect(html).not.toContain("claude.oauthUnknown");
  });
  it("disabled: unavailable guidance, no instructions", () => {
    const html = render("disabled");
    expect(html).toContain('data-oauth-availability="disabled"');
    expect(html).toContain("claude.oauthUnavailableHeading");
    expect(html).toContain("claude.oauthUnavailableBody");
    expect(html).not.toContain("claude.connectorsBody");
    expect(html).not.toContain("claude.oauthEnabledStatus");
  });
  it("unknown: not-verified guidance, no instructions", () => {
    const html = render("unknown");
    expect(html).toContain('data-oauth-availability="unknown"');
    expect(html).toContain("claude.oauthUnknownHeading");
    expect(html).toContain("claude.oauthUnknownBody");
    expect(html).not.toContain("claude.connectorsBody");
    expect(html).not.toContain("claude.oauthEnabledStatus");
  });
});
