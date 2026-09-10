import { z } from "zod";
import type { KnowledgeRpc } from "./project-knowledge.server";
import { schedulerPeriodSchema } from "./weekly-preparation";
const scopeSchema = z
  .object({ ownerId: z.string().uuid(), projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) })
  .strict();
const stageSchema = z.enum(["research", "content", "image"]);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const resultSchema = z.record(z.string(), z.unknown()).nullable();
const acknowledgement = z
  .object({
    acquired: z.boolean(),
    requestId: z.string().uuid(),
    outputId: z.string().uuid(),
    state: z.enum(["running", "unknown", "retained", "cancelled"]),
    inputHash: hashSchema,
    result: resultSchema,
  })
  .strict();
export class WeeklyStageUnavailableError extends Error {
  constructor() {
    super("weekly_stage_recovery_required");
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
        timer = setTimeout(() => reject(new WeeklyStageUnavailableError()), 10000);
      }),
    ]);
    if (!result || result.error) throw new WeeklyStageUnavailableError();
    return result.data;
  } catch {
    throw new WeeklyStageUnavailableError();
  } finally {
    clearTimeout(timer);
  }
}
export const weeklyStageRecordSchema = acknowledgement.omit({ acquired: true }).extend({
  publishAt: z.string().datetime({ offset: true }),
  stage: stageSchema,
  deliveredAt: z.string().datetime({ offset: true }).nullable(),
  outputChanged: z.boolean(),
});
export async function readWeeklyStages(
  target: z.infer<typeof scopeSchema>,
  period: string,
  rpc?: KnowledgeRpc,
) {
  const scope = scopeSchema.parse(target);
  return z
    .array(weeklyStageRecordSchema)
    .max(3000)
    .parse(
      await call(
        "read_weekly_preparation_stages",
        {
          p_user: scope.ownerId,
          p_project: scope.projectId,
          p_period: schedulerPeriodSchema.parse(period),
        },
        rpc,
      ),
    );
}
export async function cancelWeeklySlot(
  target: z.infer<typeof scopeSchema>,
  requestId: string,
  rpc?: KnowledgeRpc,
) {
  const scope = scopeSchema.parse(target);
  if (
    (await call(
      "cancel_weekly_preparation_slot",
      {
        p_user: scope.ownerId,
        p_project: scope.projectId,
        p_request: z.string().uuid().parse(requestId),
      },
      rpc,
    )) !== true
  )
    throw new WeeklyStageUnavailableError();
}
/** A refused or uncertain claim never executes work. A duplicate completed stage
 * returns its saved acknowledgement. The callback must durably retain a paid
 * output before returning; loss of this final acknowledgement cannot authorize
 * another paid attempt. No browser-supplied request/output identity is accepted. */
export async function runWeeklyStage<T extends Record<string, unknown>>(
  args: {
    scope: z.infer<typeof scopeSchema>;
    lease: string;
    revision: number;
    publishAt: string;
    stage: z.infer<typeof stageSchema>;
    inputHash: string;
    parseResult: (value: unknown) => T;
    work: (identity: { requestId: string; outputId: string }) => Promise<T>;
  },
  rpc?: KnowledgeRpc,
): Promise<T> {
  const scope = scopeSchema.parse(args.scope);
  const params = {
    p_user: scope.ownerId,
    p_project: scope.projectId,
    p_lease: z.string().uuid().parse(args.lease),
    p_revision: z.number().int().positive().max(2147483646).parse(args.revision),
    p_publish: z.string().datetime({ offset: true }).parse(args.publishAt),
    p_stage: stageSchema.parse(args.stage),
    p_hash: hashSchema.parse(args.inputHash),
  };
  const parsed = acknowledgement.safeParse(
    await call("begin_weekly_preparation_stage", params, rpc),
  );
  if (!parsed.success) throw new WeeklyStageUnavailableError();
  const started = parsed.data;
  if (started.inputHash !== args.inputHash) throw new WeeklyStageUnavailableError();
  if (!started.acquired) {
    if (started.state === "retained" && started.result !== null)
      return args.parseResult(started.result);
    // An archived output may exist even though the final stage acknowledgement
    // was lost. Reconcile that exact request; never run the callback again.
    if (started.state === "unknown" && args.stage !== "research") {
      const retained = await call(
        "recover_weekly_preparation_stage",
        {
          p_user: scope.ownerId,
          p_project: scope.projectId,
          p_request: started.requestId,
        },
        rpc,
      );
      if (retained !== null) {
        try {
          return args.parseResult(retained);
        } catch {
          throw new WeeklyStageUnavailableError();
        }
      }
    }
    throw new WeeklyStageUnavailableError();
  }
  if (started.state !== "running" || started.result !== null)
    throw new WeeklyStageUnavailableError();
  let result: T;
  try {
    result = args.parseResult(
      await args.work({ requestId: started.requestId, outputId: started.outputId }),
    );
  } catch (error) {
    await call(
      "finish_weekly_preparation_stage",
      {
        p_user: scope.ownerId,
        p_project: scope.projectId,
        p_request: started.requestId,
        p_hash: args.inputHash,
        p_result: null,
      },
      rpc,
    ).catch(() => undefined);
    throw error;
  }
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 30000)
    throw new WeeklyStageUnavailableError();
  const finished = await call(
    "finish_weekly_preparation_stage",
    {
      p_user: scope.ownerId,
      p_project: scope.projectId,
      p_request: started.requestId,
      p_hash: args.inputHash,
      p_result: result,
    },
    rpc,
  );
  if (finished !== true) throw new WeeklyStageUnavailableError();
  return result;
}
