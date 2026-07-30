import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import {
  Archive,
  Binoculars,
  ArrowLeft,
  ArrowRight,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  ChartLineUp,
  Check,
  CheckCircle,
  Clock,
  DotsThree,
  FileText,
  Funnel,
  Globe,
  Kanban,
  ListBullets,
  MagnifyingGlass,
  Plus,
  Sparkle,
  UserCircle,
  Warning,
  X,
} from "@phosphor-icons/react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { CreateContentDialog } from "@/components/CreateContentDialog";
import { SampleBadge } from "@/components/SampleBadge";
import {
  acceptDiscoverySuggestions,
  addOpportunity,
  archiveOpportunity,
  getState,
  reloadWorkspaceForUser,
  restoreOpportunity,
  saveWorkspaceNow,
  transitionOpportunity,
  undoAcceptedDiscoverySuggestions,
  updateOpportunity,
  useStore,
} from "@/lib/store";
import { generateSeoOpportunities, generateContentForOpportunity } from "@/lib/mock-ai";
import { scheduleContentPublishFn } from "@/lib/schedule.functions";
import {
  defaultGoLiveLocal,
  publishReadiness,
  upcomingPublishRisks,
  type PublishReadiness,
} from "@/lib/calendar-schedule";
import { PublishRiskBanner } from "@/components/PublishRiskBanner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  canTransitionOpportunity,
  opportunitySourceLabel,
  opportunityView,
} from "@/lib/opportunities";
import type {
  ContentAsset,
  DiscoverySuggestion,
  Opportunity,
  OpportunityLifecycleStatus,
  Project,
} from "@/lib/types";
import {
  pipelineStage,
  linkedAssetFor,
  nextAction,
  GHOST_STAGES,
  PIPELINE_STAGES,
  type PipelineStage,
} from "@/lib/pipeline";
import { formatDateTimeLocal, formatTimeLocal } from "@/lib/format";
import { StageChip } from "@/components/StageChip";
import { OrphanLane } from "@/components/OrphanLane";
import { StackedDeck } from "@/components/StackedDeck";
import { BatchBar } from "@/components/BatchBar";
import { useT } from "@/i18n";
import { toast } from "sonner";

const searchSchema = z.object({
  view: z.enum(["discover", "list", "board", "calendar"]).optional().catch("board"),
  scale: z.enum(["day", "week", "month"]).optional().catch("week"),
  selected: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/app/plan")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Plan — Milo Growth" },
      {
        name: "description",
        content:
          "Discover, prioritize, schedule, produce and measure SEO opportunities in one workspace.",
      },
    ],
  }),
  component: PlanPage,
});

type PlanView = "discover" | "list" | "board" | "calendar";
type CalendarScale = "day" | "week" | "month";
type OpportunityView = ReturnType<typeof opportunityView> & {
  /** Derived pipeline stage — the one vocabulary shared with every other surface. */
  pipeline: PipelineStage;
  /** Resolved go-live time, shown beside an armed chip. */
  pipelineDetail?: string;
};

/** Top-border accent per pipeline stage — the board's one vocabulary. */
const pipelineStageColors: Record<PipelineStage, string> = {
  idea: "#818b96",
  queued: "#6b7688",
  planned: "#b5862a",
  writing: "#377fbd",
  in_review: "#8965b3",
  ready: "#398a63",
  armed: "#d08700",
  sent: "#0284c7",
  live: "#2d7f58",
  live_missing: "#b45309",
  needs_fixing: "#b91c1c",
  parked: "#8d8a84",
};

/**
 * Board columns are the DERIVED pipeline stages, not the stored lifecycle — this
 * is what ends the column-vs-chip disagreement (the header said "Scheduled"
 * while the chip on the card said "Ready"). `parked` is excluded: it only arises
 * from Discarded/archived/archivedAt, which the active board already filters out,
 * so a parked column would be permanently empty — parked work lives in Archived.
 */
const BOARD_STAGES = PIPELINE_STAGES.filter((stage) => stage !== "parked");

/** Only these two stages are reachable by dragging — everything past them is
 *  derived from an asset (write/review/schedule/publish), which is the editor's
 *  job, never a board drop. Maps a drop target to its governed lifecycle move. */
const BOARD_DROP_TARGETS: Partial<Record<PipelineStage, OpportunityLifecycleStatus>> = {
  queued: "prioritized",
  planned: "scheduled",
};

/** A card can be picked up only from a stage a drop can legitimately move it out
 *  of. Above all, an armed card cannot be dragged — the thing about to publish
 *  to a customer's site literally cannot be picked up. */
const DRAGGABLE_STAGES: PipelineStage[] = ["idea", "queued", "planned"];

/** The linear happy path, for the drawer's progress indicator. Exception stages
 *  (needs_fixing, live_missing, parked) sit outside it and show their chip
 *  instead of a step count. */
const FLOW_STAGES: PipelineStage[] = [
  "idea",
  "queued",
  "planned",
  "writing",
  "in_review",
  "ready",
  "armed",
  "sent",
  "live",
];

// GHOST_STAGES (the calendar's not-yet-armed target layer) moved to pipeline.ts
// so Home's publish-risk banner shares the exact definition.

function PlanPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const activeProjectId = useStore((state) => state.activeProjectId);
  const hydrated = useStore((state) => state.hydrated);
  const projects = useStore((state) => state.projects);
  const rawOpportunities = useStore((state) =>
    state.opportunities.filter(
      (opportunity) => opportunity.projectId === activeProjectId && !opportunity.deletedAt,
    ),
  );
  const content = useStore((state) =>
    state.content.filter((asset) => asset.projectId === activeProjectId),
  );
  const suggestions = useStore((state) =>
    state.discoverySuggestions.filter((item) => item.projectId === activeProjectId),
  );
  const project = projects.find((item) => item.id === activeProjectId) ?? projects[0];
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [contentOpportunityId, setContentOpportunityId] = useState<string | null>(null);

  /**
   * Resolve by PRECEDENCE, not recency. Picking the most recently updated asset
   * let an armed one hide behind a newer inert one: the card rendered "Writing"
   * with no cancel affordance while the cron published the other asset anyway.
   * linkedAssetFor puts an armed asset first, then a live one, then the
   * opportunity's own pointer, and only then falls back to the newest.
   */
  const assetsByOpportunity = useMemo(() => {
    const grouped = new Map<string, ContentAsset[]>();
    for (const asset of content) {
      const opportunityId = asset.opportunityId ?? asset.sourceOpportunityId;
      if (!opportunityId) continue;
      const list = grouped.get(opportunityId);
      if (list) list.push(asset);
      else grouped.set(opportunityId, [asset]);
    }
    const result = new Map<string, ContentAsset>();
    for (const [opportunityId, list] of grouped) {
      const chosen = linkedAssetFor({ id: opportunityId }, list);
      if (chosen) result.set(opportunityId, chosen);
    }
    return result;
  }, [content]);

  /**
   * Every asset per opportunity — the disclosure behind the precedence winner, so
   * the stacked deck can show the drafts the single card doesn't represent.
   */
  const assetGroups = useMemo(() => {
    const grouped = new Map<string, ContentAsset[]>();
    for (const asset of content) {
      const opportunityId = asset.opportunityId ?? asset.sourceOpportunityId;
      if (!opportunityId) continue;
      const list = grouped.get(opportunityId);
      if (list) list.push(asset);
      else grouped.set(opportunityId, [asset]);
    }
    return grouped;
  }, [content]);

  const opportunities = useMemo(
    () =>
      rawOpportunities
        .map((opportunity) => {
          const asset = assetsByOpportunity.get(opportunity.id);
          return {
            ...opportunityView(opportunity, asset),
            // The one vocabulary. Richer than the stored lifecycle: it knows
            // about armed schedules, failed publishes and pages already live.
            pipeline: pipelineStage({ opportunity, asset }),
            pipelineDetail: asset?.scheduledPublishAt
              ? formatDateTimeLocal(asset.scheduledPublishAt)
              : undefined,
          };
        })
        .filter((opportunity) =>
          showArchived ? opportunity.status === "archived" : opportunity.status !== "archived",
        )
        .filter((opportunity) =>
          query.trim()
            ? `${opportunity.title} ${opportunity.targetQuery ?? ""} ${opportunitySourceLabel(opportunity)}`
                .toLocaleLowerCase()
                .includes(query.trim().toLocaleLowerCase())
            : true,
        ),
    [assetsByOpportunity, query, rawOpportunities, showArchived],
  );

  // The calendar's solid layer: every ARMED asset, keyed on the asset itself, so
  // an armed orphan (its opportunity deleted) still shows its go-live. Derived
  // through pipelineStage so it shares ONE definition of "armed" with the board:
  // an overdue pending schedule is needs_fixing, not armed, and must not render
  // here as an upcoming go-live (nor double with its ghost).
  const goLives = useMemo(
    () => content.filter((asset) => pipelineStage({ asset }) === "armed"),
    [content],
  );

  // Drafts whose opportunity was deleted (deletedAt filters it out of
  // rawOpportunities) or never existed. They still publish, so they get a lane.
  // Guarded on `hydrated`: before the store loads, content can be present while
  // opportunities are not, which would flash every asset as orphaned. An archived
  // (not deleted) opp stays in rawOpportunities, so archiving never orphans work.
  const orphans = useMemo(() => {
    if (!hydrated) return [];
    const oppIds = new Set(rawOpportunities.map((opportunity) => opportunity.id));
    return content.filter((asset) => {
      const oid = asset.opportunityId ?? asset.sourceOpportunityId;
      return !oid || !oppIds.has(oid);
    });
  }, [content, rawOpportunities, hydrated]);

  // ---- Calendar scheduling (drop-to-schedule) ----
  // Ghost targets + their linked asset id: ONE definition shared by the risk
  // banner, the calendar badges and CalendarView's own ghost layer.
  const ghostTargets = useMemo(
    () =>
      opportunities
        .filter((opportunity) => opportunity.dueAt && GHOST_STAGES.includes(opportunity.pipeline))
        .map((opportunity) => ({
          id: opportunity.id,
          title: opportunity.title,
          dueAt: opportunity.dueAt,
          assetId: assetsByOpportunity.get(opportunity.id)?.id,
        })),
    [opportunities, assetsByOpportunity],
  );
  // Everything dated within 7 days that will NOT publish as things stand —
  // including armed go-lives whose asset regressed after arming (the cron would
  // refuse those at fire time; surface them now, not the morning after).
  const publishRisks = useMemo(
    () => upcomingPublishRisks({ ghosts: ghostTargets, armed: goLives, assets: content, project }),
    [ghostTargets, goLives, content, project],
  );
  const riskOpportunityIds = useMemo(
    () =>
      new Set(
        publishRisks
          .filter((risk) => risk.kind === "target" && risk.opportunityId)
          .map((risk) => risk.opportunityId as string),
      ),
    [publishRisks],
  );
  const riskAssetIds = useMemo(
    () =>
      new Set(
        publishRisks
          .filter((risk) => risk.kind === "armed" && risk.assetId)
          .map((risk) => risk.assetId as string),
      ),
    [publishRisks],
  );

  // A calendar drop never mutates directly — it opens this intent in a dialog.
  // Ready → confirm arms the REAL go-live (same queue as the editor's control).
  // Not ready → the dialog says exactly why and offers target-only.
  const [dropIntent, setDropIntent] = useState<{
    date: Date;
    opportunity?: OpportunityView;
    asset?: ContentAsset;
    /** True when an armed go-live chip was dragged (move, not first arm). */
    reschedule: boolean;
    readiness: PublishReadiness;
  } | null>(null);
  const [dropTime, setDropTime] = useState("");
  const [arming, setArming] = useState(false);

  function onCalendarDrop(event: React.DragEvent, date: Date) {
    const assetId = event.dataTransfer.getData("text/asset-id");
    if (assetId) {
      const asset = content.find((item) => item.id === assetId);
      if (!asset) return;
      // A reschedule keeps the article's original time-of-day on the new date.
      const previous = asset.scheduledPublishAt ? new Date(asset.scheduledPublishAt) : null;
      setDropTime(
        defaultGoLiveLocal(
          date,
          new Date(),
          previous ? { hours: previous.getHours(), minutes: previous.getMinutes() } : undefined,
        ) ?? "",
      );
      setDropIntent({
        date,
        asset,
        reschedule: true,
        readiness: publishReadiness(asset, project, content),
      });
      return;
    }
    const opportunityId = event.dataTransfer.getData("text/opportunity-id");
    const opportunity = opportunities.find((item) => item.id === opportunityId);
    if (!opportunity) return;
    const linked = assetsByOpportunity.get(opportunity.id);
    setDropTime(defaultGoLiveLocal(date) ?? "");
    setDropIntent({
      date,
      opportunity,
      asset: linked,
      reschedule: false,
      readiness: publishReadiness(linked, project, content),
    });
  }

  /** The pre-dialog behavior, unchanged: a dropped date is a work TARGET. */
  function applyTarget(opportunity: OpportunityView, date: Date) {
    const dueAt = format(date, "yyyy-MM-dd");
    if (opportunity.status === "prioritized") {
      transitionOpportunity(opportunity.id, "scheduled", { dueAt });
    } else {
      updateOpportunity(opportunity.id, {
        dueAt,
        status: opportunity.status === "captured" ? "scheduled" : opportunity.status,
      });
    }
  }

  function setTargetOnly() {
    if (!dropIntent?.opportunity) return;
    try {
      applyTarget(dropIntent.opportunity, dropIntent.date);
      toast.success(`Target set for ${format(dropIntent.date, "MMM d")}`);
      setDropIntent(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not set the target");
    }
  }

  async function armGoLive() {
    if (!dropIntent?.asset || !dropTime) return;
    const instant = new Date(dropTime);
    if (Number.isNaN(instant.getTime())) return;
    setArming(true);
    try {
      // Persist the target FIRST: scheduleContentPublishFn writes its mirror into
      // the server-side workspace blob, so a debounced save of a stale local blob
      // afterwards would erase the mirror. Flush, then arm, then reload.
      if (!dropIntent.reschedule && dropIntent.opportunity) {
        applyTarget(dropIntent.opportunity, dropIntent.date);
        await saveWorkspaceNow();
      }
      await scheduleContentPublishFn({
        data: {
          assetId: dropIntent.asset.id,
          publishAt: instant.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      const uid = getState().userId;
      if (uid) await reloadWorkspaceForUser(uid);
      toast.success(
        `${dropIntent.reschedule ? "Go-live moved to" : "Scheduled — goes live"} ${formatDateTimeLocal(
          instant.toISOString(),
        )}`,
      );
      setDropIntent(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not schedule the go-live");
    } finally {
      setArming(false);
    }
  }

  const selected = opportunities.find((opportunity) => opportunity.id === search.selected);
  const view = search.view ?? "board";
  const scale = search.scale ?? "week";

  // A rewrite of a live-but-draftless page can only be offered where updating in
  // place is inherently safe: manual publishing or a custom endpoint, where the
  // owner controls the URL. WordPress/Shopify would CREATE a duplicate until
  // publish.server upserts by republishTargetUrl (the old asset's external id is
  // gone), so those projects see "Open live page" only.
  const rewriteEnabled =
    !!project &&
    (project.publishMode === "manualLive" ||
      !project.connectorType ||
      project.connectorType === "custom");

  function setView(next: PlanView) {
    navigate({
      to: "/app/plan",
      search: { view: next, scale, selected: undefined },
      replace: true,
    });
  }

  function selectOpportunity(id?: string) {
    navigate({
      to: "/app/plan",
      search: { view, scale, selected: id },
      replace: true,
    });
  }

  function openManualForm() {
    setView("discover");
    window.setTimeout(() => document.getElementById("manual-opportunity")?.focus(), 80);
  }

  /**
   * The single next action for a card, by derived stage. The most any board path
   * does inline is prioritise (inert) — "Set a go-live time" and "See the go-live"
   * ROUTE to the editor; the board never arms and never publishes.
   */
  function onPrimaryAction(opportunity: OpportunityView) {
    const asset = assetsByOpportunity.get(opportunity.id);
    switch (opportunity.pipeline) {
      case "idea":
        try {
          transitionOpportunity(opportunity.id, "prioritized", { priority: opportunity.priority });
          toast.success("Prioritised");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not prioritise");
        }
        return;
      case "queued":
        selectOpportunity(opportunity.id); // drawer holds the date picker
        return;
      case "planned":
        setContentOpportunityId(opportunity.id); // create the linked draft
        return;
      case "writing":
      case "in_review":
      case "ready":
      case "armed":
      case "sent":
      case "needs_fixing":
        if (asset) navigate({ to: "/app/editor", search: { id: asset.id } });
        else selectOpportunity(opportunity.id);
        return;
      case "live":
        navigate({ to: "/app/analytics" });
        return;
      case "live_missing":
        void rewriteLivePage(opportunity);
        return;
      case "parked":
        selectOpportunity(opportunity.id);
        return;
    }
  }

  /**
   * Start a rewrite of a page that is live but whose draft was lost. The prior
   * canonical URL is carried into the new draft (republishTargetUrl + publishSlug)
   * so the connector UPDATES the page instead of CREATING a duplicate — the
   * self-cannibalising bug this whole stage exists to prevent. Only offered where
   * an update-in-place is inherently safe (manual-publish or custom endpoint,
   * where the owner controls the URL) until publish.server learns upsert-by-URL
   * for the WordPress/Shopify connectors whose external id died with the old asset.
   */
  async function rewriteLivePage(opportunity: OpportunityView) {
    // The gate lives HERE, at the single choke point every surface routes through
    // (board card, calendar ghost, any future caller) — not only in one card's
    // JSX. Without it, an ungated call site (the calendar) would let a
    // WordPress/Shopify project start a rewrite that publishes a duplicate post.
    if (!rewriteEnabled || !opportunity.canonicalUrl) {
      selectOpportunity(opportunity.id);
      return;
    }
    const ok = window.confirm(
      "This page is already live. Rewriting updates it in place — it will not create a second post.",
    );
    if (!ok) return;
    try {
      const asset = await generateContentForOpportunity(opportunity.id, "article", {
        republishTargetUrl: opportunity.canonicalUrl,
        publishSlug: pathFromUrl(opportunity.canonicalUrl),
      });
      navigate({ to: "/app/editor", search: { id: asset.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the rewrite");
    }
  }

  return (
    <AppShell
      title={view === "discover" ? "Discover opportunities" : "Plan"}
      description={
        view === "discover"
          ? "Find new ideas from your site, search signals and business priorities. Nothing becomes work until you accept it."
          : "Plan SEO work that earns visibility and supports your business goals."
      }
      actions={
        <>
          <Button variant="outline" onClick={() => setView("discover")}>
            <MagnifyingGlass size={17} /> Discover opportunities
          </Button>
          <Button onClick={openManualForm}>
            <Plus size={17} /> New opportunity
          </Button>
        </>
      }
      flush
    >
      {view === "discover" ? (
        <DiscoverView
          project={project}
          suggestions={suggestions}
          onOpenPlan={() => setView("board")}
        />
      ) : (
        <>
          <PlanToolbar
            view={view}
            query={query}
            showArchived={showArchived}
            onView={setView}
            onQuery={setQuery}
            onToggleArchived={() => setShowArchived((value) => !value)}
          />
          {!showArchived && publishRisks.length > 0 ? (
            <div className="px-3 pt-3">
              <PublishRiskBanner
                risks={publishRisks}
                onOpenRisk={(risk) =>
                  risk.assetId
                    ? navigate({ to: "/app/editor", search: { id: risk.assetId } })
                    : risk.opportunityId
                      ? selectOpportunity(risk.opportunityId)
                      : undefined
                }
              />
            </div>
          ) : null}
          {showArchived ? (
            <ArchivedView
              opportunities={opportunities}
              selectedId={selected?.id}
              onSelect={selectOpportunity}
            />
          ) : view === "list" ? (
            <ListView
              opportunities={opportunities}
              selectedId={selected?.id}
              onSelect={selectOpportunity}
            />
          ) : view === "calendar" ? (
            <CalendarView
              opportunities={opportunities}
              goLives={goLives}
              scale={scale}
              selectedId={selected?.id}
              riskOpportunityIds={riskOpportunityIds}
              riskAssetIds={riskAssetIds}
              onScale={(next) =>
                navigate({
                  to: "/app/plan",
                  search: { view: "calendar", scale: next, selected: search.selected },
                  replace: true,
                })
              }
              onSelect={selectOpportunity}
              onPrimaryAction={onPrimaryAction}
              onOpenAsset={(assetId) => navigate({ to: "/app/editor", search: { id: assetId } })}
              onDrop={onCalendarDrop}
            />
          ) : (
            <BoardView
              // Remount on project switch so the local selection Set can't carry
              // ids from the previous project into a bulk action.
              key={activeProjectId}
              opportunities={opportunities}
              orphans={orphans}
              assetGroups={assetGroups}
              selectedId={selected?.id}
              onSelect={selectOpportunity}
              onPrimaryAction={onPrimaryAction}
              onOpenAsset={(assetId) => navigate({ to: "/app/editor", search: { id: assetId } })}
              rewriteEnabled={rewriteEnabled}
            />
          )}

          {selected ? (
            <OpportunityDrawer
              opportunity={selected}
              linkedAsset={assetsByOpportunity.get(selected.id)}
              onClose={() => selectOpportunity(undefined)}
              onCreateContent={() => setContentOpportunityId(selected.id)}
              onOpenEditor={(assetId) => navigate({ to: "/app/editor", search: { id: assetId } })}
              onOpenInsights={() => navigate({ to: "/app/analytics" })}
            />
          ) : null}
        </>
      )}

      <CreateContentDialog
        opportunityId={contentOpportunityId}
        open={contentOpportunityId !== null}
        onOpenChange={(open) => {
          if (!open) setContentOpportunityId(null);
        }}
      />

      <ScheduleDropDialog
        intent={dropIntent}
        time={dropTime}
        arming={arming}
        onTime={setDropTime}
        onArm={armGoLive}
        onTargetOnly={setTargetOnly}
        onOpenEditor={(assetId) => {
          setDropIntent(null);
          navigate({ to: "/app/editor", search: { id: assetId } });
        }}
        onClose={() => (!arming ? setDropIntent(null) : undefined)}
      />
    </AppShell>
  );
}

/**
 * The calendar drop dialog. A drop is inert until confirmed here: a READY
 * article arms the real go-live queue at the picked time (default 09:00 local);
 * a NOT-ready one is told exactly why — the same reasons the fire-time gate
 * would refuse it for — and can only take a soft target. Moving an armed chip
 * reschedules it; if its asset regressed after arming, the warning says the
 * publish will fail unless fixed (the server enforces this regardless).
 */
function ScheduleDropDialog({
  intent,
  time,
  arming,
  onTime,
  onArm,
  onTargetOnly,
  onOpenEditor,
  onClose,
}: {
  intent: {
    date: Date;
    opportunity?: OpportunityView;
    asset?: ContentAsset;
    reschedule: boolean;
    readiness: PublishReadiness;
  } | null;
  time: string;
  arming: boolean;
  onTime: (value: string) => void;
  onArm: () => void;
  onTargetOnly: () => void;
  onOpenEditor: (assetId: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  if (!intent) return null;
  const { readiness, reschedule } = intent;
  const title = intent.asset?.title ?? intent.opportunity?.title ?? "";
  const day = format(intent.date, "MMM d, yyyy");
  const canArm = Boolean(intent.asset) && time !== "" && (readiness.ready || reschedule);
  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {reschedule
              ? t("calsched.title.reschedule")
              : readiness.ready
                ? t("calsched.title.ready")
                : t("calsched.title.notReady")}
          </DialogTitle>
          <DialogDescription>
            {readiness.ready
              ? t("calsched.readyHint", { title, date: day })
              : t("calsched.notReadyHint", { title })}
          </DialogDescription>
        </DialogHeader>

        {!readiness.ready ? (
          <ul className="grid gap-1 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-800">
            {readiness.reasons.map((reason) => (
              <li key={reason}>• {reason}</li>
            ))}
            {reschedule ? <li className="font-medium">{t("calsched.rescheduleWarn")}</li> : null}
          </ul>
        ) : null}

        {(readiness.ready || reschedule) && intent.asset ? (
          time === "" ? (
            <p className="text-xs text-amber-700">{t("calsched.pastDay")}</p>
          ) : (
            <div>
              <Label className="text-xs text-muted-foreground">{t("calsched.timeLabel")}</Label>
              <Input
                type="datetime-local"
                className="mt-1 h-9 w-60 text-sm"
                value={time}
                onChange={(event) => onTime(event.target.value)}
              />
            </div>
          )
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={arming}>
            {t("calsched.cancel")}
          </Button>
          {!readiness.ready && intent.asset ? (
            <Button variant="outline" onClick={() => onOpenEditor(intent.asset!.id)}>
              {t("calsched.openEditor")}
            </Button>
          ) : null}
          {!reschedule && intent.opportunity ? (
            <Button
              variant={readiness.ready ? "outline" : "default"}
              onClick={onTargetOnly}
              disabled={arming}
            >
              {readiness.ready
                ? t("calsched.targetOnly")
                : t("calsched.setTarget", { date: format(intent.date, "MMM d") })}
            </Button>
          ) : null}
          {(readiness.ready || reschedule) && intent.asset ? (
            <Button onClick={onArm} disabled={!canArm || arming}>
              {arming ? "…" : reschedule ? t("calsched.move") : t("calsched.arm")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DiscoverView({
  project,
  suggestions,
  onOpenPlan,
}: {
  project?: Project;
  suggestions: DiscoverySuggestion[];
  onOpenPlan: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        suggestions
          .filter((item) => item.status === "suggested")
          .slice(0, 3)
          .map((item) => item.id),
      ),
  );
  const [generating, setGenerating] = useState(false);
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [intent, setIntent] = useState<Opportunity["searchIntent"]>("Informational");
  const [priority, setPriority] = useState<Opportunity["priority"]>("Medium");

  const visible = suggestions.filter((item) => item.status !== "dismissed");
  const suggested = visible.filter((item) => item.status === "suggested");

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runDiscovery() {
    if (!project) return;
    setGenerating(true);
    try {
      const generated = await generateSeoOpportunities(project.id);
      setSelected(new Set(generated.slice(0, 3).map((item) => item.id)));
      toast.success(`${generated.length} suggestions are ready for review`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Discovery failed");
    } finally {
      setGenerating(false);
    }
  }

  async function acceptSelected() {
    const created = acceptDiscoverySuggestions([...selected]);
    await saveWorkspaceNow();
    setSelected(new Set());
    if (created.length === 0) {
      toast.message("Those suggestions are already in Plan.");
      return;
    }
    toast.success(`${created.length} opportunities added to Plan → Captured`, {
      action: { label: "View in Plan", onClick: onOpenPlan },
      cancel: {
        label: "Undo",
        onClick: () => undoAcceptedDiscoverySuggestions(created.map((item) => item.id)),
      },
    });
  }

  async function createManual() {
    if (!project || !title.trim()) return;
    const created = addOpportunity({
      projectId: project.id,
      title: title.trim(),
      summary: reason.trim() || undefined,
      language: project.primaryLanguage,
      contentType: "Blog Article",
      searchIntent: intent,
      targetAudience: project.targetAudience || "Potential customers",
      businessValue: reason.trim() || "Manually created business opportunity.",
      recommendedCta: "Contact us",
      priority,
      creationMode: "manual",
      primarySource: "manual",
      source: "manual",
      reasonDiscovered: reason.trim() || "Created manually by the project team.",
      businessImpact: priority.toLowerCase() as "low" | "medium" | "high",
    });
    await saveWorkspaceNow();
    setTitle("");
    setReason("");
    toast.success(`“${created.title}” added to Plan → Captured`, {
      action: { label: "View in Plan", onClick: onOpenPlan },
    });
  }

  return (
    <div className="pb-24">
      <div className="grid gap-5 px-5 py-5 md:px-9 xl:grid-cols-[minmax(0,2.2fr)_minmax(310px,1fr)]">
        <section className="rounded-lg border border-[#ddd8cd] bg-[#fffdf8]/75 p-5">
          <h2 className="font-display text-xl">Run Milo discovery</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-[#697282]">
            Milo scans connected sources and proposes traceable opportunities. Discovery never
            schedules work or creates content automatically.
          </p>
          <div className="mt-6 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#647183]">
            Sources
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <SourceCard label="Site audit" status="Ready" to="/app/audit" />
            <SourceCard
              label="Search Console"
              status={project?.gscOAuth?.status === "connected" ? "Connected" : "Connect"}
              to="/app/setup"
            />
            <SourceCard
              label="Competitors"
              status={`${project?.competitorUrls?.length ?? 0} tracked`}
              to="/app/competitors"
            />
            <SourceCard label="AI visibility" status="Ready" to="/app/ai-visibility" />
          </div>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <ul className="grid gap-1.5 text-[11px] text-[#4f5b68]">
              <li className="flex items-center gap-2">
                <Check size={14} className="text-[#398a63]" /> Provenance and evidence stay attached
              </li>
              <li className="flex items-center gap-2">
                <Check size={14} className="text-[#398a63]" /> Existing active work is deduplicated
              </li>
              <li className="flex items-center gap-2">
                <Check size={14} className="text-[#398a63]" /> You choose what enters Plan
              </li>
            </ul>
            <Button onClick={runDiscovery} disabled={generating || !project}>
              <Sparkle size={17} weight="fill" /> {generating ? "Discovering…" : "Run discovery"}
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-[#ddd8cd] bg-[#fffdf8]/75 p-5">
          <h2 className="font-display text-xl">Create manually</h2>
          <p className="mt-1 text-xs leading-5 text-[#697282]">
            Add a business idea directly. It will enter Plan → Captured.
          </p>
          <label className="mt-4 grid gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5f6872]">
            Opportunity title
            <input
              id="manual-opportunity"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What should Milo help you improve?"
              className="min-h-10 rounded-md border border-[#ddd8cd] bg-white/70 px-3 text-xs font-normal normal-case tracking-normal outline-none focus:border-[#b5862a]"
            />
          </label>
          <label className="mt-3 grid gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5f6872]">
            Why this matters
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              className="resize-y rounded-md border border-[#ddd8cd] bg-white/70 px-3 py-2 text-xs font-normal normal-case tracking-normal outline-none focus:border-[#b5862a]"
            />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <select
              value={intent}
              onChange={(event) => setIntent(event.target.value as Opportunity["searchIntent"])}
              className="h-9 rounded-md border border-[#ddd8cd] bg-white px-2 text-[11px]"
            >
              <option>Informational</option>
              <option>Commercial</option>
              <option>Transactional</option>
              <option>Navigational</option>
            </select>
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value as Opportunity["priority"])}
              className="h-9 rounded-md border border-[#ddd8cd] bg-white px-2 text-[11px]"
            >
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </div>
          <Button
            className="mt-4 w-full"
            onClick={createManual}
            disabled={!title.trim() || !project}
          >
            <Plus size={16} /> Add to Plan → Captured
          </Button>
        </section>
      </div>

      <section className="mx-5 overflow-hidden rounded-lg border border-[#ddd8cd] bg-[#fffdf8] md:mx-9">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[#ddd8cd] px-4 py-3">
          <div className="flex items-baseline gap-3">
            <h2 className="font-display text-xl">Discovery suggestions</h2>
            <span className="text-[10px] text-[#697282]">{suggested.length} awaiting review</span>
          </div>
          <Button onClick={acceptSelected} disabled={selected.size === 0}>
            <CheckCircle size={17} /> Add {selected.size || "selected"} to Plan
          </Button>
        </div>

        {visible.length === 0 ? (
          <div className="grid place-items-center px-6 py-14 text-center">
            <Binoculars size={28} className="text-[#b5862a]" />
            <h3 className="mt-3 font-display text-lg">No suggestions waiting</h3>
            <p className="mt-1 max-w-md text-xs leading-5 text-[#697282]">
              Run discovery to review new signals. Existing Opportunities stay safely in Plan.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[32px_2fr_1fr_.8fr_.7fr_1.4fr_.7fr] gap-3 border-b border-[#e8e3db] px-4 py-2.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-[#66707c]">
                <span />
                <span>Opportunity</span>
                <span>Source</span>
                <span>Intent</span>
                <span>Impact</span>
                <span>Why Milo found it</span>
                <span>State</span>
              </div>
              {visible.map((item) => {
                const checked = selected.has(item.id);
                return (
                  <div
                    key={item.id}
                    className="grid min-h-14 grid-cols-[32px_2fr_1fr_.8fr_.7fr_1.4fr_.7fr] items-center gap-3 border-b border-[#e8e3db] px-4 py-2 text-[10px] text-[#586371] last:border-b-0"
                  >
                    <button
                      type="button"
                      aria-label={`Select ${item.title}`}
                      onClick={() => item.status === "suggested" && toggle(item.id)}
                      disabled={item.status !== "suggested"}
                      className={`grid h-4 w-4 place-items-center rounded-[3px] border ${checked ? "border-[#a86f09] bg-[#b87f12] text-white" : "border-[#8e979d] bg-white"}`}
                    >
                      {checked ? <Check size={11} /> : null}
                    </button>
                    <strong className="text-[11px] leading-4 text-[#20272b]">{item.title}</strong>
                    <span>{opportunitySourceLabel(item as unknown as Opportunity)}</span>
                    <span>{item.searchIntent}</span>
                    <span className="capitalize">{item.businessImpact ?? item.priority}</span>
                    <span className="leading-4">{item.reasonDiscovered ?? item.businessValue}</span>
                    <span
                      className={item.status === "accepted" ? "text-[#398a63]" : "text-[#9a6d16]"}
                    >
                      {item.status === "accepted" ? "In Plan" : "Suggested"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function SourceCard({ label, status, to }: { label: string; status: string; to: string }) {
  return (
    <Link
      to={to}
      className="grid min-h-[74px] grid-cols-[auto_1fr] gap-2 rounded-md border border-[#ddd8cd] bg-[#fffefa] p-3 transition hover:border-[#b9ad9b]"
    >
      <CheckCircle size={17} className="text-[#3c966c]" />
      <strong className="self-center text-[11px]">{label}</strong>
      <span className="col-span-2 text-[10px] text-[#697282]">{status}</span>
    </Link>
  );
}

function PlanToolbar({
  view,
  query,
  showArchived,
  onView,
  onQuery,
  onToggleArchived,
}: {
  view: PlanView;
  query: string;
  showArchived: boolean;
  onView: (view: PlanView) => void;
  onQuery: (value: string) => void;
  onToggleArchived: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#ddd8cd] bg-[#fbfaf6] px-5 py-3 md:px-9">
      <div className="flex items-center gap-1">
        <ViewTab
          active={view === "list"}
          icon={ListBullets}
          label="List"
          onClick={() => onView("list")}
        />
        <ViewTab
          active={view === "board"}
          icon={Kanban}
          label="Board"
          onClick={() => onView("board")}
        />
        <ViewTab
          active={view === "calendar"}
          icon={CalendarBlank}
          label="Calendar"
          onClick={() => onView("calendar")}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggleArchived}
          className={`flex h-9 items-center gap-2 rounded-md border px-3 text-[11px] ${showArchived ? "border-[#b5862a] bg-[#f4ead4] text-[#765719]" : "border-[#ddd8cd] bg-[#fffdf8] text-[#667181]"}`}
        >
          <Archive size={15} /> {showArchived ? "Active work" : "Archived"}
        </button>
        <button
          type="button"
          className="grid h-9 w-9 place-items-center rounded-md border border-[#ddd8cd] bg-[#fffdf8] text-[#667181]"
          aria-label="Filters"
        >
          <Funnel size={15} />
        </button>
        <label className="flex h-9 w-[260px] max-w-[55vw] items-center gap-2 rounded-md border border-[#ddd8cd] bg-white px-3 text-[#6f7985]">
          <MagnifyingGlass size={15} />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search opportunities…"
            className="min-w-0 flex-1 border-0 bg-transparent text-[11px] outline-none"
          />
        </label>
      </div>
    </div>
  );
}

function ViewTab({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof ListBullets;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-9 items-center gap-2 rounded-md border px-3 text-[11px] transition ${active ? "border-[#ddd8cd] bg-white text-[#202221] shadow-sm" : "border-transparent text-[#667181] hover:bg-white/60"}`}
    >
      <Icon size={15} /> {label}
    </button>
  );
}

function BoardView({
  opportunities,
  orphans,
  assetGroups,
  selectedId,
  onSelect,
  onPrimaryAction,
  onOpenAsset,
  rewriteEnabled,
}: {
  opportunities: OpportunityView[];
  orphans: ContentAsset[];
  assetGroups: Map<string, ContentAsset[]>;
  selectedId?: string;
  onSelect: (id?: string) => void;
  onPrimaryAction: (opportunity: OpportunityView) => void;
  onOpenAsset: (assetId: string) => void;
  rewriteEnabled: boolean;
}) {
  const t = useT();
  const [dragging, setDragging] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());

  function toggleSelect(id: string) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelection(new Set());
  }

  /**
   * Bulk actions run one governed transition per selected item, skipping any the
   * lifecycle graph forbids, and report the split. Only inert moves — no bulk
   * arm, publish or delete — so a batch can never reach a customer's live site.
   */
  function runBatch(to: OpportunityLifecycleStatus, verb: string) {
    const dueAt = to === "scheduled" ? format(addDays(new Date(), 1), "yyyy-MM-dd") : undefined;
    let done = 0;
    let skipped = 0;
    for (const id of selection) {
      const opportunity = opportunities.find((item) => item.id === id);
      if (!opportunity || !canTransitionOpportunity(opportunity.status, to)) {
        skipped++;
        continue;
      }
      try {
        // Prioritise must CLEAR dueAt, or a Planned card keeps deriving Planned
        // from the stale date and the move looks like a no-op — same reason the
        // drag path clears it.
        transitionOpportunity(
          id,
          to,
          to === "prioritized" ? { priority: opportunity.priority, dueAt: undefined } : { dueAt },
        );
        done++;
      } catch {
        skipped++;
      }
    }
    toast.success(`${verb} ${done}${skipped ? ` · ${skipped} skipped` : ""}`);
    clearSelection();
  }
  function batchArchive() {
    let done = 0;
    let skipped = 0;
    for (const id of selection) {
      // Membership guard: `selection` can hold ids no longer in view (a project
      // switch or filter). Without this, a stale id from another project would be
      // archived invisibly. Only touch opportunities currently on screen.
      if (!opportunities.some((item) => item.id === id)) {
        skipped++;
        continue;
      }
      try {
        archiveOpportunity(id);
        done++;
      } catch {
        skipped++;
      }
    }
    toast.success(`Archived ${done}${skipped ? ` · ${skipped} skipped` : ""}`);
    clearSelection();
  }

  /**
   * Only two columns take a mutating drop. Every other pipeline stage is derived
   * from an asset — reached by writing, reviewing, scheduling or publishing in the
   * editor, never by dropping a card. A drop elsewhere explains itself rather than
   * silently doing nothing, and nothing on this board can ever arm or publish.
   */
  function dropOnColumn(event: React.DragEvent, target: PipelineStage) {
    event.preventDefault();
    setDragging(false);
    const id = event.dataTransfer.getData("text/opportunity-id");
    const opportunity = opportunities.find((item) => item.id === id);
    if (!opportunity) return;
    const to = BOARD_DROP_TARGETS[target];
    if (!to) {
      toast.message("That stage is reached by working on the draft, not by dragging a card.");
      return;
    }
    if (!canTransitionOpportunity(opportunity.status, to)) {
      toast.error(
        `Can’t move “${opportunity.title}” to ${t(`pipeline.stage.${target}`)} from ${t(`pipeline.stage.${opportunity.pipeline}`)}.`,
      );
      return;
    }
    // Demoting to queued must CLEAR dueAt, or pipelineStage keeps deriving
    // "planned" from the stale date and the drop looks like a no-op.
    const fields =
      target === "queued"
        ? { priority: opportunity.priority, dueAt: undefined }
        : { dueAt: format(addDays(new Date(), 1), "yyyy-MM-dd") };
    try {
      transitionOpportunity(id, to, fields);
      toast.success(
        target === "queued"
          ? "Prioritised"
          : "Target set for tomorrow — set a go-live time in the editor once the draft is ready",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not move opportunity");
    }
  }

  return (
    <div
      className={`relative min-h-[calc(100vh-156px)] px-3 py-3 ${selectedId ? "xl:pr-[310px]" : ""}`}
    >
      <div className="overflow-x-auto pb-3">
        <div className="grid min-w-[1480px] grid-cols-[repeat(11,minmax(0,1fr))] gap-2">
          {BOARD_STAGES.map((stage) => {
            const cards = opportunities.filter((opportunity) => opportunity.pipeline === stage);
            const droppable = Boolean(BOARD_DROP_TARGETS[stage]);
            return (
              <section
                key={stage}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => dropOnColumn(event, stage)}
                className={`min-h-[calc(100vh-195px)] rounded-lg border bg-[#f8f6f0]/70 px-1.5 pb-3 transition ${
                  dragging
                    ? droppable
                      ? "border-dashed border-[#b5862a] ring-1 ring-[#b5862a]/40"
                      : "border-[#e4ded4] opacity-60"
                    : "border-[#e4ded4]"
                }`}
              >
                <header
                  className="-mx-1.5 mb-2.5 grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-t-lg border-b border-[#ddd8cd] border-t-[3px] px-2.5 py-2"
                  style={{ borderTopColor: pipelineStageColors[stage] }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: pipelineStageColors[stage] }}
                  />
                  <span className="truncate text-[10px] font-medium">
                    {t(`pipeline.stage.${stage}`)}
                  </span>
                  <span className="text-[10px] text-[#697282]">{cards.length}</span>
                </header>
                {cards.map((opportunity) => (
                  <OpportunityCard
                    key={opportunity.id}
                    opportunity={opportunity}
                    assets={assetGroups.get(opportunity.id) ?? []}
                    selected={selectedId === opportunity.id}
                    checked={selection.has(opportunity.id)}
                    onToggleCheck={() => toggleSelect(opportunity.id)}
                    onClick={() => onSelect(opportunity.id)}
                    onPrimaryAction={onPrimaryAction}
                    onOpenAsset={onOpenAsset}
                    onDragStateChange={setDragging}
                    rewriteEnabled={rewriteEnabled}
                  />
                ))}
                {cards.length === 0 ? (
                  <div className="px-2 py-6 text-center text-[9px] text-[#a8a89f]">
                    Nothing here yet
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
      <OrphanLane orphans={orphans} onOpenAsset={onOpenAsset} />
      <BatchBar
        count={selection.size}
        onPrioritise={() => runBatch("prioritized", "Prioritised")}
        onSetDate={() => runBatch("scheduled", "Target set for")}
        onArchive={batchArchive}
        onClear={clearSelection}
      />
    </div>
  );
}

function OpportunityCard({
  opportunity,
  assets,
  selected,
  checked,
  onToggleCheck,
  onClick,
  onPrimaryAction,
  onOpenAsset,
  onDragStateChange,
  rewriteEnabled,
}: {
  opportunity: OpportunityView;
  assets: ContentAsset[];
  selected: boolean;
  checked: boolean;
  onToggleCheck: () => void;
  onClick: () => void;
  onPrimaryAction: (opportunity: OpportunityView) => void;
  onOpenAsset: (assetId: string) => void;
  onDragStateChange: (dragging: boolean) => void;
  rewriteEnabled: boolean;
}) {
  const t = useT();
  const draggable = DRAGGABLE_STAGES.includes(opportunity.pipeline);
  // A live page whose draft is gone: always a safe read-only "Open live page"
  // link, plus the "Rewrite this page" action only where an update-in-place is
  // safe (manual/custom publishing) — never a WordPress/Shopify duplicate.
  const liveMissing = opportunity.pipeline === "live_missing";
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/opportunity-id", opportunity.id);
        onDragStateChange(true);
      }}
      onDragEnd={() => onDragStateChange(false)}
      onClick={onClick}
      onKeyDown={(event) => {
        // Ignore key events bubbling up from the checkbox / primary-action buttons,
        // or activating one of those by keyboard also opens the drawer.
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className={`group relative mb-2 grid w-full cursor-pointer gap-2 rounded-md border bg-[#fffdf8] p-2.5 text-left shadow-[0_1px_2px_rgba(24,29,31,.03)] transition hover:border-[#c2b7a7] ${selected || checked ? "border-[#b5862a] ring-1 ring-[#b5862a]" : "border-[#ded8ce]"}`}
    >
      <button
        type="button"
        aria-label={checked ? "Deselect" : "Select"}
        aria-pressed={checked}
        onClick={(event) => {
          event.stopPropagation();
          onToggleCheck();
        }}
        className={`absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-[3px] border transition ${
          checked
            ? "border-[#a86f09] bg-[#b87f12] text-white opacity-100"
            : "border-[#b3b4b7] bg-white text-transparent opacity-0 group-hover:opacity-100"
        }`}
      >
        <Check size={11} />
      </button>
      <strong className="pr-5 text-[10px] leading-[1.45]">
        {opportunity.title} <SampleBadge id={opportunity.id} className="ml-1 align-middle" />
      </strong>
      <span className="w-max max-w-full rounded-[3px] border border-[#e2ddd4] bg-[#f7f4ed] px-1.5 py-0.5 text-[8px] text-[#727a84]">
        {opportunitySourceLabel(opportunity)}
      </span>
      <span className="flex flex-wrap items-center gap-1.5 text-[8px] uppercase text-[#6a7683]">
        <StageChip stage={opportunity.pipeline} detail={opportunity.pipelineDetail} />
        {opportunity.searchIntent}
      </span>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span className="text-[9px] text-[#5f6771]">
          {opportunity.dueAt ? `Due ${formatDate(opportunity.dueAt)}` : opportunity.priority}
        </span>
        {liveMissing ? (
          <span className="flex items-center gap-1.5">
            {opportunity.canonicalUrl ? (
              <a
                href={opportunity.canonicalUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="rounded-[4px] border border-[#e2c9a0] bg-[#fbf3e4] px-1.5 py-1 text-[8px] font-medium text-[#8a5a12] hover:bg-[#f6e9d2]"
              >
                Open live page
              </a>
            ) : null}
            {rewriteEnabled && opportunity.canonicalUrl ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onPrimaryAction(opportunity);
                }}
                className="rounded-[4px] border border-[#e2c9a0] bg-[#f6e9d2] px-1.5 py-1 text-[8px] font-medium text-[#8a5a12] hover:bg-[#efdcbb]"
              >
                {t(nextAction(opportunity.pipeline))}
              </button>
            ) : null}
          </span>
        ) : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onPrimaryAction(opportunity);
            }}
            className="rounded-[4px] border border-[#ded8ce] bg-[#f7f4ed] px-1.5 py-1 text-[8px] font-medium text-[#5c6470] hover:border-[#c2b7a7] hover:bg-[#f1ece1]"
          >
            {t(nextAction(opportunity.pipeline))}
          </button>
        )}
      </div>
      <StackedDeck assets={assets} onOpenAsset={onOpenAsset} />
    </div>
  );
}

function ListView({
  opportunities,
  selectedId,
  onSelect,
}: {
  opportunities: OpportunityView[];
  selectedId?: string;
  onSelect: (id?: string) => void;
}) {
  return (
    <div className={`relative min-h-[calc(100vh-156px)] p-4 ${selectedId ? "xl:pr-[310px]" : ""}`}>
      <div className="overflow-x-auto rounded-lg border border-[#ddd8cd] bg-[#fffdf8]">
        <div className="min-w-[920px]">
          <div className="grid grid-cols-[2fr_.8fr_.9fr_.7fr_.8fr_80px] gap-3 border-b border-[#ddd8cd] bg-[#f7f4ed] px-4 py-2.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-[#697282]">
            <span>Opportunity</span>
            <span>Status</span>
            <span>Source</span>
            <span>Impact</span>
            <span>Due date</span>
            <span>Actions</span>
          </div>
          {opportunities.map((opportunity) => (
            <button
              key={opportunity.id}
              type="button"
              onClick={() => onSelect(opportunity.id)}
              className={`grid min-h-14 w-full grid-cols-[2fr_.8fr_.9fr_.7fr_.8fr_80px] items-center gap-3 border-b border-[#e7e1d8] px-4 py-2.5 text-left text-[10px] last:border-b-0 hover:bg-[#faf6ef] ${selectedId === opportunity.id ? "bg-[#faf6ef]" : ""}`}
            >
              <strong className="flex items-center gap-1.5 text-[11px]">
                <span className="truncate">{opportunity.title}</span>
                <SampleBadge id={opportunity.id} />
              </strong>
              <StageChip stage={opportunity.pipeline} detail={opportunity.pipelineDetail} />
              <span>{opportunitySourceLabel(opportunity)}</span>
              <span className="capitalize">{opportunity.businessImpact}</span>
              <span>{opportunity.dueAt ? formatDate(opportunity.dueAt) : "Unscheduled"}</span>
              <span className="flex items-center gap-2">
                <DotsThree size={16} />
                <Archive size={14} />
              </span>
            </button>
          ))}
          {opportunities.length === 0 ? (
            <div className="px-5 py-12 text-center text-xs text-[#697282]">
              No active opportunities match these filters.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ArchivedView({
  opportunities,
  selectedId,
  onSelect,
}: {
  opportunities: OpportunityView[];
  selectedId?: string;
  onSelect: (id?: string) => void;
}) {
  return (
    <div
      className={`relative min-h-[calc(100vh-156px)] p-5 md:p-8 ${selectedId ? "xl:pr-[330px]" : ""}`}
    >
      <div className="mx-auto max-w-4xl overflow-hidden rounded-lg border border-[#ddd8cd] bg-[#fffdf8]">
        <div className="border-b border-[#ddd8cd] px-5 py-4">
          <h2 className="font-display text-xl">Archived opportunities</h2>
          <p className="mt-1 text-xs text-[#697282]">
            Restore active work here. Permanent deletion becomes available inside an archived record
            and remains recoverable for 30 days.
          </p>
        </div>
        {opportunities.map((opportunity) => (
          <div
            key={opportunity.id}
            className="flex items-center justify-between gap-4 border-b border-[#e7e1d8] px-5 py-4 last:border-b-0"
          >
            <button
              type="button"
              onClick={() => onSelect(opportunity.id)}
              className="min-w-0 text-left"
            >
              <div className="truncate text-sm font-medium">{opportunity.title}</div>
              <div className="mt-1 text-[10px] text-[#697282]">
                Archived {opportunity.archivedAt ? formatDate(opportunity.archivedAt) : "recently"}{" "}
                · {opportunitySourceLabel(opportunity)}
              </div>
            </button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                restoreOpportunity(opportunity.id);
                toast.success("Opportunity restored");
              }}
            >
              Restore
            </Button>
          </div>
        ))}
        {opportunities.length === 0 ? (
          <div className="px-5 py-12 text-center text-xs text-[#697282]">Nothing is archived.</div>
        ) : null}
      </div>
    </div>
  );
}

function CalendarView({
  opportunities,
  goLives,
  scale,
  selectedId,
  riskOpportunityIds,
  riskAssetIds,
  onScale,
  onSelect,
  onPrimaryAction,
  onOpenAsset,
  onDrop,
}: {
  opportunities: OpportunityView[];
  /** Armed assets, keyed on the asset — the real go-live layer, incl. orphans. */
  goLives: ContentAsset[];
  scale: CalendarScale;
  selectedId?: string;
  /** Dated within 7 days but NOT ready — drives the amber/red chip badges. */
  riskOpportunityIds: Set<string>;
  riskAssetIds: Set<string>;
  onScale: (scale: CalendarScale) => void;
  onSelect: (id?: string) => void;
  onPrimaryAction: (opportunity: OpportunityView) => void;
  onOpenAsset: (assetId: string) => void;
  /** Owned by PlanPage: opens the schedule dialog (arm / target / reschedule). */
  onDrop: (event: React.DragEvent, date: Date) => void;
}) {
  const today = new Date();
  const initial = today.getDay() === 0 ? addDays(today, 1) : today;
  const [anchor, setAnchor] = useState(initial);
  // Two layers. Ghosts are dueAt TARGETS in a pre-armed stage. Restricting to
  // those stages (rather than merely "not armed") is deliberate: a live, sent or
  // needs_fixing opportunity can carry a stale dueAt, and rendering it as a dashed
  // "Target — not scheduled" would mislabel already-done work as unscheduled — and
  // would put a live_missing card's rewrite affordance on the calendar, outside
  // the board's connector gate.
  const ghosts = opportunities.filter(
    (opportunity) => opportunity.dueAt && GHOST_STAGES.includes(opportunity.pipeline),
  );
  const unscheduled = opportunities.filter(
    (opportunity) => !opportunity.dueAt && opportunity.pipeline === "queued",
  );

  function move(direction: -1 | 1) {
    if (scale === "month")
      setAnchor((date) => (direction < 0 ? subMonths(date, 1) : addMonths(date, 1)));
    else
      setAnchor((date) =>
        direction < 0
          ? subDays(date, scale === "week" ? 7 : 1)
          : addDays(date, scale === "week" ? 7 : 1),
      );
  }

  // Dropping a card on a day opens PlanPage's schedule dialog: a READY article
  // can arm its real go-live there (default 09:00 local); anything else sets a
  // target with the reasons it can't publish spelled out. Nothing mutates on the
  // drop itself.
  function retargetOn(event: React.DragEvent, date: Date) {
    event.preventDefault();
    onDrop(event, date);
  }

  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const dayDates =
    scale === "day"
      ? [anchor]
      : eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
  const monthStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const monthEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
  const monthDates = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const heading =
    scale === "month"
      ? format(anchor, "MMMM yyyy")
      : scale === "day"
        ? format(anchor, "EEEE, MMM d, yyyy")
        : `${format(weekStart, "MMM d")}–${format(addDays(weekStart, 6), "MMM d, yyyy")}`;

  return (
    <div
      className={`relative grid min-h-[calc(100vh-156px)] gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_210px] ${selectedId ? "xl:pr-[310px]" : ""}`}
    >
      <section className="overflow-hidden rounded-lg border border-[#ddd8cd] bg-[#fffdf8]">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[#ddd8cd] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => move(-1)}
              className="grid h-9 w-9 place-items-center rounded-md border border-[#ddd8cd]"
            >
              <CaretLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              className="grid h-9 w-9 place-items-center rounded-md border border-[#ddd8cd]"
            >
              <CaretRight size={16} />
            </button>
            <strong className="ml-1 font-display text-sm">{heading}</strong>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-[#ddd8cd] p-0.5">
              {(["day", "week", "month"] as CalendarScale[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => onScale(item)}
                  className={`min-h-7 rounded px-2.5 text-[9px] capitalize ${scale === item ? "bg-white shadow-sm" : "text-[#64707e]"}`}
                >
                  {item}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setAnchor(initial)}
              className="h-8 rounded-md border border-[#ddd8cd] px-3 text-[9px]"
            >
              Today
            </button>
          </div>
        </div>

        {scale === "month" ? (
          <div className="grid grid-cols-7">
            {monthDates.map((date) => (
              <CalendarDay
                key={date.toISOString()}
                date={date}
                ghosts={ghosts}
                goLives={goLives}
                selectedId={selectedId}
                riskOpportunityIds={riskOpportunityIds}
                riskAssetIds={riskAssetIds}
                onSelect={onSelect}
                onPrimaryAction={onPrimaryAction}
                onOpenAsset={onOpenAsset}
                onDrop={retargetOn}
                compact
                muted={!isSameMonth(date, anchor)}
              />
            ))}
          </div>
        ) : (
          <div className={`grid ${scale === "day" ? "grid-cols-1" : "min-w-[760px] grid-cols-7"}`}>
            {dayDates.map((date) => (
              <CalendarDay
                key={date.toISOString()}
                date={date}
                ghosts={ghosts}
                goLives={goLives}
                selectedId={selectedId}
                riskOpportunityIds={riskOpportunityIds}
                riskAssetIds={riskAssetIds}
                onSelect={onSelect}
                onPrimaryAction={onPrimaryAction}
                onOpenAsset={onOpenAsset}
                onDrop={retargetOn}
              />
            ))}
          </div>
        )}
      </section>

      <aside className="rounded-lg border border-[#ddd8cd] bg-[#fffdf8] p-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base">Unscheduled</h3>
          <span className="text-[10px] text-[#697282]">{unscheduled.length}</span>
        </div>
        <p className="mt-2 text-[10px] leading-4 text-[#697282]">
          Drag one onto a day. A ready article can be scheduled to go live right there; anything
          else gets a work target.
        </p>
        <div className="mt-4 grid gap-2">
          {unscheduled.map((opportunity) => (
            <button
              key={opportunity.id}
              type="button"
              draggable
              onDragStart={(event) =>
                event.dataTransfer.setData("text/opportunity-id", opportunity.id)
              }
              onClick={() => onSelect(opportunity.id)}
              className="border-t-[3px] border-[#b5862a] bg-[#fbfaf6] px-2.5 py-3 text-left"
            >
              <strong className="text-[10px] leading-4">{opportunity.title}</strong>
              <span className="mt-2 block text-[8px] text-[#697282]">
                Source: {opportunitySourceLabel(opportunity)}
              </span>
            </button>
          ))}
          {unscheduled.length === 0 ? (
            <div className="rounded-md border border-dashed border-[#ddd8cd] px-3 py-6 text-center text-[10px] text-[#697282]">
              No prioritized work waiting.
            </div>
          ) : null}
        </div>
        <div className="mt-5 flex items-center gap-2 border-t border-[#e7e1d8] pt-3 text-[9px] text-[#697282]">
          <Globe size={14} /> Europe/Stockholm
        </div>
      </aside>
    </div>
  );
}

function CalendarDay({
  date,
  ghosts,
  goLives,
  selectedId,
  riskOpportunityIds,
  riskAssetIds,
  onSelect,
  onPrimaryAction,
  onOpenAsset,
  onDrop,
  compact = false,
  muted = false,
}: {
  date: Date;
  ghosts: OpportunityView[];
  goLives: ContentAsset[];
  selectedId?: string;
  riskOpportunityIds: Set<string>;
  riskAssetIds: Set<string>;
  onSelect: (id?: string) => void;
  onPrimaryAction: (opportunity: OpportunityView) => void;
  onOpenAsset: (assetId: string) => void;
  onDrop: (event: React.DragEvent, date: Date) => void;
  compact?: boolean;
  muted?: boolean;
}) {
  const t = useT();
  const dayGhosts = ghosts.filter(
    (opportunity) =>
      opportunity.dueAt && isSameDay(new Date(`${opportunity.dueAt.slice(0, 10)}T12:00:00`), date),
  );
  const dayGoLives = goLives.filter(
    (asset) =>
      // Bucket on the LOCAL calendar day of the instant, matching the chip's
      // formatTimeLocal and the datetime-local picker the user typed the slot
      // into — a 09:00 CEST go-live must sit on the day the user meant, with
      // the chip showing 09:00 (isSameDay compares local components).
      asset.scheduledPublishAt && isSameDay(new Date(asset.scheduledPublishAt), date),
  );
  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => onDrop(event, date)}
      className={`${compact ? "min-h-[118px]" : "min-h-[calc(100vh-238px)]"} border-b border-r border-[#e5dfd6] px-2 pb-3 ${muted ? "bg-[#f7f4ed]/50 text-[#a29d94]" : ""}`}
    >
      <header className="-mx-2 mb-3 grid place-items-center border-b border-[#e5dfd6] px-2 py-2">
        <span className="text-[8px] uppercase text-[#697282]">{format(date, "EEE")}</span>
        <strong className="font-display text-base">{format(date, "d")}</strong>
      </header>

      {/* SOLID layer — armed go-lives. The real, scheduled events. Draggable:
          dropping one on another day opens the reschedule dialog (cancel +
          re-arm through the same queue). Click still opens the editor. */}
      {dayGoLives.map((asset) => (
        <button
          key={asset.id}
          type="button"
          draggable
          onDragStart={(event) => event.dataTransfer.setData("text/asset-id", asset.id)}
          onClick={() => onOpenAsset(asset.id)}
          className={`mb-2 grid w-full cursor-grab gap-1 rounded-md border p-2 text-left transition ${
            riskAssetIds.has(asset.id)
              ? "border-red-500/60 bg-red-500/10 hover:border-red-600"
              : "border-amber-500/60 bg-amber-500/10 hover:border-amber-600"
          }`}
        >
          <span className="flex items-center gap-1 text-[8px] font-medium uppercase tracking-[0.08em] text-amber-800">
            <Clock size={10} />
            {asset.scheduledPublishAt ? formatTimeLocal(asset.scheduledPublishAt) : ""} · Goes live
          </span>
          <strong className="text-[9px] leading-[1.4] text-[#3a2f18]">{asset.title}</strong>
          {/* Armed but regressed since arming — the cron WILL refuse this at fire
              time; say so here instead of the morning after. */}
          {riskAssetIds.has(asset.id) ? (
            <span className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-red-700">
              <Warning size={10} weight="fill" /> {t("calsched.badge.willFail")}
            </span>
          ) : null}
        </button>
      ))}

      {/* GHOST layer — dueAt targets, not yet armed. Dashed, draggable to retarget. */}
      {dayGhosts.map((opportunity) => (
        <div
          key={opportunity.id}
          role="button"
          tabIndex={0}
          draggable
          onDragStart={(event) => event.dataTransfer.setData("text/opportunity-id", opportunity.id)}
          onClick={() => onSelect(opportunity.id)}
          onKeyDown={(event) => {
            // Ignore key events bubbling up from the nested action button, or a
            // keyboard user activating that button also opens the drawer.
            if (event.target !== event.currentTarget) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(opportunity.id);
            }
          }}
          className={`mb-2 grid w-full cursor-pointer gap-1 rounded-md border border-dashed bg-[#fffdf8]/70 p-2 text-left ${selectedId === opportunity.id ? "border-[#b5862a] ring-1 ring-[#b5862a]" : "border-[#cdc5b7]"}`}
        >
          <span className="text-[7px] font-medium uppercase tracking-[0.1em] text-[#9a927f]">
            Target — not scheduled
          </span>
          <strong className="text-[9px] leading-[1.4]">{opportunity.title}</strong>
          {/* Dated within the week but not ready to publish — the in-app alert's
              on-calendar counterpart. */}
          {riskOpportunityIds.has(opportunity.id) ? (
            <span className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-amber-700">
              <Warning size={10} weight="fill" /> {t("calsched.badge.notReady")}
            </span>
          ) : null}
          {!compact ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPrimaryAction(opportunity);
              }}
              className="mt-0.5 w-max rounded-[4px] border border-[#ded8ce] bg-[#f7f4ed] px-1.5 py-0.5 text-[8px] font-medium text-[#5c6470] hover:border-[#c2b7a7] hover:bg-[#f1ece1]"
            >
              {t(nextAction(opportunity.pipeline))}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function OpportunityDrawer({
  opportunity,
  linkedAsset,
  onClose,
  onCreateContent,
  onOpenEditor,
  onOpenInsights,
}: {
  opportunity: OpportunityView;
  linkedAsset?: ContentAsset;
  onClose: () => void;
  onCreateContent: () => void;
  onOpenEditor: (assetId: string) => void;
  onOpenInsights: () => void;
}) {
  const t = useT();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [date, setDate] = useState(
    opportunity.dueAt?.slice(0, 10) ?? format(addDays(new Date(), 1), "yyyy-MM-dd"),
  );
  const score = linkedAsset?.qualityScore;
  const stage = opportunity.pipeline;
  const flowIndex = FLOW_STAGES.indexOf(stage);
  const inFlow = flowIndex >= 0;

  function prioritize() {
    try {
      transitionOpportunity(opportunity.id, "prioritized", {
        ownerName: opportunity.ownerName ?? "Project owner",
        priority: opportunity.priority,
      });
      toast.success("Opportunity moved to Prioritized");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prioritize");
    }
  }

  function schedule() {
    try {
      transitionOpportunity(opportunity.id, "scheduled", { dueAt: date });
      setScheduleOpen(false);
      toast.success(`Scheduled for ${formatDate(date)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not schedule");
    }
  }

  function unschedule() {
    try {
      transitionOpportunity(opportunity.id, "prioritized", { dueAt: undefined });
      toast.success("Returned to the unscheduled tray");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not unschedule");
    }
  }

  function archive() {
    try {
      archiveOpportunity(opportunity.id);
      toast.success("Opportunity archived", {
        action: { label: "Undo", onClick: () => restoreOpportunity(opportunity.id) },
      });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not archive");
    }
  }

  return (
    <aside className="fixed inset-y-3 right-3 z-30 w-[292px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-lg border border-[#ddd8cd] bg-[#fffdf8] p-4 shadow-[-14px_0_30px_rgba(30,34,32,.08)] lg:top-[116px] lg:bottom-3">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 text-[#65717e]"
        aria-label="Close opportunity"
      >
        <X size={17} />
      </button>
      <StageChip stage={stage} detail={opportunity.pipelineDetail} />
      <h2 className="mt-2.5 pr-5 font-display text-xl leading-[1.18]">{opportunity.title}</h2>
      <div className="mt-2 flex items-center gap-1.5 text-[9px] uppercase text-[#687481]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#398a63]" />
        {opportunity.searchIntent} opportunity
      </div>

      <dl className="my-5 grid gap-2.5">
        <Detail label="Source" value={opportunitySourceLabel(opportunity)} />
        <Detail
          label="Discovered because"
          value={opportunity.reasonDiscovered ?? opportunity.businessValue}
        />
        <Detail label="Intent" value={opportunity.searchIntent} />
        <Detail
          label="Business impact"
          value={capitalize(opportunity.businessImpact ?? opportunity.priority)}
        />
        <Detail
          label="Owner"
          value={opportunity.ownerName ?? "Unassigned"}
          icon={<UserCircle size={14} />}
        />
        <Detail
          label="Target keyword"
          value={opportunity.targetQuery ?? opportunity.title.toLocaleLowerCase()}
        />
        <Detail
          label="Due date"
          value={opportunity.dueAt ? formatDate(opportunity.dueAt) : "Not scheduled"}
          icon={<CalendarBlank size={14} />}
        />
      </dl>

      <div className="rounded-md border border-[#e3d8c3] bg-[#fbf7ef] p-3">
        <div className="flex items-center justify-between text-[9px]">
          <span>Pipeline stage</span>
          <strong>
            {inFlow ? `${flowIndex + 1} / ${FLOW_STAGES.length}` : t(`pipeline.stage.${stage}`)}
          </strong>
        </div>
        <div className="my-2 h-1 overflow-hidden rounded-full bg-[#e7dfd1]">
          <span
            className="block h-full rounded-full"
            style={{
              width: `${inFlow ? Math.max(12, ((flowIndex + 1) / FLOW_STAGES.length) * 100) : 100}%`,
              background: pipelineStageColors[stage],
            }}
          />
        </div>
        <p className="text-[8px] leading-4 text-[#69727c]">
          One record follows the work from discovery to measured result.
        </p>
      </div>

      <div className="mt-2.5 flex items-center gap-3 rounded-md border border-[#e3d8c3] bg-[#fbf7ef] p-3">
        <div className="grid h-9 w-9 place-items-center rounded-full border border-[#d6c9b2] font-display text-sm text-[#765719]">
          {score?.overall ?? "—"}
        </div>
        <div>
          <strong className="font-display text-sm">Milo Score</strong>
          <p className="mt-0.5 text-[8px] leading-3 text-[#697282]">
            {score
              ? `Content version scored ${formatDate(score.evaluatedAt)}.`
              : "Available after a content draft is created."}
          </p>
        </div>
      </div>
      <p className="mt-1.5 text-[8px] text-[#697282]">
        Milo Score evaluates a content version. It never ranks Opportunities.
      </p>

      <div className="mt-4 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#647183]">
        Next step
      </div>
      <div className="mt-2 grid gap-2">
        {stage === "idea" ? (
          <Button onClick={prioritize}>
            <CheckCircle size={16} /> Prioritize opportunity
          </Button>
        ) : null}
        {stage === "queued" ? (
          <Button onClick={() => setScheduleOpen((value) => !value)}>
            <CalendarBlank size={16} /> Set a target date
          </Button>
        ) : null}
        {stage === "planned" ? (
          <Button onClick={onCreateContent}>
            <FileText size={16} /> Create linked draft
          </Button>
        ) : null}
        {stage === "planned" ? (
          <Button variant="outline" onClick={unschedule}>
            Unschedule
          </Button>
        ) : null}
        {(
          ["writing", "in_review", "ready", "armed", "sent", "needs_fixing"] as PipelineStage[]
        ).includes(stage) && linkedAsset ? (
          <Button onClick={() => onOpenEditor(linkedAsset.id)}>
            <FileText size={16} /> Open linked content
          </Button>
        ) : null}
        {stage === "live" ? (
          <Button onClick={onOpenInsights}>
            <ChartLineUp size={16} /> View impact
          </Button>
        ) : null}
        {stage === "live_missing" && opportunity.canonicalUrl ? (
          <Button
            variant="outline"
            onClick={() => window.open(opportunity.canonicalUrl, "_blank", "noopener")}
          >
            <Globe size={16} /> Open live page
          </Button>
        ) : null}
        {stage !== "parked" ? (
          <Button variant="ghost" className="text-muted-foreground" onClick={archive}>
            <Archive size={15} /> Archive
          </Button>
        ) : null}
      </div>

      {scheduleOpen ? (
        <div className="mt-3 rounded-md border border-[#d5c19a] bg-[#fffaf0] p-3 shadow-lg">
          <div className="flex items-center justify-between text-[11px]">
            <strong>Schedule this opportunity</strong>
            <button type="button" onClick={() => setScheduleOpen(false)}>
              <X size={14} />
            </button>
          </div>
          <p className="my-1 text-[8px] text-[#697282]">
            The same record will appear in Board, List and Calendar.
          </p>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="my-2 h-9 w-full rounded-md border border-[#ddd8cd] bg-white px-2 text-[10px]"
          />
          <Button className="w-full" size="sm" onClick={schedule}>
            Confirm schedule
          </Button>
        </div>
      ) : null}
    </aside>
  );
}

function Detail({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-2">
      <dt className="text-[9px] text-[#707b87]">{label}</dt>
      <dd className="m-0 flex items-start gap-1.5 text-[9px] leading-[1.45] text-[#333a3e]">
        {icon}
        {value}
      </dd>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value.length <= 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : format(date, "MMM d, yyyy");
}

/** The path portion of a live URL, for seeding a rewrite's publishSlug. */
function pathFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).pathname.replace(/^\//, "") || undefined;
  } catch {
    return undefined;
  }
}

function capitalize(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}
