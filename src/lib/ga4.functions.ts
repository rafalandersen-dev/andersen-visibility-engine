/**
 * GA4 Data API sync for the ChatGPT channel — auth-gated server functions.
 * Server-only helpers are lazy-imported so tokens/crypto/admin never reach the
 * client bundle. Every call names the project and is scoped to the authenticated
 * user; ga4.server re-checks the test rollout (owner role + owned Synergy project)
 * before any work. Only safe status, property names and normalized figures are
 * returned — never tokens.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Ga4Property } from "./ga4";
import type { Ga4ApiSnapshot, Ga4SyncErrorCode } from "./types";

const projectInput = z.object({ projectId: z.string().min(1).max(128) });
type Fail = { success: false; error: Ga4SyncErrorCode };
export type Ga4Status = "unavailable" | "error" | "notConfigured" | "disconnected" | "connected";

export const getGa4StatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => projectInput.parse(input))
  .handler(async ({ data, context }): Promise<{ status: Ga4Status; email?: string }> => {
    const { ga4Status, ga4ErrorCode } = await import("./ga4.server");
    try {
      return await ga4Status(context.userId, data.projectId);
    } catch (e) {
      // Outside the rollout the UI renders nothing; a storage failure is shown as one.
      return { status: ga4ErrorCode(e) === "not_available" ? "unavailable" : "error" };
    }
  });

export const startGa4OAuthFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => projectInput.parse(input))
  .handler(async ({ data, context }): Promise<{ url?: string; error?: Ga4SyncErrorCode }> => {
    const { startGa4OAuth, ga4ErrorCode, GA4_STATE_COOKIE, GA4_STATE_COOKIE_MAX_AGE } =
      await import("./ga4.server");
    try {
      const { url, nonce } = await startGa4OAuth(context.userId, data.projectId);
      const { setCookie } = await import("@tanstack/react-start/server");
      setCookie(GA4_STATE_COOKIE, nonce, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: GA4_STATE_COOKIE_MAX_AGE,
      });
      return { url };
    } catch (e) {
      return { error: ga4ErrorCode(e) };
    }
  });

export const listGa4PropertiesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => projectInput.parse(input))
  .handler(
    async ({ data, context }): Promise<{ properties: Ga4Property[]; error?: Ga4SyncErrorCode }> => {
      const { listGa4Properties, ga4ErrorCode } = await import("./ga4.server");
      try {
        return { properties: await listGa4Properties(context.userId, data.projectId) };
      } catch (e) {
        return { properties: [], error: ga4ErrorCode(e) };
      }
    },
  );

export const selectGa4PropertyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    projectInput.extend({ propertyId: z.string().regex(/^\d{1,20}$/) }).parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<
      { success: true; propertyId: string; name: string; timeZone: string } | Fail
    > => {
      const { selectGa4Property, ga4ErrorCode } = await import("./ga4.server");
      try {
        return { success: true, ...(await selectGa4Property({ userId: context.userId, ...data })) };
      } catch (e) {
        return { success: false, error: ga4ErrorCode(e) };
      }
    },
  );

export const syncGa4Fn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => projectInput.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<
      { success: true; periodStart: string; periodEnd: string; snapshot: Ga4ApiSnapshot } | Fail
    > => {
      const { syncGa4, ga4ErrorCode } = await import("./ga4.server");
      try {
        return { success: true, ...(await syncGa4({ userId: context.userId, ...data })) };
      } catch (e) {
        return { success: false, error: ga4ErrorCode(e) };
      }
    },
  );

export const disconnectGa4Fn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => projectInput.parse(input))
  .handler(async ({ data, context }): Promise<{ success: true } | Fail> => {
    const { disconnectGa4, ga4ErrorCode } = await import("./ga4.server");
    try {
      await disconnectGa4(context.userId, data.projectId);
      return { success: true };
    } catch (e) {
      return { success: false, error: ga4ErrorCode(e) };
    }
  });
