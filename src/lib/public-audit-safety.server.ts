import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { safeFetch, type SafeFetchResult } from "./safe-fetch";
import type { PublicAiVisibilityAudit } from "./public-audit";

export const PUBLIC_AUDIT_PER_IP_HOURLY_LIMIT = 5;
export const PUBLIC_AUDIT_DAILY_AI_LIMIT = 50;
export const PUBLIC_AUDIT_CACHE_SECONDS = 24 * 60 * 60;
export const PUBLIC_AUDIT_MAX_BYTES = 300_000;
export const PUBLIC_AUDIT_MAX_REDIRECTS = 3;
export const PUBLIC_AUDIT_TIMEOUT_MS = 8_000;

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const ALLOWED_LANGUAGES = new Map([
  ["english", "English"],
  ["polish", "Polish"],
  ["swedish", "Swedish"],
  ["danish", "Danish"],
]);

type RpcResponse = {
  data: unknown;
  error: { message: string } | null;
};

type SafeFetch = (
  url: string,
  opts?: {
    method?: "GET" | "HEAD";
    headers?: Record<string, string>;
    maxBytes?: number;
    maxRedirects?: number;
    timeoutMs?: number;
  },
) => Promise<SafeFetchResult>;

export interface PublicAuditSafetyDependencies {
  env: Record<string, string | undefined>;
  fetchImpl: typeof fetch;
  safeFetchImpl: SafeFetch;
  requestIdentity: () => { ip?: string; fromCloudflare: boolean };
  rpc: (fn: string, params: Record<string, unknown>) => Promise<RpcResponse>;
  now: () => Date;
}

export interface PublicAuditRequestContext {
  clientKey: string;
  clientLogKey: string;
  rawIp: string;
}

export type PublicAuditAiClaim =
  | { decision: "claimed"; used: number }
  | { decision: "cached"; used: number; result: PublicAiVisibilityAudit }
  | { decision: "busy" | "limit"; used: number };

function production(env: Record<string, string | undefined>): boolean {
  return env.NODE_ENV === "production";
}

function localBotBypass(env: Record<string, string | undefined>): boolean {
  return !production(env) && env.PUBLIC_AUDIT_BOT_BYPASS === "true";
}

function validClientIp(value: string | undefined): value is string {
  if (!value || value.length > 64 || value.includes(",")) return false;
  return /^[0-9a-f:.]+$/i.test(value);
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function firstRow(value: unknown): Record<string, unknown> | undefined {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? (row as Record<string, unknown>) : undefined;
}

function asAudit(value: unknown): PublicAiVisibilityAudit | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.normalizedUrl !== "string" ||
    typeof row.auditedAt !== "string" ||
    typeof row.overall !== "number" ||
    !row.categories ||
    typeof row.categories !== "object"
  ) {
    return undefined;
  }
  return value as PublicAiVisibilityAudit;
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "invalid";
  }
}

export function normalizePublicAuditLanguage(value: string | undefined): string {
  return ALLOWED_LANGUAGES.get((value ?? "").trim().toLowerCase()) ?? "English";
}

export function createPublicAuditSafety(deps: PublicAuditSafetyDependencies) {
  async function clientContext(): Promise<PublicAuditRequestContext> {
    const identity = deps.requestIdentity();
    if (!validClientIp(identity.ip)) {
      throw new Error("The audit is temporarily unavailable. Please try again later.");
    }
    if (production(deps.env) && !identity.fromCloudflare) {
      // Production is deployed behind Cloudflare. Refuse rather than trusting a
      // caller-controlled forwarding header or collapsing everyone to a proxy IP.
      throw new Error("The audit is temporarily unavailable. Please try again later.");
    }

    const salt = deps.env.PUBLIC_AUDIT_IP_SALT?.trim();
    if (production(deps.env) && (!salt || salt.length < 24)) {
      throw new Error("The audit is temporarily unavailable. Please try again later.");
    }
    const clientKey = await sha256Hex(`milo-public-audit:${salt || "local-only-salt"}:${identity.ip}`);
    return { clientKey, clientLogKey: clientKey.slice(0, 12), rawIp: identity.ip };
  }

  async function claimRequest(clientKey: string): Promise<void> {
    const { data, error } = await deps.rpc("claim_public_audit_request", {
      p_client_key: clientKey,
      p_limit: PUBLIC_AUDIT_PER_IP_HOURLY_LIMIT,
      p_now: deps.now().toISOString(),
    });
    if (error) {
      console.error("[public-audit] request limiter unavailable", { message: error.message });
      throw new Error("The audit is temporarily unavailable. Please try again later.");
    }
    const row = firstRow(data);
    if (!row || row.allowed !== true) {
      throw new Error("Too many audit attempts. Please try again in about an hour.");
    }
  }

  async function verifyBotProof(token: string | undefined, rawIp: string): Promise<void> {
    if (localBotBypass(deps.env)) return;

    const secret = deps.env.TURNSTILE_SECRET_KEY?.trim();
    const proof = token?.trim();
    if (!secret || !proof || proof.length > 2048) {
      throw new Error("Please complete the bot check and try again.");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const body = new URLSearchParams({ secret, response: proof, remoteip: rawIp });
      const response = await deps.fetchImpl(TURNSTILE_VERIFY_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("turnstile_http_error");
      const result = (await response.json()) as {
        success?: boolean;
        action?: string;
        hostname?: string;
      };
      const expectedHostname = deps.env.PUBLIC_AUDIT_ALLOWED_HOSTNAME?.trim().toLowerCase();
      if (production(deps.env) && !expectedHostname) {
        throw new Error("turnstile_hostname_unconfigured");
      }
      const hostnameMatches =
        !expectedHostname || result.hostname?.trim().toLowerCase() === expectedHostname;
      if (!result.success || result.action !== "public_audit" || !hostnameMatches) {
        throw new Error("turnstile_rejected");
      }
    } catch {
      throw new Error("Please complete the bot check and try again.");
    } finally {
      clearTimeout(timer);
    }
  }

  async function beginRequest(botProof: string | undefined): Promise<PublicAuditRequestContext> {
    const context = await clientContext();
    // Claim before Turnstile so invalid-token floods cannot fan out unlimited
    // verification requests. Neither this claim nor verification fetches a user URL
    // or calls paid AI.
    await claimRequest(context.clientKey);
    await verifyBotProof(botProof, context.rawIp);
    return context;
  }

  async function cacheKey(normalizedUrl: string, language: string): Promise<string> {
    return sha256Hex(`milo-public-audit-cache:v1\n${normalizedUrl}\n${language.toLowerCase()}`);
  }

  async function getCached(cacheKeyValue: string): Promise<PublicAiVisibilityAudit | undefined> {
    const { data, error } = await deps.rpc("get_public_audit_cache", {
      p_cache_key: cacheKeyValue,
      p_now: deps.now().toISOString(),
    });
    if (error) {
      console.error("[public-audit] cache read unavailable", { message: error.message });
      throw new Error("The audit is temporarily unavailable. Please try again later.");
    }
    return asAudit(data);
  }

  async function fetchHtml(normalizedUrl: string): Promise<string> {
    const result = await deps.safeFetchImpl(normalizedUrl, {
      method: "GET",
      maxBytes: PUBLIC_AUDIT_MAX_BYTES,
      maxRedirects: PUBLIC_AUDIT_MAX_REDIRECTS,
      timeoutMs: PUBLIC_AUDIT_TIMEOUT_MS,
      headers: {
        "User-Agent": "MiloGrowthAuditBot/1.0 (+https://milogrowth.com)",
        Accept: "text/html,application/xhtml+xml;q=0.9",
      },
    });
    if (!result.ok) {
      throw new Error("Couldn’t read that website. Check the URL is public and reachable, then try again.");
    }
    if (!/^text\/html\b|^application\/xhtml\+xml\b/i.test(result.contentType)) {
      throw new Error("Couldn’t read that website. Check the URL is public and reachable, then try again.");
    }
    return result.body;
  }

  async function claimAi(cacheKeyValue: string): Promise<PublicAuditAiClaim> {
    const { data, error } = await deps.rpc("claim_public_audit_ai", {
      p_cache_key: cacheKeyValue,
      p_day: deps.now().toISOString().slice(0, 10),
      p_cap: PUBLIC_AUDIT_DAILY_AI_LIMIT,
      p_lock_seconds: 90,
      p_now: deps.now().toISOString(),
    });
    if (error) {
      console.error("[public-audit] AI limiter unavailable", { message: error.message });
      throw new Error("The audit is temporarily unavailable. Please try again later.");
    }
    const row = firstRow(data);
    if (!row) {
      throw new Error("The audit is temporarily unavailable. Please try again later.");
    }
    const decision = row?.decision;
    const used = typeof row?.used === "number" ? row.used : 0;
    if (decision === "cached") {
      const result = asAudit(row.cached_result);
      if (!result) throw new Error("The audit is temporarily unavailable. Please try again later.");
      return { decision, used, result };
    }
    if (decision === "claimed" || decision === "busy" || decision === "limit") {
      return { decision, used };
    }
    throw new Error("The audit is temporarily unavailable. Please try again later.");
  }

  async function completeCache(
    cacheKeyValue: string,
    result: PublicAiVisibilityAudit,
  ): Promise<void> {
    const response = await deps.rpc("complete_public_audit_cache", {
      p_cache_key: cacheKeyValue,
      p_result: result,
      p_ttl_seconds: PUBLIC_AUDIT_CACHE_SECONDS,
      p_now: deps.now().toISOString(),
    });
    if (response.error) {
      // The paid call already happened. Return the result to the user; the atomic
      // global daily ceiling remains the spend backstop even if cache completion
      // has a transient failure.
      console.error("[public-audit] cache completion failed", {
        message: response.error.message,
      });
    }
  }

  function observe(
    event: "allowed" | "cached" | "limited" | "blocked" | "fallback" | "generated",
    args: {
      context: Pick<PublicAuditRequestContext, "clientLogKey">;
      normalizedUrl: string;
      language: string;
      reason?: string;
    },
  ): void {
    console.info("[public-audit]", {
      event,
      client: args.context.clientLogKey,
      host: safeHost(args.normalizedUrl),
      language: args.language,
      reason: args.reason?.slice(0, 48),
    });
  }

  return { beginRequest, cacheKey, getCached, fetchHtml, claimAi, completeCache, observe };
}

async function productionRpc(fn: string, params: Record<string, unknown>): Promise<RpcResponse> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as {
    rpc: (name: string, values: Record<string, unknown>) => PromiseLike<RpcResponse>;
  };
  return await admin.rpc(fn, params);
}

const publicAuditSafety = createPublicAuditSafety({
  env: process.env,
  fetchImpl: fetch,
  safeFetchImpl: safeFetch,
  requestIdentity: () => {
    const cloudflareIp = getRequestHeader("cf-connecting-ip");
    return {
      ip: cloudflareIp ?? getRequestIP(),
      fromCloudflare: Boolean(cloudflareIp),
    };
  },
  rpc: productionRpc,
  now: () => new Date(),
});

export const beginPublicAuditRequest = publicAuditSafety.beginRequest;
export const publicAuditCacheKey = publicAuditSafety.cacheKey;
export const getCachedPublicAudit = publicAuditSafety.getCached;
export const fetchPublicAuditHtml = publicAuditSafety.fetchHtml;
export const claimPublicAuditAi = publicAuditSafety.claimAi;
export const completePublicAuditCache = publicAuditSafety.completeCache;
export const observePublicAudit = publicAuditSafety.observe;
