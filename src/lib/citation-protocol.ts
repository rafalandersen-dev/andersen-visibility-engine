import { z } from "zod";
import { answerEvidenceSchema, type AnswerEvidence } from "./answer-evidence";
import {
  brandRunSchema,
  captureContextSchema,
  panelProtocolSchema,
  protocolDeviations,
  slotOutcome,
  type BrandRun,
  type CaptureContext,
  type PanelProtocol,
  type SlotOutcome,
} from "./citation-panel";

/**
 * Citation Intelligence v1, CI-2 storage design (product/CITATION_INTELLIGENCE_SPEC.md §5, §8;
 * product/CITATION_PROTOCOL_IMPLEMENTATION_2026_09_19.md).
 *
 * This module is the pure, network-free contract for immutable panel/protocol storage, separately
 * approved brand runs, and manual capture context bound to the existing answer record. It reuses
 * the released PR137 validity helpers (citation-panel.ts) and the existing answer stack
 * (answer-evidence.ts); it never redefines them and never schedules, collects or classifies.
 *
 * Validity is not authority. The panel and brand-run *shapes* below are asserted here, but a
 * capture is authorized only when the server resolves the referenced panel version and approved
 * run against actual stored records (see citation-protocol.server.ts and the migration). The
 * read-time resolver below re-derives a capture's slot outcome against the actual panels/runs so a
 * later panel/run deletion invalidates the dependent claim without rewriting the raw capture.
 */

// Caps consistent with the existing answer stack (200 prompt versions, 100 answers per project).
// A project holds only a few panels (discovery + optional brand); versions accumulate through
// draft→lock, so the per-project version budget mirrors the 200 prompt-version ceiling, and brand
// runs (baseline/re-test diagnostics) are bounded well under it.
export const MAX_PANEL_VERSIONS = 200;
export const MAX_BRAND_RUNS = 20;

/** A draft panel is unapproved: status `draft`, no approval receipt. Owner review happens on the
 * draft; the server, not the client, mints the approval when the draft is locked. */
export const panelDraftSchema = panelProtocolSchema.superRefine((panel, ctx) => {
  if (panel.status !== "draft")
    ctx.addIssue({
      code: "custom",
      path: ["status"],
      message: "A saved panel draft is not locked",
    });
  if (panel.approval !== null)
    ctx.addIssue({
      code: "custom",
      path: ["approval"],
      message: "A draft carries no approval; the server mints it at lock",
    });
});

/** A locked panel version: owner-approved, immutable, with a server-minted approval receipt. */
export const lockedPanelSchema = panelProtocolSchema.superRefine((panel, ctx) => {
  if (panel.status !== "locked" || !panel.approval)
    ctx.addIssue({
      code: "custom",
      path: ["status"],
      message: "A locked panel version carries the owner approval receipt",
    });
});

export const citationProtocolStateSchema = z
  .object({
    panels: z.array(panelProtocolSchema).max(MAX_PANEL_VERSIONS),
    brandRuns: z.array(brandRunSchema).max(MAX_BRAND_RUNS),
  })
  .strict();
export type CitationProtocolState = z.infer<typeof citationProtocolStateSchema>;

/** The inputs an owner-authenticated caller supplies to approve one brand diagnostic run. The
 * approvedBy/approvedAt receipts are NOT accepted here: the server derives them (§8, "derive owner
 * identity, permissions and review identities from the authenticated server"). */
export const brandRunApprovalSchema = z
  .object({
    runId: z.string().uuid(),
    panelId: z.string().uuid(),
    panelVersion: z.number().int().min(1).max(1000),
    observationBudget: brandRunSchema.shape.observationBudget,
    rounds: brandRunSchema.shape.rounds,
  })
  .strict();
export type BrandRunApproval = z.infer<typeof brandRunApprovalSchema>;

/**
 * Parse a manual capture answer: an existing answer-evidence input whose `captureContext` is
 * present and valid. The capture instant must equal the context's recorded capture instant; the
 * panel/slot/brand-run binding is resolved server-side, not trusted from these fields.
 */
export function parseManualCaptureInput(value: unknown): {
  input: AnswerEvidence;
  captureContext: CaptureContext;
} {
  const input = answerEvidenceSchema.parse(value);
  if (input.captureContext === undefined) throw new Error("citation_capture_context_missing");
  const captureContext = captureContextSchema.parse(input.captureContext);
  if (captureContext.time.capturedAt !== input.capturedAt)
    throw new Error("citation_capture_time_mismatch");
  // One record must not assert two contradictory surfaces about itself. The answer's own delivery
  // mode and model version are the same critical identity the captureContext.surface records, and
  // the legacy analysis keys on the former while the citation resolver reads the latter; if they
  // disagree (an API answer wearing a consumer/search context, or a different model label) the same
  // record would be classified two ways — a complete slot under a context its own fields deny. This
  // is internal consistency only: a deviation FROM THE PANEL is untouched (it stays storable and is
  // flagged by protocolDeviations); only self-contradiction within the one record is refused. The
  // free-text surface label is not equated to the structured service, which would over-constrain.
  if (captureContext.surface.mode !== input.mode) throw new Error("citation_capture_mode_conflict");
  if (captureContext.surface.modelLabel !== input.modelVersion)
    throw new Error("citation_capture_model_conflict");
  return { input, captureContext };
}

/** The subset of a stored answer record the resolver reads. `captureContext` is opaque as stored
 * in the answer document; the resolver parses it strictly before use. `supersedesId` is the record
 * this one corrects (null/absent for an original), used to resolve only active correction-chain
 * leaves — the raw superseded records stay in storage but are not re-counted. */
export interface StoredCaptureAnswer {
  id: string;
  status: AnswerEvidence["status"];
  promptId: string;
  promptRevision: number;
  captureContext: unknown;
  supersedesId?: string | null;
}

export interface ResolvedCapture {
  answerId: string;
  panelId: string;
  panelVersion: number;
  kind: PanelProtocol["kind"] | null;
  outcome: SlotOutcome;
  deviations: string[];
  /** Whether the referenced locked panel version still resolves against the stored panels. */
  panelResolved: boolean;
  /** For a brand capture, whether its brand run resolves; null for discovery or an unresolved panel. */
  brandRunResolved: boolean | null;
  captureContext: CaptureContext;
}

/**
 * Resolve stored manual captures against the actual owner-locked panels and approved brand runs
 * before any counting (§8). A capture whose panel version is missing, unlocked or of the wrong
 * version — because it was deleted or superseded — no longer resolves: its dependent claim is
 * invalidated (outcome `protocol_deviant`, `panel_unresolved`) without deleting the raw capture. A
 * resolved capture's outcome and deviations are re-derived through the released PR137 helpers so
 * the read never trusts a value baked into the capture. Brand runs are the trusted approved set
 * from storage, exactly as `protocolDeviations`/`slotOutcome` expect.
 *
 * Only the active leaf of each correction chain is resolved: a record that another supplied record
 * supersedes (an original or an intermediate correction) is raw history and is skipped here, so a
 * valid correction re-describing the same observation never yields two records for one slot (which
 * would double-count or trip `panelCounts`' duplicate-slot guard). This mirrors `evidenceCohorts`'
 * supersession convention and handles correction-of-correction chains transitively. Nothing is
 * deleted; the superseded rows remain readable through `readAnswerEvidence`.
 */
export function resolveStoredCaptures(
  answers: StoredCaptureAnswer[],
  panels: PanelProtocol[],
  brandRuns: BrandRun[],
): ResolvedCapture[] {
  const superseded = new Set(answers.map((a) => a.supersedesId).filter((id): id is string => !!id));
  const out: ResolvedCapture[] = [];
  for (const answer of answers) {
    if (answer.captureContext === undefined || answer.captureContext === null) continue;
    // Skip superseded records: resolve only the active leaf of each correction chain.
    if (superseded.has(answer.id)) continue;
    const parsed = captureContextSchema.safeParse(answer.captureContext);
    if (!parsed.success) continue;
    const context = parsed.data;
    const panel = panels.find(
      (p) =>
        p.panelId === context.panelId &&
        p.version === context.panelVersion &&
        p.status === "locked" &&
        !!p.approval,
    );
    if (!panel) {
      out.push({
        answerId: answer.id,
        panelId: context.panelId,
        panelVersion: context.panelVersion,
        kind: null,
        // No resolvable panel means no methodology to compare against, so the capture cannot be an
        // eligible complete slot; it is a deviation, never silently promoted to a comparable pair.
        outcome: "protocol_deviant",
        deviations: ["panel_unresolved"],
        panelResolved: false,
        brandRunResolved: null,
        captureContext: context,
      });
      continue;
    }
    const deviations = protocolDeviations(panel, context, brandRuns);
    const outcome = slotOutcome(
      panel,
      { status: answer.status, promptId: answer.promptId, promptRevision: answer.promptRevision },
      context,
      brandRuns,
    );
    // Prospective panel approval (spec Appendix A: owner review BEFORE USE). A locked panel version
    // is a usable baseline only from its DB-minted approval instant onward, so a capture whose
    // instant predates that approval — or a missing/unparseable approval instant — was not collected
    // under an approved protocol. Such a raw record stays inspectable (it still resolves against the
    // panel) but is never an eligible complete slot: it is flagged and a would-be `complete` is
    // demoted to `protocol_deviant`. A genuine failure/truncation is preserved as itself, never
    // masked. The write RPC refuses new pre-approval captures outright; this covers pre-approval
    // records already on disk without rewriting raw history and needs no change to citation-panel.ts.
    const approvedAt = panel.approval ? Date.parse(panel.approval.approvedAt) : NaN;
    const capturedAt = Date.parse(context.time.capturedAt);
    const approvedBeforeCapture =
      Number.isFinite(approvedAt) && Number.isFinite(capturedAt) && capturedAt >= approvedAt;
    out.push({
      answerId: answer.id,
      panelId: panel.panelId,
      panelVersion: panel.version,
      kind: panel.kind,
      outcome: outcome === "complete" && !approvedBeforeCapture ? "protocol_deviant" : outcome,
      deviations: approvedBeforeCapture
        ? deviations
        : [...deviations, "panel_approved_after_capture"],
      panelResolved: true,
      brandRunResolved:
        panel.kind === "brand"
          ? brandRuns.some(
              (r) =>
                r.id === context.brandRunId &&
                r.panelId === panel.panelId &&
                r.panelVersion === panel.version,
            )
          : null,
      captureContext: context,
    });
  }
  return out;
}
