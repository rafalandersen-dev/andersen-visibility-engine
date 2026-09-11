import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useT } from "@/i18n";
import { readProjectTeamPreviewFn, readProjectTeamMediaFn } from "@/lib/project-team.functions";
import { Button } from "./ui/button";
export function ProjectTeamRenderedReview({
  ownerId,
  projectId,
  assetId,
}: {
  ownerId: string;
  projectId: string;
  assetId: string;
}) {
  const t = useT();
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["project-teams", user?.id, "preview", ownerId, projectId, assetId],
    queryFn: () => readProjectTeamPreviewFn({ data: { ownerId, projectId, assetId } }),
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
  });
  const [media, setMedia] = useState<{
    stamp: number;
    urls: Record<string, string>;
    error: boolean;
  } | null>(null);
  useEffect(() => {
    const preview = query.data;
    if (!preview || query.isError) return;
    let cancelled = false;
    const created: string[] = [];
    setMedia(null);
    void (async () => {
      try {
        if (preview.unknownImages) throw new Error("unknown_images");
        const urls: Record<string, string> = {};
        for (const item of preview.media) {
          const image = await readProjectTeamMediaFn({
            data: {
              ownerId,
              projectId,
              assetId,
              imageId: item.imageId,
              kind: item.kind,
              expectedHash: preview.draftHash,
            },
          });
          if (cancelled) return;
          if (
            image.draftHash !== preview.draftHash ||
            image.imageId !== item.imageId ||
            !["image/png", "image/jpeg", "image/webp"].includes(image.contentType)
          )
            throw new Error("image_changed");
          const bytes = Uint8Array.from(atob(image.base64), (ch) => ch.charCodeAt(0));
          const url = URL.createObjectURL(new Blob([bytes], { type: image.contentType }));
          created.push(url);
          // A magic-byte check alone does not prove the browser can render a file.
          const check = new Image();
          check.src = url;
          await check.decode();
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          urls[item.key] = url;
        }
        if (!cancelled) setMedia({ stamp: query.dataUpdatedAt, urls, error: false });
      } catch {
        created.forEach((url) => URL.revokeObjectURL(url));
        if (!cancelled) setMedia({ stamp: query.dataUpdatedAt, urls: {}, error: true });
      }
    })();
    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [query.data, query.dataUpdatedAt, query.isError, ownerId, projectId, assetId]);
  const ready =
    query.data && !query.isError && media && !media.error && media.stamp === query.dataUpdatedAt;
  const html = ready
    ? query.data.html.replace(
        /milo-review-image:([A-Za-z0-9_-]+)/g,
        (_, key: string) => media.urls[key] ?? "",
      )
    : "";
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">{t("collaboration.renderedReview")}</h3>
        <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
          {t("collaboration.refresh")}
        </Button>
      </div>
      {(query.isPending || (!ready && !query.isError && !media?.error)) && (
        <p role="status">{t("collaboration.loadingReview")}</p>
      )}
      {(query.isError || media?.error) && <p role="alert">{t("collaboration.incompleteReview")}</p>}
      {ready && (
        <>
          <p className="font-medium">{query.data.title}</p>
          <p className="text-sm text-muted-foreground">{query.data.metaTitle}</p>
          <p className="text-sm text-muted-foreground">{query.data.metaDescription}</p>
          <iframe
            title={t("collaboration.renderedReview")}
            className="h-[36rem] w-full rounded-lg border bg-white"
            sandbox=""
            referrerPolicy="no-referrer"
            srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><style>body{font:16px system-ui;line-height:1.6;padding:16px;overflow-wrap:anywhere}img{max-width:100%;height:auto}a{pointer-events:none}</style>${html}`}
          />
        </>
      )}
    </section>
  );
}
