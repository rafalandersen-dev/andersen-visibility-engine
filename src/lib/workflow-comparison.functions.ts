import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { workflowComparisonSchema } from "./workflow-comparison";
export const saveWorkflowComparisonFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({ expectedOwnerId: z.string().uuid(), comparison: workflowComparisonSchema })
      .strict()
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { saveWorkflowComparison } = await import("./workflow-comparison.server");
    if (data.expectedOwnerId !== context.userId) throw Error("workflow_owner_changed");
    return saveWorkflowComparison(context.userId, data.comparison);
  });
export const readWorkflowComparisonsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({ projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) })
      .strict()
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { readWorkflowComparisons } = await import("./workflow-comparison.server");
    return readWorkflowComparisons({ ownerId: context.userId, projectId: data.projectId });
  });
