import { describe, expect, it, vi } from "vitest";
import type { AnswerEvidence } from "./answer-evidence";
import type { BrandRun, CaptureContext, PanelProtocol } from "./citation-panel";
import { panelCounts } from "./citation-panel";
import {
  citationProtocolStateSchema,
  parseManualCaptureInput,
  panelDraftSchema,
  lockedPanelSchema,
  resolveStoredCaptures,
  type BrandRunApproval,
} from "./citation-protocol";
import {
  approveBrandRun,
  importManualCapture,
  lockCitationPanel,
  readCitationProtocol,
  readResolvedCaptures,
  saveCitationPanelDraft,
} from "./citation-protocol.server";
/** Fixtures only. Synthetic placeholder text, never the owner-reviewed Appendix A/B panels and
 * never a collected observation (spec §12). Nothing here is saved to the live client project. */
const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const discoveryText = "FIXTURE Var kan jag boka massage i Limhamn?";
const brandText = "FIXTURE Vad är Synergy Massage i Malmö?";
const surface = {
  service: "ChatGPT",
  interface: "consumer web app",
  mode: "search" as const,
  searchMode: "Search",
  modelLabel: null,
  webSearchEvidenced: "evidenced" as const,
};
const panelSession = {
  freshSession: true as const,
  personalisation: "non_personalised" as const,
  signedIn: "signed_in" as const,
  memory: "off" as const,
  customInstructions: "none" as const,
  connectedTools: "none" as const,
  extraInstruction: null,
  priorMessages: 0 as const,
};
const collection = {
  country: "Sweden",
  city: "Malmö",
  devicePermission: "granted" as const,
  vpn: false,
};
const discoveryQuestion = {
  id: "SY-D01",
  promptId: uuid(101),
  promptRevision: 1,
  text: discoveryText,
  language: "sv",
};
const brandQuestion = {
  id: "SY-B01",
  promptId: uuid(201),
  promptRevision: 1,
  text: brandText,
  language: "sv",
};
const discoveryPanel = (over: Partial<PanelProtocol> = {}): PanelProtocol => ({
  panelId: uuid(1),
  version: 1,
  kind: "discovery",
  client: { name: "FIXTURE Synergy", market: "Sweden — Malmö/Limhamn" },
  questionLanguage: "sv",
  interfaceLanguage: "en",
  surface,
  session: panelSession,
  collection,
  questions: [discoveryQuestion],
  rounds: 4,
  status: "locked",
  approval: { approvedBy: owner, approvedAt: "2026-09-01T00:00:00Z" },
  ...over,
});
const brandPanel = (): PanelProtocol => ({
  ...discoveryPanel(),
  panelId: uuid(2),
  kind: "brand",
  questions: [brandQuestion],
  rounds: 0,
});
const brandRun = (over: Partial<BrandRun> = {}): BrandRun => ({
  id: uuid(50),
  panelId: uuid(2),
  panelVersion: 1,
  approvedBy: owner,
  approvedAt: "2026-09-01T00:00:00Z",
  observationBudget: 5,
  rounds: 1,
  ...over,
});
const context = (over: Partial<CaptureContext> = {}): CaptureContext => ({
  panelId: uuid(1),
  panelVersion: 1,
  slot: { round: 1, questionId: "SY-D01" },
  brandRunId: null,
  session: {
    freshSession: true,
    personalisation: "non_personalised",
    signedIn: "signed_in",
    memory: "off",
    customInstructions: "none",
    connectedTools: "none",
    temporaryChat: "yes",
  },
  location: {
    inQuestion: "Limhamn",
    collectionCountry: "Sweden",
    collectionCity: "Malmö",
    devicePermission: "granted",
    vpn: false,
  },
  language: { prompt: "sv", interface: "en", answer: "sv" },
  surface,
  time: {
    capturedAt: "2026-09-08T10:00:00Z",
    intendedSlotAt: "2026-09-08T09:00:00Z",
    delayMinutes: 60,
  },
  instructions: { questionText: discoveryText, extraInstruction: null, priorMessages: 0 },
  capture: { screenshotRef: null, missingReason: null },
  deviationNotes: [],
  ...over,
});
const answer = (over: Partial<AnswerEvidence> = {}): AnswerEvidence => ({
  promptId: uuid(101),
  promptRevision: 1,
  surface: "ChatGPT consumer web app",
  mode: "search",
  method: "manual copy v1",
  modelVersion: null,
  capturedAt: "2026-09-08T10:00:00Z",
  status: "complete",
  rawAnswer: "FIXTURE answer text",
  citations: [],
  citationsComplete: true,
  failure: null,
  reportedCostUsd: null,
  sourceUrl: null,
  supersedesId: null,
  captureContext: context(),
  ...over,
});
const promptRow = {
  id: uuid(101),
  revision: 1,
  createdAt: "2026-08-01T00:00:00Z",
  data: {
    prompt: discoveryText,
    intent: "discovery",
    source: "manual" as const,
    market: "Sweden",
    language: "Swedish",
    brand: "Synergy",
    websiteUrl: "https://synergymassage.se",
    competitorUrls: [] as string[],
    active: true,
  },
};

describe("citation protocol pure contract", () => {
  it("treats a draft as unapproved and a saved-approval draft as invalid", () => {
    expect(
      panelDraftSchema.safeParse(discoveryPanel({ status: "draft", approval: null })).success,
    ).toBe(true);
    expect(panelDraftSchema.safeParse(discoveryPanel()).success).toBe(false); // locked, not a draft
    expect(
      panelDraftSchema.safeParse(
        discoveryPanel({
          status: "draft",
          approval: { approvedBy: owner, approvedAt: "2026-09-01T00:00:00Z" },
        }),
      ).success,
    ).toBe(false); // a draft may not carry an approval receipt
  });
  it("requires a present, time-consistent capture context on a manual capture", () => {
    expect(parseManualCaptureInput(answer()).captureContext.slot.questionId).toBe("SY-D01");
    const { captureContext, ...bare } = answer();
    void captureContext;
    expect(() => parseManualCaptureInput(bare)).toThrow("citation_capture_context_missing");
    expect(() => parseManualCaptureInput(answer({ capturedAt: "2026-09-08T11:00:00Z" }))).toThrow(
      "citation_capture_time_mismatch",
    );
  });
  it("refuses a capture whose own mode or model contradicts its capture context", () => {
    // A deviation from the panel stays storable evidence; a record contradicting ITSELF does not.
    // Here the context surface is consumer/search but the answer claims an API delivery mode, or a
    // different model label than the context records — the same record would otherwise be read two
    // ways (legacy analysis vs citation resolver), so it is refused at the input boundary.
    expect(() => parseManualCaptureInput(answer({ mode: "api" }))).toThrow(
      "citation_capture_mode_conflict",
    );
    expect(() => parseManualCaptureInput(answer({ modelVersion: "gpt-x" }))).toThrow(
      "citation_capture_model_conflict",
    );
  });
  it("resolves a clean discovery capture as a complete slot", () => {
    const [r] = resolveStoredCaptures(
      [
        {
          id: "a1",
          status: "complete",
          promptId: uuid(101),
          promptRevision: 1,
          captureContext: context(),
        },
      ],
      [discoveryPanel()],
      [],
    );
    expect(r).toMatchObject({
      outcome: "complete",
      deviations: [],
      panelResolved: true,
      brandRunResolved: null,
    });
  });
  it("keeps a capture collected before the panel approval inspectable but never eligible", () => {
    // The panel's fixture approval instant is 2026-09-01; a 2026-08-15 capture predates the approved
    // protocol, so it resolves (inspectable) but is demoted from complete and flagged, not eligible.
    const [r] = resolveStoredCaptures(
      [
        {
          id: "a1",
          status: "complete",
          promptId: uuid(101),
          promptRevision: 1,
          captureContext: context({
            time: {
              capturedAt: "2026-08-15T10:00:00Z",
              intendedSlotAt: "2026-08-15T09:00:00Z",
              delayMinutes: 0,
            },
          }),
        },
      ],
      [discoveryPanel()],
      [],
    );
    expect(r).toMatchObject({ panelResolved: true, outcome: "protocol_deviant" });
    expect(r.deviations).toContain("panel_approved_after_capture");
  });
  it("invalidates a capture whose locked panel version no longer resolves", () => {
    const [r] = resolveStoredCaptures(
      [
        {
          id: "a1",
          status: "complete",
          promptId: uuid(101),
          promptRevision: 1,
          captureContext: context(),
        },
      ],
      [discoveryPanel({ version: 2 })],
      [],
    );
    expect(r).toMatchObject({
      outcome: "protocol_deviant",
      deviations: ["panel_unresolved"],
      panelResolved: false,
    });
  });
  it("binds a brand capture to its approved run and refuses a run-less approved set", () => {
    const brandContext = context({
      panelId: uuid(2),
      slot: { round: 1, questionId: "SY-B01" },
      brandRunId: uuid(50),
      instructions: { questionText: brandText, extraInstruction: null, priorMessages: 0 },
    });
    const store = [
      {
        id: "b1",
        status: "complete" as const,
        promptId: uuid(201),
        promptRevision: 1,
        captureContext: brandContext,
      },
    ];
    expect(resolveStoredCaptures(store, [brandPanel()], [brandRun()])[0]).toMatchObject({
      outcome: "complete",
      deviations: [],
      brandRunResolved: true,
    });
    const foreign = resolveStoredCaptures(store, [brandPanel()], [])[0];
    expect(foreign.brandRunResolved).toBe(false);
    expect(foreign.outcome).toBe("protocol_deviant");
    expect(foreign.deviations).toContain("brand_run_not_approved");
  });
  it("resolves only active correction-chain leaves and roundtrips into panelCounts without duplicate slots", () => {
    // A correction-of-correction chain a←b←c at round 1, plus an unrelated capture d at round 2.
    const at = (id: string, supersedesId: string | null, over = {}) => ({
      id,
      status: "complete" as const,
      promptId: uuid(101),
      promptRevision: 1,
      captureContext: context(over),
      supersedesId,
    });
    const resolved = resolveStoredCaptures(
      [
        at("a", null),
        at("b", "a"),
        at("c", "b"),
        at("d", null, { slot: { round: 2, questionId: "SY-D01" } }),
      ],
      [discoveryPanel()],
      [],
    );
    // Only the active leaf of the chain (c) and the unrelated capture (d) resolve; the superseded raw
    // records a and b remain in storage but are never re-counted.
    expect(resolved.map((r) => r.answerId).sort()).toEqual(["c", "d"]);
    const counts = panelCounts(
      discoveryPanel(),
      resolved.map((r) => ({
        questionId: r.captureContext.slot.questionId,
        round: r.captureContext.slot.round,
        outcome: r.outcome,
        citationsComplete: true,
        ownCitation: null,
        mention: null,
        recommended: null,
        brandRunId: r.captureContext.brandRunId,
      })),
    );
    // Two distinct slots, no duplicate-slot throw (pre-fix, a/b/c would all resolve to round 1).
    expect(counts).toMatchObject({ recorded: 2, outcomes: { complete: 2 } });
  });
  it("keeps a valid capture in resolved counts when a context-less or malformed successor supersedes it", () => {
    const cap = {
      id: "cap",
      status: "complete" as const,
      promptId: uuid(101),
      promptRevision: 1,
      captureContext: context(),
      supersedesId: null,
    };
    // A legacy Answer-panel "Correct" supersedes the capture but carries no captureContext; and a
    // separate successor whose captureContext is malformed. Neither is a resolvable capture, so
    // neither may erase the capture-bound observation from the resolved counts (the pre-fix bug:
    // original excluded as superseded, successor skipped as unresolvable → the observation vanished).
    const legacySuccessor = {
      id: "leg",
      status: "complete" as const,
      promptId: uuid(101),
      promptRevision: 1,
      captureContext: undefined,
      supersedesId: "cap",
    };
    const malformedSuccessor = {
      id: "bad",
      status: "complete" as const,
      promptId: uuid(101),
      promptRevision: 1,
      captureContext: { not: "a valid capture context" },
      supersedesId: "cap",
    };
    for (const successor of [legacySuccessor, malformedSuccessor]) {
      const resolved = resolveStoredCaptures([cap, successor], [discoveryPanel()], []);
      expect(resolved.map((r) => r.answerId)).toEqual(["cap"]);
      expect(resolved[0]).toMatchObject({ outcome: "complete", panelResolved: true });
    }
  });
  it("collapses an already-stored duplicate slot to one invalid entry so the report stays reportable", () => {
    const dup = (id: string) => ({
      id,
      status: "complete" as const,
      promptId: uuid(101),
      promptRevision: 1,
      captureContext: context(),
      supersedesId: null,
    });
    const resolved = resolveStoredCaptures([dup("a"), dup("b")], [discoveryPanel()], []);
    // Two independent originals share one slot: collapse to a single explicitly-invalid entry rather
    // than forward both (which would trip panelCounts' duplicate-slot guard) or silently pick one.
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ outcome: "protocol_deviant" });
    expect(resolved[0].deviations).toContain("duplicate_slot");
    const counts = panelCounts(
      discoveryPanel(),
      resolved.map((r) => ({
        questionId: r.captureContext.slot.questionId,
        round: r.captureContext.slot.round,
        outcome: r.outcome,
        citationsComplete: true,
        ownCitation: null,
        mention: null,
        recommended: null,
        brandRunId: r.captureContext.brandRunId,
      })),
    );
    expect(counts).toMatchObject({ recorded: 1, outcomes: { complete: 0, protocol_deviant: 1 } });
  });
  it("refuses an API-surface panel as draft or locked, and accepts a consumer surface (v1 §§2/5.2)", () => {
    const apiSurface = { ...surface, mode: "api" as const };
    expect(
      panelDraftSchema.safeParse(
        discoveryPanel({ status: "draft", approval: null, surface: apiSurface }),
      ).success,
    ).toBe(false);
    expect(lockedPanelSchema.safeParse(discoveryPanel({ surface: apiSurface })).success).toBe(
      false,
    );
    expect(
      panelDraftSchema.safeParse(discoveryPanel({ status: "draft", approval: null })).success,
    ).toBe(true); // consumer (search) surface remains valid
  });
  it("refuses an API-surface manual capture at the input boundary (v1 consumer-only)", () => {
    expect(() =>
      parseManualCaptureInput(
        answer({ mode: "api", captureContext: context({ surface: { ...surface, mode: "api" } }) }),
      ),
    ).toThrow("citation_non_consumer_surface");
  });
  it("flags an already-stored API capture as non-consumer, never a complete measurement", () => {
    const apiSurface = { ...surface, mode: "api" as const };
    // An API capture whose (historical) panel also records API would otherwise match and read
    // complete; the consumer-only guard independently demotes it and flags non_consumer_surface.
    const [r] = resolveStoredCaptures(
      [
        {
          id: "a1",
          status: "complete",
          promptId: uuid(101),
          promptRevision: 1,
          captureContext: context({ surface: apiSurface }),
          supersedesId: null,
        },
      ],
      [discoveryPanel({ surface: apiSurface })],
      [],
    );
    expect(r).toMatchObject({ panelResolved: true, outcome: "protocol_deviant" });
    expect(r.deviations).toContain("non_consumer_surface");
  });
});

describe("citation protocol server, no provider or URL calls", () => {
  const scope = { ownerId: owner, projectId: "p" };
  it("validates owner and project before any RPC", async () => {
    const rpc = vi.fn();
    await expect(readCitationProtocol({ ...scope, ownerId: "bad" }, rpc)).rejects.toThrow();
    await expect(
      saveCitationPanelDraft({ ...scope, projectId: "../p" }, uuid(1), 0, {}, rpc),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("parses protocol state and rejects an over-cap panel array", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { panels: [], brandRuns: [] }, error: null });
    expect(await readCitationProtocol(scope, rpc)).toEqual({ panels: [], brandRuns: [] });
    expect(
      citationProtocolStateSchema.safeParse({
        panels: Array.from({ length: 201 }, () => discoveryPanel()),
        brandRuns: [],
      }).success,
    ).toBe(false);
  });
  it("refuses a draft whose id or version does not match the request before the RPC", async () => {
    const rpc = vi.fn();
    const draft = discoveryPanel({ status: "draft", approval: null });
    await expect(saveCitationPanelDraft(scope, uuid(9), 0, draft, rpc)).rejects.toThrow(
      "citation_panel_draft_mismatch",
    );
    await expect(saveCitationPanelDraft(scope, uuid(1), 5, draft, rpc)).rejects.toThrow(
      "citation_panel_draft_mismatch",
    );
    expect(rpc).not.toHaveBeenCalled();
  });
  it("saves a draft and passes the exact document to the RPC", async () => {
    const draft = discoveryPanel({ version: 1, status: "draft", approval: null });
    const rpc = vi.fn().mockResolvedValue({ data: draft, error: null });
    await saveCitationPanelDraft(scope, uuid(1), 0, draft, rpc);
    expect(rpc).toHaveBeenCalledWith("save_citation_panel_draft", {
      p_user: owner,
      p_project: "p",
      p_panel: uuid(1),
      p_expected: 0,
      p_document: draft,
    });
  });
  it("locks a panel and confirms the server-derived owner approval", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: discoveryPanel(), error: null });
    const locked = await lockCitationPanel(scope, uuid(1), 1, rpc);
    expect(locked.approval?.approvedBy).toBe(owner);
    await expect(
      lockCitationPanel(
        scope,
        uuid(1),
        1,
        vi.fn().mockResolvedValue({
          data: discoveryPanel({
            approval: { approvedBy: other, approvedAt: "2026-09-01T00:00:00Z" },
          }),
          error: null,
        }),
      ),
    ).rejects.toThrow("citation_panel_owner_mismatch");
  });
  it("approves a brand run through the server, never trusting a client owner", async () => {
    const run = brandRun();
    const rpc = vi.fn().mockResolvedValue({ data: run, error: null });
    const approval: BrandRunApproval = {
      runId: uuid(50),
      panelId: uuid(2),
      panelVersion: 1,
      observationBudget: 5,
      rounds: 1,
    };
    expect((await approveBrandRun(scope, approval, rpc)).approvedBy).toBe(owner);
    expect(rpc).toHaveBeenCalledWith("approve_citation_brand_run", {
      p_user: owner,
      p_project: "p",
      p_run: uuid(50),
      p_panel: uuid(2),
      p_version: 1,
      p_budget: 5,
      p_rounds: 1,
    });
  });
  it("builds the capture document from the saved prompt and routes it to the capture RPC", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { prompts: [promptRow], answers: [] }, error: null })
      .mockResolvedValueOnce({ data: uuid(500), error: null });
    await importManualCapture(scope, answer(), rpc);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      "read_ai_answer_evidence",
      "save_citation_capture",
    ]);
    const document = (rpc.mock.calls[1][1] as { p_document: Record<string, unknown> }).p_document;
    expect(document).toMatchObject({
      prompt: { id: uuid(101), revision: 1 },
      analysis: { verified: false },
      input: { captureContext: { slot: { questionId: "SY-D01" } } },
    });
  });
  it("rejects a capture with no bound prompt without writing", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { prompts: [], answers: [] }, error: null });
    await expect(importManualCapture(scope, answer(), rpc)).rejects.toThrow(
      "evidence_prompt_missing",
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects a capture missing its context before any read", async () => {
    const { captureContext, ...bare } = answer();
    void captureContext;
    const rpc = vi.fn();
    await expect(importManualCapture(scope, bare, rpc)).rejects.toThrow(
      "citation_capture_context_missing",
    );
    expect(rpc).not.toHaveBeenCalled();
  });
  it("reads panels, runs and answers together and resolves captures for the report layer", async () => {
    const rpc = vi.fn((name: string) =>
      Promise.resolve({
        data:
          name === "read_citation_protocol"
            ? { panels: [discoveryPanel()], brandRuns: [] }
            : { prompts: [], answers: [] },
        error: null,
      }),
    );
    const result = await readResolvedCaptures(scope, rpc);
    expect(rpc.mock.calls.map((c) => c[0]).sort()).toEqual([
      "read_ai_answer_evidence",
      "read_citation_protocol",
    ]);
    expect(result).toEqual({ panels: [discoveryPanel()], brandRuns: [], captures: [] });
  });
});
