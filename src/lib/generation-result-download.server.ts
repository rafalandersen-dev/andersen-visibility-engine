import { readGenerationResult } from "./generation-result.server";
import { ARTICLE_IMAGE_BUCKET_PRIVATE } from "./image-storage";
import { parseGenerationResult } from "./generation-result";
type Storage = {
  createSignedUrl(
    path: string,
    seconds: number,
    options: { download: string },
  ): PromiseLike<{ data: { signedUrl?: string } | null; error: unknown }>;
};
export async function getGenerationImageDownload(
  userId: string,
  receiptId: string,
  read: typeof readGenerationResult = readGenerationResult,
  supplied?: Storage,
) {
  const result = await read(userId, receiptId);
  if (!result) throw new Error("The saved image is unavailable.");
  const payload = parseGenerationResult(result.result, userId);
  if (payload.kind !== "image") throw new Error("The saved image is unavailable.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const storage =
      supplied ??
      (await import("@/integrations/supabase/client.server")).supabaseAdmin.storage.from(
        ARTICLE_IMAGE_BUCKET_PRIVATE,
      );
    const path = payload.output.path;
    const filename = `milo-${receiptId}.${path.split(".").at(-1)}`;
    const response = await Promise.race([
      storage.createSignedUrl(path, 60, { download: filename }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), 10000);
      }),
    ]);
    if (response.error || !response.data?.signedUrl) throw new Error("missing_download");
    const url = new URL(response.data.signedUrl);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error("invalid_download");
    return { url: url.toString(), filename };
  } catch {
    throw new Error("The saved image could not be downloaded. Refresh and try again.");
  } finally {
    clearTimeout(timer);
  }
}
