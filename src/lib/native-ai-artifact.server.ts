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
// The database raises this small, fixed allowlist of capacity codes — the project's 20-artifact count
// cap and its 40 MiB raw-byte quota — when a save is refused for a reason the owner can resolve
// deterministically by deleting an existing artifact. Only these exact tokens are surfaced verbatim so
// the endpoints can offer that guidance; EVERY other failure (validation, auth, a missing row, a raw
// database error, network, or the timeout below) collapses to the generic code, so no raw database
// error text ever escapes and unknown/auth/network failures stay opaque.
const SURFACED_ARTIFACT_ERRORS = new Set([
  "native_artifact_capacity",
  "native_artifact_byte_capacity",
]);
function surfacedArtifactError(error: unknown): string {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? (error as { message?: unknown }).message
      : undefined;
  return typeof message === "string" && SURFACED_ARTIFACT_ERRORS.has(message)
    ? message
    : "native_artifact_unavailable";
}
// A RETURNED rpc error already mapped through the capacity allowlist. The catch in `call` rethrows these
// verbatim (so a genuine returned capacity code survives) but collapses every OTHER thrown/rejected error
// — a rejected or synchronously-thrown rpc promise, the dynamic import, or the timeout — to the generic
// code, never treating a client/transport failure as the DB's deterministic capacity signal.
class NativeArtifactError extends Error {}
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
    // A RETURNED rpc error is the database's own response: preserve the two allowlisted capacity codes,
    // collapse anything else to the generic code, and brand it so the catch rethrows it verbatim.
    if (r.error) throw new NativeArtifactError(surfacedArtifactError(r.error));
    return r.data;
  } catch (error) {
    // The `finally` alone cleaned up the timer but let a rejected/synchronously-thrown rpc promise, the
    // dynamic import, or the timeout escape with its raw message. Rethrow an already-mapped returned
    // error verbatim; normalize every other thrown/rejected error to the generic code so no raw or
    // secret-like internal text leaks and a rejection is never mistaken for the DB's capacity signal.
    throw error instanceof NativeArtifactError ? error : Error("native_artifact_unavailable");
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
