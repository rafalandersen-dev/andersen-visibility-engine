import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useAppLanguage, useT } from "@/i18n";
import { computeLaunchChecklist } from "@/lib/launch";
import { GHOST_STAGES, upNext } from "@/lib/pipeline";
import { growthWork, contentCover } from "@/lib/growth-work";
import {
  CONTENT_LANGUAGE_OPTIONS,
  projectContentLanguage,
  resolveContentLanguage,
} from "@/lib/content-languages";
import { upcomingPublishRisks } from "@/lib/calendar-schedule";
import { PublishRiskBanner } from "@/components/PublishRiskBanner";
import { StageChip } from "@/components/StageChip";
import {
  ArrowRight,
  CalendarBlank,
  CaretRight,
  CheckCircle,
  FileText,
  ListBullets,
  MagnifyingGlass,
  Plus,
} from "@phosphor-icons/react";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: "Today — Milo Growth" },
      { name: "description", content: "Your next publication, priorities and project activity." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const state = useStore((state) => state);
  const { isOwner } = useAuth();
  const t = useT();
  const locale = useAppLanguage();
  const active =
    state.projects.find((project) => project.id === state.activeProjectId) ?? state.projects[0];
  if (!active)
    return (
      <AppShell title={t("today.firstTitle")} description={t("today.firstBody")}>
        <Button asChild>
          <Link to="/app/setup" search={{ new: true }}>
            <Plus size={18} />
            {t("today.create")}
          </Link>
        </Button>
      </AppShell>
    );
  const content = state.content.filter((item) => item.projectId === active.id);
  const rawOpportunities = state.opportunities.filter(
    (item) => item.projectId === active.id && !item.deletedAt,
  );
  const work = growthWork(rawOpportunities, content);
  const next = work.scheduled[0];
  const cover = next && contentCover(next);
  const tasks = upNext(work.rows.map(({ item, stage }) => ({ item, stage })));
  const suggestions = state.discoverySuggestions.filter(
    (item) => item.projectId === active.id && item.status === "suggested",
  );
  const pending = state.pendingActions.filter(
    (item) => item.projectId === active.id && item.status === "pending",
  );
  const recent = [...content].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
  const checklist = computeLaunchChecklist({
    project: active,
    services: state.services.filter((item) => item.projectId === active.id),
    opportunities: rawOpportunities,
    content,
    audits: state.audits.filter((item) => item.projectId === active.id),
    authorityOpportunities: state.authorityOpportunities.filter(
      (item) => item.projectId === active.id,
    ),
    billingProfile: state.billingProfile,
    subscription: state.subscription,
    isOwner,
  });
  const risks = upcomingPublishRisks({
    ghosts: work.rows
      .filter(({ item, stage }) => item.dueAt && GHOST_STAGES.includes(stage))
      .map(({ item, asset }) => ({
        id: item.id,
        title: item.title,
        dueAt: item.dueAt,
        assetId: asset?.id,
      })),
    armed: work.scheduled,
    assets: content,
    project: active,
  });
  const date = (value: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, options).format(new Date(value));
  const languageName = (language: string) => {
    const name = resolveContentLanguage(language);
    const option = CONTENT_LANGUAGE_OPTIONS.find((item) => item.label === name);
    return option
      ? (new Intl.DisplayNames([locale], { type: "language" }).of(option.value) ?? option.label)
      : language;
  };
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <AppShell
      title={t("today.title")}
      eyebrow={new Intl.DateTimeFormat(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date())}
      description={t("today.subtitle")}
      actions={
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const q = String(new FormData(event.currentTarget).get("q") ?? "").trim();
            navigate({ to: "/app/plan", search: { view: "list", q } });
          }}
          className="flex h-11 w-[270px] max-w-full items-center gap-2 rounded-xl border border-border bg-card px-3"
        >
          <MagnifyingGlass size={18} className="shrink-0 text-muted-foreground" />
          <input
            name="q"
            aria-label={t("plan.search")}
            placeholder={t("plan.search")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          <button
            type="submit"
            aria-label={t("today.openPlan")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
          >
            <ArrowRight size={16} />
          </button>
        </form>
      }
    >
      <div className="milo-cockpit">
        <PublishRiskBanner
          className="mb-5"
          risks={risks}
          onOpenRisk={(risk) =>
            risk.assetId
              ? navigate({ to: "/app/editor", search: { id: risk.assetId } })
              : risk.opportunityId
                ? navigate({ to: "/app/plan", search: { selected: risk.opportunityId } })
                : undefined
          }
        />
        {next ? (
          <section className="milo-cockpit-hero" aria-label={t("today.next")}>
            {cover ? (
              <img src={cover} alt="" className="milo-cockpit-image" />
            ) : (
              <div className="milo-cockpit-excerpt">
                <p>
                  {next.metaDescription ||
                    next.markdown.replace(/[#*_`]/g, "").slice(0, 240) ||
                    next.title}
                </p>
              </div>
            )}
            <div className="milo-cockpit-copy">
              <div className="text-xs font-medium text-muted-foreground">{t("today.next")}</div>
              <h2>{next.title}</h2>
              <StageChip stage="armed" />
              <dl className="mt-5 space-y-2 text-sm text-muted-foreground">
                <div className="flex gap-2">
                  <CalendarBlank size={18} className="shrink-0" />
                  <dt className="sr-only">{t("plan.date")}</dt>
                  <dd>
                    {date(next.scheduledPublishAt!, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt className="sr-only">{t("shell.language")}</dt>
                  <dd>{languageName(next.language ?? projectContentLanguage(active))}</dd>
                  <dd>· {timezone}</dd>
                </div>
              </dl>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button asChild className="h-11 px-6">
                  <Link to="/app/editor" search={{ id: next.id }}>
                    {t("today.review")}
                    <ArrowRight size={17} />
                  </Link>
                </Button>
                <Button asChild variant="ghost" className="h-11 text-primary">
                  <Link to="/app/plan" search={{ view: "calendar", scheduleAsset: next.id }}>
                    {t("today.changeDate")}
                  </Link>
                </Button>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-border bg-card p-8 md:p-12">
            <FileText size={32} className="text-primary" />
            <h2 className="mt-5 text-2xl font-semibold tracking-tight">{t("today.emptyTitle")}</h2>
            <p className="mt-3 max-w-lg text-muted-foreground">{t("today.emptyBody")}</p>
            <Button asChild className="mt-6">
              <Link to="/app/plan">
                {t("today.openPlan")}
                <ArrowRight size={17} />
              </Link>
            </Button>
          </section>
        )}
        <section className="mt-9" aria-labelledby="next-in-plan">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <h2 id="next-in-plan" className="text-xl font-semibold tracking-tight">
              {t("today.more")}
            </h2>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/30 p-1 text-sm text-muted-foreground">
              <Link
                to="/app/plan"
                search={{ view: "list" }}
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 hover:bg-card hover:text-primary"
              >
                <ListBullets size={17} />
                {t("plan.list")}
              </Link>
              <Link
                to="/app/plan"
                search={{ view: "calendar" }}
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 hover:bg-card hover:text-primary"
              >
                <CalendarBlank size={17} />
                {t("plan.calendar")}
              </Link>
            </div>
          </div>
          {work.scheduled.slice(1, 4).map((asset) => (
            <Link
              key={asset.id}
              to="/app/editor"
              search={{ id: asset.id }}
              className="milo-next-row group"
            >
              <span className="text-sm text-muted-foreground">
                {date(asset.scheduledPublishAt!, { day: "numeric", month: "short" })}
              </span>
              {contentCover(asset) ? (
                <img src={contentCover(asset)} alt="" />
              ) : (
                <FileText size={28} className="text-muted-foreground max-md:hidden" />
              )}
              <span className="min-w-0">
                <strong className="block text-sm font-medium group-hover:text-primary">
                  {asset.title}
                </strong>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {languageName(asset.language ?? projectContentLanguage(active))} ·{" "}
                  {date(asset.scheduledPublishAt!, { hour: "2-digit", minute: "2-digit" })}
                </span>
              </span>
              <span className="milo-next-status">
                <StageChip stage="armed" />
              </span>
              <CaretRight size={17} className="text-muted-foreground" />
            </Link>
          ))}
          <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-border py-5 text-sm text-muted-foreground">
            <Link
              to="/app/plan"
              search={{ view: "calendar" }}
              className="inline-flex items-center gap-2 hover:text-primary"
            >
              <CalendarBlank size={17} />
              <strong className="text-foreground">{work.scheduled.length}</strong>
              {t("today.scheduled")}
            </Link>
            <Link to="/app/editor" className="inline-flex items-center gap-2 hover:text-primary">
              <CheckCircle size={17} />
              <strong className="text-foreground">{work.published}</strong>
              {t("today.published")}
            </Link>
          </div>
        </section>
        <section className="mt-4 rounded-xl border border-border bg-card p-5 md:p-6">
          <h2 className="text-base font-semibold">{t("today.attention")}</h2>
          {pending.length > 0 && (
            <Link
              to="/app/actions"
              className="mt-4 flex items-center justify-between gap-4 border-t border-border pt-4 text-sm"
            >
              <span>
                {t("today.proposals")} <strong>({pending.length})</strong>
              </span>
              <ArrowRight size={18} />
            </Link>
          )}
          {suggestions.length > 0 && (
            <Link
              to="/app/plan"
              search={{ view: "discover" }}
              className="mt-4 flex items-center justify-between gap-4 border-t border-border pt-4 text-sm"
            >
              <span>
                {t("today.suggestions")} <strong>({suggestions.length})</strong>
              </span>
              <ArrowRight size={18} />
            </Link>
          )}
          {tasks.map(({ item, stage, actionKey }) => (
            <Link
              key={item.id}
              to="/app/plan"
              search={{ selected: item.id }}
              className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4"
            >
              <span className="min-w-0 flex-1 text-sm font-medium">{item.title}</span>
              <StageChip stage={stage} />
              <span className="text-xs text-primary">{t(actionKey)}</span>
              <CaretRight size={16} />
            </Link>
          ))}
          {!tasks.length && !pending.length && !suggestions.length && (
            <p className="mt-3 text-sm text-muted-foreground">{t("today.allDone")}</p>
          )}
        </section>
        <details className="mt-6 rounded-xl border border-border bg-card p-5">
          <summary className="cursor-pointer text-sm font-medium">{t("today.details")}</summary>
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            <div>
              <Link to="/app/launch-checklist" className="text-sm font-medium text-primary">
                {t("today.setup")}
                <ArrowRight className="ml-2 inline" size={16} />
              </Link>
              <p className="mt-2 text-sm text-muted-foreground">
                {checklist.progress.requiredDone} / {checklist.progress.requiredTotal} ·{" "}
                {checklist.progress.percent}%
              </p>
              <Link to="/app/analytics" className="mt-4 inline-block text-sm text-primary">
                {t("shell.nav.insights")}
              </Link>
            </div>
            <div>
              <h3 className="text-sm font-medium">{t("today.activity")}</h3>
              {recent.map((asset) => (
                <Link
                  key={asset.id}
                  to="/app/editor"
                  search={{ id: asset.id }}
                  className="mt-3 block text-sm"
                >
                  <span>{asset.title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {date(asset.updatedAt, { day: "numeric", month: "short" })}
                  </span>
                </Link>
              ))}
              {!recent.length && (
                <p className="mt-3 text-sm text-muted-foreground">{t("today.noActivity")}</p>
              )}
            </div>
          </div>
        </details>
      </div>
    </AppShell>
  );
}
