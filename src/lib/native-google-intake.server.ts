import { z } from "zod";
import { evidenceProjectId } from "./answer-evidence";
import { getNativeArtifact } from "./native-ai-artifact.server";
import { NativeGoogleCsvError, parseNativeGoogleReportCsv } from "./native-google-ai-csv";
import {
  NATIVE_COMPLETENESS,
  NATIVE_GOOGLE_PARSER_VERSION,
  fileKindForDimension,
  nativeLimitationNoteSchema,
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
 * Re-derive the typed interpretation from the artifact's actual stored bytes. Only a
 * gsc_generative_ai_search export on one of the four observed dimensions is supported. The parser
 * re-computes the aggregation/reportKind/dimension and the content hash; both must match the stored
 * declaration / server-derived hash, so a forged declared aggregation or a hash the bytes do not
 * produce is rejected explicitly rather than persisted.
 */
async function reparse(
  detail: NativeArtifactDetail,
  completeness: (typeof NATIVE_COMPLETENESS)[number],
  limitationNote: string,
): Promise<NativeReportParsedRecord> {
  const m = detail.metadata;
  const file = m.source === "gsc_generative_ai_search" ? fileKindForDimension(m.dimension) : null;
  if (!file) throw new NativeParsedError("native_parsed_unsupported");
  const bytes = new Uint8Array(Buffer.from(detail.base64, "base64"));
  let preview;
  try {
    preview = await parseNativeGoogleReportCsv(file, bytes, {
      declaredProperty: m.declaredProperty,
      period: { start: m.period.start, end: m.period.end, timezone: m.period.timezone ?? "" },
      capturedAt: m.capturedAt,
      completeness,
      // Owner-declared filter context from the staged metadata; the parser re-validates it for
      // observed format and internal consistency (never blindly trusting the declared market).
      filterContext: { filters: m.filters, marketScope: m.marketScope },
      filename: m.filename,
    });
  } catch (e) {
    // A parse failure is mapped to a STATIC code: the parser's message can include arbitrary owner
    // input (a malformed date/filter/page key), which must never reach the server transport or logs.
    // The UI already shows generic localized parse-failure guidance.
    throw new NativeParsedError(
      e instanceof NativeGoogleCsvError ? "native_parse_failed" : "native_parsed_unavailable",
    );
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
    parserVersion: NATIVE_GOOGLE_PARSER_VERSION,
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
