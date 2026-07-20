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
import {
  isValidHttpSourceUrl,
  classifyReachability,
  SOURCE_MAX_PER_RUN,
  SOURCE_MAX_REDIRECTS,
  SOURCE_FETCH_TIMEOUT_MS,
} from "./sources";

/** Hard per-call fan-out cap (bounded external fetch). */
export const MAX_SOURCES_PER_CALL = SOURCE_MAX_PER_RUN;

export interface SourceCheckOutcome {
  url: string;
  status: "verified" | "unreachable";
  note: string;
}

/** Reachability check for one URL — manual redirects (capped, re-validated), no body read. */
async function checkOne(url: string): Promise<SourceCheckOutcome> {
  if (!isValidHttpSourceUrl(url)) return { url, ...classifyReachability({ kind: "blocked" }) };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_FETCH_TIMEOUT_MS);
  const headers = { "User-Agent": "MiloGrowthSourceCheck/1.0 (+https://milogrowth.com)" };
  try {
    let current = url;
    for (let hop = 0; hop <= SOURCE_MAX_REDIRECTS; hop++) {
      if (!isValidHttpSourceUrl(current))
        return { url, ...classifyReachability({ kind: "blocked" }) };
      let res = await fetch(current, {
        method: "HEAD",
        redirect: "manual",
        signal: controller.signal,
        headers,
      });
      // Some servers reject HEAD — fall back to a 1-byte ranged GET (body unread).
      if (res.status === 405 || res.status === 501) {
        res = await fetch(current, {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: { ...headers, Range: "bytes=0-0" },
        });
      }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc || hop >= SOURCE_MAX_REDIRECTS)
          return { url, ...classifyReachability({ kind: "network" }) };
        current = new URL(loc, current).toString();
        continue;
      }
      return { url, ...classifyReachability({ ok: res.ok, status: res.status }) };
    }
    return { url, ...classifyReachability({ kind: "network" }) };
  } catch (e) {
    const kind = e instanceof Error && e.name === "AbortError" ? "timeout" : "network";
    return { url, ...classifyReachability({ kind }) };
  } finally {
    clearTimeout(timer);
  }
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
