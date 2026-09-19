import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { evidenceProjectId } from "./answer-evidence";
import { nativeArtifactStageInputSchema } from "./native-ai-artifact";
const scope = z.object({ projectId: evidenceProjectId, expectedOwnerId: z.string().uuid() });
export const readNativeArtifactsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./native-ai-artifact.server")).readNativeArtifacts({
      ownerId: context.userId,
      projectId: data.projectId,
    });
  });
export const stageNativeArtifactFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    scope.extend(nativeArtifactStageInputSchema.shape).strict().parse(v),
  )
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./native-ai-artifact.server")).stageNativeArtifact(
      { ownerId: context.userId, projectId: data.projectId },
      { metadata: data.metadata, base64: data.base64 },
    );
  });
export const getNativeArtifactFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.extend({ id: z.string().uuid() }).strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./native-ai-artifact.server")).getNativeArtifact(
      { ownerId: context.userId, projectId: data.projectId },
      data.id,
    );
  });
export const removeNativeArtifactFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => scope.extend({ id: z.string().uuid() }).strict().parse(v))
  .handler(async ({ data, context }) => {
    if (context.userId !== data.expectedOwnerId) throw Error("evidence_owner_changed");
    return (await import("./native-ai-artifact.server")).removeNativeArtifact(
      { ownerId: context.userId, projectId: data.projectId },
      data.id,
    );
  });
