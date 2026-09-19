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

// v1 discovery methodology is a fixed grid: exactly 10 questions × 4 weekly rounds = 40 planned slots
// (spec §5.3, CI11-T13). The released panelProtocolSchema deliberately allows a broader shape (1..10
// questions, 0..12 rounds) for general use and for editable drafts; a LOCKED/approved v1 discovery
// panel must be exactly this grid, so an under- or over-sized pilot can never lock and read as a
// complete v1 measurement. Brand panels are unscheduled (rounds 0) and are not constrained here.
export const V1_DISCOVERY_QUESTIONS = 10;
export const V1_DISCOVERY_ROUNDS = 4;

/** A draft panel is unapproved: status `draft`, no approval receipt. Owner review happens on the
 * draft; the server, not the client, mints the approval when the draft is locked. */
// v1 Citation Intelligence measures CONSUMER surfaces only; an API surface is not a consumer
// substitute (spec §§2, 5.2). A panel (draft or locked) whose one surface is `api` is out of the v1
// boundary and refused. Consumer web and consumer search surfaces remain in scope. The general
// answer-evidence stack is unchanged — it still records API answers as ordinary (non-panel) evidence.
function assertConsumerV1Panel(panel: PanelProtocol, ctx: z.RefinementCtx) {
  if (panel.surface.mode === "api")
    ctx.addIssue({
      code: "custom",
      path: ["surface", "mode"],
      message: "v1 citation panels are consumer-only; an API surface is not a consumer substitute",
    });
}

// A LOCKED v1 discovery panel is the fixed 10×4 grid (spec §5.3, CI11-T13). Enforced only at lock, so
// an incomplete draft can stay editable but an under- or over-sized discovery panel can never lock.
// Brand panels are unscheduled and exempt (their scope is a separately approved run).
function assertV1DiscoveryGrid(panel: PanelProtocol, ctx: z.RefinementCtx) {
  if (panel.kind !== "discovery") return;
  if (panel.questions.length !== V1_DISCOVERY_QUESTIONS)
    ctx.addIssue({
      code: "custom",
      path: ["questions"],
      message: `A locked v1 discovery panel has exactly ${V1_DISCOVERY_QUESTIONS} questions`,
    });
  if (panel.rounds !== V1_DISCOVERY_ROUNDS)
    ctx.addIssue({
      code: "custom",
      path: ["rounds"],
      message: `A locked v1 discovery panel runs exactly ${V1_DISCOVERY_ROUNDS} rounds`,
    });
}

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
  assertConsumerV1Panel(panel, ctx);
});

/** A locked panel version: owner-approved, immutable, with a server-minted approval receipt. */
export const lockedPanelSchema = panelProtocolSchema.superRefine((panel, ctx) => {
  if (panel.status !== "locked" || !panel.approval)
    ctx.addIssue({
      code: "custom",
      path: ["status"],
      message: "A locked panel version carries the owner approval receipt",
    });
  assertConsumerV1Panel(panel, ctx);
  assertV1DiscoveryGrid(panel, ctx);
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
  // v1 is consumer-only (spec §§2, 5.2): an API capture is not a consumer substitute and is refused
  // at the boundary. Consumer web/search captures pass. (The general answer-evidence path still
  // accepts API answers as ordinary non-panel evidence.)
  if (captureContext.surface.mode === "api") throw new Error("citation_non_consumer_surface");
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
 * Only the active leaf of each correction chain is resolved: a capture that another *resolvable
 * capture* supersedes (an original or an intermediate correction) is raw history and is skipped here,
 * so a valid correction re-describing the same observation never yields two records for one slot
 * (which would double-count or trip `panelCounts`' duplicate-slot guard). A context-less or malformed
 * successor is NOT a resolvable capture and so cannot supersede a capture away — see the note in the
 * body. This mirrors `evidenceCohorts`' supersession convention and handles correction-of-correction
 * chains transitively. Nothing is deleted; the superseded rows remain readable via `readAnswerEvidence`.
 */
export function resolveStoredCaptures(
  answers: StoredCaptureAnswer[],
  panels: PanelProtocol[],
  brandRuns: BrandRun[],
): ResolvedCapture[] {
  // A record only supersedes another in the resolved graph if it is itself a resolvable capture (its
  // captureContext parses). So a context-less or malformed successor — e.g. a legacy Answer-panel
  // "Correct" that submits supersedesId with no captureContext — never marks its capture-bound
  // predecessor superseded; otherwise a valid observation would vanish from the resolved counts (the
  // original excluded as superseded, the successor skipped below as unresolvable). Superseded records
  // that ARE resolvable captures stay raw history but are not re-counted (active-leaf only).
  const superseded = new Set<string>();
  for (const a of answers)
    if (a.supersedesId && captureContextSchema.safeParse(a.captureContext).success)
      superseded.add(a.supersedesId);
  const out: ResolvedCapture[] = [];
  for (const answer of answers) {
    if (answer.captureContext === undefined || answer.captureContext === null) continue;
    // Skip superseded captures: resolve only the active leaf of each capture correction chain.
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
    // v1 is consumer-only (spec §§2, 5.2): a stored capture on an API surface is never a complete
    // consumer measurement. The write path refuses new API captures; this flags any already-stored
    // one so historical invalid data cannot read as a complete consumer slot — it is a deviation and
    // a would-be `complete` is demoted, exactly like the pre-approval case; failures stay themselves.
    const consumerSurface = context.surface.mode !== "api";
    // v1 discovery is the fixed 10×4 grid (spec §5.3, CI11-T13). The lock path refuses an under-/over-
    // sized discovery panel; this flags any already-stored capture that resolves against a historical
    // invalid grid so it can never read as a complete v1 measurement. Brand panels are exempt.
    const gridValid =
      panel.kind !== "discovery" ||
      (panel.questions.length === V1_DISCOVERY_QUESTIONS && panel.rounds === V1_DISCOVERY_ROUNDS);
    const eligible = approvedBeforeCapture && consumerSurface && gridValid;
    out.push({
      answerId: answer.id,
      panelId: panel.panelId,
      panelVersion: panel.version,
      kind: panel.kind,
      outcome: outcome === "complete" && !eligible ? "protocol_deviant" : outcome,
      deviations: [
        ...deviations,
        ...(approvedBeforeCapture ? [] : ["panel_approved_after_capture"]),
        ...(consumerSurface ? [] : ["non_consumer_surface"]),
        ...(gridValid ? [] : ["panel_grid_invalid"]),
      ],
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
  // Guard against already-stored slot duplicates. The write path now enforces one original per slot
  // atomically, but if two active-leaf captures still resolve to the same panel slot (panel version,
  // brand run, question, round), feeding both to `panelCounts` would trip its duplicate-slot guard and
  // make the whole report unreportable. Collapse each conflicted slot to ONE explicitly-invalid entry
  // (outcome protocol_deviant, deviation `duplicate_slot`) in stable input order and exclude the
  // extras from the resolved counts; the raw captures remain in storage. This never promotes a
  // duplicate to a silent measurement success. Panel-unresolved captures carry no comparable slot and
  // pass through unchanged.
  const slotKey = (c: ResolvedCapture) =>
    JSON.stringify([
      c.panelId,
      c.panelVersion,
      c.captureContext.brandRunId,
      c.captureContext.slot.questionId,
      c.captureContext.slot.round,
    ]);
  const slotCount = new Map<string, number>();
  for (const c of out)
    if (c.panelResolved) slotCount.set(slotKey(c), (slotCount.get(slotKey(c)) ?? 0) + 1);
  const seen = new Set<string>();
  const deduped: ResolvedCapture[] = [];
  for (const c of out) {
    if (!c.panelResolved) {
      deduped.push(c);
      continue;
    }
    const key = slotKey(c);
    if ((slotCount.get(key) ?? 0) <= 1) {
      deduped.push(c);
      continue;
    }
    if (seen.has(key)) continue; // exclude the extra duplicate(s); the raw rows remain in storage
    seen.add(key);
    deduped.push({
      ...c,
      outcome: "protocol_deviant",
      deviations: c.deviations.includes("duplicate_slot")
        ? c.deviations
        : [...c.deviations, "duplicate_slot"],
    });
  }
  return deduped;
}
