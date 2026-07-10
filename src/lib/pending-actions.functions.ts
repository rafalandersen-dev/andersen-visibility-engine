/**
 * Phase 1B.5 — owner resolution of pending actions (auth-gated server fn).
 *
 * The ONLY path that approves/applies/rejects a proposal: requireSupabaseAuth
 * → context.userId → the caller's own workspace row. Claude/MCP has no
 * equivalent tool by design (blueprint decision §11.4). One atomic
 * rev-guarded mutation per resolve; lifecycle audits are names/ids only and
 * never include the owner's note or any proposal content.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ResolvePendingActionReason =
  | "not_found"
  | "not_pending"
  | "expired"
  | "target_missing"
  | "invalid"
  | "conflict"
  | "error";

export interface ResolvePendingActionView {
  ok: boolean;
  status?: "applied" | "rejected";
  rev?: number;
  reason?: ResolvePendingActionReason;
}

const resolveInput = (input: unknown) =>
  z
    .object({
      actionId: z.string().min(1).max(100),
      resolution: z.enum(["approve_apply", "reject"]),
      note: z.string().max(500).optional(),
    })
    .parse(input);

export const resolvePendingActionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(resolveInput)
  .handler(async ({ data, context }): Promise<ResolvePendingActionView> => {
    const server = await import("./pending-actions.server");
    const { WorkspaceConflictError, WorkspaceNotFoundError } = await import("./workspace.server");
    const { logOAuthEvent } = await import("./oauth.server");

    try {
      const { action, status, expiredIds, rev } = await server.resolvePendingActionForWorkspace(context.userId, data);

      // Lifecycle audits (awaited; logOAuthEvent never throws). approve_apply
      // records both hops; the sweep that rode the write gets one event.
      if (expiredIds.length) {
        await logOAuthEvent("pending_action_expired", { userId: context.userId, detail: { actionIds: expiredIds, source: "milo_ui", ok: true } });
      }
      if (status === "applied") {
        await logOAuthEvent("pending_action_approved", {
          userId: context.userId,
          detail: server.buildPendingActionResolutionAudit(action, "pending_action_approved", { ok: true }).detail,
        });
        await logOAuthEvent("pending_action_applied", {
          userId: context.userId,
          detail: server.buildPendingActionResolutionAudit(action, "pending_action_applied", { ok: true, appliedAtRev: rev }).detail,
        });
      } else {
        await logOAuthEvent("pending_action_rejected", {
          userId: context.userId,
          detail: server.buildPendingActionResolutionAudit(action, "pending_action_rejected", { ok: true }).detail,
        });
      }
      return { ok: true, status, rev };
    } catch (e) {
      if (e instanceof server.PendingActionNotFoundError || e instanceof WorkspaceNotFoundError) return { ok: false, reason: "not_found" };
      if (e instanceof server.PendingActionResolveError) return { ok: false, reason: e.reason };
      if (e instanceof WorkspaceConflictError) return { ok: false, reason: "conflict" };
      console.error("[pending-actions] resolve failed:", e instanceof Error ? e.message : String(e));
      return { ok: false, reason: "error" };
    }
  });
