import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { technicalFindingCodes } from "./technical-findings";
const project = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
export const captureTechnicalFindingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: project,
        runId: z.string().uuid(),
        revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        pageIndex: z.number().int().min(0).max(199),
        code: z.enum(technicalFindingCodes),
      })
      .strict()
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { captureTechnicalFinding } = await import("./technical-findings.server");
    return captureTechnicalFinding(context.userId, data);
  });
export const readTechnicalFindingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: project, evidenceId: z.string().uuid() }).strict().parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { readTechnicalFinding } = await import("./technical-findings.server");
    return readTechnicalFinding(context.userId, data);
  });
