/**
 * GA4 Data API sync — SERVER-ONLY. Never import from client code.
 *
 * TEST ROLLOUT: Google asked that the unverified analytics.readonly scope not be
 * offered to general production users. Every entry point (status, start, list,
 * select, sync, disconnect and the OAuth callback) first runs assertGa4Rollout:
 * the verified actor must hold the platform owner role and own the Synergy
 * Massage project in their own stored workspace. Any lookup failure denies.
 *
 * Separate from Search Console: own provider row ("google_analytics") in
 * google_connections (unique (user_id, provider), no CHECK on provider), own
 * signed-state key, own scope (analytics.readonly only, include_granted_scopes=false).
 * The state is bound to the initiating browser: a one-time nonce lives in a
 * __Host- HttpOnly cookie, its hash in the signed state and in ga4_oauth_attempts.
 * The callback needs all three to match and deletes (consumes) the attempt row
 * before anything else. Disconnect never calls Google's revoke endpoint (it could
 * drop the Search Console grant); it deletes our copy. The encrypted refresh
 * token is AES-GCM-bound to the owner id and never leaves the server.
 */
import { decryptSecret, encryptSecret } from "./crypto.server";
import {
  b64url,
  b64urlToBytes,
  emailFromIdToken,
  gscOAuthConfig,
  hmac,
  postToken,
} from "./gsc-oauth.server";
import {
  GA4_SCOPE,
  buildGa4BatchBody,
  ga4Range,
  isGa4RolloutProject,
  parseGa4AccountSummaries,
  parseGa4PropertyId,
  parseGa4PropertyResource,
  summarizeGa4Batch,
  type Ga4Property,
} from "./ga4";
import type { Ga4ApiSnapshot, Ga4SyncErrorCode } from "./types";

const PROVIDER = "google_analytics";
const TIMEOUT_MS = 20_000;
const MAX_BYTES = 1_000_000;
const STATE_TTL_MS = 10 * 60_000;
/** Browser binding for the OAuth round trip (HttpOnly, Secure, SameSite=Lax, Path=/). */
export const GA4_STATE_COOKIE = "__Host-milo_ga4_oauth";
export const GA4_STATE_COOKIE_MAX_AGE = STATE_TTL_MS / 1000;
/** Sent on every GA4 callback response: the nonce is single-use in the browser too. */
export const GA4_CLEAR_STATE_COOKIE = `${GA4_STATE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export function ga4StateCookieFrom(header: string | null): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === GA4_STATE_COOKIE) return part.slice(i + 1).trim() || undefined;
  }
  return undefined;
}

export class Ga4Error extends Error {
  constructor(readonly code: Ga4SyncErrorCode) {
    super(code);
    this.name = "Ga4Error";
  }
}
/** Any thrown value → a finite client-safe code (never provider text). */
export function ga4ErrorCode(e: unknown): Ga4SyncErrorCode {
  return e instanceof Ga4Error ? e.code : "failed";
}

// ---- service-role storage ----
interface DbError {
  message: string;
}
type Res = { data?: unknown; error: DbError | null };
interface Chain extends PromiseLike<Res> {
  eq(k: string, v: string): Chain;
  gt(k: string, v: string): Chain;
  select(c: string): Chain;
  maybeSingle(): PromiseLike<Res>;
}
interface Db {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<Res>;
  from(t: string): {
    select(c: string): Chain;
    insert(r: unknown): Chain;
    upsert(r: unknown, o?: unknown): Chain;
    update(r: unknown): Chain;
    delete(): Chain;
  };
}
async function db(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}
/** A storage error is a failure, never "no row". */
async function must(query: PromiseLike<Res>): Promise<unknown> {
  const { data, error } = await query;
  if (error) throw new Ga4Error("failed");
  return data;
}

// ---- test-rollout gate ----
async function inRollout(userId: string, projectId: string): Promise<boolean> {
  const role = await (await db()).rpc("has_role", { _user_id: userId, _role: "owner" });
  if (role.error || role.data !== true) return false;
  const { readWorkspaceRow } = await import("./workspace.server");
  const projects = (await readWorkspaceRow(userId))?.data.projects;
  if (!Array.isArray(projects)) return false;
  return isGa4RolloutProject(projects.find((p) => p?.id === projectId));
}

/** Platform owner + Synergy project in their own workspace; anything else (or any error) denies. */
export async function assertGa4Rollout(userId: string, projectId: string): Promise<void> {
  if (!(await inRollout(userId, projectId).catch(() => false))) throw new Ga4Error("not_available");
}

// ---- config + signed, browser-bound state (distinct HMAC key from Search Console) ----
export function ga4Config() {
  const cfg = gscOAuthConfig();
  return { configured: cfg.isSyncConfigured, cfg };
}

interface Ga4State {
  k: "ga4";
  u: string;
  p: string;
  /** sha256 of the cookie nonce; the nonce itself never appears in the URL. */
  n: string;
  e: number;
}
const stateKey = (secret: string) => `ga4-oauth-state:${secret}`;

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function signGa4State(st: Ga4State): Promise<string> {
  const body = b64url(new TextEncoder().encode(JSON.stringify(st)));
  return `${body}.${b64url(await hmac(stateKey(gscOAuthConfig().clientSecret), body))}`;
}

export async function verifyGa4State(state: string): Promise<Ga4State | null> {
  try {
    const [body, sig] = (state || "").split(".");
    if (!body || !sig) return null;
    const expected = b64url(await hmac(stateKey(gscOAuthConfig().clientSecret), body));
    if (!sameString(expected, sig)) return null;
    const st = JSON.parse(new TextDecoder().decode(b64urlToBytes(body))) as Ga4State;
    return st.k === "ga4" && st.u && st.p && st.n && typeof st.e === "number" && st.e > Date.now()
      ? st
      : null;
  } catch {
    return null;
  }
}

/**
 * Records a one-time attempt and returns the consent URL plus the nonce the
 * caller must set as GA4_STATE_COOKIE on this browser.
 */
export async function startGa4OAuth(
  userId: string,
  projectId: string,
): Promise<{ url: string; nonce: string }> {
  await assertGa4Rollout(userId, projectId);
  const { configured, cfg } = ga4Config();
  if (!configured) throw new Ga4Error("not_configured");
  const nonce = b64url(globalThis.crypto.getRandomValues(new Uint8Array(32)));
  const hash = await sha256Hex(nonce);
  const expires = Date.now() + STATE_TTL_MS;
  const d = await db();
  // One pending attempt per user: a newer start (which also replaces the cookie) voids older ones.
  await must(d.from("ga4_oauth_attempts").delete().eq("user_id", userId));
  await must(
    d.from("ga4_oauth_attempts").insert({
      nonce_hash: hash,
      user_id: userId,
      project_id: projectId,
      expires_at: new Date(expires).toISOString(),
    }),
  );
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: GA4_SCOPE,
    state: await signGa4State({ k: "ga4", u: userId, p: projectId, n: hash, e: expires }),
    include_granted_scopes: "false",
    access_type: "offline",
    prompt: "consent",
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, nonce };
}

interface ConnRow {
  google_account_email: string | null;
  encrypted_refresh_token: string | null;
  scope: string | null;
  revoked_at: string | null;
}
async function connRow(userId: string): Promise<ConnRow | null> {
  const data = await must(
    (await db())
      .from("google_connections")
      .select("google_account_email,encrypted_refresh_token,scope,revoked_at")
      .eq("user_id", userId)
      .eq("provider", PROVIDER)
      .maybeSingle(),
  );
  return (data as ConnRow | null) ?? null;
}

export async function ga4Status(userId: string, projectId: string) {
  await assertGa4Rollout(userId, projectId);
  if (!ga4Config().configured) return { status: "notConfigured" as const };
  const row = await connRow(userId);
  return !row || row.revoked_at || !row.encrypted_refresh_token
    ? { status: "disconnected" as const }
    : { status: "connected" as const, email: row.google_account_email ?? undefined };
}

export async function completeGa4Callback(params: {
  state: string;
  /** Value of GA4_STATE_COOKIE sent by the returning browser. */
  cookieNonce?: string;
  code?: string;
  error?: string;
}): Promise<"connected" | "denied" | "error"> {
  const st = await verifyGa4State(params.state);
  if (!st || !params.cookieNonce) return "error";
  try {
    const hash = await sha256Hex(params.cookieNonce);
    if (!sameString(hash, st.n)) return "error";
    // Consume first, so a replayed or second callback finds no attempt.
    const consumed = await must(
      (await db())
        .from("ga4_oauth_attempts")
        .delete()
        .eq("nonce_hash", hash)
        .eq("user_id", st.u)
        .eq("project_id", st.p)
        .gt("expires_at", new Date().toISOString())
        .select("nonce_hash"),
    );
    if (!Array.isArray(consumed) || consumed.length !== 1) return "error";
    await assertGa4Rollout(st.u, st.p);
    if (!ga4Config().configured) return "error";
    if (params.error) return "denied";
    if (!params.code) return "error";
    const { cfg } = ga4Config();
    const tok = await postToken({
      code: params.code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
    });
    // Consent screens allow unticking scopes: require ours, and a refresh token.
    if (!tok.refresh_token || !(tok.scope ?? "").split(" ").includes(GA4_SCOPE)) return "denied";
    await must(
      (await db()).from("google_connections").upsert(
        {
          user_id: st.u,
          workspace_id: st.u,
          provider: PROVIDER,
          google_account_email: emailFromIdToken(tok.id_token) ?? null,
          encrypted_refresh_token: await encryptSecret(tok.refresh_token, `${PROVIDER}:${st.u}`),
          access_token_expires_at: new Date(Date.now() + (tok.expires_in ?? 0) * 1000).toISOString(),
          scope: GA4_SCOPE,
          updated_at: new Date().toISOString(),
          revoked_at: null,
        },
        { onConflict: "user_id,provider" },
      ),
    );
    return "connected";
  } catch {
    return "error";
  }
}

/** Local disconnect only: no Google revoke call (could affect other grants). Throws on any storage error. */
export async function disconnectGa4(userId: string, projectId: string): Promise<void> {
  await assertGa4Rollout(userId, projectId);
  const d = await db();
  const now = new Date().toISOString();
  // Token first: if a later step fails, sync is already impossible.
  await must(
    d
      .from("google_connections")
      .update({ encrypted_refresh_token: null, revoked_at: now, updated_at: now })
      .eq("user_id", userId)
      .eq("provider", PROVIDER),
  );
  await must(d.from("ga4_project_properties").delete().eq("user_id", userId));
  await must(d.from("ga4_oauth_attempts").delete().eq("user_id", userId));
}

async function accessToken(userId: string): Promise<string> {
  const { configured, cfg } = ga4Config();
  if (!configured) throw new Ga4Error("not_configured");
  const row = await connRow(userId);
  if (!row || row.revoked_at || !row.encrypted_refresh_token) throw new Ga4Error("not_connected");
  const refresh = await decryptSecret(row.encrypted_refresh_token, `${PROVIDER}:${userId}`);
  if (!refresh) throw new Ga4Error("expired");
  const tok = await postToken({
    refresh_token: refresh,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
  }).catch(() => null);
  if (!tok?.access_token) throw new Ga4Error("expired");
  return tok.access_token;
}

// ---- bounded Google calls ----
async function googleJson(token: string, url: string, body?: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Ga4Error("unavailable");
  }
  const text = await res.text().catch(() => "");
  if (text.length > MAX_BYTES) throw new Ga4Error("failed");
  if (!res.ok) {
    if (res.status === 401) throw new Ga4Error("expired");
    if (res.status === 403 && /SERVICE_DISABLED|accessNotConfigured/.test(text))
      throw new Ga4Error("api_disabled");
    if (res.status === 403 || res.status === 404) throw new Ga4Error("access_denied");
    throw new Ga4Error(res.status === 429 || res.status >= 500 ? "unavailable" : "failed");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Ga4Error("failed");
  }
}

export async function listGa4Properties(userId: string, projectId: string): Promise<Ga4Property[]> {
  await assertGa4Rollout(userId, projectId);
  const token = await accessToken(userId);
  const out: Ga4Property[] = [];
  let page = "";
  for (let i = 0; i < 5; i++) {
    const q = new URLSearchParams({ pageSize: "200", ...(page ? { pageToken: page } : {}) });
    const json = (await googleJson(
      token,
      `https://analyticsadmin.googleapis.com/v1beta/accountSummaries?${q}`,
    )) as { nextPageToken?: unknown };
    try {
      out.push(...parseGa4AccountSummaries(json));
    } catch {
      throw new Ga4Error("failed");
    }
    if (typeof json.nextPageToken !== "string" || !json.nextPageToken) break;
    page = json.nextPageToken;
  }
  return out.slice(0, 500);
}

/** Reads the property with the owner's own token: proves access + gives the time zone. */
async function verifyProperty(token: string, propertyId: string) {
  const json = await googleJson(
    token,
    `https://analyticsadmin.googleapis.com/v1beta/properties/${propertyId}`,
  );
  const prop = parseGa4PropertyResource(json, propertyId);
  if (!prop) throw new Ga4Error("access_denied");
  return prop;
}

export async function selectGa4Property(args: {
  userId: string;
  projectId: string;
  propertyId: string;
}) {
  await assertGa4Rollout(args.userId, args.projectId);
  const id = parseGa4PropertyId(args.propertyId);
  if (!id) throw new Ga4Error("failed");
  const prop = await verifyProperty(await accessToken(args.userId), id);
  await must(
    (await db()).from("ga4_project_properties").upsert(
      {
        user_id: args.userId,
        project_id: args.projectId,
        property_id: id,
        property_name: prop.name,
        time_zone: prop.timeZone,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,project_id" },
    ),
  );
  return { propertyId: id, ...prop };
}

export async function syncGa4(args: { userId: string; projectId: string }) {
  await assertGa4Rollout(args.userId, args.projectId);
  const data = await must(
    (await db())
      .from("ga4_project_properties")
      .select("property_id")
      .eq("user_id", args.userId)
      .eq("project_id", args.projectId)
      .maybeSingle(),
  );
  const propertyId = parseGa4PropertyId((data as { property_id?: unknown } | null)?.property_id);
  if (!propertyId) throw new Ga4Error("no_property");
  const token = await accessToken(args.userId);
  // Re-verified on every sync: revoked access or a changed time zone is caught here.
  const prop = await verifyProperty(token, propertyId);
  const range = ga4Range(prop.timeZone);
  if (!range) throw new Ga4Error("failed");
  const json = await googleJson(
    token,
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:batchRunReports`,
    buildGa4BatchBody(range),
  );
  let figures;
  try {
    figures = summarizeGa4Batch(json);
  } catch {
    throw new Ga4Error("failed");
  }
  const snapshot: Ga4ApiSnapshot = {
    source: "ga4_api",
    propertyId,
    propertyName: prop.name,
    timeZone: prop.timeZone,
    ...figures,
    fetchedAt: new Date().toISOString(),
  };
  return {
    periodStart: range.startDate,
    periodEnd: range.endDate,
    snapshot,
  };
}
