import { z } from "zod";
import {
  analyzeAnswer,
  answerEvidenceSchema,
  evidenceProjectId,
  evidencePromptRowSchema,
  evidencePromptSchema,
  evidenceRowSchema,
} from "./answer-evidence";
import type { KnowledgeRpc } from "./project-knowledge.server";
const scope = z.object({ ownerId: z.string().uuid(), projectId: evidenceProjectId }).strict();
export const answerStateSchema = z
  .object({
    prompts: z.array(evidencePromptRowSchema).max(200),
    answers: z.array(evidenceRowSchema).max(100),
  })
  .strict();
async function call(name: string, args: Record<string, unknown>, injected?: KnowledgeRpc) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let rpc = injected;
    if (!rpc) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as unknown as { rpc: KnowledgeRpc };
      rpc = (method, params) => admin.rpc(method, params);
    }
    const r = await Promise.race([
      rpc(name, args),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error("answer_evidence_unavailable")), 10000);
      }),
    ]);
    if (r.error) throw Error("answer_evidence_unavailable");
    return r.data;
  } finally {
    clearTimeout(timer);
  }
}
export async function readAnswerEvidence(raw: z.infer<typeof scope>, rpc?: KnowledgeRpc) {
  const s = scope.parse(raw);
  return answerStateSchema.parse(
    await call("read_ai_answer_evidence", { p_user: s.ownerId, p_project: s.projectId }, rpc),
  );
}
export async function saveEvidencePrompt(
  raw: z.infer<typeof scope>,
  id: string,
  expected: number,
  value: unknown,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw),
    data = evidencePromptSchema.parse(value);
  return z
    .number()
    .int()
    .positive()
    .parse(
      await call(
        "save_ai_visibility_prompt",
        {
          p_user: s.ownerId,
          p_project: s.projectId,
          p_id: z.string().uuid().parse(id),
          p_expected: z.number().int().min(0).max(999).parse(expected),
          p_data: data,
        },
        rpc,
      ),
    );
}
export async function importAnswerEvidence(
  raw: z.infer<typeof scope>,
  value: unknown,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw),
    input = answerEvidenceSchema.parse(value);
  // Legacy manual intake never carries CI-2 capture context. A capture bound to an owner-locked
  // panel/brand run must go through the panel-aware citation-protocol save path so the server can
  // resolve the referenced panel version and approved run; accepting it here would store an
  // unauthorized, unresolved binding. Preserve legacy intake (documents without it) unchanged.
  if (input.captureContext !== undefined) throw Error("evidence_capture_context_unsupported");
  const state = await readAnswerEvidence(s, rpc);
  const prompt = state.prompts.find(
    (p) => p.id === input.promptId && p.revision === input.promptRevision,
  );
  if (!prompt) throw Error("evidence_prompt_missing");
  // A legacy (context-less) intake must not "correct" a capture-bound observation. The Answer panel's
  // Correct action submits `supersedesId` with no captureContext; if that superseded a capture, the
  // citation resolver would drop the capture (superseded original excluded, context-less successor
  // unresolvable) — a silent loss. Refuse it with an actionable error; a correction of a capture
  // belongs on the panel-aware capture path (carrying a captureContext). A legacy correction of a
  // legacy (context-less) row stays allowed.
  if (input.supersedesId !== null) {
    const predecessor = state.answers.find((a) => a.id === input.supersedesId);
    if (predecessor && predecessor.input.captureContext !== undefined)
      throw Error("evidence_capture_correction_requires_context");
  }
  // A write must satisfy the same derived-data contract as subsequent reads.
  const document = evidenceRowSchema
    .omit({ id: true, createdAt: true, hash: true })
    .parse({ input, prompt, analysis: analyzeAnswer(input, prompt) });
  if (new TextEncoder().encode(JSON.stringify(document)).length > 90000)
    throw Error("answer_evidence_too_large");
  return z
    .string()
    .uuid()
    .parse(
      await call(
        "save_ai_answer_evidence",
        { p_user: s.ownerId, p_project: s.projectId, p_document: document },
        rpc,
      ),
    );
}
export async function removeAnswerEvidence(
  raw: z.infer<typeof scope>,
  kind: "prompt" | "answer",
  id: string,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw);
  return z.literal(true).parse(
    await call(
      "remove_ai_answer_evidence",
      {
        p_user: s.ownerId,
        p_project: s.projectId,
        p_kind: z.enum(["prompt", "answer"]).parse(kind),
        p_id: z.string().uuid().parse(id),
      },
      rpc,
    ),
  );
}
