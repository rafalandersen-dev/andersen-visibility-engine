import { z } from "zod";
import type { AnswerEvidence } from "./answer-evidence";
import { evidenceUrl } from "./answer-evidence";
import { discoveryScheduleValid, supportedInstantMs, type PanelProtocol } from "./citation-panel";
import {
  canonicalUuid,
  parseManualCaptureInput,
  type CitationReport,
  type ErasedSlot,
  type ResolvedCapture,
} from "./citation-protocol";

/**
 * CG-03C: pure helpers for recording ONE manually collected, original discovery observation through the existing
 * `importManualCaptureFn`. They choose eligible slots, build and freeze the exact payload the server stores, and
 * classify what a response proves. They never call anything, never invent a fact and never decide storage: the
 * server's scoped RPC stays authoritative for every reference, slot and capacity rule.
 */

/** The entry method recorded on every observation from this form. Fixed and never localized: it is a cohort
 * dimension, and it names only how the record was entered, not how comparable the collection was. */
export const MANUAL_CAPTURE_METHOD = "manual entry (MILO form) v1";
/** Deviation codes the resolver can report for a discovery capture, each with a plain-language label; any other
 * code is shown as "other difference" with its code. */
export const MANUAL_CAPTURE_DEVIATION_CODES: ReadonlySet<string> = new Set([
  "session_not_fresh",
  "prior_messages",
  "extra_instruction",
  "personalisation_differs",
  "signed_in_differs",
  "memory_differs",
  "custom_instructions_differ",
  "connected_tools_differ",
  "account_tier_differs",
  "prompt_language_differs",
  "interface_language_differs",
  "surface_or_mode_differs",
  "model_label_differs",
  "web_search_evidence_differs",
  "collection_country_differs",
  "collection_city_differs",
  "device_location_differs",
  "vpn_differs",
  "capture_window_overrun",
  "delay_untruthful",
  "intended_slot_mismatch",
  "discovery_schedule_invalid",
  "discovery_schedule_missing",
  "duplicate_slot",
  "erased_duplicate_slot",
  "panel_unresolved",
  "panel_not_approved",
  "panel_version_differs",
  "panel_mismatch",
  "question_not_in_panel",
  "question_text_changed",
  "round_out_of_panel",
  "malformed_capture_context",
  "unknown_slot",
  "panel_approved_after_capture",
  "non_consumer_surface",
  "panel_grid_invalid",
  "discovery_baseline_ambiguous",
  "brand_run_on_discovery",
]);
/** Existing per-project answer-record capacity (answer evidence + captures + corrections share it). */
export const MANUAL_CAPTURE_CAPACITY = 100;

export type SlotState =
  | "available"
  | "notDue"
  | "occupied"
  | "erased"
  /** The version's authoritative report is missing or says occupancy is incomplete: a free-looking slot is
   * not proven free. */
  | "occupancyUnknown"
  /** The question's exact prompt id + revision is not in the current scoped prompt set (e.g. deleted). */
  | "promptMissing"
  /** A required scoped read (protocol, coverage or prompts) is not currently successful. */
  | "readsUnavailable";
export type SlotChoice = {
  questionId: string;
  /** 1-based position of the question in the approved panel, for human labels. */
  questionNumber: number;
  round: number;
  questionText: string;
  questionLanguage: string;
  promptId: string;
  promptRevision: number;
  /** The approved intended instant for this round, verbatim from the stored schedule. */
  intendedSlotAt: string;
  state: SlotState;
};
export type VersionChoice = { key: string; panel: PanelProtocol; slots: SlotChoice[] };

const slotKey = (panelId: string, version: number, questionId: string, round: number) =>
  JSON.stringify([canonicalUuid(panelId), version, questionId, round]);

/**
 * Locked, approved DISCOVERY versions whose approved weekly schedule is valid (older locked versions behind a
 * newer draft included), with every question × round, and whether a NEW original may use it. A slot is offered
 * only when ALL of these hold: the scoped protocol, coverage and prompt reads are currently successful; the
 * question's exact prompt id (canonical) and integer revision still exist; the round's approved instant has
 * passed; the latest resolved read holds no live or deleted original for it; and the version's authoritative
 * report says occupancy is complete (`coverageComplete`). A known failed/truncated record occupies only its own
 * slot; the global `erasureOverflow` does not block other versions. All of this is informational for NEW
 * originals only: an exact resend of a frozen submission never re-runs it, and the server stays authoritative.
 */
export function manualCaptureChoices(input: {
  panels: readonly PanelProtocol[];
  reports: readonly Pick<CitationReport, "panelId" | "panelVersion" | "coverageComplete">[];
  prompts: readonly { id: string; revision: number }[];
  /** True only while the scoped protocol, coverage and prompt reads are all currently successful. */
  readsCurrent: boolean;
  captures: readonly Pick<ResolvedCapture, "panelId" | "panelVersion" | "slot" | "brandRunId">[];
  erasedSlots: readonly Pick<
    ErasedSlot,
    "panelId" | "panelVersion" | "questionId" | "round" | "brandRunId"
  >[];
  nowMs: number;
}): VersionChoice[] {
  const occupied = new Set(
    input.captures
      .filter((c) => c.slot && c.brandRunId === null)
      .map((c) => slotKey(c.panelId, c.panelVersion, c.slot!.questionId, c.slot!.round)),
  );
  const erased = new Set(
    input.erasedSlots
      .filter((e) => e.brandRunId === null)
      .map((e) => slotKey(e.panelId, e.panelVersion, e.questionId, e.round)),
  );
  const complete = new Set(
    input.reports
      .filter((r) => r.coverageComplete === true)
      .map((r) => `${canonicalUuid(r.panelId)}:${r.panelVersion}`),
  );
  const promptKey = (id: string, revision: unknown) =>
    Number.isInteger(revision) ? `${canonicalUuid(id)}:${revision as number}` : null;
  const prompts = new Set(input.prompts.map((p) => promptKey(p.id, p.revision)));
  prompts.delete(null);
  return input.panels
    .filter(
      (p) =>
        p.kind === "discovery" &&
        p.status === "locked" &&
        !!p.approval &&
        !!p.schedule &&
        discoveryScheduleValid(p),
    )
    .sort(
      (a, b) =>
        canonicalUuid(a.panelId).localeCompare(canonicalUuid(b.panelId)) || b.version - a.version,
    )
    .map((panel) => ({
      key: `${canonicalUuid(panel.panelId)}:${panel.version}`,
      panel,
      slots: panel.questions.flatMap((q, index) =>
        Array.from({ length: panel.rounds }, (_, i) => {
          const round = i + 1;
          const intendedSlotAt = panel.schedule!.slots.find((s) => s.round === round)!.intendedAt;
          const key = slotKey(panel.panelId, panel.version, q.id, round);
          const due = (supportedInstantMs(intendedSlotAt) ?? Infinity) <= input.nowMs;
          const known = complete.has(`${canonicalUuid(panel.panelId)}:${panel.version}`);
          const state: SlotState = !input.readsCurrent
            ? "readsUnavailable"
            : !prompts.has(promptKey(q.promptId, q.promptRevision))
              ? "promptMissing"
              : occupied.has(key)
                ? "occupied"
                : erased.has(key)
                  ? "erased"
                  : !due
                    ? "notDue"
                    : !known
                      ? "occupancyUnknown"
                      : "available";
          return {
            questionId: q.id,
            questionNumber: index + 1,
            round,
            questionText: q.text,
            questionLanguage: q.language,
            promptId: q.promptId,
            promptRevision: q.promptRevision,
            intendedSlotAt,
            state,
          };
        }),
      ),
    }));
}

/** Everything the owner types or chooses. Strings stay strings until the payload is built. */
export type ManualCaptureForm = {
  affirmQuestion: boolean;
  status: "" | "complete" | "failed" | "truncated";
  failure: string;
  rawAnswer: string;
  citations: string;
  citationsComplete: boolean;
  capturedDate: string;
  capturedTime: string;
  utcOffset: string;
  service: string;
  interfaceName: string;
  mode: "" | "consumer-web" | "search";
  searchMode: string;
  modelLabel: string;
  webSearchEvidenced: "unknown" | "evidenced" | "not_evidenced";
  freshSession: "" | "yes" | "no";
  personalisation: "unknown" | "non_personalised" | "personalised";
  signedIn: "unknown" | "signed_in" | "signed_out";
  memory: "unknown" | "off" | "on";
  customInstructions: "unknown" | "none" | "present";
  connectedTools: "unknown" | "none" | "present";
  temporaryChat: "unknown" | "yes" | "no";
  accountTier: string;
  locationInQuestion: string;
  collectionCountry: string;
  collectionCity: string;
  devicePermission: "unknown" | "granted" | "denied";
  vpn: "" | "yes" | "no";
  interfaceLanguage: string;
  answerLanguage: string;
  extraInstruction: string;
  priorMessages: string;
  screenshotRef: string;
  missingReason: string;
  deviationNotes: string;
  reportedCostUsd: string;
  sourceUrl: string;
};

/** A new, empty entry. Nothing is pre-ticked and nothing is copied from the panel's expected settings. */
export function emptyManualCaptureForm(): ManualCaptureForm {
  return {
    affirmQuestion: false,
    status: "",
    failure: "",
    rawAnswer: "",
    citations: "",
    citationsComplete: false,
    capturedDate: "",
    capturedTime: "",
    utcOffset: "",
    service: "",
    interfaceName: "",
    mode: "",
    searchMode: "",
    modelLabel: "",
    webSearchEvidenced: "unknown",
    freshSession: "",
    personalisation: "unknown",
    signedIn: "unknown",
    memory: "unknown",
    customInstructions: "unknown",
    connectedTools: "unknown",
    temporaryChat: "unknown",
    accountTier: "",
    locationInQuestion: "",
    collectionCountry: "",
    collectionCity: "",
    devicePermission: "unknown",
    vpn: "",
    interfaceLanguage: "",
    answerLanguage: "",
    extraInstruction: "",
    priorMessages: "",
    screenshotRef: "",
    missingReason: "",
    deviationNotes: "",
    reportedCostUsd: "",
    sourceUrl: "",
  };
}

/** Whether the entry holds anything the owner typed or chose. */
export function manualCaptureFormDirty(form: ManualCaptureForm): boolean {
  return JSON.stringify(form) !== JSON.stringify(emptyManualCaptureForm());
}

const OFFSET = /^[+-](?:0\d|1[0-4]):[0-5]\d$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The capture instant exactly as entered: local date, time (with seconds when given) and the explicit UTC offset,
 * e.g. `2026-10-05T09:42:17+02:00`. Never the import time, never rewritten. Null when incomplete or malformed.
 */
export function capturedAtFromForm(
  form: Pick<ManualCaptureForm, "capturedDate" | "capturedTime" | "utcOffset">,
) {
  if (
    !DATE.test(form.capturedDate) ||
    !TIME.test(form.capturedTime) ||
    !OFFSET.test(form.utcOffset)
  )
    return null;
  const time = form.capturedTime.length === 5 ? `${form.capturedTime}:00` : form.capturedTime;
  const iso = `${form.capturedDate}T${time}${form.utcOffset}`;
  return supportedInstantMs(iso) === null ? null : iso;
}

/** Whole minutes from the approved slot to the capture: the same floor the server checks. */
export function delayMinutes(capturedAt: string, intendedSlotAt: string): number | null {
  const cap = supportedInstantMs(capturedAt);
  const slot = supportedInstantMs(intendedSlotAt);
  return cap === null || slot === null ? null : Math.floor((cap - slot) / 60000);
}

const blank = (v: string) => v.trim() === "";
const orNull = (v: string) => (blank(v) ? null : v.trim());
const lines = (v: string) =>
  v
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
const triState = (v: "" | "yes" | "no") => (v === "" ? null : v === "yes");

export type ManualCaptureIssue =
  | "slotUnavailable"
  | "readsUnavailable"
  | "promptMissing"
  | "occupancyUnknown"
  | "affirmQuestion"
  | "status"
  | "failureRequired"
  | "failureNotAllowed"
  | "rawAnswer"
  | "capturedAt"
  | "beforeSlot"
  | "beforeApproval"
  | "inFuture"
  | "service"
  | "interfaceName"
  | "mode"
  | "freshSession"
  | "priorMessages"
  | "citations"
  | "cost"
  | "sourceUrl"
  | "capacity"
  | "deviationNotes"
  /** A bounded text field is longer than the stored schema accepts (never cut). */
  | `tooLong:${BoundedField}`
  /** The stored schema refused this field's value for another reason. */
  | `invalid:${keyof ManualCaptureForm}`
  | "invalid";

/** Where each form field is entered: its step and, for optional context, its disclosure group. */
export type ContextGroup = "model" | "session" | "place" | "notes";
export const MANUAL_CAPTURE_FIELD_PLACE: Readonly<
  Record<keyof ManualCaptureForm, { step: 1 | 2 | 3; group: ContextGroup | null }>
> = {
  affirmQuestion: { step: 1, group: null },
  status: { step: 2, group: null },
  failure: { step: 2, group: null },
  rawAnswer: { step: 2, group: null },
  citations: { step: 2, group: null },
  citationsComplete: { step: 2, group: null },
  capturedDate: { step: 3, group: null },
  capturedTime: { step: 3, group: null },
  utcOffset: { step: 3, group: null },
  service: { step: 3, group: null },
  interfaceName: { step: 3, group: null },
  mode: { step: 3, group: null },
  freshSession: { step: 3, group: null },
  priorMessages: { step: 3, group: null },
  modelLabel: { step: 3, group: "model" },
  searchMode: { step: 3, group: "model" },
  webSearchEvidenced: { step: 3, group: "model" },
  personalisation: { step: 3, group: "session" },
  signedIn: { step: 3, group: "session" },
  memory: { step: 3, group: "session" },
  customInstructions: { step: 3, group: "session" },
  connectedTools: { step: 3, group: "session" },
  temporaryChat: { step: 3, group: "session" },
  accountTier: { step: 3, group: "session" },
  interfaceLanguage: { step: 3, group: "place" },
  answerLanguage: { step: 3, group: "place" },
  collectionCountry: { step: 3, group: "place" },
  collectionCity: { step: 3, group: "place" },
  locationInQuestion: { step: 3, group: "place" },
  devicePermission: { step: 3, group: "place" },
  vpn: { step: 3, group: "place" },
  extraInstruction: { step: 3, group: "notes" },
  screenshotRef: { step: 3, group: "notes" },
  missingReason: { step: 3, group: "notes" },
  reportedCostUsd: { step: 3, group: "notes" },
  sourceUrl: { step: 3, group: "notes" },
  deviationNotes: { step: 3, group: "notes" },
};

/** The stored schema's character limits for free-text fields (answer evidence and capture context), measured
 * on the value as it is stored (trimmed where the payload trims it). Checked locally so an oversized value is
 * named at its own field and step; nothing is ever cut. */
export const MANUAL_CAPTURE_FIELD_LIMITS = {
  rawAnswer: 50000,
  failure: 2000,
  service: 100,
  interfaceName: 100,
  searchMode: 100,
  modelLabel: 120,
  accountTier: 40,
  interfaceLanguage: 40,
  answerLanguage: 40,
  collectionCountry: 80,
  collectionCity: 120,
  locationInQuestion: 120,
  extraInstruction: 2000,
  screenshotRef: 200,
  missingReason: 500,
} as const satisfies Partial<Record<keyof ManualCaptureForm, number>>;
export type BoundedField = keyof typeof MANUAL_CAPTURE_FIELD_LIMITS;
/** The length the schema measures for a bounded field: the raw answer verbatim, everything else trimmed. */
export const storedLength = (field: BoundedField, value: string) =>
  (field === "rawAnswer" ? value : value.trim()).length;
/** The form field an issue is about, for field association (null for whole-entry issues). */
export function issueField(issue: ManualCaptureIssue): keyof ManualCaptureForm | null {
  const i = issue.indexOf(":");
  if (i > 0) return issue.slice(i + 1) as keyof ManualCaptureForm;
  return (
    ISSUE_FORM_FIELD[issue] ??
    (issue in MANUAL_CAPTURE_FIELD_PLACE ? (issue as keyof ManualCaptureForm) : null)
  );
}
const ISSUE_FORM_FIELD: Partial<Record<ManualCaptureIssue, keyof ManualCaptureForm>> = {
  failureRequired: "failure",
  failureNotAllowed: "failure",
  capturedAt: "capturedDate",
  beforeSlot: "capturedDate",
  beforeApproval: "capturedDate",
  inFuture: "capturedDate",
  cost: "reportedCostUsd",
};

/** The not-sent reason for a slot that cannot take a new original. */
export function slotIssue(state: SlotState): ManualCaptureIssue {
  return state === "readsUnavailable" || state === "promptMissing" || state === "occupancyUnknown"
    ? state
    : "slotUnavailable";
}

/** Which form step an issue belongs to (1 choose, 2 answer, 3 context); used for step-by-step checks. */
export function issueStep(issue: ManualCaptureIssue): 1 | 2 | 3 {
  if (issue.includes(":")) return MANUAL_CAPTURE_FIELD_PLACE[issueField(issue)!].step;
  switch (issue) {
    case "slotUnavailable":
    case "readsUnavailable":
    case "promptMissing":
    case "occupancyUnknown":
    case "capacity":
    case "affirmQuestion":
      return 1;
    case "status":
    case "failureRequired":
    case "failureNotAllowed":
    case "rawAnswer":
    case "citations":
      return 2;
    default:
      return 3;
  }
}

/**
 * Build, validate locally and FREEZE the exact object the server will store. The returned `frozen` is the output
 * of the same `parseManualCaptureInput` the server runs (labels trimmed, capture context passed through), so a
 * later exact resend, the server's dedup and a positive stored-record match all compare like with like. Any issue
 * here means the entry was not sent.
 */
export function buildManualCapture(input: {
  version: VersionChoice;
  slot: SlotChoice;
  form: ManualCaptureForm;
  answerCount: number;
  nowMs: number;
}): { ok: true; frozen: Readonly<AnswerEvidence> } | { ok: false; issues: ManualCaptureIssue[] } {
  const { version, slot, form } = input;
  const issues: ManualCaptureIssue[] = [];
  if (slot.state !== "available") issues.push(slotIssue(slot.state));
  if (input.answerCount >= MANUAL_CAPTURE_CAPACITY) issues.push("capacity");
  if (!form.affirmQuestion) issues.push("affirmQuestion");
  if (form.status === "") issues.push("status");
  if (form.status !== "" && form.status !== "complete" && blank(form.failure))
    issues.push("failureRequired");
  if (form.status === "complete" && !blank(form.failure)) issues.push("failureNotAllowed");
  if (form.status === "complete" && blank(form.rawAnswer)) issues.push("rawAnswer");
  const capturedAt = capturedAtFromForm(form);
  if (!capturedAt) issues.push("capturedAt");
  else {
    const cap = supportedInstantMs(capturedAt)!;
    if (cap < (supportedInstantMs(slot.intendedSlotAt) ?? Infinity)) issues.push("beforeSlot");
    const approvedAt = version.panel.approval?.approvedAt;
    if (!approvedAt || cap < Date.parse(approvedAt)) issues.push("beforeApproval");
    if (cap > input.nowMs) issues.push("inFuture");
  }
  if (blank(form.service)) issues.push("service");
  if (blank(form.interfaceName)) issues.push("interfaceName");
  if (form.mode === "") issues.push("mode");
  if (form.freshSession === "") issues.push("freshSession");
  if (!/^\d{1,4}$/.test(form.priorMessages.trim())) issues.push("priorMessages");
  const citations = lines(form.citations);
  if (
    citations.some((c) => evidenceUrl(c) === null || c.length > URL_MAX) ||
    citations.length > 100
  )
    issues.push("citations");
  const cost = blank(form.reportedCostUsd) ? null : Number(form.reportedCostUsd.trim());
  if (cost !== null && (!Number.isFinite(cost) || cost < 0 || cost > 10000)) issues.push("cost");
  const sourceUrl = orNull(form.sourceUrl);
  if (sourceUrl !== null && (evidenceUrl(sourceUrl) === null || sourceUrl.length > URL_MAX))
    issues.push("sourceUrl");
  for (const field of Object.keys(MANUAL_CAPTURE_FIELD_LIMITS) as BoundedField[]) {
    // A reason on a complete answer is already refused as not applicable.
    if (field === "failure" && form.status === "complete") continue;
    if (storedLength(field, form[field]) > MANUAL_CAPTURE_FIELD_LIMITS[field])
      issues.push(`tooLong:${field}`);
  }
  // Checked on the stored (trimmed) value: surrounding tabs are trimmed like the schema does; internal ones
  // are refused.
  if (/\p{Cc}/u.test(form.accountTier.trim())) issues.push("invalid:accountTier");
  const notes = lines(form.deviationNotes);
  if (notes.length > 20 || notes.some((n) => n.length > 500)) issues.push("deviationNotes");
  if (issues.length) return { ok: false, issues };

  const modelVersion = orNull(form.modelLabel);
  const payload = {
    promptId: slot.promptId,
    promptRevision: slot.promptRevision,
    surface: form.service.trim(),
    mode: form.mode,
    method: MANUAL_CAPTURE_METHOD,
    modelVersion,
    capturedAt,
    status: form.status,
    rawAnswer: form.rawAnswer,
    citations,
    citationsComplete: form.citationsComplete,
    failure: form.status === "complete" ? null : form.failure.trim(),
    reportedCostUsd: cost,
    sourceUrl,
    supersedesId: null,
    captureContext: {
      panelId: version.panel.panelId,
      panelVersion: version.panel.version,
      slot: { round: slot.round, questionId: slot.questionId },
      brandRunId: null,
      session: {
        freshSession: form.freshSession === "yes",
        personalisation: form.personalisation,
        signedIn: form.signedIn,
        memory: form.memory,
        customInstructions: form.customInstructions,
        connectedTools: form.connectedTools,
        temporaryChat: form.temporaryChat,
        ...(blank(form.accountTier) ? {} : { accountTier: form.accountTier.trim() }),
      },
      location: {
        inQuestion: orNull(form.locationInQuestion),
        collectionCountry: orNull(form.collectionCountry),
        collectionCity: orNull(form.collectionCity),
        devicePermission: form.devicePermission,
        vpn: triState(form.vpn),
      },
      language: {
        prompt: slot.questionLanguage,
        interface: blank(form.interfaceLanguage) ? "unknown" : form.interfaceLanguage.trim(),
        answer: orNull(form.answerLanguage),
      },
      surface: {
        service: form.service.trim(),
        interface: form.interfaceName.trim(),
        mode: form.mode,
        searchMode: orNull(form.searchMode),
        modelLabel: modelVersion,
        webSearchEvidenced: form.webSearchEvidenced,
      },
      time: {
        capturedAt,
        intendedSlotAt: slot.intendedSlotAt,
        delayMinutes: delayMinutes(capturedAt!, slot.intendedSlotAt),
      },
      instructions: {
        questionText: slot.questionText,
        extraInstruction: orNull(form.extraInstruction),
        priorMessages: Number(form.priorMessages.trim()),
      },
      capture: {
        screenshotRef: orNull(form.screenshotRef),
        missingReason: orNull(form.missingReason),
      },
      deviationNotes: lines(form.deviationNotes),
    },
  };
  try {
    return { ok: true, frozen: deepFreeze(parseManualCaptureInput(payload).input) };
  } catch (error) {
    // Name the field the stored schema refused, so the owner is sent to it; anything else stays generic.
    const mapped =
      error instanceof z.ZodError
        ? [...new Set(error.issues.map((i) => schemaIssue(i.path)))]
        : ["invalid" as const];
    return { ok: false, issues: mapped };
  }
}

const URL_MAX = 2048;
/** Schema paths (answer evidence, or capture context relative to itself) → the form field's issue. */
const SCHEMA_FIELD: Readonly<Record<string, ManualCaptureIssue>> = {
  rawAnswer: "invalid:rawAnswer",
  failure: "invalid:failure",
  surface: "invalid:service",
  modelVersion: "invalid:modelLabel",
  citations: "citations",
  sourceUrl: "sourceUrl",
  reportedCostUsd: "cost",
  capturedAt: "capturedAt",
  "session.accountTier": "invalid:accountTier",
  "location.inQuestion": "invalid:locationInQuestion",
  "location.collectionCountry": "invalid:collectionCountry",
  "location.collectionCity": "invalid:collectionCity",
  "language.interface": "invalid:interfaceLanguage",
  "language.answer": "invalid:answerLanguage",
  "surface.service": "invalid:service",
  "surface.interface": "invalid:interfaceName",
  "surface.searchMode": "invalid:searchMode",
  "surface.modelLabel": "invalid:modelLabel",
  "instructions.extraInstruction": "invalid:extraInstruction",
  "instructions.priorMessages": "priorMessages",
  "capture.screenshotRef": "invalid:screenshotRef",
  "capture.missingReason": "invalid:missingReason",
  deviationNotes: "deviationNotes",
  "time.capturedAt": "capturedAt",
};
function schemaIssue(path: readonly PropertyKey[]): ManualCaptureIssue {
  const parts = path.filter((p) => typeof p === "string") as string[];
  const rel = parts[0] === "captureContext" ? parts.slice(1) : parts;
  for (let n = rel.length; n > 0; n--) {
    const hit = SCHEMA_FIELD[rel.slice(0, n).join(".")];
    if (hit) return hit;
  }
  return "invalid";
}

/**
 * Whether a NEW original may be dispatched now, from the CURRENT scoped reads: the chosen slot must still be
 * available and the current successful answer count below capacity (null = not currently known). Run right
 * before the first send only; an explicit exact resend of the frozen entry never runs it (the server's dedup
 * of an identical input precedes its capacity rule, and a resend must not fabricate a "not stored").
 */
export function firstSendIssues(input: {
  choices: readonly VersionChoice[];
  pick: { key: string; questionId: string; round: number };
  answerCount: number | null;
}): ManualCaptureIssue[] {
  const slot = input.choices
    .find((v) => v.key === input.pick.key)
    ?.slots.find((s) => s.questionId === input.pick.questionId && s.round === input.pick.round);
  const out: ManualCaptureIssue[] = [];
  if (!slot || slot.state !== "available") out.push(slotIssue(slot?.state ?? "readsUnavailable"));
  if (input.answerCount === null) {
    if (!out.length) out.push("readsUnavailable");
  } else if (input.answerCount >= MANUAL_CAPTURE_CAPACITY) out.push("capacity");
  return out;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

/**
 * Positive evidence only: a stored record's input is structurally identical to the frozen submission (object
 * keys in any order, arrays in order, strings and numbers exact). Never a match on slot, text or time alone.
 */
export function sameStoredInput(stored: unknown, frozen: unknown): boolean {
  if (stored === frozen) return true;
  if (Array.isArray(stored) || Array.isArray(frozen)) {
    if (!Array.isArray(stored) || !Array.isArray(frozen) || stored.length !== frozen.length)
      return false;
    return stored.every((v, i) => sameStoredInput(v, frozen[i]));
  }
  if (stored && frozen && typeof stored === "object" && typeof frozen === "object") {
    const a = Object.entries(stored).filter(([, v]) => v !== undefined);
    const b = Object.entries(frozen).filter(([, v]) => v !== undefined);
    if (a.length !== b.length) return false;
    const other = frozen as Record<string, unknown>;
    return a.every(([k, v]) => k in other && sameStoredInput(v, other[k]));
  }
  return false;
}

/** Submission state. Once any dispatched attempt is unconfirmed, it stays so until a valid UUID or a positive
 * match; confirmed never goes back. Only local validation (before a call) can mean "not sent". */
export type Submission =
  | { phase: "editing" }
  | { phase: "review"; frozen: Readonly<AnswerEvidence> }
  | {
      phase: "sending";
      frozen: Readonly<AnswerEvidence>;
      attempt: "first" | "resend";
      uncertain: boolean;
    }
  | {
      phase: "unconfirmed";
      frozen: Readonly<AnswerEvidence>;
      note: "sent" | "resend" | "notFound" | "checkFailed";
    }
  | { phase: "confirmed"; frozen: Readonly<AnswerEvidence>; id: string; via: "response" | "match" };

const uuid = z.string().uuid();

/** What one dispatched send proves: only a valid UUID string confirms; everything else (any error, any code, a
 * malformed or missing response, transport failure) leaves the submission unconfirmed. */
export function settleSend(
  prior: Extract<Submission, { phase: "sending" }>,
  outcome: { ok: true; value: unknown } | { ok: false },
): Submission {
  if (outcome.ok && uuid.safeParse(outcome.value).success)
    return {
      phase: "confirmed",
      frozen: prior.frozen,
      id: outcome.value as string,
      via: "response",
    };
  return {
    phase: "unconfirmed",
    frozen: prior.frozen,
    note: prior.attempt === "resend" ? "resend" : "sent",
  };
}

/** What a scoped read of stored records proves for an unconfirmed submission. */
export function settleCheck(
  prior: Extract<Submission, { phase: "unconfirmed" }>,
  read: { ok: true; answers: readonly { id: string; input: unknown }[] } | { ok: false },
): Submission {
  if (!read.ok) return { ...prior, note: "checkFailed" };
  const match = read.answers.find((a) => sameStoredInput(a.input, prior.frozen));
  return match
    ? { phase: "confirmed", frozen: prior.frozen, id: match.id, via: "match" }
    : { ...prior, note: "notFound" };
}

/** What leaving would lose, which decides the leave dialog. */
export type LeaveKind = "none" | "unsent" | "sending" | "unconfirmed";
export function leaveKind(submission: Submission, dirty: boolean): LeaveKind {
  switch (submission.phase) {
    case "confirmed":
      return "none";
    case "sending":
      return "sending";
    case "unconfirmed":
      return "unconfirmed";
    case "review":
      return "unsent";
    case "editing":
      return dirty ? "unsent" : "none";
  }
}
