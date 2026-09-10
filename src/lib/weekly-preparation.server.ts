import { z } from "zod";
import { weeklyPreparationSchema } from "./weekly-preparation";
import type { KnowledgeRpc } from "./project-knowledge.server";

export const schedulerControlSchema = z
  .object({
    revision: z.number().int().min(0).max(2147483646),
    engine: z.enum(["monthly", "weekly", "paused"]),
    preparation: weeklyPreparationSchema,
  })
  .strict();
export const schedulerControlUpdateSchema = schedulerControlSchema
  .omit({ revision: true })
  .extend({
    expectedRevision: z.number().int().min(0).max(2147483645),
  })
  .strict();
const scopeSchema = z
  .object({
    ownerId: z.string().uuid(),
    projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  })
  .strict();
export class SchedulerControlUnavailableError extends Error {
  constructor() {
    super("scheduler_control_unavailable");
  }
}
async function call(name: string, args: Record<string, unknown>, injected?: KnowledgeRpc) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let rpc = injected;
    if (!rpc) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as unknown as { rpc: KnowledgeRpc };
      rpc = (method, params) => admin.rpc(method, params);
    }
    const result = await Promise.race([
      rpc(name, args),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new SchedulerControlUnavailableError()), 10000);
      }),
    ]);
    if (!result || result.error) throw new SchedulerControlUnavailableError();
    return schedulerControlSchema.parse(result.data);
  } catch {
    throw new SchedulerControlUnavailableError();
  } finally {
    clearTimeout(timer);
  }
}
export async function readSchedulerControl(
  target: z.infer<typeof scopeSchema>,
  rpc?: KnowledgeRpc,
) {
  const scope = scopeSchema.parse(target);
  return call(
    "read_project_scheduler_control",
    { p_user: scope.ownerId, p_project: scope.projectId },
    rpc,
  );
}
export async function setSchedulerControl(
  target: z.infer<typeof scopeSchema>,
  raw: z.infer<typeof schedulerControlUpdateSchema>,
  rpc?: KnowledgeRpc,
) {
  const scope = scopeSchema.parse(target);
  const input = schedulerControlUpdateSchema.parse(raw);
  const result = await call(
    "set_project_scheduler_control",
    {
      p_user: scope.ownerId,
      p_project: scope.projectId,
      p_expected: input.expectedRevision,
      p_engine: input.engine,
      p_preparation: input.preparation,
    },
    rpc,
  );
  if (
    result.revision !== input.expectedRevision + 1 ||
    result.engine !== input.engine ||
    result.preparation.preparationWeekday !== input.preparation.preparationWeekday ||
    result.preparation.preparationTime !== input.preparation.preparationTime ||
    result.preparation.reviewLeadHours !== input.preparation.reviewLeadHours
  )
    throw new SchedulerControlUnavailableError();
  return result;
}
