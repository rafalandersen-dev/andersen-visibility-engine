import { acquireMcpImageRequest, type McpImageWorkTracker } from "./mcp-transport.server";
import {
  McpImageError,
  prepareMcpImage,
  reserveMcpImage,
  attachMcpImage,
  imageDigest,
  type McpImageInput,
  type McpImageReceipt,
  type PreparedMcpImage,
} from "./mcp-image";
import {
  ARTICLE_IMAGE_BUCKET_PRIVATE,
  MAX_IMAGE_BYTES,
  contentTypeForFormat,
} from "./image-storage";
import { mutateWorkspace } from "./workspace.server";

export const MCP_IMAGE_STORAGE_TIMEOUT_MS = 10_000;
async function bounded<T>(work: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new McpImageError("unavailable")),
          MCP_IMAGE_STORAGE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function storeImage(
  prepared: PreparedMcpImage,
  receipt: McpImageReceipt,
  track: McpImageWorkTracker,
): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const bucket = supabaseAdmin.storage.from(ARTICLE_IMAGE_BUCKET_PRIVATE);
  const upload = await bounded(
    track(() =>
      bucket.upload(receipt.path, prepared.bytes, {
        upsert: false,
        contentType: contentTypeForFormat(prepared.format),
      }),
    ),
  );
  if (upload.error) {
    // A lost response or simultaneous replay may have stored this exact object.
    // Never overwrite it; only reuse independently checked identical bytes.
    const stored = await bounded(track(() => bucket.download(receipt.path)));
    if (
      stored.error ||
      !stored.data ||
      stored.data.size !== prepared.bytes.length ||
      stored.data.size > MAX_IMAGE_BYTES
    )
      throw new McpImageError("unavailable");
    const bytes = new Uint8Array(await bounded(track(() => stored.data!.arrayBuffer())));
    if ((await imageDigest(bytes)) !== receipt.byteDigest) throw new McpImageError("conflict");
  }
  const signed = await bounded(track(() => bucket.createSignedUrl(receipt.path, 3600)));
  if (signed.error || !signed.data?.signedUrl) throw new McpImageError("unavailable");
  return signed.data.signedUrl;
}
/** No provider, usage claim, arbitrary URL fetch or public storage operation. */
export async function addMcpContentImage(
  userId: string,
  clientId: string,
  input: McpImageInput,
  suppliedTracker?: McpImageWorkTracker,
) {
  const ownLease = suppliedTracker ? null : acquireMcpImageRequest();
  const track = suppliedTracker ?? ownLease!.track;
  try {
    const prepared = await prepareMcpImage(userId, clientId, input);
    const reserved = await bounded(
      track(() =>
        mutateWorkspace<ReturnType<typeof reserveMcpImage>["result"]>(userId, (data) =>
          reserveMcpImage(data, prepared),
        ),
      ),
    );
    if (reserved.result.completed) return reserved.result.completed;
    const receipt = reserved.result.receipt;
    const previewUrl = await storeImage(prepared, receipt, track);
    // Capture after storage, then keep callbacks pure across revision retries.
    // The edit helper also preserves a later current stamp to satisfy newer-wins.
    const ready = { ...prepared, now: new Date().toISOString() };
    const attached = await bounded(
      track(() =>
        mutateWorkspace(userId, (data) => attachMcpImage(data, ready, receipt, previewUrl)),
      ),
    );
    return attached.result;
  } finally {
    ownLease?.();
  }
}
