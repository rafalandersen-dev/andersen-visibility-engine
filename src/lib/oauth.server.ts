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
import { MILO_ACTIONS_PROPOSE_SCOPE } from "./pending-actions";

export const OAUTH_BASE_URL = "https://milogrowth.com";
export const MCP_RESOURCE_URL = `${OAUTH_BASE_URL}/api/mcp`;
export const PROTECTED_RESOURCE_METADATA_URL = `${OAUTH_BASE_URL}/.well-known/oauth-protected-resource`;

export const OAUTH_AUTHORIZE_ENDPOINT = `${OAUTH_BASE_URL}/api/oauth/authorize`;
export const OAUTH_TOKEN_ENDPOINT = `${OAUTH_BASE_URL}/api/oauth/token`;
export const OAUTH_REGISTRATION_ENDPOINT = `${OAUTH_BASE_URL}/api/oauth/register`;
export const OAUTH_REVOCATION_ENDPOINT = `${OAUTH_BASE_URL}/api/oauth/revoke`;

/**
 * Resource (tool-enforcement) scopes — read-only only. No write/publish/
 * billing. This set drives PRM metadata and per-tool scope checks.
 */
export const OAUTH_SCOPES = [
  "milo.projects.read",
  "milo.content.read",
  "milo.insights.read",
  "milo.authority.read",
] as const;

/** Grants a refresh token (commit 6). AS-level scope, never a resource scope. */
export const OFFLINE_ACCESS_SCOPE = "offline_access";

/**
 * The DEFAULT grant set: the 4 read scopes plus offline_access. Advertised in
 * AS metadata and used as the default scope set for registration/authorize,
 * so standard Claude.ai flows get a read-only connection with a refresh token.
 */
export const OAUTH_ISSUABLE_SCOPES = [...OAUTH_SCOPES, OFFLINE_ACCESS_SCOPE] as const;

/**
 * Phase 1A write scopes — issuable ONLY when MCP_WRITE_TOOLS_ENABLED is true
 * AND the request names them explicitly. Never part of any default set and
 * deliberately NOT advertised in PRM/AS metadata yet (Claude.ai requests
 * everything advertised, which would make writes a default grant). There is
 * no umbrella milo.write, and settings/insights/authority write scopes are
 * intentionally undefined so they can never be granted.
 */
export const MCP_WRITE_SCOPES = [
  "milo.projects.write",
  "milo.content.write",
  "milo.tasks.write",
] as const;

/**
 * Phase 1B propose scope — "Claude may PROPOSE, not apply". Weaker than the
 * write scopes (proposals only land after owner approval in the Milo UI) but
 * write-CLASS in gating: explicit-only, issuable only under
 * MCP_WRITE_TOOLS_ENABLED (decision §11.1 — no separate flag), and never
 * advertised in PRM/AS metadata.
 */
export const MCP_PROPOSE_SCOPE = MILO_ACTIONS_PROPOSE_SCOPE;

/** Reserved for Phase 1C (approved publishing). NON-ISSUABLE regardless of flags. */
export const MCP_PUBLISH_SCOPE = "milo.content.publish";

/**
 * Write scopes ADVERTISED in metadata when MCP_WRITE_TOOLS_ENABLED is on
 * (owner decision 2026-08-20 — "writes on the claude.ai web connector").
 *
 * This is a deliberate, scoped relaxation of the original never-advertise rule:
 * because Claude.ai's hosted connector requests exactly the advertised resource
 * scopes and cannot be handed a write token any other way, the ONLY route to
 * one-click writes on the web app is to advertise them and let the amber
 * consent screen be the guard (that screen is data-driven from the requested
 * scopes, so it renders these correctly and keeps Publish/Delete/Settings off).
 *
 * Restricted to the two scopes that back a SHIPPED, smoke-verified write tool
 * (create_growth_task, create_project_recommendation). `milo.content.write`
 * (no tool yet) and `milo.actions.propose` (Phase 1B, not smoke-verified) stay
 * issuable-but-UNadvertised — grantable only by an explicit request, exactly
 * as all writes were before this change.
 */
export const ADVERTISED_WRITE_SCOPES = ["milo.projects.write", "milo.tasks.write"] as const;

/** The scopes the AS may grant, given the write flag. Publish is never included. */
export function issuableScopes(writeEnabled: boolean): string[] {
  return writeEnabled
    ? [...OAUTH_ISSUABLE_SCOPES, ...MCP_WRITE_SCOPES, MCP_PROPOSE_SCOPE]
    : [...OAUTH_ISSUABLE_SCOPES];
}

/** Whether the OAuth connector is enabled. Off ⇒ production behaves as today. */
export function isOAuthEnabled(): boolean {
  return (process.env.MCP_OAUTH_ENABLED ?? "").trim().toLowerCase() === "true";
}

/**
 * Whether WRITE scopes are issuable (Phase 1A). Default off. Subordinate to
 * MCP_OAUTH_ENABLED: with OAuth off there is no surface for this flag to act
 * on. Turning it on does NOT change metadata or defaults — write scopes are
 * granted only when a request names them explicitly (see issuableScopes).
 */
export function isWriteToolsEnabled(): boolean {
  return (process.env.MCP_WRITE_TOOLS_ENABLED ?? "").trim().toLowerCase() === "true";
}

/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata for the MCP endpoint.
 * `writeEnabled` (from MCP_WRITE_TOOLS_ENABLED, passed by the route) appends the
 * advertised write scopes so the Claude.ai connector requests them; flag-off
 * this is byte-identical to the original read-only metadata.
 */
export function protectedResourceMetadata(writeEnabled = false): Record<string, unknown> {
  return {
    resource: MCP_RESOURCE_URL,
    authorization_servers: [OAUTH_BASE_URL],
    scopes_supported: writeEnabled
      ? [...OAUTH_SCOPES, ...ADVERTISED_WRITE_SCOPES]
      : [...OAUTH_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "Milo Growth",
    resource_documentation: `${OAUTH_BASE_URL}/docs`,
  };
}

/** RFC 8414 — OAuth 2.0 Authorization Server Metadata. issuer == OAUTH_BASE_URL. */
export function authorizationServerMetadata(writeEnabled = false): Record<string, unknown> {
  return {
    issuer: OAUTH_BASE_URL,
    authorization_endpoint: OAUTH_AUTHORIZE_ENDPOINT,
    token_endpoint: OAUTH_TOKEN_ENDPOINT,
    registration_endpoint: OAUTH_REGISTRATION_ENDPOINT,
    revocation_endpoint: OAUTH_REVOCATION_ENDPOINT,
    // AS-level scopes include offline_access (refresh tokens, commit 6); the
    // PRM keeps only the resource scopes. Both widen with the advertised write
    // scopes when MCP_WRITE_TOOLS_ENABLED is on.
    scopes_supported: writeEnabled
      ? [...OAUTH_ISSUABLE_SCOPES, ...ADVERTISED_WRITE_SCOPES]
      : [...OAUTH_ISSUABLE_SCOPES],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
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
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    data.buffer.slice(0) as ArrayBuffer,
  );
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
  return Array.from(
    new Set(
      scope
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

export function isAllowedScope(s: string): boolean {
  return (OAUTH_ISSUABLE_SCOPES as readonly string[]).includes(s);
}

/**
 * Validate requested scopes against an allowed set (defaults to the read +
 * offline_access set; callers issuing under the write flag pass
 * issuableScopes(true)). Unknown scopes fail — including the reserved publish
 * scope, which is in no allowed set this phase.
 */
export function validateScopes(
  requested: string[],
  allowed: readonly string[] = OAUTH_ISSUABLE_SCOPES,
): { ok: true; scopes: string[] } | { ok: false; invalid: string[] } {
  const invalid = requested.filter((s) => !allowed.includes(s));
  if (invalid.length) return { ok: false, invalid };
  return { ok: true, scopes: requested.filter((s) => allowed.includes(s)) };
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
export function oauthErrorBody(
  error: string,
  description?: string,
): { error: string; error_description?: string } {
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

/** Validate an RFC 7591 registration request. Pure — no DB, no id generation.
 * writeEnabled widens the ALLOWED set only; the no-scope DEFAULT never widens. */
export function validateRegistration(input: unknown, writeEnabled = false): RegOk | RegErr {
  const err = (error: string, description: string, status = 400): RegErr => ({
    ok: false,
    status,
    body: oauthErrorBody(error, description),
  });
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
    if (!validateRedirectUri(u))
      return err(
        "invalid_redirect_uri",
        `Invalid redirect URI: ${typeof u === "string" ? u : "<non-string>"}`,
      );
  }
  const redirect_uris = (rawUris as string[]).map((u) => u.trim());

  // token_endpoint_auth_method — v1 supports public clients only.
  const authMethod =
    b.token_endpoint_auth_method === undefined ? "none" : b.token_endpoint_auth_method;
  if (authMethod !== "none") {
    return err(
      "invalid_client_metadata",
      'Only public clients (token_endpoint_auth_method "none") are supported.',
    );
  }

  // grant_types — must include authorization_code. Default is authorization_code
  // only (we don't advertise/encourage refresh). An explicit refresh_token is
  // still TOLERATED for client compatibility but is never fulfilled.
  const grant_types = b.grant_types === undefined ? ["authorization_code"] : b.grant_types;
  if (
    !Array.isArray(grant_types) ||
    grant_types.some((g) => !ALLOWED_GRANT_TYPES.includes(g as string))
  ) {
    return err(
      "invalid_client_metadata",
      "Unsupported grant_types. Allowed: authorization_code, refresh_token.",
    );
  }
  if (!grant_types.includes("authorization_code")) {
    return err("invalid_client_metadata", "grant_types must include authorization_code.");
  }

  // response_types — must be within {code}.
  const response_types = b.response_types === undefined ? ["code"] : b.response_types;
  if (
    !Array.isArray(response_types) ||
    response_types.some((r) => !ALLOWED_RESPONSE_TYPES.includes(r as string))
  ) {
    return err("invalid_client_metadata", 'Unsupported response_types. Only "code" is supported.');
  }
  if (!response_types.includes("code")) {
    return err("invalid_client_metadata", "response_types must include code.");
  }

  // scope — optional; DEFAULT is always reads + offline_access (never writes).
  // Explicit scopes validate against the flag-dependent allowed set.
  let scopes: string[];
  if (b.scope === undefined || b.scope === "") {
    scopes = [...OAUTH_ISSUABLE_SCOPES];
  } else {
    const requested = parseScopes(b.scope);
    const v = validateScopes(requested, issuableScopes(writeEnabled));
    if (!v.ok)
      return err("invalid_scope", `Unknown or disallowed scope(s): ${v.invalid.join(", ")}`);
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
export function buildClientRow(
  clientId: string,
  n: NormalizedClient,
  nowIso: string,
): Record<string, unknown> {
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
export function registrationResponse(
  clientId: string,
  n: NormalizedClient,
  issuedAtEpochSec: number,
): Record<string, unknown> {
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
  deps: {
    insertClient: (row: Record<string, unknown>) => Promise<void>;
    clientId: string;
    nowMs: number;
    writeEnabled?: boolean;
  },
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!enabled) return { status: 404, body: oauthErrorBody("not_found") };
  const v = validateRegistration(input, deps.writeEnabled ?? false);
  if (!v.ok) return { status: v.status, body: v.body };
  const nowIso = new Date(deps.nowMs).toISOString();
  const row = buildClientRow(deps.clientId, v.normalized, nowIso);
  await deps.insertClient(row);
  return {
    status: 201,
    body: registrationResponse(deps.clientId, v.normalized, Math.floor(deps.nowMs / 1000)),
  };
}

// ---- DB helpers (service role; lazy import keeps client bundle clean) ----
type Row = Record<string, unknown>;
// Awaiting the chain directly yields the multi-row result (supabase builder
// is thenable); maybeSingle() yields a single row.
type SelectChain = {
  eq: (k: string, v: string) => SelectChain;
  is: (k: string, v: null) => SelectChain;
  in: (k: string, v: string[]) => SelectChain;
  maybeSingle: () => Promise<{ data: Row | null; error: unknown }>;
} & PromiseLike<{ data: Row[] | null; error: unknown }>;
type UpdateChain = {
  eq: (k: string, v: string) => UpdateChain;
  is: (k: string, v: null) => UpdateChain;
} & Promise<{ error: unknown }>;
type Table = {
  select: (c: string) => SelectChain;
  insert: (r: unknown) => Promise<{ error: { message: string } | null }>;
  update: (r: unknown) => UpdateChain;
};

type AdminDb = {
  from: (t: string) => Table;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

async function admin(): Promise<AdminDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AdminDb;
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
  const { data } = await db
    .from("oauth_clients")
    .select("client_id,client_name,redirect_uris,scope,disabled_at")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!data) return null;
  return {
    client_id: String(data.client_id ?? ""),
    client_name: (data.client_name as string | null) ?? null,
    redirect_uris: Array.isArray(data.redirect_uris) ? (data.redirect_uris as string[]) : [],
    scope: (data.scope as string | null) ?? null,
    disabled_at: (data.disabled_at as string | null) ?? null,
  };
}

export async function insertConsent(
  userId: string,
  clientId: string,
  scope: string,
): Promise<void> {
  try {
    const db = await admin();
    await db.from("oauth_consents").insert({
      user_id: userId,
      client_id: clientId,
      scope,
      granted_at: new Date().toISOString(),
    });
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
  const { data } = await db
    .from("oauth_authorization_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

/** Mark a pending request consumed (only if not already). */
export async function consumeAuthorizationRequest(id: string): Promise<void> {
  const db = await admin();
  await db
    .from("oauth_authorization_requests")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", id)
    .is("consumed_at", null);
}

export async function insertAuthorizationCode(row: Record<string, unknown>): Promise<void> {
  const db = await admin();
  const { error } = await db.from("oauth_authorization_codes").insert(row);
  if (error) throw new Error("auth_code_insert_failed");
}

export async function getAuthorizationCodeByHash(codeHash: string): Promise<Row | null> {
  if (!codeHash) return null;
  const db = await admin();
  const { data } = await db
    .from("oauth_authorization_codes")
    .select("*")
    .eq("code_hash", codeHash)
    .maybeSingle();
  return data ?? null;
}

/** Mark an authorization code consumed (only if not already). */
export async function consumeAuthorizationCode(codeHash: string): Promise<void> {
  const db = await admin();
  await db
    .from("oauth_authorization_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("code_hash", codeHash)
    .is("consumed_at", null);
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
    await db
      .from("oauth_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("access_token_hash", hash);
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
  | {
      kind: "redirect_error";
      redirectUri: string;
      error: string;
      description: string;
      state?: string;
    }
  | { kind: "ok"; normalized: NormalizedAuthorize };

/**
 * Classify an authorization request against a (already-loaded) client. Pure.
 * Security: client + redirect_uri are validated FIRST; only once redirect_uri is
 * confirmed against the registered set do we emit redirect-based errors.
 */
export function classifyAuthorizeRequest(
  params: AuthorizeParams,
  client: { redirect_uris: string[]; scope?: string | null; disabled_at?: string | null } | null,
  writeEnabled = false,
): AuthorizeOutcome {
  if (!params.client_id || !client || client.disabled_at) return { kind: "invalid_client" };

  const redirectUri = typeof params.redirect_uri === "string" ? params.redirect_uri.trim() : "";
  if (!redirectUri || !client.redirect_uris.includes(redirectUri))
    return { kind: "invalid_redirect" };

  const state = typeof params.state === "string" && params.state ? params.state : undefined;
  const rerr = (error: string, description: string): AuthorizeOutcome => ({
    kind: "redirect_error",
    redirectUri,
    error,
    description,
    state,
  });

  if (params.response_type !== "code")
    return rerr("unsupported_response_type", "response_type must be 'code'.");
  if (typeof params.code_challenge !== "string" || !params.code_challenge.trim())
    return rerr("invalid_request", "code_challenge is required (PKCE).");
  if (params.code_challenge_method !== "S256")
    return rerr("invalid_request", "code_challenge_method must be S256.");
  // resource: if supplied it must be the MCP URL; if omitted, default to it.
  const providedResource = typeof params.resource === "string" ? params.resource.trim() : "";
  if (providedResource && providedResource !== MCP_RESOURCE_URL)
    return rerr("invalid_target", "resource must be the Milo MCP URL.");

  // No-scope requests fall back to the client's REGISTERED scope (validated at
  // DCR time — a write-scoped registration counts as an explicit request) or
  // the read+offline default. Explicit scopes validate against the
  // flag-dependent allowed set; writes never enter via defaults.
  let scopes: string[];
  const reqScope = typeof params.scope === "string" ? params.scope.trim() : "";
  if (!reqScope) {
    scopes = client.scope ? parseScopes(client.scope) : [...OAUTH_ISSUABLE_SCOPES];
  } else {
    const v = validateScopes(parseScopes(reqScope), issuableScopes(writeEnabled));
    if (!v.ok)
      return rerr("invalid_scope", `Unknown or disallowed scope(s): ${v.invalid.join(", ")}`);
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
export function buildRedirectError(
  redirectUri: string,
  error: string,
  description?: string,
  state?: string,
): string {
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
export function buildPendingRequestRow(
  n: NormalizedAuthorize,
  id: string,
  expiresAtIso: string,
): Record<string, unknown> {
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
export function buildAuthCodeRow(
  pending: Row,
  userId: string,
  codeHash: string,
  expiresAtIso: string,
): Record<string, unknown> {
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
// Token endpoint — authorization_code (+PKCE S256) and, since commit 6,
// refresh_token with rotation + reuse detection. Hash-only storage.
// ===========================================================================

export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const ACCESS_TOKEN_PREFIX = "milo_at_";
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, sliding per rotation
export const REFRESH_TOKEN_PREFIX = "milo_rt_";

/** BASE64URL(SHA256(verifier)) — the PKCE S256 transform (RFC 7636). */
export async function pkceChallengeS256(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    data.buffer.slice(0) as ArrayBuffer,
  );
  return b64url(new Uint8Array(digest));
}

/** Constant-time-ish S256 verification. */
export async function verifyPkceS256(verifier: string, challenge: string): Promise<boolean> {
  if (!verifier || !challenge) return false;
  const computed = await pkceChallengeS256(verifier);
  if (computed.length !== challenge.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++)
    diff |= computed.charCodeAt(i) ^ challenge.charCodeAt(i);
  return diff === 0;
}

export interface TokenParams {
  grant_type?: string;
  client_id?: string;
  client_secret?: string;
  code?: string;
  redirect_uri?: string;
  code_verifier?: string;
  refresh_token?: string;
  scope?: string;
  resource?: string;
}

/** Refresh-token fields for a new oauth_tokens row (hashes only). */
export interface RefreshIssue {
  refreshHash: string;
  familyId: string;
  expiresAtIso: string;
}

/** DB row for an issued access token; refresh columns filled when granted. */
export function buildAccessTokenRow(
  codeRow: Row,
  accessHash: string,
  scope: string,
  expiresAtIso: string,
  refresh?: RefreshIssue,
): Record<string, unknown> {
  return {
    user_id: String(codeRow.user_id ?? ""),
    client_id: String(codeRow.client_id ?? ""),
    access_token_hash: accessHash,
    refresh_token_hash: refresh?.refreshHash ?? null,
    refresh_family_id: refresh?.familyId ?? null,
    scope,
    resource: (codeRow.resource as string | null) ?? null,
    access_expires_at: expiresAtIso,
    refresh_expires_at: refresh?.expiresAtIso ?? null,
  };
}

export function tokenSuccessResponse(
  accessToken: string,
  scope: string,
  expiresInSec: number,
  refreshToken?: string,
): Record<string, unknown> {
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresInSec,
    scope,
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
  };
}

/** Audit instruction returned to the route (never contains token material). */
export interface TokenAudit {
  event: "token_issued" | "token_refreshed" | "token_reuse_detected";
  clientId: string;
  userId?: string;
  detail: Record<string, unknown>;
}

export interface TokenDeps {
  getClient: (clientId: string) => Promise<OAuthClientRow | null>;
  getCodeByHash: (codeHash: string) => Promise<Row | null>;
  consumeCode: (codeHash: string) => Promise<void>;
  insertToken: (row: Record<string, unknown>) => Promise<void>;
  hash: (s: string) => Promise<string>;
  generateToken: () => string;
  generateRefreshToken: () => string;
  generateFamilyId: () => string;
  /** Load an oauth_tokens row by refresh-token hash (any state). */
  getTokenByRefreshHash: (refreshHash: string) => Promise<Row | null>;
  /** Atomically mark a LIVE refresh token rotated; false = lost race / dead. */
  consumeRefreshToken: (refreshHash: string, nowIso: string) => Promise<boolean>;
  /** Revoke every row in a refresh family; returns how many were live. */
  revokeFamily: (familyId: string, nowIso: string) => Promise<number>;
  nowMs: number;
}

/**
 * Process an OAuth token request — authorization_code (+PKCE S256) or
 * refresh_token (rotation + reuse detection). Returns HTTP status + JSON body
 * plus an optional audit instruction for the route. Plaintext tokens exist
 * only in the returned body — never stored or logged. DB access is injected
 * so the core is unit-testable.
 */
export async function processTokenRequest(
  enabled: boolean,
  params: TokenParams,
  deps: TokenDeps,
): Promise<{ status: number; body: Record<string, unknown> | null; audit?: TokenAudit }> {
  if (!enabled) return { status: 404, body: oauthErrorBody("not_found") };

  const err = (error: string, description: string, status = 400) => ({
    status,
    body: oauthErrorBody(error, description),
  });

  // ---- param presence + grant type ----
  if (!params.grant_type) return err("invalid_request", "grant_type is required.");
  if (params.grant_type !== "authorization_code" && params.grant_type !== "refresh_token") {
    return err(
      "unsupported_grant_type",
      "Only authorization_code and refresh_token are supported.",
    );
  }
  if (!params.client_id) return err("invalid_request", "client_id is required.");
  // Public/PKCE clients must not present a secret.
  if (params.client_secret)
    return err("invalid_client", "This is a public client; do not send a client secret.", 401);

  // ---- resource: if supplied it must be the MCP URL; if omitted, default to it.
  const providedResource = typeof params.resource === "string" ? params.resource.trim() : "";
  if (providedResource && providedResource !== MCP_RESOURCE_URL) {
    return err("invalid_target", "resource must be the Milo MCP URL.");
  }

  // ---- client ----
  const client = await deps.getClient(params.client_id);
  if (!client || client.disabled_at)
    return err("invalid_client", "Unknown or disabled client.", 401);

  const nowIso = new Date(deps.nowMs).toISOString();

  /** Issue a new access(+refresh) pair from a source row's grant fields. */
  const issuePair = async (sourceRow: Row, scope: string, familyId: string | null) => {
    const accessToken = deps.generateToken();
    const accessHash = await deps.hash(accessToken);
    const accessExpiresIso = new Date(deps.nowMs + ACCESS_TOKEN_TTL_MS).toISOString();
    const wantsRefresh = parseScopes(scope).includes(OFFLINE_ACCESS_SCOPE);
    let refreshToken: string | undefined;
    let refresh: RefreshIssue | undefined;
    if (wantsRefresh) {
      refreshToken = deps.generateRefreshToken();
      refresh = {
        refreshHash: await deps.hash(refreshToken),
        familyId: familyId ?? deps.generateFamilyId(),
        expiresAtIso: new Date(deps.nowMs + REFRESH_TOKEN_TTL_MS).toISOString(),
      };
    }
    await deps.insertToken(
      buildAccessTokenRow(sourceRow, accessHash, scope, accessExpiresIso, refresh),
    );
    return tokenSuccessResponse(
      accessToken,
      scope,
      Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      refreshToken,
    );
  };

  // =========================================================================
  // refresh_token grant — rotation + reuse detection
  // =========================================================================
  if (params.grant_type === "refresh_token") {
    if (!params.refresh_token) return err("invalid_request", "refresh_token is required.");
    // Uniform error: never reveals whether/why a refresh token is dead.
    const badGrant = err(
      "invalid_grant",
      "The refresh token is invalid, expired, or already used.",
    );

    const refreshHash = await deps.hash(params.refresh_token);
    const row = await deps.getTokenByRefreshHash(refreshHash);
    if (!row) return badGrant;
    // Wrong client presenting a real token: uniform error, NO family kill (a
    // client_id is guessable via DCR; don't let guesses nuke real grants).
    if (String(row.client_id ?? "") !== params.client_id) return badGrant;

    const familyId = (row.refresh_family_id as string | null) ?? null;
    const reuse = async (): Promise<{
      status: number;
      body: Record<string, unknown> | null;
      audit?: TokenAudit;
    }> => {
      let familySize = 0;
      if (familyId) {
        try {
          familySize = await deps.revokeFamily(familyId, nowIso);
        } catch {
          /* family revoke is best-effort on the reuse path; the token itself stays dead */
        }
      }
      return {
        ...badGrant,
        audit: {
          event: "token_reuse_detected",
          clientId: params.client_id!,
          userId: String(row.user_id ?? ""),
          detail: { familySize },
        },
      };
    };

    // Already rotated or revoked → theft signal → kill the family.
    if (row.rotated_at || row.revoked_at) return reuse();
    // Naturally expired → plain rejection, no family kill.
    const rExp =
      typeof row.refresh_expires_at === "string" ? Date.parse(row.refresh_expires_at) : 0;
    if (!rExp || rExp < deps.nowMs) return badGrant;
    // Optional scope param must equal the original grant (no narrowing in v1).
    const originalScope = String(row.scope ?? "");
    if (typeof params.scope === "string" && params.scope.trim()) {
      const requested = parseScopes(params.scope).sort().join(" ");
      if (requested !== parseScopes(originalScope).sort().join(" ")) {
        return err("invalid_scope", "scope must match the original grant.");
      }
    }

    // Atomic consume — losing the race means another isolate already rotated
    // this token, which is indistinguishable from replay: reuse semantics.
    const won = await deps.consumeRefreshToken(refreshHash, nowIso);
    if (!won) return reuse();

    const body = await issuePair(row, originalScope, familyId);
    return {
      status: 200,
      body,
      audit: {
        event: "token_refreshed",
        clientId: params.client_id,
        userId: String(row.user_id ?? ""),
        detail: { scope: originalScope },
      },
    };
  }

  // =========================================================================
  // authorization_code grant (+PKCE S256)
  // =========================================================================
  if (!params.code) return err("invalid_request", "code is required.");
  if (!params.redirect_uri) return err("invalid_request", "redirect_uri is required.");
  if (!params.code_verifier) return err("invalid_request", "code_verifier is required (PKCE).");

  // ---- authorization code (uniform invalid_grant to avoid existence leaks) ----
  const badGrant = err(
    "invalid_grant",
    "The authorization code is invalid, expired, or already used.",
  );
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

  // Since commit 6, offline_access is kept: it drives refresh-token issuance
  // inside issuePair and appears in the response scope.
  const tokenScope = String(codeRow.scope ?? "");
  const body = await issuePair(codeRow, tokenScope, null);
  return {
    status: 200,
    body,
    audit: {
      event: "token_issued",
      clientId: params.client_id,
      userId: String(codeRow.user_id ?? ""),
      detail: { scope: tokenScope },
    },
  };
}

// ===========================================================================
// Phase 0 (trust foundation) — DB-backed fixed-window rate limiting.
// Counters live in oauth_rate_limits (Workers isolates share no memory).
// Keys are SHA-256 of a per-bucket salt prefix + identifier — raw IPs/tokens
// never reach the table, and the salt prefixes keep mcp bearer-token keys
// unjoinable against oauth_tokens.access_token_hash. Increment-then-check;
// FAIL-OPEN on any DB error (availability over strictness for an abuse guard).
// ===========================================================================

export interface RateBucket {
  bucket: string;
  limit: number;
  windowSec: number;
  saltPrefix: string;
}

/** Approved Phase 0 limits. Constants — tune here, redeploy to change. */
export const RATE_BUCKETS = {
  register: { bucket: "register", limit: 10, windowSec: 3600, saltPrefix: "rl:reg:" },
  tokenIp: { bucket: "token_ip", limit: 30, windowSec: 3600, saltPrefix: "rl:tok:" },
  tokenClient: { bucket: "token_client", limit: 15, windowSec: 3600, saltPrefix: "rl:tok:c:" },
  mcpToken: { bucket: "mcp", limit: 120, windowSec: 300, saltPrefix: "rl:mcp:" },
  mcpAnon: { bucket: "mcp_anon", limit: 30, windowSec: 300, saltPrefix: "rl:mcpa:" },
  /** Phase 1A — MCP write tools, per bearer token. */
  write: { bucket: "write", limit: 30, windowSec: 3600, saltPrefix: "rl:wr:" },
  /** Public analytics ingestion, per site-visitor IP (P1-11). Generous for a
   * human browsing a customer's site; a flood from one address hits the wall. */
  analyticsIp: { bucket: "analytics_ip", limit: 240, windowSec: 300, saltPrefix: "rl:an:" },
} as const;

/** Fixed-window boundary + seconds until the window rolls over. Pure. */
export function rateWindowStart(
  nowMs: number,
  windowSec: number,
): { startIso: string; retryAfterSec: number } {
  const windowMs = windowSec * 1000;
  const startMs = Math.floor(nowMs / windowMs) * windowMs;
  return {
    startIso: new Date(startMs).toISOString(),
    retryAfterSec: Math.max(1, Math.ceil((startMs + windowMs - nowMs) / 1000)),
  };
}

/** Salted hash key for a bucket. Empty identifier (no CF header, local dev) → shared "noip" key. */
export async function rateLimitKey(bucket: RateBucket, identifier: string): Promise<string> {
  return sha256Hex(bucket.saltPrefix + (identifier || "noip"));
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets (for Retry-After). */
  retryAfterSec: number;
  /** True exactly when this request is the FIRST over-limit one in its window
   * (count == limit + 1) — the caller writes one rate_limited audit event. */
  shouldAudit: boolean;
  windowStartIso: string;
}

export interface RateLimitDeps {
  /** Atomically increment (bucket,key,window) and return the new count. */
  bump: (bucket: string, key: string, windowStartIso: string) => Promise<number>;
  nowMs: number;
}

/** Increment-then-check. A bump failure fails OPEN (request allowed). */
export async function checkRateLimit(
  bucket: RateBucket,
  identifier: string,
  deps: RateLimitDeps,
): Promise<RateLimitResult> {
  const { startIso, retryAfterSec } = rateWindowStart(deps.nowMs, bucket.windowSec);
  const key = await rateLimitKey(bucket, identifier);
  let count: number;
  try {
    count = await deps.bump(bucket.bucket, key, startIso);
  } catch (e) {
    console.error(
      "[rate-limit] bump failed (fail-open):",
      e instanceof Error ? e.message : String(e),
    );
    return { allowed: true, retryAfterSec: 0, shouldAudit: false, windowStartIso: startIso };
  }
  return {
    allowed: count <= bucket.limit,
    retryAfterSec,
    shouldAudit: count === bucket.limit + 1,
    windowStartIso: startIso,
  };
}

/** DB bump via the bump_rate_limit RPC (single atomic statement), with
 * opportunistic best-effort cleanup of >24h-old windows (~2% of requests). */
export async function bumpRateLimit(
  bucket: string,
  key: string,
  windowStartIso: string,
): Promise<number> {
  const db = await admin();
  const { data, error } = await db.rpc("bump_rate_limit", {
    p_bucket: bucket,
    p_key: key,
    p_window_start: windowStartIso,
  });
  if (error || typeof data !== "number") throw new Error("rate_limit_bump_failed");
  if (Math.floor(Date.now() / 1000) % 50 === 0) {
    try {
      await db.rpc("cleanup_rate_limits", {
        p_before: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      });
    } catch {
      /* best-effort */
    }
  }
  return data;
}

// ===========================================================================
// Phase 0 (trust foundation) — RFC 7009 token revocation. Family-aware since
// commit 6: revoking either token of a grant that has a refresh family kills
// the whole family (rotation lineage); pre-refresh rows (null family) keep
// single-row semantics.
// ===========================================================================

export interface RevocationParams {
  token?: string;
  token_type_hint?: string;
  client_id?: string;
}

/** Safe context of a revocation (for auditing) — never token material. */
export interface RevokedTokenInfo {
  userId: string | null;
  clientId: string | null;
  tokenType: "access" | "refresh";
  /** Rows killed via the refresh family; null for family-less (pre-refresh) rows. */
  familyRevoked: number | null;
}

export interface RevocationDeps {
  /** Find by access OR refresh hash and revoke (family-aware); null if no live match. */
  revokeTokenByHash: (
    tokenHash: string,
    nowIso: string,
    hint?: string,
  ) => Promise<RevokedTokenInfo | null>;
  hash: (s: string) => Promise<string>;
  nowMs: number;
}

export interface RevocationResult {
  status: number;
  /** Response body; null means an empty 200 per RFC 7009 §2.2. */
  body: Record<string, unknown> | null;
  /** Non-null only when a live token was actually revoked (drives auditing). */
  revoked: RevokedTokenInfo | null;
}

/**
 * Process an RFC 7009 revocation request. Unknown and already-revoked tokens
 * return 200 exactly like a successful revocation — the endpoint never reveals
 * whether a token exists. token_type_hint is advisory (§2.1): it only orders
 * the lookups. A DB failure propagates (route → 500) so a client is never told
 * "revoked" when the write did not happen.
 */
export async function processRevocationRequest(
  enabled: boolean,
  params: RevocationParams,
  deps: RevocationDeps,
): Promise<RevocationResult> {
  if (!enabled) return { status: 404, body: oauthErrorBody("not_found"), revoked: null };
  const token = typeof params.token === "string" ? params.token.trim() : "";
  if (!token)
    return {
      status: 400,
      body: oauthErrorBody("invalid_request", "token is required."),
      revoked: null,
    };
  const tokenHash = await deps.hash(token);
  const revoked = await deps.revokeTokenByHash(
    tokenHash,
    new Date(deps.nowMs).toISOString(),
    params.token_type_hint,
  );
  return { status: 200, body: null, revoked };
}

/** Revoke every live row in a refresh family; returns how many were live. */
export async function revokeTokenFamily(familyId: string, nowIso: string): Promise<number> {
  if (!familyId) return 0;
  const db = await admin();
  const { data: live } = await db
    .from("oauth_tokens")
    .select("user_id")
    .eq("refresh_family_id", familyId)
    .is("revoked_at", null);
  const { error } = await db
    .from("oauth_tokens")
    .update({ revoked_at: nowIso })
    .eq("refresh_family_id", familyId)
    .is("revoked_at", null);
  if (error) throw new Error("revoke_failed");
  return (live ?? []).length;
}

/**
 * Find a token row by access OR refresh hash and revoke it. If the row belongs
 * to a refresh family, the WHOLE family is revoked; otherwise single-row (the
 * pre-refresh behavior). Returns safe context, or null for unknown/already-
 * revoked hashes. Throws if a revocation write fails.
 */
export async function revokeTokenByHash(
  tokenHash: string,
  nowIso: string,
  hint?: string,
): Promise<RevokedTokenInfo | null> {
  if (!tokenHash) return null;
  const db = await admin();
  const lookup = async (column: "access_token_hash" | "refresh_token_hash") =>
    (
      await db
        .from("oauth_tokens")
        .select("user_id,client_id,revoked_at,refresh_family_id")
        .eq(column, tokenHash)
        .maybeSingle()
    ).data;

  const order: ("access_token_hash" | "refresh_token_hash")[] =
    hint === "refresh_token"
      ? ["refresh_token_hash", "access_token_hash"]
      : ["access_token_hash", "refresh_token_hash"];
  let row = await lookup(order[0]);
  let tokenType: "access" | "refresh" = order[0] === "access_token_hash" ? "access" : "refresh";
  if (!row) {
    row = await lookup(order[1]);
    tokenType = order[1] === "access_token_hash" ? "access" : "refresh";
  }
  if (!row || row.revoked_at) return null;

  const familyId = (row.refresh_family_id as string | null) ?? null;
  let familyRevoked: number | null = null;
  if (familyId) {
    familyRevoked = await revokeTokenFamily(familyId, nowIso);
  } else {
    const { error } = await db
      .from("oauth_tokens")
      .update({ revoked_at: nowIso })
      .eq("access_token_hash", tokenHash)
      .is("revoked_at", null);
    if (error) throw new Error("revoke_failed");
  }
  return {
    userId: (row.user_id as string | null) ?? null,
    clientId: (row.client_id as string | null) ?? null,
    tokenType,
    familyRevoked,
  };
}

// ---- refresh-token DB helpers (commit 6) ----

/** Load an oauth_tokens row by refresh-token hash, regardless of state. */
export async function getTokenRowByRefreshHash(refreshHash: string): Promise<Row | null> {
  if (!refreshHash) return null;
  const db = await admin();
  const { data } = await db
    .from("oauth_tokens")
    .select(
      "user_id,client_id,scope,resource,refresh_family_id,refresh_expires_at,rotated_at,revoked_at",
    )
    .eq("refresh_token_hash", refreshHash)
    .maybeSingle();
  return data ?? null;
}

/** Atomically consume a live refresh token via the consume_refresh_token RPC. */
export async function consumeRefreshTokenByHash(
  refreshHash: string,
  nowIso: string,
): Promise<boolean> {
  const db = await admin();
  const { data, error } = await db.rpc("consume_refresh_token", {
    p_refresh_hash: refreshHash,
    p_now: nowIso,
  });
  if (error) throw new Error("consume_refresh_failed");
  return data === true;
}

// ===========================================================================
// Phase 0 (trust foundation) — connected apps: list + revoke a user's grants.
// Display-safe data only: no token hashes, no codes, no secrets. Deliberately
// usable with the flag OFF so users can inspect/revoke grants after rollback.
// ===========================================================================

/** Safe subset of an oauth_tokens row used for the connected-apps view. */
export interface TokenGrantRow {
  client_id: string;
  scope: string | null;
  created_at: string | null;
  access_expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** Safe subset of an oauth_consents row. */
export interface ConsentRow {
  client_id: string;
  scope: string | null;
  granted_at: string | null;
  revoked_at: string | null;
}

/** One connected-app card: display-safe fields only. */
export interface ConnectedAppView {
  clientId: string;
  clientName: string | null;
  scopes: { scope: string; label: string }[];
  grantedAt: string | null;
  status: "active" | "expired" | "revoked";
  activeTokenCount: number;
  latestTokenCreatedAt: string | null;
  latestTokenExpiresAt: string | null;
  latestTokenLastUsedAt: string | null;
}

/**
 * Aggregate a user's token + consent rows into one card per client. Pure.
 * status: "active" (≥1 live token) · "expired" (consent stands, no live token)
 * · "revoked" (no live token, no active consent). Sorted active-first, then by
 * newest token.
 */
export function buildConnectedApps(
  tokens: TokenGrantRow[],
  consents: ConsentRow[],
  clientNames: Record<string, string | null>,
  nowMs: number,
): ConnectedAppView[] {
  const byNewest = (a: string | null, b: string | null) =>
    String(b ?? "").localeCompare(String(a ?? ""));
  const ids = [
    ...new Set(
      [...tokens.map((t) => t.client_id), ...consents.map((c) => c.client_id)].filter(Boolean),
    ),
  ];

  const apps = ids.map((clientId): ConnectedAppView => {
    const ts = tokens
      .filter((t) => t.client_id === clientId)
      .sort((a, b) => byNewest(a.created_at, b.created_at));
    const latest = ts[0];
    const live = ts.filter(
      (t) => !t.revoked_at && t.access_expires_at && Date.parse(t.access_expires_at) > nowMs,
    );
    const cs = consents
      .filter((c) => c.client_id === clientId)
      .sort((a, b) => byNewest(a.granted_at, b.granted_at));
    const activeConsent = cs.find((c) => !c.revoked_at);
    const scopeSource =
      live[0]?.scope ?? activeConsent?.scope ?? latest?.scope ?? cs[0]?.scope ?? "";
    return {
      clientId,
      clientName: clientNames[clientId] ?? null,
      scopes: scopeConsentItems(scopeSource),
      grantedAt: cs.length
        ? cs[cs.length - 1].granted_at
        : ts.length
          ? ts[ts.length - 1].created_at
          : null,
      status: live.length > 0 ? "active" : activeConsent ? "expired" : "revoked",
      activeTokenCount: live.length,
      latestTokenCreatedAt: latest?.created_at ?? null,
      latestTokenExpiresAt: latest?.access_expires_at ?? null,
      latestTokenLastUsedAt: latest?.last_used_at ?? null,
    };
  });

  return apps.sort(
    (a, b) =>
      (b.activeTokenCount > 0 ? 1 : 0) - (a.activeTokenCount > 0 ? 1 : 0) ||
      byNewest(a.latestTokenCreatedAt, b.latestTokenCreatedAt),
  );
}

/**
 * Load the connected-apps view for a user. Selects display-safe columns only
 * (never token hashes). One card per distinct client_id across tokens+consents.
 */
export async function listGrantsForUser(userId: string): Promise<ConnectedAppView[]> {
  if (!userId) return [];
  const db = await admin();
  const { data: tokens } = await db
    .from("oauth_tokens")
    .select("client_id,scope,created_at,access_expires_at,last_used_at,revoked_at")
    .eq("user_id", userId);
  const { data: consents } = await db
    .from("oauth_consents")
    .select("client_id,scope,granted_at,revoked_at")
    .eq("user_id", userId);

  const t = (tokens ?? []) as unknown as TokenGrantRow[];
  const c = (consents ?? []) as unknown as ConsentRow[];
  const ids = [
    ...new Set([...t.map((r) => r.client_id), ...c.map((r) => r.client_id)].filter(Boolean)),
  ];

  const names: Record<string, string | null> = {};
  if (ids.length) {
    const { data: clients } = await db
      .from("oauth_clients")
      .select("client_id,client_name")
      .in("client_id", ids);
    for (const row of clients ?? [])
      names[String(row.client_id ?? "")] = (row.client_name as string | null) ?? null;
  }
  return buildConnectedApps(t, c, names, Date.now());
}

/**
 * Revoke ALL of one user's grants for one client: every live oauth_tokens row
 * and every active oauth_consents row gets revoked_at. Both updates filter by
 * user_id, so another user's grants are unreachable; a client_id the user has
 * no grants for simply matches zero rows (safe no-op — no existence leak).
 * Throws if a write fails so callers never report success on a failed revoke.
 */
export async function revokeGrantsForUserClient(
  userId: string,
  clientId: string,
  nowIso: string,
): Promise<void> {
  if (!userId || !clientId) return;
  const db = await admin();
  const { error: tokenErr } = await db
    .from("oauth_tokens")
    .update({ revoked_at: nowIso })
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .is("revoked_at", null);
  if (tokenErr) throw new Error("revoke_tokens_failed");
  const { error: consentErr } = await db
    .from("oauth_consents")
    .update({ revoked_at: nowIso })
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .is("revoked_at", null);
  if (consentErr) throw new Error("revoke_consents_failed");
}

// ===========================================================================
// Phase 3 — consent screen helpers (pure). The consent server fns supply DB.
// ===========================================================================

/** Human-readable scope labels for the consent UI. */
export const SCOPE_LABELS: Record<string, string> = {
  "milo.projects.read": "See your projects and brand profile",
  "milo.content.read": "Read your opportunities, drafts and Milo Scores",
  "milo.insights.read": "Read your audits and Search Console summaries",
  "milo.authority.read": "Read your authority opportunities",
  offline_access: "Stay connected without re-approving each time",
  "milo.projects.write": "Create and update project details and recommendations",
  "milo.content.write": "Create and edit content drafts (never publishes)",
  "milo.tasks.write": "Create and update growth tasks",
  "milo.actions.propose": "Suggest changes for your approval (never applies them itself)",
};

export type ScopeKind = "read" | "offline" | "write" | "propose";

/** Classify a scope for consent/connected-apps rendering. Unknown → read (display-only). */
export function scopeKind(scope: string): ScopeKind {
  if (scope === OFFLINE_ACCESS_SCOPE) return "offline";
  if (scope === MCP_PROPOSE_SCOPE) return "propose";
  if ((MCP_WRITE_SCOPES as readonly string[]).includes(scope) || scope === MCP_PUBLISH_SCOPE)
    return "write";
  return "read";
}

export function scopeConsentItems(
  scope: string,
): { scope: string; label: string; kind: ScopeKind }[] {
  return parseScopes(scope).map((s) => ({
    scope: s,
    label: SCOPE_LABELS[s] ?? s,
    kind: scopeKind(s),
  }));
}

export type ConsentReason = "not_found" | "expired" | "already_used" | "invalid_client";
export type ConsentClassification =
  | {
      ok: true;
      normalized: { clientId: string; redirectUri: string; scope: string; state?: string };
    }
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
      state:
        typeof requestRow.state === "string" && requestRow.state ? requestRow.state : undefined,
    },
  };
}

/** access_denied redirect for the Cancel action (redirect_uri already trusted). */
export function buildDenyRedirect(redirectUri: string, state?: string): string {
  return buildRedirectError(redirectUri, "access_denied", undefined, state);
}

/** Best-effort audit log (no secrets). Never throws. */
export async function logOAuthEvent(
  event: string,
  opts: { clientId?: string; userId?: string; detail?: Record<string, unknown> } = {},
): Promise<void> {
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
