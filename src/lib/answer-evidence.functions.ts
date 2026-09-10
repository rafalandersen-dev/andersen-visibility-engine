import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { answerEvidenceSchema, evidenceProjectId, evidencePromptSchema } from "./answer-evidence";
const scope = z.object({ projectId: evidenceProjectId, expectedOwnerId: z.string().uuid() });
export const readAnswerEvidenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./answer-evidence.server")).readAnswerEvidence({
      ownerId: context.userId,
      projectId: data.projectId,
    });
  });
export const saveEvidencePromptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    scope
      .extend({
        id: z.string().uuid(),
        expected: z.number().int().min(0).max(999),
        prompt: evidencePromptSchema,
      })
      .strict()
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./answer-evidence.server")).saveEvidencePrompt(
      { ownerId: context.userId, projectId: data.projectId },
      data.id,
      data.expected,
      data.prompt,
    );
  });
export const importAnswerEvidenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.extend({ answer: answerEvidenceSchema }).strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./answer-evidence.server")).importAnswerEvidence(
      { ownerId: context.userId, projectId: data.projectId },
      data.answer,
    );
  });
export const removeAnswerEvidenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    scope
      .extend({ id: z.string().uuid(), kind: z.enum(["prompt", "answer"]) })
      .strict()
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./answer-evidence.server")).removeAnswerEvidence(
      { ownerId: context.userId, projectId: data.projectId },
      data.kind,
      data.id,
    );
  });
