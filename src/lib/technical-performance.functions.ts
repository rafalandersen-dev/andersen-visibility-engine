import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { performanceProject, performanceRequest } from "./technical-performance.server";
export const listTechnicalPerformanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => performanceProject.parse(raw))
  .handler(async ({ data, context }) => {
    const { listTechnicalPerformance } = await import("./technical-performance.server");
    return listTechnicalPerformance(context.userId, data);
  });
export const requestTechnicalPerformanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => performanceRequest.parse(raw))
  .handler(async ({ data, context }) => {
    const { requestTechnicalPerformance } = await import("./technical-performance.server");
    return requestTechnicalPerformance(context.userId, data);
  });
