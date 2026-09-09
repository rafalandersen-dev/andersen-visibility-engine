import { randomUUID } from "node:crypto";
import { AI_USAGE_LOOKUP_TIMEOUT_MS, claimAiUsage } from "./ai-usage.server";
import type { NativeExpenseContext } from "./ai-provider-expense.server";

type GenerationUsage = {
  userId: string;
  bucket: "contentGeneration" | "imageGeneration";
  operation: "generateContentCore" | "generateContentAssetFn" | "generateArticleImageCore";
  enforceLimit?: boolean;
  attempt?: NativeExpenseContext["attempt"];
};

async function settle(id: string, userId: string, outcome: "completed" | "released") {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as {
      rpc(
        name: string,
        args: Record<string, unknown>,
      ): PromiseLike<{ data: unknown; error: unknown }>;
    };
    const response = await Promise.race([
      admin.rpc("settle_generation_usage", { p_id: id, p_user: userId, p_outcome: outcome }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("usage_settlement_timeout")),
          AI_USAGE_LOOKUP_TIMEOUT_MS,
        );
      }),
    ]);
    const rows = response?.data;
    if (
      response?.error ||
      !Array.isArray(rows) ||
      rows.length !== 1 ||
      rows[0]?.receipt_id !== id ||
      rows[0]?.state !== outcome
    )
      throw new Error("usage_settlement_unconfirmed");
  } catch {
    // A late commit remains possible. Do not promise a refund, retry the
    // provider, expose supplier messages, or discard an otherwise valid result.
    console.error("[generation-usage] settlement unconfirmed", { receiptId: id, outcome });
  } finally {
    clearTimeout(timer);
  }
}

/** Counts a server-produced result, with a confirmed technical-failure refund.
 * This is not yet proof of delivery to the browser or durable workspace save.
 * Failed/unknown quota claims never start work and are not blindly released.
 * Supplier money/attempt permits remain entirely separate and are never reset.
 */
export async function withGenerationUsage<T>(
  args: GenerationUsage,
  work: (attempt: NonNullable<NativeExpenseContext["attempt"]>, receiptId: string) => Promise<T>,
  retain?: (result: T) => Promise<void>,
): Promise<T> {
  const id = randomUUID();
  const attempt = args.attempt ?? { requestId: randomUUID(), jobId: id };
  await claimAiUsage({
    userId: args.userId,
    bucket: args.bucket,
    enforceLimit: args.enforceLimit,
    generationReceipt: { id, operation: args.operation, nativeAttemptId: attempt.requestId },
  });
  let result: T;
  try {
    result = await work(attempt, id);
  } catch (error) {
    await settle(id, args.userId, "released");
    throw error;
  }
  // A retention timeout can still commit. Keep this outside the failure/refund
  // block: the result may already be durable, and no provider retry is safe.
  if (retain) await retain(result);
  else await settle(id, args.userId, "completed");
  return result;
}
