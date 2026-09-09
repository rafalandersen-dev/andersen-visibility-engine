import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { GenerationResultsPanel } from "@/components/GenerationResultsPanel";
import { useT } from "@/i18n";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
export const Route = createFileRoute("/_authenticated/app/generations")({
  head: () => ({ meta: [{ title: "Recent generations — Milo Growth" }] }),
  component: GenerationResultsPage,
});
function GenerationResultsPage() {
  const t = useT(),
    { user } = useAuth(),
    projectId = useStore((s) => s.activeProjectId);
  const [all, setAll] = useState(false);
  const scope = all || !projectId ? undefined : projectId;
  return (
    <AppShell title={t("generationResults.title")} description={t("generationResults.description")}>
      <label className="mb-5 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
        {t("generationResults.allProjects")}
      </label>
      {user ? (
        <GenerationResultsPanel
          key={`${user.id}:${scope ?? "all"}`}
          userId={user.id}
          projectId={scope}
        />
      ) : null}
    </AppShell>
  );
}
