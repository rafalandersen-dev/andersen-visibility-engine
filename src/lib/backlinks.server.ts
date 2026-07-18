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

const asNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(parseFloat(value)))
    return parseFloat(value);
  return fallback;
};

const asDate = (value: unknown): string | undefined => {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.slice(0, 10);
};

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
  const account = isRecord(result[0]) ? result[0] : {};
  const money = isRecord(account.money) ? account.money : {};
  const balance = asNumber(money.balance, Number.NaN);
  const balanceUsd = Number.isFinite(balance) ? balance : undefined;

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
    const body = await res.json().catch(() => null);
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
  let res: Response;
  try {
    res = await fetch(`${DFS_BASE}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([payload]),
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    throw new Error(
      aborted
        ? "The backlink data source timed out. Please try again."
        : "Could not reach the backlink data source. Please try again.",
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403)
    throw new Error(
      "Backlink data source rejected the credentials. Check the DataForSEO login/password.",
    );
  if (!res.ok) throw new Error(`Backlink data source returned an error (HTTP ${res.status}).`);

  const body = (await res.json().catch(() => null)) as UnknownRecord | null;
  const statusCode = asNumber(body?.status_code, 0);
  assertAccountUsable(statusCode, String(body?.status_message ?? ""));

  const tasks = Array.isArray(body?.tasks) ? body?.tasks : [];
  const task = isRecord(tasks?.[0]) ? (tasks[0] as UnknownRecord) : null;
  const taskStatus = asNumber(task?.status_code, 0);
  if (!task || taskStatus !== 20000) {
    const message = String(task?.status_message ?? body?.status_message ?? "unknown error");
    console.error("[backlinks.server] task failed", { path, taskStatus, message });
    assertAccountUsable(taskStatus, message);
    throw new Error(`Backlink data request failed: ${message.slice(0, 160)}`);
  }
  return Array.isArray(task.result) ? task.result : [];
}

// ---- Normalizers (exported for unit tests) ----

export function normalizeSummaryResult(result: unknown[], target: string): BacklinkTargetSummary {
  const row = isRecord(result?.[0]) ? (result[0] as UnknownRecord) : {};
  const info = isRecord(row.info) ? (row.info as UnknownRecord) : {};
  return {
    target,
    fetchStatus: "fetched",
    rank: asNumber(row.rank),
    backlinks: asNumber(row.backlinks),
    referringDomains: asNumber(row.referring_domains),
    referringMainDomains: asNumber(row.referring_main_domains),
    brokenBacklinks: asNumber(row.broken_backlinks),
    spamScore: asNumber(row.backlinks_spam_score, asNumber(info.target_spam_score)),
    firstSeen: asDate(row.first_seen),
  };
}

export function normalizeReferringDomainItems(result: unknown[]): BacklinkReferringDomain[] {
  const first = isRecord(result?.[0]) ? (result[0] as UnknownRecord) : {};
  const items = Array.isArray(first.items) ? first.items : [];
  return items
    .filter(isRecord)
    .map((item) => ({
      domain: String(item.domain ?? "").trim(),
      rank: asNumber(item.rank),
      backlinks: asNumber(item.backlinks),
      spamScore: asNumber(item.backlinks_spam_score),
      firstSeen: asDate(item.first_seen),
    }))
    .filter((item) => item.domain);
}

/**
 * Each domain_intersection item = one referring domain, with a per-target-key
 * entry describing that domain's links toward each competitor. The referring
 * domain name lives in each entry's `target` field.
 */
export function normalizeIntersectionItems(
  result: unknown[],
  targetKeyToCompetitor: Record<string, string>,
): BacklinkGapDomain[] {
  const first = isRecord(result?.[0]) ? (result[0] as UnknownRecord) : {};
  const items = Array.isArray(first.items) ? first.items : [];
  const gaps: BacklinkGapDomain[] = [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const intersection = isRecord(item.domain_intersection)
      ? (item.domain_intersection as UnknownRecord)
      : {};
    let domain = "";
    let rank = 0;
    let totalCompetitorBacklinks = 0;
    const competitorsLinked: string[] = [];
    for (const [key, entry] of Object.entries(intersection)) {
      if (!isRecord(entry)) continue;
      const entryDomain = String(entry.target ?? "")
        .trim()
        .replace(/^www\./, "");
      if (entryDomain && !domain) domain = entryDomain;
      rank = Math.max(rank, asNumber(entry.rank));
      totalCompetitorBacklinks += asNumber(entry.backlinks);
      const competitor = targetKeyToCompetitor[key];
      if (competitor) competitorsLinked.push(competitor);
    }
    if (!domain) continue;
    gaps.push({
      domain,
      rank,
      intersections: competitorsLinked.length,
      competitorsLinked,
      totalCompetitorBacklinks,
    });
  }
  return gaps;
}

// ---- Fetchers ----

export async function fetchBacklinkSummary(domain: string): Promise<BacklinkTargetSummary> {
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
  const result = await dfsRequest("/v3/backlinks/referring_domains/live", {
    target: domain,
    limit,
    order_by: ["rank,desc"],
    exclude_internal_backlinks: true,
  });
  return normalizeReferringDomainItems(result);
}

/** Domains linking to ≥1 competitor but NOT to the business's own domain. */
export async function fetchBacklinkGap(
  ownDomain: string,
  competitorDomains: string[],
  limit = 30,
): Promise<BacklinkGapDomain[]> {
  const competitors = competitorDomains.filter(Boolean).slice(0, 3);
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
  return normalizeIntersectionItems(result, targets)
    .filter((gap) => gap.domain !== ownHost && !competitors.includes(gap.domain))
    .sort((a, b) => b.intersections - a.intersections || b.rank - a.rank);
}
