import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  backlinkMonitoringRequest,
  backlinkMonitoringHistoryInput,
  backlinkMonitoringRecoveryInput,
} from "./backlink-monitoring-history";
export const readBacklinkMonitoringHistoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => backlinkMonitoringHistoryInput.parse(v))
  .handler(async ({ context, data }) => {
    const { readBacklinkMonitoringHistory } = await import("./backlink-monitoring-history.server");
    return readBacklinkMonitoringHistory(context.userId, data);
  });
export const requestBacklinkMonitoringFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => backlinkMonitoringRequest.parse(v))
  .handler(async ({ context, data }) => {
    const { runBacklinkMonitoring } = await import("./backlink-monitoring-lifecycle.server");
    try {
      return await runBacklinkMonitoring(context.userId, data);
    } catch {
      return { state: "unavailable" as const, requestId: data.requestId };
    }
  });
export const recoverBacklinkMonitoringAccountingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => backlinkMonitoringRecoveryInput.parse(v))
  .handler(async ({ context, data }) => {
    const { recoverBacklinkMonitoringAccounting } =
      await import("./backlink-monitoring-history.server");
    return recoverBacklinkMonitoringAccounting(context.userId, data);
  });
