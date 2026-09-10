import { z } from "zod";
import { outreachReceiptSchema } from "./outreach-receipts";
import type { KnowledgeRpc } from "./project-knowledge.server";
export async function outreachRpc(
  name: string,
  args: Record<string, unknown>,
  injected?: KnowledgeRpc,
): Promise<unknown> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const rpc =
      injected ??
      (async (method, params) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        return (supabaseAdmin as unknown as { rpc: KnowledgeRpc }).rpc(method, params);
      });
    const result = await Promise.race([
      rpc(name, args),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("outreach_storage_unavailable")), 10000);
      }),
    ]);
    if (!result || result.error) {
      const error = result?.error;
      const code =
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
          ? error.message
          : "";
      const safe = [
        "outreach_workspace_changed",
        "outreach_daily_limit_reached",
        "outreach_recipient_cooldown",
        "outreach_step_reserved",
        "outreach_legacy_attempt_held",
        "outreach_history_capacity",
        "outreach_initial_not_sent",
        "outreach_followup_not_due",
        "outreach_approval_required",
      ];
      throw new Error(safe.find((x) => code === x) ?? "outreach_storage_unavailable");
    }
    return result.data;
  } finally {
    clearTimeout(timeout);
  }
}
export async function readOutreachDeliveries(
  userId: string,
  projectId: string,
  rpc?: KnowledgeRpc,
) {
  z.string().uuid().parse(userId);
  z.string().min(1).max(200).parse(projectId);
  const data = await outreachRpc(
    "read_outreach_deliveries",
    { p_user: userId, p_project: projectId },
    rpc,
  );
  const parsed = z.array(outreachReceiptSchema).max(3000).safeParse(data);
  if (!parsed.success || parsed.data.some((r) => r.project_id !== projectId))
    throw new Error("outreach_storage_unavailable");
  return parsed.data;
}
