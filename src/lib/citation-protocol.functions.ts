import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { answerEvidenceSchema, evidenceProjectId } from "./answer-evidence";
import { brandRunApprovalSchema, panelDraftSchema } from "./citation-protocol";

/**
 * CI-2 endpoints. Each derives owner identity from the authenticated session and refuses a
 * caller-supplied owner mismatch, exactly like the answer-evidence endpoints. No endpoint accepts
 * an approval receipt, reviewer or timestamp from the client; the server mints those. Mirrors
 * answer-evidence.functions.ts.
 */
const scope = z.object({ projectId: evidenceProjectId, expectedOwnerId: z.string().uuid() });

export const readCitationProtocolFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("citation_owner_changed");
    return (await import("./citation-protocol.server")).readCitationProtocol({
      ownerId: context.userId,
      projectId: data.projectId,
    });
  });

export const readResolvedCapturesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("citation_owner_changed");
    return (await import("./citation-protocol.server")).readResolvedCaptures({
      ownerId: context.userId,
      projectId: data.projectId,
    });
  });

export const saveCitationPanelDraftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    scope
      .extend({
        panelId: z.string().uuid(),
        expected: z.number().int().min(0).max(999),
        panel: panelDraftSchema,
      })
      .strict()
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("citation_owner_changed");
    return (await import("./citation-protocol.server")).saveCitationPanelDraft(
      { ownerId: context.userId, projectId: data.projectId },
      data.panelId,
      data.expected,
      data.panel,
    );
  });

export const lockCitationPanelFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    scope
      .extend({ panelId: z.string().uuid(), expectedVersion: z.number().int().min(1).max(999) })
      .strict()
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("citation_owner_changed");
    return (await import("./citation-protocol.server")).lockCitationPanel(
      { ownerId: context.userId, projectId: data.projectId },
      data.panelId,
      data.expectedVersion,
    );
  });

export const approveBrandRunFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.extend({ run: brandRunApprovalSchema }).strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("citation_owner_changed");
    return (await import("./citation-protocol.server")).approveBrandRun(
      { ownerId: context.userId, projectId: data.projectId },
      data.run,
    );
  });

export const importManualCaptureFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.extend({ answer: answerEvidenceSchema }).strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("citation_owner_changed");
    return (await import("./citation-protocol.server")).importManualCapture(
      { ownerId: context.userId, projectId: data.projectId },
      data.answer,
    );
  });
