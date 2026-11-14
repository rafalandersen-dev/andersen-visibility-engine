import { z } from "zod";
import { evidenceProjectId } from "./answer-evidence";
import { getNativeArtifact } from "./native-ai-artifact.server";
import { NativeGoogleCsvError, parseNativeGoogleReportCsv } from "./native-google-ai-csv";
import {
  NATIVE_BING_PARSER_VERSION,
  NativeBingCsvError,
  bingFileKindForDimension,
  parseNativeBingReportCsv,
} from "./native-bing-ai-csv";
import {
  NATIVE_COMPLETENESS,
  NATIVE_GOOGLE_PARSER_VERSION,
  fileKindForDimension,
  nativeLimitationNoteSchema,
  nativeReportBindingReadSchema,
  nativeReportParseStatesSchema,
  nativeReportParsedReadSchema,
  nativeReportParsedRecordSchema,
  type NativeReportParsedRecord,
} from "./native-google-intake";
import type { KnowledgeRpc } from "./project-knowledge.server";
const scope = z.object({ ownerId: z.string().uuid(), projectId: evidenceProjectId }).strict();
type NativeArtifactDetail = Awaited<ReturnType<typeof getNativeArtifact>>;
/**
 * Persist and read the typed parser interpretation attached to an already-staged raw artifact. The
 * raw-staging APIs (native-ai-artifact.*) are reused unchanged; this never re-uploads bytes. The
 * browser never reaches these SECURITY DEFINER functions (REVOKE ALL), and the interpretation is
 * ALWAYS re-derived here from the actual stored bytes — a browser-supplied preview, hash,
 * aggregation or market is never trusted. See docs/native-google-intake-20261113.md.
 */
// Codes the owner can act on are surfaced verbatim; every other DB/transport/auth failure collapses
// to the generic code so no raw database text leaks. `native_parsed_conflict` is the only RPC-raised
// code surfaced here; the re-parse conditions below throw their own deterministic codes directly.
const SURFACED_PARSED_ERRORS = new Set(["native_parsed_conflict"]);
export class NativeParsedError extends Error {}
function surfacedParsedError(error: unknown): string {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? (error as { message?: unknown }).message
      : undefined;
  return typeof message === "string" && SURFACED_PARSED_ERRORS.has(message)
    ? message
    : "native_parsed_unavailable";
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
    const r = await Promise.race([
      rpc(name, args),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error("native_parsed_unavailable")), 10000);
      }),
    ]);
    if (r.error) throw new NativeParsedError(surfacedParsedError(r.error));
    return r.data;
  } catch (error) {
    // Rethrow an already-mapped returned error (and our own deterministic re-parse codes) verbatim;
    // normalize every other thrown/rejected error to the generic code so no raw internal text leaks.
    throw error instanceof NativeParsedError ? error : Error("native_parsed_unavailable");
  } finally {
    clearTimeout(timer);
  }
}
/**
 * Re-derive the typed interpretation from the artifact's actual stored bytes, routed by source
 * (GSC generative-AI or Bing AI Performance). The parser re-computes the aggregation/reportKind/
 * dimension and the content hash; both must match the stored declaration / server-derived hash, so a
 * forged declared aggregation or a hash the bytes do not produce is rejected explicitly rather than
 * persisted. A parse failure maps to a STATIC code: the parser's message can include arbitrary owner
 * input (a malformed date/filter/page key), which must never reach the server transport or logs.
 */
async function reparse(
  detail: NativeArtifactDetail,
  completeness: (typeof NATIVE_COMPLETENESS)[number],
  limitationNote: string,
): Promise<NativeReportParsedRecord> {
  const m = detail.metadata;
  const bytes = new Uint8Array(Buffer.from(detail.base64, "base64"));
  let preview: Awaited<ReturnType<typeof parseNativeGoogleReportCsv>>;
  let parserVersion: string;
  let file: string;
  if (m.source === "gsc_generative_ai_search") {
    const fileKind = fileKindForDimension(m.dimension);
    if (!fileKind) throw new NativeParsedError("native_parsed_unsupported");
    file = fileKind;
    parserVersion = NATIVE_GOOGLE_PARSER_VERSION;
    try {
      preview = await parseNativeGoogleReportCsv(fileKind, bytes, {
        declaredProperty: m.declaredProperty,
        period: { start: m.period.start, end: m.period.end, timezone: m.period.timezone ?? "" },
        capturedAt: m.capturedAt,
        completeness,
        filterContext: { filters: m.filters, marketScope: m.marketScope },
        filename: m.filename,
      });
    } catch (e) {
      throw new NativeParsedError(
        e instanceof NativeGoogleCsvError ? "native_parse_failed" : "native_parsed_unavailable",
      );
    }
  } else if (m.source === "bing_ai_performance") {
    const fileKind = bingFileKindForDimension(m.dimension);
    if (!fileKind) throw new NativeParsedError("native_parsed_unsupported");
    file = fileKind;
    parserVersion = NATIVE_BING_PARSER_VERSION;
    // Bing exposes no geographic scope, filter or timezone. Rather than silently normalizing a
    // staged declaration that claims one (which the parser would then override to unknown), reject
    // the contradiction explicitly so a forged Bing market/timezone/filter never slips through.
    if (
      m.marketScope.country !== null ||
      m.marketScope.exposed ||
      Object.keys(m.filters).length > 0 ||
      m.period.timezone !== null
    )
      throw new NativeParsedError("native_parsed_metadata_mismatch");
    try {
      // Bing takes no filter context; the parser forces an unknown/unsegmented scope.
      preview = await parseNativeBingReportCsv(fileKind, bytes, {
        declaredProperty: m.declaredProperty,
        period: { start: m.period.start, end: m.period.end },
        capturedAt: m.capturedAt,
        completeness,
        filename: m.filename,
      });
    } catch (e) {
      throw new NativeParsedError(
        e instanceof NativeBingCsvError ? "native_parse_failed" : "native_parsed_unavailable",
      );
    }
  } else {
    throw new NativeParsedError("native_parsed_unsupported");
  }
  if (
    preview.input.aggregation !== m.aggregation ||
    preview.input.reportKind !== m.reportKind ||
    preview.input.dimension !== m.dimension
  )
    throw new NativeParsedError("native_parsed_metadata_mismatch");
  if (preview.input.artifact.sha256 !== detail.sha256)
    throw new NativeParsedError("native_parsed_hash_mismatch");
  return nativeReportParsedRecordSchema.parse({
    artifactId: detail.id,
    artifactSha256: detail.sha256,
    parserVersion,
    file,
    withheldPageRows: preview.withheldPageRows,
    partial: preview.partial,
    limitationNote,
    input: preview.input,
  });
}
export async function persistNativeReport(
  raw: z.infer<typeof scope>,
  artifactId: string,
  completeness: unknown,
  limitationNote: unknown,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw);
  const id = z.string().uuid().parse(artifactId);
  const completenessValue = z.enum(NATIVE_COMPLETENESS).parse(completeness);
  const note = nativeLimitationNoteSchema.parse(limitationNote);
  const detail = await getNativeArtifact(s, id, rpc);
  const record = await reparse(detail, completenessValue, note);
  return nativeReportParsedReadSchema.parse(
    await call(
      "save_ai_native_report_parsed",
      { p_user: s.ownerId, p_project: s.projectId, p_id: id, p_parsed: record },
      rpc,
    ),
  );
}
export async function readNativeReportParsed(
  raw: z.infer<typeof scope>,
  artifactId: string,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw);
  const id = z.string().uuid().parse(artifactId);
  return nativeReportParsedReadSchema.parse(
    await call(
      "read_ai_native_report_parsed",
      { p_user: s.ownerId, p_project: s.projectId, p_id: id },
      rpc,
    ),
  );
}
// NEW narrow owner read of the AUTHORITATIVE binding (finding native-review binding). Calls a NEW RPC —
// the frozen read_ai_native_report_parsed response is unchanged for deployment compatibility. The owner
// embeds this binding into a new finding version; the save/review SQL re-verifies it against live data.
export async function readNativeReportBinding(
  raw: z.infer<typeof scope>,
  artifactId: string,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw);
  const id = z.string().uuid().parse(artifactId);
  const result = nativeReportBindingReadSchema.parse(
    await call(
      "read_ai_native_report_binding",
      { p_user: s.ownerId, p_project: s.projectId, p_id: id },
      rpc,
    ),
  );
  // Cross-check the response binds the EXACT requested artifact id (never a different row's binding).
  if (result.id.toLowerCase() !== id.toLowerCase())
    throw new NativeParsedError("native_parsed_unavailable");
  return result;
}
export async function readNativeReportParseStates(raw: z.infer<typeof scope>, rpc?: KnowledgeRpc) {
  const s = scope.parse(raw);
  return nativeReportParseStatesSchema.parse(
    await call(
      "read_ai_native_report_parse_states",
      { p_user: s.ownerId, p_project: s.projectId },
      rpc,
    ),
  );
}
