/**
 * Claude.ai Custom Connector (OAuth) — Phase 1 foundation.
 *
 * Pure, server-safe metadata + feature-flag helpers. No secrets, no DB, no
 * token logic yet (that arrives in later phases). Everything the connector does
 * is gated by MCP_OAUTH_ENABLED so the flag-off state is identical to today.
 *
 * Endpoints referenced here are PLACEHOLDERS advertised in metadata; they are
 * not implemented in Phase 1.
 */

export const OAUTH_BASE_URL = "https://milogrowth.com";
export const MCP_RESOURCE_URL = `${OAUTH_BASE_URL}/api/mcp`;
export const PROTECTED_RESOURCE_METADATA_URL = `${OAUTH_BASE_URL}/.well-known/oauth-protected-resource`;

export const OAUTH_AUTHORIZE_ENDPOINT = `${OAUTH_BASE_URL}/api/oauth/authorize`;
export const OAUTH_TOKEN_ENDPOINT = `${OAUTH_BASE_URL}/api/oauth/token`;
export const OAUTH_REGISTRATION_ENDPOINT = `${OAUTH_BASE_URL}/api/oauth/register`;
export const OAUTH_REVOCATION_ENDPOINT = `${OAUTH_BASE_URL}/api/oauth/revoke`;

/**
 * v1 advertised + effective scopes — read-only only. No write/publish/billing.
 *
 * offline_access is intentionally NOT advertised or issued: refresh tokens are
 * not implemented yet, so advertising it would make Claude expect a refresh
 * token it never receives. It is tolerated on INPUT (so a Claude request that
 * includes it does not fail) but is dropped from effective/issued scopes and
 * never appears in metadata, consent, or access tokens. Re-add it here only
 * once refresh-token support exists.
 */
export const OAUTH_SCOPES = [
  "milo.projects.read",
  "milo.content.read",
  "milo.insights.read",
  "milo.authority.read",
] as const;

/** Scopes accepted on incoming requests but never advertised or issued. */
const TOLERATED_INPUT_SCOPES = ["offline_access"];

/** Whether the OAuth connector is enabled. Off ⇒ production behaves as today. */
export function isOAuthEnabled(): boolean {
  return (process.env.MCP_OAUTH_ENABLED ?? "").trim().toLowerCase() === "true";
}

/** RFC 9728 — OAuth 2.0 Protected Resource Metadata for the MCP endpoint. */
export function protectedResourceMetadata(): Record<string, unknown> {
  return {
    resource: MCP_RESOURCE_URL,
    authorization_servers: [OAUTH_BASE_URL],
    scopes_supported: [...OAUTH_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "Milo Growth",
    resource_documentation: `${OAUTH_BASE_URL}/docs`,
  };
}

/** RFC 8414 — OAuth 2.0 Authorization Server Metadata. issuer == OAUTH_BASE_URL. */
export function authorizationServerMetadata(): Record<string, unknown> {
  return {
    issuer: OAUTH_BASE_URL,
    authorization_endpoint: OAUTH_AUTHORIZE_ENDPOINT,
    token_endpoint: OAUTH_TOKEN_ENDPOINT,
    registration_endpoint: OAUTH_REGISTRATION_ENDPOINT,
    revocation_endpoint: OAUTH_REVOCATION_ENDPOINT,
    scopes_supported: [...OAUTH_SCOPES],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    // Only authorization_code is implemented (no refresh tokens yet), so we do
    // not advertise refresh_token to avoid a metadata/behaviour mismatch.
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
  };
}

/**
 * WWW-Authenticate value for a 401 from the MCP resource server. With the flag
 * on we point Claude at the protected-resource metadata (RFC 9728 §5.1) so it
 * can begin the OAuth flow; with the flag off we keep the current plain value.
 */
export function mcpWwwAuthenticate(enabled: boolean): string {
  return enabled ? `Bearer resource_metadata="${PROTECTED_RESOURCE_METADATA_URL}"` : "Bearer";
}

// ===========================================================================
// Phase 2A — OAuth primitives + Dynamic Client Registration (RFC 7591)
// Pure helpers below are DB-free and unit-tested. DB helpers are at the bottom.
// ===========================================================================

export const CLIENT_ID_PREFIX = "milo_client_";
const ALLOWED_GRANT_TYPES = ["authorization_code", "refresh_token"];
const ALLOWED_RESPONSE_TYPES = ["code"];

// ---- crypto primitives ----
function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Cryptographically-random opaque token/secret (32 bytes, url-safe). */
export function randomToken(prefix = ""): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return `${prefix}${b64url(bytes)}`;
}

/** SHA-256 hex (mirrors mcp.server.sha256Hex; codes/tokens are stored hashed). */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data.buffer.slice(0) as ArrayBuffer);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

export function generateClientId(): string {
  return randomToken(CLIENT_ID_PREFIX);
}

// ---- scope validation ----
export function parseScopes(scope: unknown): string[] {
  if (typeof scope !== "string") return [];
  return Array.from(new Set(scope.split(/\s+/).map((s) => s.trim()).filter(Boolean)));
}

export function isAllowedScope(s: string): boolean {
  return (OAUTH_SCOPES as readonly string[]).includes(s);
}

/** Tolerated on input (e.g. offline_access) — accepted but stripped, never issued. */
export function isToleratedScope(s: string): boolean {
  return TOLERATED_INPUT_SCOPES.includes(s);
}

/**
 * Validate requested scopes. Unknown scopes fail. Tolerated scopes (offline_access)
 * are accepted for Claude compatibility but stripped from the effective set, so
 * they are never bound to codes/tokens or shown in consent.
 */
export function validateScopes(requested: string[]): { ok: true; scopes: string[] } | { ok: false; invalid: string[] } {
  const invalid = requested.filter((s) => !isAllowedScope(s) && !isToleratedScope(s));
  if (invalid.length) return { ok: false, invalid };
  return { ok: true, scopes: requested.filter(isAllowedScope) };
}

// ---- redirect URI validation ----
function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

/** A redirect URI must be an absolute URL, no fragment, https (or http on loopback). */
export function validateRedirectUri(uri: unknown): boolean {
  if (typeof uri !== "string" || !uri.trim()) return false;
  let u: URL;
  try {
    u = new URL(uri.trim());
  } catch {
    return false;
  }
  if (u.hash) return false; // RFC 6749 §3.1.2 — no fragment allowed
  if (u.protocol === "https:") return true;
  if (u.protocol === "http:" && isLoopbackHost(u.hostname)) return true; // local testing only
  return false;
}

// ---- OAuth error bodies ----
export function oauthErrorBody(error: string, description?: string): { error: string; error_description?: string } {
  return description ? { error, error_description: description } : { error };
}

// ---- Dynamic Client Registration ----
export interface NormalizedClient {
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  scope: string;
  client_name?: string;
  software_id?: string;
}

type RegOk = { ok: true; normalized: NormalizedClient };
type RegErr = { ok: false; status: number; body: { error: string; error_description?: string } };

/** Validate an RFC 7591 registration request. Pure — no DB, no id generation. */
export function validateRegistration(input: unknown): RegOk | RegErr {
  const err = (error: string, description: string, status = 400): RegErr => ({ ok: false, status, body: oauthErrorBody(error, description) });
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return err("invalid_client_metadata", "Request body must be a JSON object.");
  }
  const b = input as Record<string, unknown>;

  // redirect_uris — required, non-empty, each valid + exact.
  const rawUris = b.redirect_uris;
  if (!Array.isArray(rawUris) || rawUris.length === 0) {
    return err("invalid_redirect_uri", "redirect_uris is required and must be a non-empty array.");
  }
  if (rawUris.length > 10) return err("invalid_redirect_uri", "Too many redirect URIs.");
  for (const u of rawUris) {
    if (!validateRedirectUri(u)) return err("invalid_redirect_uri", `Invalid redirect URI: ${typeof u === "string" ? u : "<non-string>"}`);
  }
  const redirect_uris = (rawUris as string[]).map((u) => u.trim());

  // token_endpoint_auth_method — v1 supports public clients only.
  const authMethod = b.token_endpoint_auth_method === undefined ? "none" : b.token_endpoint_auth_method;
  if (authMethod !== "none") {
    return err("invalid_client_metadata", "Only public clients (token_endpoint_auth_method \"none\") are supported.");
  }

  // grant_types — must include authorization_code. Default is authorization_code
  // only (we don't advertise/encourage refresh). An explicit refresh_token is
  // still TOLERATED for client compatibility but is never fulfilled.
  const grant_types = b.grant_types === undefined ? ["authorization_code"] : b.grant_types;
  if (!Array.isArray(grant_types) || grant_types.some((g) => !ALLOWED_GRANT_TYPES.includes(g as string))) {
    return err("invalid_client_metadata", "Unsupported grant_types. Allowed: authorization_code, refresh_token.");
  }
  if (!grant_types.includes("authorization_code")) {
    return err("invalid_client_metadata", "grant_types must include authorization_code.");
  }

  // response_types — must be within {code}.
  const response_types = b.response_types === undefined ? ["code"] : b.response_types;
  if (!Array.isArray(response_types) || response_types.some((r) => !ALLOWED_RESPONSE_TYPES.includes(r as string))) {
    return err("invalid_client_metadata", "Unsupported response_types. Only \"code\" is supported.");
  }
  if (!response_types.includes("code")) {
    return err("invalid_client_metadata", "response_types must include code.");
  }

  // scope — optional; default to all allowed. Reject unknown/write/etc.
  let scopes: string[];
  if (b.scope === undefined || b.scope === "") {
    scopes = [...OAUTH_SCOPES];
  } else {
    const requested = parseScopes(b.scope);
    const v = validateScopes(requested);
    if (!v.ok) return err("invalid_scope", `Unknown or disallowed scope(s): ${v.invalid.join(", ")}`);
    scopes = v.scopes;
  }

  const client_name = typeof b.client_name === "string" ? b.client_name.slice(0, 200) : undefined;
  const software_id = typeof b.software_id === "string" ? b.software_id.slice(0, 200) : undefined;

  return {
    ok: true,
    normalized: {
      redirect_uris,
      grant_types: grant_types as string[],
      response_types: response_types as string[],
      token_endpoint_auth_method: "none",
      scope: scopes.join(" "),
      client_name,
      software_id,
    },
  };
}

/** The DB row for a registered client. Never contains a client secret (public). */
export function buildClientRow(clientId: string, n: NormalizedClient, nowIso: string): Record<string, unknown> {
  return {
    client_id: clientId,
    client_secret_hash: null, // public client — no secret ever
    client_name: n.client_name ?? null,
    redirect_uris: n.redirect_uris,
    grant_types: n.grant_types,
    response_types: n.response_types,
    token_endpoint_auth_method: n.token_endpoint_auth_method,
    scope: n.scope,
    software_id: n.software_id ?? null,
    metadata: {},
    created_at: nowIso,
  };
}

/** The RFC 7591 registration response. No client_secret for public clients. */
export function registrationResponse(clientId: string, n: NormalizedClient, issuedAtEpochSec: number): Record<string, unknown> {
  return {
    client_id: clientId,
    client_id_issued_at: issuedAtEpochSec,
    token_endpoint_auth_method: n.token_endpoint_auth_method,
    redirect_uris: n.redirect_uris,
    grant_types: n.grant_types,
    response_types: n.response_types,
    scope: n.scope,
    ...(n.client_name ? { client_name: n.client_name } : {}),
    ...(n.software_id ? { software_id: n.software_id } : {}),
  };
}

/**
 * Orchestrate registration with an injected persistence fn (keeps this unit-
 * testable and DB-free). Returns the HTTP status + JSON body to send.
 */
export async function processClientRegistration(
  enabled: boolean,
  input: unknown,
  deps: { insertClient: (row: Record<string, unknown>) => Promise<void>; clientId: string; nowMs: number },
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!enabled) return { status: 404, body: oauthErrorBody("not_found") };
  const v = validateRegistration(input);
  if (!v.ok) return { status: v.status, body: v.body };
  const nowIso = new Date(deps.nowMs).toISOString();
  const row = buildClientRow(deps.clientId, v.normalized, nowIso);
  await deps.insertClient(row);
  return { status: 201, body: registrationResponse(deps.clientId, v.normalized, Math.floor(deps.nowMs / 1000)) };
}

// ---- DB helpers (service role; lazy import keeps client bundle clean) ----
type Row = Record<string, unknown>;
type SelectChain = {
  eq: (k: string, v: string) => SelectChain;
  is: (k: string, v: null) => SelectChain;
  maybeSingle: () => Promise<{ data: Row | null; error: unknown }>;
};
type UpdateChain = {
  eq: (k: string, v: string) => UpdateChain;
  is: (k: string, v: null) => UpdateChain;
} & Promise<{ error: unknown }>;
type Table = {
  select: (c: string) => SelectChain;
  insert: (r: unknown) => Promise<{ error: { message: string } | null }>;
  update: (r: unknown) => UpdateChain;
};

async function admin(): Promise<{ from: (t: string) => Table }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => Table };
}

/** Persist a registered client. Throws on failure (route maps to 500). */
export async function insertOAuthClient(row: Record<string, unknown>): Promise<void> {
  const db = await admin();
  const { error } = await db.from("oauth_clients").insert(row);
  if (error) throw new Error("client_insert_failed");
}

/** Load a registered client (safe subset). Returns null if unknown. */
export interface OAuthClientRow {
  client_id: string;
  client_name: string | null;
  redirect_uris: string[];
  scope: string | null;
  disabled_at: string | null;
}
export async function getOAuthClient(clientId: string): Promise<OAuthClientRow | null> {
  if (!clientId) return null;
  const db = await admin();
  const { data } = await db.from("oauth_clients").select("client_id,client_name,redirect_uris,scope,disabled_at").eq("client_id", clientId).maybeSingle();
  if (!data) return null;
  return {
    client_id: String(data.client_id ?? ""),
    client_name: (data.client_name as string | null) ?? null,
    redirect_uris: Array.isArray(data.redirect_uris) ? (data.redirect_uris as string[]) : [],
    scope: (data.scope as string | null) ?? null,
    disabled_at: (data.disabled_at as string | null) ?? null,
  };
}

export async function insertConsent(userId: string, clientId: string, scope: string): Promise<void> {
  try {
    const db = await admin();
    await db.from("oauth_consents").insert({ user_id: userId, client_id: clientId, scope, granted_at: new Date().toISOString() });
  } catch {
    /* consent record is best-effort (drives the connected-apps list later) */
  }
}

export async function insertAuthorizationRequest(row: Record<string, unknown>): Promise<void> {
  const db = await admin();
  const { error } = await db.from("oauth_authorization_requests").insert(row);
  if (error) throw new Error("auth_request_insert_failed");
}

export async function getAuthorizationRequest(id: string): Promise<Row | null> {
  if (!id) return null;
  const db = await admin();
  const { data } = await db.from("oauth_authorization_requests").select("*").eq("id", id).maybeSingle();
  return data ?? null;
}

/** Mark a pending request consumed (only if not already). */
export async function consumeAuthorizationRequest(id: string): Promise<void> {
  const db = await admin();
  await db.from("oauth_authorization_requests").update({ consumed_at: new Date().toISOString() }).eq("id", id).is("consumed_at", null);
}

export async function insertAuthorizationCode(row: Record<string, unknown>): Promise<void> {
  const db = await admin();
  const { error } = await db.from("oauth_authorization_codes").insert(row);
  if (error) throw new Error("auth_code_insert_failed");
}

export async function getAuthorizationCodeByHash(codeHash: string): Promise<Row | null> {
  if (!codeHash) return null;
  const db = await admin();
  const { data } = await db.from("oauth_authorization_codes").select("*").eq("code_hash", codeHash).maybeSingle();
  return data ?? null;
}

/** Mark an authorization code consumed (only if not already). */
export async function consumeAuthorizationCode(codeHash: string): Promise<void> {
  const db = await admin();
  await db.from("oauth_authorization_codes").update({ consumed_at: new Date().toISOString() }).eq("code_hash", codeHash).is("consumed_at", null);
}

export async function insertAccessToken(row: Record<string, unknown>): Promise<void> {
  const db = await admin();
  const { error } = await db.from("oauth_tokens").insert(row);
  if (error) throw new Error("access_token_insert_failed");
}

export interface ResolvedAccessToken {
  userId: string;
  clientId: string;
  scope: string;
  resource: string | null;
}

/**
 * Validate a fetched oauth_tokens row (Phase 4). Pure. Returns null for any
 * failure — unknown (null), revoked, expired, or wrong audience — so callers
 * give a uniform 401 without leaking which condition occurred.
 */
export function validateAccessTokenRow(row: Row | null, nowMs: number): ResolvedAccessToken | null {
  if (!row) return null;
  if (row.revoked_at) return null;
  const exp = typeof row.access_expires_at === "string" ? Date.parse(row.access_expires_at) : 0;
  if (!exp || exp < nowMs) return null;
  if (String(row.resource ?? "") !== MCP_RESOURCE_URL) return null;
  return {
    userId: String(row.user_id ?? ""),
    clientId: String(row.client_id ?? ""),
    scope: String(row.scope ?? ""),
    resource: (row.resource as string | null) ?? null,
  };
}

/**
 * Resolve a bearer as an OAuth access token. Fetches by hash, validates, and
 * updates last_used_at. Never logs the token.
 */
export async function resolveAccessToken(token: string): Promise<ResolvedAccessToken | null> {
  if (!token) return null;
  const hash = await sha256Hex(token);
  const db = await admin();
  const { data } = await db
    .from("oauth_tokens")
    .select("user_id,client_id,scope,resource,access_expires_at,revoked_at")
    .eq("access_token_hash", hash)
    .maybeSingle();
  const resolved = validateAccessTokenRow(data, Date.now());
  if (!resolved) return null;
  // Awaited: Cloudflare Workers may terminate the isolate right after the
  // response, dropping un-awaited writes. A failed touch must not fail auth.
  try {
    await db.from("oauth_tokens").update({ last_used_at: new Date().toISOString() }).eq("access_token_hash", hash);
  } catch {
    /* best-effort */
  }
  return resolved;
}

// ===========================================================================
// Phase 2B — authorization request validation + pending request + code issuance
// Pure helpers (DB-free) are unit-tested; the route/consent supply DB + ids.
// ===========================================================================

export const AUTH_REQUEST_TTL_MS = 10 * 60 * 1000; // pending request lives 10 min
export const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // issued code lives 5 min

export interface AuthorizeParams {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  scope?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  resource?: string;
  state?: string;
}

export interface NormalizedAuthorize {
  clientId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  resource: string;
  state?: string;
}

export type AuthorizeOutcome =
  | { kind: "invalid_client" } // do NOT redirect — client unknown/disabled
  | { kind: "invalid_redirect" } // do NOT redirect — redirect_uri untrusted
  | { kind: "redirect_error"; redirectUri: string; error: string; description: string; state?: string }
  | { kind: "ok"; normalized: NormalizedAuthorize };

/**
 * Classify an authorization request against a (already-loaded) client. Pure.
 * Security: client + redirect_uri are validated FIRST; only once redirect_uri is
 * confirmed against the registered set do we emit redirect-based errors.
 */
export function classifyAuthorizeRequest(
  params: AuthorizeParams,
  client: { redirect_uris: string[]; scope?: string | null; disabled_at?: string | null } | null,
): AuthorizeOutcome {
  if (!params.client_id || !client || client.disabled_at) return { kind: "invalid_client" };

  const redirectUri = typeof params.redirect_uri === "string" ? params.redirect_uri.trim() : "";
  if (!redirectUri || !client.redirect_uris.includes(redirectUri)) return { kind: "invalid_redirect" };

  const state = typeof params.state === "string" && params.state ? params.state : undefined;
  const rerr = (error: string, description: string): AuthorizeOutcome => ({ kind: "redirect_error", redirectUri, error, description, state });

  if (params.response_type !== "code") return rerr("unsupported_response_type", "response_type must be 'code'.");
  if (typeof params.code_challenge !== "string" || !params.code_challenge.trim()) return rerr("invalid_request", "code_challenge is required (PKCE).");
  if (params.code_challenge_method !== "S256") return rerr("invalid_request", "code_challenge_method must be S256.");
  // resource: if supplied it must be the MCP URL; if omitted, default to it.
  const providedResource = typeof params.resource === "string" ? params.resource.trim() : "";
  if (providedResource && providedResource !== MCP_RESOURCE_URL) return rerr("invalid_target", "resource must be the Milo MCP URL.");

  let scopes: string[];
  const reqScope = typeof params.scope === "string" ? params.scope.trim() : "";
  if (!reqScope) {
    scopes = client.scope ? parseScopes(client.scope) : [...OAUTH_SCOPES];
  } else {
    const v = validateScopes(parseScopes(reqScope));
    if (!v.ok) return rerr("invalid_scope", `Unknown or disallowed scope(s): ${v.invalid.join(", ")}`);
    scopes = v.scopes;
  }

  return {
    kind: "ok",
    normalized: {
      clientId: params.client_id,
      redirectUri,
      scope: scopes.join(" "),
      codeChallenge: params.code_challenge.trim(),
      codeChallengeMethod: "S256",
      resource: MCP_RESOURCE_URL,
      state,
    },
  };
}

/** Append an OAuth error (+state) to a validated redirect_uri. Pure. */
export function buildRedirectError(redirectUri: string, error: string, description?: string, state?: string): string {
  const u = new URL(redirectUri);
  u.searchParams.set("error", error);
  if (description) u.searchParams.set("error_description", description);
  if (state) u.searchParams.set("state", state);
  return u.toString();
}

/** Append the authorization code (+state) to a validated redirect_uri. Pure. */
export function buildCodeRedirect(redirectUri: string, code: string, state?: string): string {
  const u = new URL(redirectUri);
  u.searchParams.set("code", code);
  if (state) u.searchParams.set("state", state);
  return u.toString();
}

/** The stable internal consent redirect target. Phase 3 renders this page. */
export function consentRedirectPath(requestId: string): string {
  return `/app/connect?req=${encodeURIComponent(requestId)}`;
}

/** DB row for a pending authorization request. Pure. */
export function buildPendingRequestRow(n: NormalizedAuthorize, id: string, expiresAtIso: string): Record<string, unknown> {
  return {
    id,
    client_id: n.clientId,
    redirect_uri: n.redirectUri,
    scope: n.scope,
    code_challenge: n.codeChallenge,
    code_challenge_method: n.codeChallengeMethod,
    resource: n.resource,
    state: n.state ?? null,
    expires_at: expiresAtIso,
  };
}

/** DB row for an issued authorization code (hash only). Pure. */
export function buildAuthCodeRow(pending: Row, userId: string, codeHash: string, expiresAtIso: string): Record<string, unknown> {
  return {
    code_hash: codeHash,
    client_id: String(pending.client_id ?? ""),
    user_id: userId,
    redirect_uri: String(pending.redirect_uri ?? ""),
    scope: String(pending.scope ?? ""),
    code_challenge: String(pending.code_challenge ?? ""),
    code_challenge_method: String(pending.code_challenge_method ?? "S256"),
    resource: (pending.resource as string | null) ?? null,
    expires_at: expiresAtIso,
  };
}

export type IssueCodeResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; reason: "not_found" | "already_used" | "expired" };

/**
 * Convert an APPROVED pending request into a single-use authorization code.
 * Requires an authenticated user id (supplied by the consent server fn). The
 * plaintext code is only used here to build the redirect; only its hash is
 * stored. DB access is injected so the core is unit-testable.
 */
export async function issueAuthorizationCode(
  requestId: string,
  userId: string,
  deps: {
    loadRequest: (id: string) => Promise<Row | null>;
    consumeRequest: (id: string) => Promise<void>;
    insertCode: (row: Record<string, unknown>) => Promise<void>;
    generateCode: () => string;
    hash: (s: string) => Promise<string>;
    nowMs: number;
  },
): Promise<IssueCodeResult> {
  if (!userId) return { ok: false, reason: "not_found" };
  const req = await deps.loadRequest(requestId);
  if (!req) return { ok: false, reason: "not_found" };
  if (req.consumed_at) return { ok: false, reason: "already_used" };
  const expiresAt = typeof req.expires_at === "string" ? Date.parse(req.expires_at) : 0;
  if (!expiresAt || expiresAt < deps.nowMs) return { ok: false, reason: "expired" };

  // Consume first so a race cannot mint two codes from one request.
  await deps.consumeRequest(requestId);

  const code = deps.generateCode();
  const codeHash = await deps.hash(code);
  const codeExpiresIso = new Date(deps.nowMs + AUTH_CODE_TTL_MS).toISOString();
  await deps.insertCode(buildAuthCodeRow(req, userId, codeHash, codeExpiresIso));

  const state = typeof req.state === "string" && req.state ? req.state : undefined;
  return { ok: true, redirectUrl: buildCodeRedirect(String(req.redirect_uri ?? ""), code, state) };
}

// ===========================================================================
// Phase 2C — token endpoint (authorization_code grant + PKCE S256).
// Access token only; no refresh token this phase. Hash-only storage.
// ===========================================================================

export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const ACCESS_TOKEN_PREFIX = "milo_at_";

/** BASE64URL(SHA256(verifier)) — the PKCE S256 transform (RFC 7636). */
export async function pkceChallengeS256(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data.buffer.slice(0) as ArrayBuffer);
  return b64url(new Uint8Array(digest));
}

/** Constant-time-ish S256 verification. */
export async function verifyPkceS256(verifier: string, challenge: string): Promise<boolean> {
  if (!verifier || !challenge) return false;
  const computed = await pkceChallengeS256(verifier);
  if (computed.length !== challenge.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ challenge.charCodeAt(i);
  return diff === 0;
}

export interface TokenParams {
  grant_type?: string;
  client_id?: string;
  client_secret?: string;
  code?: string;
  redirect_uri?: string;
  code_verifier?: string;
  resource?: string;
}

/** DB row for an issued access token (hash only, no refresh token this phase). */
export function buildAccessTokenRow(codeRow: Row, accessHash: string, scope: string, expiresAtIso: string): Record<string, unknown> {
  return {
    user_id: String(codeRow.user_id ?? ""),
    client_id: String(codeRow.client_id ?? ""),
    access_token_hash: accessHash,
    refresh_token_hash: null, // Phase 2C: no refresh token
    refresh_family_id: null,
    scope,
    resource: (codeRow.resource as string | null) ?? null,
    access_expires_at: expiresAtIso,
    refresh_expires_at: null,
  };
}

export function tokenSuccessResponse(accessToken: string, scope: string, expiresInSec: number): Record<string, unknown> {
  return { access_token: accessToken, token_type: "Bearer", expires_in: expiresInSec, scope };
}

export interface TokenDeps {
  getClient: (clientId: string) => Promise<OAuthClientRow | null>;
  getCodeByHash: (codeHash: string) => Promise<Row | null>;
  consumeCode: (codeHash: string) => Promise<void>;
  insertToken: (row: Record<string, unknown>) => Promise<void>;
  hash: (s: string) => Promise<string>;
  generateToken: () => string;
  nowMs: number;
}

/**
 * Process an OAuth token request (authorization_code grant only). PKCE S256 is
 * required. Returns the HTTP status + JSON body. The plaintext access token is
 * only in the returned body — never stored or logged. DB access is injected so
 * the core is unit-testable.
 */
export async function processTokenRequest(
  enabled: boolean,
  params: TokenParams,
  deps: TokenDeps,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!enabled) return { status: 404, body: oauthErrorBody("not_found") };

  const err = (error: string, description: string, status = 400) => ({ status, body: oauthErrorBody(error, description) });

  // ---- param presence + grant type ----
  if (!params.grant_type) return err("invalid_request", "grant_type is required.");
  if (params.grant_type !== "authorization_code") return err("unsupported_grant_type", "Only authorization_code is supported.");
  if (!params.client_id) return err("invalid_request", "client_id is required.");
  if (!params.code) return err("invalid_request", "code is required.");
  if (!params.redirect_uri) return err("invalid_request", "redirect_uri is required.");
  if (!params.code_verifier) return err("invalid_request", "code_verifier is required (PKCE).");
  // Public/PKCE clients must not present a secret.
  if (params.client_secret) return err("invalid_client", "This is a public client; do not send a client secret.", 401);

  // ---- resource: if supplied it must be the MCP URL; if omitted, default to it.
  const providedResource = typeof params.resource === "string" ? params.resource.trim() : "";
  if (providedResource && providedResource !== MCP_RESOURCE_URL) {
    return err("invalid_target", "resource must be the Milo MCP URL.");
  }

  // ---- client ----
  const client = await deps.getClient(params.client_id);
  if (!client || client.disabled_at) return err("invalid_client", "Unknown or disabled client.", 401);

  // ---- authorization code (uniform invalid_grant to avoid existence leaks) ----
  const badGrant = err("invalid_grant", "The authorization code is invalid, expired, or already used.");
  const codeHash = await deps.hash(params.code);
  const codeRow = await deps.getCodeByHash(codeHash);
  if (!codeRow) return badGrant;
  if (codeRow.consumed_at) return badGrant;
  const codeExp = typeof codeRow.expires_at === "string" ? Date.parse(codeRow.expires_at) : 0;
  if (!codeExp || codeExp < deps.nowMs) return badGrant;
  if (String(codeRow.client_id ?? "") !== params.client_id) return badGrant;
  if (String(codeRow.redirect_uri ?? "") !== params.redirect_uri) return badGrant;
  // resource binding: if the request supplied one it must equal the code's
  // (codes are always bound to the default MCP resource; omitted → no check).
  if (providedResource && String(codeRow.resource ?? "") !== providedResource) return badGrant;

  // ---- PKCE S256 ----
  if (String(codeRow.code_challenge_method ?? "") !== "S256") return badGrant;
  const pkceOk = await verifyPkceS256(params.code_verifier, String(codeRow.code_challenge ?? ""));
  if (!pkceOk) return err("invalid_grant", "PKCE verification failed.");

  // ---- consume (single-use) then issue ----
  await deps.consumeCode(codeHash);

  // offline_access has no effect this phase (no refresh token); drop it from the
  // access token's effective + returned scope to avoid implying refresh support.
  const tokenScope = parseScopes(String(codeRow.scope ?? "")).filter((s) => s !== "offline_access").join(" ");

  const accessToken = deps.generateToken();
  const accessHash = await deps.hash(accessToken);
  const expiresAtIso = new Date(deps.nowMs + ACCESS_TOKEN_TTL_MS).toISOString();
  await deps.insertToken(buildAccessTokenRow(codeRow, accessHash, tokenScope, expiresAtIso));

  return { status: 200, body: tokenSuccessResponse(accessToken, tokenScope, Math.floor(ACCESS_TOKEN_TTL_MS / 1000)) };
}

// ===========================================================================
// Phase 3 — consent screen helpers (pure). The consent server fns supply DB.
// ===========================================================================

/** Human-readable scope labels for the consent UI (read-only v1; no offline_access). */
export const SCOPE_LABELS: Record<string, string> = {
  "milo.projects.read": "See your projects and brand profile",
  "milo.content.read": "Read your opportunities, drafts and Milo Scores",
  "milo.insights.read": "Read your audits and Search Console summaries",
  "milo.authority.read": "Read your authority opportunities",
};

export function scopeConsentItems(scope: string): { scope: string; label: string }[] {
  return parseScopes(scope).map((s) => ({ scope: s, label: SCOPE_LABELS[s] ?? s }));
}

export type ConsentReason = "not_found" | "expired" | "already_used" | "invalid_client";
export type ConsentClassification =
  | { ok: true; normalized: { clientId: string; redirectUri: string; scope: string; state?: string } }
  | { ok: false; reason: ConsentReason };

/** Validate a pending request + its client for the consent screen. Pure. */
export function classifyConsentRequest(
  requestRow: Row | null,
  client: { disabled_at?: string | null } | null,
  nowMs: number,
): ConsentClassification {
  if (!requestRow) return { ok: false, reason: "not_found" };
  if (requestRow.consumed_at) return { ok: false, reason: "already_used" };
  const exp = typeof requestRow.expires_at === "string" ? Date.parse(requestRow.expires_at) : 0;
  if (!exp || exp < nowMs) return { ok: false, reason: "expired" };
  if (!client || client.disabled_at) return { ok: false, reason: "invalid_client" };
  return {
    ok: true,
    normalized: {
      clientId: String(requestRow.client_id ?? ""),
      redirectUri: String(requestRow.redirect_uri ?? ""),
      scope: String(requestRow.scope ?? ""),
      state: typeof requestRow.state === "string" && requestRow.state ? requestRow.state : undefined,
    },
  };
}

/** access_denied redirect for the Cancel action (redirect_uri already trusted). */
export function buildDenyRedirect(redirectUri: string, state?: string): string {
  return buildRedirectError(redirectUri, "access_denied", undefined, state);
}

/** Best-effort audit log (no secrets). Never throws. */
export async function logOAuthEvent(event: string, opts: { clientId?: string; userId?: string; detail?: Record<string, unknown> } = {}): Promise<void> {
  try {
    const db = await admin();
    await db.from("oauth_audit_log").insert({
      event,
      client_id: opts.clientId ?? null,
      user_id: opts.userId ?? null,
      detail: opts.detail ?? {},
    });
  } catch {
    /* audit is best-effort */
  }
}
