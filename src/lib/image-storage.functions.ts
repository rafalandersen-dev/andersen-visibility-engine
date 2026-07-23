/**
 * Article Studio image storage — server functions (P1.1 Phase A).
 *
 * Upload → validate (magic bytes) → stage in the PRIVATE bucket → (on approval)
 * promote a copy to the PUBLIC bucket for the permanently-published article →
 * remove. Authenticated-only; the object path is server-generated as
 * `<uid>/<projectId>/<assetId>/<id>.<ext>` and every mutation re-checks that the
 * path's owner segment matches the caller (the service role bypasses RLS, so the
 * server is the enforcement point; the migration's policies are defence-in-depth).
 *
 * The browser-supplied MIME type is ignored — only the sniffed signature counts.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  validateImageBytes,
  storageObjectPath,
  ownerOfPath,
  isValidStorageObjectPath,
  extForFormat,
  contentTypeForFormat,
  MAX_IMAGE_BYTES,
  ARTICLE_IMAGE_BUCKET_PRIVATE,
  ARTICLE_IMAGE_BUCKET_PUBLIC,
} from "./image-storage";

// Base64 of a 5 MB binary is ~6.7 MB; cap the STRING before decoding so an
// oversized payload is rejected without ever materialising the bytes.
const MAX_BASE64_LEN = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 1024;

function b64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Authorise a client-supplied object path. The path MUST first match the exact
 * server shape (no `.`/`..`/traversal — otherwise the URL layer would normalise
 * `<uid>/../<victim>/…` and defeat a first-segment check), THEN its owner segment
 * must be the caller. Belt AND braces to the RLS policies.
 */
function assertOwnedPath(path: string, userId: string): void {
  if (!isValidStorageObjectPath(path) || ownerOfPath(path) !== userId) {
    throw new Error("You do not have access to this asset.");
  }
}

/**
 * Validate bytes (magic-byte sniff) and stage them in the PRIVATE bucket under
 * the server-generated owner path. Shared by the upload fn and the AI
 * image-generation fn — a provider response is untrusted input like any upload.
 */
export async function stageValidatedImageBytes(
  userId: string,
  projectId: string,
  assetId: string,
  bytes: Uint8Array,
): Promise<{ path: string; previewUrl: string }> {
  const check = validateImageBytes(bytes);
  if (!check.ok) {
    const msg =
      check.reason === "too_large"
        ? "Image is too large (max 5 MB)."
        : check.reason === "empty"
          ? "The file was empty."
          : "Unsupported image — only JPEG, PNG and WebP are allowed.";
    throw new Error(msg);
  }
  const id = crypto.randomUUID();
  const path = storageObjectPath(userId, projectId, assetId, id, extForFormat(check.format));
  const db = await admin();
  const { error } = await db.storage
    .from(ARTICLE_IMAGE_BUCKET_PRIVATE)
    .upload(path, bytes, { contentType: contentTypeForFormat(check.format), upsert: false });
  if (error) throw new Error("Could not store the image. Please try again.");
  const { data: signed } = await db.storage
    .from(ARTICLE_IMAGE_BUCKET_PRIVATE)
    .createSignedUrl(path, 3600);
  return { path, previewUrl: signed?.signedUrl ?? "" };
}

export const uploadArticleImageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().min(1),
        assetId: z.string().min(1),
        dataBase64: z.string().min(1).max(MAX_BASE64_LEN),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ path: string; previewUrl: string }> => {
    const userId = context.userId as string;
    const bytes = b64ToBytes(data.dataBase64);
    return stageValidatedImageBytes(userId, data.projectId, data.assetId, bytes);
  });

/**
 * Promote a staged private object to the PUBLIC bucket (on user approval), so the
 * published article can reference a stable public URL. Returns the public URL.
 */
export const promoteArticleImageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ path: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }): Promise<{ publicUrl: string }> => {
    const userId = context.userId as string;
    assertOwnedPath(data.path, userId);
    const db = await admin();
    const dl = await db.storage.from(ARTICLE_IMAGE_BUCKET_PRIVATE).download(data.path);
    if (dl.error || !dl.data) throw new Error("The staged image no longer exists.");
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const check = validateImageBytes(bytes); // re-validate the actual bytes
    if (!check.ok) throw new Error("The stored file is not a valid image.");
    const { error } = await db.storage
      .from(ARTICLE_IMAGE_BUCKET_PUBLIC)
      .upload(data.path, bytes, { contentType: contentTypeForFormat(check.format), upsert: true });
    if (error) throw new Error("Could not publish the image.");
    const { data: pub } = db.storage.from(ARTICLE_IMAGE_BUCKET_PUBLIC).getPublicUrl(data.path);
    return { publicUrl: pub.publicUrl };
  });

/** Remove an object from both buckets (owner-checked). */
export const removeArticleImageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ path: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }): Promise<{ removed: true }> => {
    const userId = context.userId as string;
    assertOwnedPath(data.path, userId);
    const db = await admin();
    await db.storage.from(ARTICLE_IMAGE_BUCKET_PRIVATE).remove([data.path]);
    await db.storage.from(ARTICLE_IMAGE_BUCKET_PUBLIC).remove([data.path]);
    return { removed: true };
  });
