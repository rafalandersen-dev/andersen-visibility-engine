/**
 * GSC OAuth / API Sync v1 (Sprint 17) — auth-gated server functions.
 *
 * These wrap the server-only gsc-oauth helpers, which are lazy-imported inside
 * each handler so the server-only token/crypto/admin code is never pulled into
 * the client bundle (same convention as analytics.functions / billing.functions).
 * Tokens are never returned to the client — only safe status, site lists and
 * normalized import rows.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { GscImport, GscConnectionStatus, GscSiteEntry } from "./types";

export interface GscOAuthStatus {
  configured: boolean;
  oauthCredsPresent: boolean;
  secureStorageReady: boolean;
  status: GscConnectionStatus;
  googleAccountEmail?: string;
}

export const getGscOAuthStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GscOAuthStatus> => {
    const { gscOAuthConfig, getSafeStatus } = await import("./gsc-oauth.server");
    const cfg = gscOAuthConfig();
    const safe = await getSafeStatus(context.userId);
    return {
      configured: cfg.isSyncConfigured,
      oauthCredsPresent: cfg.oauthCredsPresent,
      secureStorageReady: cfg.secureStorageReady,
      status: safe.status,
      googleAccountEmail: safe.googleAccountEmail,
    };
  });

export const startGscOAuthFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string() }).parse(input))
  .handler(async ({ data, context }): Promise<{ configured: boolean; url?: string; message?: string }> => {
    const { gscOAuthConfig, buildAuthUrl } = await import("./gsc-oauth.server");
    const cfg = gscOAuthConfig();
    if (!cfg.oauthCredsPresent) {
      return { configured: false, message: "Google Search Console sync is not configured yet." };
    }
    if (!cfg.secureStorageReady) {
      return { configured: false, message: "Secure token storage is not configured yet, so Google sync cannot be enabled. Manual CSV import remains available." };
    }
    const url = await buildAuthUrl(context.userId, data.projectId);
    return { configured: true, url };
  });

export const listGscSitesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ status: GscConnectionStatus; sites: GscSiteEntry[]; error?: string }> => {
    const { gscOAuthConfig, listSites } = await import("./gsc-oauth.server");
    const cfg = gscOAuthConfig();
    if (!cfg.isSyncConfigured) return { status: "notConfigured", sites: [] };
    try {
      const sites = await listSites(context.userId);
      return { status: "connected", sites };
    } catch (e) {
      const code = e instanceof Error ? e.message : "api_error";
      if (code === "not_connected") return { status: "disconnected", sites: [] };
      if (code === "expired") return { status: "expired", sites: [], error: "Your Google connection expired. Reconnect to continue." };
      return { status: "error", sites: [], error: "Could not load Search Console properties. Please try again." };
    }
  });

export const selectGscSiteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ siteUrl: z.string(), permissionLevel: z.string().optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ success: boolean; siteUrl?: string; permissionLevel?: string; error?: string }> => {
    const { gscOAuthConfig, listSites } = await import("./gsc-oauth.server");
    const cfg = gscOAuthConfig();
    if (!cfg.isSyncConfigured) return { success: false, error: "Google Search Console sync is not configured yet." };
    try {
      // Validate the site belongs to the connected account before persisting.
      const sites = await listSites(context.userId);
      const match = sites.find((s) => s.siteUrl === data.siteUrl);
      if (!match) return { success: false, error: "That property is not available on the connected Google account." };
      return { success: true, siteUrl: match.siteUrl, permissionLevel: match.permissionLevel };
    } catch (e) {
      const code = e instanceof Error ? e.message : "api_error";
      if (code === "expired") return { success: false, error: "Your Google connection expired. Reconnect to continue." };
      if (code === "not_connected") return { success: false, error: "Connect Google Search Console first." };
      return { success: false, error: "Could not verify the property. Please try again." };
    }
  });

export const syncGscSearchAnalyticsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ siteUrl: z.string(), range: z.enum(["28d", "90d"]) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ success: boolean; import?: GscImport; status?: GscConnectionStatus; error?: string }> => {
    const { gscOAuthConfig, listSites, syncSearchAnalytics } = await import("./gsc-oauth.server");
    const cfg = gscOAuthConfig();
    if (!cfg.isSyncConfigured) return { success: false, status: "notConfigured", error: "Google Search Console sync is not configured yet." };
    try {
      // Validate property membership, then sync.
      const sites = await listSites(context.userId);
      if (!sites.some((s) => s.siteUrl === data.siteUrl)) {
        return { success: false, status: "connected", error: "That property is not available on the connected Google account." };
      }
      const imp = await syncSearchAnalytics({ userId: context.userId, siteUrl: data.siteUrl, range: data.range });
      return { success: true, import: imp, status: "connected" };
    } catch (e) {
      const code = e instanceof Error ? e.message : "api_error";
      if (code === "expired") return { success: false, status: "expired", error: "Your Google connection expired. Reconnect to continue." };
      if (code === "not_connected") return { success: false, status: "disconnected", error: "Connect Google Search Console first." };
      return { success: false, status: "error", error: "Could not sync Search Console data. Please try again." };
    }
  });

export const disconnectGscFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ success: boolean }> => {
    const { revokeAtGoogle } = await import("./gsc-oauth.server");
    await revokeAtGoogle(context.userId);
    return { success: true };
  });
