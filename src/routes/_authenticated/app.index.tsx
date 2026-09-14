import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { MiloConversationWorkspace } from "@/components/MiloConversationWorkspace";
import { useAuth } from "@/lib/auth";
import { setActiveProject, useStore } from "@/lib/store";
import { useT } from "@/i18n";
import { listMyProjectTeamsFn } from "@/lib/project-team.functions";
import { runTeamRequest } from "@/lib/team-request-queue";
import { referenceDestination, type MiloProject } from "@/lib/milo-conversation.ui";
import {
  miloHomeSearch,
  miloConversationHref,
  rememberedMiloConversation,
  rememberMiloConversation,
  forgetMiloConversation,
} from "@/lib/milo-conversation-location";

export const Route = createFileRoute("/_authenticated/app/")({
  validateSearch: miloHomeSearch,
  head: () => ({
    meta: [
      { title: "Milo — Milo Growth" },
      {
        name: "description",
        content: "One project conversation with Milo and your AI specialists.",
      },
    ],
  }),
  component: MiloHome,
  errorComponent: MiloConversationError,
});
function MiloConversationError() {
  const t = useT();
  return (
    <div className="mx-auto max-w-xl space-y-4 p-6" role="alert">
      <p>{t("chat.unavailable")}</p>
      <Button variant="outline" asChild>
        <Link to="/app" search={{}}>
          {t("chat.history")}
        </Link>
      </Button>
    </div>
  );
}
function MiloHome() {
  const { user } = useAuth(),
    t = useT(),
    navigate = useNavigate(),
    router = useRouter();
  const projects = useStore((s) => s.projects),
    active = useStore((s) => s.activeProjectId);
  const search = Route.useSearch();
  const shared = useQuery({
    queryKey: ["project-teams", user?.id, "mine"],
    queryFn: ({ signal }) => runTeamRequest(() => listMyProjectTeamsFn({ data: {} }), signal),
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchInterval: 30000,
  });
  const owned: MiloProject[] = user
    ? projects.map((project) => ({ ownerId: user.id, projectId: project.id, name: project.name }))
    : [];
  const assigned: MiloProject[] = shared.isError
    ? []
    : (shared.data?.projects ?? []).map((project) => ({
        ownerId: project.ownerId,
        projectId: project.projectId,
        name: project.name,
      }));
  // Working collaborators (editor/reviewer) may consent to owner-quota site checks; viewers may not.
  const workingAccess = new Set(
    (shared.isError ? [] : (shared.data?.projects ?? []))
      .filter((project) => project.role === "editor" || project.role === "reviewer")
      .map((project) => `${project.ownerId}:${project.projectId}`),
  );
  const choices = [...owned, ...assigned];
  const chosen = search.owner
    ? choices.find((item) => item.ownerId === search.owner && item.projectId === search.project)
    : (owned.find((item) => item.projectId === active) ?? owned[0] ?? assigned[0]);
  const value = (item: MiloProject) => JSON.stringify([item.ownerId, item.projectId]);
  const ownerId = chosen?.ownerId,
    projectId = chosen?.projectId,
    actorId = user?.id;
  const onConversationLocation = useCallback(
    (conversation: string, replace: boolean) => {
      if (!ownerId || !projectId) return;
      const current = router.state.location;
      const currentSearch = current.search as {
        owner?: string;
        project?: string;
        conversation?: string;
      };
      // A delayed observation from a departing client/conversation cannot undo
      // a newer navigation. Ordinary explicit clicks still create history entries.
      if (
        !["/app", "/app/"].includes(current.pathname) ||
        (currentSearch.owner &&
          (currentSearch.owner !== ownerId || currentSearch.project !== projectId)) ||
        currentSearch.conversation !== search.conversation ||
        (currentSearch.owner === ownerId &&
          currentSearch.project === projectId &&
          currentSearch.conversation === conversation)
      )
        return;
      if (conversation === "new" && actorId)
        forgetMiloConversation(actorId, { ownerId, projectId });
      void navigate({
        to: "/app",
        search: { owner: ownerId, project: projectId, conversation },
        replace,
        resetScroll: false,
      });
    },
    [actorId, ownerId, projectId, navigate, router, search.conversation],
  );
  const onConfirmedConversation = useCallback(
    (conversationId: string) => {
      if (actorId && ownerId && projectId)
        rememberMiloConversation(actorId, { ownerId, projectId }, conversationId);
    },
    [actorId, ownerId, projectId],
  );
  useEffect(() => {
    if (chosen?.ownerId === user?.id && chosen && active !== chosen.projectId)
      setActiveProject(chosen.projectId);
  }, [chosen, user?.id, active]);
  return (
    <AppShell
      title={t("chat.title")}
      description={t("chat.description")}
      eyebrow={chosen?.name ?? t("chat.chooseProject")}
      projectContextName={chosen?.name ?? t("chat.chooseProject")}
      sharedProject={
        chosen && chosen.ownerId !== user?.id
          ? { ownerId: chosen.ownerId, projectId: chosen.projectId }
          : undefined
      }
      projectPicker={
        <p className="my-4 break-words rounded-lg bg-white/10 p-3 text-sm">
          {chosen?.name ?? t("chat.chooseProject")}
        </p>
      }
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="flex min-w-0 max-w-xl flex-1 flex-col gap-2 text-sm font-medium">
            {t("chat.chooseProject")}
            <select
              className="min-w-0 w-full rounded-xl border bg-card p-3 font-normal"
              value={chosen ? value(chosen) : ""}
              onChange={(event) => {
                const next = choices.find((item) => value(item) === event.target.value);
                if (next)
                  void navigate({
                    to: "/app",
                    search: { owner: next.ownerId, project: next.projectId },
                  });
              }}
            >
              {!chosen && <option value="">{t("chat.chooseProject")}</option>}
              <optgroup label={t("chat.ownProjects")}>
                {owned.map((item) => (
                  <option key={value(item)} value={value(item)}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t("collaboration.shared")}>
                {assigned.map((item) => (
                  <option key={value(item)} value={value(item)}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <Button variant="outline" asChild>
            <Link
              to="/app/collaborators"
              search={chosen ? { owner: chosen.ownerId, project: chosen.projectId } : {}}
            >
              {t("collaboration.title")}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/app/conversations">{t("chat.account.manage")}</Link>
          </Button>
        </div>
        {shared.isPending && <p role="status">{t("collaboration.loading")}</p>}
        {shared.isError && (
          <div className="flex flex-wrap items-center gap-3" role="alert">
            <p>{t("collaboration.error")}</p>
            <Button
              variant="outline"
              disabled={shared.isFetching}
              onClick={() => void shared.refetch()}
            >
              {t("collaboration.refresh")}
            </Button>
          </div>
        )}
        {chosen && user ? (
          <MiloConversationWorkspace
            key={`${user.id}:${chosen.ownerId}:${chosen.projectId}`}
            actorId={user.id}
            project={chosen}
            canConsentChecks={
              chosen.ownerId === user.id ||
              workingAccess.has(`${chosen.ownerId}:${chosen.projectId}`)
            }
            location={
              search.conversation ??
              rememberedMiloConversation(user.id, {
                ownerId: chosen.ownerId,
                projectId: chosen.projectId,
              })
            }
            onLocationChange={onConversationLocation}
            onConfirmedConversation={onConfirmedConversation}
            conversationHref={(id) => miloConversationHref(chosen, id)}
            onOpenResult={(event) => {
              const destination = referenceDestination(chosen, user.id, event);
              if (!destination) return;
              if (chosen.ownerId === user.id) setActiveProject(chosen.projectId);
              void navigate(destination);
            }}
          />
        ) : (
          !shared.isPending && (
            <div className="rounded-2xl border bg-card p-6">
              <p className="mb-4">{t(search.owner ? "chat.unavailable" : "team.selectProject")}</p>
              <Button asChild>
                <Link to="/app/setup" search={{ new: true }}>
                  {t("today.create")}
                </Link>
              </Button>
            </div>
          )
        )}
      </div>
    </AppShell>
  );
}
