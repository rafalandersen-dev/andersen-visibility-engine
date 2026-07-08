/**
 * Regression tests for the OAuth pure/injectable helpers in oauth.server.ts.
 *
 * These lock in CURRENT behavior before Phase 0 touches the module — most
 * importantly: read-only scopes, offline_access tolerated-but-stripped, no
 * refresh tokens, authorization_code-only metadata, PKCE S256, single-use
 * codes, and uniform invalid_grant responses. DB helpers are exercised via
 * their injected-dependency variants only — no database, no network.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  OAUTH_BASE_URL,
  MCP_RESOURCE_URL,
  PROTECTED_RESOURCE_METADATA_URL,
  OAUTH_SCOPES,
  CLIENT_ID_PREFIX,
  ACCESS_TOKEN_PREFIX,
  ACCESS_TOKEN_TTL_MS,
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
  isToleratedScope,
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
  type AuthorizeParams,
  type TokenParams,
  type TokenDeps,
} from "./oauth.server";

const NOW = 1_700_000_000_000;
const READ_SCOPES = ["milo.projects.read", "milo.content.read", "milo.insights.read", "milo.authority.read"];
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
  it("advertises authorization_code only (no refresh_token) and code only", () => {
    expect(as.grant_types_supported).toEqual(["authorization_code"]);
    expect(as.response_types_supported).toEqual(["code"]);
  });
  it("advertises the 4 read scopes, S256, and public clients only", () => {
    expect(as.scopes_supported).toEqual(READ_SCOPES);
    expect(as.code_challenge_methods_supported).toEqual(["S256"]);
    expect(as.token_endpoint_auth_methods_supported).toEqual(["none"]);
  });
});

describe("mcpWwwAuthenticate", () => {
  it("points at protected-resource metadata when enabled", () => {
    expect(mcpWwwAuthenticate(true)).toBe(`Bearer resource_metadata="${PROTECTED_RESOURCE_METADATA_URL}"`);
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
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
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
  it("accepts each of the 4 read scopes and nothing write-shaped", () => {
    for (const s of READ_SCOPES) expect(isAllowedScope(s)).toBe(true);
    expect(isAllowedScope("milo.projects.write")).toBe(false);
    expect(isAllowedScope("offline_access")).toBe(false);
  });
  it("tolerates offline_access on input but strips it from the effective set", () => {
    expect(isToleratedScope("offline_access")).toBe(true);
    const v = validateScopes(["milo.projects.read", "offline_access"]);
    expect(v).toEqual({ ok: true, scopes: ["milo.projects.read"] });
  });
  it("fails unknown scopes and reports them", () => {
    const v = validateScopes(["milo.projects.read", "milo.content.write", "bogus"]);
    expect(v).toEqual({ ok: false, invalid: ["milo.content.write", "bogus"] });
  });
  it("passes all 4 read scopes through unchanged", () => {
    expect(validateScopes([...OAUTH_SCOPES])).toEqual({ ok: true, scopes: READ_SCOPES });
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
    expect(oauthErrorBody("invalid_request", "why")).toEqual({ error: "invalid_request", error_description: "why" });
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
      scope: READ_SCOPES.join(" "),
      client_name: "Claude",
      software_id: undefined,
    });
  });
  it("requires a non-empty redirect_uris array of valid URIs (max 10)", () => {
    expect(validateRegistration({}).ok).toBe(false);
    expect(validateRegistration({ redirect_uris: [] }).ok).toBe(false);
    expect(validateRegistration({ redirect_uris: ["http://example.com/cb"] }).ok).toBe(false);
    expect(validateRegistration({ redirect_uris: Array.from({ length: 11 }, (_, i) => `https://a.example/${i}`) }).ok).toBe(false);
    expect(validateRegistration(null).ok).toBe(false);
    expect(validateRegistration([CALLBACK]).ok).toBe(false);
  });
  it("supports public clients only", () => {
    const v = validateRegistration({ redirect_uris: [CALLBACK], token_endpoint_auth_method: "client_secret_basic" });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.body.error).toBe("invalid_client_metadata");
  });
  it("tolerates refresh_token in grant_types but rejects unknown grants and missing authorization_code", () => {
    expect(validateRegistration({ redirect_uris: [CALLBACK], grant_types: ["authorization_code", "refresh_token"] }).ok).toBe(true);
    expect(validateRegistration({ redirect_uris: [CALLBACK], grant_types: ["implicit"] }).ok).toBe(false);
    expect(validateRegistration({ redirect_uris: [CALLBACK], grant_types: ["refresh_token"] }).ok).toBe(false);
  });
  it("rejects response_types beyond code", () => {
    expect(validateRegistration({ redirect_uris: [CALLBACK], response_types: ["token"] }).ok).toBe(false);
    expect(validateRegistration({ redirect_uris: [CALLBACK], response_types: [] }).ok).toBe(false);
  });
  it("defaults scope to the 4 reads; strips offline_access; rejects unknown scopes", () => {
    const dflt = validateRegistration({ redirect_uris: [CALLBACK], scope: "" });
    expect(dflt.ok && dflt.normalized.scope).toBe(READ_SCOPES.join(" "));
    const tolerated = validateRegistration({ redirect_uris: [CALLBACK], scope: "milo.projects.read offline_access" });
    expect(tolerated.ok && tolerated.normalized.scope).toBe("milo.projects.read");
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
    const r = await processClientRegistration(false, { redirect_uris: [CALLBACK] }, { insertClient, clientId: "c", nowMs: NOW });
    expect(r).toEqual({ status: 404, body: { error: "not_found" } });
    expect(insertClient).not.toHaveBeenCalled();
  });
  it("persists and returns 201 for a valid request", async () => {
    const insertClient = vi.fn().mockResolvedValue(undefined);
    const r = await processClientRegistration(true, { redirect_uris: [CALLBACK], client_name: "Claude" }, { insertClient, clientId: "milo_client_t", nowMs: NOW });
    expect(r.status).toBe(201);
    expect(r.body.client_id).toBe("milo_client_t");
    expect(insertClient).toHaveBeenCalledOnce();
  });
  it("surfaces validation failures without persisting", async () => {
    const insertClient = vi.fn();
    const r = await processClientRegistration(true, { redirect_uris: ["bad"] }, { insertClient, clientId: "c", nowMs: NOW });
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
    expect(classifyAuthorizeRequest(good, { ...client, disabled_at: "2026-01-01" })).toEqual({ kind: "invalid_client" });
    expect(classifyAuthorizeRequest({ ...good, client_id: undefined }, client)).toEqual({ kind: "invalid_client" });
    expect(classifyAuthorizeRequest({ ...good, redirect_uri: "https://evil.example/cb" }, client)).toEqual({ kind: "invalid_redirect" });
    expect(classifyAuthorizeRequest({ ...good, redirect_uri: undefined }, client)).toEqual({ kind: "invalid_redirect" });
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
    const bad = classifyAuthorizeRequest({ ...good, resource: "https://other.example/api" }, client);
    expect(bad.kind === "redirect_error" && bad.error).toBe("invalid_target");
    const omitted = classifyAuthorizeRequest({ ...good, resource: undefined }, client);
    expect(omitted.kind === "ok" && omitted.normalized.resource).toBe(MCP_RESOURCE_URL);
  });
  it("redirect-errors unknown scopes and strips offline_access from valid ones", () => {
    const bad = classifyAuthorizeRequest({ ...good, scope: "milo.projects.write" }, client);
    expect(bad.kind === "redirect_error" && bad.error).toBe("invalid_scope");
    const tolerated = classifyAuthorizeRequest({ ...good, scope: "milo.projects.read offline_access" }, client);
    expect(tolerated.kind === "ok" && tolerated.normalized.scope).toBe("milo.projects.read");
  });
  it("defaults omitted scope to the client's registered scope (or all reads)", () => {
    const fromClient = classifyAuthorizeRequest({ ...good, scope: undefined }, { ...client, scope: "milo.projects.read" });
    expect(fromClient.kind === "ok" && fromClient.normalized.scope).toBe("milo.projects.read");
    const all = classifyAuthorizeRequest({ ...good, scope: undefined }, { ...client, scope: null });
    expect(all.kind === "ok" && all.normalized.scope).toBe(READ_SCOPES.join(" "));
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
    expect(await issueAuthorizationCode("req1", "", deps)).toEqual({ ok: false, reason: "not_found" });
    expect(await issueAuthorizationCode("req1", "user1", makeDeps(null).deps)).toEqual({ ok: false, reason: "not_found" });
    expect(await issueAuthorizationCode("req1", "user1", makeDeps({ ...pending, consumed_at: "2026-01-01" }).deps)).toEqual({ ok: false, reason: "already_used" });
    expect(await issueAuthorizationCode("req1", "user1", makeDeps({ ...pending, expires_at: new Date(NOW - 1).toISOString() }).deps)).toEqual({ ok: false, reason: "expired" });
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
      { clientId: "c", redirectUri: CALLBACK, scope: "s", codeChallenge: "ch", codeChallengeMethod: "S256", resource: MCP_RESOURCE_URL, state: undefined },
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
      { client_id: "c", redirect_uri: CALLBACK, scope: "s", code_challenge: "ch", code_challenge_method: "S256", resource: MCP_RESOURCE_URL },
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
// Token endpoint (authorization_code + PKCE; NO refresh token this phase)
// ---------------------------------------------------------------------------

describe("processTokenRequest", () => {
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
  const clientRow = { client_id: "milo_client_t", client_name: "Claude", redirect_uris: [CALLBACK], scope: READ_SCOPES.join(" "), disabled_at: null as string | null };
  const goodParams: TokenParams = {
    grant_type: "authorization_code",
    client_id: "milo_client_t",
    code: "plaincode",
    redirect_uri: CALLBACK,
    code_verifier: VERIFIER,
    resource: MCP_RESOURCE_URL,
  };

  function makeDeps(overrides: { code?: Record<string, unknown> | null; client?: typeof clientRow | null } = {}) {
    const calls: string[] = [];
    const insertedTokens: Record<string, unknown>[] = [];
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
      nowMs: NOW,
    };
    return { deps, calls, insertedTokens };
  }

  it("returns 404 not_found when the flag is off", async () => {
    const { deps } = makeDeps();
    expect(await processTokenRequest(false, goodParams, deps)).toEqual({ status: 404, body: { error: "not_found" } });
  });
  it("rejects missing params and non-authorization_code grants", async () => {
    const { deps } = makeDeps();
    expect((await processTokenRequest(true, {}, deps)).body.error).toBe("invalid_request");
    expect((await processTokenRequest(true, { ...goodParams, grant_type: "refresh_token" }, deps)).body.error).toBe("unsupported_grant_type");
    for (const missing of ["client_id", "code", "redirect_uri", "code_verifier"] as const) {
      const p = { ...goodParams, [missing]: undefined };
      expect((await processTokenRequest(true, p, deps)).body.error).toBe("invalid_request");
    }
  });
  it("rejects a client secret from a public client with 401", async () => {
    const { deps } = makeDeps();
    const r = await processTokenRequest(true, { ...goodParams, client_secret: "s3cret" }, deps);
    expect(r.status).toBe(401);
    expect(r.body.error).toBe("invalid_client");
  });
  it("rejects a mismatched resource; tolerates an omitted one", async () => {
    const { deps } = makeDeps();
    expect((await processTokenRequest(true, { ...goodParams, resource: "https://other.example" }, deps)).body.error).toBe("invalid_target");
    const ok = await processTokenRequest(true, { ...goodParams, resource: undefined }, makeDeps().deps);
    expect(ok.status).toBe(200);
  });
  it("rejects unknown or disabled clients with 401", async () => {
    expect((await processTokenRequest(true, goodParams, makeDeps({ client: null }).deps)).status).toBe(401);
    expect((await processTokenRequest(true, goodParams, makeDeps({ client: { ...clientRow, disabled_at: "2026-01-01" } }).deps)).status).toBe(401);
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
      expect(r.body.error).toBe("invalid_grant");
    }
  });
  it("fails PKCE verification with a wrong verifier", async () => {
    const r = await processTokenRequest(true, { ...goodParams, code_verifier: `${VERIFIER}x` }, makeDeps().deps);
    expect(r.body.error).toBe("invalid_grant");
  });
  it("issues a Bearer access token: 1h TTL, hash-only storage, NO refresh token", async () => {
    const { deps, calls, insertedTokens } = makeDeps();
    const r = await processTokenRequest(true, goodParams, deps);
    expect(r.status).toBe(200);
    expect(r.body.token_type).toBe("Bearer");
    expect(r.body.expires_in).toBe(3600);
    expect(r.body.access_token).toBe(`${ACCESS_TOKEN_PREFIX}testtoken`);
    expect(r.body.scope).toBe(READ_SCOPES.join(" "));
    expect(r.body).not.toHaveProperty("refresh_token");
    expect(calls).toEqual(["consumeCode", "insertToken"]);
    const row = insertedTokens[0];
    expect(row.access_token_hash).toBe(await sha256Hex(`${ACCESS_TOKEN_PREFIX}testtoken`));
    expect(row.refresh_token_hash).toBeNull();
    expect(row.refresh_family_id).toBeNull();
    expect(row.access_expires_at).toBe(new Date(NOW + ACCESS_TOKEN_TTL_MS).toISOString());
    expect(JSON.stringify(row)).not.toContain("testtoken");
  });
  it("strips offline_access from the issued token's scope", async () => {
    const code = { ...codeRow, scope: `${READ_SCOPES.join(" ")} offline_access` };
    const r = await processTokenRequest(true, goodParams, makeDeps({ code }).deps);
    expect(r.status).toBe(200);
    expect(r.body.scope).toBe(READ_SCOPES.join(" "));
  });
});

describe("buildAccessTokenRow / tokenSuccessResponse", () => {
  it("carries user/client/resource from the code row and never a refresh token", () => {
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
  it("shapes the success body per RFC 6749", () => {
    expect(tokenSuccessResponse("tok", "s", 3600)).toEqual({ access_token: "tok", token_type: "Bearer", expires_in: 3600, scope: "s" });
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
    expect(validateAccessTokenRow({ ...row, access_expires_at: new Date(NOW - 1).toISOString() }, NOW)).toBeNull();
    expect(validateAccessTokenRow({ ...row, resource: "https://other.example/api" }, NOW)).toBeNull();
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
    expect(classifyConsentRequest({ ...req, consumed_at: "2026-01-01" }, {}, NOW)).toEqual({ ok: false, reason: "already_used" });
    expect(classifyConsentRequest({ ...req, expires_at: new Date(NOW - 1).toISOString() }, {}, NOW)).toEqual({ ok: false, reason: "expired" });
    expect(classifyConsentRequest(req, null, NOW)).toEqual({ ok: false, reason: "invalid_client" });
    expect(classifyConsentRequest(req, { disabled_at: "2026-01-01" }, NOW)).toEqual({ ok: false, reason: "invalid_client" });
  });
  it("normalizes a valid pending request", () => {
    expect(classifyConsentRequest(req, { disabled_at: null }, NOW)).toEqual({
      ok: true,
      normalized: { clientId: "c", redirectUri: CALLBACK, scope: "milo.projects.read", state: "xyz" },
    });
  });
});

describe("scope consent labels", () => {
  it("has a human label for every advertised scope", () => {
    for (const s of OAUTH_SCOPES) expect(SCOPE_LABELS[s]).toBeTruthy();
  });
  it("does not label offline_access (not issued this phase)", () => {
    expect(SCOPE_LABELS["offline_access"]).toBeUndefined();
  });
  it("maps scopes to labels and falls back to the raw scope", () => {
    expect(scopeConsentItems("milo.projects.read unknown.scope")).toEqual([
      { scope: "milo.projects.read", label: "See your projects and brand profile" },
      { scope: "unknown.scope", label: "unknown.scope" },
    ]);
  });
});
