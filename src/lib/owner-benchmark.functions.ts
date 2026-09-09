import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
const runInput = z.object({ runId: z.string().uuid() }).strict();
const stageInput = z
  .object({ runId: z.string().uuid(), stage: z.enum(["scan", "article", "image"]) })
  .strict();
export const getOwnerBenchmarkStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => runInput.parse(input))
  .handler(async ({ context, data }) => {
    const role = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    if (role.error || role.data !== true) throw new Error("Forbidden");
    const { getOwnerBenchmarkStatus } = await import("./owner-benchmark.server");
    try {
      return await getOwnerBenchmarkStatus(context.userId, data.runId);
    } catch {
      return null;
    }
  });
export const runOwnerBenchmarkStageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => stageInput.parse(input))
  .handler(async ({ context, data }) => {
    const role = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    if (role.error || role.data !== true) throw new Error("Forbidden");
    const { runOwnerBenchmarkStage } = await import("./owner-benchmark.server");
    try {
      return await runOwnerBenchmarkStage(context.userId, data.runId, data.stage);
    } catch {
      return { outcome: "uncertain" as const };
    }
  });
