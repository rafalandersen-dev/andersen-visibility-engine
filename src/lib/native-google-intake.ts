import { z } from "zod";
import { MAX_NATIVE_ARTIFACTS_PER_PROJECT } from "./native-ai-artifact";
import { nativeReportImportInputSchema } from "./native-ai-report";
import { nativeGoogleReportDescriptor, type NativeGoogleReportCsv } from "./native-google-ai-csv";
/**
 * Owner Google native-report intake — shared, client-safe, network-free contracts for the typed
 * parser interpretation that is persisted alongside an already-staged raw artifact. The staging
 * contract (the exact 10 owner-declared metadata keys, `pending_parser` status) is untouched; this
 * adds the SEPARATE parsed-interpretation record. See docs/native-google-intake-20261113.md.
 */
/** Version of the native-google-ai-csv interpretation persisted with a record. Bumped only when the
 * parser's deterministic output shape changes (distinct from NATIVE_REPORT_PARSER_VERSION rules). */
export const NATIVE_GOOGLE_PARSER_VERSION = "native-google-ai-csv-v1";
export const MAX_NATIVE_LIMITATION_NOTE = 2000;
export const NATIVE_GOOGLE_CSV_FILES = ["chart", "pages", "countries", "devices"] as const;
export const NATIVE_COMPLETENESS = ["complete", "preliminary", "partial", "unknown"] as const;
export type NativeCompleteness = (typeof NATIVE_COMPLETENESS)[number];
export const NATIVE_PARSE_STATES = ["unparsed", "parsed"] as const;
/** Map the owner-declared dimension to the supported Google CSV kind; only the four observed
 * dimensions are parseable. Anything else (property/grounding_query/unknown) is unsupported, not
 * guessed — the caller must reject it rather than invent an interpretation. */
export function fileKindForDimension(dimension: string): NativeGoogleReportCsv | null {
  switch (dimension) {
    case "date":
      return "chart";
    case "page":
      return "pages";
    case "country":
      return "countries";
    case "device":
      return "devices";
    default:
      return null;
  }
}
/** True unless the text carries a NUL (PG jsonb 22P05) or a lone UTF-16 surrogate (22P02), which
 * would fail the `$1::jsonb` cast in the save RPC. Mirrors the staging boundary's check so the
 * owner's limitation note is refused here with a clear message, never on an opaque DB error. */
export function isJsonbStorableText(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0) return false;
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}
/** Owner's plain source-limitation note (e.g. "9–11 Nov 2026 Google logging outage"). Free text,
 * bounded, jsonb-storable, never authenticated; `""` means no note. */
export const nativeLimitationNoteSchema = z
  .string()
  .max(MAX_NATIVE_LIMITATION_NOTE)
  .refine(
    isJsonbStorableText,
    "The note contains unsupported characters. Remove them and try again.",
  );
/**
 * The typed, persisted interpretation of one native Google CSV. `input` is the validated parser
 * output (rows + per-cell value statuses); the extra fields bind it to the exact raw artifact and
 * record the owner declaration. Hard-bounded and cross-checked so a browser-forged hash, a withheld
 * count off the pages table, or a mismatched aggregation cannot enter.
 */
export const nativeReportParsedRecordSchema = z
  .object({
    artifactId: z.string().uuid(),
    /** Must equal the server-derived artifact hash and the parser's own content hash. */
    artifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
    parserVersion: z.literal(NATIVE_GOOGLE_PARSER_VERSION),
    file: z.enum(NATIVE_GOOGLE_CSV_FILES),
    withheldPageRows: z.number().int().min(0),
    partial: z.boolean(),
    limitationNote: nativeLimitationNoteSchema,
    input: nativeReportImportInputSchema,
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.artifactSha256 !== r.input.artifact.sha256)
      ctx.addIssue({
        code: "custom",
        path: ["artifactSha256"],
        message: "The record hash must equal the parsed artifact hash",
      });
    if (r.partial !== r.withheldPageRows > 0)
      ctx.addIssue({
        code: "custom",
        path: ["partial"],
        message: "partial must hold exactly when page rows were withheld",
      });
    if (r.file !== "pages" && r.withheldPageRows !== 0)
      ctx.addIssue({
        code: "custom",
        path: ["withheldPageRows"],
        message: "Only the pages table can withhold rows",
      });
    const d = nativeGoogleReportDescriptor(r.file);
    if (
      r.input.dimension !== d.dimension ||
      r.input.reportKind !== d.reportKind ||
      r.input.aggregation !== d.aggregation
    )
      ctx.addIssue({
        code: "custom",
        path: ["input"],
        message: "Parsed aggregation/reportKind/dimension must match the CSV kind",
      });
    if (r.input.source !== "gsc_generative_ai_search")
      ctx.addIssue({
        code: "custom",
        path: ["input", "source"],
        message: "Only GSC generative AI reports are parsed",
      });
  });
export type NativeReportParsedRecord = z.infer<typeof nativeReportParsedRecordSchema>;
/** Read-back of one artifact's parse state + full interpretation; server-attributed parsedAt/actor. */
export const nativeReportParsedReadSchema = z
  .object({
    id: z.string().uuid(),
    parseState: z.enum(NATIVE_PARSE_STATES),
    parsed: nativeReportParsedRecordSchema.nullable(),
    parsedAt: z.string().nullable(),
    parsedActorId: z.string().uuid().nullable(),
  })
  .strict()
  .superRefine((r, ctx) => {
    const has = r.parseState === "parsed";
    if (
      has !== (r.parsed !== null) ||
      has !== (r.parsedAt !== null) ||
      has !== (r.parsedActorId !== null)
    )
      ctx.addIssue({ code: "custom", message: "parseState must agree with the parsed fields" });
    if (r.parsed && r.parsed.artifactId !== r.id)
      ctx.addIssue({
        code: "custom",
        path: ["parsed", "artifactId"],
        message: "The parsed record must bind to this artifact id",
      });
  });
export type NativeReportParsedRead = z.infer<typeof nativeReportParsedReadSchema>;
/** Lightweight per-artifact parse-state overview for the list — no rows, no bytes. */
export const nativeReportParseStateSchema = z
  .object({
    id: z.string().uuid(),
    parseState: z.enum(NATIVE_PARSE_STATES),
    parserVersion: z.string().nullable(),
    completeness: z.enum(NATIVE_COMPLETENESS).nullable(),
    partial: z.boolean().nullable(),
    withheldPageRows: z.number().int().min(0).nullable(),
    rowCount: z.number().int().min(0).nullable(),
    parsedAt: z.string().nullable(),
  })
  .strict();
export const nativeReportParseStatesSchema = z
  .object({
    states: z.array(nativeReportParseStateSchema).max(MAX_NATIVE_ARTIFACTS_PER_PROJECT),
  })
  .strict();
export type NativeReportParseStates = z.infer<typeof nativeReportParseStatesSchema>;
