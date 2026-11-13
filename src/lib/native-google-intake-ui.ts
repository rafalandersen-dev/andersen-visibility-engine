import { MAX_NATIVE_REPORT_BYTES, escapeForSpreadsheet } from "./native-ai-report";
/**
 * Pure, client-safe helpers for the owner Google native-report intake panel, kept out of the React
 * component so the review-invalidation, file-bounds, status-badge, error-mapping and cell-display
 * rules are unit-testable without a DOM. See docs/native-google-intake-20261113.md.
 */
/** A data/Filters CSV is read only after this size gate, so a giant file is never allocated. */
export const MAX_NATIVE_INTAKE_FILE_BYTES = MAX_NATIVE_REPORT_BYTES;
export const fileTooLarge = (size: number): boolean => size > MAX_NATIVE_INTAKE_FILE_BYTES;
/**
 * datetime-local → an offset-aware ISO instant the staging grammar accepts, treating the entered
 * time as UTC (the field is labelled UTC). Never attaches Z to an apparent local time silently: the
 * caller discloses UTC, and a value that already carries a zone/seconds is passed through unchanged.
 */
export function normalizeUtcCapturedAt(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value + ":00Z";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) return value + "Z";
  return value;
}
/** The material inputs that define a reviewed snapshot; changing any one invalidates a prior preview. */
export interface NativeIntakeFingerprintInputs {
  source: string;
  file: string;
  property: string;
  start: string;
  end: string;
  capturedAt: string;
  completeness: string;
  limitationNote: string;
  data: { name: string; size: number; lastModified: number } | null;
  filters: { name: string; size: number; lastModified: number } | null;
}
/** A stable fingerprint of every material input, so Save can refuse unless the current inputs still
 * match the exact reviewed snapshot (source and both file inputs included). Changing the source
 * invalidates the preview: a Google and a Bing interpretation of the same bytes are different. */
export function reviewFingerprint(i: NativeIntakeFingerprintInputs): string {
  const f = (x: NativeIntakeFingerprintInputs["data"]) =>
    x ? [x.name, x.size, x.lastModified] : null;
  return JSON.stringify([
    i.source,
    i.file,
    i.property,
    i.start,
    i.end,
    i.capturedAt,
    i.completeness,
    i.limitationNote,
    f(i.data),
    f(i.filters),
  ]);
}
export type NativeIntakeBadge = "ready" | "stored" | "attention" | "unknown";
/**
 * The primary, plain-language state of one staged artifact. The raw staging `status`
 * (`pending_parser`) is never shown as a verified metric; an unknown/unloaded parse state is NOT
 * silently shown as "stored" (unparsed) — it reads as unknown until the overview load succeeds.
 */
export function intakeBadge(
  status: string,
  parseState: string | null | undefined,
  statesReady: boolean,
): NativeIntakeBadge {
  if (status === "unsupported") return "attention";
  if (!statesReady || parseState == null) return "unknown";
  if (parseState === "parsed") return "ready";
  if (parseState === "unparsed") return "stored";
  return "unknown";
}
/** Only genuine Google generative-AI exports are labelled Google; the shared raw-artifact API also
 * stores Bing, which must not be mislabelled. */
export const isGoogleArtifactSource = (source: string): boolean =>
  source === "gsc_generative_ai_search";
/** The two owner-intake sources this panel can interpret; any other staged source is listed under
 * "needs attention", never silently interpreted. */
export const isNativeIntakeSource = (source: string): boolean =>
  source === "gsc_generative_ai_search" || source === "bing_ai_performance";
/** A source marked partial/preliminary — or whose completeness is unknown — is not a full reading, so
 * it is never presented as complete. Distinct from privacy-withheld pages and coverage gaps. */
export const sourceIncomplete = (completeness: string): boolean =>
  completeness === "partial" || completeness === "preliminary" || completeness === "unknown";
/**
 * Date-dimension row coverage against the selected period: how many distinct days carry a row versus
 * how many the period spans, and whether any day inside the period is missing (an endpoint OR an
 * interior gap). The parser already rejects duplicate and out-of-period dates, so the row keys are
 * distinct in-period ISO days. Returns null for a non-date report (a page table has no row dates, so
 * it is never assigned a date coverage) or an empty one. Pure UTC epoch arithmetic — no local
 * timezone is ever consulted; the day count is anchored to UTC midnight only to subtract two dates.
 */
export interface OverviewCoverage {
  observedDays: number;
  expectedDays: number;
  firstObserved: string;
  lastObserved: string;
  /** A day inside [start,end] carries no row (missing endpoint or interior gap). */
  hasGaps: boolean;
}
function epochDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}
export function overviewDateCoverage(
  dimension: string,
  rows: readonly { key: string }[],
  period: { start: string; end: string },
): OverviewCoverage | null {
  if (dimension !== "date" || rows.length === 0) return null;
  const days = rows.map((r) => r.key).sort();
  const expectedDays = epochDay(period.end) - epochDay(period.start) + 1;
  return {
    observedDays: days.length,
    expectedDays,
    firstObserved: days[0],
    lastObserved: days[days.length - 1],
    // Every row key is a distinct in-period day, so fewer rows than period days means some day in
    // the period has no row — whether that is a missing start/end or a gap in the middle.
    hasGaps: days.length < expectedDays,
  };
}
/** Raw exported cell text for display: spreadsheet-safe (a formula-looking cell is prefixed, never
 * evaluated) and bounded. React additionally escapes it as text. */
export function rawCellText(raw: string | null): string {
  const safe = escapeForSpreadsheet(raw);
  return safe.length > 300 ? safe.slice(0, 300) + "…" : safe;
}
/** Map a thrown server/parse code to a localized i18n key; never surfaces raw DB text or private
 * credentials/query params (the parser's own messages are already generic for page rows). */
export function persistErrorKey(message: string): string {
  if (message === "native_parsed_conflict") return "err.conflict";
  if (message === "native_parsed_unsupported") return "err.unsupported";
  if (message === "native_parsed_metadata_mismatch") return "err.mismatch";
  if (message === "native_parsed_hash_mismatch") return "err.hash";
  if (message.startsWith("native_parse_failed")) return "err.parseFailed";
  if (message === "native_artifact_capacity" || message === "native_artifact_byte_capacity")
    return "err.capacity";
  return "err.save";
}
