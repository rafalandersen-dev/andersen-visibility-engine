/**
 * Forward workflow helpers against the REAL client store (in-memory; the persistence boundary is mocked) and the
 * real record contracts: store-minted task identity, exact finding-row pins, live link/task states, manual draft
 * linkage, published-attempt binding derivation, baseline chronology, inspection payloads, the frozen-payload
 * reducer and the readiness counts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
// The store's persistence boundary is mocked exactly like `store.session-isolation.test.ts`; the store itself
// (ids, mutators, recoverable deletion) is the real one and is never hydrated here, so nothing is persisted.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async () => ({ data: null, error: null })),
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  },
}));
vi.mock("./entitlements.functions", () => ({ getMyEntitlementFn: vi.fn() }));
import {
  addOpportunity,
  deleteOpportunityRecoverably,
  getState,
  setState,
  uid,
  updateOpportunity,
  upsertContent,
} from "./store";
import { pipelineStage } from "./pipeline";
import { wpPostTypeFor } from "./publish-targets";
import type { Project } from "./types";
import {
  improvementSchema,
  taskIdSchema,
  TASK_ID_PATTERN,
  type Improvement,
} from "./citation-finding";
import type { CitationFindingSummary, CitationImprovementSummary } from "./citation-record";
import type { Opportunity } from "./types";
import {
  buildImprovementPayload,
  bindingFromAttempt,
  eligibleBaselines,
  findingLink,
  findingRowIdsOf,
  findingSourceRef,
  forwardErrorKey,
  forwardReducer,
  improvementHead,
  initialForwardState,
  inspectionPayload,
  manualDraftForTask,
  newImprovementDraft,
  opportunityFromFinding,
  publishedAttemptsForTask,
  retestReadiness,
  tasksForFinding,
  taskStatus,
  type EvidenceRow,
  type ImprovementDraft,
  collectPublishedAttempts,
  createTaskFromFinding,
  currentImprovementHeads,
  inspectionRequest,
  pinnedRowsOf,
  pinnedTasks,
} from "./citation-forward";

const OWNER = "00000000-0000-4000-8000-000000000001";
const PROJECT = "proj_a";
const ROW_V1 = "00000000-0000-4000-8000-0000000000f1";
const ROW_V2 = "00000000-0000-4000-8000-0000000000f2";
const ROW_OTHER = "00000000-0000-4000-8000-0000000000f9";
const FINDING = "00000000-0000-4000-8000-0000000000d1";
const FINDING_OTHER = "00000000-0000-4000-8000-0000000000d2";
const PANEL = "00000000-0000-4000-8000-0000000000c1";
const PUB = "00000000-0000-4000-8000-0000000000b1";
const PUB_OLD = "00000000-0000-4000-8000-0000000000b2";
const ANSWER_BEFORE = "00000000-0000-4000-8000-0000000000e1";
const ANSWER_AFTER = "00000000-0000-4000-8000-0000000000e2";
const HASH = "a".repeat(64);
const LIVE = "https://acme.example/services";

const row = (over: Partial<CitationFindingSummary> = {}): CitationFindingSummary => ({
  id: ROW_V1,
  findingId: FINDING,
  version: 1,
  family: "citation_source",
  decision: "accepted",
  panelId: PANEL,
  panelVersion: 2,
  client: { name: "Acme", market: "SE" },
  actorId: OWNER,
  reviewerId: OWNER,
  supersedesId: null,
  predecessorDeleted: false,
  createdAt: "2026-09-20T10:00:00Z",
  sourceAvailable: true,
  accuracyStatus: "none",
  reviewStatus: "owner_only",
  scopeEnforcedAt: "2026-09-20T10:00:00Z",
  ...over,
});
const attempt = (over: Partial<EvidenceRow> = {}): EvidenceRow => ({
  id: PUB,
  assetId: "asset-1",
  versionHash: HASH,
  title: "Services",
  startedAt: "2026-09-25T09:00:00Z",
  finishedAt: "2026-09-25T09:05:00Z",
  outcome: "published",
  outcomeData: {
    liveUrl: LIVE,
    externalId: "x",
    publishedAt: "2026-09-25T09:05:00Z",
    verification: "connector_response_only",
  },
  action: {
    id: "k3j9x2ab",
    title: "t",
    businessValue: null,
    source: null,
    capturedAt: "2026-09-24T00:00:00Z",
  },
  stages: [],
  otherPublicationAttemptsAt: [],
  sourceCount: 0,
  knowledgeCount: 0,
  observations: [],
  ...over,
});
const answers = [
  { id: ANSWER_BEFORE, capturedAt: "2026-09-20T08:00:00Z" },
  { id: ANSWER_AFTER, capturedAt: "2026-09-26T08:00:00Z" },
];
const summary = (over: Partial<CitationImprovementSummary> = {}): CitationImprovementSummary => ({
  id: "00000000-0000-4000-8000-0000000000a1",
  improvementId: "00000000-0000-4000-8000-000000000071",
  version: 1,
  panelId: PANEL,
  panelVersion: 2,
  client: { name: "Acme", market: "SE" },
  actorId: OWNER,
  supersedesId: null,
  predecessorDeleted: false,
  createdAt: "2026-09-26T10:00:00Z",
  verificationStatus: "unverified",
  evidenceStatus: "baseline_absent",
  scopeEnforcedAt: null,
  ...over,
});
const record = (over: Partial<Improvement> = {}): Improvement => ({
  improvementId: "00000000-0000-4000-8000-000000000071",
  findingIds: [FINDING],
  taskId: "k3j9x2ab",
  change: {
    description: "Added a service page.",
    approvedVersion: HASH,
    approvedBy: OWNER,
    approvedAt: "2026-09-25T09:05:00Z",
  },
  destination: { kind: "public_url", reference: LIVE },
  baselineCaptureIds: [ANSWER_BEFORE],
  verification: null,
  ...over,
});

beforeEach(() => {
  setState((s) => ({ ...s, opportunities: [], content: [] }));
});

describe("task identity contract (repair)", () => {
  it("accepts the ids the store and connectors actually mint and refuses malformed ones", () => {
    const minted = uid();
    expect(minted).toMatch(/^[a-z0-9]{8}$/);
    expect(taskIdSchema.safeParse(minted).success).toBe(true);
    expect(taskIdSchema.safeParse(crypto.randomUUID()).success).toBe(true);
    expect(taskIdSchema.safeParse("opp-1_demo").success).toBe(true);
    for (const bad of ["", "not a task id", "../x", "x".repeat(65), "a/b", "a;b"])
      expect(taskIdSchema.safeParse(bad).success, bad).toBe(false);
    expect(improvementSchema.safeParse(record({ taskId: minted })).success).toBe(true);
    expect(improvementSchema.safeParse(record({ taskId: "with space" })).success).toBe(false);
    expect(TASK_ID_PATTERN.test(minted)).toBe(true);
  });
});

describe("finding row ↔ Plan task", () => {
  it("resolves the pinned row's live state without moving the pin", () => {
    const v1 = row();
    const v2 = row({ id: ROW_V2, version: 2, supersedesId: ROW_V1 });
    expect(findingLink(ROW_V1, [v1])).toMatchObject({
      status: "current",
      pinnedVersion: 1,
      headVersion: 1,
    });
    expect(findingLink(ROW_V1, [v1, v2])).toMatchObject({
      status: "superseded",
      pinnedVersion: 1,
      headVersion: 2,
    });
    expect(findingLink(ROW_V2, [v1, v2]).status).toBe("current");
    expect(
      findingLink(ROW_V1, [v1, row({ id: ROW_V2, version: 2, decision: "dismissed" })]).status,
    ).toBe("dismissed");
    expect(
      findingLink(ROW_V1, [
        v1,
        row({ id: ROW_V2, version: 2, reviewStatus: "independent_dissent" }),
      ]).status,
    ).toBe("dissent");
    expect(findingLink(ROW_V1, [row({ decision: "needs_second_review" })]).status).toBe(
      "second_review",
    );
    expect(findingLink(ROW_V1, [])).toMatchObject({
      status: "deleted",
      findingId: null,
      pinnedVersion: null,
    });
    expect(findingLink(ROW_V1.toUpperCase(), [v1]).rowId).toBe(ROW_V1);
  });
  it("creates a real store opportunity pinned to the exact row with a store-minted id, and attaches to an existing one", () => {
    const created = addOpportunity(
      opportunityFromFinding({
        projectId: PROJECT,
        row: row(),
        record: null,
        language: "English",
        capturedAt: "2026-09-27T10:00:00Z",
      }),
    );
    expect(created.id).toMatch(TASK_ID_PATTERN);
    expect(created.status).toBe("captured");
    expect(created.creationMode).toBe("manual");
    expect(created.primarySource).toBe("ai_visibility");
    expect(findingRowIdsOf(created)).toEqual([ROW_V1]);
    expect(created.sourceRefs?.[0]).toEqual(
      findingSourceRef({ id: ROW_V1 }, "2026-09-27T10:00:00Z"),
    );
    expect(created.title).toContain("Citation finding");
    const existing = addOpportunity({
      projectId: PROJECT,
      title: "Existing task",
      language: "English",
      contentType: "Service Page",
      searchIntent: "Informational",
      targetAudience: "x",
      businessValue: "y",
      recommendedCta: "",
      priority: "Low",
    });
    updateOpportunity(existing.id, {
      sourceRefs: [
        ...(existing.sourceRefs ?? []),
        findingSourceRef({ id: ROW_V1 }, "2026-09-27T10:01:00Z"),
      ],
    });
    const all = getState().opportunities;
    expect(
      tasksForFinding(all, ROW_V1)
        .map((o) => o.id)
        .sort(),
    ).toEqual([created.id, existing.id].sort());
    expect(tasksForFinding(all, ROW_OTHER)).toEqual([]);
    // Editing the finding to a new version does not move the pin: the ref still names the v1 row.
    expect(findingLink(ROW_V1, [row(), row({ id: ROW_V2, version: 2 })]).status).toBe("superseded");
    expect(tasksForFinding(all, ROW_V1)).toHaveLength(2);
  });
  it("derives the title and priority from the finding record when it is readable", () => {
    const o = opportunityFromFinding({
      projectId: PROJECT,
      row: row(),
      record: {
        findingId: FINDING,
        family: "citation_source",
        evidence: [{ kind: "answer", id: ANSWER_BEFORE }],
        entityMatch: "confirmed",
        capture: { answerComplete: true, citationsComplete: true },
        observation: "The answer   cites a competitor but not this business.",
        hypothesis: null,
        competitorCited: true,
        ownCited: false,
        recommendation: null,
        support: [],
        accuracy: [],
        priority: { harm: "high", relevance: "high", fixability: "high" },
        decision: "accepted",
        review: { reviewer: OWNER, reviewedAt: "2026-09-20T10:00:00Z" },
        secondReview: null,
        linkedTaskId: null,
      },
      language: "Swedish",
      capturedAt: "2026-09-27T10:00:00Z",
    });
    expect(o.title).toBe("Citation gap: The answer cites a competitor but not this business.");
    expect(o.priority).toBe("High");
    expect(o.language).toBe("Swedish");
  });
  it("reports a deleted, archived or unknown task honestly and never rebinds", () => {
    const o = addOpportunity(
      opportunityFromFinding({
        projectId: PROJECT,
        row: row(),
        record: null,
        language: "English",
        capturedAt: "2026-09-27T10:00:00Z",
      }),
    );
    expect(taskStatus(getState().opportunities, o.id).status).toBe("active");
    expect(taskStatus(getState().opportunities, "missing1").status).toBe("missing");
    updateOpportunity(o.id, { status: "archived" });
    expect(taskStatus(getState().opportunities, o.id).status).toBe("archived");
    deleteOpportunityRecoverably(o.id);
    const after = getState().opportunities;
    expect(taskStatus(after, o.id).status).toBe("deleted");
    expect(tasksForFinding(after, ROW_V1)).toEqual([]);
  });
  it("creates a linked MANUAL draft that reaches Studio's writing stage with the task identity a publication snapshot records", () => {
    const o = addOpportunity(
      opportunityFromFinding({
        projectId: PROJECT,
        row: row(),
        record: null,
        language: "English",
        capturedAt: "2026-09-27T10:00:00Z",
      }),
    );
    const asset = manualDraftForTask(o, uid(), "2026-09-27T10:05:00Z");
    upsertContent(asset);
    updateOpportunity(o.id, { currentContentAssetId: asset.id, status: "drafting" });
    const stored = getState().content.find((c) => c.id === asset.id)!;
    expect(stored.opportunityId).toBe(o.id);
    expect(stored.sourceOpportunityId).toBe(o.id);
    expect(stored.sourceType).toBe("manual");
    expect(stored.status).toBe("Draft");
    expect(stored.markdown.startsWith(`# ${o.title}`)).toBe(true);
    expect(
      pipelineStage({
        opportunity: getState().opportunities.find((x) => x.id === o.id),
        asset: stored,
        now: Date.now(),
      }),
    ).toBe("writing");
  });
});

describe("published attempt ↔ improvement binding", () => {
  it("offers only PUBLISHED attempts with a live URL recorded for exactly this task, newest first", () => {
    const rows = [
      attempt({ id: PUB_OLD, finishedAt: "2026-09-20T09:05:00Z" }),
      attempt(),
      attempt({
        id: "00000000-0000-4000-8000-0000000000b3",
        outcome: "started",
        outcomeData: null,
        finishedAt: null,
      }),
      attempt({
        id: "00000000-0000-4000-8000-0000000000b4",
        action: {
          id: "other001",
          title: null,
          businessValue: null,
          source: null,
          capturedAt: "2026-09-24T00:00:00Z",
        },
      }),
      attempt({ id: "00000000-0000-4000-8000-0000000000b5", action: null }),
    ];
    expect(publishedAttemptsForTask(rows, "k3j9x2ab").map((r) => r.id)).toEqual([PUB, PUB_OLD]);
    expect(publishedAttemptsForTask(rows, "other001").map((r) => r.id)).toEqual([
      "00000000-0000-4000-8000-0000000000b4",
    ]);
    expect(bindingFromAttempt(attempt())).toEqual({
      publicationId: PUB,
      assetId: "asset-1",
      versionHash: HASH,
      ownerInspection: null,
    });
  });
  it("only captures taken BEFORE the publication are eligible baselines", () => {
    expect(eligibleBaselines(answers, "2026-09-25T09:05:00Z").map((a) => a.id)).toEqual([
      ANSWER_BEFORE,
    ]);
    expect(eligibleBaselines(answers, null)).toEqual([]);
  });
  it("derives every binding and approval field from the chosen attempt and reports each issue honestly", () => {
    const rows = [
      row(),
      row({ id: ROW_OTHER, findingId: FINDING_OTHER, client: { name: "Rival", market: "SE" } }),
    ];
    const approvals = new Map([
      [
        PUB,
        {
          approved: true,
          approverKind: "owner" as const,
          approverId: OWNER,
          approvedAt: "2026-09-25T09:05:00Z",
        },
      ],
      [
        PUB_OLD,
        {
          approved: true,
          approverKind: "owner" as const,
          approverId: OWNER,
          approvedAt: "2026-09-20T09:05:00Z",
        },
      ],
    ]);
    const deps = {
      approvals,
      rows,
      attempts: [
        attempt(),
        attempt({
          id: PUB_OLD,
          action: {
            id: "other001",
            title: null,
            businessValue: null,
            source: null,
            capturedAt: "2026-09-24T00:00:00Z",
          },
        }),
      ],
      answers,
    };
    const base: ImprovementDraft = {
      ...newImprovementDraft("00000000-0000-4000-8000-000000000071", "k3j9x2ab", OWNER),
      findingRowIds: [ROW_V1],
      publicationId: PUB,
      description: " Added the page ",
      baselineCaptureIds: [ANSWER_BEFORE],
    };
    const ok = buildImprovementPayload(base, deps);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.payload.scope).toEqual({
        panelId: PANEL,
        panelVersion: 2,
        client: { name: "Acme", market: "SE" },
      });
      expect(ok.payload.improvement.change).toEqual({
        description: "Added the page",
        approvedVersion: HASH,
        approvedBy: OWNER,
        approvedAt: "2026-09-25T09:05:00Z",
      });
      expect(ok.payload.improvement.destination).toEqual({ kind: "public_url", reference: LIVE });
      expect(ok.payload.improvement.findingIds).toEqual([FINDING]);
      expect(ok.payload.improvement.taskId).toBe("k3j9x2ab");
      expect(ok.payload.improvement.verification).toBeNull();
      expect(ok.payload.binding.publicationId).toBe(PUB);
      expect(ok.payload.expectedFindingRowIds).toEqual([ROW_V1]);
    }
    const issuesOf = (patch: Partial<typeof base>) => {
      const r = buildImprovementPayload({ ...base, ...patch }, deps);
      return r.ok ? [] : r.issues;
    };
    expect(issuesOf({ findingRowIds: [] })).toContain("findings_required");
    expect(issuesOf({ findingRowIds: [ROW_V2] })).toContain("finding_unavailable");
    expect(
      buildImprovementPayload(base, { ...deps, rows: [row(), row({ id: ROW_V2, version: 2 })] }),
    ).toMatchObject({ ok: false, issues: ["finding_not_bindable"] });
    expect(issuesOf({ findingRowIds: [ROW_V1, ROW_OTHER] })).toContain("scope_mixed");
    expect(issuesOf({ taskId: "bad id!" })).toContain("task_invalid");
    expect(issuesOf({ publicationId: null })).toContain("publication_required");
    expect(issuesOf({ publicationId: PUB_OLD })).toContain("publication_task_mismatch");
    expect(issuesOf({ description: "   " })).toContain("description_required");
    expect(issuesOf({ baselineCaptureIds: [ANSWER_AFTER] })).toContain(
      "baseline_after_publication",
    );
    // Codex N2/S3: the approver is the provenance's actual approver (owner OR delegate), never typed; an
    // unloaded, unapproved or revoked provenance blocks the payload instead of defaulting to the owner.
    const delegate = "00000000-0000-4000-8000-0000000000a1";
    const withDelegate = buildImprovementPayload(base, {
      ...deps,
      approvals: new Map([
        [
          PUB,
          {
            approved: true,
            approverKind: "delegate" as const,
            approverId: delegate,
            approvedAt: "2026-09-25T09:00:00Z",
          },
        ],
      ]),
    });
    expect(withDelegate.ok && withDelegate.payload.improvement.change).toMatchObject({
      approvedBy: delegate,
      approvedAt: "2026-09-25T09:00:00Z",
    });
    expect(buildImprovementPayload(base, { ...deps, approvals: new Map() })).toMatchObject({
      ok: false,
      issues: ["approval_unknown"],
    });
    expect(buildImprovementPayload(base, { ...deps, approvals: undefined })).toMatchObject({
      ok: false,
      issues: ["approval_unknown"],
    });
    expect(
      buildImprovementPayload(base, {
        ...deps,
        approvals: new Map([
          [PUB, { approved: false, approverKind: null, approverId: null, approvedAt: null }],
        ]),
      }),
    ).toMatchObject({ ok: false, issues: ["approval_unavailable"] });
  });
  it("records an inspection as a new version: positive carries a verification (needs baselines), negative/inconclusive never does", () => {
    const detail = {
      record: record(),
      publicationBinding: bindingFromAttempt(attempt()),
      boundFindingRowIds: [ROW_V1],
    };
    const positive = inspectionPayload(detail, {
      checkResult: "shows_approved_content",
      observedAt: "2026-09-27T12:00:00Z",
      ownerId: OWNER,
    });
    expect(positive).toMatchObject({
      ok: true,
      improvement: {
        verification: {
          method: "owner_inspection",
          verifiedAt: "2026-09-27T12:00:00Z",
          reviewer: OWNER,
        },
      },
      binding: {
        ownerInspection: {
          checkResult: "shows_approved_content",
          observedUrl: LIVE,
          observedAt: "2026-09-27T12:00:00Z",
        },
      },
    });
    for (const checkResult of ["does_not_show", "inconclusive"] as const) {
      const r = inspectionPayload(detail, {
        checkResult,
        observedAt: "2026-09-27T12:00:00Z",
        ownerId: OWNER,
      });
      expect(r).toMatchObject({
        ok: true,
        improvement: { verification: null },
        binding: { ownerInspection: { checkResult } },
      });
    }
    expect(
      inspectionPayload(
        {
          record: record({ baselineCaptureIds: [] }),
          publicationBinding: detail.publicationBinding,
          boundFindingRowIds: [ROW_V1],
        },
        {
          checkResult: "shows_approved_content",
          observedAt: "2026-09-27T12:00:00Z",
          ownerId: OWNER,
        },
      ),
    ).toEqual({ ok: false, issue: "baseline_required" });
    expect(
      inspectionPayload(
        { record: record(), publicationBinding: null, boundFindingRowIds: [ROW_V1] },
        { checkResult: "inconclusive", observedAt: "2026-09-27T12:00:00Z", ownerId: OWNER },
      ),
    ).toEqual({ ok: false, issue: "binding_required" });
  });
});

describe("reducer: frozen payload, identity, head token, conflict", () => {
  const draft = {
    ...newImprovementDraft("00000000-0000-4000-8000-000000000071", "k3j9x2ab", OWNER),
    findingRowIds: [ROW_V1],
    publicationId: PUB,
    description: "Added",
    baselineCaptureIds: [],
  };
  const deps = {
    rows: [row()],
    attempts: [attempt()],
    answers,
    approvals: new Map([
      [
        PUB,
        {
          approved: true,
          approverKind: "owner" as const,
          approverId: OWNER,
          approvedAt: "2026-09-25T09:05:00Z",
        },
      ],
    ]),
  };
  it("keeps the reviewed payload for an identical retry, maps codes, and continues only on a loaded head", () => {
    let s = forwardReducer(initialForwardState("o:p"), { type: "start", draft });
    s = forwardReducer(s, { type: "review", result: buildImprovementPayload(draft, deps) });
    expect(s.stage).toBe("review");
    const frozen = s.reviewed;
    s = forwardReducer(s, { type: "saveStarted" });
    s = forwardReducer(s, { type: "saveFailed", code: "citation_improvement_version_conflict" });
    expect(s.stage).toBe("review");
    expect(s.reviewed).toBe(frozen);
    expect(s.errorKey).toBe("citationForward.error.conflict");
    expect(forwardReducer(s, { type: "continueOnHead" })).toBe(s);
    s = forwardReducer(s, { type: "conflictLoaded", head: { version: 2, id: ROW_V2 } });
    s = forwardReducer(s, { type: "continueOnHead" });
    expect(s.stage).toBe("draft");
    expect(s.draft).toMatchObject({ expectedVersion: 2, expectedHeadId: ROW_V2 });
    expect(s.reviewed).toBeNull();
    expect(s.conflict).toBeNull();
    s = forwardReducer(s, { type: "review", result: buildImprovementPayload(s.draft!, deps) });
    s = forwardReducer(s, { type: "saveStarted" });
    s = forwardReducer(s, { type: "saved", version: 3 });
    expect(s).toMatchObject({ stage: "saved", savedVersion: 3, draft: null, reviewed: null });
  });
  it("an edit invalidates the reviewed payload; issues keep the draft; a scope change discards everything", () => {
    let s = forwardReducer(initialForwardState("o:p"), { type: "start", draft });
    s = forwardReducer(s, {
      type: "review",
      result: buildImprovementPayload({ ...draft, description: "" }, deps),
    });
    expect(s.stage).toBe("draft");
    expect(s.issues).toEqual(["description_required"]);
    s = forwardReducer(s, { type: "review", result: buildImprovementPayload(draft, deps) });
    s = forwardReducer(s, { type: "edit", patch: { description: "Changed" } });
    expect(s.reviewed).toBeNull();
    expect(s.stage).toBe("draft");
    expect(forwardReducer(s, { type: "scopeChanged", identity: "o:p" })).toBe(s);
    expect(forwardReducer(s, { type: "scopeChanged", identity: "o:q" })).toEqual(
      initialForwardState("o:q"),
    );
    expect(forwardReducer(s, { type: "cancel" })).toEqual(initialForwardState("o:p"));
  });
  it("head token and error keys", () => {
    const list = [
      summary({ id: "00000000-0000-4000-8000-0000000000a1", version: 1 }),
      summary({ id: "00000000-0000-4000-8000-0000000000a2", version: 2 }),
    ];
    expect(improvementHead("00000000-0000-4000-8000-000000000071", list)).toEqual({
      expectedVersion: 2,
      expectedHeadId: "00000000-0000-4000-8000-0000000000a2",
    });
    expect(improvementHead("00000000-0000-4000-8000-000000000099", list)).toEqual({
      expectedVersion: 0,
      expectedHeadId: null,
    });
    expect(forwardErrorKey("citation_improvement_binding_task_mismatch")).toBe(
      "citationForward.error.taskMismatch",
    );
    expect(forwardErrorKey("citation_improvement_verification_unbacked")).toBe(
      "citationForward.error.verificationUnbacked",
    );
    expect(forwardErrorKey("anything else")).toBe("citationForward.error.unavailable");
  });
});

const detailOf = (
  s: CitationImprovementSummary,
  r: Improvement,
  over: Partial<CitationImprovementSummary> = {},
) => ({
  id: s.id,
  improvementId: s.improvementId,
  version: s.version,
  verificationStatus: s.verificationStatus,
  evidenceStatus: s.evidenceStatus,
  ...over,
  record: r,
});
describe("retest readiness from live statuses", () => {
  it("counts only owner-attested distinct changes as verified and never invents a comparison", () => {
    const a1 = summary({
      id: "00000000-0000-4000-8000-0000000000a1",
      improvementId: "00000000-0000-4000-8000-000000000071",
      verificationStatus: "owner_attested",
      evidenceStatus: "baseline_recorded",
    });
    const a2 = summary({
      id: "00000000-0000-4000-8000-0000000000a2",
      improvementId: "00000000-0000-4000-8000-000000000072",
      verificationStatus: "owner_attested",
      evidenceStatus: "baseline_recorded",
    });
    // Distinct logical improvements: readiness reads current HEADS, so rows sharing an improvementId collapse.
    const receipts = summary({
      id: "00000000-0000-4000-8000-0000000000a3",
      improvementId: "00000000-0000-4000-8000-000000000073",
      verificationStatus: "connector_receipt",
    });
    const missing = summary({
      id: "00000000-0000-4000-8000-0000000000a4",
      improvementId: "00000000-0000-4000-8000-000000000074",
      verificationStatus: "unverified",
      evidenceStatus: "baseline_missing",
    });
    const verified = (over: Partial<Improvement>) =>
      record({
        verification: {
          method: "owner_inspection",
          receipt: "r",
          verifiedAt: "2026-09-27T12:00:00Z",
          reviewer: OWNER,
        },
        ...over,
      });
    const records = new Map([
      [a1.id, detailOf(a1, verified({ improvementId: a1.improvementId }))],
      // Same task → the same substantive change, not a second one.
      [a2.id, detailOf(a2, verified({ improvementId: a2.improvementId }))],
    ]);
    const r = retestReadiness([a1, a2, receipts, missing], records);
    expect(r).toMatchObject({
      attested: 2,
      distinctVerified: 1,
      required: 2,
      connectorReceipts: 1,
      unverified: 1,
      baselineMissing: 1,
    });
    records.set(
      a2.id,
      detailOf(
        a2,
        verified({
          improvementId: a2.improvementId,
          taskId: "zz99yy11",
          destination: { kind: "public_url", reference: "https://acme.example/faq" },
        }),
      ),
    );
    expect(retestReadiness([a1, a2], records).distinctVerified).toBe(2);
    // A detail that could not be read never counts.
    expect(retestReadiness([a1, a2], new Map()).distinctVerified).toBe(0);
    // Codex N2/S2: the NEWER detail status wins — a revoke, baseline removal or a detail of another row/version
    // read after the list drops the head even though its immutable record is unchanged.
    for (const over of [
      { verificationStatus: "unverified" as const },
      {
        verificationStatus: "connector_receipt" as const,
        evidenceStatus: "baseline_missing" as const,
      },
      { version: 2 },
      { id: "00000000-0000-4000-8000-0000000000a9" },
      { improvementId: "00000000-0000-4000-8000-000000000099" },
    ]) {
      const stale = new Map(records);
      stale.set(a2.id, detailOf(a2, records.get(a2.id)!.record, over));
      expect(retestReadiness([a1, a2], stale).distinctVerified, JSON.stringify(over)).toBe(1);
    }
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const findingDetail = (over: Record<string, unknown> = {}) => ({
  id: ROW_V1,
  findingId: FINDING,
  version: 1,
  decision: "accepted" as const,
  recordValid: true as const,
  record: {
    findingId: FINDING,
    family: "citation_source" as const,
    evidence: [{ kind: "answer" as const, id: ANSWER_BEFORE }],
    entityMatch: "confirmed" as const,
    capture: { answerComplete: true, citationsComplete: true },
    observation: "The answer cites a competitor but not this business.",
    hypothesis: null,
    competitorCited: true,
    ownCited: false,
    recommendation: null,
    support: [],
    accuracy: [],
    priority: { harm: "high" as const, relevance: "high" as const, fixability: "high" as const },
    decision: "accepted" as const,
    review: { reviewer: OWNER, reviewedAt: "2026-09-20T10:00:00Z" },
    secondReview: null,
    linkedTaskId: null,
  },
  ...over,
});

describe("Codex N1 corrections", () => {
  it("R3: readiness counts CURRENT heads only — a later negative, inconclusive or correcting version removes the earlier positive", () => {
    const v1 = summary({ id: "00000000-0000-4000-8000-0000000000a1", version: 1 });
    const v2 = summary({
      id: "00000000-0000-4000-8000-0000000000a2",
      version: 2,
      verificationStatus: "owner_attested",
      evidenceStatus: "baseline_recorded",
    });
    const verified = record({
      verification: {
        method: "owner_inspection",
        receipt: "r",
        verifiedAt: "2026-09-27T12:00:00Z",
        reviewer: OWNER,
      },
    });
    const records = new Map([[v2.id, detailOf(v2, verified)]]);
    expect(retestReadiness([v1, v2], records).distinctVerified).toBe(1);
    for (const status of ["connector_receipt", "unverified"] as const) {
      const v3 = summary({
        id: "00000000-0000-4000-8000-0000000000a3",
        version: 3,
        verificationStatus: status,
      });
      expect(currentImprovementHeads([v1, v2, v3]).map((s) => s.id)).toEqual([v3.id]);
      const r = retestReadiness([v1, v2, v3], records);
      expect(r.distinctVerified).toBe(0);
      expect(r.attested).toBe(0);
    }
    // A second logical improvement's head still counts on its own.
    const other = summary({
      id: "00000000-0000-4000-8000-0000000000b1",
      improvementId: "00000000-0000-4000-8000-000000000072",
      verificationStatus: "owner_attested",
      evidenceStatus: "baseline_recorded",
    });
    records.set(
      other.id,
      detailOf(
        other,
        record({
          improvementId: other.improvementId,
          taskId: "zz99yy11",
          destination: { kind: "public_url", reference: "https://acme.example/faq" },
          verification: verified.verification,
        }),
      ),
    );
    const v3 = summary({ id: "00000000-0000-4000-8000-0000000000a3", version: 3 });
    expect(retestReadiness([v1, v2, v3, other], records).distinctVerified).toBe(1);
  });
  it("R2: the inspection request is bound to the DISPLAYED row (its own version + id + bound rows), and a non-head row is refused locally", () => {
    const list = [
      summary({ id: "00000000-0000-4000-8000-0000000000a1", version: 1 }),
      summary({ id: "00000000-0000-4000-8000-0000000000a2", version: 2 }),
    ];
    const displayed = {
      id: "00000000-0000-4000-8000-0000000000a1",
      improvementId: list[0].improvementId,
      version: 1,
      panelId: PANEL,
      panelVersion: 2,
      client: { name: "Acme", market: "SE" },
      record: record(),
      publicationBinding: bindingFromAttempt(attempt()),
      boundFindingRowIds: [ROW_V1],
    };
    const input = {
      checkResult: "shows_approved_content" as const,
      observedAt: "2026-09-27T12:00:00Z",
      ownerId: OWNER,
    };
    expect(inspectionRequest(displayed, list, input)).toEqual({ ok: false, issue: "not_head" });
    const ok = inspectionRequest(displayed, [list[0]], input);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.request).toMatchObject({
      expectedVersion: 1,
      expectedHeadId: displayed.id,
      expectedFindingRowIds: [ROW_V1],
      scope: { panelId: PANEL, panelVersion: 2, client: { name: "Acme", market: "SE" } },
    });
    // The head token is NEVER taken from the list: the same displayed row with an unrelated list is still v1/a1.
    const ok2 = inspectionRequest(displayed, [], input);
    expect(ok2.ok && ok2.request.expectedHeadId).toBe(displayed.id);
  });
  it("R5: task creation waits for the authenticated read, verifies identity/eligibility, and never mutates the store after a scope loss or a rejected read", async () => {
    const base = {
      projectId: PROJECT,
      row: row(),
      language: "English" as const,
      add: addOpportunity,
      existing: () => tasksForFinding(getState().opportunities, ROW_V1),
    };
    // Scope lost while the read was in flight → nothing is added even though the read resolves fine.
    const d1 = deferred<ReturnType<typeof findingDetail>>();
    let current = true;
    const p1 = createTaskFromFinding({ ...base, read: () => d1.promise, isCurrent: () => current });
    current = false;
    d1.resolve(findingDetail());
    expect(await p1).toEqual({ outcome: "stale" });
    expect(getState().opportunities).toHaveLength(0);
    // Rejected read → fail closed.
    const d2 = deferred<ReturnType<typeof findingDetail>>();
    const p2 = createTaskFromFinding({ ...base, read: () => d2.promise, isCurrent: () => true });
    d2.reject(new Error("citation_finding_unavailable"));
    expect(await p2).toEqual({ outcome: "read_failed" });
    expect(getState().opportunities).toHaveLength(0);
    // The server returned a different row / a dismissed head / an unreadable record → nothing.
    for (const over of [
      { id: ROW_V2, version: 2 },
      { findingId: FINDING_OTHER },
      { decision: "dismissed" as const },
      { recordValid: false as const, record: {} },
    ]) {
      const r = await createTaskFromFinding({
        ...base,
        read: async () => findingDetail(over),
        isCurrent: () => true,
      });
      expect(r.outcome).not.toBe("created");
    }
    expect(getState().opportunities).toHaveLength(0);
    // The normal flow: one deferred read resolved while still current creates exactly one real task.
    const d3 = deferred<ReturnType<typeof findingDetail>>();
    const p3 = createTaskFromFinding({ ...base, read: () => d3.promise, isCurrent: () => true });
    expect(getState().opportunities).toHaveLength(0);
    d3.resolve(findingDetail());
    const r3 = await p3;
    expect(r3.outcome).toBe("created");
    expect(getState().opportunities).toHaveLength(1);
    expect(findingRowIdsOf(getState().opportunities[0])).toEqual([ROW_V1]);
    expect(getState().opportunities[0].priority).toBe("High");
  });
  it("R6: publication evidence is collected through the bounded page contract — an attempt on page 1 is found, another task is excluded, a failing page fails the read, the bound is honoured", async () => {
    const filler = (i: number) =>
      attempt({
        id: `b0000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        action: {
          id: "other001",
          title: null,
          businessValue: null,
          source: null,
          capturedAt: "2026-09-24T00:00:00Z",
        },
      });
    const page0 = Array.from({ length: 50 }, (_, i) => filler(i + 1));
    const pages = [page0, [attempt()]];
    const calls: number[] = [];
    const r = await collectPublishedAttempts(async (page) => {
      calls.push(page);
      return { items: pages[page] ?? [], total: 51 };
    });
    expect(calls).toEqual([0, 1]);
    expect(r).toMatchObject({ total: 51, complete: true });
    expect(r.items).toHaveLength(51);
    expect(publishedAttemptsForTask(r.items, "k3j9x2ab").map((a) => a.id)).toEqual([PUB]);
    expect(publishedAttemptsForTask(r.items, "other001")).toHaveLength(50);
    await expect(
      collectPublishedAttempts(async (page) => {
        if (page === 1) throw new Error("publication_evidence_unavailable");
        return { items: page0, total: 51 };
      }),
    ).rejects.toThrow("publication_evidence_unavailable");
    const bounded = await collectPublishedAttempts(
      async (page) => ({ items: [filler(page * 50 + 1)], total: 5000 }),
      { maxPages: 3 },
    );
    expect(bounded).toMatchObject({ complete: false, total: 5000 });
    expect(bounded.items).toHaveLength(3);
    const empty = await collectPublishedAttempts(async () => ({ items: [], total: 0 }));
    expect(empty).toEqual({ items: [], total: 0, complete: true });
  });
  it("R4: a task's pins keep their live chain state; a superseded pin exposes the bindable current head explicitly; a dismissed head is not offered; deleted tasks stay listed", () => {
    const task = addOpportunity(
      opportunityFromFinding({
        projectId: PROJECT,
        row: row(),
        record: null,
        language: "English",
        capturedAt: "2026-09-27T10:00:00Z",
      }),
    );
    const v2 = row({ id: ROW_V2, version: 2, supersedesId: ROW_V1 });
    expect(pinnedRowsOf(task, [row()])).toMatchObject([
      { rowId: ROW_V1, link: { status: "current" }, currentHead: null },
    ]);
    expect(pinnedRowsOf(task, [row(), v2])).toMatchObject([
      {
        rowId: ROW_V1,
        link: { status: "superseded", pinnedVersion: 1, headVersion: 2 },
        currentHead: { id: ROW_V2 },
      },
    ]);
    expect(
      pinnedRowsOf(task, [row(), row({ id: ROW_V2, version: 2, decision: "dismissed" })]),
    ).toMatchObject([{ link: { status: "dismissed" }, currentHead: null }]);
    expect(pinnedRowsOf(task, [])).toMatchObject([
      { link: { status: "deleted" }, currentHead: null },
    ]);
    updateOpportunity(task.id, { status: "archived" });
    deleteOpportunityRecoverably(task.id);
    expect(pinnedTasks(getState().opportunities).map((o) => o.id)).toEqual([task.id]);
    expect(taskStatus(getState().opportunities, task.id).status).toBe("deleted");
  });
});

describe("Codex P corrections (PR156 review)", () => {
  it("P1: a second creation for the same exact row is refused after the read — sequential clicks, a task attached while the read was pending, an archived existing task; a deleted one does not block", async () => {
    const base = {
      projectId: PROJECT,
      row: row(),
      language: "English" as const,
      add: addOpportunity,
      existing: () =>
        tasksForFinding(
          getState().opportunities.filter((o) => o.projectId === PROJECT),
          ROW_V1,
        ),
    };
    const read = async () => findingDetail();
    const first = await createTaskFromFinding({ ...base, read, isCurrent: () => true });
    expect(first.outcome).toBe("created");
    // Sequential second click: nothing added, the existing task is reported.
    const second = await createTaskFromFinding({ ...base, read, isCurrent: () => true });
    expect(second).toMatchObject({ outcome: "duplicate" });
    if (second.outcome === "duplicate")
      expect(second.tasks.map((t) => t.id)).toEqual([(first as { task: { id: string } }).task.id]);
    expect(getState().opportunities).toHaveLength(1);
    // A task attached to the row while a creation read is pending: the check runs at mutation time.
    setState((st) => ({ ...st, opportunities: [] }));
    const d = deferred<ReturnType<typeof findingDetail>>();
    const pending = createTaskFromFinding({
      ...base,
      read: () => d.promise,
      isCurrent: () => true,
    });
    const other = addOpportunity({
      projectId: PROJECT,
      title: "Attached meanwhile",
      language: "English",
      contentType: "Blog Article",
      searchIntent: "Informational",
      targetAudience: "x",
      businessValue: "y",
      recommendedCta: "",
      priority: "Low",
    });
    updateOpportunity(other.id, {
      sourceRefs: [findingSourceRef({ id: ROW_V1 }, "2026-09-28T00:00:00Z")],
    });
    d.resolve(findingDetail());
    expect(await pending).toMatchObject({ outcome: "duplicate" });
    expect(getState().opportunities).toHaveLength(1);
    // Archived pinned task still counts as existing (shown honestly, never rebound); a DELETED one does not.
    updateOpportunity(other.id, { status: "archived" });
    expect((await createTaskFromFinding({ ...base, read, isCurrent: () => true })).outcome).toBe(
      "duplicate",
    );
    deleteOpportunityRecoverably(other.id);
    expect((await createTaskFromFinding({ ...base, read, isCurrent: () => true })).outcome).toBe(
      "created",
    );
    expect(getState().opportunities.filter((o) => !o.deletedAt)).toHaveLength(1);
    // Another project's pin never blocks this project (project-scoped check).
    setState((st) => ({ ...st, opportunities: [] }));
    const foreign = addOpportunity({
      ...opportunityFromFinding({
        projectId: "proj_b",
        row: row(),
        record: null,
        language: "English",
        capturedAt: "2026-09-28T00:00:00Z",
      }),
    });
    expect(findingRowIdsOf(foreign)).toEqual([ROW_V1]);
    expect((await createTaskFromFinding({ ...base, read, isCurrent: () => true })).outcome).toBe(
      "created",
    );
  });
  it("P2: the manual draft's asset type follows the task's content type through the established mapping, so the WordPress post/page decision is the task's", () => {
    const project = {
      id: PROJECT,
      connectorType: "wordpress",
      wordpress: { defaultPostType: "post" },
    } as unknown as Project;
    const expectations: Array<[string, string, "post" | "page"]> = [
      ["Service Page", "servicePage", "page"],
      ["Landing Page", "landingPage", "page"],
      ["Location Page", "landingPage", "page"],
      ["Blog Article", "article", "post"],
      ["Guide", "article", "post"],
      ["FAQ Page", "faq", "post"],
      ["Comparison", "comparison", "post"],
    ];
    for (const [contentType, assetType, postType] of expectations) {
      const task = addOpportunity({
        projectId: PROJECT,
        title: `${contentType} task`,
        language: "Swedish",
        contentType: contentType as Opportunity["contentType"],
        searchIntent: "Informational",
        targetAudience: "x",
        businessValue: "y",
        recommendedCta: "",
        priority: "Low",
      });
      const asset = manualDraftForTask(task, uid(), "2026-09-28T00:00:00Z");
      expect(asset.assetType, contentType).toBe(assetType);
      expect(wpPostTypeFor(asset, project), contentType).toBe(postType);
      expect(asset).toMatchObject({
        opportunityId: task.id,
        sourceOpportunityId: task.id,
        sourceType: "manual",
        language: "Swedish",
        status: "Draft",
      });
    }
    // A finding-created task keeps the explicit Service Page default.
    const created = addOpportunity(
      opportunityFromFinding({
        projectId: PROJECT,
        row: row(),
        record: null,
        language: "English",
        capturedAt: "2026-09-28T00:00:00Z",
      }),
    );
    expect(manualDraftForTask(created, uid(), "2026-09-28T00:00:00Z").assetType).toBe(
      "servicePage",
    );
  });
});
