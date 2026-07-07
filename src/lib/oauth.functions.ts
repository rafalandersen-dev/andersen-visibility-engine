/**
 * Claude.ai OAuth connector — Phase 3 consent server functions (auth-gated).
 *
 * These run only for an authenticated Milo user (requireSupabaseAuth →
 * context.userId). The server-only oauth module is lazy-imported per handler.
 * Everything is gated by MCP_OAUTH_ENABLED; with the flag off they behave as if
 * no pending request exists (production-neutral). Plaintext authorization codes
 * are only ever in the returned redirect URL — never logged.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface ConsentView {
  ok: boolean;
  reason?: string;
  clientName?: string;
  scopes?: { scope: string; label: string }[];
}

const reqInput = (input: unknown) => z.object({ req: z.string() }).parse(input);

export const getConsentRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(reqInput)
  .handler(async ({ data }): Promise<ConsentView> => {
    const oauth = await import("./oauth.server");
    if (!oauth.isOAuthEnabled()) return { ok: false, reason: "not_found" };
    const request = await oauth.getAuthorizationRequest(data.req);
    const client = request ? await oauth.getOAuthClient(String(request.client_id ?? "")) : null;
    const c = oauth.classifyConsentRequest(request, client, Date.now());
    if (!c.ok) return { ok: false, reason: c.reason };
    return {
      ok: true,
      clientName: client?.client_name ?? undefined,
      scopes: oauth.scopeConsentItems(c.normalized.scope),
    };
  });

export const approveOAuthConsentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(reqInput)
  .handler(async ({ data, context }): Promise<{ ok: boolean; redirectUrl?: string; reason?: string }> => {
    const oauth = await import("./oauth.server");
    if (!oauth.isOAuthEnabled()) return { ok: false, reason: "not_found" };

    // Re-validate before issuing (defence in depth; issue helper re-checks too).
    const request = await oauth.getAuthorizationRequest(data.req);
    const client = request ? await oauth.getOAuthClient(String(request.client_id ?? "")) : null;
    const c = oauth.classifyConsentRequest(request, client, Date.now());
    if (!c.ok) return { ok: false, reason: c.reason };

    const res = await oauth.issueAuthorizationCode(data.req, context.userId, {
      loadRequest: oauth.getAuthorizationRequest,
      consumeRequest: oauth.consumeAuthorizationRequest,
      insertCode: oauth.insertAuthorizationCode,
      generateCode: () => oauth.randomToken(),
      hash: oauth.sha256Hex,
      nowMs: Date.now(),
    });
    if (!res.ok) return { ok: false, reason: res.reason };

    await oauth.insertConsent(context.userId, c.normalized.clientId, c.normalized.scope);
    await oauth.logOAuthEvent("consent_granted", { clientId: c.normalized.clientId, userId: context.userId });
    return { ok: true, redirectUrl: res.redirectUrl };
  });

export const denyOAuthConsentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(reqInput)
  .handler(async ({ data, context }): Promise<{ ok: boolean; redirectUrl?: string; reason?: string }> => {
    const oauth = await import("./oauth.server");
    if (!oauth.isOAuthEnabled()) return { ok: false, reason: "not_found" };

    const request = await oauth.getAuthorizationRequest(data.req);
    const client = request ? await oauth.getOAuthClient(String(request.client_id ?? "")) : null;
    const c = oauth.classifyConsentRequest(request, client, Date.now());
    if (!c.ok) return { ok: false, reason: c.reason };

    // Consume the request so it can never be approved after a denial.
    await oauth.consumeAuthorizationRequest(data.req);
    await oauth.logOAuthEvent("consent_denied", { clientId: c.normalized.clientId, userId: context.userId });
    return { ok: true, redirectUrl: oauth.buildDenyRedirect(c.normalized.redirectUri, c.normalized.state) };
  });
