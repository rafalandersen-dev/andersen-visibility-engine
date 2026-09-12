import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useT } from "@/i18n";
import {
  IMAGE_REFERENCE_LIMITS,
  imageReferenceChoices,
  imageReferenceCheck,
  listImageReferenceCandidates,
  type ImageReferenceChoice,
} from "@/lib/image-references";
import {
  checkImageReferencesFn,
  listImageReferenceCandidatesFn,
} from "@/lib/image-references.functions";
import { Button } from "./ui/button";
import { ArticleImageThumbnail } from "./ArticleImageThumbnail";
import type { ContentImage } from "@/lib/types";

type Props = {
  projectId: string;
  assetId: string;
  photosVersion: string;
  photosSaved: boolean;
  choices: ImageReferenceChoice[] | undefined;
  images?: ContentImage[];
  disabled?: boolean;
  onChange: (choices: ImageReferenceChoice[]) => void;
};

export function ProductImageReferences(props: Props) {
  const { user } = useAuth();
  return user ? (
    <OwnerReferences
      key={`${user.id}:${props.projectId}:${props.assetId}:${props.photosVersion}:${props.photosSaved}`}
      {...props}
      userId={user.id}
    />
  ) : null;
}

function OwnerReferences({
  userId,
  projectId,
  assetId,
  photosSaved,
  photosVersion,
  choices,
  disabled,
  onChange,
  images,
}: Props & { userId: string }) {
  const t = useT();
  const selected = imageReferenceChoices.safeParse(choices ?? []);
  const items = selected.success ? selected.data : [];
  const query = useQuery({
    queryKey: [
      "image-reference-candidates",
      userId,
      projectId,
      assetId,
      photosVersion,
      photosSaved,
    ],
    queryFn: async () => {
      const saved = await listImageReferenceCandidatesFn({ data: { projectId, assetId } });
      // A thumbnail from the current editor must describe the same saved object
      // as the server candidate, including a concurrent path/concept change.
      const local = await listImageReferenceCandidates(userId, {
        ownerId: userId,
        projectId,
        assetId,
        images: images ?? [],
      });
      if (JSON.stringify(local) !== JSON.stringify(saved)) throw Error("image_reference_changed");
      return saved;
    },
    enabled: false,
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const check = useMutation({
    mutationFn: async (references: ImageReferenceChoice[]) =>
      imageReferenceCheck.parse(
        await checkImageReferencesFn({ data: { projectId, assetId, references } }),
      ),
    retry: false,
  });
  const loaded = query.isSuccess && !query.isFetching && photosSaved;
  const candidates = loaded ? query.data : [];
  const stale =
    loaded &&
    items.some(
      (item) =>
        !candidates.some(
          (candidate) =>
            candidate.imageId === item.imageId && candidate.metadataHash === item.metadataHash,
        ),
    );
  const busy = !!disabled || query.isFetching || check.isPending;
  const verified =
    loaded &&
    !stale &&
    selected.success &&
    check.isSuccess &&
    JSON.stringify(check.variables) === JSON.stringify(items);
  const change = (next: ImageReferenceChoice[]) => {
    check.reset();
    onChange(imageReferenceChoices.parse(next));
  };
  return (
    <section
      className="space-y-3 rounded-lg border border-border bg-secondary/20 p-4"
      aria-label={t("imageRefs.title")}
    >
      <h3 className="text-sm font-medium">{t("imageRefs.title")}</h3>
      <p className="text-xs text-muted-foreground">{t("imageRefs.note")}</p>
      <p className="text-xs text-muted-foreground">{t("imageRefs.limits")}</p>
      {!photosSaved && (
        <p role="status" className="text-xs">
          {t("imageRefs.savePhotos")}
        </p>
      )}
      {!selected.success && (
        <p role="alert" className="text-xs">
          {t("imageRefs.invalid")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || !photosSaved}
          onClick={() => {
            check.reset();
            void query.refetch();
          }}
        >
          {t("imageRefs.load")}
        </Button>
        {(items.length > 0 || !selected.success) && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => change([])}
          >
            {t("imageRefs.clear")}
          </Button>
        )}
      </div>
      {query.isFetching && (
        <p role="status" className="text-xs">
          {t("imageRefs.loading")}
        </p>
      )}
      {query.isError && (
        <p role="alert" className="text-xs">
          {t("imageRefs.loadError")}
        </p>
      )}
      {loaded && candidates.length === 0 && <p className="text-xs">{t("imageRefs.empty")}</p>}
      {loaded && (
        <div className="space-y-2">
          {candidates.map((candidate) => {
            const chosen = items.some(
              (item) =>
                item.imageId === candidate.imageId && item.metadataHash === candidate.metadataHash,
            );
            return (
              <label key={candidate.imageId} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={chosen}
                  disabled={
                    busy ||
                    !selected.success ||
                    (!chosen && items.length >= IMAGE_REFERENCE_LIMITS.count)
                  }
                  onChange={(event) => {
                    const remaining = items.filter((item) => item.imageId !== candidate.imageId);
                    change(
                      event.target.checked
                        ? [
                            ...remaining,
                            { imageId: candidate.imageId, metadataHash: candidate.metadataHash },
                          ]
                        : remaining,
                    );
                  }}
                />
                {images?.find((image) => image.id === candidate.imageId) && (
                  <ArticleImageThumbnail
                    image={{
                      storagePath: images.find((image) => image.id === candidate.imageId)
                        ?.storagePath,
                    }}
                    alt=""
                    className="h-16 w-20 shrink-0 rounded border object-contain"
                  />
                )}
                <span className="min-w-0 break-words">{candidate.concept}</span>
              </label>
            );
          })}
        </div>
      )}
      {stale && (
        <p role="alert" className="text-xs">
          {t("imageRefs.changed")}
        </p>
      )}
      {items.length > 0 && (
        <>
          <p className="text-xs">{t("imageRefs.selected", { count: items.length })}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !loaded || stale || !selected.success}
            onClick={() => check.mutate(items)}
          >
            {t("imageRefs.check")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("imageRefs.unavailable")}</p>
        </>
      )}
      {check.isPending && (
        <p role="status" className="text-xs">
          {t("imageRefs.checking")}
        </p>
      )}
      {check.isError && (
        <p role="alert" className="text-xs">
          {t("imageRefs.checkError")}
        </p>
      )}
      {verified && (
        <div role="status" className="space-y-1 text-xs">
          <p>{t("imageRefs.checked")}</p>
          {check.data.images.map((image, index) => (
            <p key={image.imageId}>
              {t("imageRefs.file", {
                index: index + 1,
                width: image.width,
                height: image.height,
                size: Math.ceil(image.size / 1024),
              })}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
