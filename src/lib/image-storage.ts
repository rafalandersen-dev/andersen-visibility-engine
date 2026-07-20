/**
 * Article Studio image storage — validation core (Phase A, pure).
 *
 * Security rules enforced BEFORE any object is written (see image-storage.functions.ts):
 *  - actual file-SIGNATURE sniffing (never trust the browser MIME type),
 *  - allow only JPEG / PNG / WebP raster formats,
 *  - reject SVG / HTML / anything that isn't one of those signatures (incl. the
 *    common polyglot vectors, which don't start with an image magic number),
 *  - a hard size cap,
 *  - server-controlled object paths (no client filename, no traversal).
 *
 * Two-bucket lifecycle (private staged → public approved) lives in the migration
 * + the server fns; this module is the deterministic, unit-tested gate.
 */

export const ALLOWED_IMAGE_FORMATS = ["jpeg", "png", "webp"] as const;
export type ImageFormat = (typeof ALLOWED_IMAGE_FORMATS)[number];

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export const ARTICLE_IMAGE_BUCKET_PRIVATE = "article-assets-private";
export const ARTICLE_IMAGE_BUCKET_PUBLIC = "article-assets-public";

/** Detect the format from the file's magic bytes, or null if it isn't an allowed raster image. */
export function sniffImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  // WebP: "RIFF"....(size)...."WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export function extForFormat(format: ImageFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

export function contentTypeForFormat(format: ImageFormat): string {
  return `image/${format}`;
}

export type ImageRejectReason = "empty" | "too_large" | "unsupported_format";
export type ImageValidation =
  { ok: true; format: ImageFormat } | { ok: false; reason: ImageRejectReason };

/** Validate raw bytes: non-empty, within the size cap, and a real allowed raster image. */
export function validateImageBytes(bytes: Uint8Array): ImageValidation {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, reason: "too_large" };
  const format = sniffImageFormat(bytes);
  // Anything that isn't a JPEG/PNG/WebP signature — SVG, HTML, scripts, polyglots
  // that don't lead with an image magic number — is rejected here.
  if (!format) return { ok: false, reason: "unsupported_format" };
  return { ok: true, format };
}

/** Strip a path segment to a safe token — blocks traversal (`..`, `/`) and odd chars. */
function safeSegment(s: string): string {
  return (s || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

/**
 * The server-controlled object path: `<userId>/<projectId>/<assetId>/<id>.<ext>`.
 * The first segment is the owning auth user (matched by the Storage RLS policy);
 * the client filename is never used, so there is no traversal or collision.
 */
export function storageObjectPath(
  userId: string,
  projectId: string,
  assetId: string,
  id: string,
  ext: string,
): string {
  return [
    safeSegment(userId),
    safeSegment(projectId),
    safeSegment(assetId),
    `${safeSegment(id)}.${safeSegment(ext)}`,
  ].join("/");
}

/** The owning user id of an object path (its first segment) — used to authorise access. */
export function ownerOfPath(path: string): string {
  return (path || "").split("/")[0] ?? "";
}
