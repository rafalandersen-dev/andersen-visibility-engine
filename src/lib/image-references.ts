import { z } from "zod";
import {
  contentTypeForFormat,
  isValidStorageObjectPath,
  validateImageBytes,
} from "./image-storage";
import { reviewImageDimensions } from "./project-team-image-budget";

/** Local input bounds only; these do not establish a supplier token/cost ceiling. */
export const IMAGE_REFERENCE_LIMITS = {
  count: 4,
  imageBytes: 4 * 1024 * 1024,
  totalBytes: 8 * 1024 * 1024,
  side: 2048,
  imagePixels: 4 * 1024 * 1024,
  totalPixels: 8 * 1024 * 1024,
} as const;
const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const imageReferenceChoices = z
  .array(z.object({ imageId: id, metadataHash: digest }).strict())
  .max(IMAGE_REFERENCE_LIMITS.count)
  .refine(
    (items) => new Set(items.map((item) => item.imageId)).size === items.length,
    "image_reference_duplicate",
  );
export type ImageReferenceChoice = z.infer<typeof imageReferenceChoices>[number];
export const imageReferenceSelection = z
  .object({
    projectId: id,
    assetId: id,
    references: imageReferenceChoices.refine((items) => items.length > 0, "image_reference_count"),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.references.map((image) => image.imageId)).size !== value.references.length)
      context.addIssue({ code: z.ZodIssueCode.custom, message: "image_reference_duplicate" });
  });
const contextSchema = z.object({
  ownerId: z.string().uuid(),
  projectId: id,
  assetId: id,
  images: z
    .array(
      z.object({
        id,
        source: z.string().optional(),
        status: z.string(),
        storagePath: z.string().optional(),
        concept: z.string().max(2000),
      }),
    )
    .max(128),
});
type ReferenceContext = z.infer<typeof contextSchema>;
const identitySchema = z
  .object({
    ownerId: z.string().uuid(),
    projectId: id,
    assetId: id,
    imageId: id,
    source: z.literal("uploaded"),
    status: z.enum(["proposed", "accepted"]),
    path: z.string(),
    concept: z.string().max(2000),
  })
  .strict();
type Identity = z.infer<typeof identitySchema>;
async function sha256(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, "0")).join("");
}
const hashIdentity = (identity: Identity) =>
  sha256(new TextEncoder().encode(JSON.stringify(identity)));
function identity(context: ReferenceContext, imageId: string): Identity {
  const matches = context.images.filter((image) => image.id === imageId);
  if (matches.length !== 1) throw Error("image_reference_unavailable");
  const image = matches[0];
  if (
    image.source !== "uploaded" ||
    !["proposed", "accepted"].includes(image.status) ||
    !image.storagePath ||
    !isValidStorageObjectPath(image.storagePath)
  )
    throw Error("image_reference_unavailable");
  const [owner, project, asset] = image.storagePath.split("/");
  if (owner !== context.ownerId || project !== context.projectId || asset !== context.assetId)
    throw Error("image_reference_scope");
  return identitySchema.parse({
    ownerId: context.ownerId,
    projectId: context.projectId,
    assetId: context.assetId,
    imageId,
    source: image.source,
    status: image.status,
    path: image.storagePath,
    concept: image.concept,
  });
}
/** A server must first load this context under the authenticated owner. */
export async function listImageReferenceCandidates(userId: string, rawContext: ReferenceContext) {
  const context = contextSchema.parse(rawContext);
  if (context.ownerId !== z.string().uuid().parse(userId)) throw Error("image_reference_scope");
  const result: Array<{ imageId: string; concept: string; metadataHash: string }> = [];
  for (const image of context.images) {
    if (image.source !== "uploaded" || !["proposed", "accepted"].includes(image.status)) continue;
    // Malformed/foreign metadata fails the list instead of silently presenting it.
    const saved = identity(context, image.id);
    result.push({
      imageId: image.id,
      concept: image.concept,
      metadataHash: await hashIdentity(saved),
    });
  }
  return result;
}
/** Internal resolver: no URLs, private paths, owner IDs or expense authority from a browser. */
export async function resolveImageReferences(
  userId: string,
  raw: z.infer<typeof imageReferenceSelection>,
  rawContext: ReferenceContext,
) {
  const input = imageReferenceSelection.parse(raw),
    context = contextSchema.parse(rawContext);
  if (
    context.ownerId !== z.string().uuid().parse(userId) ||
    input.projectId !== context.projectId ||
    input.assetId !== context.assetId
  )
    throw Error("image_reference_scope");
  const result: Array<Identity & { metadataHash: string }> = [];
  for (const selected of input.references) {
    const saved = identity(context, selected.imageId),
      metadataHash = await hashIdentity(saved);
    if (metadataHash !== selected.metadataHash) throw Error("image_reference_changed");
    result.push({ ...saved, metadataHash });
  }
  return result;
}

/** Snapshots actual downloaded bytes; header dimensions bound input surfaces.
 * This is not a full raster decode, product-identity proof or supplier admission. */
export async function prepareImageReference(
  rawIdentity: Identity & { metadataHash: string },
  input: Uint8Array,
) {
  const { metadataHash, ...saved } = identitySchema
    .extend({ metadataHash: digest })
    .parse(rawIdentity);
  if ((await hashIdentity(saved)) !== metadataHash) throw Error("image_reference_changed");
  if (input.byteLength > IMAGE_REFERENCE_LIMITS.imageBytes) throw Error("image_reference_bytes");
  const bytes = Uint8Array.from(input),
    check = validateImageBytes(bytes);
  if (!check.ok) throw Error("image_reference_format");
  const contentType = contentTypeForFormat(check.format),
    dimensions = reviewImageDimensions(bytes, contentType);
  if (
    dimensions.width > IMAGE_REFERENCE_LIMITS.side ||
    dimensions.height > IMAGE_REFERENCE_LIMITS.side ||
    dimensions.width * dimensions.height > IMAGE_REFERENCE_LIMITS.imagePixels
  )
    throw Error("image_reference_dimensions");
  return {
    bytes,
    manifest: {
      ownerId: saved.ownerId,
      projectId: saved.projectId,
      assetId: saved.assetId,
      imageId: saved.imageId,
      metadataHash,
      sha256: await sha256(bytes),
      contentType,
      size: bytes.byteLength,
      ...dimensions,
    },
  };
}
const referenceManifest = z
  .object({
    ownerId: z.string().uuid(),
    projectId: id,
    assetId: id,
    imageId: id,
    metadataHash: digest,
    sha256: digest,
    contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    size: z.number().int().min(1).max(IMAGE_REFERENCE_LIMITS.imageBytes),
    width: z.number().int().min(1).max(IMAGE_REFERENCE_LIMITS.side),
    height: z.number().int().min(1).max(IMAGE_REFERENCE_LIMITS.side),
  })
  .strict();

/** Browser-visible file facts only. A successful check is a point-in-time
 * observation, never a provider permit or publication approval. */
export const imageReferenceCheck = z
  .object({
    version: z.literal(1),
    selectionHash: digest,
    images: z
      .array(referenceManifest.omit({ ownerId: true, projectId: true, assetId: true }))
      .min(1)
      .max(IMAGE_REFERENCE_LIMITS.count),
  })
  .strict();
export type ImageReferenceCheck = z.infer<typeof imageReferenceCheck>;
export async function imageReferenceSetHash(
  prepared: Awaited<ReturnType<typeof prepareImageReference>>[],
) {
  if (prepared.length < 1 || prepared.length > IMAGE_REFERENCE_LIMITS.count)
    throw Error("image_reference_count");
  const first = prepared[0].manifest;
  if (new Set(prepared.map((image) => image.manifest.imageId)).size !== prepared.length)
    throw Error("image_reference_duplicate");
  let bytes = 0,
    pixels = 0;
  for (const image of prepared) {
    const item = referenceManifest.parse(image.manifest);
    if (
      item.ownerId !== first.ownerId ||
      item.projectId !== first.projectId ||
      item.assetId !== first.assetId
    )
      throw Error("image_reference_scope");
    if (image.bytes.byteLength !== item.size || (await sha256(image.bytes)) !== item.sha256)
      throw Error("image_reference_changed");
    const sniffed = validateImageBytes(image.bytes);
    if (!sniffed.ok || contentTypeForFormat(sniffed.format) !== item.contentType)
      throw Error("image_reference_changed");
    const actual = reviewImageDimensions(image.bytes, item.contentType);
    if (actual.width !== item.width || actual.height !== item.height)
      throw Error("image_reference_changed");
    bytes += item.size;
    pixels += item.width * item.height;
  }
  if (bytes > IMAGE_REFERENCE_LIMITS.totalBytes || pixels > IMAGE_REFERENCE_LIMITS.totalPixels)
    throw Error("image_reference_budget");
  return sha256(new TextEncoder().encode(JSON.stringify(prepared.map((image) => image.manifest))));
}
