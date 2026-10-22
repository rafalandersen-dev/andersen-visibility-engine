import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: h.rpc } }));
vi.mock("@lovable.dev/email-js", () => ({ sendLovableEmail: h.send }));
vi.mock("./operational-notifications.server", () => ({
  refreshOperationalNotifications: vi.fn(async () => true),
}));

import {
  operationalEmailAllowedFor,
  teamInvitationEmailAllowedForOwner,
} from "./operational-email-gate";
import { runOperationalEmailWorker } from "./operational-email.server";

const owner = "00000000-0000-4000-8000-0000000000aa";
const other = "00000000-0000-4000-8000-0000000000bb";
afterEach(() => {
  vi.unstubAllEnvs();
  h.rpc.mockReset();
  h.send.mockReset();
});

describe("operational email recipient allowlist", () => {
  it("allows every account when unset or empty (existing behaviour)", () => {
    vi.stubEnv("OPERATIONAL_EMAIL_ALLOWED_USER_IDS", "");
    expect(operationalEmailAllowedFor(owner)).toBe(true);
    expect(operationalEmailAllowedFor(other)).toBe(true);
  });
  it("allows only listed accounts, ignoring case and spaces", () => {
    vi.stubEnv("OPERATIONAL_EMAIL_ALLOWED_USER_IDS", ` ${owner.toUpperCase()} ,`);
    expect(operationalEmailAllowedFor(owner)).toBe(true);
    expect(operationalEmailAllowedFor(other)).toBe(false);
  });
  it("matches nobody when every entry is malformed (a typo narrows, never widens)", () => {
    vi.stubEnv("OPERATIONAL_EMAIL_ALLOWED_USER_IDS", "rafi@anderseninnovations.com,*");
    expect(operationalEmailAllowedFor(owner)).toBe(false);
    expect(operationalEmailAllowedFor("*")).toBe(false);
  });

  it("keeps the two allowlists independent", () => {
    vi.stubEnv("OPERATIONAL_EMAIL_ALLOWED_USER_IDS", owner);
    expect(teamInvitationEmailAllowedForOwner(other)).toBe(true);
    vi.stubEnv("TEAM_INVITATION_EMAIL_ALLOWED_OWNER_IDS", owner);
    expect(teamInvitationEmailAllowedForOwner(other)).toBe(false);
    expect(teamInvitationEmailAllowedForOwner(owner)).toBe(true);
  });
  it("the real worker never sends a digest claimed for an account outside the list", async () => {
    vi.stubEnv("OPERATIONAL_EMAIL_ENABLED", "true");
    vi.stubEnv("LOVABLE_API_KEY", "test-only-key");
    vi.stubEnv("OPERATIONAL_EMAIL_ALLOWED_USER_IDS", owner);
    const lease = "00000000-0000-4000-8000-0000000000cc";
    const claimed = "00000000-0000-4000-8000-0000000000dd";
    h.rpc.mockImplementation(async (name: string) => {
      if (name === "claim_operational_email_digest")
        return h.rpc.mock.calls.filter(([n]) => n === name).length === 1
          ? { data: [{ id: claimed, user_id: other, lease_token: lease }], error: null }
          : { data: [], error: null };
      return { data: true, error: null };
    });
    expect(await runOperationalEmailWorker()).toEqual({ enabled: true, processed: 1 });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.rpc).toHaveBeenCalledWith("finish_operational_email_delivery", {
      p_id: claimed,
      p_lease: lease,
      p_outcome: "preflight_unavailable",
    });
    expect(h.rpc).not.toHaveBeenCalledWith("begin_operational_email_delivery", expect.anything());
  });
});
