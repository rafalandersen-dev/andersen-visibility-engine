/**
 * Grounded-source validation — server-only, Article Studio 2.0 / P1.1 C.
 *
 * Checks whether each attached source URL RESOLVES (reachability). It never reads
 * or stores page content and never fabricates a source. Bounded by construction
 * (C10/C14 — no request explosion): authenticated-only, a hard per-call cap, an
 * http/https + anti-SSRF guard, and a short per-request timeout. No paid provider
 * is involved — this is plain outbound HTTP, like the existing audit fetch.
 *
 * NOTE: reachability is the honest bound of what a fetch confirms. "verified"
 * here means the URL resolves; it does NOT assert the page supports the claim —
 * that stays the human's attachment assertion (or a later deeper check).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { isValidHttpSourceUrl } from "./sources";

/** Hard per-call fan-out cap (bounded external fetch — C14). */
export const MAX_SOURCES_PER_CALL = 12;
const FETCH_TIMEOUT_MS = 8000;

export type SourceCheckStatus = "verified" | "unreachable";

/** Reachability check for one URL. Never throws; returns "unreachable" on any failure. */
async function checkOne(url: string): Promise<SourceCheckStatus> {
  if (!isValidHttpSourceUrl(url)) return "unreachable";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const headers = { "User-Agent": "MiloGrowthSourceCheck/1.0 (+https://milogrowth.com)" };
  try {
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers,
    });
    // Some servers reject HEAD — fall back to a 1-byte ranged GET.
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { ...headers, Range: "bytes=0-0" },
      });
    }
    return res.ok || res.status === 206 ? "verified" : "unreachable";
  } catch {
    return "unreachable";
  } finally {
    clearTimeout(timer);
  }
}

export const validateSourceUrlsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ urls: z.array(z.string()).max(MAX_SOURCES_PER_CALL) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ url: string; status: SourceCheckStatus }[]> => {
    const urls = data.urls.slice(0, MAX_SOURCES_PER_CALL);
    return Promise.all(urls.map(async (url) => ({ url, status: await checkOne(url) })));
  });
