import { z } from "zod";
import { answerEvidenceSchema, type AnswerEvidence } from "./answer-evidence";
import {
  brandRunSchema,
  captureContextSchema,
  panelProtocolSchema,
  protocolDeviations,
  slotOutcome,
  SLOT_OUTCOMES,
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
// A content-free slot/budget tombstone is recorded when a manual capture is erased, so an erased
// consumed attempt is not silently reborn as an absent/missed slot. This ceiling only bounds the read
// for finite serialization; it is generous and defensive, not a product limit (the real limits are
// one-original-per-slot plus the answer/panel/run capacities), so a read never falsely rejects.
export const MAX_CAPTURE_TOMBSTONES = 10000;

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

// v1 discovery must be ten DISTINCT questions, not ten labels for one question. Each question must
// bind to a DISTINCT prompt (promptId+revision) AND carry DISTINCT text: ten unique local ids all
// pointing at one prompt, or ten prompts carrying identical COPIED text, is not a ten-question
// experiment (spec §5.3). The panel's own binding guard forces text == the bound prompt's text, so a
// reused prompt also collides on text; both are still checked so the intent holds independently.
export function v1DiscoveryQuestionsDistinct(panel: PanelProtocol): boolean {
  const bindings = new Set(panel.questions.map((q) => `${q.promptId}:${q.promptRevision}`));
  const texts = new Set(panel.questions.map((q) => q.text));
  return bindings.size === panel.questions.length && texts.size === panel.questions.length;
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
  // Ten DISTINCT questions, not ten labels for one (distinct prompt bindings AND distinct text).
  if (!v1DiscoveryQuestionsDistinct(panel))
    ctx.addIssue({
      code: "custom",
      path: ["questions"],
      message: `A locked v1 discovery panel needs ${V1_DISCOVERY_QUESTIONS} distinct questions: each a distinct prompt binding and distinct text`,
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

/** The content-free erased-slot fact for a slot whose observation was deleted (spec §5.2 attempts
 * semantics + erasure). It carries NO answer content — only which slot was observed. The read RPC only
 * ever emits a fact whose `questionId` is a real GRID-shaped id (a structured ≤6-char label, not free
 * text), and drops any tombstone carrying an arbitrary/empty/overlength historical `questionId` to a
 * content-free excluded COUNT (`erasureByVersion.excludedRows`) — so this schema can require the grid
 * shape without a malformed historical row ever breaking the read or leaking deleted content. `panelVersion`/
 * `round` are integers as wide as the trigger allows (0..int4); `answerId` is identity only. */
export const erasedSlotFactSchema = z
  .object({
    answerId: z.string().uuid(),
    panelId: z.string().uuid(),
    panelVersion: z.number().int().min(0).max(2147483647),
    brandRunId: z.string().uuid().nullable(),
    questionId: z.string().regex(/^[A-Z]{2}-[DB]\d{2}$/),
    round: z.number().int().min(0).max(2147483647),
  })
  .strict();
export type ErasedSlotFact = z.infer<typeof erasedSlotFactSchema>;

/** AUTHORITATIVE per-approved-run consumed budget, computed by the read RPC with the exact write-gate
 * predicate (live originals bound to the run by `captureContext->>'brandRunId'`, including a malformed
 * context, PLUS each tombstone row). Never reconstructed from the collapsed/LIMIT-bounded coverage. */
export const runConsumedSchema = z
  .object({
    runId: z.string().uuid(),
    consumed: z.number().int().min(0).max(2147483647),
  })
  .strict();
export type RunConsumed = z.infer<typeof runConsumedSchema>;

/** Coverage-completeness metadata per ACTUAL stored panel version that has tombstones. `gridRows` is
 * the TRUE grid-shaped tombstone-row total, so a consumer can tell whether the LIMIT-bounded
 * `tombstones` are complete for the version (and must NOT derive a definitive `neverObserved` when they
 * are not); `excludedRows` is the content-free malformed (non-grid) row count. */
export const erasureByVersionSchema = z
  .object({
    panelId: z.string().uuid(),
    panelVersion: z.number().int().min(0).max(2147483647),
    gridRows: z.number().int().min(0).max(2147483647),
    excludedRows: z.number().int().min(0).max(2147483647),
  })
  .strict();
export type ErasureByVersion = z.infer<typeof erasureByVersionSchema>;

export const citationProtocolStateSchema = z
  .object({
    panels: z.array(panelProtocolSchema).max(MAX_PANEL_VERSIONS),
    brandRuns: z.array(brandRunSchema).max(MAX_BRAND_RUNS),
    // Content-free erasure facts. Optional-with-default so a caller/store that predates them still
    // parses (to empty sets); the RPC always returns them. `tombstones` is LIMIT-bounded coverage; the
    // aggregates are bounded to actual panels/runs (never unbounded random-id groups); `erasureOverflow`
    // is a single count of tombstone rows not attributable to any stored panel version.
    tombstones: z.array(erasedSlotFactSchema).max(MAX_CAPTURE_TOMBSTONES).default([]),
    runConsumed: z.array(runConsumedSchema).max(MAX_BRAND_RUNS).default([]),
    erasureByVersion: z.array(erasureByVersionSchema).max(MAX_PANEL_VERSIONS).default([]),
    erasureOverflow: z.number().int().min(0).max(2147483647).default(0),
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
    // v1 discovery is the fixed 10×4 grid of ten DISTINCT questions (spec §5.3, CI11-T13). The lock
    // path refuses an under-/over-sized grid AND a grid whose ten questions are not distinct (ten ids
    // bound to one prompt, or ten prompts with identical copied text); this flags any already-stored
    // capture resolving against a historical invalid grid so it can never read as a complete v1
    // measurement. Brand panels are exempt.
    const gridValid =
      panel.kind !== "discovery" ||
      (panel.questions.length === V1_DISCOVERY_QUESTIONS &&
        panel.rounds === V1_DISCOVERY_ROUNDS &&
        v1DiscoveryQuestionsDistinct(panel));
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

/** A resolved erased slot: the content-free fact that a slot was observed and then erased, re-derived
 * against the current panels/runs exactly like a live capture. It is DISTINCT from a never-observed
 * slot (which appears in neither the resolved captures nor here), so the report can count it as an
 * erased observation — never an absent/missed one — and a brand run's budget stays consumed even after
 * every capture is deleted. It carries no answer content. */
export interface ErasedSlot {
  answerId: string;
  panelId: string;
  panelVersion: number;
  brandRunId: string | null;
  questionId: string;
  round: number;
  /** Whether the referenced locked panel version still resolves against the stored panels. */
  panelResolved: boolean;
  /** For a brand slot, whether its run still resolves; null for discovery or an unresolved panel. */
  brandRunResolved: boolean | null;
}

const erasedSlotKey = (t: {
  panelId: string;
  panelVersion: number;
  brandRunId: string | null;
  questionId: string;
  round: number;
}) => JSON.stringify([t.panelId, t.panelVersion, t.brandRunId, t.questionId, t.round]);

/**
 * Resolve content-free erasure tombstones into erased-slot facts, EXCLUDING any slot a surviving
 * resolved capture already occupies (so a deleted original whose chain — or an identical re-import —
 * still resolves is never double-counted) and collapsing multiple tombstones for one slot to a single
 * fact. The result lets the report distinguish an erased observation from a slot that never occurred,
 * and keeps a brand run's budget consumed even when all its captures were removed. Panel/run
 * resolution mirrors `resolveStoredCaptures` so a later panel/run deletion is reflected, and nothing
 * here retains any erased answer content — only slot/budget identity. The slot key matches the live
 * capture slot key above, so live and erased facts for one slot can never both appear.
 */
export function resolveErasedSlots(
  tombstones: ErasedSlotFact[],
  panels: PanelProtocol[],
  brandRuns: BrandRun[],
  resolvedCaptures: ResolvedCapture[],
): ErasedSlot[] {
  const liveSlots = new Set(
    resolvedCaptures
      .filter((c) => c.panelResolved)
      .map((c) =>
        erasedSlotKey({
          panelId: c.panelId,
          panelVersion: c.panelVersion,
          brandRunId: c.captureContext.brandRunId,
          questionId: c.captureContext.slot.questionId,
          round: c.captureContext.slot.round,
        }),
      ),
  );
  const seen = new Set<string>();
  const out: ErasedSlot[] = [];
  for (const t of tombstones) {
    const key = erasedSlotKey(t);
    if (liveSlots.has(key) || seen.has(key)) continue;
    seen.add(key);
    const panel = panels.find(
      (p) =>
        p.panelId === t.panelId &&
        p.version === t.panelVersion &&
        p.status === "locked" &&
        !!p.approval,
    );
    out.push({
      answerId: t.answerId,
      panelId: t.panelId,
      panelVersion: t.panelVersion,
      brandRunId: t.brandRunId,
      questionId: t.questionId,
      round: t.round,
      panelResolved: !!panel,
      brandRunResolved:
        t.brandRunId === null || !panel
          ? null
          : brandRuns.some(
              (r) =>
                r.id === t.brandRunId &&
                r.panelId === t.panelId &&
                r.panelVersion === t.panelVersion,
            ),
    });
  }
  return out;
}

/** The trusted erasure facts a report is built from, assembled at the service boundary (NOT re-derived
 * from the slot-collapsed coverage set). `slots` are the distinct content-safe erased slots (for
 * observed-vs-erased coverage). `consumedByRun` is the AUTHORITATIVE write-gate-faithful consumed budget
 * per brand run id, straight from the read RPC's SQL aggregate (live originals — incl. malformed context
 * — plus each tombstone row), so two historical originals at one slot consume two though they collapse
 * to one erased slot. `excludedByVersion` is the content-free malformed (non-grid) tombstone count keyed
 * `${panelId}:${panelVersion}`. `coverageCompleteByVersion` says, per `${panelId}:${panelVersion}`,
 * whether the transmitted `slots` cover ALL of that version's erased rows (false when the read LIMIT
 * truncated them) — a missing key means no erased rows, i.e. complete. When incomplete, the report must
 * NOT claim a definitive `neverObserved`. */
export interface CitationErasure {
  slots: ErasedSlot[];
  consumedByRun: Record<string, number>;
  excludedByVersion: Record<string, number>;
  coverageCompleteByVersion: Record<string, boolean>;
}

/** One canonical, erased-aware measurement report for a locked panel version. Live captures supply the
 * OUTCOME accounting and the observed slots; the trusted erasure facts supply the erased slots and the
 * consumed budget so a deleted attempt counts as ERASED (never absent/missed) and a run's budget stays
 * consumed after every capture is erased. Erasure never contributes an eligible numerator. Human-
 * reviewed numerators (citations/mentions/recommendations) remain the report layer's facts. */
export interface CitationReport {
  panelId: string;
  panelVersion: number;
  kind: PanelProtocol["kind"];
  /** Discovery: questions × rounds planned slots. Brand: 0 (a run is budget-bounded, not gridded). */
  planned: number;
  /** Distinct valid planned slots with a surviving (live) capture. */
  observed: number;
  /** Distinct valid planned slots whose observation was erased (unique observations lost). */
  erased: number;
  /** observed + erased: distinct slots attempted (live or erased), explicit vs never-observed. */
  recorded: number;
  /** Discovery only: planned − observed − erased. `null` when the erased-slot coverage for this version
   * is incomplete (the read LIMIT truncated it) — a definitive missing count cannot be derived from
   * partial tombstones. Brand: 0. */
  neverObserved: number | null;
  /** Whether the erased-slot coverage for this version is complete (false → some erased rows were not
   * transmitted, so `erased` is a floor and `neverObserved` is null). */
  coverageComplete: boolean;
  /** Live/erased facts that do not map to a valid planned slot/run for this version, PLUS the
   * content-free count of malformed historical tombstones. Visible, never silently dropped. */
  excluded: number;
  /** Outcome tally of the LIVE valid-slot captures only; erasure yields no outcome. */
  outcomes: Record<SlotOutcome, number>;
  /** Per approved brand run for this version (empty for discovery). `consumed` is the write-gate count
   * (live originals + each erased attempt); `erased` is the count of distinct erased slots (unique
   * observations lost) — `consumed` can exceed `observed + erased` when historical duplicates existed. */
  brandRuns: {
    runId: string;
    approvedBudget: number;
    consumed: number;
    observed: number;
    erased: number;
  }[];
}

const emptyOutcomes = (): Record<SlotOutcome, number> =>
  Object.fromEntries(SLOT_OUTCOMES.map((o) => [o, 0])) as Record<SlotOutcome, number>;

/**
 * Build the canonical erased-aware report for ONE locked panel version from trusted facts. Pure and
 * TOTAL: it never throws (a malformed historical erasure arrives already reduced to a content-free
 * count). `consumed` per run comes from the trusted `consumedByRun` (write-gate faithful), NOT from the
 * slot-collapsed coverage — so `consumed` counts each erased attempt (unique-observation undercount is
 * avoided) while `erased` counts distinct slots. Coverage slots are de-duplicated so a slot is never
 * double-counted, and a slot held by a live capture is never also counted as erased. Eligible numerators
 * come only from live outcomes.
 */
export function citationReport(
  panel: PanelProtocol,
  resolvedCaptures: ResolvedCapture[],
  erasure: CitationErasure,
  approvedBrandRuns: BrandRun[] = [],
): CitationReport {
  const forVersion = (pid: string, ver: number) => pid === panel.panelId && ver === panel.version;
  const questionIds = new Set(panel.questions.map((q) => q.id));
  const outcomes = emptyOutcomes();
  const runs = approvedBrandRuns.filter((r) => forVersion(r.panelId, r.panelVersion));
  const runById = new Map(runs.map((r) => [r.id, r]));
  const runObserved = new Map<string, number>();
  const runErased = new Map<string, number>();
  const validSlot = (questionId: string, round: number, brandRunId: string | null): boolean => {
    if (!questionIds.has(questionId)) return false;
    if (panel.kind === "discovery")
      return brandRunId === null && round >= 1 && round <= panel.rounds;
    const run = brandRunId === null ? undefined : runById.get(brandRunId);
    return !!run && round >= 1 && round <= run.rounds;
  };
  const liveSlotKeys = new Set<string>();
  let observed = 0;
  let excluded = 0;
  for (const c of resolvedCaptures) {
    if (!c.panelResolved || !forVersion(c.panelId, c.panelVersion)) continue;
    const { brandRunId } = c.captureContext;
    const { questionId, round } = c.captureContext.slot;
    const key = JSON.stringify([brandRunId, questionId, round]);
    if (!validSlot(questionId, round, brandRunId) || liveSlotKeys.has(key)) {
      excluded += 1;
      continue;
    }
    liveSlotKeys.add(key);
    observed += 1;
    outcomes[c.outcome] += 1;
    if (panel.kind === "brand" && brandRunId)
      runObserved.set(brandRunId, (runObserved.get(brandRunId) ?? 0) + 1);
  }
  const erasedSlotKeys = new Set<string>();
  let erased = 0;
  for (const e of erasure.slots) {
    if (!forVersion(e.panelId, e.panelVersion)) continue;
    const key = JSON.stringify([e.brandRunId, e.questionId, e.round]);
    if (
      !validSlot(e.questionId, e.round, e.brandRunId) ||
      liveSlotKeys.has(key) ||
      erasedSlotKeys.has(key)
    ) {
      excluded += 1;
      continue;
    }
    erasedSlotKeys.add(key);
    erased += 1;
    if (panel.kind === "brand" && e.brandRunId)
      runErased.set(e.brandRunId, (runErased.get(e.brandRunId) ?? 0) + 1);
  }
  // Malformed historical tombstones for this version are already a content-free count — surface them.
  const versionKey = `${panel.panelId}:${panel.version}`;
  excluded += erasure.excludedByVersion[versionKey] ?? 0;
  // Coverage completeness: a missing key means no erased rows for this version (trivially complete).
  const coverageComplete = erasure.coverageCompleteByVersion[versionKey] ?? true;
  const planned = panel.kind === "discovery" ? panel.questions.length * panel.rounds : 0;
  // neverObserved is a definitive count only when coverage is complete; otherwise it is unknown (null)
  // — never derived from partial (truncated) tombstones.
  const neverObserved =
    panel.kind === "discovery"
      ? coverageComplete
        ? Math.max(0, planned - observed - erased)
        : null
      : 0;
  return {
    panelId: panel.panelId,
    panelVersion: panel.version,
    kind: panel.kind,
    planned,
    observed,
    erased,
    recorded: observed + erased,
    neverObserved,
    coverageComplete,
    excluded,
    outcomes,
    brandRuns: runs.map((r) => ({
      runId: r.id,
      approvedBudget: r.observationBudget,
      consumed: erasure.consumedByRun[r.id] ?? 0,
      observed: runObserved.get(r.id) ?? 0,
      erased: runErased.get(r.id) ?? 0,
    })),
  };
}

/** Canonical reports for every locked panel version present, so a consumer reading the service
 * boundary cannot silently drop erased facts. Bounded by the panel-version and brand-run caps. */
export function citationReports(
  panels: PanelProtocol[],
  brandRuns: BrandRun[],
  resolvedCaptures: ResolvedCapture[],
  erasure: CitationErasure,
): CitationReport[] {
  return panels
    .filter((p) => p.status === "locked" && !!p.approval)
    .map((p) => citationReport(p, resolvedCaptures, erasure, brandRuns));
}
