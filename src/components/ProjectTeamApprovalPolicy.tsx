import { runTeamRequest } from "@/lib/team-request-queue";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useT } from "@/i18n";
import { teamPolicyMode } from "@/lib/project-team";
import { readOwnerTeamPolicyFn, changeOwnerTeamPolicyFn } from "@/lib/project-team.functions";
import { Button } from "./ui/button";
import { toast } from "sonner";
export function ProjectTeamApprovalPolicy({ projectId }: { projectId: string }) {
  const t = useT();
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["project-teams", user?.id, "policy", projectId],
    queryFn: ({ signal }) =>
      runTeamRequest(() => readOwnerTeamPolicyFn({ data: { projectId } }), signal),
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
  });
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h3 className="font-semibold">{t("collaboration.policyTitle")}</h3>
      <p className="text-sm text-muted-foreground">{t("collaboration.policyHelp")}</p>
      {query.isPending && <p role="status">{t("collaboration.loading")}</p>}
      {query.isError && <p role="alert">{t("collaboration.error")}</p>}
      {query.data && !query.isError && (
        <PolicyForm
          key={`${projectId}:${query.data.revision}`}
          projectId={projectId}
          mode={query.data.mode}
          revision={query.data.revision}
        />
      )}
    </section>
  );
}
function PolicyForm({
  projectId,
  mode,
  revision,
}: {
  projectId: string;
  mode: string | null;
  revision: number;
}) {
  const t = useT();
  const { user } = useAuth();
  const client = useQueryClient();
  const [chosen, setChosen] = useState(mode ?? "");
  const mutation = useMutation({
    mutationFn: () =>
      changeOwnerTeamPolicyFn({
        data: { projectId, expectedRevision: revision, mode: teamPolicyMode.parse(chosen) },
      }),
    onSuccess: () => {
      toast.success(t("collaboration.saved"));
      void client.invalidateQueries({ queryKey: ["project-teams", user?.id] });
    },
    onError: () => {
      toast.error(t("collaboration.error"));
      void client.invalidateQueries({ queryKey: ["project-teams", user?.id] });
    },
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <label className="block text-sm">
        {t("collaboration.policyTitle")}
        <select
          className="mt-1 w-full rounded-md border bg-background p-2"
          value={chosen}
          disabled={mutation.isPending}
          onChange={(e) => setChosen(e.target.value)}
        >
          <option value="" disabled>
            {t("collaboration.policyUnselected")}
          </option>
          {teamPolicyMode.options.map((value) => (
            <option key={value} value={value}>
              {t(`collaboration.policy.${value}`)}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={!chosen || chosen === mode || mutation.isPending}>
        {t("collaboration.savePolicy")}
      </Button>
    </form>
  );
}
