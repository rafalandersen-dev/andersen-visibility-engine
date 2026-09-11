import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useT } from "@/i18n";
import {
  readTeamInvitationDeliveryFn,
  requestTeamInvitationDeliveryFn,
} from "@/lib/project-team-invitation-delivery.functions";
import type { teamRole } from "@/lib/project-team";
import type { z } from "zod";
import { Button } from "./ui/button";
import { toast } from "sonner";
export function ProjectTeamInvitationDelivery({
  projectId,
  inviteId,
  email,
  role,
  pending,
}: {
  projectId: string;
  inviteId: string;
  email: string;
  role: z.infer<typeof teamRole>;
  pending: boolean;
}) {
  const { user } = useAuth(),
    t = useT();
  const query = useQuery({
    queryKey: ["project-teams", user?.id, "invitation-delivery", projectId, inviteId],
    queryFn: () => readTeamInvitationDeliveryFn({ data: { projectId, inviteId } }),
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
  });
  const mutation = useMutation({
    mutationFn: () =>
      requestTeamInvitationDeliveryFn({ data: { projectId, inviteId, email, role } }),
    onSuccess: () => {
      toast.success(t("collaboration.invitationEmailQueued"));
      void query.refetch();
    },
    onError: () => {
      toast.error(t("collaboration.error"));
      void query.refetch();
    },
  });
  return (
    <section className="w-full space-y-2 text-sm">
      {query.isPending && <p role="status">{t("collaboration.loading")}</p>}
      {query.isError && <p role="alert">{t("collaboration.error")}</p>}
      {query.data && !query.isError && (
        <>
          {query.data.delivery && (
            <p>{t(`notifications.emailStatus.${query.data.delivery.status}`)}</p>
          )}
          {pending && (!query.data.delivery || query.data.delivery.status === "failed") && (
            <>
              <p className="text-muted-foreground">{t("collaboration.invitationEmailHelp")}</p>
              <Button
                variant="outline"
                disabled={mutation.isPending || query.isFetching}
                onClick={() => mutation.mutate()}
              >
                {t("collaboration.emailInvitation")}
              </Button>
            </>
          )}
        </>
      )}
      <Button variant="ghost" disabled={query.isFetching} onClick={() => void query.refetch()}>
        {t("collaboration.refresh")}
      </Button>
    </section>
  );
}
