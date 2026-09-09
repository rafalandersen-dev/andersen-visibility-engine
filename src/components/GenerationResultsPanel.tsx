import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArticleImageThumbnail } from "@/components/ArticleImageThumbnail";
import { useT } from "@/i18n";
import { useStore, reloadWorkspaceForUser, saveWorkspaceNow, setActiveProject } from "@/lib/store";
import {
  getGenerationImageDownloadFn,
  listGenerationResultsFn,
  readGenerationResultFn,
  recoverGenerationResultFn,
  discardGenerationResultFn,
} from "@/lib/generation-result.functions";
type Page = Awaited<ReturnType<typeof listGenerationResultsFn>>;
type Detail = Awaited<ReturnType<typeof readGenerationResultFn>>;
export function GenerationResultsPanel({
  userId,
  projectId,
}: {
  userId: string;
  projectId?: string;
}) {
  const t = useT(),
    navigate = useNavigate(),
    projects = useStore((s) => s.projects);
  const [page, setPage] = useState<Page>({ items: [], nextCursor: null }),
    [detail, setDetail] = useState<Detail>(null);
  const [loading, setLoading] = useState(true),
    [reading, setReading] = useState(false),
    [failed, setFailed] = useState(false),
    [detailFailed, setDetailFailed] = useState(false);
  const [busy, setBusy] = useState(false),
    [remove, setRemove] = useState(false);
  const alive = useRef(true),
    listRequest = useRef(0),
    detailRequest = useRef(0),
    working = useRef(false);
  const load = useCallback(
    async (cursor?: NonNullable<Page["nextCursor"]>) => {
      const request = ++listRequest.current;
      setLoading(true);
      try {
        const next = await listGenerationResultsFn({ data: { projectId, cursor } });
        if (!alive.current || request !== listRequest.current) return;
        setPage((previous) => ({
          items: cursor
            ? [...new Map([...previous.items, ...next.items].map((i) => [i.id, i])).values()]
            : next.items,
          nextCursor: next.nextCursor,
        }));
        setFailed(false);
      } catch {
        if (alive.current && request === listRequest.current) setFailed(true);
      } finally {
        if (alive.current && request === listRequest.current) setLoading(false);
      }
    },
    [projectId],
  );
  useEffect(() => {
    const listCounter = listRequest;
    const detailCounter = detailRequest;
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      listCounter.current++;
      detailCounter.current++;
    };
  }, [load]);
  async function select(id: string) {
    const request = ++detailRequest.current;
    setReading(true);
    setDetail(null);
    setDetailFailed(false);
    try {
      const next = await readGenerationResultFn({ data: { receiptId: id } });
      if (alive.current && request === detailRequest.current) {
        setDetail(next);
        setDetailFailed(!next);
      }
    } catch {
      if (alive.current && request === detailRequest.current) setDetailFailed(true);
    } finally {
      if (alive.current && request === detailRequest.current) setReading(false);
    }
  }
  async function restore() {
    if (working.current || !detail) return;
    working.current = true;
    setBusy(true);
    try {
      await saveWorkspaceNow();
      if (!alive.current) return;
      const result = await recoverGenerationResultFn({ data: { receiptId: detail.id } });
      if (!alive.current) return;
      await reloadWorkspaceForUser(userId);
      if (!alive.current) return;
      setActiveProject(result.projectId);
      await navigate({ to: "/app/editor", search: { id: result.assetId } });
    } catch {
      if (alive.current) toast.error(t("generationResults.restoreError"));
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function discard() {
    if (working.current || !detail) return;
    working.current = true;
    setBusy(true);
    setRemove(false);
    try {
      await discardGenerationResultFn({ data: { receiptId: detail.id } });
      if (!alive.current) return;
      setDetail(null);
      toast.success(t("generationResults.removed"));
      await load();
    } catch {
      if (alive.current) toast.error(t("generationResults.removeError"));
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function download() {
    if (!detail || working.current) return;
    let blob: Blob, filename: string;
    if (detail.result.kind === "content") {
      blob = new Blob([detail.result.output.markdown], { type: "text/markdown;charset=utf-8" });
      filename = `milo-${detail.id}.md`;
    } else {
      working.current = true;
      setBusy(true);
      try {
        const signed = await getGenerationImageDownloadFn({ data: { receiptId: detail.id } });
        if (!alive.current) return;
        const response = await fetch(signed.url, {
          signal: AbortSignal.timeout(15000),
          credentials: "omit",
          redirect: "error",
        });
        if (!response.ok) throw new Error("download_unavailable");
        blob = await response.blob();
        if (blob.size > 5 * 1024 * 1024 || !blob.size) throw new Error("download_unavailable");
        filename = signed.filename;
      } catch {
        if (alive.current) toast.error(t("generationResults.readError"));
        return;
      } finally {
        working.current = false;
        if (alive.current) setBusy(false);
      }
    }
    if (!alive.current) return;
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{t("generationResults.timezone")}</p>
        <Button variant="outline" disabled={loading || busy} onClick={() => void load()}>
          {t("generationResults.refresh")}
        </Button>
      </div>
      {failed ? (
        <p role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm">
          {t("generationResults.readError")}
        </p>
      ) : null}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-3" aria-busy={loading}>
          {!page.items.length && !failed ? (
            <p
              role="status"
              className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground"
            >
              {t(loading ? "generationResults.loading" : "generationResults.empty")}
            </p>
          ) : null}
          {page.items.map((item) => (
            <article key={item.id} className="rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                <span>{t(`generationResults.${item.kind}`)}</span>
                <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
              </div>
              <h2 className="break-words font-medium">{item.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {projects.find((p) => p.id === item.projectId)?.name ??
                  t("generationResults.deletedProject")}
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                className="mt-3"
                onClick={() => void select(item.id)}
                aria-pressed={detail?.id === item.id}
              >
                {t("generationResults.open")}
              </Button>
            </article>
          ))}
          {page.nextCursor ? (
            <Button
              variant="outline"
              disabled={loading || busy}
              onClick={() => void load(page.nextCursor!)}
            >
              {t("generationResults.more")}
            </Button>
          ) : null}
        </div>
        <div className="min-w-0 rounded-xl border border-border bg-card p-5" aria-busy={reading}>
          {detailFailed ? (
            <p role="alert" className="text-sm">
              {t("generationResults.readError")}
            </p>
          ) : null}
          {reading ? (
            <p role="status" className="text-sm">
              {t("generationResults.loading")}
            </p>
          ) : detail ? (
            <>
              <h2 className="break-words font-display text-xl">{detail.result.title}</h2>
              <p className="mb-4 mt-2 text-sm text-muted-foreground">
                {t("generationResults.review")}
              </p>
              {detail.result.kind === "content" ? (
                <textarea
                  readOnly
                  aria-label={detail.result.title}
                  value={detail.result.output.markdown}
                  className="min-h-80 w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-sm"
                />
              ) : (
                <figure>
                  <ArticleImageThumbnail
                    image={{ storagePath: detail.result.output.path }}
                    alt={detail.result.output.alt}
                    className="aspect-video w-full rounded-lg bg-muted object-contain"
                  />
                  <figcaption className="mt-2 text-sm text-muted-foreground">
                    {detail.result.output.alt}
                  </figcaption>
                </figure>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => void restore()}>
                  {t("generationResults.restore")}
                </Button>
                <Button variant="outline" onClick={() => void download()} disabled={busy}>
                  {t(
                    detail.result.kind === "content"
                      ? "generationResults.download"
                      : "generationResults.downloadImage",
                  )}
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setRemove(true)}>
                  {t("generationResults.remove")}
                </Button>
              </div>
            </>
          ) : !detailFailed ? (
            <p className="text-sm text-muted-foreground">{t("generationResults.select")}</p>
          ) : null}
        </div>
      </div>
      <AlertDialog open={remove} onOpenChange={setRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("generationResults.removeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("generationResults.removeDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("generationResults.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void discard()}>
              {t("generationResults.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
