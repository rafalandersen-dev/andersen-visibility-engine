/**
 * GSC OAuth / API Sync v1 (Sprint 17) — SERVER-ONLY Google Search Console OAuth
 * + Search Analytics helpers. Never import from client code.
 *
 * Security:
 * - Read-only scope only (webmasters.readonly). No write/manage scopes.
 * - Refresh tokens are encrypted (crypto.server) and stored only in the
 *   service-role google_connections table. Tokens never reach the client/logs.
 * - Offline access (refresh token) is requested ONLY when secure encryption is
 *   configured; otherwise sync is reported "not configured" and CSV remains.
 */
import { summarizeGscRows, detectImportType } from "./gsc";
import { normalizePath } from "./analytics";
import { encryptSecret, decryptSecret, isEncryptionConfigured } from "./crypto.server";
import type { GscRow, GscImport, GscConnectionStatus, GscSiteEntry } from "./types";

export const GSC_DEFAULT_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const GSC_MAX_API_ROWS = 1000; // matches the CSV per-import cap
const PROVIDER = "google_search_console";
const SYNC_DELAY_DAYS = 3; // GSC data lag

// ---- config ----
export interface GscOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
  oauthCredsPresent: boolean;
  secureStorageReady: boolean;
  /** Full sync is available only with creds + secure token storage. */
  isSyncConfigured: boolean;
}

export function gscOAuthConfig(): GscOAuthConfig {
  const clientId = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
  const redirectUri = (process.env.GOOGLE_OAUTH_REDIRECT_URI ?? "").trim();
  const scopes = (process.env.GOOGLE_OAUTH_SCOPES ?? "").trim() || GSC_DEFAULT_SCOPE;
  const oauthCredsPresent = Boolean(clientId && clientSecret && redirectUri);
  const secureStorageReady = isEncryptionConfigured();
  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes,
    oauthCredsPresent,
    secureStorageReady,
    isSyncConfigured: oauthCredsPresent && secureStorageReady,
  };
}

// ---- signed OAuth state (stateless, HMAC-SHA256 with the client secret) ----
function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlToBytes(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

export interface GscOAuthState {
  u: string; // userId
  p: string; // projectId
  n: string; // nonce
  e: number; // expiry epoch ms
}

export async function signState(payload: Omit<GscOAuthState, "n" | "e">): Promise<string> {
  const { clientSecret } = gscOAuthConfig();
  const state: GscOAuthState = { ...payload, n: globalThis.crypto.randomUUID(), e: Date.now() + 10 * 60 * 1000 };
  const body = b64url(new TextEncoder().encode(JSON.stringify(state)));
  const sig = b64url(await hmac(clientSecret, body));
  return `${body}.${sig}`;
}

export async function verifyState(state: string): Promise<GscOAuthState | null> {
  try {
    const { clientSecret } = gscOAuthConfig();
    const [body, sig] = (state || "").split(".");
    if (!body || !sig) return null;
    const expected = b64url(await hmac(clientSecret, body));
    // constant-time-ish compare
    if (expected.length !== sig.length) return null;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    if (diff !== 0) return null;
    const parsed = JSON.parse(new TextDecoder().decode(b64urlToBytes(body))) as GscOAuthState;
    if (!parsed.u || !parsed.p || typeof parsed.e !== "number" || parsed.e < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---- authorization URL ----
export async function buildAuthUrl(userId: string, projectId: string): Promise<string> {
  const cfg = gscOAuthConfig();
  const state = await signState({ u: userId, p: projectId });
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: cfg.scopes,
    state,
    include_granted_scopes: "true",
    // Offline access (refresh token) only when we can store it encrypted.
    access_type: cfg.secureStorageReady ? "offline" : "online",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ---- token exchange / refresh ----
interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok) {
    // Do not surface raw Google error detail to clients; log a short code only.
    console.warn("[gsc-oauth] token endpoint status", res.status, json.error ?? "");
    throw new Error("google_token_error");
  }
  return json;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const cfg = gscOAuthConfig();
  return postToken({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
  });
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const cfg = gscOAuthConfig();
  return postToken({
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
  });
}

/** Best-effort account email from an id_token (only present if openid/email granted). */
function emailFromIdToken(idToken?: string): string | undefined {
  try {
    if (!idToken) return undefined;
    const payload = idToken.split(".")[1];
    if (!payload) return undefined;
    const json = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload))) as { email?: string };
    return typeof json.email === "string" ? json.email : undefined;
  } catch {
    return undefined;
  }
}

// ---- service-role DB access (tokens never leave the server) ----
type AdminClient = {
  from: (t: string) => {
    select: (c: string) => { eq: (k: string, v: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: ConnRow | null; error: { message: string } | null }> } } };
    upsert: (r: unknown, opts?: unknown) => Promise<{ error: { message: string } | null }>;
    update: (r: unknown) => { eq: (k: string, v: string) => { eq: (k: string, v: string) => Promise<{ error: { message: string } | null }> } };
  };
};
interface ConnRow {
  user_id: string;
  workspace_id: string;
  provider: string;
  google_account_email: string | null;
  encrypted_refresh_token: string | null;
  access_token_expires_at: string | null;
  scope: string | null;
  revoked_at: string | null;
}

async function admin(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AdminClient;
}

async function getConnRow(userId: string): Promise<ConnRow | null> {
  const db = await admin();
  const { data, error } = await db.from("google_connections").select("*").eq("user_id", userId).eq("provider", PROVIDER).maybeSingle();
  if (error) {
    console.warn("[gsc-oauth] getConnRow error", error.message);
    return null;
  }
  return data;
}

/** Persist an encrypted refresh token + metadata (upsert by user+provider). */
export async function saveConnection(args: {
  userId: string;
  email?: string;
  refreshToken?: string;
  expiresInSec?: number;
  scope?: string;
}): Promise<void> {
  const db = await admin();
  const encrypted = args.refreshToken ? await encryptSecret(args.refreshToken) : undefined;
  const expiresAt = args.expiresInSec ? new Date(Date.now() + args.expiresInSec * 1000).toISOString() : null;
  const row: Record<string, unknown> = {
    user_id: args.userId,
    workspace_id: args.userId,
    provider: PROVIDER,
    google_account_email: args.email ?? null,
    access_token_expires_at: expiresAt,
    scope: args.scope ?? GSC_DEFAULT_SCOPE,
    updated_at: new Date().toISOString(),
    revoked_at: null,
  };
  // Only overwrite the stored refresh token when we received a new one.
  if (encrypted) row.encrypted_refresh_token = encrypted;
  const { error } = await db.from("google_connections").upsert(row, { onConflict: "user_id,provider" });
  if (error) {
    console.warn("[gsc-oauth] saveConnection error", error.message);
    throw new Error("save_connection_failed");
  }
}

export async function markRevoked(userId: string): Promise<void> {
  const db = await admin();
  await db.from("google_connections").update({ encrypted_refresh_token: null, revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("user_id", userId).eq("provider", PROVIDER);
}

/** Safe connection status (no tokens) derived from the stored row + config. */
export async function getSafeStatus(userId: string): Promise<{
  status: GscConnectionStatus;
  googleAccountEmail?: string;
}> {
  const cfg = gscOAuthConfig();
  if (!cfg.isSyncConfigured) return { status: "notConfigured" };
  const row = await getConnRow(userId);
  if (!row || row.revoked_at || !row.encrypted_refresh_token) return { status: "disconnected" };
  return { status: "connected", googleAccountEmail: row.google_account_email ?? undefined };
}

/** Mint a fresh access token from the stored refresh token. Throws typed errors. */
async function getAccessToken(userId: string): Promise<string> {
  const cfg = gscOAuthConfig();
  if (!cfg.isSyncConfigured) throw new Error("not_configured");
  const row = await getConnRow(userId);
  if (!row || row.revoked_at || !row.encrypted_refresh_token) throw new Error("not_connected");
  const refresh = await decryptSecret(row.encrypted_refresh_token);
  if (!refresh) throw new Error("token_unreadable");
  const tok = await refreshAccessToken(refresh).catch(() => null);
  if (!tok?.access_token) throw new Error("expired");
  // refresh the stored expiry window (refresh token unchanged)
  await saveConnection({ userId, expiresInSec: tok.expires_in, scope: tok.scope, email: row.google_account_email ?? undefined }).catch(() => {});
  return tok.access_token;
}

// ---- Google Search Console API ----
export async function listSites(userId: string): Promise<GscSiteEntry[]> {
  const accessToken = await getAccessToken(userId);
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401 || res.status === 403) throw new Error("expired");
  if (!res.ok) throw new Error("api_error");
  const json = (await res.json().catch(() => ({}))) as { siteEntry?: { siteUrl?: string; permissionLevel?: string }[] };
  return (json.siteEntry ?? [])
    .filter((s) => typeof s.siteUrl === "string")
    .map((s) => ({ siteUrl: s.siteUrl as string, permissionLevel: s.permissionLevel }));
}

interface SaRow { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }

async function querySearchAnalytics(accessToken: string, siteUrl: string, body: Record<string, unknown>): Promise<SaRow[]> {
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (res.status === 401 || res.status === 403) throw new Error("expired");
  if (!res.ok) throw new Error("api_error");
  const json = (await res.json().catch(() => ({}))) as { rows?: SaRow[] };
  return json.rows ?? [];
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function computeRange(range: "28d" | "90d"): { startDate: string; endDate: string } {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - SYNC_DELAY_DAYS);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (range === "90d" ? 90 : 28));
  return { startDate: ymd(start), endDate: ymd(end) };
}

function toGscRowCtr(ctrFraction?: number): number {
  const n = typeof ctrFraction === "number" ? ctrFraction * 100 : 0;
  return Math.max(0, Math.min(100, Math.round(n * 100) / 100));
}

/**
 * Sync Search Analytics for a property and normalize into the existing GscImport
 * format. Runs three queries: aggregate totals (accurate summary), top queries,
 * top pages (for matching). Rows are mixed (query + page) like a combined import.
 */
export async function syncSearchAnalytics(args: {
  userId: string;
  siteUrl: string;
  range: "28d" | "90d";
}): Promise<GscImport> {
  const accessToken = await getAccessToken(args.userId);
  const { startDate, endDate } = computeRange(args.range);
  const half = Math.floor(GSC_MAX_API_ROWS / 2);

  const [totalsRows, queryRows, pageRows] = await Promise.all([
    querySearchAnalytics(accessToken, args.siteUrl, { startDate, endDate, dimensions: [] }),
    querySearchAnalytics(accessToken, args.siteUrl, { startDate, endDate, dimensions: ["query"], rowLimit: half }),
    querySearchAnalytics(accessToken, args.siteUrl, { startDate, endDate, dimensions: ["page"], rowLimit: half }),
  ]);

  const rows: GscRow[] = [];
  for (const r of queryRows) {
    const q = r.keys?.[0]?.trim();
    if (!q) continue;
    rows.push({
      type: "query",
      query: q,
      clicks: Math.round(r.clicks ?? 0),
      impressions: Math.round(r.impressions ?? 0),
      ctr: toGscRowCtr(r.ctr),
      position: Math.round((r.position ?? 0) * 10) / 10,
    });
  }
  for (const r of pageRows) {
    const page = r.keys?.[0]?.trim();
    if (!page) continue;
    rows.push({
      type: "page",
      page,
      path: normalizePath(page),
      clicks: Math.round(r.clicks ?? 0),
      impressions: Math.round(r.impressions ?? 0),
      ctr: toGscRowCtr(r.ctr),
      position: Math.round((r.position ?? 0) * 10) / 10,
    });
  }

  // Accurate totals from the no-dimension aggregate; fall back to row sums.
  const agg = totalsRows[0];
  const base = summarizeGscRows(rows);
  const summary = agg
    ? {
        totalClicks: Math.round(agg.clicks ?? 0),
        totalImpressions: Math.round(agg.impressions ?? 0),
        averageCtr: toGscRowCtr(agg.ctr) ,
        averagePosition: Math.round((agg.position ?? 0) * 10) / 10,
        rowCount: rows.length,
        topQuery: base.topQuery,
        topPage: base.topPage,
      }
    : base;

  return {
    id: `gsc_api_${Date.now().toString(36)}_${globalThis.crypto.randomUUID().slice(0, 8)}`,
    importedAt: new Date().toISOString(),
    source: "api",
    importType: detectImportType(rows),
    rows,
    summary,
    selectedSiteUrl: args.siteUrl,
    dateRange: { start: startDate, end: endDate, label: `${args.range} · ${args.siteUrl}` },
    truncated: queryRows.length >= half || pageRows.length >= half,
  };
}

/** Revoke the refresh token at Google (best effort), then mark the row revoked. */
export async function revokeAtGoogle(userId: string): Promise<void> {
  try {
    const row = await getConnRow(userId);
    if (row?.encrypted_refresh_token) {
      const refresh = await decryptSecret(row.encrypted_refresh_token);
      if (refresh) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }).catch(() => {});
      }
    }
  } finally {
    await markRevoked(userId);
  }
}

/** Callback core: validate state, exchange code, persist tokens. Returns redirect status. */
export async function completeOAuthCallback(params: {
  code?: string;
  state?: string;
  error?: string;
}): Promise<"connected" | "denied" | "error"> {
  if (params.error) return "denied";
  if (!params.code || !params.state) return "error";
  const cfg = gscOAuthConfig();
  if (!cfg.isSyncConfigured) return "error";
  const st = await verifyState(params.state);
  if (!st) return "error";
  try {
    const tok = await exchangeCodeForTokens(params.code);
    if (!tok.access_token) return "error";
    // Without a refresh token we cannot persist offline access securely.
    if (!tok.refresh_token) return "error";
    await saveConnection({
      userId: st.u,
      email: emailFromIdToken(tok.id_token),
      refreshToken: tok.refresh_token,
      expiresInSec: tok.expires_in,
      scope: tok.scope,
    });
    return "connected";
  } catch {
    return "error";
  }
}

export { emailFromIdToken };
