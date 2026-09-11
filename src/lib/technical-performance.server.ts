import { z } from "zod";
import { inspectionUrl } from "./google-index";
import { isSafePublicUrl } from "./safe-fetch";
import { technicalCrawlRpc, type TechnicalRpc } from "./technical-crawl.server";
import {
  fetchTechnicalPerformance,
  performanceQuery,
  type PerformanceObservation,
  type PerformanceQuery,
} from "./technical-performance-transport.server";
export const performanceProject = z
  .object({ projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) })
  .strict();
export const performanceRequest = performanceProject
  .extend({ requestId: z.string().uuid(), query: performanceQuery })
  .strict();
const stored = z.object({
  user_id: z.string().uuid(),
  project_id: z.string(),
  request_id: z.string().uuid(),
  website_value: z.string(),
  origin: z.string(),
  url: z.string(),
  source: z.enum(["crux", "pagespeed"]),
  scope: z.enum(["url", "origin"]),
  device: z.string(),
  status: z.enum(["running", "succeeded", "failed", "unknown", "held"]),
  observation: z.record(z.unknown()).nullable(),
  error_code: z.enum(["access", "quota", "unavailable", "configuration"]).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  lease_token: z.string().uuid().optional(),
});
function originFor(website: string) {
  const value = website.trim();
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  if (!isSafePublicUrl(url.href) || url.username || url.password)
    throw new Error("performance_scope");
  return url.origin;
}
async function call(rpc: TechnicalRpc, name: string, args: Record<string, unknown>) {
  const result = await rpc(name, args);
  if (result.error) throw new Error("performance_unavailable");
  return result.data;
}
function checked(raw: unknown, user: string, project: string) {
  const row = stored.parse(raw),
    url = inspectionUrl(row.url);
  if (
    row.user_id !== user ||
    row.project_id !== project ||
    !url ||
    url !== row.url ||
    new URL(url).origin !== row.origin ||
    originFor(row.website_value) !== row.origin
  )
    throw new Error("performance_scope");
  performanceQuery.parse(
    row.source === "crux"
      ? { source: row.source, url, scope: row.scope, device: row.device }
      : { source: row.source, url, device: row.device },
  );
  if (row.source === "pagespeed" && row.scope !== "url") throw new Error("performance_scope");
  return row;
}
function view(row: z.infer<typeof stored>) {
  return {
    requestId: row.request_id,
    url: row.url,
    source: row.source,
    scope: row.scope,
    device: row.device,
    status: row.status,
    error: row.error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    observationJson: row.observation === null ? null : JSON.stringify(row.observation),
  };
}
function configuredKey(source: "crux" | "pagespeed") {
  return (
    (source === "crux"
      ? process.env.GOOGLE_CRUX_API_KEY
      : process.env.GOOGLE_PAGESPEED_API_KEY
    )?.trim() ?? ""
  );
}
export async function listTechnicalPerformance(
  user: string,
  raw: unknown,
  rpc: TechnicalRpc = technicalCrawlRpc,
) {
  const target = performanceProject.parse(raw);
  const rows = z
    .array(z.unknown())
    .max(20)
    .parse(
      await call(rpc, "list_technical_performance_requests", {
        p_user: user,
        p_project: target.projectId,
      }),
    );
  return {
    configured: {
      crux: Boolean(configuredKey("crux")),
      pagespeed: Boolean(configuredKey("pagespeed")),
    },
    requests: rows.map((row) => view(checked(row, user, target.projectId))),
  };
}
export async function requestTechnicalPerformance(
  user: string,
  raw: unknown,
  deps: {
    rpc?: TechnicalRpc;
    key?: (source: "crux" | "pagespeed") => string;
    fetch?: (query: PerformanceQuery, key: string) => Promise<PerformanceObservation>;
  } = {},
) {
  z.string().uuid().parse(user);
  const target = performanceRequest.parse(raw),
    rpc = deps.rpc ?? technicalCrawlRpc;
  const scope = { p_user: user, p_project: target.projectId };
  const context = z
    .object({ website: z.string() })
    .parse(await call(rpc, "read_technical_performance_context", scope));
  const origin = originFor(context.website),
    url = inspectionUrl(target.query.url);
  if (!url || new URL(url).origin !== origin) throw new Error("performance_scope");
  const query = { ...target.query, url },
    requestScope = query.source === "crux" ? query.scope : "url";
  const reservation = z.object({ claimed: z.boolean(), record: z.unknown() }).parse(
    await call(rpc, "reserve_technical_performance_request", {
      ...scope,
      p_request: target.requestId,
      p_website: context.website,
      p_origin: origin,
      p_url: url,
      p_source: query.source,
      p_scope: requestScope,
      p_device: query.device,
    }),
  );
  const row = checked(reservation.record, user, target.projectId);
  if (
    row.request_id !== target.requestId ||
    row.url !== url ||
    row.website_value !== context.website ||
    row.source !== query.source ||
    row.scope !== requestScope ||
    row.device !== query.device
  )
    throw new Error("performance_scope");
  if (!reservation.claimed) return view(row);
  if (!row.lease_token || row.status !== "running") throw new Error("performance_unavailable");
  const attempt = { ...scope, p_request: target.requestId, p_lease: row.lease_token };
  let observation: PerformanceObservation | null = null,
    error: string | null = null;
  try {
    const key = (deps.key ?? configuredKey)(query.source);
    if (!key) throw new Error("performance_configuration");
    if (!z.boolean().parse(await call(rpc, "authorize_technical_performance_dispatch", attempt)))
      throw new Error("performance_unavailable");
    observation = await (deps.fetch ?? fetchTechnicalPerformance)(query, key);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    error = ["performance_access", "performance_quota", "performance_configuration"].includes(
      message,
    )
      ? message.slice("performance_".length)
      : "unavailable";
  }
  await call(rpc, "finish_technical_performance_request", {
    ...attempt,
    p_observation: observation,
    p_error: error,
  });
  const rows = z
    .array(z.unknown())
    .max(20)
    .parse(await call(rpc, "list_technical_performance_requests", scope));
  const result = rows
    .map((r) => checked(r, user, target.projectId))
    .find((r) => r.request_id === target.requestId);
  if (!result) throw new Error("performance_unavailable");
  return view(result);
}
