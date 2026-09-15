import { z } from "zod";
import { answerEvidenceSchema } from "./answer-evidence";
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
    surface: surfaceSchema.extend({
      modelLabel: text(120).nullable(),
      webSearchEvidenced: z.enum(["evidenced", "not_evidenced", "unknown"]),
    }),
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
  const question = panel.questions.find((q) => q.id === context.slot.questionId);
  if (!question) out.push("question_not_in_panel");
  else if (question.text !== context.instructions.questionText) out.push("question_text_changed");
  if (!context.session.freshSession) out.push("session_not_fresh");
  if (context.session.personalisation !== panel.session.personalisation)
    out.push("personalisation_differs");
  if (context.instructions.extraInstruction !== null) out.push("extra_instruction");
  if (context.instructions.priorMessages > 0) out.push("prior_messages");
  if (
    context.surface.service !== panel.surface.service ||
    context.surface.interface !== panel.surface.interface ||
    context.surface.mode !== panel.surface.mode ||
    context.surface.searchMode !== panel.surface.searchMode
  )
    out.push("surface_or_mode_differs");
  if (context.language.prompt !== panel.questionLanguage) out.push("prompt_language_differs");
  if (context.brandRunId !== null && panel.kind !== "brand") out.push("brand_run_on_discovery");
  if (context.brandRunId === null && panel.kind === "brand") out.push("brand_capture_without_run");
  return out.concat(context.deviationNotes.map((note) => `noted:${note}`));
}
export function slotOutcome(
  panel: PanelProtocol,
  answer: Pick<z.infer<typeof answerEvidenceSchema>, "status"> | null,
  context: CaptureContext | null,
): SlotOutcome {
  if (!answer || !context) return "missed";
  if (protocolDeviations(panel, context).length) return "protocol_deviant";
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
/** Descriptive counts with explicit denominators (§6.2). Never a rate estimate. */
export function panelCounts(panel: PanelProtocol, captures: ReviewedCapture[]) {
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
/**
 * Comparable baseline/follow-up pairs for the fourth-round re-test (§5.3, CI11-T38). A pair
 * needs the same question complete, reviewed and citation-complete in both rounds, and the
 * follow-up captured after both verified improvements. Missing pairs are listed, not filled.
 */
export function comparablePairs(
  panel: PanelProtocol,
  captures: Array<ReviewedCapture & { capturedAt: string }>,
  rounds: { baseline: number; followUp: number },
  improvementsVerifiedAt: string[],
) {
  const verified = improvementsVerifiedAt.map((t) => Date.parse(t)).filter(Number.isFinite);
  const gate = verified.length >= 2 ? Math.max(...verified) : null;
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
    const baseline = eligible(rounds.baseline),
      followUp = eligible(rounds.followUp);
    if (!baseline) missing.push({ questionId: q.id, reason: "baseline_not_eligible" });
    else if (!followUp) missing.push({ questionId: q.id, reason: "follow_up_not_eligible" });
    else if (gate === null)
      missing.push({ questionId: q.id, reason: "two_verified_improvements_required" });
    else if (Date.parse(followUp.capturedAt) <= gate)
      missing.push({ questionId: q.id, reason: "follow_up_before_both_improvements" });
    else pairs.push({ questionId: q.id, baseline, followUp });
  }
  return { pairs, missing, comparable: pairs.length > 0 };
}
