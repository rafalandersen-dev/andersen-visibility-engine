import { startTechnicalSitemaps, advanceTechnicalSitemaps } from "./technical-sitemap";
import { z } from "zod";
import { isSafePublicUrl } from "./safe-fetch";
import { advanceTechnicalCrawl, startTechnicalCrawl } from "./technical-crawl";
import { fitTechnicalCrawlState, parseTechnicalCrawlState } from "./technical-crawl-state";
import {
  fetchTechnicalRobots,
  technicalPageFetcher,
  technicalSitemapFetcher,
} from "./technical-fetch.server";
export type TechnicalRpc = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: unknown }>;
export const technicalRunTarget = z
  .object({ projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), runId: z.string().uuid() })
  .strict();
export const technicalProjectTarget = technicalRunTarget.omit({ runId: true });
export async function technicalCrawlRpc(name: string, args: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return await (supabaseAdmin as unknown as { rpc: TechnicalRpc }).rpc(name, args);
}
const row = z
  .object({
    user_id: z.string().uuid(),
    project_id: z.string(),
    run_id: z.string().uuid(),
    website_value: z.string().max(8192),
    origin: z.string().max(8192),
    status: z.enum(["preparing", "running", "completed", "cancelled", "failed", "held"]),
    revision: z.number().int().positive(),
    state: z.unknown(),
    created_at: z.string(),
    updated_at: z.string(),
    lease_token: z.string().uuid().nullable().optional(),
    lease_until: z.string().nullable().optional(),
  })
  .passthrough();
function originFor(value: string) {
  const candidate = value.trim();
  const u = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
  if (!isSafePublicUrl(u.href) || u.username || u.password)
    throw new Error("technical_website_invalid");
  return u.origin;
}
async function call(rpc: TechnicalRpc, name: string, args: Record<string, unknown>) {
  const r = await rpc(name, args);
  if (r.error) throw new Error("technical_crawl_unavailable");
  return r.data;
}
function checked(raw: unknown, user: string, target: z.infer<typeof technicalRunTarget>) {
  const r = row.parse(raw);
  if (
    r.user_id !== user ||
    r.project_id !== target.projectId ||
    r.run_id !== target.runId ||
    originFor(r.website_value) !== r.origin
  )
    throw new Error("technical_crawl_scope_invalid");
  return r;
}
function view(r: z.infer<typeof row>) {
  let state = null;
  if (r.state && typeof r.state === "object" && "queue" in r.state)
    state = parseTechnicalCrawlState(r.state, r.origin);
  else if (!["preparing", "cancelled", "held", "failed"].includes(r.status))
    throw new Error("technical_state_invalid");
  return {
    runId: r.run_id,
    projectId: r.project_id,
    origin: r.origin,
    status: r.status,
    revision: r.revision,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    state,
  };
}
export async function readTechnicalRun(
  user: string,
  raw: unknown,
  rpc: TechnicalRpc = technicalCrawlRpc,
) {
  const target = technicalRunTarget.parse(raw);
  const data = await call(rpc, "read_technical_crawl", {
    p_user: user,
    p_project: target.projectId,
    p_run: target.runId,
  });
  return data === null ? null : view(checked(data, user, target));
}
export async function startTechnicalRun(
  user: string,
  raw: unknown,
  rpc: TechnicalRpc = technicalCrawlRpc,
) {
  const target = technicalRunTarget.parse(raw);
  const context = z
    .object({
      website: z.string().min(1).max(8192),
      revision: z.number().int().nonnegative(),
      appLanguage: z.string().max(100).optional(),
    })
    .strict()
    .parse(
      await call(rpc, "read_technical_crawl_context", {
        p_user: user,
        p_project: target.projectId,
      }),
    );
  const data = await call(rpc, "start_technical_crawl", {
    p_user: user,
    p_project: target.projectId,
    p_run: target.runId,
    p_expected: context.revision,
    p_website: context.website,
    p_origin: originFor(context.website),
  });
  return view(checked(data, user, target));
}
export async function cancelTechnicalRun(
  user: string,
  raw: unknown,
  rpc: TechnicalRpc = technicalCrawlRpc,
) {
  const target = technicalRunTarget.parse(raw);
  await call(rpc, "cancel_technical_crawl", {
    p_user: user,
    p_project: target.projectId,
    p_run: target.runId,
  });
  return readTechnicalRun(user, target, rpc);
}
export async function listTechnicalRuns(
  user: string,
  raw: unknown,
  rpc: TechnicalRpc = technicalCrawlRpc,
) {
  const target = technicalProjectTarget.parse(raw);
  return z
    .array(
      z
        .object({
          run_id: z.string().uuid(),
          origin: z.string().max(8192),
          status: row.shape.status,
          revision: z.number().int().positive(),
          created_at: z.string(),
          updated_at: z.string(),
        })
        .strict(),
    )
    .max(20)
    .parse(await call(rpc, "list_technical_crawls", { p_user: user, p_project: target.projectId }));
}
export async function stepTechnicalRun(
  user: string,
  raw: unknown,
  deps: {
    rpc: TechnicalRpc;
    robots: typeof fetchTechnicalRobots;
    fetcher: typeof technicalPageFetcher;
    sitemaps: typeof technicalSitemapFetcher;
    now: () => Date;
  } = {
    rpc: technicalCrawlRpc,
    robots: fetchTechnicalRobots,
    fetcher: technicalPageFetcher,
    sitemaps: technicalSitemapFetcher,
    now: () => new Date(),
  },
) {
  const target = technicalRunTarget.parse(raw);
  const claimed = await call(deps.rpc, "claim_technical_crawl", {
    p_user: user,
    p_project: target.projectId,
    p_run: target.runId,
  });
  if (claimed === null) return readTechnicalRun(user, target, deps.rpc);
  const current = checked(claimed, user, target);
  if (
    !current.lease_token ||
    !current.lease_until ||
    Date.parse(current.lease_until) <= deps.now().getTime()
  )
    throw new Error("technical_crawl_lease_invalid");
  let state: unknown, status: string;
  try {
    if (current.status === "preparing") {
      const robots = await deps.robots(current.origin);
      const now = deps.now().toISOString();
      state = fitTechnicalCrawlState({
        ...startTechnicalCrawl({ siteUrl: current.origin, robots, robotsFetchedAt: now, now }),
        sitemaps: startTechnicalSitemaps(
          current.origin,
          robots.state === "read" ? robots.document.sitemaps : [],
        ),
      });
    } else {
      const saved = parseTechnicalCrawlState(current.state, current.origin);
      if (saved.status !== "running") throw new Error("technical_state_invalid");
      if (saved.sitemaps?.queue.length) {
        const now = deps.now().toISOString();
        const age = Date.parse(now) - Date.parse(saved.robotsFetchedAt);
        if (age < 0 || age > 24 * 60 * 60 * 1000) saved.status = "robots_stale";
        else {
          saved.sitemaps = await advanceTechnicalSitemaps(
            saved.sitemaps,
            current.origin,
            saved.robots,
            deps.sitemaps(current.origin, saved.robots),
            now,
          );
          for (const entry of saved.sitemaps.entries) {
            if (
              saved.queue.some((q) => q.url === entry.url) ||
              saved.pages.some((p) => p.requestedUrl === entry.url)
            )
              continue;
            if (saved.queue.length + saved.pages.length >= 2000) {
              if (!saved.coverageLimits.includes("discovery_limit"))
                saved.coverageLimits.push("discovery_limit");
              break;
            }
            saved.queue.push({ url: entry.url, depth: null });
          }
        }
        saved.updatedAt = now;
        state = fitTechnicalCrawlState(saved);
      } else
        state = fitTechnicalCrawlState(
          await advanceTechnicalCrawl(
            saved,
            deps.fetcher(current.origin, saved.robots),
            deps.now().toISOString(),
          ),
        );
    }
    const parsed = parseTechnicalCrawlState(state, current.origin);
    status =
      parsed.status === "robots_stale"
        ? "held"
        : parsed.status === "cancelled"
          ? "cancelled"
          : parsed.status;
  } catch {
    state = { origin: current.origin, failure: "observation_unavailable" };
    status = "failed";
  }
  // No optimistic return: cancellation or a superseded lease can reject this save.
  await call(deps.rpc, "save_technical_crawl_step", {
    p_user: user,
    p_project: target.projectId,
    p_run: target.runId,
    p_lease: current.lease_token,
    p_revision: current.revision,
    p_state: state,
    p_status: status,
  });
  return readTechnicalRun(user, target, deps.rpc);
}
