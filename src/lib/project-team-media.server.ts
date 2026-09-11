import { z } from "zod";
import { teamMediaInput } from "./project-team";
import { readTeamReviewContext } from "./project-team-context.server";
import {
  ARTICLE_IMAGE_BUCKET_PRIVATE,
  ARTICLE_IMAGE_BUCKET_PUBLIC,
  MAX_IMAGE_BYTES,
  isValidStorageObjectPath,
  validateImageBytes,
  contentTypeForFormat,
} from "./image-storage";
import { isSafePublicUrl, outboundFetchAllowed } from "./safe-fetch";
import { projectOrigin } from "./images";
type ContextReader = typeof readTeamReviewContext;
type Dependencies = {
  read?: ContextReader;
  storageOrigin?: string;
  download?: (bucket: string, path: string) => Promise<Blob>;
  fetch?: typeof fetch;
  outboundAllowed?: () => boolean;
};
async function publicBytes(
  url: string,
  origin: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
) {
  let current = url;
  for (let hop = 0; hop <= 3; hop++) {
    if (
      !isSafePublicUrl(current) ||
      new URL(current).protocol !== "https:" ||
      new URL(current).origin !== origin
    )
      throw new Error("media_origin");
    const response = await fetcher(current, {
      redirect: "manual",
      credentials: "omit",
      signal,
      headers: { Accept: "image/png,image/jpeg,image/webp" },
    });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      await response.body?.cancel();
      if (!next || hop === 3) throw new Error("media_redirect");
      current = new URL(next, current).href;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("media_http");
    }
    const size = Number(response.headers.get("content-length"));
    if (size > MAX_IMAGE_BYTES) {
      await response.body?.cancel();
      throw new Error("media_size");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("media_body");
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > MAX_IMAGE_BYTES) throw new Error("media_size");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  }
  throw new Error("media_redirect");
}
export async function readProjectTeamMedia(
  actorId: string,
  raw: z.infer<typeof teamMediaInput>,
  deps: Dependencies = {},
) {
  const input = teamMediaInput.parse(raw);
  const read = deps.read ?? readTeamReviewContext;
  const target = { ownerId: input.ownerId, projectId: input.projectId, assetId: input.assetId };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  try {
    const run = async () => {
      const before = await read(actorId, target);
      if (before.draftHash !== input.expectedHash) throw new Error("media_changed");
      const images = z
        .array(
          z
            .object({
              id: z.string(),
              storagePath: z.string().optional(),
              url: z.string().optional(),
            })
            .passthrough(),
        )
        .max(30)
        .parse(before.asset.images ?? []);
      const matches = images.filter((i) => i.id === input.imageId);
      if (matches.length !== 1) throw new Error("media_missing");
      const media =
        input.kind === "social"
          ? {
              url: z
                .object({
                  imageId: z.literal(input.imageId),
                  social: z.object({ physicalUrl: z.string().url() }),
                })
                .parse(before.asset.featuredImage).social.physicalUrl,
              storagePath: undefined,
            }
          : input.kind === "featured"
            ? z
                .object({
                  imageId: z.literal(input.imageId),
                  storagePath: z.string().optional(),
                  url: z.string().optional(),
                })
                .parse(before.asset.featuredImage)
            : matches[0];
      let bytes: Uint8Array | undefined;
      const download =
        deps.download ??
        (async (bucket, path) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const result = await supabaseAdmin.storage.from(bucket).download(path);
          if (result.error || !result.data) throw new Error("media_missing");
          return result.data;
        });
      const storageOrigin = new URL(deps.storageOrigin ?? process.env.SUPABASE_URL ?? "").origin;
      // Published/reused media uses its exact public object. Staged media uses
      // only the saved private path; browser URLs and paths are never accepted.
      let bucket: string | undefined;
      let path: string | undefined;
      if (media.url && new URL(media.url).origin === storageOrigin) {
        const parsed = new URL(media.url);
        const prefix = `/storage/v1/object/public/${ARTICLE_IMAGE_BUCKET_PUBLIC}/`;
        if (
          parsed.search ||
          parsed.hash ||
          parsed.username ||
          parsed.password ||
          !parsed.pathname.startsWith(prefix)
        )
          throw new Error("media_storage_url");
        path = decodeURIComponent(parsed.pathname.slice(prefix.length));
        bucket = ARTICLE_IMAGE_BUCKET_PUBLIC;
        if (
          !isValidStorageObjectPath(path) ||
          path.split("/")[0] !== input.ownerId ||
          path.split("/")[1] !== input.projectId
        )
          throw new Error("media_scope");
      } else if (media.url) {
        const origin = projectOrigin(before.project);
        if (!origin || !(deps.outboundAllowed ?? outboundFetchAllowed)())
          throw new Error("media_outbound");
        bytes = await publicBytes(media.url, origin, deps.fetch ?? fetch, controller.signal);
      } else {
        path = media.storagePath;
        bucket = ARTICLE_IMAGE_BUCKET_PRIVATE;
        if (!path || !isValidStorageObjectPath(path)) throw new Error("media_scope");
        const [owner, project, asset, file] = path.split("/");
        if (
          owner !== input.ownerId ||
          project !== input.projectId ||
          asset !== input.assetId ||
          file.slice(0, file.lastIndexOf(".")) !== input.imageId
        )
          throw new Error("media_scope");
      }
      if (bucket && path) {
        const blob = await download(bucket, path);
        if (blob.size > MAX_IMAGE_BYTES) throw new Error("media_size");
        bytes = new Uint8Array(await blob.arrayBuffer());
      }
      if (!bytes) throw new Error("media_missing");
      const checked = validateImageBytes(bytes);
      if (!checked.ok) throw new Error("media_invalid");
      const after = await read(actorId, target);
      if (
        after.draftHash !== before.draftHash ||
        after.membershipRevision !== before.membershipRevision
      )
        throw new Error("media_changed");
      const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
      return {
        byteHash: Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join(""),
        imageId: input.imageId,
        draftHash: input.expectedHash,
        contentType: contentTypeForFormat(checked.format),
        base64: Buffer.from(bytes).toString("base64"),
      };
    };
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("media_timeout"));
        }, 10000);
      }),
    ]);
  } catch {
    throw new Error("The project image could not be confirmed. Refresh before trying again.");
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
