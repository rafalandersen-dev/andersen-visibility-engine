import { z } from "zod";
import type { ContentAsset, ContentImage, Project } from "./types";
import { applyExternalDraftEdits, assertExternalDraftEditable } from "./external-draft";
import {
  MAX_IMAGE_BYTES,
  validateImageBytes,
  storageObjectPath,
  extForFormat,
} from "./image-storage";

export const MCP_IMAGE_TOOL = "add_content_image";
export const MAX_MCP_IMAGE_RECEIPTS = 200;
export const MAX_MCP_ASSET_IMAGES = 30;
const segment = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const mcpImageSchema = z
  .object({
    projectId: segment,
    contentId: segment,
    requestId: z.string().trim().min(1).max(100),
    dataBase64: z
      .string()
      .min(4)
      .max(4 * Math.ceil(MAX_IMAGE_BYTES / 3)),
    concept: z.string().trim().min(1).max(500),
    alt: z.string().trim().min(1).max(500),
    caption: z.string().trim().max(500).optional(),
  })
  .strict();
export type McpImageInput = z.infer<typeof mcpImageSchema>;
export const mcpImageReceiptSchema = z
  .object({
    requestId: z.string().min(1).max(100),
    clientId: z.string().min(1).max(512),
    contentId: segment,
    imageId: z.string().uuid(),
    fingerprint: digest,
    byteDigest: digest,
    path: z.string().max(280),
    state: z.enum(["reserved", "attached"]),
  })
  .strict();
export type McpImageReceipt = z.infer<typeof mcpImageReceiptSchema>;
export class McpImageError extends Error {
  constructor(readonly reason: "invalid" | "not_found" | "conflict" | "capacity" | "unavailable") {
    super(reason);
  }
}
export async function imageDigest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function prepareMcpImage(userId: string, clientId: string, input: McpImageInput) {
  if (!segment.safeParse(userId).success || !clientId || clientId.length > 512)
    throw new McpImageError("invalid");
  // Strict canonical base64: no data URLs, whitespace, ignored characters or
  // extra trailing data accepted by permissive Buffer decoders.
  const encoded = input.dataBase64;
  if (encoded.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))
    throw new McpImageError("invalid");
  const bytes = new Uint8Array(Buffer.from(encoded, "base64"));
  if (Buffer.from(bytes).toString("base64") !== encoded) throw new McpImageError("invalid");
  const check = validateImageBytes(bytes);
  if (!check.ok) throw new McpImageError("invalid");
  const byteDigest = await imageDigest(bytes);
  const fingerprint = await imageDigest(
    new TextEncoder().encode(
      JSON.stringify({
        userId,
        clientId,
        projectId: input.projectId,
        contentId: input.contentId,
        requestId: input.requestId,
        byteDigest,
        concept: input.concept,
        alt: input.alt,
        caption: input.caption ?? "",
      }),
    ),
  );
  const imageId = crypto.randomUUID();
  const receipt: McpImageReceipt = {
    requestId: input.requestId,
    clientId,
    contentId: input.contentId,
    imageId,
    fingerprint,
    byteDigest,
    path: storageObjectPath(
      userId,
      input.projectId,
      input.contentId,
      imageId,
      extForFormat(check.format),
    ),
    state: "reserved",
  };
  return { userId, input, bytes, format: check.format, receipt, now: new Date().toISOString() };
}
export type PreparedMcpImage = Awaited<ReturnType<typeof prepareMcpImage>>;
function target(data: Record<string, unknown>, prepared: PreparedMcpImage) {
  const projects = Array.isArray(data.projects) ? (data.projects as Project[]) : [];
  const content = Array.isArray(data.content) ? (data.content as ContentAsset[]) : [];
  const project = projects.find((p) => p?.id === prepared.input.projectId);
  const asset = content.find(
    (c) => c?.id === prepared.input.contentId && c.projectId === project?.id,
  );
  if (!project || !asset) throw new McpImageError("not_found");
  const parsed = z
    .array(mcpImageReceiptSchema)
    .max(MAX_MCP_IMAGE_RECEIPTS)
    .safeParse(project.mcpImageRequests ?? []);
  if (!parsed.success) throw new McpImageError("conflict");
  const receipts = parsed.data;
  const previous = receipts.find(
    (r) => r.clientId === prepared.receipt.clientId && r.requestId === prepared.input.requestId,
  );
  if (
    previous &&
    (previous.fingerprint !== prepared.receipt.fingerprint ||
      previous.contentId !== asset.id ||
      previous.byteDigest !== prepared.receipt.byteDigest ||
      previous.path !==
        storageObjectPath(
          prepared.userId,
          project.id,
          asset.id,
          previous.imageId,
          extForFormat(prepared.format),
        ))
  )
    throw new McpImageError("conflict");
  return { projects, content, project, asset, receipts, previous };
}
function attachedResult(asset: ContentAsset, receipt: McpImageReceipt) {
  const image = asset.images?.find((i) => i.id === receipt.imageId);
  // A replay never recreates an owner-removed image or rewrites later edits.
  if (!image || image.storagePath !== receipt.path) throw new McpImageError("conflict");
  return {
    contentId: asset.id,
    imageId: image.id,
    status: image.status,
    deduped: true,
    editorPath: `/app/editor?id=${encodeURIComponent(asset.id)}`,
  };
}
/** Pure revision callback; the reservation binds bytes/metadata before storage I/O. */
export function reserveMcpImage(data: Record<string, unknown>, prepared: PreparedMcpImage) {
  const { projects, project, asset, receipts, previous } = target(data, prepared);
  if (previous?.state === "attached")
    return { data, result: { receipt: previous, completed: attachedResult(asset, previous) } };
  assertExternalDraftEditable(asset);
  if (!Array.isArray(asset.images ?? []) || (asset.images?.length ?? 0) >= MAX_MCP_ASSET_IMAGES)
    throw new McpImageError("capacity");
  if (previous) return { data, result: { receipt: previous, completed: null } };
  if (receipts.length >= MAX_MCP_IMAGE_RECEIPTS) throw new McpImageError("capacity");
  return {
    data: {
      ...data,
      projects: projects.map((p) =>
        p.id === project.id ? { ...p, mcpImageRequests: [...receipts, prepared.receipt] } : p,
      ),
    },
    result: { receipt: prepared.receipt, completed: null },
  };
}
/** Recheck draft state and ownership after upload; preserve concurrent content/image edits. */
export function attachMcpImage(
  data: Record<string, unknown>,
  prepared: PreparedMcpImage,
  receipt: McpImageReceipt,
  previewUrl: string,
) {
  const { projects, content, project, asset, receipts, previous } = target(data, prepared);
  if (!previous || previous.imageId !== receipt.imageId || previous.path !== receipt.path)
    throw new McpImageError("conflict");
  if (previous.state === "attached") return { data, result: attachedResult(asset, previous) };
  assertExternalDraftEditable(asset);
  if (!Array.isArray(asset.images ?? []) || (asset.images?.length ?? 0) >= MAX_MCP_ASSET_IMAGES)
    throw new McpImageError("capacity");
  if (asset.images?.some((i) => i.id === receipt.imageId || i.storagePath === receipt.path))
    throw new McpImageError("conflict");
  const image: ContentImage = {
    id: receipt.imageId,
    concept: prepared.input.concept,
    alt: prepared.input.alt,
    ...(prepared.input.caption ? { caption: prepared.input.caption } : {}),
    storagePath: receipt.path,
    previewUrl,
    placement: "inline",
    source: "uploaded",
    status: "proposed",
    required: false,
  };
  const next = applyExternalDraftEdits(
    asset,
    { images: [...(asset.images ?? []), image] },
    prepared.now,
  );
  return {
    data: {
      ...data,
      projects: projects.map((p) =>
        p.id === project.id
          ? {
              ...p,
              mcpImageRequests: receipts.map((r) =>
                r.imageId === receipt.imageId ? { ...r, state: "attached" as const } : r,
              ),
            }
          : p,
      ),
      content: content.map((c) => (c.id === asset.id ? next : c)),
    },
    result: {
      contentId: asset.id,
      imageId: receipt.imageId,
      status: "proposed",
      deduped: false,
      editorPath: `/app/editor?id=${encodeURIComponent(asset.id)}`,
    },
  };
}
