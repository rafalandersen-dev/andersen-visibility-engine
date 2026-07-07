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

/** v1 scopes — read-only + offline_access. No write/publish/billing scopes. */
export const OAUTH_SCOPES = [
  "milo.projects.read",
  "milo.content.read",
  "milo.insights.read",
  "milo.authority.read",
  "offline_access",
] as const;

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
const READ_SCOPES = OAUTH_SCOPES.filter((s) => s !== "offline_access");
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

/** Validate requested scopes ⊆ allowed v1 read scopes (+offline_access). */
export function validateScopes(requested: string[]): { ok: true; scopes: string[] } | { ok: false; invalid: string[] } {
  const invalid = requested.filter((s) => !isAllowedScope(s));
  return invalid.length ? { ok: false, invalid } : { ok: true, scopes: requested };
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

  // grant_types — subset of allowed; must include authorization_code.
  const grant_types = b.grant_types === undefined ? ["authorization_code", "refresh_token"] : b.grant_types;
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
async function admin(): Promise<{ from: (t: string) => { insert: (r: unknown) => Promise<{ error: { message: string } | null }> } }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => { insert: (r: unknown) => Promise<{ error: { message: string } | null }> } };
}

/** Persist a registered client. Throws on failure (route maps to 500). */
export async function insertOAuthClient(row: Record<string, unknown>): Promise<void> {
  const db = await admin();
  const { error } = await db.from("oauth_clients").insert(row);
  if (error) throw new Error("client_insert_failed");
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
