import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { computeLaunchChecklist } from "@/lib/launch";
import { opportunityView } from "@/lib/opportunities";
import { pipelineStage, linkedAssetFor, upNext, isDropped } from "@/lib/pipeline";
import { StageChip } from "@/components/StageChip";
// Home is not localised yet (no useT anywhere in this file); pull the action
// label straight from the base dictionary so the wording still comes from ONE
// place and cannot drift from the chip beside it.
import { en } from "@/i18n/en";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleGauge,
  FileEdit,
  Inbox,
  Lightbulb,
  Plus,
  Rocket,
  Search,
  Settings2,
  Sparkles,
} from "lucide-react";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: "Home — Milo Growth" },
      {
        name: "description",
        content:
          "Your command centre for current SEO priorities, reviews, publishing and measurable growth.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const activeProjectId = useStore((state) => state.activeProjectId);
  const projects = useStore((state) => state.projects);
  const services = useStore((state) =>
    state.services.filter((item) => item.projectId === activeProjectId),
  );
  const rawOpportunities = useStore((state) =>
    state.opportunities.filter((item) => item.projectId === activeProjectId && !item.deletedAt),
  );
  const content = useStore((state) =>
    state.content.filter((item) => item.projectId === activeProjectId),
  );
  const audits = useStore((state) =>
    state.audits.filter((item) => item.projectId === activeProjectId),
  );
  const authorityOpportunities = useStore((state) =>
    state.authorityOpportunities.filter((item) => item.projectId === activeProjectId),
  );
  const suggestions = useStore((state) =>
    state.discoverySuggestions.filter(
      (item) => item.projectId === activeProjectId && item.status === "suggested",
    ),
  );
  const pendingActions = useStore((state) =>
    state.pendingActions.filter(
      (item) => item.projectId === activeProjectId && item.status === "pending",
    ),
  );
  const billingProfile = useStore((state) => state.billingProfile);
  const subscription = useStore((state) => state.subscription);
  const { isOwner } = useAuth();
  const active = projects.find((project) => project.id === activeProjectId) ?? projects[0];

  if (!active) return <FirstProject />;

  // Precedence, not recency — see linkedAssetFor. Picking the newest asset let an
  // armed one hide behind a later inert draft, so Home would invite the user to
  // work on something the cron was about to publish.
  const assetsByOpportunity = new Map<string, (typeof content)[number][]>();
  for (const asset of content) {
    const opportunityId = asset.opportunityId ?? asset.sourceOpportunityId;
    if (!opportunityId) continue;
    const list = assetsByOpportunity.get(opportunityId);
    if (list) list.push(asset);
    else assetsByOpportunity.set(opportunityId, [asset]);
  }
  const latestAssetByOpportunity = new Map<string, (typeof content)[number]>();
  for (const [opportunityId, list] of assetsByOpportunity) {
    const chosen = linkedAssetFor({ id: opportunityId }, list);
    if (chosen) latestAssetByOpportunity.set(opportunityId, chosen);
  }
  const opportunities = rawOpportunities
    .map((item) => opportunityView(item, latestAssetByOpportunity.get(item.id)))
    .filter((item) => item.status !== "archived");
  const complete = opportunities.filter(
    (item) => item.status === "approved" || item.status === "published",
  ).length;
  const scheduled = opportunities.filter((item) => item.status === "scheduled").length;
  const drafting = opportunities.filter((item) => item.status === "drafting").length;
  const inReview = opportunities.filter((item) => item.status === "in_review").length;
  const progress = opportunities.length ? Math.round((complete / opportunities.length) * 100) : 0;
  const latestContent = [...content]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4);
  const checklist = computeLaunchChecklist({
    project: active,
    services,
    opportunities: rawOpportunities,
    content,
    audits,
    authorityOpportunities,
    billingProfile,
    subscription,
    isOwner,
  });

  /**
   * "Up Next" — at most three items, each one thing with one action, ranked by
   * the shared urgency order rather than by a hand-rolled list of heuristics.
   * Broken work outranks unfinished work; armed and finished work is excluded
   * entirely, because nothing there is waiting on a human.
   */
  const upNextItems = upNext(
    rawOpportunities
      .filter((item) => !isDropped(item))
      .map((item) => ({
        item,
        stage: pipelineStage({
          opportunity: item,
          asset: latestAssetByOpportunity.get(item.id),
        }),
      })),
  );
  const nextActions = [
    // Suggestions are not opportunities yet, so they sit outside the pipeline —
    // but accepting them is genuinely the first thing to do on a fresh workspace.
    ...(suggestions.length
      ? [
          {
            key: "suggestions",
            title: `Review ${suggestions.length} discovered suggestion${suggestions.length === 1 ? "" : "s"}`,
            body: "Nothing enters Plan until you accept it.",
            to: "/app/plan" as const,
            search: { view: "discover" } as Record<string, string>,
            stage: undefined,
          },
        ]
      : []),
    ...upNextItems.map((entry) => ({
      key: entry.item.id,
      title: entry.item.title,
      body: en[entry.actionKey] ?? "",
      to: "/app/plan" as const,
      search: { selected: entry.item.id } as Record<string, string>,
      stage: entry.stage,
    })),
  ].slice(0, 4);
  const recentActivity = [
    ...latestContent.map((asset) => ({
      id: `content-${asset.id}`,
      title: `${asset.title} · ${asset.status}`,
      date: asset.updatedAt,
      icon: FileEdit,
      tone: "text-sky-700 bg-sky-500/10",
    })),
    ...rawOpportunities.slice(-4).map((opportunity) => ({
      id: `opportunity-${opportunity.id}`,
      title: `${opportunity.title} added to Plan`,
      date: opportunity.updatedAt ?? opportunity.createdAt ?? new Date().toISOString(),
      icon: Sparkles,
      tone: "text-violet-700 bg-violet-500/10",
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  return (
    <AppShell
      title={`${greeting()}, ${active.businessName || active.name}`}
      description={`${active.name} · ${active.mainLocation}`}
      actions={
        <>
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/app/plan", search: { view: "discover" } })}
          >
            <Search className="h-4 w-4" /> Discover opportunities
          </Button>
          <Button onClick={() => navigate({ to: "/app/plan", search: { view: "discover" } })}>
            <Plus className="h-4 w-4" /> New opportunity
          </Button>
        </>
      }
    >
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-full border-[5px] border-[#b77f1f]/80 bg-[#faf6ec]">
            <span className="font-display text-xl">{complete}</span>
            <span className="text-[10px] text-muted-foreground">of {opportunities.length}</span>
          </div>
          <div className="min-w-[220px] flex-1">
            <h2 className="font-display text-2xl">This month’s growth plan</h2>
            <div className="mt-4 h-2 max-w-md overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-[#b77f1f]" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {complete} of {opportunities.length} actions complete · {scheduled} scheduled
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/app/plan", search: { view: "board" } })}
          >
            <CalendarDays className="h-4 w-4" /> Open Plan <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <DashboardCard
          title="Next best actions"
          icon={Lightbulb}
          footer={
            <Link
              to="/app/plan"
              search={{ view: "board" }}
              className="inline-flex items-center gap-2 text-sm font-medium text-[#9a6716]"
            >
              Open Plan <ArrowRight className="h-4 w-4" />
            </Link>
          }
        >
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {nextActions.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                Nothing needs you right now.
              </div>
            ) : null}
            {nextActions.map((action) => (
              <button
                key={action.key}
                onClick={() => navigate({ to: action.to, search: action.search as never })}
                className="flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-secondary/35"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    {action.stage ? <StageChip stage={action.stage} /> : null}
                    <span className="block truncate text-sm font-medium">{action.title}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {action.body}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </DashboardCard>

        <DashboardCard
          title="Action inbox"
          icon={Inbox}
          subtitle={
            pendingActions.length
              ? `${pendingActions.length} Claude proposal${pendingActions.length === 1 ? "" : "s"} need your review`
              : "Nothing is waiting for approval"
          }
          footer={
            <Link
              to="/app/actions"
              className="inline-flex items-center gap-2 text-sm font-medium text-[#9a6716]"
            >
              View all proposals <ArrowRight className="h-4 w-4" />
            </Link>
          }
        >
          {pendingActions.length ? (
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {pendingActions.slice(0, 3).map((action) => (
                <div key={action.id} className="flex items-center gap-4 px-4 py-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#faf1df] font-display text-[#9a6716]">
                    C
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{action.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      Claude proposal · {action.riskLevel} risk
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate({ to: "/app/actions" })}
                  >
                    Review
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyInbox />
          )}
        </DashboardCard>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_.75fr_1fr]">
        <DashboardCard
          title="What changed"
          icon={BarChart3}
          footer={
            <Link
              to="/app/analytics"
              className="inline-flex items-center gap-2 text-sm font-medium text-[#9a6716]"
            >
              View Insights <ArrowRight className="h-4 w-4" />
            </Link>
          }
        >
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            <ChangeRow
              icon={Sparkles}
              tone="bg-violet-500/10 text-violet-700"
              title={`${suggestions.length} discovered suggestion${suggestions.length === 1 ? "" : "s"}`}
              body="Waiting in Discover until you accept them"
            />
            <ChangeRow
              icon={CalendarDays}
              tone="bg-sky-500/10 text-sky-700"
              title={`${scheduled} scheduled opportunit${scheduled === 1 ? "y" : "ies"}`}
              body="Visible in Day, Week and Month calendar views"
            />
            <ChangeRow
              icon={CheckCircle2}
              tone="bg-emerald-500/10 text-emerald-700"
              title={`${complete} approved or published`}
              body={`${drafting + inReview} still moving through production`}
            />
          </div>
        </DashboardCard>

        <DashboardCard
          title="Setup health"
          icon={Settings2}
          footer={
            <Link
              to="/app/launch-checklist"
              className="inline-flex items-center gap-2 text-sm font-medium text-[#9a6716]"
            >
              View checklist <ArrowRight className="h-4 w-4" />
            </Link>
          }
        >
          <div className="flex min-h-[176px] flex-col items-center justify-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700">
              <CircleGauge className="h-9 w-9" />
            </div>
            <div className="mt-4 font-display text-2xl">{checklist.progress.percent}% ready</div>
            <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
              {checklist.progress.requiredDone} of {checklist.progress.requiredTotal} essential
              setup checks complete
            </p>
          </div>
        </DashboardCard>

        <DashboardCard
          title="Recent activity"
          icon={Rocket}
          footer={
            <Link
              to="/app/editor"
              className="inline-flex items-center gap-2 text-sm font-medium text-[#9a6716]"
            >
              Open Content <ArrowRight className="h-4 w-4" />
            </Link>
          }
        >
          {recentActivity.length ? (
            <div className="divide-y divide-border">
              {recentActivity.map((item) => (
                <div key={item.id} className="flex items-start gap-3 py-3 first:pt-0">
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${item.tone}`}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-xs font-medium">{item.title}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {formatDate(item.date)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Activity appears as you plan and publish.
            </p>
          )}
        </DashboardCard>
      </section>

      <section className="mt-5 rounded-xl border border-border bg-card px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Content production</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {latestContent.length} recently updated · Milo Score stays attached to each content
              version
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate({ to: "/app/editor" })}>
            Open Content <ArrowUpRight className="h-4 w-4" />
          </Button>
        </div>
      </section>
    </AppShell>
  );
}

function FirstProject() {
  const navigate = useNavigate();
  return (
    <AppShell
      title="Welcome to Milo Growth"
      description="Create one project to start your monthly growth system."
    >
      <div className="mx-auto mt-8 max-w-2xl rounded-xl border border-border bg-card p-8 md:p-10">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9a6716]">
          First project
        </div>
        <h2 className="mt-3 font-display text-3xl">
          Set the context once. Edit it whenever you need.
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Project setup captures your business, website, market and tone. After signup it remains
          under Settings → Project, and you can add up to five projects from the project switcher.
        </p>
        <Button
          className="mt-7"
          onClick={() => navigate({ to: "/app/setup", search: { new: true } })}
        >
          <Plus className="h-4 w-4" /> Create first project
        </Button>
      </div>
    </AppShell>
  );
}

function DashboardCard({
  title,
  subtitle,
  icon: Icon,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: typeof Sparkles;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 text-[#b77f1f]" />
        <div>
          <h2 className="font-display text-xl">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      <div className="mt-4 flex-1">{children}</div>
      {footer ? <div className="mt-5">{footer}</div> : null}
    </section>
  );
}

function ChangeRow({
  icon: Icon,
  tone,
  title,
  body,
}: {
  icon: typeof Sparkles;
  tone: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 px-3 py-4">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${tone}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{body}</div>
      </div>
    </div>
  );
}

function EmptyInbox() {
  return (
    <div className="flex min-h-[188px] flex-col items-center justify-center rounded-lg border border-dashed border-border px-5 text-center">
      <CheckCircle2 className="h-8 w-8 text-emerald-600" />
      <div className="mt-3 font-display text-lg">You are all caught up</div>
      <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
        Claude proposals stay reviewable and never change the workspace until you approve them.
      </p>
    </div>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
