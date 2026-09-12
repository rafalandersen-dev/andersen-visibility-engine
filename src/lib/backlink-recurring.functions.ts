import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { backlinkRecurringRead, backlinkRecurringSave } from "./backlink-recurring-config";
export const readBacklinkMonitorConfigFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => backlinkRecurringRead.parse(v))
  .handler(async ({ context, data }) => {
    const { readBacklinkMonitorConfig } = await import("./backlink-recurring-config.server");
    return readBacklinkMonitorConfig(context.userId, data);
  });
export const saveBacklinkMonitorConfigFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => backlinkRecurringSave.parse(v))
  .handler(async ({ context, data }) => {
    const { saveBacklinkMonitorConfig } = await import("./backlink-recurring-config.server");
    try {
      return await saveBacklinkMonitorConfig(context.userId, data);
    } catch {
      return { state: "unavailable" as const };
    }
  });
