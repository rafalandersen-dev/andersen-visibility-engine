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
 * happens before each pure re-runnable mutateWorkspace callback, which
 * appends the completed article and advances their opportunities. Queue rows are
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
  unfilledSchedulerSlots,
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
import { remainingAiUsage, UsageLimitError, UsageUnavailableError } from "./ai-usage.server";
import { contentLangToProjectLanguage } from "./onboarding";
import {
  acquireSchedulerLease,
  assertSchedulerLease,
  releaseSchedulerLease,
} from "./auto-scheduler-lease.server";

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

class SchedulerPartialFailure extends Error {
  constructor(
    readonly report: ProjectRunReport,
    error: unknown,
  ) {
    super(error instanceof Error ? error.message : "Scheduler recovery review required.");
    this.report = {
      ...report,
      held: Math.max(0, report.generated - report.armed),
      error: this.message,
    };
  }
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
 * Pending go-live instants for this PROJECT (never double-book against these).
 * Project-scoped on both halves: two sites publishing at the same instant is
 * not a conflict — an unscoped query would let project A starve project B's
 * identical default cadence entirely.
 */
async function bookedInstants(
  userId: string,
  projectId: string,
  content: ContentAsset[],
): Promise<string[]> {
  const db = await admin();
  const { data, error } = await db
    .from("scheduled_publishes")
    .select("publish_at")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .in("status", ["pending", "publishing"]);
  if (
    error ||
    !Array.isArray(data) ||
    data.some(
      (r) => !r || typeof r.publish_at !== "string" || !Number.isFinite(Date.parse(r.publish_at)),
    )
  )
    throw new Error("Scheduler queue unavailable; preparation paused.");
  const queue = data.map((r) => String(r.publish_at));
  const mirrors = content.map((a) => a.scheduledPublishAt).filter((v): v is string => Boolean(v));
  return [...queue, ...mirrors].filter(Boolean);
}

// ---------------------------------------------------------------------------
// Per-article assembly
// ---------------------------------------------------------------------------

/** Server-side twin of the client asset builder in generateContentForOpportunity. */
export function buildAssetFromGeneration(
  gen: Awaited<ReturnType<typeof generateContentCore>>,
  opp: Opportunity,
  project: Project,
  nowIso: string,
  plannedKey: string,
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
    // P1-7 (2026-07-25): the opportunity's language wins; project is fallback.
    language:
      opp.language ??
      (project.primaryContentLanguage
        ? contentLangToProjectLanguage(project.primaryContentLanguage)
        : "English"),
    createdAt: nowIso,
    // Auto-drafted long-form is always a v3 article — hook-gated like the editor path.
    visualModelVersion: 3,
    autoScheduledFor: plannedKey,
    // The generated proposals ride along (H1): attachBestHook consumes them,
    // and the editor's Hook panel offers them when a draft is held for review.
    ...((gen as { hookProposals?: ContentAsset["hookProposals"] }).hookProposals?.length
      ? { hookProposals: (gen as { hookProposals?: ContentAsset["hookProposals"] }).hookProposals }
      : {}),
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
  // Per-entity backend: list every workspace user (migrated ∪ legacy blob),
  // then assemble each doc via readWorkspaceRow — which also lazily backfills
  // stragglers, so the monthly run doubles as a migration sweep.
  const { listWorkspaceUserIds, readWorkspaceRow } = await import("./workspace.server");
  let userIds: string[];
  try {
    userIds = await listWorkspaceUserIds();
  } catch {
    throw new Error("auto_scheduler_workspace_scan_failed");
  }

  const db = await admin();
  const summary: AutoScheduleRunSummary = { planned, workspaces: 0, projects: [] };
  for (const userId of userIds) {
    let data: WorkspaceData;
    try {
      data = (await readWorkspaceRow(userId))?.data ?? {};
    } catch {
      continue; // one unreadable workspace must not kill the whole run
    }
    const projects = Array.isArray(data.projects) ? (data.projects as Project[]) : [];
    const enabled = projects.filter((p) => p.autoScheduler?.enabled === true);
    if (!userId || enabled.length === 0) continue;
    summary.workspaces++;
    for (const project of enabled) {
      const cfg = normalizeAutoSchedulerConfig(project.autoScheduler);
      let report: ProjectRunReport;
      try {
        const lease = await acquireSchedulerLease(
          userId,
          project.id,
          `${planned.year}-${String(planned.month).padStart(2, "0")}`,
        );
        report = await runForProject(userId, project.id, now, planned, lease);
        try {
          await releaseSchedulerLease(userId, project.id, lease);
        } catch (error) {
          throw new SchedulerPartialFailure(report, error);
        }
      } catch (e) {
        report =
          e instanceof SchedulerPartialFailure
            ? e.report
            : {
                projectId: project.id,
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
                // The owner must hear about a run that failed outright (a typo'd
                // time zone would otherwise fail silently every month forever).
                ...(cfg.summaryEmail ? { summaryEmailTo: cfg.summaryEmail } : {}),
                error: e instanceof Error ? e.message : String(e),
              };
      }
      summary.projects.push(report);
      // Email + heartbeat PER PROJECT, not at the end: a run that exceeds the
      // cron HTTP timeout mid-way still reports every project it completed.
      await sendSummaryEmail(report, planned).catch(() => undefined);
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
    }
  }
  return summary;
}

async function runForProject(
  userId: string,
  projectId: string,
  now: Date,
  planned: { year: number; month: number },
  lease: string,
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
    projectId,
    content.filter((a) => a.projectId === projectId),
  );
  const plannedKey = `${planned.year}-${String(planned.month).padStart(2, "0")}`;
  const slots = unfilledSchedulerSlots(
    computeMonthlySlots(planned.year, planned.month, cfg),
    booked,
    content.filter((a) => a.projectId === projectId && a.autoScheduledFor === plannedKey),
  );
  report.slots = slots.length;
  report.remainingQuota = await remainingAiUsage({ userId, bucket: "contentGeneration", now });
  // Remaining quota already excludes prior usage. Remove delivered drafts from
  // calendar capacity first, then cap only the new work by remaining quota.
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
      await assertSchedulerLease(userId, projectId, lease);
      // Live Discover, exactly like the Plan page button.
      const fresh = await generateOpportunitiesCore(
        userId,
        {
          project: liveProject,
          services,
          existingTitles: [...opportunities, ...candidates].map((o) => o.title),
        },
        { enforceLimit: true },
      ).catch((error: unknown) => {
        if (error instanceof UsageUnavailableError || error instanceof UsageLimitError) throw error;
        return null;
      });
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

  // ---- 4. Generate, prepare and persist each article before moving on -----
  const nowIso = now.toISOString();
  const prepared: Array<{
    asset: ContentAsset;
    opportunity: Opportunity;
    slot: ScheduleSlot;
    armable: boolean;
  }> = [];
  async function persistPrepared(batch: typeof prepared) {
    // Persist each completed article before starting another provider operation.
    // Deliberately WITHOUT schedule mirrors: the queue row is inserted first and
    // the mirror second (same order as the interactive scheduling fn), so a crash
    // between the two can never strand an "Approved + Goes live ..." asset that no
    // queue row will ever publish. A queue row without a mirror is harmless (the
    // runner publishes it; only the editor badge is missing).
    const acceptedAndDrafted = acceptedSuggestionIds.filter((id) =>
      batch.some((p) => p.opportunity.id === id),
    );
    await mutateWorkspace(userId, (data) => {
      const wsContent = Array.isArray(data.content) ? (data.content as ContentAsset[]) : [];
      const wsOpps = Array.isArray(data.opportunities) ? (data.opportunities as Opportunity[]) : [];
      const wsSugs = Array.isArray(data.discoverySuggestions)
        ? (data.discoverySuggestions as DiscoverySuggestion[])
        : [];
      const wsProjects = Array.isArray(data.projects) ? (data.projects as Project[]) : [];
      const existingOppIds = new Set(wsOpps.map((o) => o.id));
      const existingAssetIds = new Set(wsContent.map((a) => a.id));
      const newOpps = batch
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
            // Re-runnable: never append an asset id twice on a mutation retry.
            ...batch.map((p) => p.asset).filter((a) => !existingAssetIds.has(a.id)),
          ],
          opportunities: [
            ...wsOpps.map((o) =>
              batch.some((p) => p.opportunity.id === o.id)
                ? ({
                    ...o,
                    status: "drafting",
                    currentContentAssetId: batch.find((p) => p.opportunity.id === o.id)!.asset.id,
                  } as Opportunity)
                : o,
            ),
            ...newOpps.map((o) => ({
              ...o,
              currentContentAssetId: batch.find((p) => p.opportunity.id === o.id)?.asset.id,
            })),
          ],
          // A suggestion is consumed only when its article actually got drafted —
          // a failed generation must not burn it (it stays available next run).
          discoverySuggestions: wsSugs.map((sug) =>
            acceptedAndDrafted.includes(sug.id)
              ? { ...sug, status: "accepted" as const, acceptedOpportunityId: sug.id }
              : sug,
          ),
        },
        result: null,
      };
    });

    report.generated++;
    // ---- 6. Arm go-lives (auto_publish only): queue row FIRST, mirror second --
    const db = await admin();
    for (const p of batch) {
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
        continue;
      }
      report.armed++;
      await mutateWorkspace(userId, (data) => {
        const wsContent = Array.isArray(data.content) ? (data.content as ContentAsset[]) : [];
        return {
          data: {
            ...data,
            content: wsContent.map((a) =>
              a.id === p.asset.id
                ? {
                    ...a,
                    scheduledPublishAt: p.slot.publishAt,
                    scheduledPublishStatus: "pending" as const,
                  }
                : a,
            ),
          },
          result: null,
        };
      }).catch(() => undefined); // mirror is UI-only; the queue row is the truth
    }
  }
  for (const [i, opportunity] of candidates.entries()) {
    try {
      await assertSchedulerLease(userId, projectId, lease);
    } catch (error) {
      throw new SchedulerPartialFailure(report, error);
    }
    const slot = slots[i];
    let gen: Awaited<ReturnType<typeof generateContentCore>>;
    try {
      gen = await generateContentCore(
        userId,
        {
          project: liveProject,
          services,
          opportunity,
          assetType: "article",
        },
        { enforceLimit: true },
      );
    } catch (e) {
      if (e instanceof UsageUnavailableError || e instanceof UsageLimitError) {
        report.error = e.message;
        report.notes.push(
          "AI work paused. Remaining slots need attention; already prepared drafts are retained.",
        );
        report.flaggedEmpty += candidates.length - i;
        break;
      }
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
    let asset: ContentAsset = {
      ...buildAssetFromGeneration(gen, opportunity, liveProject, nowIso, plannedKey),
      autoSchedulerPlannedAt: slot.publishAt,
    };

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
    const completed = { asset, opportunity, slot, armable };
    try {
      await persistPrepared([completed]);
    } catch (error) {
      throw new SchedulerPartialFailure(report, error);
    }
    prepared.push(completed);
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
