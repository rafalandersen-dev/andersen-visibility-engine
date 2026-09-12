import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  backlinkPageRequest,
  backlinkDetailsHistoryInput,
  backlinkDetailsRecoveryInput,
} from "./backlink-details-history";
export const readBacklinkDetailsHistoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => backlinkDetailsHistoryInput.parse(v))
  .handler(async ({ context, data }) => {
    const { readBacklinkDetailsHistory } = await import("./backlink-details-history.server");
    return readBacklinkDetailsHistory(context.userId, data);
  });
export const requestBacklinkDetailsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => backlinkPageRequest.parse(v))
  .handler(async ({ context, data }) => {
    const { runBacklinkDetails } = await import("./backlink-details-lifecycle.server");
    try {
      return await runBacklinkDetails(context.userId, data);
    } catch {
      return { state: "unavailable" as const, requestId: data.requestId };
    }
  });
export const recoverBacklinkDetailsAccountingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => backlinkDetailsRecoveryInput.parse(v))
  .handler(async ({ context, data }) => {
    const { recoverBacklinkDetailsAccounting } = await import("./backlink-details-history.server");
    return recoverBacklinkDetailsAccounting(context.userId, data);
  });
