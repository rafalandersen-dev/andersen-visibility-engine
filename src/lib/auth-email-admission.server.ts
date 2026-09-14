/** Shared signup/recovery admission. Existing service-role-only atomic counters;
 * no recipient addresses or authentication secrets are stored as counter keys.
 * Fixed windows can admit adjacent-window bursts; these are request limits,
 * not inbox delivery counts or complete bot protection.
 */
export interface AuthEmailCounter {
  rpc(
    name: "bump_rate_limit",
    args: {
      p_bucket: string;
      p_key: string;
      p_window_start: string;
    },
  ): PromiseLike<{ data: unknown; error: unknown }>;
}
const RULES = [
  { bucket: "auth_email_recipient_minute", seconds: 60, limit: 1, recipient: true },
  { bucket: "auth_email_recipient_hour", seconds: 3600, limit: 6, recipient: true },
  { bucket: "auth_email_global_hour", seconds: 3600, limit: 120, recipient: false },
] as const;
const UNAVAILABLE = "Email requests are temporarily unavailable. Please try again later.";

export async function admitAuthEmail(
  counter: AuthEmailCounter,
  email: string,
  secret: string,
  nowMs = Date.now(),
): Promise<void> {
  if (!secret || !Number.isFinite(nowMs)) throw new Error(UNAVAILABLE);
  // HMAC prevents offline address guessing from a counter-table disclosure.
  const encoder = new TextEncoder();
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch {
    throw new Error(UNAVAILABLE);
  }
  for (const rule of RULES) {
    let count: unknown;
    try {
      const identity = rule.recipient ? email.trim().toLowerCase() : "all";
      const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(`${rule.bucket}:${identity}`),
      );
      const digest = Array.from(new Uint8Array(signature), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      const result = await counter.rpc("bump_rate_limit", {
        p_bucket: rule.bucket,
        p_key: digest,
        p_window_start: new Date(
          Math.floor(nowMs / (rule.seconds * 1000)) * rule.seconds * 1000,
        ).toISOString(),
      });
      if (result.error) throw new Error(UNAVAILABLE);
      count = result.data;
      if (
        typeof count !== "number" ||
        !Number.isSafeInteger(count) ||
        count < 1 ||
        count > 2_147_483_647
      )
        throw new Error(UNAVAILABLE);
    } catch {
      throw new Error(UNAVAILABLE);
    }
    if ((count as number) > rule.limit)
      throw new Error("Too many email requests. Please wait before trying again.");
  }
}
