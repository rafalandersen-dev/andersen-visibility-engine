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
