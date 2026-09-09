import { z } from "zod";
import {
  generatedContentResultSchema,
  generatedImageResultSchema,
  parseGenerationResult,
} from "./generation-result";
type Response = { data: unknown; error: unknown };
export type GenerationResultRpc = (
  name: string,
  params: Record<string, unknown>,
) => PromiseLike<Response>;
const instant = z.string().datetime({ offset: true });
const identity = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
export const generationResultCursor = z
  .object({ createdAt: instant, id: z.string().uuid() })
  .strict();
const summarySchema = z
  .object({
    receipt_id: z.string().uuid(),
    created_at: instant,
    kind: z.enum(["content", "image"]),
    project_id: identity,
    title: z.string().min(1).max(300),
  })
  .strict();
export const GENERATION_RESULT_TIMEOUT_MS = 10_000;
export class GenerationResultUnavailableError extends Error {
  readonly code = "generation_result_unavailable";
  constructor() {
    super(
      "Milo could not confirm the saved result. Check Recent generations before starting again.",
    );
  }
}
async function call(
  name: string,
  params: Record<string, unknown>,
  injected?: GenerationResultRpc,
): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let rpc = injected;
    if (!rpc) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as unknown as { rpc: GenerationResultRpc };
      rpc = (n, p) => admin.rpc(n, p);
    }
    const result = await Promise.race([
      rpc(name, params),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new GenerationResultUnavailableError()),
          GENERATION_RESULT_TIMEOUT_MS,
        );
      }),
    ]);
    if (!result || result.error) throw new GenerationResultUnavailableError();
    return result.data;
  } catch {
    throw new GenerationResultUnavailableError();
  } finally {
    clearTimeout(timer);
  }
}
export async function retainGenerationResult(
  userId: string,
  receiptId: string,
  payload: unknown,
  rpc?: GenerationResultRpc,
) {
  let parsed;
  try {
    parsed = parseGenerationResult(payload, userId);
  } catch {
    throw new GenerationResultUnavailableError();
  }
  const data = await call(
    "record_generation_result",
    { p_id: receiptId, p_user: userId, p_result: parsed },
    rpc,
  );
  const confirmation = z
    .array(z.object({ receipt_id: z.literal(receiptId), state: z.literal("retained") }))
    .length(1)
    .safeParse(data);
  if (!confirmation.success) throw new GenerationResultUnavailableError();
}

const contentTarget = generatedContentResultSchema.omit({ output: true, assetId: true });
const imageTarget = generatedImageResultSchema.omit({ output: true, imageId: true });
export function contentRecoveryTarget(args: {
  projectId: string;
  opportunityId: string;
  title: string;
  language: string;
  assetType: string;
}) {
  return contentTarget.parse({ version: 1, kind: "content", ...args });
}
export function imageRecoveryTarget(args: {
  projectId: string;
  assetId: string;
  title: string;
  concept: string;
}) {
  return imageTarget.parse({ version: 1, kind: "image", ...args });
}
export async function retainContentGeneration(
  userId: string,
  target: z.infer<typeof contentTarget>,
  result: { generationReceiptId: string; resultId: string },
) {
  const { generationReceiptId, resultId, ...output } = result;
  await retainGenerationResult(userId, generationReceiptId, {
    ...target,
    assetId: resultId,
    output,
  });
}
export async function retainImageGeneration(
  userId: string,
  target: z.infer<typeof imageTarget>,
  result: { generationReceiptId: string; resultId: string; path: string; alt: string },
) {
  await retainGenerationResult(userId, result.generationReceiptId, {
    ...target,
    imageId: result.resultId,
    output: { path: result.path, alt: result.alt },
  });
}
export async function listGenerationResults(
  userId: string,
  projectId?: string,
  cursor?: z.infer<typeof generationResultCursor>,
  rpc?: GenerationResultRpc,
) {
  const after = cursor ? generationResultCursor.parse(cursor) : undefined;
  const data = await call(
    "list_generation_results",
    {
      p_user: userId,
      p_project: projectId ? identity.parse(projectId) : null,
      p_before: after?.createdAt ?? null,
      p_before_id: after?.id ?? null,
    },
    rpc,
  );
  const parsed = z.array(summarySchema).max(20).safeParse(data);
  if (!parsed.success) throw new GenerationResultUnavailableError();
  const rows = parsed.data;
  if (
    new Set(rows.map((r) => r.receipt_id)).size !== rows.length ||
    rows.some((r) => projectId && r.project_id !== projectId)
  )
    throw new GenerationResultUnavailableError();
  const last = rows.at(-1);
  return {
    items: rows.map((r) => ({
      id: r.receipt_id,
      createdAt: r.created_at,
      kind: r.kind,
      projectId: r.project_id,
      title: r.title,
    })),
    nextCursor:
      rows.length === 20 && last ? { id: last.receipt_id, createdAt: last.created_at } : null,
  };
}
export async function readGenerationResult(
  userId: string,
  receiptId: string,
  rpc?: GenerationResultRpc,
) {
  const data = await call("read_generation_result", { p_user: userId, p_id: receiptId }, rpc);
  const parsed = z
    .array(
      z
        .object({ receipt_id: z.literal(receiptId), created_at: instant, payload: z.unknown() })
        .strict(),
    )
    .max(1)
    .safeParse(data);
  if (!parsed.success) throw new GenerationResultUnavailableError();
  if (!parsed.data[0]) return null;
  try {
    return {
      id: receiptId,
      createdAt: parsed.data[0].created_at,
      result: parseGenerationResult(parsed.data[0].payload, userId),
    };
  } catch {
    throw new GenerationResultUnavailableError();
  }
}
export async function discardGenerationResult(
  userId: string,
  receiptId: string,
  rpc?: GenerationResultRpc,
) {
  const data = await call("discard_generation_result", { p_user: userId, p_id: receiptId }, rpc);
  if (
    !z
      .array(z.object({ receipt_id: z.literal(receiptId), state: z.literal("discarded") }))
      .length(1)
      .safeParse(data).success
  )
    throw new GenerationResultUnavailableError();
}
