/**
 * Post-authentication destination handling (PR150 review finding 4111227860,
 * https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/150#discussion_r4111227860).
 *
 * A logged-out assigned reviewer opens an owner-shared scoped link and is sent to `/auth?redirect=<path>`
 * by the authenticated layout. The password flow navigated to that validated path; the Google/Apple flow
 * hard-coded `redirect_uri = origin + "/app"` and lost the owner/project/finding context. These pure helpers
 * make every flow derive the SAME validated internal destination, and the OAuth callback returns to `/auth`
 * carrying it, so the existing "session present → go to the validated redirect" effect completes the journey.
 *
 * Safety: only a same-origin, absolute-path target under `/app` survives (`/app`, `/app/...`, `/app?...`).
 * Protocol-relative (`//`), backslash, whitespace/control characters, absolute URLs, encoded slashes in the
 * path, and anything the URL parser would resolve outside the dummy origin fall back to `/app`. Nothing here
 * changes authentication, providers, or credentials; the destination is only ever an in-app path.
 */
export const DEFAULT_APP_PATH = "/app";
const MAX_REDIRECT_LENGTH = 2048;
const DUMMY_ORIGIN = "https://milo.invalid";
const ORIGIN_RE = /^https?:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?$/;
/** C0 controls (U+0000–U+001F) and DEL (U+007F); checked by code point so no control character has to
 * appear in a regular expression literal. */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** Only an internal `/app` path (optionally with its own query/hash) is a valid post-login target. */
export function safeRedirect(r: string | null | undefined): string {
  if (typeof r !== "string" || r.length === 0 || r.length > MAX_REDIRECT_LENGTH)
    return DEFAULT_APP_PATH;
  // Absolute path under /app only: exactly "/app", "/app/…" or "/app?…". Rejects "/application", "//host",
  // "/\host", "app", "https://…", and anything starting with a second slash.
  if (!(r === DEFAULT_APP_PATH || r.startsWith("/app/") || r.startsWith("/app?")))
    return DEFAULT_APP_PATH;
  // Backslashes, whitespace and control characters are never part of a legitimate in-app target and are
  // the classic vectors for parser-differential open redirects.
  if (/[\\\s]/.test(r) || hasControlCharacter(r)) return DEFAULT_APP_PATH;
  // An encoded slash/backslash inside the path could be decoded by a later hop; the app never generates one.
  const pathPart = r.split(/[?#]/, 1)[0];
  if (/%2f|%5c/i.test(pathPart)) return DEFAULT_APP_PATH;
  try {
    const parsed = new URL(r, DUMMY_ORIGIN);
    if (parsed.origin !== DUMMY_ORIGIN) return DEFAULT_APP_PATH;
    if (!(parsed.pathname === DEFAULT_APP_PATH || parsed.pathname.startsWith("/app/")))
      return DEFAULT_APP_PATH;
  } catch {
    return DEFAULT_APP_PATH;
  }
  return r;
}

/** Whether `safeRedirect` kept a specific target (anything other than the plain dashboard). */
export function hasScopedRedirect(r: string | null | undefined): boolean {
  return safeRedirect(r) !== DEFAULT_APP_PATH;
}

/**
 * The absolute URL an OAuth provider callback (Lovable broker → this origin) must return to. With a validated
 * scoped target it is `/auth?redirect=<target>` on the CURRENT origin, so the auth page's session effect
 * performs the same validated navigation the password flow performs; without one it stays the historical
 * `origin + /app` (unchanged behaviour for ordinary sign-in). A malformed origin returns null and the caller
 * must not start the provider flow with it.
 */
export function oauthRedirectUri(
  origin: string,
  redirect: string | null | undefined,
): string | null {
  if (!ORIGIN_RE.test(origin)) return null;
  const target = safeRedirect(redirect);
  if (target === DEFAULT_APP_PATH) return `${origin}${DEFAULT_APP_PATH}`;
  return `${origin}/auth?redirect=${encodeURIComponent(target)}`;
}

/** Read the validated target back out of a callback URL produced by `oauthRedirectUri` (or of any `/auth`
 * URL): the `redirect` search param re-validated through `safeRedirect`, else the dashboard. */
export function redirectFromAuthUrl(url: string): string {
  try {
    const parsed = new URL(url, DUMMY_ORIGIN);
    if (parsed.pathname !== "/auth") return DEFAULT_APP_PATH;
    return safeRedirect(parsed.searchParams.get("redirect"));
  } catch {
    return DEFAULT_APP_PATH;
  }
}

export type OAuthProvider = "google" | "apple";
export interface OAuthStartResult {
  error?: Error | null;
  redirected?: boolean;
}
/**
 * The production OAuth start used by the auth page for BOTH providers: derives the callback URL from the
 * validated redirect and hands it to the injected adapter (`lovable.auth.signInWithOAuth`). Refuses to start
 * when the origin is not a plain http(s) origin (never sends a fabricated callback). Returns the adapter's
 * result unchanged so the caller surfaces its error exactly as before.
 */
export async function startOAuthSignIn(
  provider: OAuthProvider,
  input: { origin: string; redirect: string | null | undefined },
  signIn: (
    provider: OAuthProvider,
    opts: { redirect_uri: string },
  ) => Promise<OAuthStartResult | void>,
): Promise<OAuthStartResult> {
  const redirect_uri = oauthRedirectUri(input.origin, input.redirect);
  if (!redirect_uri) return { error: new Error("auth_origin_invalid"), redirected: false };
  const result = await signIn(provider, { redirect_uri });
  return result ?? { error: null };
}
