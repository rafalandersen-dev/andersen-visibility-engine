/**
 * Monthly Auto-Scheduler — the server runner (owner spec 2026-07-23).
 *
 * Invoked by pg_cron (~25th) via /api/auto-scheduler/run. For every project
 * that opted in (Project.autoScheduler.enabled) it fills NEXT month's calendar:
 * compute cadence slots, cap by the plan's remaining monthly content quota,
 * draft candidates through the SAME generation pipeline the editor uses, then
 * per mode either arms real go-lives (auto_publish) or holds everything as
 * ready drafts for the owner (approve_first) and says so by email.
 *
 * Owner guardrails, enforced here and re-checked at fire time by the publish
 * cron (defence in depth — this runner never bypasses publishBlockers):
 * - never exceed quota            → runTarget(min(slots, remaining))
 * - never double-book a slot      → booked instants dropped in computeMonthlySlots
 * - never publish hookless        → auto_publish arms ONLY hook-approved assets
 * - never publish unresolved links→ autoResolveInternalLinks + publishBlockers
 * - approve_first NEVER publishes → that branch never touches the queue
 *
 * Mutation discipline (workspace.server.ts contract): all AI/model/network I/O
 * happens FIRST, then one pure re-runnable mutateWorkspace callback per project
 * appends the drafted assets and advances their opportunities. Queue rows are
 * inserted only AFTER the blob write succeeds, so a lost race can never leave
 * an armed row pointing at an asset that was never persisted.
 */
import type { ContentAsset, DiscoverySuggestion, Opportunity, Project, ServiceItem } from "./types";
import {
  AutoSchedulerConfig,
  autoResolveInternalLinks,
  computeMonthlySlots,
  nextMonthOf,
  normalizeAutoSchedulerConfig,
  refillableSuggestions,
  runTarget,
  selectCandidates,
  type ScheduleSlot,
} from "./auto-scheduler";
import { generateContentCore, generateOpportunitiesCore } from "./ai.functions";
import { readWorkspaceRow, mutateWorkspace, type WorkspaceData } from "./workspace.server";
import { buildActiveInternalPaths } from "./publish-targets";
import { publishBlockers } from "./checklist";
import { approveHook, newHookFromProposal, validateHook } from "./hook";
import { isSitemapInventoryFresh } from "./sitemap";
import { fetchSitemapInventoryCore } from "./sitemap.functions";
import { slugifyForPublish } from "./markdown";
import { getPlanLimitsFor } from "./billing";
import { usagePeriod } from "./ai-usage.server";
import { contentLangToProjectLanguage } from "./onboarding";

// ---------------------------------------------------------------------------
// Summary shape (heartbeat + email + route response)
// ---------------------------------------------------------------------------

export interface ProjectRunReport {
  projectId: string;
  projectName: string;
  mode: AutoSchedulerConfig["mode"];
  slots: number;
  remainingQuota: number;
  target: number;
  generated: number;
  armed: number;
  held: number;
  /** Slots left empty because candidates ran out even after Discover refill. */
  flaggedEmpty: number;
  /** Per-article notes: hook fallback, link remaps, arming refusals… */
  notes: string[];
  /** Recipient for the run-summary email (from the project config). */
  summaryEmailTo?: string;
  error?: string;
}

export interface AutoScheduleRunSummary {
  planned: { year: number; month: number };
  workspaces: number;
  projects: ProjectRunReport[];
}

// ---------------------------------------------------------------------------
// Admin access
// ---------------------------------------------------------------------------

/**
 * Loosely-typed admin handle (same pattern as schedule.functions.ts /
 * publish-cron.server.ts): ai_usage / scheduled_publishes / the heartbeat RPC
 * are not in the generated client types. supabaseAdmin is a Proxy — always
 * call from()/rpc() as methods, never detach them.
 */
interface QueryChain extends PromiseLike<{ data: unknown; error: { message: string } | null }> {
  select: (cols: string) => QueryChain;
  insert: (row: Record<string, unknown>) => QueryChain;
  eq: (col: string, v: unknown) => QueryChain;
  in: (col: string, v: unknown[]) => QueryChain;
  maybeSingle: () => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}
interface AdminClient {
  from: (table: string) => QueryChain;
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

async function admin(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AdminClient;
}

/**
 * Remaining monthly content generations for this user under their plan.
 * Negative means unlimited. Reads the same ai_usage bucket claimAiUsage
 * increments, so the cap holds even while global metering enforcement is off.
 */
async function remainingContentQuota(userId: string, ws: WorkspaceData): Promise<number> {
  const limits = getPlanLimitsFor(
    (ws as { subscription?: Parameters<typeof getPlanLimitsFor>[0] }).subscription,
  );
  const cap = limits.monthlyContentGenerations;
  if (cap < 0) return -1;
  const db = await admin();
  const { data } = await db
    .from("ai_usage")
    .select("used")
    .eq("user_id", userId)
    .eq("period", usagePeriod())
    .eq("bucket", "contentGeneration")
    .maybeSingle();
  const used = Number((data as { used?: number } | null)?.used ?? 0);
  return Math.max(0, cap - used);
}

/** Pending go-live instants for this user (never double-book against these). */
async function bookedInstants(userId: string, content: ContentAsset[]): Promise<string[]> {
  const db = await admin();
  const { data } = await db
    .from("scheduled_publishes")
    .select("publish_at")
    .eq("user_id", userId)
    .in("status", ["pending", "publishing"]);
  const queue = (Array.isArray(data) ? data : []).map((r) =>
    String((r as { publish_at?: string }).publish_at ?? ""),
  );
  const mirrors = content.map((a) => a.scheduledPublishAt).filter((v): v is string => Boolean(v));
  return [...queue, ...mirrors].filter(Boolean);
}

// ---------------------------------------------------------------------------
// Per-article assembly
// ---------------------------------------------------------------------------

/** Server-side twin of the client asset builder in generateContentForOpportunity. */
function buildAssetFromGeneration(
  gen: Awaited<ReturnType<typeof generateContentCore>>,
  opp: Opportunity,
  project: Project,
  nowIso: string,
): ContentAsset {
  return {
    id: crypto.randomUUID(),
    projectId: opp.projectId,
    opportunityId: opp.id,
    title: opp.title,
    slug: slugifyForPublish(opp.title),
    metaTitle: gen.metaTitle,
    metaDescription: gen.metaDescription,
    h1: gen.h1 || opp.title,
    outline: gen.outline ?? [],
    faq: gen.faq ?? [],
    cta: gen.cta || opp.recommendedCta,
    markdown: gen.markdown,
    internalLinks: gen.internalLinks ?? [],
    schemaSuggestions: gen.schemaSuggestions ?? [],
    editorNotes: gen.editorNotes ?? "",
    status: "Draft",
    updatedAt: nowIso,
    assetType: "article",
    sourceOpportunityId: opp.id,
    sourceOpportunityTitle: opp.title,
    language: project.primaryContentLanguage
      ? contentLangToProjectLanguage(project.primaryContentLanguage)
      : opp.language,
    createdAt: nowIso,
    // Auto-drafted long-form is always a v3 article — hook-gated like the editor path.
    visualModelVersion: 3,
  } as ContentAsset;
}

/**
 * Server-side hook selection: first generated proposal whose resulting asset
 * passes the SAME validateHook gate the editor enforces. Returns the asset
 * with an APPROVED hook, or null when no proposal survives — the caller then
 * holds the draft (never publish hookless).
 */
export function attachBestHook(asset: ContentAsset, nowIso: string): ContentAsset | null {
  for (const proposal of asset.hookProposals ?? []) {
    const hooked: ContentAsset = {
      ...asset,
      hook: approveHook(newHookFromProposal(proposal, crypto.randomUUID(), nowIso), nowIso),
    };
    const v = validateHook(hooked);
    if (v.blockers.length === 0) return hooked;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

export async function runMonthlyAutoScheduler(now = new Date()): Promise<AutoScheduleRunSummary> {
  const planned = nextMonthOf(now);
  const db = await admin();
  const { data: rows, error } = await db.from("workspaces").select("user_id, data");
  if (error) throw new Error("auto_scheduler_workspace_scan_failed");

  const summary: AutoScheduleRunSummary = { planned, workspaces: 0, projects: [] };
  for (const row of Array.isArray(rows) ? rows : []) {
    const userId = String((row as { user_id?: string }).user_id ?? "");
    const data = ((row as { data?: WorkspaceData }).data ?? {}) as WorkspaceData;
    const projects = Array.isArray(data.projects) ? (data.projects as Project[]) : [];
    const enabled = projects.filter((p) => p.autoScheduler?.enabled === true);
    if (!userId || enabled.length === 0) continue;
    summary.workspaces++;
    for (const project of enabled) {
      try {
        summary.projects.push(await runForProject(userId, project.id, now, planned));
      } catch (e) {
        summary.projects.push({
          projectId: project.id,
          projectName: project.businessName || project.name,
          mode: normalizeAutoSchedulerConfig(project.autoScheduler).mode,
          slots: 0,
          remainingQuota: 0,
          target: 0,
          generated: 0,
          armed: 0,
          held: 0,
          flaggedEmpty: 0,
          notes: [],
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  await db
    .rpc("record_cron_heartbeat", {
      job: "monthly-auto-scheduler",
      summary: {
        planned,
        projects: summary.projects.map((p) => ({
          id: p.projectId,
          generated: p.generated,
          armed: p.armed,
          held: p.held,
          error: p.error ?? null,
        })),
      } as unknown as Record<string, unknown>,
    })
    .then(
      () => undefined,
      () => undefined, // heartbeat is telemetry, never a failure reason
    );

  for (const report of summary.projects) {
    await sendSummaryEmail(report, planned).catch(() => undefined);
  }
  return summary;
}

async function runForProject(
  userId: string,
  projectId: string,
  now: Date,
  planned: { year: number; month: number },
): Promise<ProjectRunReport> {
  const row = await readWorkspaceRow(userId);
  if (!row) throw new Error("workspace_missing");
  const ws = row.data;
  const projects = Array.isArray(ws.projects) ? (ws.projects as Project[]) : [];
  const project = projects.find((p) => p.id === projectId);
  if (!project) throw new Error("project_missing");
  const cfg = normalizeAutoSchedulerConfig(project.autoScheduler);
  const services = (Array.isArray(ws.services) ? (ws.services as ServiceItem[]) : []).filter(
    (s) => (s as { projectId?: string }).projectId === projectId,
  );
  const content = Array.isArray(ws.content) ? (ws.content as ContentAsset[]) : [];
  const opportunities = (
    Array.isArray(ws.opportunities) ? (ws.opportunities as Opportunity[]) : []
  ).filter((o) => o.projectId === projectId);

  const report: ProjectRunReport = {
    projectId,
    projectName: project.businessName || project.name,
    mode: cfg.mode,
    slots: 0,
    remainingQuota: 0,
    target: 0,
    generated: 0,
    armed: 0,
    held: 0,
    flaggedEmpty: 0,
    notes: [],
    ...(cfg.summaryEmail ? { summaryEmailTo: cfg.summaryEmail } : {}),
  };

  // ---- 1. Slots, quota, target -------------------------------------------
  const booked = await bookedInstants(
    userId,
    content.filter((a) => a.projectId === projectId),
  );
  const slots = computeMonthlySlots(planned.year, planned.month, cfg, booked);
  report.slots = slots.length;
  report.remainingQuota = await remainingContentQuota(userId, ws);
  report.target = runTarget(slots.length, report.remainingQuota);
  if (report.target === 0) return report;

  // ---- 2. Sitemap first (page-map rule: never let the model guess paths) --
  let liveProject = project;
  if (project.websiteUrl && !isSitemapInventoryFresh(project.sitemapInventory, now.getTime())) {
    const inventory = await fetchSitemapInventoryCore(project.websiteUrl).catch(() => null);
    if (inventory) liveProject = { ...project, sitemapInventory: inventory };
  }

  // ---- 3. Candidates (Planned → Queued → Discover refill) -----------------
  let candidates = selectCandidates(opportunities, report.target);
  const acceptedSuggestionIds: string[] = [];
  if (candidates.length < report.target) {
    const needed = report.target - candidates.length;
    const suggestions = (
      Array.isArray(ws.discoverySuggestions)
        ? (ws.discoverySuggestions as DiscoverySuggestion[])
        : []
    ).filter((sug) => sug.projectId === projectId);
    let refill = refillableSuggestions(suggestions, needed);
    if (refill.length < needed) {
      // Live Discover, exactly like the Plan page button.
      const fresh = await generateOpportunitiesCore(userId, {
        project: liveProject,
        services,
        existingTitles: [...opportunities, ...candidates].map((o) => o.title),
      }).catch(() => null);
      if (fresh?.opportunities?.length) {
        const extra = (fresh.opportunities as Opportunity[])
          .slice(0, needed - refill.length)
          .map(
            (o) =>
              ({ ...o, id: crypto.randomUUID(), projectId, status: "captured" }) as Opportunity,
          );
        candidates = [...candidates, ...refill.map(suggestionToOpportunity), ...extra];
        acceptedSuggestionIds.push(...refill.map((sug) => sug.id));
        refill = [];
      }
    }
    if (refill.length) {
      candidates = [...candidates, ...refill.map(suggestionToOpportunity)];
      acceptedSuggestionIds.push(...refill.map((sug) => sug.id));
    }
    candidates = candidates.slice(0, report.target);
  }
  report.flaggedEmpty = Math.max(0, report.target - candidates.length);
  if (report.flaggedEmpty > 0) {
    report.notes.push(
      `${report.flaggedEmpty} slot(s) left empty — Discover could not supply enough opportunities.`,
    );
  }
  if (candidates.length === 0) return report;

  // ---- 4. Generate + prep each article (ALL I/O before any blob write) ----
  const nowIso = now.toISOString();
  const prepared: Array<{
    asset: ContentAsset;
    opportunity: Opportunity;
    slot: ScheduleSlot;
    armable: boolean;
  }> = [];
  for (const [i, opportunity] of candidates.entries()) {
    const slot = slots[i];
    let gen: Awaited<ReturnType<typeof generateContentCore>>;
    try {
      gen = await generateContentCore(userId, {
        project: liveProject,
        services,
        opportunity,
        assetType: "article",
      });
    } catch (e) {
      report.notes.push(
        `"${opportunity.title}": generation failed (${e instanceof Error ? e.message : "error"}) — slot left empty.`,
      );
      report.flaggedEmpty++;
      continue;
    }
    if (!gen?.markdown) {
      report.notes.push(`"${opportunity.title}": empty generation — slot left empty.`);
      report.flaggedEmpty++;
      continue;
    }
    let asset = buildAssetFromGeneration(gen, opportunity, liveProject, nowIso);

    // Auto link resolution against the real page map (owner guardrail).
    const corpus = [...content, ...prepared.map((p) => p.asset)];
    const active = new Set(buildActiveInternalPaths(liveProject, corpus));
    const resolved = autoResolveInternalLinks(asset.markdown, active);
    asset = { ...asset, markdown: resolved.markdown };
    if (resolved.remapped.length || resolved.unlinked.length) {
      report.notes.push(
        `"${opportunity.title}": links auto-resolved (${resolved.remapped.length} remapped, ${resolved.unlinked.length} unlinked).`,
      );
    }

    // Hook: approve the best generated proposal, or hold (never publish hookless).
    const hooked = attachBestHook(asset, nowIso);
    let armable = cfg.mode === "auto_publish";
    if (hooked) {
      asset = hooked;
    } else {
      armable = false;
      report.notes.push(`"${opportunity.title}": no valid hook proposal — held for review.`);
    }

    if (armable) {
      // Arm only what the fire-time gate will accept: same consent + blockers.
      const armedShape = { ...asset, status: "Approved" as const };
      const blockers = publishBlockers(armedShape, liveProject, [...corpus, armedShape]);
      if (blockers.length) {
        armable = false;
        report.notes.push(
          `"${opportunity.title}": held — publish blockers: ${blockers.map((b) => b.label).join("; ")}.`,
        );
      } else {
        asset = armedShape;
      }
    }
    prepared.push({ asset, opportunity, slot, armable });
    report.generated++;
  }
  if (!prepared.length) return report;

  // ---- 5. One pure blob mutation for the whole project --------------------
  await mutateWorkspace(userId, (data) => {
    const wsContent = Array.isArray(data.content) ? (data.content as ContentAsset[]) : [];
    const wsOpps = Array.isArray(data.opportunities) ? (data.opportunities as Opportunity[]) : [];
    const wsSugs = Array.isArray(data.discoverySuggestions)
      ? (data.discoverySuggestions as DiscoverySuggestion[])
      : [];
    const wsProjects = Array.isArray(data.projects) ? (data.projects as Project[]) : [];
    const existingOppIds = new Set(wsOpps.map((o) => o.id));
    const newOpps = prepared
      .map((p) => p.opportunity)
      .filter((o) => !existingOppIds.has(o.id))
      .map((o) => ({ ...o, status: "drafting" }) as Opportunity);
    return {
      data: {
        ...data,
        projects:
          liveProject === project
            ? wsProjects
            : wsProjects.map((p) =>
                p.id === projectId ? { ...p, sitemapInventory: liveProject.sitemapInventory } : p,
              ),
        content: [
          ...wsContent,
          ...prepared.map((p) =>
            p.armable
              ? {
                  ...p.asset,
                  scheduledPublishAt: p.slot.publishAt,
                  scheduledPublishStatus: "pending" as const,
                }
              : p.asset,
          ),
        ],
        opportunities: [
          ...wsOpps.map((o) =>
            prepared.some((p) => p.opportunity.id === o.id)
              ? ({
                  ...o,
                  status: "drafting",
                  currentContentAssetId: prepared.find((p) => p.opportunity.id === o.id)!.asset.id,
                } as Opportunity)
              : o,
          ),
          ...newOpps.map((o) => ({
            ...o,
            currentContentAssetId: prepared.find((p) => p.opportunity.id === o.id)?.asset.id,
          })),
        ],
        discoverySuggestions: wsSugs.map((sug) =>
          acceptedSuggestionIds.includes(sug.id)
            ? { ...sug, status: "accepted" as const, acceptedOpportunityId: sug.id }
            : sug,
        ),
      },
      result: null,
    };
  });

  // ---- 6. Arm the queue rows (auto_publish only, AFTER the blob is safe) --
  const db = await admin();
  for (const p of prepared) {
    if (!p.armable) continue;
    const { error } = await db.from("scheduled_publishes").insert({
      user_id: userId,
      project_id: projectId,
      asset_id: p.asset.id,
      publish_at: p.slot.publishAt,
      status: "pending",
    });
    if (error) {
      report.notes.push(`"${p.asset.title}": queue insert failed — left as a ready draft.`);
      await mutateWorkspace(userId, (data) => {
        const wsContent = Array.isArray(data.content) ? (data.content as ContentAsset[]) : [];
        return {
          data: {
            ...data,
            content: wsContent.map((a) =>
              a.id === p.asset.id
                ? (({ scheduledPublishAt, scheduledPublishStatus, ...rest }) => rest)(
                    a as ContentAsset & Record<string, unknown>,
                  )
                : a,
            ),
          },
          result: null,
        };
      }).catch(() => undefined);
    } else {
      report.armed++;
    }
  }
  report.held = prepared.length - report.armed;
  return report;
}

function suggestionToOpportunity(sug: DiscoverySuggestion): Opportunity {
  const { status: _status, deduplicationKey: _k, generatedAt: _g, ...rest } = sug;
  return { ...(rest as Omit<Opportunity, "status">), status: "captured" } as Opportunity;
}

// ---------------------------------------------------------------------------
// Summary email (direct Resend — no user session in a cron context)
// ---------------------------------------------------------------------------

async function sendSummaryEmail(
  report: ProjectRunReport,
  planned: { year: number; month: number },
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !report.summaryEmailTo) return;
  const monthLabel = `${planned.year}-${String(planned.month).padStart(2, "0")}`;
  const lines = [
    `<p><strong>${escapeHtml(report.projectName)}</strong> — auto-scheduler run for ${monthLabel}.</p>`,
    `<p>Slots: ${report.slots} · Quota left: ${report.remainingQuota < 0 ? "unlimited" : report.remainingQuota} · Drafted: ${report.generated} · Armed: ${report.armed} · Held for review: ${report.held} · Empty: ${report.flaggedEmpty}</p>`,
    report.mode === "approve_first"
      ? `<p>Nothing publishes until you approve it: review the drafts in Milo → Content, approve, and drop them on the calendar.</p>`
      : `<p>Armed articles go live automatically at their slot time. Anything held needs your review in Milo.</p>`,
    report.notes.length
      ? `<ul>${report.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>`
      : "",
    report.error ? `<p style="color:#b91c1c">Run error: ${escapeHtml(report.error)}</p>` : "",
  ];
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Milo Growth <noreply@milogrowth.com>",
      to: [report.summaryEmailTo],
      subject: `Milo auto-scheduler — ${report.projectName}: ${report.generated} drafted for ${monthLabel}`,
      html: lines.filter(Boolean).join("\n"),
    }),
  }).catch(() => undefined);
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
