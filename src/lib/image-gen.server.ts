/**
 * Image generation provider seam (server-only).
 *
 * ONE function produces image bytes; which model does it is configuration:
 * - "lovable"  (default): the Lovable AI gateway's Gemini image model — no new
 *   keys, spends the project's Lovable credits. Pre-launch phase only.
 * - "openai": gpt-image-1 via an owner-supplied OPENAI_API_KEY — the owner's
 *   decision (2026-07-24) for BEFORE the product goes live, because Lovable
 *   credits do not scale to every user generating images. Switching is env
 *   config (IMAGE_GEN_PROVIDER=openai + OPENAI_API_KEY), never a rebuild.
 *
 * The caller validates the returned bytes with the SAME magic-byte check the
 * upload path uses — a provider response is untrusted input like any upload.
 */

import { MAX_IMAGE_BYTES } from "./image-storage";

const LOVABLE_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
export const IMAGE_GENERATION_TIMEOUT_MS = 120_000;
// One 5 MiB image in base64 plus bounded JSON/text metadata.
export const IMAGE_RESPONSE_MAX_BYTES = 8 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
const RESPONSE_ERROR = "The image service returned an invalid or oversized response.";

/** Overridable per env in case the gateway renames its image model. */
const LOVABLE_IMAGE_MODEL = () =>
  (process.env.AI_IMAGE_MODEL ?? "").trim() || "google/gemini-2.5-flash-image-preview";

export type ImageGenProvider = "lovable" | "openai";

export function activeImageProvider(): ImageGenProvider {
  return (process.env.IMAGE_GEN_PROVIDER ?? "").trim() === "openai" ? "openai" : "lovable";
}

export class ImageGenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageGenError";
  }
}

function b64ToBytes(b64: unknown): Uint8Array {
  if (
    typeof b64 !== "string" ||
    !b64.length ||
    b64.length > MAX_BASE64_LENGTH ||
    b64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)
  )
    throw new ImageGenError(RESPONSE_ERROR);
  const bytes = Buffer.from(b64, "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || bytes.toString("base64") !== b64) {
    throw new ImageGenError(RESPONSE_ERROR);
  }
  return new Uint8Array(bytes);
}

/** Parse a data URL ("data:image/png;base64,...") into bytes. */
function dataUrlToBytes(url: unknown): Uint8Array | null {
  if (typeof url !== "string" || url.length > MAX_BASE64_LENGTH + 64) return null;
  const m = /^data:image\/(?:png|jpeg|webp);base64,(.+)$/i.exec(url);
  return m ? b64ToBytes(m[1]) : null;
}

/** Fetch and stream decoding share one deadline. A timeout is an uncertain
 * supplier outcome, not proof of cancellation or a refunded usage claim.
 * Never follow redirects with credentials or retry a potentially billed call.
 */
async function imageResponse(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancelBody = () => {
    void reader?.cancel().catch(() => {});
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new ImageGenError(
        "Image generation timed out. The provider may still have processed the request; Milo did not retry it.",
      );
      controller.abort(error);
      cancelBody();
      reject(error);
    }, IMAGE_GENERATION_TIMEOUT_MS);
  });
  const read = async () => {
    const response = await fetch(url, { ...init, redirect: "error", signal: controller.signal });
    reader = response.body?.getReader();
    if (controller.signal.aborted) {
      cancelBody();
      throw controller.signal.reason;
    }
    if (response.status === 402) {
      throw new ImageGenError("The AI workspace is out of credits — image generation is paused.");
    }
    if (response.status === 429) {
      throw new ImageGenError("Image generation is rate-limited right now. Try again in a minute.");
    }
    if (!response.ok)
      throw new ImageGenError(
        "The image service returned an error. Milo did not retry the request.",
      );
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > IMAGE_RESPONSE_MAX_BYTES)) {
      throw new ImageGenError(RESPONSE_ERROR);
    }
    if (!reader) throw new ImageGenError(RESPONSE_ERROR);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (controller.signal.aborted) throw controller.signal.reason;
      if (done) break;
      size += value.byteLength;
      if (size > IMAGE_RESPONSE_MAX_BYTES) throw new ImageGenError(RESPONSE_ERROR);
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  };
  try {
    return await Promise.race([read(), deadline]);
  } catch (error) {
    if (error instanceof ImageGenError) throw error;
    // Provider bodies, prompts, signed links and credentials never enter errors.
    throw new ImageGenError(
      "Image generation could not be completed. Milo did not retry the request.",
    );
  } finally {
    clearTimeout(timer);
    controller.abort();
    cancelBody();
  }
}

async function generateViaLovable(prompt: string): Promise<Uint8Array> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new ImageGenError("Image generation is not configured on this server.");
  const body = (await imageResponse(LOVABLE_GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: LOVABLE_IMAGE_MODEL(),
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  })) as {
    choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
  };
  const url = body?.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? "";
  const bytes = url ? dataUrlToBytes(url) : null;
  if (!bytes || bytes.length === 0) {
    throw new ImageGenError("The model returned no image. Try a more concrete description.");
  }
  return bytes;
}

async function generateViaOpenAi(prompt: string): Promise<Uint8Array> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new ImageGenError(
      "OpenAI image generation is selected but no OPENAI_API_KEY is configured.",
    );
  }
  const body = (await imageResponse(OPENAI_IMAGES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1536x1024", n: 1 }),
  })) as { data?: Array<{ b64_json?: string }> };
  const b64 = body?.data?.[0]?.b64_json ?? "";
  if (!b64)
    throw new ImageGenError("The model returned no image. Try a more concrete description.");
  return b64ToBytes(b64);
}

/** Generate image bytes for a prompt via the configured provider. */
export async function generateImageBytes(prompt: string): Promise<Uint8Array> {
  return activeImageProvider() === "openai"
    ? generateViaOpenAi(prompt)
    : generateViaLovable(prompt);
}
