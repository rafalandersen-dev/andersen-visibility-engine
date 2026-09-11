import { runTeamRequest } from "@/lib/team-request-queue";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useT, useAppLanguage } from "@/i18n";
import { Button } from "./ui/button";
import { addProjectTeamCommentFn, readProjectTeamCommentsFn } from "@/lib/project-team.functions";
import { toast } from "sonner";
export function ProjectTeamComments({
  ownerId,
  projectId,
  assetId,
  revision,
}: {
  ownerId: string;
  projectId: string;
  assetId: string;
  revision: number;
}) {
  const t = useT();
  const locale = useAppLanguage();
  const { user } = useAuth();
  const client = useQueryClient();
  const [body, setBody] = useState("");
  const [commentId, setCommentId] = useState(() => crypto.randomUUID());
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: ["project-teams", user?.id, "comments", ownerId, projectId, assetId, offset],
    queryFn: ({ signal }) =>
      runTeamRequest(
        () => readProjectTeamCommentsFn({ data: { ownerId, projectId, assetId, offset } }),
        signal,
      ),
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 30000,
  });
  const mutation = useMutation({
    mutationFn: () =>
      runTeamRequest(() =>
        addProjectTeamCommentFn({
          data: { ownerId, projectId, assetId, commentId, expectedRevision: revision, body },
        }),
      ),
    onSuccess: () => {
      setBody("");
      setCommentId(crypto.randomUUID());
      setOffset(0);
      void client.invalidateQueries({ queryKey: ["project-teams", user?.id] });
    },
    onError: () => {
      toast.error(t("collaboration.error"));
      void client.invalidateQueries({ queryKey: ["project-teams", user?.id] });
    },
  });
  return (
    <section className="space-y-4 border-t pt-5">
      <h3 className="font-semibold">{t("collaboration.comments")}</h3>
      {query.isPending && <p role="status">{t("collaboration.loading")}</p>}
      {query.isError && <p role="alert">{t("collaboration.error")}</p>}
      {query.data && !query.isError && (
        <>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            <label className="block text-sm">
              {t("collaboration.commentLabel")}
              <textarea
                required
                maxLength={4000}
                rows={3}
                value={body}
                disabled={mutation.isPending}
                onChange={(e) => {
                  setBody(e.target.value);
                  setCommentId(crypto.randomUUID());
                }}
                className="mt-1 w-full rounded-md border bg-background p-3"
              />
            </label>
            <Button type="submit" disabled={!body.trim() || mutation.isPending}>
              {t("collaboration.addComment")}
            </Button>
          </form>
          {!query.data.comments.length && <p>{t("collaboration.empty")}</p>}
          {query.data.comments.map((c) => (
            <article key={c.commentId} className="space-y-2 rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">
                {c.mine ? t("collaboration.you") : c.authorName} ·{" "}
                <time dateTime={c.createdAt}>{new Date(c.createdAt).toLocaleString(locale)}</time>
              </p>
              <p className="whitespace-pre-wrap break-words">{c.body}</p>
              {c.workspaceRevision !== revision && (
                <p className="text-xs text-muted-foreground">{t("collaboration.earlierVersion")}</p>
              )}
            </article>
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
    </section>
  );
}
