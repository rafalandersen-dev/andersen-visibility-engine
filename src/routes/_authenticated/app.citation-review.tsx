import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { CitationReviewPanel } from "@/components/CitationReviewPanel";
import { CitationPanelProtocolPanel } from "@/components/CitationPanelProtocolPanel";
import { CitationBusinessFactsPanel } from "@/components/CitationBusinessFactsPanel";
import { CitationFindingAuthor } from "@/components/CitationFindingAuthor";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { useT } from "@/i18n";
import { reviewerLinkContext } from "@/lib/citation-review-ui";

export const Route = createFileRoute("/_authenticated/app/citation-review")({
  // A reviewer opens a specific assigned finding via an owner-shared deep link carrying the FULL owner +
  // project + finding context (the reviewer need not own a project). With no params the owner manages their
  // own active project. A partial/malformed reviewer link is rejected — never a silent fallback to the
  // reviewer's own project. (A reviewer self-discovery inbox awaits a later additive endpoint — see
  // evidence/citation-review-ui-2026-09-21.md.)
  validateSearch: z.object({
    owner: z.string().optional(),
    project: z.string().optional(),
    finding: z.string().optional(),
  }),
  head: () => ({ meta: [{ title: "Citation review — Milo Growth" }] }),
  component: CitationReviewRoute,
});

function CitationReviewRoute() {
  const t = useT();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const link = reviewerLinkContext(search);
  const activeProject = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const { user } = useAuth();

  // Reviewer mode: use the OWNER's project id from the validated link, not the reviewer's own project.
  if (link.mode === "reviewer") {
    return (
      <AppShell title={t("citationReview.title")} description={t("citationReview.subtitle")}>
        <CitationReviewPanel
          projectId={link.context.projectId}
          reviewerContext={{
            ownerId: link.context.ownerId,
            findingRowId: link.context.findingRowId,
          }}
        />
      </AppShell>
    );
  }

  if (link.mode === "invalid") {
    return (
      <AppShell title={t("citationReview.title")} description={t("citationReview.subtitle")}>
        <div className="rounded-lg border border-dashed border-destructive/40 p-8 text-center text-sm text-destructive">
          {t("citationReview.link.invalid")}
        </div>
      </AppShell>
    );
  }

  // Owner mode: manage the current active project's findings + assignments.
  if (!activeProject) {
    return (
      <AppShell title={t("citationReview.title")} description={t("citationReview.subtitle")}>
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <div className="font-display text-lg">{t("analytics.setupFirst")}</div>
          <Button className="mt-4" onClick={() => navigate({ to: "/app/setup" })}>
            {t("nav.setup")}
          </Button>
        </div>
      </AppShell>
    );
  }
  // Owner authoring stage (26 September 2026): panel draft/lock, dated facts and finding authoring sit above
  // the released findings list + grant flow, all on the owner's own project and identity. The subtree is KEYED
  // by owner+project: the AppShell project picker swaps the active project in place (no route change), so a
  // switch remounts every authoring form — a draft, a reviewed payload or a pending save started under project A
  // is never displayed or submitted under project B (each form additionally binds its own state to the identity).
  return (
    <AppShell title={t("citationReview.title")} description={t("citationReview.subtitle")}>
      {user ? (
        <div className="space-y-6 mb-6" key={`${user.id}:${activeProject.id}`}>
          <CitationPanelProtocolPanel
            projectId={activeProject.id}
            ownerId={user.id}
            seed={{
              clientName: activeProject.businessName || activeProject.name,
              market: activeProject.market ?? activeProject.mainLocation ?? "",
              language: activeProject.appLanguage ?? "en",
            }}
          />
          <CitationBusinessFactsPanel projectId={activeProject.id} ownerId={user.id} />
          <CitationFindingAuthor projectId={activeProject.id} ownerId={user.id} />
        </div>
      ) : null}
      <CitationReviewPanel projectId={activeProject.id} />
    </AppShell>
  );
}
