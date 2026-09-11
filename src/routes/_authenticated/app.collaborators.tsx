import { ProjectTeamDraftEditor } from "@/components/ProjectTeamDraftEditor";
import { ProjectTeamComments } from "@/components/ProjectTeamComments";
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { useT, useAppLanguage } from "@/i18n";
import {
  acceptProjectTeamFn,
  listMyProjectTeamsFn,
  readProjectTeamRosterFn,
  readTeamProjectFn,
  updateProjectTeamFn,
} from "@/lib/project-team.functions";
import { teamAcceptInput, teamOwnerAction, teamRole, teamRoster } from "@/lib/project-team";
import { toast } from "sonner";
export const Route = createFileRoute("/_authenticated/app/collaborators")({
  component: CollaboratorsPage,
});
type Role = z.infer<typeof teamRole>;
const box = "rounded-2xl border bg-card p-5 space-y-4";
function RolePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: Role;
  onChange: (v: Role) => void;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <label className="flex flex-col gap-1 text-sm">
      {t("collaboration.role")}
      <select
        className="rounded-md border bg-background p-2"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(teamRole.parse(e.target.value))}
      >
        {teamRole.options.map((role) => (
          <option key={role} value={role}>
            {t(`collaboration.${role}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
function CollaboratorsPage() {
  const t = useT();
  const { user } = useAuth();
  const projects = useStore((s) => s.projects);
  const active = useStore((s) => s.activeProjectId);
  const [chosen, setChosen] = useState<string | null>(null);
  const projectId = chosen ?? active ?? projects[0]?.id;
  const [shared, setShared] = useState<{ ownerId: string; projectId: string } | null>(null);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["project-teams", user?.id, "mine"],
    queryFn: () => listMyProjectTeamsFn({ data: {} }),
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 30000,
  });
  const accept = useMutation({
    mutationFn: (data: z.infer<typeof teamAcceptInput>) => acceptProjectTeamFn({ data }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["project-teams", user?.id] }),
    onError: () => toast.error(t("collaboration.error")),
  });
  return (
    <AppShell
      title={t("collaboration.title")}
      description={t("collaboration.subtitle")}
      actions={
        <Button
          variant="outline"
          onClick={() => void client.invalidateQueries({ queryKey: ["project-teams", user?.id] })}
        >
          {t("collaboration.refresh")}
        </Button>
      }
    >
      <div className="mx-auto max-w-5xl space-y-6">
        <section className={box}>
          <h2 className="text-lg font-semibold">{t("collaboration.owned")}</h2>
          {projectId && user && (
            <Button variant="outline" onClick={() => setShared({ ownerId: user.id, projectId })}>
              {t("collaboration.open")}
            </Button>
          )}
          {projects.length ? (
            <>
              <select
                aria-label={t("collaboration.owned")}
                className="w-full rounded-md border bg-background p-2"
                value={projectId ?? ""}
                onChange={(e) => setChosen(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {projectId && <OwnerTeam key={`${user?.id}:${projectId}`} projectId={projectId} />}
            </>
          ) : (
            <p>{t("collaboration.noOwned")}</p>
          )}
        </section>
        {query.isPending && <p role="status">{t("collaboration.loading")}</p>}
        {query.isError && <p role="alert">{t("collaboration.error")}</p>}
        {query.data && !query.isError && (
          <>
            <section className={box}>
              <h2 className="text-lg font-semibold">{t("collaboration.invitations")}</h2>
              {!query.data.invitations.length && <p>{t("collaboration.empty")}</p>}
              {query.data.invitations.map((i) => (
                <article
                  key={`${i.ownerId}:${i.inviteId}`}
                  className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"
                >
                  <div>
                    <p className="font-medium">{i.name}</p>
                    <p className="text-sm">{t(`collaboration.${i.role}`)}</p>
                  </div>
                  <Button
                    disabled={accept.isPending}
                    onClick={() =>
                      accept.mutate({
                        ownerId: i.ownerId,
                        projectId: i.projectId,
                        inviteId: i.inviteId,
                      })
                    }
                  >
                    {t("collaboration.accept")}
                  </Button>
                </article>
              ))}
            </section>
            <section className={box}>
              <h2 className="text-lg font-semibold">{t("collaboration.shared")}</h2>
              {!query.data.projects.length && <p>{t("collaboration.empty")}</p>}
              {query.data.projects.map((p) => (
                <article
                  key={`${p.ownerId}:${p.projectId}`}
                  className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"
                >
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-sm">{t(`collaboration.${p.role}`)}</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setShared({ ownerId: p.ownerId, projectId: p.projectId })}
                  >
                    {t("collaboration.open")}
                  </Button>
                </article>
              ))}
            </section>
          </>
        )}
        {shared && (
          <SharedProject
            key={`${user?.id}:${shared.ownerId}:${shared.projectId}`}
            target={shared}
          />
        )}
      </div>
    </AppShell>
  );
}
function OwnerTeam({ projectId }: { projectId: string }) {
  const t = useT();
  const locale = useAppLanguage();
  const { user } = useAuth();
  const client = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const query = useQuery({
    queryKey: ["project-teams", user?.id, "roster", projectId],
    queryFn: () => readProjectTeamRosterFn({ data: { projectId } }),
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
  });
  const mutation = useMutation({
    mutationFn: (data: z.infer<typeof teamOwnerAction>) => updateProjectTeamFn({ data }),
    onSuccess: () => {
      toast.success(t("collaboration.saved"));
      void client.invalidateQueries({ queryKey: ["project-teams", user?.id] });
    },
    onError: () => {
      toast.error(t("collaboration.error"));
      void client.invalidateQueries({ queryKey: ["project-teams", user?.id] });
    },
  });
  if (query.isPending) return <p role="status">{t("collaboration.loading")}</p>;
  if (query.isError || !query.data) return <p role="alert">{t("collaboration.error")}</p>;
  return (
    <div className="space-y-5">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate({
            action: "invite",
            projectId,
            inviteId: crypto.randomUUID(),
            email: email.trim(),
            role,
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            {t("collaboration.email")}
            <input
              type="email"
              required
              maxLength={254}
              className="rounded-md border bg-background p-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={mutation.isPending}
            />
          </label>
          <RolePicker value={role} onChange={setRole} disabled={mutation.isPending} />
        </div>
        <p className="text-sm text-muted-foreground">{t("collaboration.inviteHelp")}</p>
        <Button disabled={mutation.isPending} type="submit">
          {t("collaboration.invite")}
        </Button>
      </form>
      <h3 className="font-semibold">{t("collaboration.members")}</h3>
      {!query.data.members.length && <p>{t("collaboration.empty")}</p>}
      {query.data.members.map((member) => (
        <MemberRow
          key={`${member.actorId}:${member.revision}`}
          member={member}
          disabled={mutation.isPending}
          change={(next, remove) =>
            mutation.mutate(
              remove
                ? {
                    action: "remove",
                    projectId,
                    memberId: member.actorId,
                    expectedRevision: member.revision,
                  }
                : {
                    action: "role",
                    projectId,
                    memberId: member.actorId,
                    expectedRevision: member.revision,
                    role: next,
                  },
            )
          }
        />
      ))}
      <h3 className="font-semibold">{t("collaboration.pending")}</h3>
      {!query.data.invitations.length && <p>{t("collaboration.empty")}</p>}
      {query.data.invitations.map((i) => (
        <article
          key={i.inviteId}
          className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"
        >
          <div className="min-w-0 break-words">
            <p>{i.email}</p>
            <p className="text-sm text-muted-foreground">
              {t(`collaboration.${i.role}`)} ·{" "}
              {t(`collaboration.${i.state === "pending" ? "pendingState" : i.state}`)} ·{" "}
              {t("collaboration.expires")} {new Date(i.expiresAt).toLocaleDateString(locale)}
            </p>
          </div>
          {i.state === "pending" && (
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ action: "revoke", projectId, inviteId: i.inviteId })}
            >
              {t("collaboration.revoke")}
            </Button>
          )}
        </article>
      ))}
    </div>
  );
}
function MemberRow({
  member,
  disabled,
  change,
}: {
  member: z.infer<typeof teamRoster>["members"][number];
  disabled: boolean;
  change: (role: Role, remove: boolean) => void;
}) {
  const t = useT();
  const [role, setRole] = useState<Role>(member.role);
  return (
    <article className="flex flex-wrap items-end gap-3 border-t pt-3">
      <p className="min-w-0 flex-1 break-words py-2">{member.email ?? member.actorId}</p>
      {member.active ? (
        <>
          <RolePicker value={role} onChange={setRole} disabled={disabled} />
          <Button
            variant="outline"
            disabled={disabled || role === member.role}
            onClick={() => change(role, false)}
          >
            {t("collaboration.saveRole")}
          </Button>
          <Button variant="outline" disabled={disabled} onClick={() => change(role, true)}>
            {t("collaboration.remove")}
          </Button>
        </>
      ) : (
        <p>{t("collaboration.removed")}</p>
      )}
    </article>
  );
}
function SharedProject({ target }: { target: { ownerId: string; projectId: string } }) {
  const t = useT();
  const { user } = useAuth();
  const [assetId, setAssetId] = useState<string | undefined>();
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: [
      "project-teams",
      user?.id,
      "content",
      target.ownerId,
      target.projectId,
      assetId,
      offset,
    ],
    queryFn: () =>
      readTeamProjectFn({ data: { ...target, assetId, offset: assetId ? 0 : offset } }),
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 30000,
  });
  return (
    <section className={box}>
      <h2 className="text-lg font-semibold">{t("collaboration.drafts")}</h2>
      {query.isPending && <p role="status">{t("collaboration.loading")}</p>}
      {query.isError && <p role="alert">{t("collaboration.error")}</p>}
      {query.data && (
        <div hidden={query.isError}>
          <p className="font-medium">{query.data.project.name}</p>
          {query.data.draft ? (
            <>
              <Button variant="outline" onClick={() => setAssetId(undefined)}>
                {t("collaboration.back")}
              </Button>
              <h3 className="text-xl font-semibold">{query.data.draft.title}</h3>
              <pre className="whitespace-pre-wrap break-words font-sans">
                {query.data.draft.markdown}
              </pre>
              {query.data.canEdit && query.data.draftHash && (
                <ProjectTeamDraftEditor
                  ownerId={target.ownerId}
                  projectId={target.projectId}
                  assetId={query.data.draft.id}
                  hash={query.data.draftHash}
                  membershipRevision={query.data.membershipRevision}
                  fields={{
                    title: query.data.draft.title,
                    markdown: query.data.draft.markdown,
                    h1: query.data.draft.h1,
                    metaTitle: query.data.draft.metaTitle,
                    metaDescription: query.data.draft.metaDescription,
                    cta: query.data.draft.cta,
                    outline: query.data.draft.outline,
                    faq: query.data.draft.faq,
                  }}
                />
              )}
              <ProjectTeamComments
                key={query.data.draft.id}
                ownerId={target.ownerId}
                projectId={target.projectId}
                assetId={query.data.draft.id}
                revision={query.data.workspaceRevision}
              />
            </>
          ) : (
            <>
              {!query.data.drafts.length && <p>{t("collaboration.empty")}</p>}
              {query.data.drafts.map((d) => (
                <Button
                  className="block h-auto max-w-full whitespace-normal text-left"
                  variant="outline"
                  key={d.id}
                  onClick={() => setAssetId(d.id)}
                >
                  {d.title}
                </Button>
              ))}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - 100))}
                >
                  {t("collaboration.previous")}
                </Button>
                <Button
                  variant="outline"
                  disabled={!query.data.remaining}
                  onClick={() => setOffset(offset + 100)}
                >
                  {t("collaboration.next")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
