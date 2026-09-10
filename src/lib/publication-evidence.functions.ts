import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
const project = z.object({ projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }).strict();
export const readPublicationEvidenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    project.extend({ page: z.number().int().min(0).max(19) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { readPublicationEvidence } = await import("./publication-evidence.server");
    return readPublicationEvidence(
      { ownerId: context.userId, projectId: data.projectId },
      data.page,
    );
  });
export const readPublicationSnapshotFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => project.extend({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { readPublicationSnapshot } = await import("./publication-evidence.server");
    return readPublicationSnapshot({ ownerId: context.userId, projectId: data.projectId }, data.id);
  });
export const linkPublicationObservationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    project.extend({ id: z.string().uuid(), importId: z.string().min(1).max(100) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const { linkPublicationObservation } = await import("./publication-evidence.server");
    return linkPublicationObservation(
      { ownerId: context.userId, projectId: data.projectId },
      data.id,
      data.importId,
    );
  });
