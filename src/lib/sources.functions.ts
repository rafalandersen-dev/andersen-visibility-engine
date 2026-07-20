/**
 * Grounded-source validation — server-only, Article Studio 2.0 / P1.1 C (+ follow-up).
 *
 * Checks whether each attached source URL RESOLVES (reachability). It never reads
 * or stores page content and never fabricates a source. Bounded by construction
 * (no request explosion): authenticated-only, a hard per-call cap, an http/https
 * + anti-SSRF guard, manual redirect handling with a redirect cap, and a short
 * per-request timeout. Bodies are never read, so response size is inherently
 * bounded. No paid provider — plain outbound HTTP, like the existing audit fetch.
 *
 * "verified" means the URL resolves (the honest bound of a fetch); it does NOT
 * assert the page supports the claim. Every failure maps to an explicit note
 * (timeout / blocked / http_<code> / network) and is never counted as verified.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { classifyReachability, SOURCE_MAX_PER_RUN, SOURCE_MAX_REDIRECTS } from "./sources";
import { safeFetch } from "./safe-fetch";

/** Hard per-call fan-out cap (bounded external fetch). */
export const MAX_SOURCES_PER_CALL = SOURCE_MAX_PER_RUN;

export interface SourceCheckOutcome {
  url: string;
  status: "verified" | "unreachable";
  note: string;
}

const UA = { "User-Agent": "MiloGrowthSourceCheck/1.0 (+https://milogrowth.com)" };

/** Reachability check for one URL via the shared SSRF-safe fetch — no body read. */
async function checkOne(url: string): Promise<SourceCheckOutcome> {
  // HEAD first; some servers reject HEAD, so fall back to a ranged GET (body unread).
  let res = await safeFetch(url, {
    method: "HEAD",
    maxRedirects: SOURCE_MAX_REDIRECTS,
    headers: UA,
  });
  if (!res.ok && res.reason === "http_error" && (res.status === 405 || res.status === 501)) {
    res = await safeFetch(url, {
      method: "GET",
      maxRedirects: SOURCE_MAX_REDIRECTS,
      headers: { ...UA, Range: "bytes=0-0" },
    });
  }
  if (res.ok) return { url, ...classifyReachability({ ok: true, status: res.status }) };
  if (res.reason === "blocked") return { url, ...classifyReachability({ kind: "blocked" }) };
  if (res.reason === "timeout") return { url, ...classifyReachability({ kind: "timeout" }) };
  if (res.reason === "http_error")
    return { url, ...classifyReachability({ ok: false, status: res.status }) };
  return { url, ...classifyReachability({ kind: "network" }) };
}

export const validateSourceUrlsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ urls: z.array(z.string()).max(MAX_SOURCES_PER_CALL) }).parse(input),
  )
  .handler(async ({ data }): Promise<SourceCheckOutcome[]> => {
    const urls = data.urls.slice(0, MAX_SOURCES_PER_CALL);
    return Promise.all(urls.map((url) => checkOne(url)));
  });
