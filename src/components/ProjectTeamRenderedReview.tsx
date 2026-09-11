import { runTeamRequest } from "@/lib/team-request-queue";
import { substituteTeamPreviewImages } from "@/lib/project-team-preview-images";
import { createReviewImageBudget, REVIEW_IMAGE_LIMITS } from "@/lib/project-team-image-budget";
import { ProjectTeamReviewDecision, ProjectTeamReviewHistory } from "./ProjectTeamReviewDecision";
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
  expectedDraftHash,
}: {
  ownerId: string;
  projectId: string;
  assetId: string;
  expectedDraftHash?: string;
}) {
  const t = useT();
  const { user } = useAuth();
  const query = useQuery({
    queryKey: [
      "project-teams",
      user?.id,
      "preview",
      ownerId,
      projectId,
      assetId,
      expectedDraftHash ?? null,
    ],
    queryFn: ({ signal }) =>
      runTeamRequest(
        () => readProjectTeamPreviewFn({ data: { ownerId, projectId, assetId } }),
        signal,
      ),
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
  });
  const [media, setMedia] = useState<{
    stamp: number;
    urls: Record<string, string>;
    hashes: Record<string, string>;
    error: boolean;
    budget?: boolean;
  } | null>(null);
  const [frameStamp, setFrameStamp] = useState(0);
  useEffect(() => {
    const preview = query.data;
    if (!preview || query.isError) return;
    let cancelled = false;
    const created: string[] = [];
    setMedia(null);
    setFrameStamp(0);
    void (async () => {
      try {
        if (preview.unknownImages || (expectedDraftHash && preview.draftHash !== expectedDraftHash))
          throw new Error("unknown_images");
        const budget = createReviewImageBudget(preview.media.length);
        const urls: Record<string, string> = {};
        const hashes: Record<string, string> = {};
        for (const item of preview.media) {
          budget.beforeDownload();
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
            !/^[a-f0-9]{64}$/.test(image.byteHash) ||
            !["image/png", "image/jpeg", "image/webp"].includes(image.contentType)
          )
            throw new Error("image_changed");
          if (image.base64.length > Math.ceil(REVIEW_IMAGE_LIMITS.imageBytes / 3) * 4)
            throw new Error("image_budget");
          const bytes = Uint8Array.from(atob(image.base64), (ch) => ch.charCodeAt(0));
          const size = budget.accept(bytes, image.contentType);
          const url = URL.createObjectURL(new Blob([bytes], { type: image.contentType }));
          created.push(url);
          // A magic-byte check alone does not prove the browser can render a file.
          const check = new Image();
          check.src = url;
          await check.decode();
          if (
            check.naturalWidth * check.naturalHeight !== size.width * size.height ||
            check.naturalWidth > REVIEW_IMAGE_LIMITS.side ||
            check.naturalHeight > REVIEW_IMAGE_LIMITS.side
          )
            throw new Error("image_dimensions");
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          urls[item.key] = url;
          hashes[item.key] = image.byteHash;
        }
        if (!cancelled) setMedia({ stamp: query.dataUpdatedAt, urls, hashes, error: false });
      } catch (error) {
        created.forEach((url) => URL.revokeObjectURL(url));
        if (!cancelled)
          setMedia({
            stamp: query.dataUpdatedAt,
            urls: {},
            hashes: {},
            error: true,
            budget:
              error instanceof Error &&
              ["review_image_budget", "image_budget"].includes(error.message),
          });
      }
    })();
    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [
    query.data,
    query.dataUpdatedAt,
    query.isError,
    ownerId,
    projectId,
    assetId,
    expectedDraftHash,
  ]);
  const ready =
    query.data &&
    (!expectedDraftHash || query.data.draftHash === expectedDraftHash) &&
    !query.isError &&
    media &&
    !media.error &&
    media.stamp === query.dataUpdatedAt;
  const html = ready ? substituteTeamPreviewImages(query.data.html, media.urls) : "";
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
      {(query.isError || media?.error) && (
        <p role="alert">
          {t(media?.budget ? "collaboration.reviewImageLimits" : "collaboration.incompleteReview")}
        </p>
      )}
      {ready && (
        <>
          <p className="font-medium">{query.data.title}</p>
          <p className="text-sm text-muted-foreground">{query.data.metaTitle}</p>
          <p className="text-sm text-muted-foreground">{query.data.metaDescription}</p>
          <iframe
            key={query.dataUpdatedAt}
            onLoad={(event) => {
              const doc = event.currentTarget.contentDocument;
              const images = doc ? Array.from(doc.images) : [];
              const expected = (query.data.html.match(/<img\b/gi) ?? []).length;
              setFrameStamp(
                doc &&
                  images.length === expected &&
                  images.every((image) => image.complete && image.naturalWidth > 0)
                  ? query.dataUpdatedAt
                  : 0,
              );
            }}
            title={t("collaboration.renderedReview")}
            className="h-[36rem] w-full rounded-lg border bg-white"
            sandbox="allow-same-origin"
            referrerPolicy="no-referrer"
            srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><style>body{font:16px system-ui;line-height:1.6;padding:16px;overflow-wrap:anywhere}img{max-width:100%;height:auto}a{pointer-events:none}</style>${html}`}
          />
        </>
      )}
      {query.data && !query.isError && (
        <ProjectTeamReviewDecision
          key={`${query.dataUpdatedAt}:${query.data.draftHash}:${query.data.membershipRevision}:${query.data.policyRevision}`}
          ownerId={ownerId}
          projectId={projectId}
          preview={query.data}
          ready={Boolean(ready) && frameStamp === query.dataUpdatedAt && !query.isFetching}
          hashes={media?.hashes ?? {}}
        />
      )}
      <ProjectTeamReviewHistory ownerId={ownerId} projectId={projectId} assetId={assetId} />
    </section>
  );
}
