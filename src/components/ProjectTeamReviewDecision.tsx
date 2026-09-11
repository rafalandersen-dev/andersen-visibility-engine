import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useT, useAppLanguage } from "@/i18n";
import {
  readProjectTeamPreviewFn,
  readProjectTeamReviewHistoryFn,
  saveProjectTeamReviewFn,
} from "@/lib/project-team.functions";
import { Button } from "./ui/button";
import { toast } from "sonner";
type Preview = Awaited<ReturnType<typeof readProjectTeamPreviewFn>>;
export function ProjectTeamReviewDecision({
  ownerId,
  projectId,
  preview,
  ready,
  hashes,
}: {
  ownerId: string;
  projectId: string;
  preview: Preview;
  ready: boolean;
  hashes: Record<string, string>;
}) {
  const t = useT();
  const { user } = useAuth();
  const client = useQueryClient();
  const [acknowledged, setAcknowledged] = useState(false);
  const [reviewId] = useState(() => crypto.randomUUID());
  const mutation = useMutation({
    mutationFn: (approved: boolean) =>
      saveProjectTeamReviewFn({
        data: {
          ownerId,
          projectId,
          assetId: preview.assetId,
          reviewId,
          expectedVersion: preview.version,
          expectedHash: preview.draftHash,
          expectedWorkspaceRevision: preview.workspaceRevision,
          expectedMembershipRevision: preview.membershipRevision,
          expectedPolicyRevision: preview.policyRevision,
          approved,
          acknowledged: approved && acknowledged,
          images: approved
            ? preview.media.map((image) => ({ key: image.key, byteHash: hashes[image.key] }))
            : [],
        },
      }),
    onSuccess: () => {
      toast.success(t("collaboration.decisionRecorded"));
      setAcknowledged(false);
      void client.invalidateQueries({ queryKey: ["project-teams", user?.id] });
    },
    onError: () => {
      toast.error(t("collaboration.decisionUnknown"));
      setAcknowledged(false);
      void client.invalidateQueries({ queryKey: ["project-teams", user?.id] });
    },
  });
  if (!preview.canReview)
    return <p className="text-sm text-muted-foreground">{t("collaboration.reviewNotAllowed")}</p>;
  const complete =
    ready &&
    preview.unknownImages === 0 &&
    preview.media.every((image) => /^[a-f0-9]{64}$/.test(hashes[image.key] ?? ""));
  return (
    <section className="space-y-3 border-t pt-4">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={acknowledged}
          disabled={!complete || mutation.isPending}
          onChange={(e) => setAcknowledged(e.target.checked)}
        />
        {t("collaboration.acknowledgeReview")}
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!complete || !acknowledged || mutation.isPending}
          onClick={() => mutation.mutate(true)}
        >
          {t("collaboration.approveVersion")}
        </Button>
        <Button
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(false)}
        >
          {t("collaboration.returnForChanges")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("collaboration.reviewDoesNotPublish")}</p>
    </section>
  );
}
export function ProjectTeamReviewHistory({
  ownerId,
  projectId,
  assetId,
}: {
  ownerId: string;
  projectId: string;
  assetId: string;
}) {
  const t = useT(),
    locale = useAppLanguage();
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["project-teams", user?.id, "review-history", ownerId, projectId, assetId],
    queryFn: () => readProjectTeamReviewHistoryFn({ data: { ownerId, projectId, assetId } }),
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
  });
  return (
    <section className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">{t("collaboration.reviewHistory")}</h4>
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          {t("collaboration.refresh")}
        </Button>
      </div>
      {query.isPending && <p role="status">{t("collaboration.loading")}</p>}
      {query.isError && <p role="alert">{t("collaboration.error")}</p>}
      {query.data && !query.isError && (
        <>
          {!query.data.reviews.length && <p className="text-sm">{t("collaboration.empty")}</p>}
          {query.data.reviews.map((review) => (
            <article key={review.reviewId} className="rounded-lg border p-3 text-sm">
              <p>
                {t(
                  review.approved
                    ? "collaboration.approvalRecorded"
                    : "collaboration.changesRequested",
                )}{" "}
                ·{" "}
                {t(
                  review.mine
                    ? "collaboration.you"
                    : review.owner
                      ? "collaboration.owner"
                      : "collaboration.collaborator",
                )}
              </p>
              <time className="text-muted-foreground" dateTime={review.createdAt}>
                {new Date(review.createdAt).toLocaleString(locale)}
              </time>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
