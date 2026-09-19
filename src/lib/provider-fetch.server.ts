/**
 * Server-only fetch policy for credentialed provider calls (native OpenAI text
 * and image plus other server transports). SERVER ONLY — never import from
 * client code.
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
 * normal HTTP outcome; carries no `Location`, body, header or credential. The
 * wording is provider-neutral because the policy is shared across transports. */
export class ProviderRedirectError extends Error {
  constructor() {
    super("The provider attempted an unsupported redirect; the request was not followed.");
    this.name = "ProviderRedirectError";
  }
}

/**
 * Wrap a `fetch` implementation (the global one or a caller-injected transport)
 * with the shared redirect refusal. Forces `redirect: "manual"` (workerd-safe)
 * set LAST so the caller's `init` can never override the policy, and refuses any
 * redirect response without following `Location`. The single-attempt/no-retry,
 * timeout and accounting gates remain the caller's responsibility — this only
 * adds the redirect boundary around whatever `base` is given.
 */
export function manualRedirectFetch(base: typeof fetch): typeof fetch {
  return async (input, init) => {
    // redirect is set LAST so a caller's init can never override the policy.
    const response = await base(input, { ...init, redirect: "manual" });
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
}

/**
 * `fetch` for direct provider transport. Resolves the global `fetch` at call
 * time (so runtime/test stubs apply) and refuses any redirect response.
 */
export const directProviderFetch: typeof fetch = manualRedirectFetch((input, init) =>
  fetch(input, init),
);
