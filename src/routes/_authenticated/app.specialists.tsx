import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { SpecialistPortrait } from "@/components/SpecialistPortrait";
import { ProjectKnowledgePanel } from "@/components/ProjectKnowledgePanel";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useT, useAppLanguage } from "@/i18n";
import { readWeeklyPreparationFn } from "@/lib/weekly-preparation.functions";
import { readProjectKnowledgeFn } from "@/lib/project-knowledge.functions";
import { localWeekStart } from "@/lib/weekly-preparation";
import { normalizeAutoSchedulerConfig } from "@/lib/auto-scheduler";
import {
  specialistRoles,
  stageRoleEvidence,
  schedulerRoleLabel,
  type SpecialistRole,
} from "@/lib/specialist-team";
import type { Project } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/app/specialists")({
  validateSearch: z.object({ knowledge: z.boolean().optional() }),
  head: () => ({ meta: [{ title: "Milo’s team — Milo Growth" }] }),
  component: TeamPage,
});
function TeamPage() {
  const t = useT(),
    { user } = useAuth();
  const project = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const { knowledge } = Route.useSearch();
  return (
    <AppShell title={t("team.title")} description={t("team.help")}>
      {project && user ? (
        <TeamProject
          key={`${user.id}:${project.id}`}
          project={project}
          ownerId={user.id}
          showKnowledge={!!knowledge}
        />
      ) : (
        <p>{t("team.selectProject")}</p>
      )}
    </AppShell>
  );
}
const destinations = {
  lead: "/app/setup",
  brand: "/app/setup",
  research: "/app/opportunities",
  content: "/app/editor",
  image: "/app/editor",
  seo: "/app/audit",
  authority: "/app/backlinks",
  ai: "/app/ai-visibility",
  performance: "/app/report",
} as const;
function TeamProject({
  project,
  ownerId,
  showKnowledge,
}: {
  project: Project;
  ownerId: string;
  showKnowledge: boolean;
}) {
  const t = useT(),
    locale = useAppLanguage();
  const config = normalizeAutoSchedulerConfig(project.autoScheduler);
  const [week, setWeek] = useState(() => localWeekStart(new Date(), config.timeZone));
  const [memoryOpen, setMemoryOpen] = useState(showKnowledge);
  const reportQuery = useQuery({
    queryKey: ["specialist-week", ownerId, project.id, week],
    queryFn: () => readWeeklyPreparationFn({ data: { projectId: project.id, weekStart: week } }),
    staleTime: 0,
    refetchInterval: 30000,
  });
  const knowledgeQuery = useQuery({
    queryKey: ["specialist-knowledge", ownerId, project.id],
    queryFn: () => readProjectKnowledgeFn({ data: { projectId: project.id } }),
    staleTime: 0,
  });
  // A failed refresh never keeps showing a stale Running/Retained badge.
  const report = reportQuery.isError ? undefined : reportQuery.data;
  const knowledge = knowledgeQuery.isError ? undefined : knowledgeQuery.data;
  const date = (value: string) =>
    Number.isFinite(Date.parse(value))
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: config.timeZone,
        }).format(new Date(value))
      : t("team.state.unavailable");
  const shift = (days: number) =>
    setWeek(new Date(Date.parse(week + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10));
  function savedEvidence(role: SpecialistRole) {
    if (role === "lead") return t(schedulerRoleLabel(report));
    if (role === "brand")
      return knowledge
        ? t("team.records", { count: knowledge.records.length })
        : t("team.state.unavailable");
    if (role === "seo")
      return !report
        ? t("team.state.unavailable")
        : report.specialistEvidence.audit
          ? `${t(report.specialistEvidence.audit.fetchedWebsite ? "team.auditFetched" : "team.auditPartial")} · ${date(report.specialistEvidence.audit.createdAt)}`
          : t("team.state.none");
    if (role === "ai")
      return !report
        ? t("team.state.unavailable")
        : report.specialistEvidence.advice
          ? `${t("team.adviceSaved")} · ${date(report.specialistEvidence.advice.createdAt)}`
          : t("team.state.none");
    if (role === "performance")
      return !report
        ? t("team.state.unavailable")
        : report.specialistEvidence.gscImportCount
          ? t("team.imports", { count: report.specialistEvidence.gscImportCount })
          : t("team.measurementMissing");
    return t("team.authorityPrerequisite");
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center">
        <span className="font-medium">
          {project.name} · {config.timeZone}
        </span>
        <Button variant="outline" onClick={() => shift(-7)}>
          {t("weekly.previous")}
        </Button>
        <span>{week}</span>
        <Button variant="outline" onClick={() => shift(7)}>
          {t("weekly.next")}
        </Button>
        <Button
          variant="ghost"
          disabled={reportQuery.isFetching || knowledgeQuery.isFetching}
          onClick={() => {
            void reportQuery.refetch();
            void knowledgeQuery.refetch();
          }}
        >
          {t("weekly.refresh")}
        </Button>
      </div>
      {reportQuery.isPending && <p role="status">{t("weekly.loading")}</p>}
      {reportQuery.isError && <p role="alert">{t("weekly.unavailable")}</p>}
      <p className="text-sm text-muted-foreground">{t("team.scope")}</p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {specialistRoles.map((role) => {
          const evidence =
            role === "research" || role === "content" || role === "image"
              ? stageRoleEvidence(report?.stages, role)
              : null;
          return (
            <article
              key={role}
              className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4"
            >
              <div className="flex gap-3 items-center">
                <SpecialistPortrait role={role} />
                <div>
                  <p className="text-xs text-muted-foreground">{t("team.aiRole")}</p>
                  <h2 className="font-display text-lg">{t(`team.role.${role}`)}</h2>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{t(`team.description.${role}`)}</p>
              <p className="text-sm font-medium">
                {evidence ? t(`team.state.${evidence.status}`) : savedEvidence(role)}
              </p>
              {evidence?.lastDeliveredAt && (
                <p className="text-xs text-muted-foreground">
                  {t("team.lastDelivery")}: {date(evidence.lastDeliveredAt)}
                </p>
              )}
              {!!evidence?.jobs.length && (
                <ul className="text-sm space-y-2">
                  {evidence.jobs.map((job) => {
                    const saved = job.asset;
                    return (
                      <li key={job.requestId}>
                        {date(job.publishAt)} · {t(`weekly.stageState.${job.state}`)}
                        {job.outputChanged ? ` · ${t("weekly.outputChanged")}` : ""}
                        {saved && (
                          // A document navigation reruns authenticated workspace hydration.
                          // SPA navigation alone cannot open newly retained server assets.
                          <a
                            className="block underline"
                            href={`/app/editor?id=${encodeURIComponent(saved.id)}`}
                          >
                            {saved.title}
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="mt-auto pt-2">
                {role === "brand" ? (
                  <Button variant="outline" onClick={() => setMemoryOpen((v) => !v)}>
                    {t("team.lesson.manage")}
                  </Button>
                ) : (
                  <Button asChild variant="outline">
                    <a href={destinations[role]}>{t(`team.open.${role}`)}</a>
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {memoryOpen && (
        <ProjectKnowledgePanel
          key={`${ownerId}:${project.id}`}
          ownerId={ownerId}
          projectId={project.id}
          onKnowledgeChange={() => {
            void knowledgeQuery.refetch();
          }}
        />
      )}
    </div>
  );
}
