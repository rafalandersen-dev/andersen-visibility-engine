import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useT, useAppLanguage } from "@/i18n";
import {
  readTeamNotificationHistoryFn,
  readTeamNotificationSettingsFn,
  changeTeamNotificationSettingsFn,
} from "@/lib/project-team-notifications.functions";
import { Button } from "./ui/button";
import { toast } from "sonner";
export function ProjectTeamNotificationSettings({
  ownerId,
  projectId,
  recipientId,
}: {
  ownerId: string;
  projectId: string;
  recipientId: string;
}) {
  const { user } = useAuth(),
    t = useT(),
    client = useQueryClient();
  const target = { ownerId, projectId, recipientId };
  const query = useQuery({
    queryKey: ["project-teams", user?.id, "notification-settings", ownerId, projectId, recipientId],
    queryFn: () => readTeamNotificationSettingsFn({ data: target }),
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
  });
  const locale = useAppLanguage();
  const history = useQuery({
    queryKey: ["project-teams", user?.id, "notification-history", ownerId, projectId, recipientId],
    queryFn: () => readTeamNotificationHistoryFn({ data: target }),
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
  });
  const owner = user?.id === ownerId;
  const mutation = useMutation({
    mutationFn: async () => {
      if (!query.data || query.isError) throw new Error("settings_unavailable");
      return changeTeamNotificationSettingsFn({
        data: {
          ...target,
          action: owner ? "assign" : "opt_in",
          enabled: !(owner ? query.data.assigned : query.data.optedIn),
          expectedRevision: query.data.revision,
          expectedMembershipRevision: query.data.membershipRevision,
        },
      });
    },
    onSuccess: () => {
      toast.success(t("collaboration.saved"));
      void client.invalidateQueries({ queryKey: ["project-teams", user?.id] });
    },
    onError: () => {
      toast.error(t("collaboration.error"));
      void query.refetch();
    },
  });
  return (
    <section className="w-full space-y-2 rounded-lg border p-3 text-sm">
      <h4 className="font-medium">{t("collaboration.notificationSettings")}</h4>
      <p className="text-muted-foreground">{t("collaboration.notificationConsentHelp")}</p>
      {query.isPending && <p role="status">{t("collaboration.loading")}</p>}
      {query.isError && <p role="alert">{t("collaboration.error")}</p>}
      {query.data && !query.isError && (
        <>
          <p>
            {t(
              query.data.assigned
                ? "collaboration.notificationAssigned"
                : "collaboration.notificationNotAssigned",
            )}{" "}
            ·{" "}
            {t(
              query.data.optedIn
                ? "collaboration.notificationOptedIn"
                : "collaboration.notificationOptedOut",
            )}
          </p>
          <Button
            variant="outline"
            disabled={mutation.isPending || query.isFetching}
            onClick={() => mutation.mutate()}
          >
            {t(
              owner
                ? query.data.assigned
                  ? "collaboration.notificationUnassign"
                  : "collaboration.notificationAssign"
                : query.data.optedIn
                  ? "collaboration.notificationOptOut"
                  : "collaboration.notificationOptIn",
            )}
          </Button>
        </>
      )}
      <h4 className="font-medium">{t("collaboration.notificationHistory")}</h4>
      <Button
        variant="outline"
        disabled={history.isFetching}
        onClick={() => void history.refetch()}
      >
        {t("collaboration.refresh")}
      </Button>
      {history.isPending && <p role="status">{t("collaboration.loading")}</p>}
      {history.isError && <p role="alert">{t("collaboration.error")}</p>}
      {history.data && !history.isError && (
        <>
          {!history.data.deliveries.length && <p>{t("collaboration.empty")}</p>}
          {history.data.deliveries.map((d) => (
            <p key={d.id}>
              {t(`notifications.emailStatus.${d.status}`)} ·{" "}
              <time dateTime={d.createdAt}>{new Date(d.createdAt).toLocaleString(locale)}</time>
            </p>
          ))}
        </>
      )}
    </section>
  );
}
