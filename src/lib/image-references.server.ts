import { z } from "zod";
import { ARTICLE_IMAGE_BUCKET_PRIVATE } from "./image-storage";
import { readTeamReviewContext } from "./project-team-context.server";
import { projectTeamRpc, teamCall } from "./project-team-membership.server";
import {
  IMAGE_REFERENCE_LIMITS,
  imageReferenceSelection,
  listImageReferenceCandidates,
  resolveImageReferences,
  prepareImageReference,
  imageReferenceSetHash,
} from "./image-references";

export const imageReferenceTarget = z
  .object({
    projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    assetId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  })
  .strict();
type Target = z.infer<typeof imageReferenceTarget>;
type ReferenceContext = Parameters<typeof listImageReferenceCandidates>[1];
type Reader = (ownerId: string, target: Target) => Promise<ReferenceContext>;
async function read(ownerId: string, target: Target): Promise<ReferenceContext> {
  const context = await readTeamReviewContext(ownerId, { ownerId, ...target });
  return {
    ownerId: context.ownerId,
    projectId: context.projectId,
    assetId: context.assetId,
    images: context.asset.images ?? [],
  };
}
/** Owner-only projection. No signed URL, private path or connector data is returned. */
export async function readImageReferenceCandidates(
  ownerId: string,
  raw: Target,
  reader: Reader = read,
) {
  const user = z.string().uuid().parse(ownerId),
    target = imageReferenceTarget.parse(raw);
  const context = await reader(user, target);
  if (context.projectId !== target.projectId || context.assetId !== target.assetId)
    throw Error("image_reference_scope");
  return listImageReferenceCandidates(user, context);
}
type Dependencies = {
  read?: Reader;
  download?: (
    bucket: typeof ARTICLE_IMAGE_BUCKET_PRIVATE,
    path: string,
    signal: AbortSignal,
    maxBytes: number,
  ) => Promise<Blob>;
  acquire?: (owner: string) => Promise<string>;
  release?: (owner: string, lease: string) => Promise<void>;
};
const acquire = async (owner: string) =>
  z
    .string()
    .uuid()
    .parse(await teamCall("acquire_project_team_media", { p_actor: owner }, projectTeamRpc));
const release = async (owner: string, lease: string) => {
  await teamCall("release_project_team_media", { p_actor: owner, p_lease: lease }, projectTeamRpc);
};

/** Read a private object incrementally so the byte cap applies during transfer,
 * before a Blob/arrayBuffer can allocate the entire object. */
export async function readBoundedReferenceStream(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  maxBytes: number = IMAGE_REFERENCE_LIMITS.imageBytes,
) {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > IMAGE_REFERENCE_LIMITS.imageBytes
  )
    throw Error("image_reference_budget");
  const reader = stream.getReader();
  const bytes = new Uint8Array(maxBytes);
  let size = 0,
    chunks = 0;
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      chunks++;
      if (chunks > 16384 || !(value instanceof Uint8Array) || size + value.byteLength > maxBytes)
        throw Error("image_reference_bytes");
      bytes.set(value, size);
      size += value.byteLength;
    }
    return new Blob([bytes.subarray(0, size)]);
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
  }
}

/** Private preflight only. Caller must independently establish a priced input
 * contract and reserve supplier expense before any edits request. This function
 * invokes no model and returns no public URLs or credentials. */
export async function loadSelectedImageReferences(
  ownerId: string,
  raw: z.infer<typeof imageReferenceSelection>,
  deps: Dependencies = {},
) {
  const user = z.string().uuid().parse(ownerId),
    input = imageReferenceSelection.parse(raw);
  const target = { projectId: input.projectId, assetId: input.assetId };
  const reader = deps.read ?? read,
    controller = new AbortController();
  const download =
    deps.download ??
    (async (bucket, path, signal, maxBytes) => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const result = await supabaseAdmin.storage
        .from(bucket)
        .download(path, {}, { signal })
        .asStream();
      if (result.error || !result.data) throw Error("image_reference_unavailable");
      return readBoundedReferenceStream(result.data, signal, maxBytes);
    });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    const selected = await resolveImageReferences(user, input, await reader(user, target));
    controller.signal.throwIfAborted();
    const references: Awaited<ReturnType<typeof prepareImageReference>>[] = [];
    let size = 0,
      pixels = 0;
    for (const item of selected) {
      controller.signal.throwIfAborted();
      const maxBytes = Math.min(
        IMAGE_REFERENCE_LIMITS.imageBytes,
        IMAGE_REFERENCE_LIMITS.totalBytes - size,
      );
      if (maxBytes < 1 || pixels >= IMAGE_REFERENCE_LIMITS.totalPixels)
        throw Error("image_reference_budget");
      const lease = await (deps.acquire ?? acquire)(user);
      try {
        controller.signal.throwIfAborted();
        const blob = await download(
          ARTICLE_IMAGE_BUCKET_PRIVATE,
          item.path,
          controller.signal,
          maxBytes,
        );
        controller.signal.throwIfAborted();
        if (blob.size > maxBytes) throw Error("image_reference_bytes");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        controller.signal.throwIfAborted();
        const prepared = await prepareImageReference(item, bytes);
        pixels += prepared.manifest.width * prepared.manifest.height;
        if (pixels > IMAGE_REFERENCE_LIMITS.totalPixels) throw Error("image_reference_budget");
        size += prepared.manifest.size;
        references.push(prepared);
      } finally {
        // Failed cleanup cannot authorize further reads; the existing lease also expires.
        await (deps.release ?? release)(user, lease);
      }
    }
    controller.signal.throwIfAborted();
    const after = await resolveImageReferences(user, input, await reader(user, target));
    controller.signal.throwIfAborted();
    if (JSON.stringify(after) !== JSON.stringify(selected)) throw Error("image_reference_changed");
    const selectionHash = await imageReferenceSetHash(references);
    controller.signal.throwIfAborted();
    return { selectionHash, references };
  };
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Error("image_reference_timeout"));
        }, 30000);
      }),
    ]);
  } catch {
    throw Error(
      "The selected product images could not be confirmed. Refresh their saved selection before generating.",
    );
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
