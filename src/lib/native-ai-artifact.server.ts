import { z } from "zod";
import { evidenceProjectId } from "./answer-evidence";
import {
  nativeArtifactDetailSchema,
  nativeArtifactStageInputSchema,
  nativeArtifactStateSchema,
  nativeArtifactSummarySchema,
} from "./native-ai-artifact";
import type { KnowledgeRpc } from "./project-knowledge.server";
const scope = z.object({ ownerId: z.string().uuid(), projectId: evidenceProjectId }).strict();
// Same timeout/RPC shape as answer-evidence.server; the browser never reaches these SECURITY DEFINER
// functions (REVOKE ALL), so scope key and metadata arrive only from this trusted server path.
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
        timer = setTimeout(() => reject(Error("native_artifact_unavailable")), 10000);
      }),
    ]);
    if (r.error) throw Error("native_artifact_unavailable");
    return r.data;
  } finally {
    clearTimeout(timer);
  }
}
export async function readNativeArtifacts(raw: z.infer<typeof scope>, rpc?: KnowledgeRpc) {
  const s = scope.parse(raw);
  return nativeArtifactStateSchema.parse(
    await call(
      "read_ai_native_report_artifacts",
      { p_user: s.ownerId, p_project: s.projectId },
      rpc,
    ),
  );
}
export async function stageNativeArtifact(
  raw: z.infer<typeof scope>,
  value: unknown,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw);
  // The encoded body is size- and format-bounded here (before any decode) by the strict base64 schema.
  const input = nativeArtifactStageInputSchema.parse(value);
  // No scope key is supplied: the database derives the canonical scope identity from this validated
  // metadata itself (source/property/reportKind/dimension/aggregation/period/timezone/market/filters),
  // so a forged or unrelated scope key cannot enter, and neither the browser nor this server can pin an
  // artifact onto a lineage its declared metadata does not describe.
  return nativeArtifactSummarySchema.parse(
    await call(
      "save_ai_native_report_artifact",
      {
        p_user: s.ownerId,
        p_project: s.projectId,
        p_metadata: input.metadata,
        p_base64: input.base64,
      },
      rpc,
    ),
  );
}
export async function getNativeArtifact(
  raw: z.infer<typeof scope>,
  id: string,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw);
  return nativeArtifactDetailSchema.parse(
    await call(
      "read_ai_native_report_artifact",
      { p_user: s.ownerId, p_project: s.projectId, p_id: z.string().uuid().parse(id) },
      rpc,
    ),
  );
}
export async function removeNativeArtifact(
  raw: z.infer<typeof scope>,
  id: string,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw);
  return z
    .literal(true)
    .parse(
      await call(
        "remove_ai_native_report_artifact",
        { p_user: s.ownerId, p_project: s.projectId, p_id: z.string().uuid().parse(id) },
        rpc,
      ),
    );
}
