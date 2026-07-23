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

const LOVABLE_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";

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

function b64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/** Parse a data URL ("data:image/png;base64,...") into bytes. */
function dataUrlToBytes(url: string): Uint8Array | null {
  const m = /^data:image\/[a-z+.-]+;base64,(.+)$/i.exec(url.trim());
  return m ? b64ToBytes(m[1]) : null;
}

async function generateViaLovable(prompt: string): Promise<Uint8Array> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new ImageGenError("Image generation is not configured on this server.");
  const res = await fetch(LOVABLE_GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: LOVABLE_IMAGE_MODEL(),
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });
  if (res.status === 402) {
    throw new ImageGenError("The AI workspace is out of credits — image generation is paused.");
  }
  if (res.status === 429) {
    throw new ImageGenError("Image generation is rate-limited right now. Try again in a minute.");
  }
  if (!res.ok) throw new ImageGenError("The image service returned an error. Please try again.");
  const body = (await res.json()) as {
    choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
  };
  const url = body.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? "";
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
  const res = await fetch(OPENAI_IMAGES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1536x1024", n: 1 }),
  });
  if (!res.ok) throw new ImageGenError("The image service returned an error. Please try again.");
  const body = (await res.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = body.data?.[0]?.b64_json ?? "";
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
