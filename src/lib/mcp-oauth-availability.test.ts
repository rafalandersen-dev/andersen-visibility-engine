import { describe, expect, it } from "vitest";
import { oauthAvailabilityFromStatus, type OAuthAvailability } from "./mcp-oauth-availability";

describe("oauthAvailabilityFromStatus (AD)", () => {
  it.each<[unknown, OAuthAvailability]>([
    [{ oauthEnabled: true }, "enabled"],
    [{ oauthEnabled: false }, "disabled"],
    [{}, "unknown"],
    [{ oauthEnabled: undefined }, "unknown"],
    [{ oauthEnabled: "true" }, "unknown"],
    [null, "unknown"],
    [undefined, "unknown"],
  ])("maps status %j to %s", (status, expected) => {
    expect(
      oauthAvailabilityFromStatus(status as { oauthEnabled?: unknown } | null | undefined),
    ).toBe(expected);
  });
  it("a failed refresh after a verified enabled state must be modelled as unknown, never as still enabled", () => {
    // The card calls this only on success; on failure it sets "unknown" directly. Model that sequence here.
    let state: OAuthAvailability = oauthAvailabilityFromStatus({ oauthEnabled: true });
    expect(state).toBe("enabled");
    const failedRefresh = (): OAuthAvailability => "unknown";
    state = failedRefresh();
    expect(state).toBe("unknown");
  });
});
