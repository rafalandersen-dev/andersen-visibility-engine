import {
  ARTICLE_IMAGE_BUCKET_PRIVATE,
  isValidStorageObjectPath,
  ownerOfPath,
} from "./image-storage";
export const IMAGE_PREVIEW_TIMEOUT_MS = 10_000;
type PreviewStorage = {
  createSignedUrl: (
    path: string,
    seconds: number,
  ) => PromiseLike<{ data: { signedUrl?: string } | null; error: unknown }>;
};
export async function readArticleImagePreview(
  userId: string,
  path: string,
  suppliedStorage?: PreviewStorage,
): Promise<string> {
  if (!userId || !isValidStorageObjectPath(path) || ownerOfPath(path) !== userId)
    throw new Error("You do not have access to this image.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const storage =
      suppliedStorage ??
      (await import("@/integrations/supabase/client.server")).supabaseAdmin.storage.from(
        ARTICLE_IMAGE_BUCKET_PRIVATE,
      );
    const result = await Promise.race([
      storage.createSignedUrl(path, 3600),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), IMAGE_PREVIEW_TIMEOUT_MS);
      }),
    ]);
    if (result.error || !result.data?.signedUrl) throw new Error("unavailable");
    return result.data.signedUrl;
  } catch {
    throw new Error("The image preview could not be refreshed. Try again shortly.");
  } finally {
    clearTimeout(timer);
  }
}
