import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
const project = z.object({ projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }).strict();
const run = project.extend({ runId: z.string().uuid() }).strict();
export const startTechnicalCrawlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => run.parse(v))
  .handler(async ({ context, data }) => {
    const { startTechnicalRun } = await import("./technical-crawl.server");
    return startTechnicalRun(context.userId, data);
  });
export const stepTechnicalCrawlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => run.parse(v))
  .handler(async ({ context, data }) => {
    const { stepTechnicalRun } = await import("./technical-crawl.server");
    return stepTechnicalRun(context.userId, data);
  });
export const readTechnicalCrawlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => run.parse(v))
  .handler(async ({ context, data }) => {
    const { readTechnicalRun } = await import("./technical-crawl.server");
    return readTechnicalRun(context.userId, data);
  });
export const cancelTechnicalCrawlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => run.parse(v))
  .handler(async ({ context, data }) => {
    const { cancelTechnicalRun } = await import("./technical-crawl.server");
    return cancelTechnicalRun(context.userId, data);
  });
export const listTechnicalCrawlsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => project.parse(v))
  .handler(async ({ context, data }) => {
    const { listTechnicalRuns } = await import("./technical-crawl.server");
    return listTechnicalRuns(context.userId, data);
  });
