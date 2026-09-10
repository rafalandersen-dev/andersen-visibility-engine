import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
const project = z.object({ projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }).strict();
const source = project.extend({
  sourceId: z.string().uuid(),
  expectedRevision: z.number().int().positive().max(2147483646),
});
export const readSourceRefreshFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => project.parse(v))
  .handler(async ({ data, context }) => {
    const { readSourceRefresh } = await import("./source-refresh.server");
    return readSourceRefresh({ ownerId: context.userId, projectId: data.projectId });
  });
export const refreshProjectSourceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => source.parse(v))
  .handler(async ({ data, context }) => {
    const { refreshProjectSource } = await import("./source-refresh.server");
    return refreshProjectSource(
      { ownerId: context.userId, projectId: data.projectId },
      { sourceId: data.sourceId, expectedRevision: data.expectedRevision },
    );
  });
export const reviewSourceFactFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    source
      .extend({
        key: z.string().min(1).max(200),
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        accept: z.boolean(),
        previous: z.boolean(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { reviewSourceFact } = await import("./source-refresh.server");
    const { projectId, ...input } = data;
    return reviewSourceFact({ ownerId: context.userId, projectId }, input);
  });

export const readSourceImpactFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => project.parse(v))
  .handler(async ({ data, context }) => {
    const { readProjectSourceImpact } = await import("./source-publication.server");
    return readProjectSourceImpact(context.userId, data.projectId);
  });

export const configureShopifyCatalogFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => project.parse(v))
  .handler(async ({ data, context }) => {
    const { configureShopifyCatalogSource } = await import("./source-refresh.server");
    return configureShopifyCatalogSource({ ownerId: context.userId, projectId: data.projectId });
  });
