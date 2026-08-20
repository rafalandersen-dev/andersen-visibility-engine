/**
 * Regression tests for the OAuth pure/injectable helpers in oauth.server.ts.
 *
 * Locked-in behavior: read-only resource scopes, PKCE S256, single-use codes,
 * uniform invalid_grant responses — and, since Phase 0 commit 6, refresh
 * tokens: offline_access is a real issuable scope, the token endpoint supports
 * refresh_token with rotation + reuse detection, and revocation is
 * family-aware. DB helpers are exercised via their injected-dependency
 * variants only — no database, no network.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  OAUTH_BASE_URL,
  MCP_RESOURCE_URL,
  PROTECTED_RESOURCE_METADATA_URL,
  OAUTH_SCOPES,
  OAUTH_ISSUABLE_SCOPES,
  OFFLINE_ACCESS_SCOPE,
  MCP_WRITE_SCOPES,
  MCP_PUBLISH_SCOPE,
  issuableScopes,
  isWriteToolsEnabled,
  scopeKind,
  CLIENT_ID_PREFIX,
  ACCESS_TOKEN_PREFIX,
  ACCESS_TOKEN_TTL_MS,
  REFRESH_TOKEN_PREFIX,
  REFRESH_TOKEN_TTL_MS,
  AUTH_CODE_TTL_MS,
  isOAuthEnabled,
  protectedResourceMetadata,
  authorizationServerMetadata,
  mcpWwwAuthenticate,
  randomToken,
  sha256Hex,
  generateClientId,
  parseScopes,
  isAllowedScope,
  validateScopes,
  validateRedirectUri,
  oauthErrorBody,
  validateRegistration,
  buildClientRow,
  registrationResponse,
  processClientRegistration,
  validateAccessTokenRow,
  classifyAuthorizeRequest,
  buildRedirectError,
  buildCodeRedirect,
  consentRedirectPath,
  buildPendingRequestRow,
  buildAuthCodeRow,
  issueAuthorizationCode,
  pkceChallengeS256,
  verifyPkceS256,
  buildAccessTokenRow,
  tokenSuccessResponse,
  processTokenRequest,
  SCOPE_LABELS,
  scopeConsentItems,
  classifyConsentRequest,
  buildDenyRedirect,
  processRevocationRequest,
  buildConnectedApps,
  RATE_BUCKETS,
  rateWindowStart,
  rateLimitKey,
  checkRateLimit,
  type RateLimitDeps,
  type AuthorizeParams,
  type TokenParams,
  type TokenDeps,
  type RevocationDeps,
  type RevokedTokenInfo,
  type TokenGrantRow,
  type ConsentRow,
} from "./oauth.server";

const NOW = 1_700_000_000_000;
const READ_SCOPES = [
  "milo.projects.read",
  "milo.content.read",
  "milo.insights.read",
  "milo.authority.read",
];
const ISSUABLE_SCOPES = [...READ_SCOPES, "offline_access"];
const CALLBACK = "https://claude.ai/api/mcp/auth_callback";

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Flag + metadata
// ---------------------------------------------------------------------------

describe("isOAuthEnabled", () => {
  it("is true only for (trimmed, case-insensitive) 'true'", () => {
    vi.stubEnv("MCP_OAUTH_ENABLED", "true");
    expect(isOAuthEnabled()).toBe(true);
    vi.stubEnv("MCP_OAUTH_ENABLED", " TRUE ");
    expect(isOAuthEnabled()).toBe(true);
  });
  it("is false when unset, empty, or any other value", () => {
    vi.stubEnv("MCP_OAUTH_ENABLED", "");
    expect(isOAuthEnabled()).toBe(false);
    vi.stubEnv("MCP_OAUTH_ENABLED", "false");
    expect(isOAuthEnabled()).toBe(false);
    vi.stubEnv("MCP_OAUTH_ENABLED", "1");
    expect(isOAuthEnabled()).toBe(false);
  });
});

describe("protectedResourceMetadata (RFC 9728)", () => {
  const prm = protectedResourceMetadata();
  it("binds the MCP resource and authorization server", () => {
    expect(prm.resource).toBe("https://milogrowth.com/api/mcp");
    expect(prm.authorization_servers).toEqual(["https://milogrowth.com"]);
    expect(prm.bearer_methods_supported).toEqual(["header"]);
  });
  it("advertises exactly the 4 read scopes — no offline_access, no writes", () => {
    expect(prm.scopes_supported).toEqual(READ_SCOPES);
  });
});

describe("authorizationServerMetadata (RFC 8414)", () => {
  const as = authorizationServerMetadata();
  it("has the expected issuer and endpoints", () => {
    expect(as.issuer).toBe(OAUTH_BASE_URL);
    expect(as.authorization_endpoint).toBe(`${OAUTH_BASE_URL}/api/oauth/authorize`);
    expect(as.token_endpoint).toBe(`${OAUTH_BASE_URL}/api/oauth/token`);
    expect(as.registration_endpoint).toBe(`${OAUTH_BASE_URL}/api/oauth/register`);
    expect(as.revocation_endpoint).toBe(`${OAUTH_BASE_URL}/api/oauth/revoke`);
  });
  // Flipped by commit 6 (refresh tokens): refresh_token grant + offline_access.
  it("advertises authorization_code AND refresh_token, response type code only", () => {
    expect(as.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
    expect(as.response_types_supported).toEqual(["code"]);
  });
  it("advertises the 4 read scopes plus offline_access, S256, and public clients only", () => {
    expect(as.scopes_supported).toEqual(ISSUABLE_SCOPES);
    expect(as.code_challenge_methods_supported).toEqual(["S256"]);
    expect(as.token_endpoint_auth_methods_supported).toEqual(["none"]);
  });
});

describe("mcpWwwAuthenticate", () => {
  it("points at protected-resource metadata when enabled", () => {
    expect(mcpWwwAuthenticate(true)).toBe(
      `Bearer resource_metadata="${PROTECTED_RESOURCE_METADATA_URL}"`,
    );
  });
  it("stays a plain Bearer challenge when disabled", () => {
    expect(mcpWwwAuthenticate(false)).toBe("Bearer");
  });
});

// ---------------------------------------------------------------------------
// Crypto primitives
// ---------------------------------------------------------------------------

describe("sha256Hex", () => {
  it("matches the known SHA-256 vector for 'abc'", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("randomToken / generateClientId", () => {
  it("uses the prefix and url-safe base64 alphabet", () => {
    const t = randomToken(ACCESS_TOKEN_PREFIX);
    expect(t.startsWith(ACCESS_TOKEN_PREFIX)).toBe(true);
    expect(t.slice(ACCESS_TOKEN_PREFIX.length)).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(generateClientId().startsWith(CLIENT_ID_PREFIX)).toBe(true);
  });
  it("is unique across calls", () => {
    expect(randomToken()).not.toBe(randomToken());
  });
});

describe("PKCE S256 (RFC 7636)", () => {
  const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  it("computes the appendix-B challenge from the verifier", async () => {
    expect(await pkceChallengeS256(VERIFIER)).toBe(CHALLENGE);
  });
  it("verifies a matching pair and rejects everything else", async () => {
    expect(await verifyPkceS256(VERIFIER, CHALLENGE)).toBe(true);
    expect(await verifyPkceS256(`${VERIFIER}x`, CHALLENGE)).toBe(false);
    expect(await verifyPkceS256(VERIFIER, `${CHALLENGE}x`)).toBe(false);
    expect(await verifyPkceS256("", CHALLENGE)).toBe(false);
    expect(await verifyPkceS256(VERIFIER, "")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

describe("parseScopes", () => {
  it("splits on whitespace, trims, dedupes", () => {
    expect(parseScopes("a  b\ta a")).toEqual(["a", "b"]);
  });
  it("returns [] for non-strings", () => {
    expect(parseScopes(undefined)).toEqual([]);
    expect(parseScopes(42)).toEqual([]);
  });
});

describe("scope validation", () => {
  it("accepts the 4 read scopes + offline_access and nothing write-shaped", () => {
    for (const s of READ_SCOPES) expect(isAllowedScope(s)).toBe(true);
    expect(isAllowedScope(OFFLINE_ACCESS_SCOPE)).toBe(true); // flipped by commit 6
    expect(isAllowedScope("milo.projects.write")).toBe(false);
  });
  // Flipped by commit 6: offline_access is a real, kept scope now.
  it("preserves offline_access in the effective set", () => {
    const v = validateScopes(["milo.projects.read", "offline_access"]);
    expect(v).toEqual({ ok: true, scopes: ["milo.projects.read", "offline_access"] });
  });
  it("fails unknown scopes and reports them", () => {
    const v = validateScopes(["milo.projects.read", "milo.content.write", "bogus"]);
    expect(v).toEqual({ ok: false, invalid: ["milo.content.write", "bogus"] });
  });
  it("passes the full issuable set through unchanged", () => {
    expect(validateScopes([...OAUTH_ISSUABLE_SCOPES])).toEqual({
      ok: true,
      scopes: ISSUABLE_SCOPES,
    });
  });
});

// ---------------------------------------------------------------------------
// Redirect URIs
// ---------------------------------------------------------------------------

describe("validateRedirectUri", () => {
  it("accepts https URLs", () => {
    expect(validateRedirectUri(CALLBACK)).toBe(true);
  });
  it("accepts http only on loopback hosts (local testing)", () => {
    expect(validateRedirectUri("http://localhost:8765/callback")).toBe(true);
    expect(validateRedirectUri("http://127.0.0.1/cb")).toBe(true);
    expect(validateRedirectUri("http://[::1]:9/cb")).toBe(true);
    expect(validateRedirectUri("http://example.com/cb")).toBe(false);
  });
  it("rejects fragments, non-URLs, empty and non-strings", () => {
    expect(validateRedirectUri("https://claude.ai/cb#frag")).toBe(false);
    expect(validateRedirectUri("not a url")).toBe(false);
    expect(validateRedirectUri("")).toBe(false);
    expect(validateRedirectUri(undefined)).toBe(false);
    expect(validateRedirectUri("ftp://claude.ai/cb")).toBe(false);
  });
});

describe("oauthErrorBody", () => {
  it("includes error_description only when given", () => {
    expect(oauthErrorBody("invalid_request")).toEqual({ error: "invalid_request" });
    expect(oauthErrorBody("invalid_request", "why")).toEqual({
      error: "invalid_request",
      error_description: "why",
    });
  });
});

// ---------------------------------------------------------------------------
// Dynamic Client Registration (RFC 7591)
// ---------------------------------------------------------------------------

describe("validateRegistration", () => {
  it("accepts a minimal Claude-style request and applies public-client defaults", () => {
    const v = validateRegistration({ redirect_uris: [CALLBACK], client_name: "Claude" });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.normalized).toEqual({
      redirect_uris: [CALLBACK],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      // Commit 6: default registration scope includes offline_access.
      scope: ISSUABLE_SCOPES.join(" "),
      client_name: "Claude",
      software_id: undefined,
    });
  });
  it("requires a non-empty redirect_uris array of valid URIs (max 10)", () => {
    expect(validateRegistration({}).ok).toBe(false);
    expect(validateRegistration({ redirect_uris: [] }).ok).toBe(false);
    expect(validateRegistration({ redirect_uris: ["http://example.com/cb"] }).ok).toBe(false);
    expect(
      validateRegistration({
        redirect_uris: Array.from({ length: 11 }, (_, i) => `https://a.example/${i}`),
      }).ok,
    ).toBe(false);
    expect(validateRegistration(null).ok).toBe(false);
    expect(validateRegistration([CALLBACK]).ok).toBe(false);
  });
  it("supports public clients only", () => {
    const v = validateRegistration({
      redirect_uris: [CALLBACK],
      token_endpoint_auth_method: "client_secret_basic",
    });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.body.error).toBe("invalid_client_metadata");
  });
  it("tolerates refresh_token in grant_types but rejects unknown grants and missing authorization_code", () => {
    expect(
      validateRegistration({
        redirect_uris: [CALLBACK],
        grant_types: ["authorization_code", "refresh_token"],
      }).ok,
    ).toBe(true);
    expect(validateRegistration({ redirect_uris: [CALLBACK], grant_types: ["implicit"] }).ok).toBe(
      false,
    );
    expect(
      validateRegistration({ redirect_uris: [CALLBACK], grant_types: ["refresh_token"] }).ok,
    ).toBe(false);
  });
  it("rejects response_types beyond code", () => {
    expect(validateRegistration({ redirect_uris: [CALLBACK], response_types: ["token"] }).ok).toBe(
      false,
    );
    expect(validateRegistration({ redirect_uris: [CALLBACK], response_types: [] }).ok).toBe(false);
  });
  it("defaults scope to the issuable set; keeps offline_access; rejects unknown scopes", () => {
    const dflt = validateRegistration({ redirect_uris: [CALLBACK], scope: "" });
    expect(dflt.ok && dflt.normalized.scope).toBe(ISSUABLE_SCOPES.join(" "));
    // Flipped by commit 6: offline_access is preserved, not stripped.
    const kept = validateRegistration({
      redirect_uris: [CALLBACK],
      scope: "milo.projects.read offline_access",
    });
    expect(kept.ok && kept.normalized.scope).toBe("milo.projects.read offline_access");
    const bad = validateRegistration({ redirect_uris: [CALLBACK], scope: "milo.projects.write" });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.body.error).toBe("invalid_scope");
  });
  it("truncates client_name at 200 chars", () => {
    const v = validateRegistration({ redirect_uris: [CALLBACK], client_name: "x".repeat(300) });
    expect(v.ok && v.normalized.client_name?.length).toBe(200);
  });
});

describe("buildClientRow / registrationResponse", () => {
  const v = validateRegistration({ redirect_uris: [CALLBACK], client_name: "Claude" });
  if (!v.ok) throw new Error("fixture should validate");
  it("never stores or returns a client secret (public client)", () => {
    const row = buildClientRow("milo_client_x", v.normalized, new Date(NOW).toISOString());
    expect(row.client_secret_hash).toBeNull();
    const resp = registrationResponse("milo_client_x", v.normalized, Math.floor(NOW / 1000));
    expect(resp).not.toHaveProperty("client_secret");
    expect(resp.client_id).toBe("milo_client_x");
    expect(resp.client_id_issued_at).toBe(Math.floor(NOW / 1000));
    expect(resp.token_endpoint_auth_method).toBe("none");
  });
});

describe("processClientRegistration", () => {
  it("returns 404 not_found when the flag is off", async () => {
    const insertClient = vi.fn();
    const r = await processClientRegistration(
      false,
      { redirect_uris: [CALLBACK] },
      { insertClient, clientId: "c", nowMs: NOW },
    );
    expect(r).toEqual({ status: 404, body: { error: "not_found" } });
    expect(insertClient).not.toHaveBeenCalled();
  });
  it("persists and returns 201 for a valid request", async () => {
    const insertClient = vi.fn().mockResolvedValue(undefined);
    const r = await processClientRegistration(
      true,
      { redirect_uris: [CALLBACK], client_name: "Claude" },
      { insertClient, clientId: "milo_client_t", nowMs: NOW },
    );
    expect(r.status).toBe(201);
    expect(r.body.client_id).toBe("milo_client_t");
    expect(insertClient).toHaveBeenCalledOnce();
  });
  it("surfaces validation failures without persisting", async () => {
    const insertClient = vi.fn();
    const r = await processClientRegistration(
      true,
      { redirect_uris: ["bad"] },
      { insertClient, clientId: "c", nowMs: NOW },
    );
    expect(r.status).toBe(400);
    expect(insertClient).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Authorize request classification
// ---------------------------------------------------------------------------

describe("classifyAuthorizeRequest", () => {
  const client = { redirect_uris: [CALLBACK], scope: READ_SCOPES.join(" "), disabled_at: null };
  const good: AuthorizeParams = {
    response_type: "code",
    client_id: "milo_client_t",
    redirect_uri: CALLBACK,
    scope: READ_SCOPES.join(" "),
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256",
    resource: MCP_RESOURCE_URL,
    state: "xyz",
  };

  it("never redirects for unknown/disabled clients or untrusted redirect_uris", () => {
    expect(classifyAuthorizeRequest(good, null)).toEqual({ kind: "invalid_client" });
    expect(classifyAuthorizeRequest(good, { ...client, disabled_at: "2026-01-01" })).toEqual({
      kind: "invalid_client",
    });
    expect(classifyAuthorizeRequest({ ...good, client_id: undefined }, client)).toEqual({
      kind: "invalid_client",
    });
    expect(
      classifyAuthorizeRequest({ ...good, redirect_uri: "https://evil.example/cb" }, client),
    ).toEqual({ kind: "invalid_redirect" });
    expect(classifyAuthorizeRequest({ ...good, redirect_uri: undefined }, client)).toEqual({
      kind: "invalid_redirect",
    });
  });
  it("redirect-errors on bad response_type / missing PKCE / non-S256", () => {
    const rt = classifyAuthorizeRequest({ ...good, response_type: "token" }, client);
    expect(rt.kind === "redirect_error" && rt.error).toBe("unsupported_response_type");
    const nc = classifyAuthorizeRequest({ ...good, code_challenge: "" }, client);
    expect(nc.kind === "redirect_error" && nc.error).toBe("invalid_request");
    const pm = classifyAuthorizeRequest({ ...good, code_challenge_method: "plain" }, client);
    expect(pm.kind === "redirect_error" && pm.error).toBe("invalid_request");
  });
  it("requires resource (when present) to equal the MCP URL, and defaults it when omitted", () => {
    const bad = classifyAuthorizeRequest(
      { ...good, resource: "https://other.example/api" },
      client,
    );
    expect(bad.kind === "redirect_error" && bad.error).toBe("invalid_target");
    const omitted = classifyAuthorizeRequest({ ...good, resource: undefined }, client);
    expect(omitted.kind === "ok" && omitted.normalized.resource).toBe(MCP_RESOURCE_URL);
  });
  it("redirect-errors unknown scopes and keeps offline_access in valid ones", () => {
    const bad = classifyAuthorizeRequest({ ...good, scope: "milo.projects.write" }, client);
    expect(bad.kind === "redirect_error" && bad.error).toBe("invalid_scope");
    // Flipped by commit 6: offline_access is preserved, not stripped.
    const kept = classifyAuthorizeRequest(
      { ...good, scope: "milo.projects.read offline_access" },
      client,
    );
    expect(kept.kind === "ok" && kept.normalized.scope).toBe("milo.projects.read offline_access");
  });
  it("defaults omitted scope to the client's registered scope (or all issuable)", () => {
    const fromClient = classifyAuthorizeRequest(
      { ...good, scope: undefined },
      { ...client, scope: "milo.projects.read" },
    );
    expect(fromClient.kind === "ok" && fromClient.normalized.scope).toBe("milo.projects.read");
    const all = classifyAuthorizeRequest({ ...good, scope: undefined }, { ...client, scope: null });
    expect(all.kind === "ok" && all.normalized.scope).toBe(ISSUABLE_SCOPES.join(" "));
  });
  it("returns the normalized request with state preserved on success", () => {
    const ok = classifyAuthorizeRequest(good, client);
    expect(ok).toEqual({
      kind: "ok",
      normalized: {
        clientId: "milo_client_t",
        redirectUri: CALLBACK,
        scope: READ_SCOPES.join(" "),
        codeChallenge: good.code_challenge,
        codeChallengeMethod: "S256",
        resource: MCP_RESOURCE_URL,
        state: "xyz",
      },
    });
  });
});

describe("redirect builders", () => {
  it("appends error (+state) to a trusted redirect_uri", () => {
    const u = new URL(buildRedirectError(CALLBACK, "invalid_scope", "bad scope", "s1"));
    expect(u.searchParams.get("error")).toBe("invalid_scope");
    expect(u.searchParams.get("error_description")).toBe("bad scope");
    expect(u.searchParams.get("state")).toBe("s1");
  });
  it("appends code (+state)", () => {
    const u = new URL(buildCodeRedirect(CALLBACK, "thecode", "s1"));
    expect(u.searchParams.get("code")).toBe("thecode");
    expect(u.searchParams.get("state")).toBe("s1");
  });
  it("buildDenyRedirect emits access_denied without a description", () => {
    const u = new URL(buildDenyRedirect(CALLBACK, "s1"));
    expect(u.searchParams.get("error")).toBe("access_denied");
    expect(u.searchParams.get("error_description")).toBeNull();
    expect(u.searchParams.get("state")).toBe("s1");
  });
  it("consentRedirectPath encodes the request id", () => {
    expect(consentRedirectPath("a b/c")).toBe("/app/connect?req=a%20b%2Fc");
  });
});

// ---------------------------------------------------------------------------
// Pending request → authorization code issuance
// ---------------------------------------------------------------------------

describe("issueAuthorizationCode", () => {
  const pending = {
    id: "req1",
    client_id: "milo_client_t",
    redirect_uri: CALLBACK,
    scope: READ_SCOPES.join(" "),
    code_challenge: "chal",
    code_challenge_method: "S256",
    resource: MCP_RESOURCE_URL,
    state: "xyz",
    expires_at: new Date(NOW + 60_000).toISOString(),
    consumed_at: null,
  };
  const makeDeps = (row: Record<string, unknown> | null) => {
    const calls: string[] = [];
    const inserted: Record<string, unknown>[] = [];
    return {
      calls,
      inserted,
      deps: {
        loadRequest: async () => row,
        consumeRequest: async () => {
          calls.push("consume");
        },
        insertCode: async (r: Record<string, unknown>) => {
          calls.push("insert");
          inserted.push(r);
        },
        generateCode: () => "plaincode",
        hash: sha256Hex,
        nowMs: NOW,
      },
    };
  };

  it("fails closed for missing user, unknown, consumed, or expired requests", async () => {
    const { deps } = makeDeps(pending);
    expect(await issueAuthorizationCode("req1", "", deps)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await issueAuthorizationCode("req1", "user1", makeDeps(null).deps)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(
      await issueAuthorizationCode(
        "req1",
        "user1",
        makeDeps({ ...pending, consumed_at: "2026-01-01" }).deps,
      ),
    ).toEqual({ ok: false, reason: "already_used" });
    expect(
      await issueAuthorizationCode(
        "req1",
        "user1",
        makeDeps({ ...pending, expires_at: new Date(NOW - 1).toISOString() }).deps,
      ),
    ).toEqual({ ok: false, reason: "expired" });
  });
  it("consumes the request BEFORE minting the code (race safety) and stores only the hash", async () => {
    const { deps, calls, inserted } = makeDeps(pending);
    const r = await issueAuthorizationCode("req1", "user1", deps);
    expect(r.ok).toBe(true);
    expect(calls).toEqual(["consume", "insert"]);
    const row = inserted[0];
    expect(row.code_hash).toBe(await sha256Hex("plaincode"));
    expect(row.user_id).toBe("user1");
    expect(JSON.stringify(row)).not.toContain("plaincode");
    expect(row.expires_at).toBe(new Date(NOW + AUTH_CODE_TTL_MS).toISOString());
    if (!r.ok) return;
    const u = new URL(r.redirectUrl);
    expect(u.origin + u.pathname).toBe(CALLBACK);
    expect(u.searchParams.get("code")).toBe("plaincode");
    expect(u.searchParams.get("state")).toBe("xyz");
  });
});

describe("buildPendingRequestRow / buildAuthCodeRow shapes", () => {
  it("builds the pending-request row from a normalized authorize request", () => {
    const row = buildPendingRequestRow(
      {
        clientId: "c",
        redirectUri: CALLBACK,
        scope: "s",
        codeChallenge: "ch",
        codeChallengeMethod: "S256",
        resource: MCP_RESOURCE_URL,
        state: undefined,
      },
      "id1",
      "2026-01-01T00:00:00.000Z",
    );
    expect(row).toEqual({
      id: "id1",
      client_id: "c",
      redirect_uri: CALLBACK,
      scope: "s",
      code_challenge: "ch",
      code_challenge_method: "S256",
      resource: MCP_RESOURCE_URL,
      state: null,
      expires_at: "2026-01-01T00:00:00.000Z",
    });
  });
  it("binds the code row to client + redirect + challenge + resource", () => {
    const row = buildAuthCodeRow(
      {
        client_id: "c",
        redirect_uri: CALLBACK,
        scope: "s",
        code_challenge: "ch",
        code_challenge_method: "S256",
        resource: MCP_RESOURCE_URL,
      },
      "user1",
      "hash1",
      "2026-01-01T00:00:00.000Z",
    );
    expect(row.client_id).toBe("c");
    expect(row.redirect_uri).toBe(CALLBACK);
    expect(row.code_challenge).toBe("ch");
    expect(row.resource).toBe(MCP_RESOURCE_URL);
    expect(row.user_id).toBe("user1");
    expect(row.code_hash).toBe("hash1");
  });
});

// ---------------------------------------------------------------------------
// Token endpoint (authorization_code + PKCE; refresh_token since commit 6)
// ---------------------------------------------------------------------------

const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

const codeRow = {
  code_hash: "",
  client_id: "milo_client_t",
  user_id: "user1",
  redirect_uri: CALLBACK,
  scope: READ_SCOPES.join(" "),
  code_challenge: CHALLENGE,
  code_challenge_method: "S256",
  resource: MCP_RESOURCE_URL,
  expires_at: new Date(NOW + 60_000).toISOString(),
  consumed_at: null,
};
const clientRow = {
  client_id: "milo_client_t",
  client_name: "Claude",
  redirect_uris: [CALLBACK],
  scope: READ_SCOPES.join(" "),
  disabled_at: null as string | null,
};
const goodParams: TokenParams = {
  grant_type: "authorization_code",
  client_id: "milo_client_t",
  code: "plaincode",
  redirect_uri: CALLBACK,
  code_verifier: VERIFIER,
  resource: MCP_RESOURCE_URL,
};

/** A live refresh-token row as stored (hash-only) for refresh-grant tests. */
const refreshRow = {
  user_id: "user1",
  client_id: "milo_client_t",
  scope: `${READ_SCOPES.join(" ")} offline_access`,
  resource: MCP_RESOURCE_URL,
  refresh_family_id: "family-1",
  refresh_expires_at: new Date(NOW + 10 * 24 * 3600 * 1000).toISOString(),
  rotated_at: null as string | null,
  revoked_at: null as string | null,
};

interface DepsOverrides {
  code?: Record<string, unknown> | null;
  client?: typeof clientRow | null;
  refresh?: Record<string, unknown> | null;
  consumeWins?: boolean;
}

function makeDeps(overrides: DepsOverrides = {}) {
  const calls: string[] = [];
  const insertedTokens: Record<string, unknown>[] = [];
  const familyRevokes: string[] = [];
  const deps: TokenDeps = {
    getClient: async () => (overrides.client === undefined ? clientRow : overrides.client),
    getCodeByHash: async () => (overrides.code === undefined ? { ...codeRow } : overrides.code),
    consumeCode: async () => {
      calls.push("consumeCode");
    },
    insertToken: async (row) => {
      calls.push("insertToken");
      insertedTokens.push(row);
    },
    hash: sha256Hex,
    generateToken: () => `${ACCESS_TOKEN_PREFIX}testtoken`,
    generateRefreshToken: () => `${REFRESH_TOKEN_PREFIX}newrefresh`,
    generateFamilyId: () => "family-new",
    getTokenByRefreshHash: async () => (overrides.refresh === undefined ? null : overrides.refresh),
    consumeRefreshToken: async () => {
      calls.push("consumeRefresh");
      return overrides.consumeWins ?? true;
    },
    revokeFamily: async (familyId) => {
      calls.push("revokeFamily");
      familyRevokes.push(familyId);
      return 3;
    },
    nowMs: NOW,
  };
  return { deps, calls, insertedTokens, familyRevokes };
}

const body = (r: { body: Record<string, unknown> | null }) => r.body as Record<string, unknown>;

describe("processTokenRequest — authorization_code", () => {
  it("returns 404 not_found when the flag is off", async () => {
    const { deps } = makeDeps();
    expect(await processTokenRequest(false, goodParams, deps)).toEqual({
      status: 404,
      body: { error: "not_found" },
    });
  });
  it("rejects missing params and unknown grants", async () => {
    const { deps } = makeDeps();
    expect(body(await processTokenRequest(true, {}, deps)).error).toBe("invalid_request");
    expect(
      body(
        await processTokenRequest(true, { ...goodParams, grant_type: "client_credentials" }, deps),
      ).error,
    ).toBe("unsupported_grant_type");
    for (const missing of ["client_id", "code", "redirect_uri", "code_verifier"] as const) {
      const p = { ...goodParams, [missing]: undefined };
      expect(body(await processTokenRequest(true, p, deps)).error).toBe("invalid_request");
    }
  });
  it("rejects a client secret from a public client with 401", async () => {
    const { deps } = makeDeps();
    const r = await processTokenRequest(true, { ...goodParams, client_secret: "s3cret" }, deps);
    expect(r.status).toBe(401);
    expect(body(r).error).toBe("invalid_client");
  });
  it("rejects a mismatched resource; tolerates an omitted one", async () => {
    const { deps } = makeDeps();
    expect(
      body(
        await processTokenRequest(true, { ...goodParams, resource: "https://other.example" }, deps),
      ).error,
    ).toBe("invalid_target");
    const ok = await processTokenRequest(
      true,
      { ...goodParams, resource: undefined },
      makeDeps().deps,
    );
    expect(ok.status).toBe(200);
  });
  it("rejects unknown or disabled clients with 401", async () => {
    expect(
      (await processTokenRequest(true, goodParams, makeDeps({ client: null }).deps)).status,
    ).toBe(401);
    expect(
      (
        await processTokenRequest(
          true,
          goodParams,
          makeDeps({ client: { ...clientRow, disabled_at: "2026-01-01" } }).deps,
        )
      ).status,
    ).toBe(401);
  });
  it("returns a uniform invalid_grant for unknown/consumed/expired/mismatched codes", async () => {
    const cases: (Record<string, unknown> | null)[] = [
      null,
      { ...codeRow, consumed_at: "2026-01-01" },
      { ...codeRow, expires_at: new Date(NOW - 1).toISOString() },
      { ...codeRow, client_id: "other_client" },
      { ...codeRow, redirect_uri: "https://other.example/cb" },
    ];
    for (const code of cases) {
      const r = await processTokenRequest(true, goodParams, makeDeps({ code }).deps);
      expect(r.status).toBe(400);
      expect(body(r).error).toBe("invalid_grant");
    }
  });
  it("fails PKCE verification with a wrong verifier", async () => {
    const r = await processTokenRequest(
      true,
      { ...goodParams, code_verifier: `${VERIFIER}x` },
      makeDeps().deps,
    );
    expect(body(r).error).toBe("invalid_grant");
  });
  it("without offline_access: access token only, NO refresh token", async () => {
    const { deps, calls, insertedTokens } = makeDeps(); // codeRow scope = 4 reads only
    const r = await processTokenRequest(true, goodParams, deps);
    expect(r.status).toBe(200);
    expect(body(r).token_type).toBe("Bearer");
    expect(body(r).expires_in).toBe(3600);
    expect(body(r).access_token).toBe(`${ACCESS_TOKEN_PREFIX}testtoken`);
    expect(body(r).scope).toBe(READ_SCOPES.join(" "));
    expect(body(r)).not.toHaveProperty("refresh_token");
    expect(calls).toEqual(["consumeCode", "insertToken"]);
    const row = insertedTokens[0];
    expect(row.access_token_hash).toBe(await sha256Hex(`${ACCESS_TOKEN_PREFIX}testtoken`));
    expect(row.refresh_token_hash).toBeNull();
    expect(row.refresh_family_id).toBeNull();
    expect(row.access_expires_at).toBe(new Date(NOW + ACCESS_TOKEN_TTL_MS).toISOString());
    expect(JSON.stringify(row)).not.toContain("testtoken");
    expect(r.audit).toEqual({
      event: "token_issued",
      clientId: "milo_client_t",
      userId: "user1",
      detail: { scope: READ_SCOPES.join(" ") },
    });
  });
  // Flipped by commit 6: offline_access is kept and drives refresh issuance.
  it("with offline_access: keeps the scope and issues a refresh token (hash-only, new family, 30d)", async () => {
    const scoped = `${READ_SCOPES.join(" ")} offline_access`;
    const { deps, insertedTokens } = makeDeps({ code: { ...codeRow, scope: scoped } });
    const r = await processTokenRequest(true, goodParams, deps);
    expect(r.status).toBe(200);
    expect(body(r).scope).toBe(scoped);
    expect(body(r).refresh_token).toBe(`${REFRESH_TOKEN_PREFIX}newrefresh`);
    const row = insertedTokens[0];
    expect(row.refresh_token_hash).toBe(await sha256Hex(`${REFRESH_TOKEN_PREFIX}newrefresh`));
    expect(row.refresh_family_id).toBe("family-new");
    expect(row.refresh_expires_at).toBe(new Date(NOW + REFRESH_TOKEN_TTL_MS).toISOString());
    expect(JSON.stringify(row)).not.toContain("newrefresh"); // plaintext never stored
  });
});

describe("processTokenRequest — refresh_token grant (rotation + reuse detection)", () => {
  const refreshParams: TokenParams = {
    grant_type: "refresh_token",
    client_id: "milo_client_t",
    refresh_token: "milo_rt_oldrefresh",
  };

  it("requires the refresh_token param", async () => {
    const r = await processTokenRequest(
      true,
      { ...refreshParams, refresh_token: undefined },
      makeDeps().deps,
    );
    expect(body(r).error).toBe("invalid_request");
  });
  it("happy rotation: consumes the old token, issues a new pair, preserves the grant", async () => {
    const { deps, calls, insertedTokens } = makeDeps({ refresh: { ...refreshRow } });
    const r = await processTokenRequest(true, refreshParams, deps);
    expect(r.status).toBe(200);
    expect(body(r).access_token).toBe(`${ACCESS_TOKEN_PREFIX}testtoken`);
    expect(body(r).refresh_token).toBe(`${REFRESH_TOKEN_PREFIX}newrefresh`);
    expect(body(r).expires_in).toBe(3600);
    expect(body(r).scope).toBe(refreshRow.scope);
    expect(calls).toEqual(["consumeRefresh", "insertToken"]); // consume BEFORE issue
    const row = insertedTokens[0];
    expect(row.user_id).toBe("user1");
    expect(row.client_id).toBe("milo_client_t");
    expect(row.resource).toBe(MCP_RESOURCE_URL);
    expect(row.scope).toBe(refreshRow.scope);
    expect(row.refresh_family_id).toBe("family-1"); // family preserved, not new
    expect(row.refresh_expires_at).toBe(new Date(NOW + REFRESH_TOKEN_TTL_MS).toISOString());
    expect(JSON.stringify(row)).not.toContain("oldrefresh");
    expect(JSON.stringify(row)).not.toContain("newrefresh");
    expect(r.audit?.event).toBe("token_refreshed");
    expect(r.audit?.detail).toEqual({ scope: refreshRow.scope });
    expect(JSON.stringify(r.audit)).not.toContain("refresh_token");
  });
  it("REUSE: an already-rotated token revokes the whole family", async () => {
    const { deps, familyRevokes } = makeDeps({
      refresh: { ...refreshRow, rotated_at: "2026-07-08T00:00:00Z" },
    });
    const r = await processTokenRequest(true, refreshParams, deps);
    expect(r.status).toBe(400);
    expect(body(r).error).toBe("invalid_grant");
    expect(familyRevokes).toEqual(["family-1"]);
    expect(r.audit).toEqual({
      event: "token_reuse_detected",
      clientId: "milo_client_t",
      userId: "user1",
      detail: { familySize: 3 },
    });
    expect(JSON.stringify(r.audit)).not.toContain("family-1"); // family id never audited
  });
  it("REUSE: a revoked token also revokes the family", async () => {
    const { deps, familyRevokes } = makeDeps({
      refresh: { ...refreshRow, revoked_at: "2026-07-08T00:00:00Z" },
    });
    const r = await processTokenRequest(true, refreshParams, deps);
    expect(body(r).error).toBe("invalid_grant");
    expect(familyRevokes).toEqual(["family-1"]);
  });
  it("naturally expired token → invalid_grant WITHOUT family kill", async () => {
    const { deps, familyRevokes } = makeDeps({
      refresh: { ...refreshRow, refresh_expires_at: new Date(NOW - 1).toISOString() },
    });
    const r = await processTokenRequest(true, refreshParams, deps);
    expect(body(r).error).toBe("invalid_grant");
    expect(familyRevokes).toEqual([]);
    expect(r.audit).toBeUndefined();
  });
  it("unknown token → invalid_grant, no family kill", async () => {
    const { deps, familyRevokes } = makeDeps({ refresh: null });
    const r = await processTokenRequest(true, refreshParams, deps);
    expect(body(r).error).toBe("invalid_grant");
    expect(familyRevokes).toEqual([]);
  });
  it("client mismatch → uniform invalid_grant, no family kill", async () => {
    const { deps, familyRevokes } = makeDeps({
      refresh: { ...refreshRow, client_id: "someone_else" },
    });
    const r = await processTokenRequest(true, refreshParams, deps);
    expect(body(r).error).toBe("invalid_grant");
    expect(familyRevokes).toEqual([]);
  });
  it("scope param must equal the original grant; matching or omitted scope is fine", async () => {
    const mismatch = await processTokenRequest(
      true,
      { ...refreshParams, scope: "milo.projects.read" },
      makeDeps({ refresh: { ...refreshRow } }).deps,
    );
    expect(body(mismatch).error).toBe("invalid_scope");
    const sameReordered = await processTokenRequest(
      true,
      { ...refreshParams, scope: `offline_access ${READ_SCOPES.join(" ")}` },
      makeDeps({ refresh: { ...refreshRow } }).deps,
    );
    expect(sameReordered.status).toBe(200);
  });
  it("losing the atomic consume race is treated as reuse (family kill)", async () => {
    const { deps, familyRevokes } = makeDeps({ refresh: { ...refreshRow }, consumeWins: false });
    const r = await processTokenRequest(true, refreshParams, deps);
    expect(body(r).error).toBe("invalid_grant");
    expect(familyRevokes).toEqual(["family-1"]);
    expect(r.audit?.event).toBe("token_reuse_detected");
  });
  it("rejects a client secret and unknown clients like the code grant", async () => {
    expect(
      (
        await processTokenRequest(
          true,
          { ...refreshParams, client_secret: "x" },
          makeDeps({ refresh: { ...refreshRow } }).deps,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await processTokenRequest(
          true,
          refreshParams,
          makeDeps({ client: null, refresh: { ...refreshRow } }).deps,
        )
      ).status,
    ).toBe(401);
  });
});

describe("buildAccessTokenRow / tokenSuccessResponse", () => {
  it("carries user/client/resource from the code row; refresh columns null without a refresh grant", () => {
    const row = buildAccessTokenRow(
      { user_id: "user1", client_id: "c", resource: MCP_RESOURCE_URL },
      "hash1",
      "scope1",
      "2026-01-01T00:00:00.000Z",
    );
    expect(row).toEqual({
      user_id: "user1",
      client_id: "c",
      access_token_hash: "hash1",
      refresh_token_hash: null,
      refresh_family_id: null,
      scope: "scope1",
      resource: MCP_RESOURCE_URL,
      access_expires_at: "2026-01-01T00:00:00.000Z",
      refresh_expires_at: null,
    });
  });
  it("fills refresh columns (hash only) when a refresh issue is provided", () => {
    const row = buildAccessTokenRow(
      { user_id: "user1", client_id: "c", resource: MCP_RESOURCE_URL },
      "hash1",
      "scope1",
      "2026-01-01T00:00:00.000Z",
      { refreshHash: "rhash1", familyId: "fam1", expiresAtIso: "2026-02-01T00:00:00.000Z" },
    );
    expect(row.refresh_token_hash).toBe("rhash1");
    expect(row.refresh_family_id).toBe("fam1");
    expect(row.refresh_expires_at).toBe("2026-02-01T00:00:00.000Z");
  });
  it("shapes the success body per RFC 6749, with refresh_token only when issued", () => {
    expect(tokenSuccessResponse("tok", "s", 3600)).toEqual({
      access_token: "tok",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "s",
    });
    expect(tokenSuccessResponse("tok", "s", 3600, "rtok")).toEqual({
      access_token: "tok",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "s",
      refresh_token: "rtok",
    });
  });
});

// ---------------------------------------------------------------------------
// Access-token validation (resource server side)
// ---------------------------------------------------------------------------

describe("validateAccessTokenRow", () => {
  const row = {
    user_id: "user1",
    client_id: "c",
    scope: "milo.projects.read",
    resource: MCP_RESOURCE_URL,
    access_expires_at: new Date(NOW + 60_000).toISOString(),
    revoked_at: null,
  };
  it("returns null for unknown, revoked, expired, or wrong-audience rows (uniform 401)", () => {
    expect(validateAccessTokenRow(null, NOW)).toBeNull();
    expect(validateAccessTokenRow({ ...row, revoked_at: "2026-01-01" }, NOW)).toBeNull();
    expect(
      validateAccessTokenRow({ ...row, access_expires_at: new Date(NOW - 1).toISOString() }, NOW),
    ).toBeNull();
    expect(
      validateAccessTokenRow({ ...row, resource: "https://other.example/api" }, NOW),
    ).toBeNull();
    expect(validateAccessTokenRow({ ...row, access_expires_at: undefined }, NOW)).toBeNull();
  });
  it("resolves a valid row to its grant", () => {
    expect(validateAccessTokenRow(row, NOW)).toEqual({
      userId: "user1",
      clientId: "c",
      scope: "milo.projects.read",
      resource: MCP_RESOURCE_URL,
    });
  });
});

// ---------------------------------------------------------------------------
// Consent helpers
// ---------------------------------------------------------------------------

describe("classifyConsentRequest", () => {
  const req = {
    client_id: "c",
    redirect_uri: CALLBACK,
    scope: "milo.projects.read",
    state: "xyz",
    expires_at: new Date(NOW + 60_000).toISOString(),
    consumed_at: null,
  };
  it("fails closed for missing/used/expired requests and bad clients", () => {
    expect(classifyConsentRequest(null, {}, NOW)).toEqual({ ok: false, reason: "not_found" });
    expect(classifyConsentRequest({ ...req, consumed_at: "2026-01-01" }, {}, NOW)).toEqual({
      ok: false,
      reason: "already_used",
    });
    expect(
      classifyConsentRequest({ ...req, expires_at: new Date(NOW - 1).toISOString() }, {}, NOW),
    ).toEqual({ ok: false, reason: "expired" });
    expect(classifyConsentRequest(req, null, NOW)).toEqual({ ok: false, reason: "invalid_client" });
    expect(classifyConsentRequest(req, { disabled_at: "2026-01-01" }, NOW)).toEqual({
      ok: false,
      reason: "invalid_client",
    });
  });
  it("normalizes a valid pending request", () => {
    expect(classifyConsentRequest(req, { disabled_at: null }, NOW)).toEqual({
      ok: true,
      normalized: {
        clientId: "c",
        redirectUri: CALLBACK,
        scope: "milo.projects.read",
        state: "xyz",
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 1A — write flag + write scope model (dark: no tools, no metadata change)
// ---------------------------------------------------------------------------

describe("isWriteToolsEnabled", () => {
  it("is true only for (trimmed, case-insensitive) 'true', default false", () => {
    expect(isWriteToolsEnabled()).toBe(false); // unset
    vi.stubEnv("MCP_WRITE_TOOLS_ENABLED", "true");
    expect(isWriteToolsEnabled()).toBe(true);
    vi.stubEnv("MCP_WRITE_TOOLS_ENABLED", " TRUE ");
    expect(isWriteToolsEnabled()).toBe(true);
    vi.stubEnv("MCP_WRITE_TOOLS_ENABLED", "1");
    expect(isWriteToolsEnabled()).toBe(false);
    vi.stubEnv("MCP_WRITE_TOOLS_ENABLED", "false");
    expect(isWriteToolsEnabled()).toBe(false);
  });
});

describe("issuableScopes / write scope model", () => {
  const WRITES = ["milo.projects.write", "milo.content.write", "milo.tasks.write"];
  it("flag off → exactly reads + offline_access; flag on → plus the 3 write scopes and the propose scope (1B)", () => {
    expect(issuableScopes(false)).toEqual(ISSUABLE_SCOPES);
    expect(issuableScopes(true)).toEqual([...ISSUABLE_SCOPES, ...WRITES, "milo.actions.propose"]);
    expect(MCP_WRITE_SCOPES).toEqual(WRITES);
  });
  it("the publish scope is reserved and in NEITHER set; no umbrella milo.write anywhere", () => {
    expect(issuableScopes(false)).not.toContain(MCP_PUBLISH_SCOPE);
    expect(issuableScopes(true)).not.toContain(MCP_PUBLISH_SCOPE);
    expect(issuableScopes(true)).not.toContain("milo.write");
    expect(
      issuableScopes(true).filter(
        (s) =>
          s.includes("settings") || s.includes("insights.write") || s.includes("authority.write"),
      ),
    ).toEqual([]);
  });
  it("validateScopes rejects write scopes against the default set, accepts them against issuable(true)", () => {
    expect(validateScopes(["milo.content.write"])).toEqual({
      ok: false,
      invalid: ["milo.content.write"],
    });
    expect(
      validateScopes(["milo.projects.read", "milo.content.write"], issuableScopes(true)),
    ).toEqual({
      ok: true,
      scopes: ["milo.projects.read", "milo.content.write"],
    });
    expect(validateScopes([MCP_PUBLISH_SCOPE], issuableScopes(true))).toEqual({
      ok: false,
      invalid: [MCP_PUBLISH_SCOPE],
    });
  });
});

describe("DCR with write scopes", () => {
  const writeScopeStr = "milo.projects.read milo.content.write";
  it("flag off: an explicit write scope is rejected with invalid_scope", () => {
    const v = validateRegistration({ redirect_uris: [CALLBACK], scope: writeScopeStr }, false);
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.body.error).toBe("invalid_scope");
  });
  it("flag on: an explicit write scope is accepted and preserved", () => {
    const v = validateRegistration({ redirect_uris: [CALLBACK], scope: writeScopeStr }, true);
    expect(v.ok && v.normalized.scope).toBe(writeScopeStr);
  });
  it("flag on: the no-scope DEFAULT stays reads + offline_access (writes never default)", () => {
    const v = validateRegistration({ redirect_uris: [CALLBACK] }, true);
    expect(v.ok && v.normalized.scope).toBe(ISSUABLE_SCOPES.join(" "));
  });
  it("the publish scope is rejected regardless of flag", () => {
    for (const writeEnabled of [false, true]) {
      const v = validateRegistration(
        { redirect_uris: [CALLBACK], scope: MCP_PUBLISH_SCOPE },
        writeEnabled,
      );
      expect(v.ok).toBe(false);
    }
  });
  it("processClientRegistration threads writeEnabled through deps", async () => {
    const insertClient = vi.fn().mockResolvedValue(undefined);
    const rejected = await processClientRegistration(
      true,
      { redirect_uris: [CALLBACK], scope: "milo.tasks.write" },
      { insertClient, clientId: "c1", nowMs: NOW },
    );
    expect(rejected.status).toBe(400); // deps.writeEnabled defaults false
    const accepted = await processClientRegistration(
      true,
      { redirect_uris: [CALLBACK], scope: "milo.tasks.write milo.projects.read" },
      { insertClient, clientId: "c2", nowMs: NOW, writeEnabled: true },
    );
    expect(accepted.status).toBe(201);
    expect(accepted.body.scope).toBe("milo.tasks.write milo.projects.read");
  });
});

describe("authorize with write scopes", () => {
  const client = { redirect_uris: [CALLBACK], scope: READ_SCOPES.join(" "), disabled_at: null };
  const base: AuthorizeParams = {
    response_type: "code",
    client_id: "milo_client_t",
    redirect_uri: CALLBACK,
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256",
    resource: MCP_RESOURCE_URL,
  };
  it("flag off: explicit write scope → invalid_scope redirect error", () => {
    const r = classifyAuthorizeRequest({ ...base, scope: "milo.content.write" }, client, false);
    expect(r.kind === "redirect_error" && r.error).toBe("invalid_scope");
  });
  it("flag on: explicit write scope is granted", () => {
    const r = classifyAuthorizeRequest(
      { ...base, scope: "milo.projects.read milo.content.write" },
      client,
      true,
    );
    expect(r.kind === "ok" && r.normalized.scope).toBe("milo.projects.read milo.content.write");
  });
  it("no-scope default behavior is unchanged (client scope / read+offline fallback), flag on or off", () => {
    for (const writeEnabled of [false, true]) {
      const fromClient = classifyAuthorizeRequest(
        { ...base, scope: undefined },
        client,
        writeEnabled,
      );
      expect(fromClient.kind === "ok" && fromClient.normalized.scope).toBe(READ_SCOPES.join(" "));
      const dflt = classifyAuthorizeRequest(
        { ...base, scope: undefined },
        { ...client, scope: null },
        writeEnabled,
      );
      expect(dflt.kind === "ok" && dflt.normalized.scope).toBe(ISSUABLE_SCOPES.join(" "));
    }
  });
  it("a client REGISTERED with write scopes falls back to them when authorize omits scope", () => {
    const writeClient = { ...client, scope: "milo.projects.read milo.tasks.write" };
    const r = classifyAuthorizeRequest({ ...base, scope: undefined }, writeClient, true);
    expect(r.kind === "ok" && r.normalized.scope).toBe("milo.projects.read milo.tasks.write");
  });
  it("the publish scope is rejected regardless of flag", () => {
    for (const writeEnabled of [false, true]) {
      const r = classifyAuthorizeRequest(
        { ...base, scope: MCP_PUBLISH_SCOPE },
        client,
        writeEnabled,
      );
      expect(r.kind === "redirect_error" && r.error).toBe("invalid_scope");
    }
  });
});

describe("metadata advertises the two shipped write scopes ONLY when the flag is on", () => {
  // Owner decision 2026-08-20: writes on the Claude.ai web connector. The
  // connector requests exactly the advertised resource scopes, so the two
  // smoke-verified write scopes must be advertised flag-ON — while
  // content.write (no tool), propose (Phase 1B), and publish (never) stay OUT.
  it("flag OFF: byte-identical read-only metadata (no writes, no publish)", () => {
    const prm = protectedResourceMetadata(false);
    const as = authorizationServerMetadata(false);
    expect(prm.scopes_supported).toEqual(READ_SCOPES);
    expect(as.scopes_supported).toEqual(ISSUABLE_SCOPES);
    const all = JSON.stringify([prm, as]);
    expect(all).not.toContain(".write");
    expect(all).not.toContain("publish");
    expect(all).not.toContain("propose");
  });

  it("flag ON: exactly milo.projects.write + milo.tasks.write appended", () => {
    const prm = protectedResourceMetadata(true).scopes_supported as string[];
    const as = authorizationServerMetadata(true).scopes_supported as string[];
    expect(prm).toEqual([...READ_SCOPES, "milo.projects.write", "milo.tasks.write"]);
    expect(as).toEqual([...ISSUABLE_SCOPES, "milo.projects.write", "milo.tasks.write"]);
    // The three deliberately-withheld scopes never appear, even flag-on.
    for (const scopes of [prm, as]) {
      expect(scopes).not.toContain("milo.content.write");
      expect(scopes).not.toContain("milo.actions.propose");
      expect(scopes).not.toContain("milo.content.publish");
    }
    // Grant types unchanged by the write flag.
    expect(authorizationServerMetadata(true).grant_types_supported).toEqual([
      "authorization_code",
      "refresh_token",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting (fixed window, DB-backed, fail-open)
// ---------------------------------------------------------------------------

describe("RATE_BUCKETS (approved Phase 0 limits)", () => {
  it("encodes exactly the approved limits and windows", () => {
    expect(RATE_BUCKETS.register).toMatchObject({ limit: 10, windowSec: 3600 });
    expect(RATE_BUCKETS.tokenIp).toMatchObject({ limit: 30, windowSec: 3600 });
    expect(RATE_BUCKETS.tokenClient).toMatchObject({ limit: 15, windowSec: 3600 });
    expect(RATE_BUCKETS.mcpToken).toMatchObject({ limit: 120, windowSec: 300 });
    expect(RATE_BUCKETS.mcpAnon).toMatchObject({ limit: 30, windowSec: 300 });
    expect(RATE_BUCKETS.write).toMatchObject({ bucket: "write", limit: 30, windowSec: 3600 }); // Phase 1A write tools
    const prefixes = Object.values(RATE_BUCKETS).map((b) => b.saltPrefix);
    expect(new Set(prefixes).size).toBe(prefixes.length); // distinct salts per bucket
  });
});

describe("rateWindowStart", () => {
  const H = 3600;
  it("floors to the window boundary and reports seconds to rollover", () => {
    const boundary = 1_700_000_400_000; // any ms value; make it an exact hour boundary below
    const exact = Math.floor(boundary / (H * 1000)) * H * 1000;
    const atStart = rateWindowStart(exact, H);
    expect(atStart.startIso).toBe(new Date(exact).toISOString());
    expect(atStart.retryAfterSec).toBe(H);
    const midway = rateWindowStart(exact + 1800_000, H);
    expect(midway.startIso).toBe(atStart.startIso);
    expect(midway.retryAfterSec).toBe(1800);
    const nearEnd = rateWindowStart(exact + H * 1000 - 500, H);
    expect(nearEnd.startIso).toBe(atStart.startIso);
    expect(nearEnd.retryAfterSec).toBe(1); // ceil, min 1
    const nextWindow = rateWindowStart(exact + H * 1000, H);
    expect(nextWindow.startIso).not.toBe(atStart.startIso);
  });
});

describe("rateLimitKey", () => {
  it("hashes with the bucket salt — raw value never appears, buckets never collide", async () => {
    const ip = "203.0.113.7";
    const k = await rateLimitKey(RATE_BUCKETS.register, ip);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(k).not.toContain(ip);
    expect(await rateLimitKey(RATE_BUCKETS.tokenIp, ip)).not.toBe(k); // different salt, same value
    expect(await rateLimitKey(RATE_BUCKETS.register, ip)).toBe(k); // deterministic
  });
  it("uses a shared fallback key for a missing identifier", async () => {
    expect(await rateLimitKey(RATE_BUCKETS.register, "")).toBe(
      await rateLimitKey(RATE_BUCKETS.register, ""),
    );
  });
  it("mcp bearer keys are not the oauth token hash", async () => {
    const bearer = "milo_at_sometoken";
    expect(await rateLimitKey(RATE_BUCKETS.mcpToken, bearer)).not.toBe(await sha256Hex(bearer));
  });
});

describe("checkRateLimit", () => {
  const bucket = { bucket: "test", limit: 3, windowSec: 60, saltPrefix: "rl:test:" };
  const deps = (count: number | Error): RateLimitDeps => ({
    bump: async () => {
      if (count instanceof Error) throw count;
      return count;
    },
    nowMs: NOW,
  });

  it("allows under and AT the limit", async () => {
    expect((await checkRateLimit(bucket, "x", deps(1))).allowed).toBe(true);
    expect((await checkRateLimit(bucket, "x", deps(3))).allowed).toBe(true); // at limit
  });
  it("denies over the limit with the window's Retry-After", async () => {
    const r = await checkRateLimit(bucket, "x", deps(4));
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSec).toBe(rateWindowStart(NOW, 60).retryAfterSec);
    expect(r.windowStartIso).toBe(rateWindowStart(NOW, 60).startIso);
  });
  it("audits exactly once — only at count == limit + 1", async () => {
    expect((await checkRateLimit(bucket, "x", deps(3))).shouldAudit).toBe(false);
    expect((await checkRateLimit(bucket, "x", deps(4))).shouldAudit).toBe(true);
    expect((await checkRateLimit(bucket, "x", deps(5))).shouldAudit).toBe(false);
  });
  it("fails OPEN when the bump errors", async () => {
    const r = await checkRateLimit(bucket, "x", deps(new Error("db_down")));
    expect(r.allowed).toBe(true);
    expect(r.shouldAudit).toBe(false);
  });
  it("passes the hashed key (not the raw identifier) to bump", async () => {
    let seenKey = "";
    const d: RateLimitDeps = {
      bump: async (_b, key) => {
        seenKey = key;
        return 1;
      },
      nowMs: NOW,
    };
    await checkRateLimit(bucket, "203.0.113.7", d);
    expect(seenKey).toMatch(/^[0-9a-f]{64}$/);
    expect(seenKey).not.toContain("203.0.113.7");
  });
});

// ---------------------------------------------------------------------------
// Token revocation (RFC 7009) — family-aware since commit 6
// ---------------------------------------------------------------------------

describe("processRevocationRequest", () => {
  const info: RevokedTokenInfo = {
    userId: "user1",
    clientId: "client1",
    tokenType: "access",
    familyRevoked: null,
  };
  function makeDeps(result: RevokedTokenInfo | null) {
    const revokeCalls: { hash: string; nowIso: string; hint?: string }[] = [];
    const deps: RevocationDeps = {
      revokeTokenByHash: async (hash, nowIso, hint) => {
        revokeCalls.push({ hash, nowIso, hint });
        return result;
      },
      hash: sha256Hex,
      nowMs: NOW,
    };
    return { deps, revokeCalls };
  }

  it("returns 404 not_found when the flag is off, without touching deps", async () => {
    const { deps, revokeCalls } = makeDeps(info);
    const r = await processRevocationRequest(false, { token: "milo_at_x" }, deps);
    expect(r).toEqual({ status: 404, body: { error: "not_found" }, revoked: null });
    expect(revokeCalls).toHaveLength(0);
  });

  it("returns 400 invalid_request for a missing/blank token, without a lookup", async () => {
    const { deps, revokeCalls } = makeDeps(info);
    for (const params of [{}, { token: "" }, { token: "   " }, { token: undefined }]) {
      const r = await processRevocationRequest(true, params, deps);
      expect(r.status).toBe(400);
      expect(r.body?.error).toBe("invalid_request");
      expect(r.revoked).toBeNull();
    }
    expect(revokeCalls).toHaveLength(0);
  });

  it("revokes a known live token: 200, empty body, hashed lookup (plaintext never reaches the DB layer)", async () => {
    const { deps, revokeCalls } = makeDeps(info);
    const r = await processRevocationRequest(true, { token: "milo_at_livetoken" }, deps);
    expect(r.status).toBe(200);
    expect(r.body).toBeNull();
    expect(r.revoked).toEqual(info);
    expect(revokeCalls).toHaveLength(1);
    expect(revokeCalls[0].hash).toBe(await sha256Hex("milo_at_livetoken"));
    expect(revokeCalls[0].nowIso).toBe(new Date(NOW).toISOString());
    expect(JSON.stringify(r)).not.toContain("milo_at_livetoken");
  });

  it("unknown or already-revoked tokens are indistinguishable from success (200, empty body)", async () => {
    const { deps } = makeDeps(null);
    const r = await processRevocationRequest(true, { token: "milo_at_whoknows" }, deps);
    expect(r.status).toBe(200);
    expect(r.body).toBeNull();
    expect(r.revoked).toBeNull(); // null → route emits NO audit event (no existence leak)
  });

  it("token_type_hint is advisory: forwarded to the lookup, works with any value", async () => {
    for (const hint of ["access_token", "refresh_token", "nonsense", undefined]) {
      const { deps, revokeCalls } = makeDeps(info);
      const r = await processRevocationRequest(
        true,
        { token: "milo_at_x", token_type_hint: hint },
        deps,
      );
      expect(r.status).toBe(200);
      expect(revokeCalls).toHaveLength(1);
      expect(revokeCalls[0].hint).toBe(hint);
    }
  });

  it("surfaces family revocation context for auditing (refresh token → family kill)", async () => {
    const familyInfo: RevokedTokenInfo = {
      userId: "user1",
      clientId: "client1",
      tokenType: "refresh",
      familyRevoked: 4,
    };
    const { deps } = makeDeps(familyInfo);
    const r = await processRevocationRequest(
      true,
      { token: "milo_rt_x", token_type_hint: "refresh_token" },
      deps,
    );
    expect(r.status).toBe(200);
    expect(r.body).toBeNull();
    expect(r.revoked).toEqual(familyInfo);
  });

  it("a failing revocation write propagates (route → 500) instead of claiming success", async () => {
    const deps: RevocationDeps = {
      revokeTokenByHash: async () => {
        throw new Error("revoke_failed");
      },
      hash: sha256Hex,
      nowMs: NOW,
    };
    await expect(processRevocationRequest(true, { token: "milo_at_x" }, deps)).rejects.toThrow(
      "revoke_failed",
    );
  });
});

// ---------------------------------------------------------------------------
// Connected apps aggregation (pure)
// ---------------------------------------------------------------------------

describe("buildConnectedApps", () => {
  const token = (over: Partial<TokenGrantRow>): TokenGrantRow => ({
    client_id: "client1",
    scope: "milo.projects.read",
    created_at: new Date(NOW - 3_600_000).toISOString(),
    access_expires_at: new Date(NOW + 3_600_000).toISOString(),
    last_used_at: null,
    revoked_at: null,
    ...over,
  });
  const consent = (over: Partial<ConsentRow>): ConsentRow => ({
    client_id: "client1",
    scope: "milo.projects.read milo.content.read",
    granted_at: new Date(NOW - 3_600_000).toISOString(),
    revoked_at: null,
    ...over,
  });

  it("returns one card per distinct client with display-safe fields only", () => {
    const apps = buildConnectedApps(
      [token({}), token({ client_id: "client2" })],
      [consent({}), consent({ client_id: "client3" })],
      { client1: "Claude", client2: null },
      NOW,
    );
    expect(apps.map((a) => a.clientId).sort()).toEqual(["client1", "client2", "client3"]);
    for (const app of apps) {
      expect(Object.keys(app).sort()).toEqual(
        [
          "clientId",
          "clientName",
          "scopes",
          "grantedAt",
          "status",
          "activeTokenCount",
          "latestTokenCreatedAt",
          "latestTokenExpiresAt",
          "latestTokenLastUsedAt",
        ].sort(),
      );
    }
    expect(JSON.stringify(apps)).not.toMatch(/hash|secret|token_hash/i);
    expect(apps.find((a) => a.clientId === "client1")?.clientName).toBe("Claude");
    expect(apps.find((a) => a.clientId === "client3")?.clientName).toBeNull();
  });

  it("picks the NEWEST token's dates and counts only live tokens", () => {
    const older = token({
      created_at: new Date(NOW - 7_200_000).toISOString(),
      last_used_at: new Date(NOW - 7_000_000).toISOString(),
    });
    const newest = token({
      created_at: new Date(NOW - 60_000).toISOString(),
      access_expires_at: new Date(NOW + 60_000).toISOString(),
      last_used_at: new Date(NOW - 30_000).toISOString(),
    });
    const revoked = token({
      created_at: new Date(NOW - 3_600_000).toISOString(),
      revoked_at: new Date(NOW - 1_000_000).toISOString(),
    });
    const expired = token({
      created_at: new Date(NOW - 5_000_000).toISOString(),
      access_expires_at: new Date(NOW - 1).toISOString(),
    });
    const [app] = buildConnectedApps([older, newest, revoked, expired], [consent({})], {}, NOW);
    expect(app.latestTokenCreatedAt).toBe(newest.created_at);
    expect(app.latestTokenExpiresAt).toBe(newest.access_expires_at);
    expect(app.latestTokenLastUsedAt).toBe(newest.last_used_at);
    expect(app.activeTokenCount).toBe(2); // older + newest live; revoked + expired excluded
    expect(app.status).toBe("active");
  });

  it("derives status: expired when consent stands without live tokens, revoked when neither", () => {
    const dead = token({ access_expires_at: new Date(NOW - 1).toISOString() });
    const [expired] = buildConnectedApps([dead], [consent({})], {}, NOW);
    expect(expired.status).toBe("expired");
    const [revoked] = buildConnectedApps(
      [dead],
      [consent({ revoked_at: new Date(NOW - 1).toISOString() })],
      {},
      NOW,
    );
    expect(revoked.status).toBe("revoked");
    expect(revoked.activeTokenCount).toBe(0);
  });

  it("uses the earliest consent as grantedAt and labels the live token's scopes", () => {
    const first = consent({ granted_at: new Date(NOW - 9_000_000).toISOString() });
    const second = consent({ granted_at: new Date(NOW - 1_000_000).toISOString() });
    const [app] = buildConnectedApps(
      [token({ scope: "milo.projects.read" })],
      [first, second],
      {},
      NOW,
    );
    expect(app.grantedAt).toBe(first.granted_at);
    expect(app.scopes).toEqual([
      { scope: "milo.projects.read", label: "See your projects and brand profile", kind: "read" },
    ]);
  });

  it("sorts clients with active tokens first, then by newest token", () => {
    const apps = buildConnectedApps(
      [
        token({
          client_id: "deadClient",
          access_expires_at: new Date(NOW - 1).toISOString(),
          created_at: new Date(NOW - 100).toISOString(),
        }),
        token({ client_id: "oldActive", created_at: new Date(NOW - 5_000_000).toISOString() }),
        token({ client_id: "newActive", created_at: new Date(NOW - 60_000).toISOString() }),
      ],
      [],
      {},
      NOW,
    );
    expect(apps.map((a) => a.clientId)).toEqual(["newActive", "oldActive", "deadClient"]);
  });

  it("a write-scoped grant renders labeled write scopes without breaking the card shape", () => {
    const [app] = buildConnectedApps(
      [token({ scope: "milo.projects.read milo.content.write" })],
      [consent({ scope: "milo.projects.read milo.content.write" })],
      {},
      NOW,
    );
    expect(app.scopes).toEqual([
      { scope: "milo.projects.read", label: "See your projects and brand profile", kind: "read" },
      {
        scope: "milo.content.write",
        label: "Create and edit content drafts (never publishes)",
        kind: "write",
      },
    ]);
    expect(app.status).toBe("active");
  });

  it("consent-only grants (no tokens yet) render with null token fields", () => {
    const [app] = buildConnectedApps([], [consent({})], { client1: "Claude" }, NOW);
    expect(app.status).toBe("expired");
    expect(app.activeTokenCount).toBe(0);
    expect(app.latestTokenCreatedAt).toBeNull();
    expect(app.scopes.map((s) => s.scope)).toEqual(["milo.projects.read", "milo.content.read"]);
  });
});

describe("scope consent labels", () => {
  it("has a human label for every advertised scope", () => {
    for (const s of OAUTH_SCOPES) expect(SCOPE_LABELS[s]).toBeTruthy();
  });
  // Flipped by commit 6: offline_access is issued and shown in consent.
  it("labels offline_access for the consent screen", () => {
    expect(SCOPE_LABELS["offline_access"]).toBe("Stay connected without re-approving each time");
  });
  it("maps scopes to labels+kinds and falls back to the raw scope", () => {
    expect(scopeConsentItems("milo.projects.read unknown.scope")).toEqual([
      { scope: "milo.projects.read", label: "See your projects and brand profile", kind: "read" },
      { scope: "unknown.scope", label: "unknown.scope", kind: "read" },
    ]);
  });
  it("classifies read/offline/write kinds and labels the write scopes", () => {
    expect(scopeKind("milo.projects.read")).toBe("read");
    expect(scopeKind("offline_access")).toBe("offline");
    for (const s of MCP_WRITE_SCOPES) {
      expect(scopeKind(s)).toBe("write");
      expect(SCOPE_LABELS[s]).toBeTruthy();
    }
    expect(scopeKind(MCP_PUBLISH_SCOPE)).toBe("write");
    expect(SCOPE_LABELS[MCP_PUBLISH_SCOPE]).toBeUndefined(); // not issuable → no consent label yet
  });
  it("a read-only consent produces no write-kind items", () => {
    const items = scopeConsentItems(`${READ_SCOPES.join(" ")} offline_access`);
    expect(items.some((i) => i.kind === "write")).toBe(false);
  });
});
