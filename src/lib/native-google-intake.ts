import { z } from "zod";
import { MAX_NATIVE_ARTIFACTS_PER_PROJECT } from "./native-ai-artifact";
import { NATIVE_REPORT_SOURCES, nativeReportImportInputSchema } from "./native-ai-report";
import { nativeGoogleReportDescriptor, type NativeGoogleReportCsv } from "./native-google-ai-csv";
import {
  NATIVE_BING_CSV_FILES,
  NATIVE_BING_PARSER_VERSION,
  bingOverviewCoversPeriod,
  isBingOverviewDateKey,
  isValidBingCountCell,
  nativeBingReportDescriptor,
  nativeBingReportMetrics,
  type NativeBingReportCsv,
} from "./native-bing-ai-csv";
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
 * The typed, persisted interpretation of one native report CSV (Google GSC or Bing AI Performance).
 * `input` is the validated parser output (rows + per-cell value statuses); the extra fields bind it
 * to the exact raw artifact and record the owner declaration. Hard-bounded and cross-checked by
 * `input.source` so a browser-forged hash, a withheld count off the page table, a mismatched
 * aggregation, a wrong parser version, or a forged Bing market/filter/timezone cannot enter.
 */
export const nativeReportParsedRecordSchema = z
  .object({
    artifactId: z.string().uuid(),
    /** Must equal the server-derived artifact hash and the parser's own content hash. */
    artifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
    parserVersion: z.enum([NATIVE_GOOGLE_PARSER_VERSION, NATIVE_BING_PARSER_VERSION]),
    file: z.enum([...NATIVE_GOOGLE_CSV_FILES, ...NATIVE_BING_CSV_FILES]),
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
    // Route every source-specific invariant by the parsed source; each source has its own parser
    // version, CSV file set, descriptor and page-table name.
    let descriptor: { dimension: string; reportKind: string; aggregation: string } | null = null;
    let pageFile: string | null = null;
    let expectedVersion: string | null = null;
    if (r.input.source === "gsc_generative_ai_search") {
      expectedVersion = NATIVE_GOOGLE_PARSER_VERSION;
      pageFile = "pages";
      if ((NATIVE_GOOGLE_CSV_FILES as readonly string[]).includes(r.file))
        descriptor = nativeGoogleReportDescriptor(r.file as NativeGoogleReportCsv);
    } else if (r.input.source === "bing_ai_performance") {
      expectedVersion = NATIVE_BING_PARSER_VERSION;
      pageFile = "bing_pages";
      if ((NATIVE_BING_CSV_FILES as readonly string[]).includes(r.file))
        descriptor = nativeBingReportDescriptor(r.file as NativeBingReportCsv);
      // Bing exposes no geographic scope, filter or timezone — always unknown/unsegmented.
      if (r.input.marketScope.country !== null || r.input.marketScope.exposed !== false)
        ctx.addIssue({
          code: "custom",
          path: ["input", "marketScope"],
          message: "Bing exposes no geographic scope",
        });
      if (Object.keys(r.input.filters).length !== 0)
        ctx.addIssue({
          code: "custom",
          path: ["input", "filters"],
          message: "Bing exposes no filters",
        });
      if (r.input.period.timezone !== null)
        ctx.addIssue({
          code: "custom",
          path: ["input", "period", "timezone"],
          message: "Bing exposes no timezone",
        });
      // Enforce the exact observed Bing variant at the read/trust boundary: an Overview row carries
      // exactly citations + cited_pages and a Pages row exactly citations — no arbitrary, missing or
      // extra measure (e.g. an impressions-only Overview is rejected). Every Bing measure is a
      // whole-event count whose value-bearing raw is a safe-integer lexeme.
      if ((NATIVE_BING_CSV_FILES as readonly string[]).includes(r.file)) {
        const expected = [...nativeBingReportMetrics(r.file as NativeBingReportCsv)].sort();
        for (const [index, row] of r.input.rows.entries()) {
          // An Overview row is keyed by date: enforce a real in-period calendar date at the read
          // boundary for EVERY completeness (not only "complete"), matching the CSV parser — a
          // lexically in-range but malformed/impossible lexeme must never be stored.
          if (
            r.file === "bing_overview" &&
            !isBingOverviewDateKey(row.key, r.input.period.start, r.input.period.end)
          )
            ctx.addIssue({
              code: "custom",
              path: ["input", "rows", index, "key"],
              message:
                "A Bing Overview row must be a real calendar date within the selected period",
            });
          const keys = Object.keys(row.cells).sort();
          if (keys.length !== expected.length || expected.some((m, i) => m !== keys[i]))
            ctx.addIssue({
              code: "custom",
              path: ["input", "rows", index, "cells"],
              message: "A Bing row must carry exactly the observed measures for its report kind",
            });
          for (const [metric, cell] of Object.entries(row.cells))
            if (!isValidBingCountCell(cell))
              ctx.addIssue({
                code: "custom",
                path: ["input", "rows", index, "cells", metric],
                message: "A Bing measure is a count with a nonnegative safe-integer lexeme",
              });
        }
        // A full-period ("complete") claim cannot stand on partial date coverage; a missing endpoint
        // or an internal gap is contradictory and refused. Pages borrows no date coverage.
        if (
          r.file === "bing_overview" &&
          r.input.completeness === "complete" &&
          !bingOverviewCoversPeriod(
            r.input.period.start,
            r.input.period.end,
            r.input.rows.map((row) => row.key),
          )
        )
          ctx.addIssue({
            code: "custom",
            path: ["input", "completeness"],
            message: "A complete overview must carry a row on every day of the selected period",
          });
      }
    } else {
      ctx.addIssue({
        code: "custom",
        path: ["input", "source"],
        message: "Unsupported native report source",
      });
      return;
    }
    if (r.parserVersion !== expectedVersion)
      ctx.addIssue({
        code: "custom",
        path: ["parserVersion"],
        message: "The parser version must match the source",
      });
    if (!descriptor) {
      ctx.addIssue({
        code: "custom",
        path: ["file"],
        message: "The CSV kind does not match the source",
      });
      return;
    }
    if (r.file !== pageFile && r.withheldPageRows !== 0)
      ctx.addIssue({
        code: "custom",
        path: ["withheldPageRows"],
        message: "Only the page table can withhold rows",
      });
    if (r.partial !== r.withheldPageRows > 0)
      ctx.addIssue({
        code: "custom",
        path: ["partial"],
        message: "partial must hold exactly when page rows were withheld",
      });
    if (
      r.input.dimension !== descriptor.dimension ||
      r.input.reportKind !== descriptor.reportKind ||
      r.input.aggregation !== descriptor.aggregation
    )
      ctx.addIssue({
        code: "custom",
        path: ["input"],
        message: "Parsed aggregation/reportKind/dimension must match the CSV kind",
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
/** Read-back of the AUTHORITATIVE native binding the owner embeds into a NEW finding version (finding
 * native-review binding). This is a SEPARATE, narrow shape from `nativeReportParsedReadSchema` — the frozen
 * 5-key read_ai_native_report_parsed response is deliberately NOT extended (old production app strict-parses
 * it). `binding` is null for an unparsed artifact (no future auto-authorization). `parsedSha256` is the
 * server's central canonical digest over the entire parsed interpretation; the client never recomputes it. */
export const nativeReportBindingReadSchema = z
  .object({
    id: z.string().uuid(),
    available: z.boolean(),
    parseState: z.enum(NATIVE_PARSE_STATES),
    binding: z
      .object({
        rawSha256: z.string().regex(/^[a-f0-9]{64}$/),
        source: z.enum(NATIVE_REPORT_SOURCES),
        parserVersion: z.enum([NATIVE_GOOGLE_PARSER_VERSION, NATIVE_BING_PARSER_VERSION]),
        parsedSha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((r, ctx) => {
    // Cross-field coherence (NFTS-02): an unparsed artifact never carries a binding; a present binding
    // requires a parsed, available artifact and the correct source↔parserVersion pair (a gsc source with
    // the bing parser, or vice versa, is rejected). parseState 'parsed' with a null binding is valid
    // (parsed-but-unbindable: unsupported/malformed/tombstoned).
    if (r.parseState === "unparsed" && r.binding !== null)
      ctx.addIssue({
        code: "custom",
        path: ["binding"],
        message: "An unparsed artifact has no binding",
      });
    if (r.binding !== null) {
      if (r.parseState !== "parsed" || r.available !== true)
        ctx.addIssue({
          code: "custom",
          path: ["binding"],
          message: "A binding requires a parsed, available artifact",
        });
      const pairOk =
        (r.binding.source === "gsc_generative_ai_search" &&
          r.binding.parserVersion === NATIVE_GOOGLE_PARSER_VERSION) ||
        (r.binding.source === "bing_ai_performance" &&
          r.binding.parserVersion === NATIVE_BING_PARSER_VERSION);
      if (!pairOk)
        ctx.addIssue({
          code: "custom",
          path: ["binding", "parserVersion"],
          message: "The binding source and parserVersion must be the matching pair",
        });
    }
  });
export type NativeReportBindingRead = z.infer<typeof nativeReportBindingReadSchema>;
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
