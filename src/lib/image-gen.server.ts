/** Direct OpenAI image generation (owner decision, 2026-09-08).
 * A missing key stops generation; no Lovable AI fallback exists. Returned bytes
 * still pass the shared upload validation and private staging before approval.
 */

import { MAX_IMAGE_BYTES } from "./image-storage";

const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
export const IMAGE_GENERATION_TIMEOUT_MS = 120_000;
// One 5 MiB image in base64 plus bounded JSON/text metadata.
export const IMAGE_RESPONSE_MAX_BYTES = 8 * 1024 * 1024;
export const IMAGE_RESPONSE_MAX_CHUNKS = 16_384;
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
const RESPONSE_ERROR = "The image service returned an invalid or oversized response.";

export const IMAGE_PROMPT_MAX_BYTES = 8 * 1024;
export const OPENAI_IMAGE_MODEL = "gpt-image-2-2026-04-21";
export type ImageGenProvider = "openai";

export function activeImageProvider(): ImageGenProvider {
  return "openai";
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
      throw new ImageGenError(
        "The image service requires a billing update — image generation is paused.",
      );
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
    // Fixed storage also bounds overhead from many tiny stream chunks.
    const bytes = new Uint8Array(IMAGE_RESPONSE_MAX_BYTES);
    let chunkCount = 0;
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (controller.signal.aborted) throw controller.signal.reason;
      if (done) break;
      chunkCount++;
      if (
        chunkCount > IMAGE_RESPONSE_MAX_CHUNKS ||
        size + value.byteLength > IMAGE_RESPONSE_MAX_BYTES
      ) {
        throw new ImageGenError(RESPONSE_ERROR);
      }
      bytes.set(value, size);
      size += value.byteLength;
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)),
    ) as unknown;
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

async function generateViaOpenAi(prompt: string): Promise<Uint8Array> {
  const key = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!key) {
    throw new ImageGenError(
      "Image generation is not configured. The workspace owner needs to connect OpenAI.",
    );
  }
  const body = (await imageResponse(OPENAI_IMAGES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
      prompt,
      size: "1536x1024",
      n: 1,
      quality: "medium",
      output_format: "webp",
      output_compression: 85,
      background: "opaque",
      moderation: "auto",
    }),
  })) as { data?: Array<{ b64_json?: string }> };
  const b64 = body?.data?.[0]?.b64_json ?? "";
  if (!b64)
    throw new ImageGenError("The model returned no image. Try a more concrete description.");
  return b64ToBytes(b64);
}

/** Generate one image with fixed rendering cost parameters and no retries. */
export async function generateImageBytes(prompt: string): Promise<Uint8Array> {
  if (
    typeof prompt !== "string" ||
    !prompt.trim() ||
    prompt.length > IMAGE_PROMPT_MAX_BYTES ||
    new TextEncoder().encode(prompt).byteLength > IMAGE_PROMPT_MAX_BYTES
  )
    throw new ImageGenError("The image description is empty or too long for one request.");
  return generateViaOpenAi(prompt);
}
