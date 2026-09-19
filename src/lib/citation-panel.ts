import { z } from "zod";
import { answerEvidenceSchema } from "./answer-evidence";
import {
  countDistinctSubstantiveChanges,
  isVerifiedImprovement,
  type Improvement,
} from "./citation-finding";
/**
 * Citation Intelligence v1, CI-2 record design (product/CITATION_INTELLIGENCE_SPEC.md §5, §8).
 *
 * A panel is an immutable, owner-approved set of question versions run by hand on exactly
 * one consumer surface under a fixed session protocol. Discovery and brand panels never
 * share a record, a count or a denominator. Capture context extends the existing manual
 * answer record; it does not replace it. Nothing here schedules, collects or classifies.
 */
export const PANEL_KINDS = ["discovery", "brand"] as const;
export const MAX_PANEL_QUESTIONS = 10;
export const DISCOVERY_ROUNDS = 4;
const text = (max: number) => z.string().trim().min(1).max(max);
const instant = z.string().datetime({ offset: true });
const questionId = z.string().regex(/^[A-Z]{2}-[DB]\d{2}$/);
export const panelQuestionSchema = z
  .object({
    /** Panel-local identifier such as SY-D01; brand questions use the B series. */
    id: questionId,
    promptId: z.string().uuid(),
    promptRevision: z.number().int().min(1).max(1000),
    /** The executable question text exactly as approved; translations are never sent. */
    text: text(2000),
    language: text(40),
  })
  .strict();
export const sessionProtocolSchema = z
  .object({
    freshSession: z.literal(true),
    personalisation: z.enum(["non_personalised", "personalised", "unknown"]),
    signedIn: z.enum(["signed_in", "signed_out", "unknown"]),
    memory: z.enum(["off", "on", "unknown"]),
    customInstructions: z.enum(["none", "present", "unknown"]),
    connectedTools: z.enum(["none", "present", "unknown"]),
    /** No extra "cite sources" or client-seeding instruction is allowed in the protocol. */
    extraInstruction: z.null(),
    priorMessages: z.literal(0),
  })
  .strict();
export const surfaceSchema = z
  .object({
    service: text(100),
    interface: text(100),
    mode: z.enum(["consumer-web", "api", "search"]),
    searchMode: text(100).nullable(),
    /** The model label the methodology pins, or null when it pins none (and, on a capture, when
     * the surface exposed no model). A known model-label change — including to or from null —
     * breaks comparability; the label is never inferred. */
    modelLabel: text(120).nullable(),
    /** Whether web-search grounding was evidenced. On the locked panel this is the expected
     * methodology; on a capture it is the observed state. `unknown` never matches a definite
     * locked expectation, so an unknown observation is never promoted to an invented success. */
    webSearchEvidenced: z.enum(["evidenced", "not_evidenced", "unknown"]),
  })
  .strict();
export const panelProtocolSchema = z
  .object({
    panelId: z.string().uuid(),
    version: z.number().int().min(1).max(1000),
    kind: z.enum(PANEL_KINDS),
    client: z.object({ name: text(200), market: text(120) }).strict(),
    questionLanguage: text(40),
    surface: surfaceSchema,
    session: sessionProtocolSchema,
    questions: z.array(panelQuestionSchema).min(1).max(MAX_PANEL_QUESTIONS),
    /** Weekly rounds for a discovery panel; a brand panel is never scheduled here. */
    rounds: z.number().int().min(0).max(12),
    status: z.enum(["draft", "locked"]),
    approval: z.object({ approvedBy: z.string().uuid(), approvedAt: instant }).strict().nullable(),
  })
  .strict()
  .superRefine((panel, ctx) => {
    const ids = new Set(panel.questions.map((q) => q.id));
    if (ids.size !== panel.questions.length)
      ctx.addIssue({ code: "custom", path: ["questions"], message: "Question ids must be unique" });
    const series = panel.kind === "discovery" ? "D" : "B";
    if (panel.questions.some((q) => q.id[3] !== series))
      ctx.addIssue({
        code: "custom",
        path: ["questions"],
        message: `A ${panel.kind} panel holds only ${series}-series questions`,
      });
    if (panel.questions.some((q) => q.language !== panel.questionLanguage))
      ctx.addIssue({
        code: "custom",
        path: ["questions"],
        message: "Every question must be in the panel language; translations are reading aids",
      });
    if (panel.kind === "brand" && panel.rounds !== 0)
      ctx.addIssue({
        code: "custom",
        path: ["rounds"],
        message: "Brand panels are unscheduled; a diagnostic run needs its own approved scope",
      });
    if (panel.status === "locked" && !panel.approval)
      ctx.addIssue({
        code: "custom",
        path: ["approval"],
        message: "A locked panel needs owner approval",
      });
    if (panel.status === "locked" && panel.kind === "discovery" && panel.rounds < 1)
      ctx.addIssue({
        code: "custom",
        path: ["rounds"],
        message: "A locked discovery panel has rounds",
      });
  });
export type PanelProtocol = z.infer<typeof panelProtocolSchema>;
/** Planned discovery slots: questions × one surface × rounds. Brand panels plan nothing. */
export function plannedSlots(panel: PanelProtocol) {
  if (panel.kind !== "discovery") return [];
  return Array.from({ length: panel.rounds }, (_, r) =>
    panel.questions.map((q) => ({ round: r + 1, questionId: q.id })),
  ).flat();
}
/** A separately approved brand diagnostic run: its own scope, budget and dates. */
export const brandRunSchema = z
  .object({
    panelId: z.string().uuid(),
    panelVersion: z.number().int().min(1),
    approvedBy: z.string().uuid(),
    approvedAt: instant,
    observationBudget: z.number().int().min(1).max(50),
    rounds: z.number().int().min(1).max(2),
  })
  .strict();
export const captureContextSchema = z
  .object({
    panelId: z.string().uuid(),
    panelVersion: z.number().int().min(1),
    slot: z.object({ round: z.number().int().min(1).max(12), questionId }).strict(),
    /** The run of a brand panel this capture belongs to; null for discovery. */
    brandRunId: z.string().uuid().nullable(),
    session: z
      .object({
        freshSession: z.boolean(),
        personalisation: z.enum(["non_personalised", "personalised", "unknown"]),
        signedIn: z.enum(["signed_in", "signed_out", "unknown"]),
        memory: z.enum(["off", "on", "unknown"]),
        customInstructions: z.enum(["none", "present", "unknown"]),
        connectedTools: z.enum(["none", "present", "unknown"]),
        temporaryChat: z.enum(["yes", "no", "unknown"]),
      })
      .strict(),
    location: z
      .object({
        inQuestion: text(120).nullable(),
        collectionCountry: text(80).nullable(),
        collectionCity: text(120).nullable(),
        devicePermission: z.enum(["granted", "denied", "unknown"]),
        vpn: z.boolean().nullable(),
      })
      .strict(),
    language: z
      .object({ prompt: text(40), interface: text(40), answer: text(40).nullable() })
      .strict(),
    surface: surfaceSchema,
    time: z
      .object({
        capturedAt: instant,
        intendedSlotAt: instant,
        delayMinutes: z.number().int().min(0).nullable(),
      })
      .strict(),
    instructions: z
      .object({
        questionText: text(2000),
        extraInstruction: z.string().trim().max(2000).nullable(),
        priorMessages: z.number().int().min(0),
      })
      .strict(),
    capture: z
      .object({
        screenshotRef: z.string().max(200).nullable(),
        missingReason: z.string().trim().max(500).nullable(),
      })
      .strict(),
    deviationNotes: z.array(z.string().trim().min(1).max(500)).max(20),
  })
  .strict();
export type CaptureContext = z.infer<typeof captureContextSchema>;
export const SLOT_OUTCOMES = [
  "complete",
  "failed",
  "truncated",
  "missed",
  "protocol_deviant",
] as const;
export type SlotOutcome = (typeof SLOT_OUTCOMES)[number];
/** Protocol deviations that make a capture ineligible for comparison (§5.2, CI11-T15/T16). */
export function protocolDeviations(panel: PanelProtocol, context: CaptureContext): string[] {
  const out: string[] = [];
  if (panel.status !== "locked" || !panel.approval) out.push("panel_not_approved");
  // A capture is only comparable against the exact locked panel version it claims. A different
  // panel or version is a different approved protocol, not the same baseline.
  if (context.panelId !== panel.panelId) out.push("panel_mismatch");
  if (context.panelVersion !== panel.version) out.push("panel_version_differs");
  // Discovery rounds are the panel's planned slots; a round outside 1..rounds is not planned.
  // Brand rounds are governed by a separately approved run, not the panel, so are not bounded here.
  if (panel.kind === "discovery" && (context.slot.round < 1 || context.slot.round > panel.rounds))
    out.push("round_out_of_panel");
  const question = panel.questions.find((q) => q.id === context.slot.questionId);
  if (!question) out.push("question_not_in_panel");
  else if (question.text !== context.instructions.questionText) out.push("question_text_changed");
  if (!context.session.freshSession) out.push("session_not_fresh");
  if (context.session.personalisation !== panel.session.personalisation)
    out.push("personalisation_differs");
  // The locked session protocol also fixes sign-in, memory, custom instructions and connected
  // tools; a materially different (or unknown-where-locked) session is not a comparable capture.
  if (context.session.signedIn !== panel.session.signedIn) out.push("signed_in_differs");
  if (context.session.memory !== panel.session.memory) out.push("memory_differs");
  if (context.session.customInstructions !== panel.session.customInstructions)
    out.push("custom_instructions_differ");
  if (context.session.connectedTools !== panel.session.connectedTools)
    out.push("connected_tools_differ");
  if (context.instructions.extraInstruction !== null) out.push("extra_instruction");
  if (context.instructions.priorMessages > 0) out.push("prior_messages");
  if (
    context.surface.service !== panel.surface.service ||
    context.surface.interface !== panel.surface.interface ||
    context.surface.mode !== panel.surface.mode ||
    context.surface.searchMode !== panel.surface.searchMode
  )
    out.push("surface_or_mode_differs");
  // The locked methodology also fixes the model label and whether web search must be evidenced.
  // A known model change (including to/from the unpinned null) or a different — or
  // unknown-where-locked — web-search-evidence state is a different methodology, not this
  // baseline. Unknown is never treated as the locked success.
  if (context.surface.modelLabel !== panel.surface.modelLabel) out.push("model_label_differs");
  if (context.surface.webSearchEvidenced !== panel.surface.webSearchEvidenced)
    out.push("web_search_evidence_differs");
  if (context.language.prompt !== panel.questionLanguage) out.push("prompt_language_differs");
  if (context.brandRunId !== null && panel.kind !== "brand") out.push("brand_run_on_discovery");
  if (context.brandRunId === null && panel.kind === "brand") out.push("brand_capture_without_run");
  return out.concat(context.deviationNotes.map((note) => `noted:${note}`));
}
export function slotOutcome(
  panel: PanelProtocol,
  answer: Pick<
    z.infer<typeof answerEvidenceSchema>,
    "status" | "promptId" | "promptRevision"
  > | null,
  context: CaptureContext | null,
): SlotOutcome {
  if (!answer || !context) return "missed";
  if (protocolDeviations(panel, context).length) return "protocol_deviant";
  // The answer record must be the panel slot's exact versioned question. Status alone is not
  // enough: an answer that references a different prompt id or revision than the slot's approved
  // question is a different question or version, not this slot's baseline. (The slot's presence
  // in the panel and its question text are already checked by protocolDeviations.)
  const question = panel.questions.find((q) => q.id === context.slot.questionId);
  if (
    !question ||
    answer.promptId !== question.promptId ||
    answer.promptRevision !== question.promptRevision
  )
    return "protocol_deviant";
  return answer.status;
}
export interface ReviewedCapture {
  questionId: string;
  round: number;
  outcome: SlotOutcome;
  /** Owner declared the citation list complete on the existing answer record. */
  citationsComplete: boolean;
  /** Human-reviewed facts about this capture; null means not reviewed. */
  ownCitation: boolean | null;
  mention: boolean | null;
  recommended: boolean | null;
  /** A positive own citation seen in a partial capture (kept out of complete-pair counts). */
  partialPositiveCitation?: boolean;
}
/** Both counting and pairing must reject ambiguous or unplanned evidence independently. */
function assertCaptureSlots(panel: PanelProtocol, captures: ReviewedCapture[]) {
  // Denominators must not be inflated by slots that do not belong to this panel. Reject an
  // ambiguous capture set rather than silently keeping whichever copy reads more favourably:
  // a question outside the panel, a discovery round outside 1..rounds, or two records for one
  // slot are all refused. Brand/discovery stay separate because the question ids never overlap.
  const questionIds = new Set(panel.questions.map((q) => q.id));
  const seenSlots = new Set<string>();
  for (const c of captures) {
    if (!questionIds.has(c.questionId))
      throw new Error(`panelCounts: capture ${c.questionId} is not in this ${panel.kind} panel`);
    if (
      !Number.isInteger(c.round) ||
      c.round < 1 ||
      (panel.kind === "discovery" && c.round > panel.rounds)
    )
      throw new Error(
        `panelCounts: round ${c.round} is outside the panel's ${panel.rounds} rounds`,
      );
    const slot = `${c.questionId}:${c.round}`;
    if (seenSlots.has(slot))
      throw new Error(`panelCounts: duplicate captures for slot ${slot}; resolve to one record`);
    seenSlots.add(slot);
  }
}
/** Descriptive counts with explicit denominators (§6.2). Never a rate estimate. */
export function panelCounts(panel: PanelProtocol, captures: ReviewedCapture[]) {
  assertCaptureSlots(panel, captures);
  const planned = plannedSlots(panel).length;
  const complete = captures.filter((c) => c.outcome === "complete");
  const citationEligible = complete.filter((c) => c.citationsComplete && c.ownCitation !== null);
  const mentionEligible = complete.filter((c) => c.mention !== null);
  const recommendationEligible = complete.filter((c) => c.recommended !== null);
  return {
    kind: panel.kind,
    planned,
    recorded: captures.length,
    outcomes: Object.fromEntries(
      SLOT_OUTCOMES.map((o) => [o, captures.filter((c) => c.outcome === o).length]),
    ) as Record<SlotOutcome, number>,
    ownCitation: {
      present: citationEligible.filter((c) => c.ownCitation).length,
      eligible: citationEligible.length,
      partialPositive: captures.filter((c) => c.outcome !== "complete" && c.partialPositiveCitation)
        .length,
    },
    mention: {
      present: mentionEligible.filter((c) => c.mention).length,
      eligible: mentionEligible.length,
    },
    recommended: {
      present: recommendationEligible.filter((c) => c.recommended).length,
      eligible: recommendationEligible.length,
    },
    unreviewed: complete.filter((c) => c.ownCitation === null && c.mention === null).length,
  };
}
/** A reviewed capture carrying its own identity and the panel/client it was captured under, so
 * an improvement's baseline evidence can be resolved against actual records, not caller claims. */
export interface ScopedCapture extends ReviewedCapture {
  captureId: string;
  panelId: string;
  panelVersion: number;
  client: { name: string; market: string };
  capturedAt: string;
}
/** A finding referenced by an improvement, carrying the panel/client it belongs to. */
export interface ScopedFinding {
  findingId: string;
  panelId: string;
  panelVersion: number;
  client: { name: string; market: string };
}
/** The explicit evidence a retest is proved against: this panel's scoped captures and findings
 * and the improvement records. Nothing is trusted by a bare asserted panel id on the improvement. */
export interface ComparableEvidence {
  captures: ScopedCapture[];
  findings: ScopedFinding[];
  improvements: Improvement[];
}
/** Exact panel-and-client scope key. Same panel id, same version and same client. */
function panelClientKey(scope: {
  panelId: string;
  panelVersion: number;
  client: { name: string; market: string };
}): string {
  return JSON.stringify([
    scope.panelId,
    scope.panelVersion,
    scope.client.name,
    scope.client.market,
  ]);
}
/**
 * Comparable baseline/follow-up pairs for the fourth-round re-test (§5.3, CI11-T38). A pair
 * needs the same question complete, reviewed and citation-complete in two distinct rounds, a
 * valid baseline-before-follow-up chronology, and the follow-up captured after two *distinct*
 * destination-verified improvements. Missing pairs are listed with a reason, never filled.
 *
 * Evidence is bound to this exact panel and client, not asserted: each improvement's
 * `findingIds` and `baselineCaptureIds` must resolve to actual finding and capture records that
 * belong to this panel/client (a foreign, missing or duplicate reference is rejected). The two
 * changes must be *substantively* distinct (task, or destination + approved version), so a clone
 * with a fresh UUID cannot pose as a second change, and each must be verified strictly after the
 * baseline it improves on and before the follow-up. Because every eligible capture is a
 * `complete` slot, it already matched the locked panel surface (service, mode, model label and
 * web-search evidence) through `slotOutcome`/`protocolDeviations`, so baseline and follow-up
 * share one methodology; distinctness and genuine verification come from citation-finding.
 */
export function comparablePairs(
  panel: PanelProtocol,
  evidence: ComparableEvidence,
  rounds: { baseline: number; followUp: number },
) {
  const { captures, findings, improvements } = evidence;
  assertCaptureSlots(panel, captures);
  const panelScope = panelClientKey({
    panelId: panel.panelId,
    panelVersion: panel.version,
    client: panel.client,
  });
  // Index the scoped evidence, rejecting any record that belongs to another panel/client or
  // reuses an identity. These are the only records an improvement may resolve against.
  const captureById = new Map<string, ScopedCapture>();
  for (const c of captures) {
    if (panelClientKey(c) !== panelScope)
      throw new Error(`comparablePairs: capture ${c.captureId} belongs to another panel or client`);
    if (captureById.has(c.captureId))
      throw new Error(`comparablePairs: duplicate capture id ${c.captureId}`);
    captureById.set(c.captureId, c);
  }
  const findingById = new Map<string, ScopedFinding>();
  for (const f of findings) {
    if (panelClientKey(f) !== panelScope)
      throw new Error(`comparablePairs: finding ${f.findingId} belongs to another panel or client`);
    if (findingById.has(f.findingId))
      throw new Error(`comparablePairs: duplicate finding id ${f.findingId}`);
    findingById.set(f.findingId, f);
  }
  const refusal = (reason: string) => ({
    pairs: [] as Array<{
      questionId: string;
      baseline: ReviewedCapture;
      followUp: ReviewedCapture;
    }>,
    missing: panel.questions.map((q) => ({ questionId: q.id, reason })),
    comparable: false,
  });
  if (panel.status !== "locked" || !panel.approval) return refusal("panel_not_approved");
  // This gate proves a planned discovery retest. Brand diagnostics require their
  // separate approved run, which this function does not receive or authorize.
  if (panel.kind !== "discovery") return refusal("discovery_panel_required");
  if (
    [rounds.baseline, rounds.followUp].some(
      (round) => !Number.isInteger(round) || round < 1 || round > panel.rounds,
    ) ||
    rounds.followUp < rounds.baseline
  )
    return refusal("comparison_rounds_invalid");
  // Bind each verified improvement to this panel/client through its findings and baseline
  // captures, then keep only those verified strictly after every baseline capture they improve
  // on. Foreign, missing or duplicated references are rejected outright.
  const bound: Improvement[] = [];
  for (const imp of improvements) {
    if (!isVerifiedImprovement(imp)) continue;
    if (new Set(imp.findingIds).size !== imp.findingIds.length)
      throw new Error(`comparablePairs: improvement ${imp.improvementId} duplicates a finding id`);
    if (new Set(imp.baselineCaptureIds).size !== imp.baselineCaptureIds.length)
      throw new Error(
        `comparablePairs: improvement ${imp.improvementId} duplicates a baseline capture id`,
      );
    for (const fid of imp.findingIds)
      if (!findingById.has(fid))
        throw new Error(
          `comparablePairs: finding ${fid} is not recorded for this panel and client`,
        );
    const baselineAts = imp.baselineCaptureIds.map((cid) => {
      const capture = captureById.get(cid);
      if (!capture)
        throw new Error(
          `comparablePairs: baseline capture ${cid} is not recorded for this panel and client`,
        );
      return Date.parse(capture.capturedAt);
    });
    const verifiedAt = Date.parse(imp.verification!.verifiedAt);
    // A verified improvement must be verified after every baseline capture it claims to improve
    // on; an unorderable or pre-baseline verification is not a proven change against that baseline.
    if (
      !Number.isFinite(verifiedAt) ||
      baselineAts.some((at) => !Number.isFinite(at) || verifiedAt <= at)
    )
      continue;
    bound.push(imp);
  }
  const gate =
    countDistinctSubstantiveChanges(bound) >= 2
      ? Math.max(...bound.map((imp) => Date.parse(imp.verification!.verifiedAt)))
      : null;
  const sameRound = rounds.baseline === rounds.followUp;
  const pairs: Array<{ questionId: string; baseline: ReviewedCapture; followUp: ReviewedCapture }> =
    [];
  const missing: Array<{ questionId: string; reason: string }> = [];
  for (const q of panel.questions) {
    const eligible = (round: number) =>
      captures.find(
        (c) =>
          c.questionId === q.id &&
          c.round === round &&
          c.outcome === "complete" &&
          c.citationsComplete &&
          c.ownCitation !== null,
      );
    // A round cannot be its own baseline and follow-up; that would compare a capture with itself.
    if (sameRound) {
      missing.push({ questionId: q.id, reason: "baseline_and_follow_up_same_round" });
      continue;
    }
    const baseline = eligible(rounds.baseline);
    const followUp = eligible(rounds.followUp);
    if (!baseline) {
      missing.push({ questionId: q.id, reason: "baseline_not_eligible" });
      continue;
    }
    if (!followUp) {
      missing.push({ questionId: q.id, reason: "follow_up_not_eligible" });
      continue;
    }
    if (gate === null) {
      missing.push({ questionId: q.id, reason: "two_verified_improvements_required" });
      continue;
    }
    const baselineAt = Date.parse(baseline.capturedAt);
    const followUpAt = Date.parse(followUp.capturedAt);
    // Malformed timestamps cannot be ordered; refuse them explicitly rather than let a NaN
    // comparison fall through and assert a re-test the chronology never proves.
    if (!Number.isFinite(baselineAt) || !Number.isFinite(followUpAt)) {
      missing.push({ questionId: q.id, reason: "capture_timestamp_invalid" });
      continue;
    }
    if (followUpAt <= baselineAt) {
      missing.push({ questionId: q.id, reason: "follow_up_not_after_baseline" });
      continue;
    }
    if (followUpAt <= gate) {
      missing.push({ questionId: q.id, reason: "follow_up_before_both_improvements" });
      continue;
    }
    pairs.push({ questionId: q.id, baseline, followUp });
  }
  return { pairs, missing, comparable: pairs.length > 0 };
}
