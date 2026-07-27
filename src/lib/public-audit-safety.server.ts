import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { safeFetch, type SafeFetchResult } from "./safe-fetch";
import type { PublicAiVisibilityAudit } from "./public-audit";

export const PUBLIC_AUDIT_PER_IP_HOURLY_LIMIT = 5;
export const PUBLIC_AUDIT_DAILY_FETCH_LIMIT = 50;
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
  requestIdentity: () => { ip?: string; edgeProof?: string };
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

function localAuditRuntime(env: Record<string, string | undefined>): boolean {
  return env.PUBLIC_AUDIT_RUNTIME === "local";
}

function localBotBypass(env: Record<string, string | undefined>): boolean {
  return localAuditRuntime(env) && env.PUBLIC_AUDIT_BOT_BYPASS === "true";
}

function normalizeIpv4(value: string): string | undefined {
  const parts = value.split(".");
  if (parts.length !== 4) return undefined;
  const octets = parts.map((part) => {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return -1;
    const parsed = Number(part);
    return parsed <= 255 ? parsed : -1;
  });
  return octets.every((part) => part >= 0) ? octets.join(".") : undefined;
}

function expandIpv6(value: string): string[] | undefined {
  if (!value || value.includes("%") || (value.match(/::/g)?.length ?? 0) > 1) return undefined;
  let source = value.toLowerCase();
  const ipv4Tail = source.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  if (ipv4Tail) {
    const ipv4 = normalizeIpv4(ipv4Tail);
    if (!ipv4) return undefined;
    const bytes = ipv4.split(".").map(Number);
    source = source.slice(0, -ipv4Tail.length) +
      `${((bytes[0] << 8) | bytes[1]).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`;
  }
  const [leftRaw, rightRaw] = source.split("::");
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw ? rightRaw.split(":") : [];
  if (![...left, ...right].every((part) => /^[0-9a-f]{1,4}$/.test(part))) return undefined;
  const missing = 8 - left.length - right.length;
  if ((source.includes("::") && missing < 1) || (!source.includes("::") && missing !== 0)) {
    return undefined;
  }
  return [...left, ...Array(missing).fill("0"), ...right].map((part) =>
    Number.parseInt(part, 16).toString(16),
  );
}

function normalizeClientIp(
  value: string | undefined,
): { rawIp: string; rateIdentity: string } | undefined {
  const candidate = value?.trim();
  if (!candidate || candidate.length > 64 || candidate.includes(",")) return undefined;
  const ipv4 = normalizeIpv4(candidate);
  if (ipv4) return { rawIp: ipv4, rateIdentity: ipv4 };
  const ipv6 = expandIpv6(candidate);
  if (!ipv6) return undefined;
  const rawIp = ipv6.join(":");
  return { rawIp, rateIdentity: `${ipv6.slice(0, 4).join(":")}::/64` };
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function constantTimeSecretEqual(
  provided: string | undefined,
  expected: string,
): Promise<boolean> {
  if (!provided) return false;
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(provided)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(expected)),
  ]);
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let different = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1) {
    different |= left[index] ^ right[index];
  }
  return different === 0;
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
  async function rpc(
    fn: string,
    params: Record<string, unknown>,
    label: string,
  ): Promise<RpcResponse> {
    try {
      return await deps.rpc(fn, params);
    } catch {
      // Never surface transport, Supabase or schema detail to an unauthenticated
      // caller. The caller decides whether this is a pre-spend hard failure or a
      // post-spend best-effort cache write.
      console.error(`[public-audit] ${label} transport unavailable`);
      return { data: null, error: { message: "unavailable" } };
    }
  }

  async function clientContext(): Promise<PublicAuditRequestContext> {
    const identity = deps.requestIdentity();
    const clientIp = normalizeClientIp(identity.ip);
    if (!clientIp) {
      throw new Error("The audit is temporarily unavailable. Please try again later.");
    }

    if (!localAuditRuntime(deps.env)) {
      const edgeSecret = deps.env.PUBLIC_AUDIT_EDGE_SECRET?.trim();
      if (
        !edgeSecret ||
        edgeSecret.length < 24 ||
        !(await constantTimeSecretEqual(identity.edgeProof, edgeSecret))
      ) {
        // Header presence does not establish trust. Only the shared proof injected
        // by the Cloudflare edge permits cf-connecting-ip to become rate-limit input.
        throw new Error("The audit is temporarily unavailable. Please try again later.");
      }
    }

    const salt = deps.env.PUBLIC_AUDIT_IP_SALT?.trim();
    if (!salt || salt.length < 24) {
      throw new Error("The audit is temporarily unavailable. Please try again later.");
    }
    const clientKey = await sha256Hex(`milo-public-audit:${salt}:${clientIp.rateIdentity}`);
    return { clientKey, clientLogKey: clientKey.slice(0, 12), rawIp: clientIp.rawIp };
  }

  async function claimRequest(clientKey: string): Promise<void> {
    const { data, error } = await rpc(
      "claim_public_audit_request",
      {
        p_client_key: clientKey,
        p_limit: PUBLIC_AUDIT_PER_IP_HOURLY_LIMIT,
        p_now: deps.now().toISOString(),
      },
      "request limiter",
    );
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
      if (!expectedHostname) {
        throw new Error("turnstile_hostname_unconfigured");
      }
      const hostnameMatches = result.hostname?.trim().toLowerCase() === expectedHostname;
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
    const { data, error } = await rpc(
      "get_public_audit_cache",
      {
        p_cache_key: cacheKeyValue,
        p_now: deps.now().toISOString(),
      },
      "cache read",
    );
    if (error) {
      console.error("[public-audit] cache read unavailable", { message: error.message });
      throw new Error("The audit is temporarily unavailable. Please try again later.");
    }
    return asAudit(data);
  }

  async function fetchHtml(normalizedUrl: string): Promise<string> {
    let result: SafeFetchResult;
    try {
      result = await deps.safeFetchImpl(normalizedUrl, {
        method: "GET",
        maxBytes: PUBLIC_AUDIT_MAX_BYTES,
        maxRedirects: PUBLIC_AUDIT_MAX_REDIRECTS,
        timeoutMs: PUBLIC_AUDIT_TIMEOUT_MS,
        headers: {
          "User-Agent": "MiloGrowthAuditBot/1.0 (+https://milogrowth.com)",
          Accept: "text/html,application/xhtml+xml;q=0.9",
        },
      });
    } catch {
      throw new Error("Couldn’t read that website. Check the URL is public and reachable, then try again.");
    }
    if (!result.ok) {
      throw new Error("Couldn’t read that website. Check the URL is public and reachable, then try again.");
    }
    if (!/^text\/html\b|^application\/xhtml\+xml\b/i.test(result.contentType)) {
      throw new Error("Couldn’t read that website. Check the URL is public and reachable, then try again.");
    }
    return result.body;
  }

  async function claimFetch(): Promise<void> {
    const { data, error } = await rpc(
      "claim_public_audit_fetch",
      {
        p_day: deps.now().toISOString().slice(0, 10),
        p_cap: PUBLIC_AUDIT_DAILY_FETCH_LIMIT,
        p_now: deps.now().toISOString(),
      },
      "fetch limiter",
    );
    if (error) {
      console.error("[public-audit] fetch limiter unavailable", { message: error.message });
      throw new Error("The audit is temporarily unavailable. Please try again later.");
    }
    const row = firstRow(data);
    if (!row) {
      throw new Error("The audit is temporarily unavailable. Please try again later.");
    }
    if (row.allowed !== true) {
      throw new Error("The daily audit limit has been reached. Please try again tomorrow.");
    }
  }

  async function claimAi(cacheKeyValue: string): Promise<PublicAuditAiClaim> {
    const { data, error } = await rpc(
      "claim_public_audit_ai",
      {
        p_cache_key: cacheKeyValue,
        p_day: deps.now().toISOString().slice(0, 10),
        p_cap: PUBLIC_AUDIT_DAILY_AI_LIMIT,
        p_lock_seconds: 90,
        p_now: deps.now().toISOString(),
      },
      "AI limiter",
    );
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
    const response = await rpc(
      "complete_public_audit_cache",
      {
        p_cache_key: cacheKeyValue,
        p_result: result,
        p_ttl_seconds: PUBLIC_AUDIT_CACHE_SECONDS,
        p_now: deps.now().toISOString(),
      },
      "cache completion",
    );
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

  return {
    beginRequest,
    cacheKey,
    getCached,
    claimFetch,
    fetchHtml,
    claimAi,
    completeCache,
    observe,
  };
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
      edgeProof: getRequestHeader("x-milo-edge-auth"),
    };
  },
  rpc: productionRpc,
  now: () => new Date(),
});

export const beginPublicAuditRequest = publicAuditSafety.beginRequest;
export const publicAuditCacheKey = publicAuditSafety.cacheKey;
export const getCachedPublicAudit = publicAuditSafety.getCached;
export const claimPublicAuditFetch = publicAuditSafety.claimFetch;
export const fetchPublicAuditHtml = publicAuditSafety.fetchHtml;
export const claimPublicAuditAi = publicAuditSafety.claimAi;
export const completePublicAuditCache = publicAuditSafety.completeCache;
export const observePublicAudit = publicAuditSafety.observe;
