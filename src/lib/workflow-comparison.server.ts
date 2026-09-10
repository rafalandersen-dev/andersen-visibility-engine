import { z } from "zod";
import { compareWorkflows } from "./workflow-comparison";
const scope = z
  .object({ ownerId: z.string().uuid(), projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) })
  .strict();
async function call(name: string, args: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      (
        supabaseAdmin as unknown as {
          rpc: (
            name: string,
            args: Record<string, unknown>,
          ) => Promise<{ data: unknown; error: unknown }>;
        }
      ).rpc(name, args),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error("workflow_evaluation_unavailable")), 10000);
      }),
    ]);
    if (response.error) throw Error("workflow_evaluation_unavailable");
    return response.data;
  } finally {
    clearTimeout(timer);
  }
}
export async function saveWorkflowComparison(ownerId: string, raw: unknown) {
  const report = await compareWorkflows(raw);
  const target = scope.parse({ ownerId, projectId: report.input.projectId });
  if (Date.parse(report.input.reviewedAt) > Date.now()) throw Error("workflow_review_date_invalid");
  const id = z
    .string()
    .uuid()
    .parse(
      await call("save_workflow_evaluation", {
        p_user: target.ownerId,
        p_project: target.projectId,
        p_document: report,
      }),
    );
  return { id, verdict: report.verdict };
}
const row = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  documentHash: z.string(),
  suiteName: z.string(),
  baselineVersion: z.string(),
  candidateVersion: z.string(),
  fixedBriefHash: z.string(),
  verdict: z.string(),
  baselineCost: z.number().nullable(),
  candidateCost: z.number().nullable(),
  caseCount: z.number().int(),
  independentlyVerified: z.literal(false),
  autoRelease: z.literal(false),
});
export async function readWorkflowComparisons(raw: z.infer<typeof scope>) {
  const target = scope.parse(raw);
  return z
    .array(row)
    .max(100)
    .parse(
      await call("read_workflow_evaluations", {
        p_user: target.ownerId,
        p_project: target.projectId,
      }),
    );
}
