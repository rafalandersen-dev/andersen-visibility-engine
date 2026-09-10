import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { weeklyPreparationSchema } from "./weekly-preparation";
const project = z.object({ projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }).strict();
export const readSchedulerControlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => project.parse(v))
  .handler(async ({ data, context }) => {
    const { readSchedulerControl } = await import("./weekly-preparation.server");
    return readSchedulerControl({ ownerId: context.userId, projectId: data.projectId });
  });
export const setSchedulerControlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    project
      .extend({
        expectedRevision: z.number().int().min(0).max(2147483645),
        engine: z.enum(["monthly", "weekly", "paused"]),
        preparation: weeklyPreparationSchema,
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { setSchedulerControl } = await import("./weekly-preparation.server");
    const { projectId, ...input } = data;
    return setSchedulerControl({ ownerId: context.userId, projectId }, input);
  });

export const readWeeklyPreparationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    project.extend({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { readWeeklyPreparation } = await import("./weekly-preparation.server");
    return readWeeklyPreparation(
      { ownerId: context.userId, projectId: data.projectId },
      data.weekStart,
    );
  });
