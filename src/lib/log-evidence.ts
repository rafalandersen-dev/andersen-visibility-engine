import { z } from "zod";
import { logSafeAlphabet } from "./log-evidence-alphabet";
const labelPattern = new RegExp(`^[${logSafeAlphabet} ._()/-]+$`, "u");
const pathPattern = new RegExp(`^/([${logSafeAlphabet}_.~-]+/)*[${logSafeAlphabet}_.~-]*$`, "u");
import { evidenceUrl } from "./answer-evidence";

export const logAgentSchema = z.enum([
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Googlebot",
  "bingbot",
  "unknown",
]);
// A token match is only a supplied claim. Never retain the arbitrary UA string.
export function claimedLogAgent(ua: string): z.infer<typeof logAgentSchema> {
  const matches = logAgentSchema.options.filter(
    (a) => a !== "unknown" && new RegExp(`(?:^|[^a-z0-9_-])${a}(?:$|[^a-z0-9_-])`, "i").test(ua),
  );
  return matches.length === 1 ? matches[0] : "unknown";
}
const instant = z
  .string()
  .datetime({ offset: true })
  .refine((v) => Number.isFinite(Date.parse(v)), "Invalid instant");
const label = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(labelPattern)
  .refine((v) => !/[\uD800-\uDFFF]/.test(v), "Use BMP letters and numbers");
const page = z
  .string()
  .min(1)
  .max(240)
  .refine((v) => {
    // Only explicitly sanitized public paths: no query, fragment, encoding, email, or URL credentials.
    return (
      !/[\uD800-\uDFFF\s]/.test(v) &&
      pathPattern.test(v) &&
      !v.split("/").some((p) => p === "." || p === "..")
    );
  }, "Use a sanitized public path without query, fragment or encoded data");
const base = z
  .object({
    format: z.literal("milo-log-evidence-v1"),
    source: label,
    layer: z.enum(["edge", "origin"]),
    method: label,
    hostname: z
      .string()
      .max(253)
      .refine((v) => evidenceUrl("https://" + v) === "https://" + v + "/"),
    windowStart: instant,
    windowEnd: instant,
    completeness: z.enum(["complete", "partial", "unknown"]),
    publicPathsConfirmed: z.literal(true),
    supersedesId: z.string().uuid().nullable(),
  })
  .strict();
export const safeLogRequestSchema = z
  .object({
    time: instant,
    page,
    status: z.number().int().min(100).max(599),
    method: z.enum(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]),
    claimedAgent: logAgentSchema,
  })
  .strict();
const rawRequest = safeLogRequestSchema
  .omit({ claimedAgent: true })
  .extend({ userAgent: z.string().max(1024) })
  .strict();
export const logImportSchema = base.extend({ rows: z.array(rawRequest).max(500) }).strict();
const safeInput = base.extend({ rows: z.array(safeLogRequestSchema).max(500) }).strict();
export const logDocumentSchema = z
  .object({
    input: safeInput,
    verified: z.literal(false),
    classifier: z.literal("ua-token-claim-v1"),
    submittedRows: z.number().int().min(0).max(500),
    duplicateRows: z.number().int().min(0).max(499),
  })
  .strict();
export const logRowSchema = logDocumentSchema
  .extend({
    id: z.string().uuid(),
    createdAt: z.string(),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type LogRow = z.infer<typeof logRowSchema>;
export type LogDocument = z.infer<typeof logDocumentSchema>;
export function prepareLogImport(raw: unknown, now = Date.now()): LogDocument {
  const data = logImportSchema.parse(raw);
  const start = Date.parse(data.windowStart),
    end = Date.parse(data.windowEnd);
  if (start < Date.UTC(2020, 0, 1) || end <= start || end > now || end - start > 31 * 86400000)
    throw Error("log_window_invalid");
  const rows = data.rows.map((r, i) => {
    const time = Date.parse(r.time);
    if (time < start || time >= end) throw Error(`log_row_outside_window:${i + 1}`);
    return {
      time: new Date(time).toISOString(),
      page: r.page,
      status: r.status,
      method: r.method,
      claimedAgent: claimedLogAgent(r.userAgent),
    };
  });
  const unique = [...new Map(rows.map((r) => [JSON.stringify(r), r])).entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, r]) => r);
  const document = logDocumentSchema.parse({
    input: {
      ...data,
      windowStart: new Date(start).toISOString(),
      windowEnd: new Date(end).toISOString(),
      rows: unique,
    },
    verified: false,
    classifier: "ua-token-claim-v1",
    submittedRows: rows.length,
    duplicateRows: rows.length - unique.length,
  });
  if (new TextEncoder().encode(JSON.stringify(document)).length > 180000)
    throw Error("log_import_too_large");
  return document;
}
// Per-batch summaries deliberately do not sum overlapping imports or edge/origin copies.
export function summarizeLogBatch(batch: LogRow, start: string, end: string) {
  const from = Date.parse(start),
    to = Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to)
    throw Error("log_filter_invalid");
  const rows = batch.input.rows.filter(
    (r) => Date.parse(r.time) >= from && Date.parse(r.time) < to,
  );
  const group = (key: (r: (typeof rows)[number]) => string) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
    return [...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  };
  return {
    supplied: rows.length,
    claimed: rows.filter((r) => r.claimedAgent !== "unknown").length,
    coverage:
      batch.input.completeness === "complete" &&
      from >= Date.parse(batch.input.windowStart) &&
      to <= Date.parse(batch.input.windowEnd)
        ? "declared-complete"
        : "unknown",
    agents: group((r) => r.claimedAgent),
    pages: group((r) => r.page),
    days: group((r) => r.time.slice(0, 10)),
    statuses: group((r) => String(r.status)),
    methods: group((r) => r.method),
  };
}
