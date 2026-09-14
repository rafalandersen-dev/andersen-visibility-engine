import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { GenerationResultsPanel } from "@/components/GenerationResultsPanel";
import { useT } from "@/i18n";
import { setActiveProject, useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
export const Route = createFileRoute("/_authenticated/app/generations")({
  validateSearch: z.object({
    receipt: z.string().uuid().optional(),
    project: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,64}$/)
      .optional(),
  }),
  head: () => ({ meta: [{ title: "Recent generations — Milo Growth" }] }),
  component: GenerationResultsPage,
});
function GenerationResultsPage() {
  const t = useT(),
    { user } = useAuth(),
    projectId = useStore((s) => s.activeProjectId);
  const [all, setAll] = useState(false);
  const search = Route.useSearch();
  const scope = all ? undefined : (search.project ?? projectId ?? undefined);
  const scopeName = useStore((s) => s.projects.find((p) => p.id === scope)?.name);
  useEffect(() => {
    if (search.project && scopeName && projectId !== search.project)
      setActiveProject(search.project);
  }, [search.project, scopeName, projectId]);
  return (
    <AppShell
      title={t("generationResults.title")}
      description={t("generationResults.description")}
      eyebrow={
        all
          ? t("generationResults.allProjects")
          : (scopeName ?? (search.project ? t("chat.unavailable") : undefined))
      }
      projectContextName={search.project && !all ? (scopeName ?? t("chat.unavailable")) : undefined}
      projectPicker={
        search.project && !all ? (
          <p className="my-4 break-words rounded-lg bg-white/10 p-3 text-sm">
            {scopeName ?? t("chat.unavailable")}
          </p>
        ) : undefined
      }
    >
      <label className="mb-5 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
        {t("generationResults.allProjects")}
      </label>
      {user ? (
        <GenerationResultsPanel
          key={`${user.id}:${scope ?? "all"}`}
          userId={user.id}
          projectId={scope}
          initialReceiptId={search.receipt}
        />
      ) : null}
    </AppShell>
  );
}
