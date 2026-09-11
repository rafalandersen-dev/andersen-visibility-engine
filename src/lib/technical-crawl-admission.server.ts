import { z } from "zod";
import {
  TechnicalCrawlAdmissionError,
  type CrawlConnectionAdmission,
} from "./technical-crawl-admission";
import type { TechnicalRpc } from "./technical-crawl.server";
export async function technicalDispatchRpc(name: string, args: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const client = supabaseAdmin as unknown as {
    rpc(
      name: string,
      args: Record<string, unknown>,
    ): ReturnType<TechnicalRpc> & { abortSignal(signal: AbortSignal): ReturnType<TechnicalRpc> };
  };
  return await client.rpc(name, args).abortSignal(AbortSignal.timeout(5000));
}
export function technicalConnectionAdmission(
  user: string,
  project: string,
  run: string,
  runLease: string,
  origin: string,
  rpc: TechnicalRpc = technicalDispatchRpc,
): CrawlConnectionAdmission {
  return async (url, signal) => {
    if (signal.aborted || new URL(url).origin !== origin) throw new TechnicalCrawlAdmissionError();
    let lease: { lease: string; expiresAt: string };
    try {
      const result = await rpc("acquire_technical_crawl_dispatch", {
        p_user: user,
        p_project: project,
        p_run: run,
        p_run_lease: runLease,
        p_origin: origin,
      });
      if (result.error) {
        const error = result.error as { code?: unknown; message?: unknown };
        throw new TechnicalCrawlAdmissionError(
          error.code === "55P03" || error.message === "technical_dispatch_capacity"
            ? "capacity"
            : "ownership",
        );
      }
      lease = z
        .object({ lease: z.string().uuid(), expiresAt: z.string().datetime({ offset: true }) })
        .strict()
        .parse(result.data);
    } catch (error) {
      if (error instanceof TechnicalCrawlAdmissionError) throw error;
      throw new TechnicalCrawlAdmissionError("ownership");
    }
    const release = async () => {
      await rpc("release_technical_crawl_dispatch", {
        p_user: user,
        p_origin: origin,
        p_lease: lease.lease,
      });
    };
    if (signal.aborted || Date.parse(lease.expiresAt) - Date.now() < 10000) {
      await release().catch(() => {});
      throw new TechnicalCrawlAdmissionError("capacity");
    }
    return release;
  };
}
