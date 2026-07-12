/**
 * Tests for the GSC OAuth server helpers: authorization URL construction,
 * signed state, callback handling, refresh-token persistence rules and the
 * Search Console API error mapping. No real network or database — fetch is
 * stubbed and the service-role client is mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---- service-role client mock (captures upserts, serves connection rows) ----
const dbState: {
  upserts: Record<string, unknown>[];
  row: Record<string, unknown> | null;
} = { upserts: [], row: null };

vi.mock("@/integrations/supabase/client.server", () => {
  const chain = {
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: dbState.row, error: null }) }) }),
      }),
      upsert: async (r: Record<string, unknown>) => {
        dbState.upserts.push(r);
        return { error: null };
      },
      update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    }),
  };
  return { supabaseAdmin: chain };
});

import {
  buildAuthUrl,
  signState,
  verifyState,
  completeOAuthCallback,
  saveConnection,
  listSites,
  GSC_DEFAULT_SCOPE,
} from "./gsc-oauth.server";
import { encryptSecret } from "./crypto.server";

const TEST_KEY_B64 = Buffer.from(new Uint8Array(32).map((_, i) => i + 7)).toString("base64");
const REDIRECT = "https://milogrowth.com/api/google/search-console/callback";

const ENV_KEYS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI", "GOOGLE_OAUTH_SCOPES", "GSC_TOKEN_ENCRYPTION_KEY"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.GOOGLE_OAUTH_REDIRECT_URI = REDIRECT;
  delete process.env.GOOGLE_OAUTH_SCOPES;
  process.env.GSC_TOKEN_ENCRYPTION_KEY = TEST_KEY_B64;
  dbState.upserts = [];
  dbState.row = null;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("buildAuthUrl", () => {
  it("requests offline access with forced consent, exact redirect URI and the read-only scope only", async () => {
    const url = new URL(await buildAuthUrl("user-1", "proj-1"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(url.searchParams.get("scope")).toBe(GSC_DEFAULT_SCOPE);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("test-client-id.apps.googleusercontent.com");
  });

  it("falls back to online access when secure token storage is not configured", async () => {
    delete process.env.GSC_TOKEN_ENCRYPTION_KEY;
    const url = new URL(await buildAuthUrl("user-1", "proj-1"));
    expect(url.searchParams.get("access_type")).toBe("online");
  });

  it("carries a verifiable signed state", async () => {
    const url = new URL(await buildAuthUrl("user-1", "proj-1"));
    const st = await verifyState(url.searchParams.get("state") ?? "");
    expect(st?.u).toBe("user-1");
    expect(st?.p).toBe("proj-1");
    expect(typeof st?.n).toBe("string");
  });
});

describe("signState / verifyState", () => {
  it("rejects a tampered signature", async () => {
    const state = await signState({ u: "user-1", p: "proj-1" });
    const [body] = state.split(".");
    expect(await verifyState(`${body}.AAAA`)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const state = await signState({ u: "user-1", p: "proj-1" });
    const [, sig] = state.split(".");
    const otherBody = Buffer.from(JSON.stringify({ u: "attacker", p: "proj-1", n: "x", e: Date.now() + 60000 }))
      .toString("base64url");
    expect(await verifyState(`${otherBody}.${sig}`)).toBeNull();
  });

  it("rejects an expired state", async () => {
    vi.useFakeTimers();
    const state = await signState({ u: "user-1", p: "proj-1" });
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(await verifyState(state)).toBeNull();
  });

  it("rejects garbage", async () => {
    expect(await verifyState("")).toBeNull();
    expect(await verifyState("not-a-state")).toBeNull();
    expect(await verifyState("a.b")).toBeNull();
  });
});

function stubTokenEndpoint(response: Record<string, unknown>, status = 200) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify(response), { status });
    }
    throw new Error(`unexpected fetch ${url}`);
  }));
}

describe("completeOAuthCallback", () => {
  it("returns denied when Google reports an error (user refused consent)", async () => {
    expect(await completeOAuthCallback({ error: "access_denied" })).toBe("denied");
  });

  it("returns error when the code or state is missing", async () => {
    expect(await completeOAuthCallback({ code: "abc" })).toBe("error");
    expect(await completeOAuthCallback({ state: "abc" })).toBe("error");
    expect(await completeOAuthCallback({})).toBe("error");
  });

  it("returns error for an invalid state (forged or expired)", async () => {
    stubTokenEndpoint({ access_token: "at", refresh_token: "rt" });
    expect(await completeOAuthCallback({ code: "abc", state: "forged.state" })).toBe("error");
    expect(dbState.upserts.length).toBe(0);
  });

  it("stores an ENCRYPTED refresh token on success and never the plaintext", async () => {
    const state = await signState({ u: "user-1", p: "proj-1" });
    stubTokenEndpoint({ access_token: "at", refresh_token: "plain-refresh-token", expires_in: 3600, scope: GSC_DEFAULT_SCOPE });
    expect(await completeOAuthCallback({ code: "auth-code", state })).toBe("connected");
    expect(dbState.upserts.length).toBe(1);
    const row = dbState.upserts[0];
    const stored = String(row.encrypted_refresh_token);
    expect(stored.startsWith("v1.")).toBe(true);
    expect(stored).not.toContain("plain-refresh-token");
    expect(row.revoked_at).toBeNull();
  });

  it("returns error when Google does not return a refresh token", async () => {
    const state = await signState({ u: "user-1", p: "proj-1" });
    stubTokenEndpoint({ access_token: "at" });
    expect(await completeOAuthCallback({ code: "auth-code", state })).toBe("error");
    expect(dbState.upserts.length).toBe(0);
  });

  it("returns error when the token exchange fails (e.g. invalid_grant)", async () => {
    const state = await signState({ u: "user-1", p: "proj-1" });
    stubTokenEndpoint({ error: "invalid_grant" }, 400);
    expect(await completeOAuthCallback({ code: "used-code", state })).toBe("error");
  });
});

describe("saveConnection refresh-token preservation", () => {
  it("does not touch the stored refresh token when Google returned none", async () => {
    await saveConnection({ userId: "user-1", expiresInSec: 3600 });
    expect(dbState.upserts.length).toBe(1);
    expect("encrypted_refresh_token" in dbState.upserts[0]).toBe(false);
  });
});

describe("listSites", () => {
  async function connectUser() {
    dbState.row = {
      user_id: "user-1",
      workspace_id: "user-1",
      provider: "google_search_console",
      google_account_email: "user@example.com",
      encrypted_refresh_token: await encryptSecret("stored-refresh"),
      access_token_expires_at: null,
      scope: GSC_DEFAULT_SCOPE,
      revoked_at: null,
    };
  }

  it("returns Domain and URL-prefix properties", async () => {
    await connectUser();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "at", expires_in: 3600 }), { status: 200 });
      }
      if (url === "https://www.googleapis.com/webmasters/v3/sites") {
        return new Response(
          JSON.stringify({ siteEntry: [
            { siteUrl: "sc-domain:butelkiwodorowe.pl", permissionLevel: "siteOwner" },
            { siteUrl: "https://butelkiwodorowe.pl/", permissionLevel: "siteOwner" },
          ] }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch ${url}`);
    }));
    const sites = await listSites("user-1");
    expect(sites.map((s) => s.siteUrl)).toEqual(["sc-domain:butelkiwodorowe.pl", "https://butelkiwodorowe.pl/"]);
  });

  it("maps 401/403 to the reconnect-needed 'expired' error", async () => {
    await connectUser();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "at" }), { status: 200 });
      }
      return new Response("{}", { status: 401 });
    }));
    await expect(listSites("user-1")).rejects.toThrow("expired");
  });

  it("throws not_connected when no connection exists", async () => {
    dbState.row = null;
    await expect(listSites("user-1")).rejects.toThrow("not_connected");
  });

  it("throws expired when the refresh grant itself is rejected (revoked consent)", async () => {
    await connectUser();
    stubTokenEndpoint({ error: "invalid_grant" }, 400);
    await expect(listSites("user-1")).rejects.toThrow("expired");
  });
});
