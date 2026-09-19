/**
 * Server-only fetch policy for DIRECT provider calls (native OpenAI text and
 * image). SERVER ONLY — never import from client code.
 *
 * Credentials must never be replayed to a redirect target. We cannot use
 * `redirect: "error"`: the Cloudflare Workers runtime (workerd) rejects it with
 * `TypeError: Invalid redirect value` before the request is even dispatched
 * ("error" is deliberately not implemented at the edge). Instead we use
 * `redirect: "manual"` — supported in both the Node dev runtime and workerd —
 * and then EXPLICITLY reject any redirect response without reading or following
 * its `Location`, cancelling the response body first to release the connection.
 *
 * The redirect policy is applied AFTER the caller's `init`, so a caller cannot
 * weaken it (e.g. by passing `redirect: "follow"`). This is transport policy
 * only: per-attempt timeouts, the single-attempt/no-retry rule and the cost
 * reservation all remain the callers' responsibility and are unchanged here.
 */

/** Redirect statuses that carry a `Location` a client could follow. We refuse
 * every one of them; the credentialed request is never replayed elsewhere. */
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/** A provider responded with a redirect. Named so it is never mistaken for a
 * normal HTTP outcome; carries no `Location`, body, header or credential. */
export class ProviderRedirectError extends Error {
  constructor() {
    super("The AI provider attempted an unsupported redirect; the request was not followed.");
    this.name = "ProviderRedirectError";
  }
}

/**
 * `fetch` for direct provider transport. Forces `redirect: "manual"` (workerd-
 * safe) and refuses any redirect response without following `Location`.
 */
export const directProviderFetch: typeof fetch = async (input, init) => {
  // redirect is set LAST so a caller's init can never override the policy.
  const response = await fetch(input, { ...init, redirect: "manual" });
  if (
    response.type === "opaqueredirect" ||
    response.redirected ||
    REDIRECT_STATUSES.has(response.status)
  ) {
    // Discard the body so the connection/stream is released. Never read or
    // expose Location; never issue a second (credentialed) request to it.
    try {
      await response.body?.cancel();
    } catch {
      /* body already discarded or unreadable */
    }
    throw new ProviderRedirectError();
  }
  return response;
};
