import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUserById: vi.fn(), from: vi.fn(), upsert: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { auth: { admin: { getUserById: mocks.getUserById } }, from: mocks.from },
}));
vi.mock("./operational-notifications.server", () => ({ refreshOperationalNotifications: vi.fn() }));
import {
  readOperationalEmailAddress,
  resolveOperationalEmailRecipient,
} from "./operational-email.server";
const userId = "00000000-0000-4000-8000-000000000031";
function confirmedAccount() {
  return {
    id: userId,
    email: "Owner@Example.test",
    email_confirmed_at: "2026-09-01T10:00:00Z",
    identities: [
      {
        user_id: userId,
        provider: "email",
        identity_data: { email: "owner@example.test", email_verified: true },
      },
    ],
  };
}
let suppressed: { data: unknown; error: unknown }, tokens: Array<{ data: unknown; error: unknown }>;
const queries: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
beforeEach(() => {
  vi.resetAllMocks();
  queries.length = 0;
  mocks.getUserById.mockResolvedValue({
    data: { user: confirmedAccount() },
    error: null,
  });
  suppressed = { data: null, error: null };
  tokens = [
    { data: { token: "stored-test-token", used_at: null }, error: null },
    { data: { token: "stored-test-token", used_at: null }, error: null },
  ];
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.from.mockImplementation((table: string) => {
    const record = { table, filters: [] as Array<[string, unknown]> };
    queries.push(record);
    const q = {
      select: vi.fn(() => q),
      eq: vi.fn((key: string, val: unknown) => {
        record.filters.push([key, val]);
        return q;
      }),
      maybeSingle: vi.fn(async () => (table === "suppressed_emails" ? suppressed : tokens.shift())),
      upsert: mocks.upsert,
    };
    return q;
  });
});
describe("operational email recipient verification", () => {
  it("checks the current address without touching suppression, tokens or transport", async () => {
    expect(await readOperationalEmailAddress(userId)).toEqual({
      status: "verified",
      email: "owner@example.test",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("distinguishes an unverified current identity from an unavailable Auth read", async () => {
    const user = confirmedAccount();
    user.identities[0].identity_data.email_verified = false;
    mocks.getUserById.mockResolvedValue({ data: { user }, error: null });
    expect(await readOperationalEmailAddress(userId)).toEqual({ status: "unverified" });
    mocks.getUserById.mockRejectedValue(new Error("private auth response"));
    expect(await readOperationalEmailAddress(userId)).toEqual({ status: "unavailable" });
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("uses only the current confirmed account address and stored unsubscribe token", async () => {
    expect(await resolveOperationalEmailRecipient(userId)).toEqual({
      email: "owner@example.test",
      unsubscribeToken: "stored-test-token",
    });
    expect(mocks.getUserById).toHaveBeenCalledWith(userId);
    expect(
      queries.every((q) => q.filters.some(([k, v]) => k === "email" && v === "owner@example.test")),
    ).toBe(true);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it.each(["unconfirmed", "missing", "auth_error"])("blocks %s account metadata", async (kind) => {
    mocks.getUserById.mockResolvedValue({
      data: {
        user: {
          ...confirmedAccount(),
          email: kind === "missing" ? null : "owner@example.test",
          email_confirmed_at: kind === "unconfirmed" ? null : "2026-09-01T10:00:00Z",
        },
      },
      error: kind === "auth_error" ? {} : null,
    });
    await expect(resolveOperationalEmailRecipient(userId)).rejects.toThrow("recipient_unavailable");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("blocks a changed address with a retained timestamp and a verified old Google identity", async () => {
    const user = confirmedAccount();
    user.identities[0].identity_data.email_verified = false;
    user.identities.push({
      user_id: userId,
      provider: "google",
      identity_data: { email: "old@example.test", email_verified: true },
    });
    mocks.getUserById.mockResolvedValue({ data: { user }, error: null });
    await expect(resolveOperationalEmailRecipient(userId)).rejects.toThrow("recipient_unavailable");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("accepts a verified linked-provider identity only for the current address", async () => {
    const user = confirmedAccount();
    user.identities[0].provider = "google";
    user.identities[0].identity_data.email = "OWNER@EXAMPLE.TEST";
    mocks.getUserById.mockResolvedValue({ data: { user }, error: null });
    expect((await resolveOperationalEmailRecipient(userId)).email).toBe("owner@example.test");
  });
  it.each([
    { identities: undefined },
    { identities: [] },
    { identities: [null] },
    { identities: [{ ...confirmedAccount().identities[0], identity_data: {} }] },
    {
      identities: [
        {
          ...confirmedAccount().identities[0],
          identity_data: { email: "owner@example.test", email_verified: "true" },
        },
      ],
    },
    {
      identities: [
        { ...confirmedAccount().identities[0], user_id: "00000000-0000-4000-8000-000000000099" },
      ],
    },
    { id: "00000000-0000-4000-8000-000000000099" },
    { email: "not-an-email" },
    { email_confirmed_at: "confirmed" },
  ])("blocks missing, malformed or mismatched confirmation: %j", async (override) => {
    mocks.getUserById.mockResolvedValue({
      data: { user: { ...confirmedAccount(), ...override } },
      error: null,
    });
    await expect(resolveOperationalEmailRecipient(userId)).rejects.toThrow("recipient_unavailable");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("never trusts editable user metadata as address verification", async () => {
    const user = confirmedAccount();
    user.identities[0].identity_data.email_verified = false;
    mocks.getUserById.mockResolvedValue({
      data: { user: { ...user, user_metadata: { email: user.email, email_verified: true } } },
      error: null,
    });
    await expect(resolveOperationalEmailRecipient(userId)).rejects.toThrow("recipient_unavailable");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each(["suppressed", "error"])("fails closed on suppression %s", async (kind) => {
    suppressed =
      kind === "suppressed" ? { data: { id: "row" }, error: null } : { data: null, error: {} };
    await expect(resolveOperationalEmailRecipient(userId)).rejects.toThrow("recipient_unavailable");
    expect(queries).toHaveLength(1);
  });
  it("does not reactivate a used unsubscribe token", async () => {
    tokens = [{ data: { token: "used-test-token", used_at: "2026-09-01" }, error: null }];
    await expect(resolveOperationalEmailRecipient(userId)).rejects.toThrow("recipient_unavailable");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("uses the stored winner after concurrent token creation", async () => {
    tokens = [
      { data: null, error: null },
      { data: { token: "concurrent-winner-test-token", used_at: null }, error: null },
    ];
    expect(await resolveOperationalEmailRecipient(userId)).toEqual({
      email: "owner@example.test",
      unsubscribeToken: "concurrent-winner-test-token",
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      { email: "owner@example.test", token: expect.stringMatching(/^[a-f0-9]{64}$/) },
      { onConflict: "email", ignoreDuplicates: true },
    );
  });
  it("rejects a failed token write", async () => {
    tokens = [{ data: null, error: null }];
    mocks.upsert.mockResolvedValueOnce({ error: {} });
    await expect(resolveOperationalEmailRecipient(userId)).rejects.toThrow("recipient_unavailable");
  });
  it("rejects unsubscribe that happens during preflight", async () => {
    tokens[1] = { data: { token: "stored-test-token", used_at: "2026-09-07" }, error: null };
    await expect(resolveOperationalEmailRecipient(userId)).rejects.toThrow("recipient_unavailable");
  });
  it("fails closed when token re-read is unavailable", async () => {
    tokens[1] = { data: null, error: {} };
    await expect(resolveOperationalEmailRecipient(userId)).rejects.toThrow("recipient_unavailable");
  });
});
