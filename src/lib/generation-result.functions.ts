import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
const idInput = z.object({ receiptId: z.string().uuid() }).strict();
const listInput = z
  .object({
    projectId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,64}$/)
      .optional(),
    cursor: z
      .object({ createdAt: z.string().datetime({ offset: true }), id: z.string().uuid() })
      .strict()
      .optional(),
  })
  .strict();
export const getGenerationImageDownloadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => idInput.parse(v))
  .handler(async ({ data, context }) => {
    const { getGenerationImageDownload } = await import("./generation-result-download.server");
    return getGenerationImageDownload(context.userId, data.receiptId);
  });
export const listGenerationResultsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => listInput.parse(v))
  .handler(async ({ data, context }) => {
    const { listGenerationResults } = await import("./generation-result.server");
    return listGenerationResults(context.userId, data.projectId, data.cursor);
  });
export const readGenerationResultFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => idInput.parse(v))
  .handler(async ({ data, context }) => {
    const { readGenerationResult } = await import("./generation-result.server");
    return readGenerationResult(context.userId, data.receiptId);
  });
export const discardGenerationResultFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => idInput.parse(v))
  .handler(async ({ data, context }) => {
    const { discardGenerationResult } = await import("./generation-result.server");
    await discardGenerationResult(context.userId, data.receiptId);
    return { discarded: true };
  });
export const recoverGenerationResultFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => idInput.parse(v))
  .handler(async ({ data, context }) => {
    const { recoverGenerationResult } = await import("./generation-recovery.server");
    try {
      return await recoverGenerationResult(context.userId, data.receiptId);
    } catch {
      throw new Error(
        "Milo could not restore this result. Refresh and check the current draft before trying again.",
      );
    }
  });
