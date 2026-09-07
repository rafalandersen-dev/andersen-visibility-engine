/** Isolated Stripe test-mode acceptance. Never grants production entitlements. */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const STRIPE_SANDBOX_API_VERSION = "2024-06-20";
export const STRIPE_SANDBOX_BODY_LIMIT = 262_144;
const identity = z
  .string()
  .regex(/^[a-z]+_[A-Za-z0-9_]+$/)
  .max(255);
export const stripeSandboxCheckoutInput = z.object({ requestId: z.string().uuid() }).strict();
export class StripeSandboxError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "StripeSandboxError";
  }
}
type Env = Record<string, string | undefined>;
export function stripeSandboxConfig(env: Env = process.env) {
  const enabled = env.MILO_STRIPE_SANDBOX_ENABLED === "true";
  const apiKey = env.STRIPE_SANDBOX_SECRET_KEY?.trim() ?? "";
  const priceId = env.STRIPE_SANDBOX_PRICE_ID?.trim() ?? "";
  const webhookSecret = env.STRIPE_SANDBOX_WEBHOOK_SECRET?.trim() ?? "";
  // An explicit test key is mandatory even for webhook acceptance.
  const testKey = /^sk_test_[A-Za-z0-9]+$/.test(apiKey);
  return {
    enabled,
    apiKey,
    priceId,
    webhookSecret,
    checkoutReady: enabled && testKey && /^price_[A-Za-z0-9]+$/.test(priceId),
    webhookReady: enabled && testKey && /^whsec_[A-Za-z0-9]+$/.test(webhookSecret),
  };
}
async function boundedText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StripeSandboxError("body_timeout")), 15_000);
  });
  try {
    for (;;) {
      const { value, done } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > STRIPE_SANDBOX_BODY_LIMIT) throw new StripeSandboxError("body_too_large");
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(joined);
}
export async function createStripeSandboxCheckout(
  userId: string,
  requestId: string,
  deps: { env?: Env; fetch?: typeof fetch } = {},
): Promise<{ checkoutUrl: string; sessionId: string }> {
  z.string().uuid().parse(userId);
  stripeSandboxCheckoutInput.parse({ requestId });
  const config = stripeSandboxConfig(deps.env);
  if (!config.checkoutReady) throw new StripeSandboxError("not_configured");
  const form = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": config.priceId,
    "line_items[0][quantity]": "1",
    customer_email: "rafi@anderseninnovations.com",
    client_reference_id: userId,
    "metadata[milo_sandbox]": "true",
    "subscription_data[metadata][milo_sandbox]": "true",
    success_url: "https://milogrowth.com/app/billing?stripe_test=returned",
    cancel_url: "https://milogrowth.com/app/billing?stripe_test=cancelled",
  });
  try {
    const response = await (deps.fetch ?? fetch)("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": STRIPE_SANDBOX_API_VERSION,
        "Idempotency-Key": `milo-sandbox:${userId}:${requestId}`,
      },
      body: form,
    });
    if (!response.ok) throw new StripeSandboxError("provider_unavailable");
    const data = JSON.parse(await boundedText(response));
    if (
      data.livemode !== false ||
      typeof data.id !== "string" ||
      !/^cs_test_[A-Za-z0-9]+$/.test(data.id)
    )
      throw new StripeSandboxError("unexpected_mode");
    const url = new URL(data.url);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "checkout.stripe.com" ||
      url.port ||
      url.username ||
      url.password
    )
      throw new StripeSandboxError("unexpected_checkout_url");
    return { checkoutUrl: url.href, sessionId: data.id };
  } catch (error) {
    if (error instanceof StripeSandboxError) throw error;
    // Includes uncertain timeout: the caller keeps requestId instead of creating another attempt.
    throw new StripeSandboxError("provider_unavailable");
  }
}
function signatureValid(header: string | null, raw: string, key: string, now: number): boolean {
  if (!header || header.length > 4096) return false;
  const parts = header.split(",").map((part) => part.trim().split("="));
  const timestamps = parts.filter(([name]) => name === "t").map(([, value]) => value);
  if (timestamps.length !== 1 || !/^\d{1,12}$/.test(timestamps[0] ?? "")) return false;
  const ts = Number(timestamps[0]);
  if (!Number.isFinite(now) || Math.abs(now / 1000 - ts) > 300) return false;
  const expected = createHmac("sha256", key).update(`${timestamps[0]}.${raw}`).digest();
  return parts.some(
    ([name, value]) =>
      name === "v1" &&
      /^[a-fA-F0-9]{64}$/.test(value ?? "") &&
      timingSafeEqual(expected, Buffer.from(value, "hex")),
  );
}
const eventSchema = z.object({
  id: z
    .string()
    .regex(/^evt_[A-Za-z0-9]+$/)
    .max(255),
  type: z.string().min(1).max(120),
  created: z.number().int().nonnegative(),
  livemode: z.literal(false),
  data: z.object({ object: z.object({ id: identity }).passthrough() }),
});
export interface SandboxReceipt {
  eventId: string;
  eventType: string;
  eventCreated: number;
  objectId: string;
  fingerprint: string;
}
/** Raw body is verified then discarded. Receipts are metadata only, in a separate table. */
export async function receiveStripeSandboxWebhook(
  request: Request,
  record: (receipt: SandboxReceipt) => Promise<"recorded" | "duplicate">,
  deps: { env?: Env; now?: number } = {},
): Promise<Response> {
  const config = stripeSandboxConfig(deps.env);
  if (!config.webhookReady) return new Response("Test webhook not configured", { status: 503 });
  let raw: string;
  try {
    raw = await boundedText(new Response(request.body));
  } catch {
    return new Response("Invalid body", { status: 413 });
  }
  if (
    !signatureValid(
      request.headers.get("stripe-signature"),
      raw,
      config.webhookSecret,
      deps.now ?? Date.now(),
    )
  )
    return new Response("Invalid signature", { status: 401 });
  let event: z.infer<typeof eventSchema>;
  try {
    event = eventSchema.parse(JSON.parse(raw));
  } catch {
    return new Response("Invalid test event", { status: 400 });
  }
  try {
    const outcome = await record({
      eventId: event.id,
      eventType: event.type,
      eventCreated: event.created,
      objectId: event.data.object.id,
      fingerprint: createHash("sha256").update(raw).digest("hex"),
    });
    return Response.json({ testMode: true, receipt: outcome, entitlementChanged: false });
  } catch {
    return new Response("Test receipt unavailable", { status: 503 });
  }
}
export async function recordStripeSandboxReceipt(receipt: SandboxReceipt) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  const result = await db.rpc("record_stripe_sandbox_event", {
    p_event: receipt.eventId,
    p_type: receipt.eventType,
    p_created: receipt.eventCreated,
    p_object: receipt.objectId,
    p_fingerprint: receipt.fingerprint,
  });
  if (result.error || !["recorded", "duplicate"].includes(String(result.data)))
    throw new StripeSandboxError("receipt_unavailable");
  return result.data as "recorded" | "duplicate";
}
