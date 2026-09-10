/**
 * DataForSEO Backlinks API client (server-only).
 *
 * Credentials come from Lovable Cloud secrets: DATAFORSEO_LOGIN and
 * DATAFORSEO_PASSWORD (Basic auth). They are read server-side only and never
 * returned to the client or logged. All endpoints used are "live" mode —
 * pay-as-you-go, no task queue.
 *
 * The raw index numbers (rank, backlinks, referring domains, spam score) are
 * passed through as-is; interpretation happens in the AI layer.
 */
import type {
  BacklinkTargetSummary,
  BacklinkReferringDomain,
  BacklinkGapDomain,
  BacklinkProviderStatus,
} from "./types";

const DFS_BASE = "https://api.dataforseo.com";
const DFS_TIMEOUT_MS = 25_000;
const DFS_LOW_BALANCE_USD = 1;

export function isDataForSeoConfigured(): boolean {
  return Boolean(
    (process.env.DATAFORSEO_LOGIN ?? "").trim() && (process.env.DATAFORSEO_PASSWORD ?? "").trim(),
  );
}

/** Extract a bare registrable hostname from a URL or domain string ("" if invalid). */
export function extractDomain(raw: string): string {
  let value = (raw || "").trim().toLowerCase();
  if (!value) return "";
  if (!/^https?:\/\//.test(value)) value = `https://${value}`;
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    // Reject bare TLDs / localhost-style values — the index needs a real domain.
    if (!host.includes(".")) return "";
    return host;
  } catch {
    return "";
  }
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const invalid = () => new Error("Backlink data response could not be validated.");

function metric(value: unknown, max = Number.MAX_SAFE_INTEGER, integer = true): number | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  )
    throw invalid();
  return value;
}
function domainIdentity(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/i.test(value)
  )
    throw invalid();
  return value.toLowerCase();
}
function resultRow(result: unknown): UnknownRecord {
  if (!Array.isArray(result) || result.length !== 1 || !isRecord(result[0])) throw invalid();
  return result[0];
}
function itemsFor(row: UnknownRecord, limit: number): UnknownRecord[] {
  const items =
    row.items === null && row.items_count === 0 && row.total_count === 0 ? [] : row.items;
  if (!Array.isArray(items) || items.length > limit || !items.every(isRecord)) throw invalid();
  if (row.items_count !== undefined && metric(row.items_count) !== items.length) throw invalid();
  if (
    row.total_count !== undefined &&
    (metric(row.total_count) === null || (row.total_count as number) < items.length)
  )
    throw invalid();
  return items;
}
const asDate = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?: |T)/.test(value)) throw invalid();
  const day = value.slice(0, 10);
  const date = new Date(day);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) throw invalid();
  return day;
};

function sameScope(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((value, index) => sameScope(actual[index], value))
    );
  if (isRecord(expected))
    return (
      isRecord(actual) &&
      Object.keys(actual).length === Object.keys(expected).length &&
      Object.entries(expected).every(
        ([key, value]) => Object.hasOwn(actual, key) && sameScope(actual[key], value),
      )
    );
  return actual === expected;
}

/** Bound bytes and keep the request deadline active through the entire body. */
export async function readBacklinkBody(res: Response, signal?: AbortSignal): Promise<unknown> {
  const reader = res.body?.getReader();
  if (!reader) throw invalid();
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      if (signal?.aborted) throw invalid();
      const { done, value } = await reader.read();
      if (signal?.aborted) throw invalid();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) {
        void reader.cancel().catch(() => {});
        throw invalid();
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw invalid();
  } finally {
    signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

/**
 * Map DataForSEO account-level failures (top-level or per-task) to friendly
 * errors. 40200 = payment required, 40201 = account blocked/paused (e.g. the
 * "unusual activity" pause on fresh accounts). Exported for unit tests.
 */
export function assertAccountUsable(statusCode: number, statusMessage: string): void {
  if (statusCode === 40200 || /payment|money|funds/i.test(statusMessage))
    throw new Error(
      "The backlink data account has no remaining balance. Top up DataForSEO to continue.",
    );
  if (statusCode === 40201 || /blocked|paused|suspend|unusual activity/i.test(statusMessage))
    throw new Error(
      "The backlink data account is temporarily paused by DataForSEO. Contact support@dataforseo.com to reactivate it, then try again.",
    );
}

function isPausedAccount(statusCode: number, statusMessage: string): boolean {
  return statusCode === 40201 || /blocked|paused|suspend|unusual activity/i.test(statusMessage);
}

function isBalanceFailure(statusCode: number, statusMessage: string): boolean {
  return statusCode === 40200 || /payment|money|funds/i.test(statusMessage);
}

/**
 * Convert the free appendix/user_data response to a small client-safe health
 * summary. Exported so response/error handling can be covered with fixtures.
 */
export function normalizeDataForSeoHealth(body: unknown): BacklinkProviderStatus {
  const root = isRecord(body) ? body : {};
  const tasks = Array.isArray(root.tasks) ? root.tasks : [];
  const task = isRecord(tasks[0]) ? tasks[0] : {};
  const rootCode = asNumber(root.status_code);
  const taskCode = asNumber(task.status_code);
  const statusCode = taskCode || rootCode;
  const statusMessage = String(task.status_message ?? root.status_message ?? "");
  const checkedAt = new Date().toISOString();

  if (isPausedAccount(statusCode, statusMessage)) {
    return { configured: true, state: "paused", checkedAt };
  }
  if (isBalanceFailure(statusCode, statusMessage)) {
    return { configured: true, state: "low_balance", balanceUsd: 0, checkedAt };
  }
  if (rootCode !== 20000 || taskCode !== 20000) {
    return { configured: true, state: "error", checkedAt };
  }

  const result = Array.isArray(task.result) ? task.result : [];
  if (result.length !== 1 || !isRecord(result[0]))
    return { configured: true, state: "error", checkedAt };
  const account = result[0];
  const money = isRecord(account.money) ? account.money : {};
  const balance = asNumber(money.balance, Number.NaN);
  const balanceUsd = Number.isFinite(balance) && balance >= 0 ? balance : undefined;
  if (balanceUsd === undefined) return { configured: true, state: "error", checkedAt };

  // DataForSEO explicitly returns null when the Backlinks API subscription is
  // inactive. Older responses may omit the field, so only an explicit null is
  // treated as an account error.
  if (
    Object.prototype.hasOwnProperty.call(account, "backlinks_subscription_expiry_date") &&
    account.backlinks_subscription_expiry_date === null
  ) {
    return { configured: true, state: "error", balanceUsd, checkedAt };
  }

  return {
    configured: true,
    state: balanceUsd !== undefined && balanceUsd < DFS_LOW_BALANCE_USD ? "low_balance" : "ready",
    balanceUsd,
    checkedAt,
  };
}

/** Free, read-only provider check. Credentials and raw account data stay server-side. */
export async function getDataForSeoHealth(): Promise<BacklinkProviderStatus> {
  const login = (process.env.DATAFORSEO_LOGIN ?? "").trim();
  const password = (process.env.DATAFORSEO_PASSWORD ?? "").trim();
  if (!login || !password) return { configured: false, state: "not_configured" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DFS_TIMEOUT_MS);
  try {
    const res = await fetch(`${DFS_BASE}/v3/appendix/user_data`, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
    });
    if (res.status === 401 || res.status === 403) {
      return { configured: true, state: "error", checkedAt: new Date().toISOString() };
    }
    if (!res.ok) {
      const state = res.status === 402 ? "low_balance" : "error";
      return {
        configured: true,
        state,
        balanceUsd: res.status === 402 ? 0 : undefined,
        checkedAt: new Date().toISOString(),
      };
    }
    const body = await readBacklinkBody(res, controller.signal);
    return normalizeDataForSeoHealth(body);
  } catch (error) {
    console.warn("[backlinks.server] provider health check failed", {
      reason: error instanceof Error && error.name === "AbortError" ? "timeout" : "network",
    });
    return { configured: true, state: "error", checkedAt: new Date().toISOString() };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST one task to a DataForSEO live endpoint and return tasks[0].result.
 * Throws a friendly Error on auth/credit/HTTP/task failures (message is safe
 * to surface — it never contains credentials).
 */
async function dfsRequest(path: string, payload: UnknownRecord): Promise<unknown[]> {
  const login = (process.env.DATAFORSEO_LOGIN ?? "").trim();
  const password = (process.env.DATAFORSEO_PASSWORD ?? "").trim();
  if (!login || !password) throw new Error("Backlink data source is not configured.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DFS_TIMEOUT_MS);
  try {
    const res = await fetch(`${DFS_BASE}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([payload]),
    });
    if (res.status === 401 || res.status === 403)
      throw new Error("Backlink data source rejected the credentials.");
    if (!res.ok) throw invalid();
    const body = await readBacklinkBody(res, controller.signal);
    if (!isRecord(body)) throw invalid();
    assertAccountUsable(asNumber(body.status_code), String(body.status_message ?? ""));
    if (
      body.status_code !== 20000 ||
      !Array.isArray(body.tasks) ||
      body.tasks.length !== 1 ||
      !isRecord(body.tasks[0])
    )
      throw invalid();
    const task = body.tasks[0];
    assertAccountUsable(asNumber(task.status_code), String(task.status_message ?? ""));
    if (task.status_code !== 20000 || !Array.isArray(task.result)) throw invalid();
    // Echoed task parameters bind results to this exact domain scope.
    if (!isRecord(task.data)) throw invalid();
    for (const key of ["target", "targets", "exclude_targets"] as const) {
      if (payload[key] !== undefined && !sameScope(task.data[key], payload[key])) throw invalid();
    }
    return task.result;
  } catch {
    // Never surface raw upstream messages, URLs, response bodies or network errors.
    throw new Error(
      controller.signal.aborted
        ? "The backlink data source timed out."
        : "Backlink data request failed. Check the provider status before another analysis.",
    );
  } finally {
    clearTimeout(timer);
  }
}

// ---- Normalizers (exported for unit tests) ----

export function normalizeSummaryResult(result: unknown[], target: string): BacklinkTargetSummary {
  const row = resultRow(result);
  if (domainIdentity(row.target) !== domainIdentity(target)) throw invalid();
  const info = isRecord(row.info) ? row.info : {};
  const metrics = {
    rank: metric(row.rank, 1000),
    backlinks: metric(row.backlinks),
    referringDomains: metric(row.referring_domains),
    referringMainDomains: metric(row.referring_main_domains),
    brokenBacklinks: metric(row.broken_backlinks),
    spamScore: metric(row.backlinks_spam_score ?? info.target_spam_score, 100, false),
  };
  const values = Object.values(metrics);
  return {
    target,
    fetchStatus: values.every((v) => v === null)
      ? "unavailable"
      : values.some((v) => v === null)
        ? "partial"
        : "fetched",
    ...metrics,
    firstSeen: asDate(row.first_seen),
  };
}

export function normalizeReferringDomainItems(
  result: unknown[],
  target?: string,
  limit = 25,
): BacklinkReferringDomain[] {
  const first = resultRow(result);
  if (target !== undefined && domainIdentity(first.target) !== domainIdentity(target))
    throw invalid();
  const seen = new Set<string>();
  return itemsFor(first, limit).map((item) => {
    const domain = domainIdentity(item.domain);
    if (seen.has(domain)) throw invalid();
    seen.add(domain);
    return {
      domain,
      rank: metric(item.rank, 1000),
      backlinks: metric(item.backlinks),
      spamScore: metric(item.backlinks_spam_score, 100, false),
      firstSeen: asDate(item.first_seen),
    };
  });
}

/** Only declared target keys may contribute; conflicting referring identities fail. */
export function normalizeIntersectionItems(
  result: unknown[],
  targetKeyToCompetitor: Record<string, string>,
  limit = 30,
): BacklinkGapDomain[] {
  const first = resultRow(result);
  if (
    !isRecord(first.targets) ||
    Object.keys(first.targets).length !== Object.keys(targetKeyToCompetitor).length ||
    Object.entries(targetKeyToCompetitor).some(
      ([key, value]) => first.targets && (first.targets as UnknownRecord)[key] !== value,
    )
  )
    throw invalid();
  const seen = new Set<string>();
  return itemsFor(first, limit).map((item) => {
    if (!isRecord(item.domain_intersection)) throw invalid();
    let domain = "";
    let rank: number | null = 0;
    let total: number | null = 0;
    const competitorsLinked: string[] = [];
    for (const [key, entry] of Object.entries(item.domain_intersection)) {
      if (!Object.hasOwn(targetKeyToCompetitor, key)) throw invalid();
      if (entry === null) continue;
      if (!isRecord(entry)) throw invalid();
      // Match the existing own/competitor domain extraction for referring-domain comparisons.
      const entryDomain = domainIdentity(entry.target).replace(/^www\./, "");
      if (domain && domain !== entryDomain) throw invalid();
      domain = entryDomain;
      const entryRank = metric(entry.rank, 1000);
      const count = metric(entry.backlinks);
      rank = rank === null || entryRank === null ? null : Math.max(rank, entryRank);
      total = total === null || count === null ? null : total + count;
      if (total !== null && !Number.isSafeInteger(total)) throw invalid();
      competitorsLinked.push(targetKeyToCompetitor[key]);
    }
    if (!domain || seen.has(domain)) throw invalid();
    seen.add(domain);
    return {
      domain,
      rank,
      intersections: competitorsLinked.length,
      competitorsLinked,
      totalCompetitorBacklinks: total,
    };
  });
}

// ---- Fetchers ----

export async function fetchBacklinkSummary(domain: string): Promise<BacklinkTargetSummary> {
  domainIdentity(domain);
  const result = await dfsRequest("/v3/backlinks/summary/live", {
    target: domain,
    include_subdomains: true,
    exclude_internal_backlinks: true,
    internal_list_limit: 10,
  });
  return normalizeSummaryResult(result, domain);
}

export async function fetchTopReferringDomains(
  domain: string,
  limit = 25,
): Promise<BacklinkReferringDomain[]> {
  domainIdentity(domain);
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw invalid();
  const result = await dfsRequest("/v3/backlinks/referring_domains/live", {
    target: domain,
    include_subdomains: true,
    limit,
    order_by: ["rank,desc"],
    exclude_internal_backlinks: true,
  });
  return normalizeReferringDomainItems(result, domain, limit);
}

/** Domains linking to ≥1 competitor but NOT to the business's own domain. */
export async function fetchBacklinkGap(
  ownDomain: string,
  competitorDomains: string[],
  limit = 30,
): Promise<BacklinkGapDomain[]> {
  domainIdentity(ownDomain);
  if (!Number.isInteger(limit) || limit < 1 || limit > 30) throw invalid();
  const competitors = [...new Set(competitorDomains)].filter((d) => d !== ownDomain).slice(0, 3);
  competitors.forEach(domainIdentity);
  if (!competitors.length) return [];
  const targets: Record<string, string> = {};
  competitors.forEach((domain, index) => {
    targets[String(index + 1)] = domain;
  });
  const result = await dfsRequest("/v3/backlinks/domain_intersection/live", {
    targets,
    exclude_targets: [ownDomain],
    include_subdomains: true,
    exclude_internal_backlinks: true,
    limit,
    order_by: ["1.rank,desc"],
  });
  const ownHost = ownDomain.replace(/^www\./, "");
  return normalizeIntersectionItems(result, targets, limit)
    .filter((gap) => gap.domain !== ownHost && !competitors.includes(gap.domain))
    .sort((a, b) => b.intersections - a.intersections || (b.rank ?? -1) - (a.rank ?? -1));
}
