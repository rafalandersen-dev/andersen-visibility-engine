/**
 * Static-markup regressions (supporting evidence only, node env, no DOM): the forward panel renders honest
 * empty/blocked states and exposes the real controls and live labels. Clicks and saves are exercised in the
 * isolated browser harness (.coordination/harness) and the pure reducer/PGlite tests, not here.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ForwardState } from "@/lib/citation-forward";

type Q = {
  data?: unknown;
  isError: boolean;
  isSuccess: boolean;
  isPending: boolean;
  isFetching: boolean;
  refetch: () => void;
};
const h = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
  state: { opportunities: [] as unknown[], content: [] as unknown[] },
}));
vi.mock("@/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    vars ? `${key} ${Object.values(vars).join(" ")}` : key,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey, enabled }: { queryKey: unknown[]; enabled?: boolean }) =>
    enabled === false
      ? {
          data: undefined,
          isError: false,
          isSuccess: false,
          isPending: true,
          isFetching: false,
          refetch: vi.fn(),
        }
      : ((h.queries[String(queryKey[0])] as Q | undefined) ?? {
          data: undefined,
          isError: false,
          isSuccess: false,
          isPending: true,
          isFetching: true,
          refetch: vi.fn(),
        }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/answer-evidence.functions", () => ({ readAnswerEvidenceFn: vi.fn() }));
vi.mock("@/lib/citation-approval.functions", () => ({
  readPublicationApprovalProvenanceFn: vi.fn(),
}));
vi.mock("@/lib/project-team.functions", () => ({
  readProjectTeamRosterFn: vi.fn(),
  readOwnerTeamPolicyFn: vi.fn(),
}));
vi.mock("@/lib/citation-change.functions", () => ({
  readChangeArtifactsFn: vi.fn(),
  saveChangeArtifactFn: vi.fn(),
  removeChangeArtifactFn: vi.fn(),
  setChangeApprovalFn: vi.fn(),
  saveChangeReceiptFn: vi.fn(),
  removeChangeReceiptFn: vi.fn(),
  grantInspectionAssignmentFn: vi.fn(),
  revokeInspectionAssignmentFn: vi.fn(),
}));
vi.mock("@/lib/publication-evidence.functions", () => ({
  readPublicationEvidenceFn: vi.fn(),
  readPublicationSnapshotFn: vi.fn(),
}));
vi.mock("@/lib/citation-record.functions", () => ({
  getCitationFindingFn: vi.fn(),
  getCitationImprovementFn: vi.fn(),
  readCitationFindingsFn: vi.fn(),
  readCitationImprovementsFn: vi.fn(),
  removeCitationImprovementFn: vi.fn(),
  saveCitationImprovementFn: vi.fn(),
}));
vi.mock("@/lib/store", () => ({
  useStore: (sel: (s: unknown) => unknown) => sel(h.state),
  addOpportunity: vi.fn(),
  updateOpportunity: vi.fn(),
  upsertContent: vi.fn(),
  uid: () => "k3j9x2ab",
}));
import { CitationForwardPanel } from "./CitationForwardPanel";

const OWNER = "00000000-0000-4000-8000-000000000001";
const ROW = "00000000-0000-4000-8000-0000000000f1";
const PUB = "00000000-0000-4000-8000-0000000000b1";
const ok = (data: unknown): Q => ({
  data,
  isError: false,
  isSuccess: true,
  isPending: false,
  isFetching: false,
  refetch: vi.fn(),
});
const failed: Q = {
  data: undefined,
  isError: true,
  isSuccess: false,
  isPending: false,
  isFetching: false,
  refetch: vi.fn(),
};
const finding = (over: Record<string, unknown> = {}) => ({
  id: ROW,
  findingId: "00000000-0000-4000-8000-0000000000d1",
  version: 2,
  family: "citation_source",
  decision: "accepted",
  panelId: "00000000-0000-4000-8000-0000000000c1",
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
  scopeEnforcedAt: null,
  ...over,
});
const summaryRow = {
  id: "00000000-0000-4000-8000-0000000000a1",
  improvementId: "00000000-0000-4000-8000-000000000071",
  version: 1,
  panelId: "00000000-0000-4000-8000-0000000000c1",
  panelVersion: 2,
  client: { name: "Acme", market: "SE" },
  actorId: OWNER,
  supersedesId: null,
  predecessorDeleted: false,
  createdAt: "2026-09-26T10:00:00Z",
  verificationStatus: "connector_receipt",
  evidenceStatus: "baseline_recorded",
  scopeEnforcedAt: null,
};
const render = (initialState?: ForwardState) =>
  renderToStaticMarkup(
    createElement(CitationForwardPanel, {
      projectId: "proj_a",
      ownerId: OWNER,
      language: "English",
      initialState,
    }),
  );
const reset = () => {
  h.queries = {};
  h.state = { opportunities: [], content: [] };
};

describe("forward panel — honest states and real controls", () => {
  it("renders the authority note, loading, and the empty finding state; never a fabricated task", () => {
    reset();
    let html = render();
    expect(html).toContain("citationForward.authority");
    expect(html).toContain("citationForward.common.loading");
    // Codex P3: while the improvements list is still pending, readiness shows loading, never a measured zero.
    expect(html).not.toContain("citationChange.readiness.verified");
    expect(html).toContain("citationForward.readiness.title");
    h.queries["citation-findings"] = ok({ findings: [] });
    h.queries["citation-improvements"] = ok({ improvements: [] });
    html = render();
    expect(html).toContain("citationForward.findings.empty");
    expect(html).toContain("citationForward.improvement.listEmpty");
    expect(html).not.toContain("citationForward.task.create");
    expect(html).toContain("citationChange.readiness.verified 0 2");
    expect(html).toContain("citationForward.task.pinnedEmpty");
  });
  it("Codex P1: when a non-deleted task is already pinned to the selected row, creation is disabled and the existing pin is named", () => {
    reset();
    h.state = {
      opportunities: [
        {
          id: "k3j9x2ab",
          projectId: "proj_a",
          title: "Pinned task",
          status: "captured",
          sourceRefs: [
            {
              sourceType: "citation_finding",
              sourceRecordId: ROW,
              capturedAt: "2026-09-26T00:00:00Z",
            },
          ],
        },
      ],
      content: [],
    };
    h.queries["citation-findings"] = ok({ findings: [finding()] });
    h.queries["citation-improvements"] = ok({ improvements: [] });
    // Static render cannot pick a row (component state); the guard is proven by the helper test and the
    // browser run. Here the pinned view names the task and the create button is absent without a pick.
    const html = render();
    expect(html).toContain("Pinned task");
    expect(html).not.toContain("citationForward.task.create");
  });
  it("Codex N1/R4: existing pins are listed independently of the picker, with the live chain state of every pin, even when the pin is superseded", () => {
    reset();
    h.state = {
      opportunities: [
        {
          id: "k3j9x2ab",
          projectId: "proj_a",
          title: "Pinned task",
          status: "captured",
          sourceRefs: [
            {
              sourceType: "citation_finding",
              sourceRecordId: "00000000-0000-4000-8000-0000000000f0",
              capturedAt: "2026-09-26T00:00:00Z",
            },
          ],
        },
      ],
      content: [],
    };
    // v1 (pinned) was superseded by v2 (the only offered NEW source).
    h.queries["citation-findings"] = ok({
      findings: [finding({ id: "00000000-0000-4000-8000-0000000000f0", version: 1 }), finding()],
    });
    h.queries["citation-improvements"] = ok({ improvements: [] });
    const html = render();
    expect(html).toContain("citationForward.task.pinnedTitle");
    expect(html).toContain("Pinned task");
    expect(html).toContain("citationForward.findings.state.superseded");
    expect(html).toContain("citationForward.findings.pinned 1 2");
    expect(html).toContain("citationForward.improvement.start");
    expect(html).toContain("citationForward.studio.manualDraft");
    // The picker offers only the current head; the pinned v1 row is not a NEW source.
    expect(html).toContain(`value="${ROW}"`);
    expect(html).not.toContain('value="00000000-0000-4000-8000-0000000000f0"');
  });
  it("Codex N1/R3: readiness is withheld when the live list cannot be refreshed, and earlier versions are labelled as history", () => {
    reset();
    h.queries["citation-findings"] = ok({ findings: [] });
    h.queries["citation-improvements"] = failed;
    let html = render();
    expect(html).toContain("citationForward.readiness.unavailable");
    expect(html).not.toContain("citationChange.readiness.verified");
    h.queries["citation-improvements"] = ok({
      improvements: [
        {
          ...summaryRow,
          id: "00000000-0000-4000-8000-0000000000a1",
          version: 1,
          verificationStatus: "owner_attested",
          evidenceStatus: "baseline_recorded",
        },
        {
          ...summaryRow,
          id: "00000000-0000-4000-8000-0000000000a2",
          version: 2,
          supersedesId: "00000000-0000-4000-8000-0000000000a1",
          verificationStatus: "connector_receipt",
          evidenceStatus: "baseline_absent",
        },
      ],
    });
    html = render();
    expect(html).toContain("citationForward.improvement.historyRow");
    // The attested fetch only covers HEADS: no head is attested, so the query is disabled and counts render at 0.
    expect(html).toContain("citationChange.readiness.verified 0 2");
  });
  it("offers only current, non-dismissed heads as finding versions and reports load failures as errors", () => {
    reset();
    h.queries["citation-findings"] = ok({
      findings: [
        finding({ id: "00000000-0000-4000-8000-0000000000f0", version: 1 }),
        finding(),
        finding({
          id: "00000000-0000-4000-8000-0000000000f5",
          findingId: "00000000-0000-4000-8000-0000000000d5",
          decision: "dismissed",
        }),
      ],
    });
    h.queries["citation-improvements"] = failed;
    const html = render();
    expect(html).toContain(`value="${ROW}"`);
    expect(html).not.toContain('value="00000000-0000-4000-8000-0000000000f0"');
    expect(html).not.toContain("0000000000f5");
    expect(html).toContain("citationForward.error.loadImprovements");
  });
  it("in the improvement author: no published attempt for the task → explicit empty notice; issues listed; review control present", () => {
    reset();
    h.queries["citation-findings"] = ok({ findings: [finding()] });
    h.queries["publication-evidence"] = ok({ items: [], total: 0, complete: true });
    h.queries["answer-evidence"] = ok({ answers: [] });
    h.queries["citation-improvements"] = ok({ improvements: [] });
    const html = render({
      identity: `${OWNER}:proj_a`,
      stage: "draft",
      draft: {
        improvementId: "00000000-0000-4000-8000-000000000071",
        findingRowIds: [ROW],
        taskId: "k3j9x2ab",
        publicationId: null,
        changeArtifactId: null,
        changeReceiptId: null,
        approvedBy: OWNER,
        description: "",
        baselineCaptureIds: [],
        expectedVersion: 0,
        expectedHeadId: null,
      },
      reviewed: null,
      issues: ["publication_required", "description_required"],
      errorKey: null,
      conflict: null,
      savedVersion: null,
    });
    expect(html).toContain("citationForward.improvement.publicationNone");
    expect(html).toContain("citationForward.issue.publication_required");
    expect(html).toContain("citationForward.issue.description_required");
    expect(html).toContain("citationForward.improvement.review");
    // Codex N2/S3: no typed approver — without a chosen attempt nothing is claimed, and no text input exists.
    expect(html).not.toContain("citationForward.improvement.approvedByOwner");
    expect(html).not.toContain('<input class="block w-full');
  });
  it("Codex N2/S3: the approver is shown from the provenance read of the chosen attempt — owner, delegate (roster email) or not approved — never typed", () => {
    reset();
    h.queries["citation-findings"] = ok({ findings: [finding()] });
    h.queries["answer-evidence"] = ok({ answers: [] });
    h.queries["citation-improvements"] = ok({ improvements: [] });
    h.queries["publication-evidence"] = ok({
      items: [
        {
          id: PUB,
          assetId: "asset-1",
          versionHash: "a".repeat(64),
          title: "Services",
          startedAt: "2026-09-25T09:00:00Z",
          finishedAt: "2026-09-25T09:05:00Z",
          outcome: "published",
          outcomeData: {
            liveUrl: "https://acme.example/services",
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
        },
      ],
      total: 1,
      complete: true,
    });
    const state: ForwardState = {
      identity: `${OWNER}:proj_a`,
      stage: "draft",
      draft: {
        improvementId: "00000000-0000-4000-8000-000000000071",
        findingRowIds: [ROW],
        taskId: "k3j9x2ab",
        publicationId: PUB,
        changeArtifactId: null,
        changeReceiptId: null,
        approvedBy: OWNER,
        description: "",
        baselineCaptureIds: [],
        expectedVersion: 0,
        expectedHeadId: null,
      },
      reviewed: null,
      issues: [],
      errorKey: null,
      conflict: null,
      savedVersion: null,
    };
    h.queries["publication-approval-provenance"] = ok({
      approved: true,
      approverKind: "owner",
      approverId: OWNER,
      approvedAt: "2026-09-25T09:00:00Z",
    });
    let html = render(state);
    expect(html).toContain('data-approver="owner"');
    expect(html).toContain("citationForward.improvement.approvedByOwner");
    h.queries["publication-approval-provenance"] = ok({
      approved: true,
      approverKind: "delegate",
      approverId: "00000000-0000-4000-8000-0000000000a1",
      approvedAt: "2026-09-25T09:00:00Z",
    });
    h.queries["project-team-roster"] = ok({
      projectId: "proj_a",
      ownerId: OWNER,
      members: [
        {
          actorId: "00000000-0000-4000-8000-0000000000a1",
          email: "reviewer@acme.example",
          role: "reviewer",
          revision: 1,
          active: true,
          expiresAt: null,
        },
      ],
      invitations: [],
      audit: [],
    });
    html = render(state);
    expect(html).toContain('data-approver="delegate"');
    expect(html).toContain("citationForward.improvement.approvalDelegate reviewer@acme.example");
    h.queries["publication-approval-provenance"] = ok({
      approved: false,
      approverKind: null,
      approverId: null,
      approvedAt: null,
    });
    html = render(state);
    expect(html).toContain("citationForward.improvement.approvalNone");
    h.queries["publication-approval-provenance"] = failed;
    html = render(state);
    expect(html).toContain("citationForward.issue.approval_unknown");
  });
  it("in review: the exact frozen payload is shown as raw audit; a conflict offers continuation only once the head was loaded", () => {
    reset();
    h.queries["citation-findings"] = ok({ findings: [finding()] });
    h.queries["citation-improvements"] = ok({ improvements: [] });
    const reviewed = {
      scope: {
        panelId: "00000000-0000-4000-8000-0000000000c1",
        panelVersion: 2,
        client: { name: "Acme", market: "SE" },
      },
      improvement: {
        improvementId: "00000000-0000-4000-8000-000000000071",
        findingIds: ["00000000-0000-4000-8000-0000000000d1"],
        taskId: "k3j9x2ab",
        change: {
          description: "Added",
          approvedVersion: "a".repeat(64),
          approvedBy: OWNER,
          approvedAt: "2026-09-25T09:05:00Z",
        },
        destination: { kind: "public_url" as const, reference: "https://acme.example/services" },
        baselineCaptureIds: [],
        verification: null,
      },
      changeBinding: null,
      binding: {
        publicationId: PUB,
        assetId: "asset-1",
        versionHash: "a".repeat(64),
        ownerInspection: null,
      },
      expectedFindingRowIds: [ROW],
    };
    const base: ForwardState = {
      identity: `${OWNER}:proj_a`,
      stage: "review",
      draft: {
        improvementId: reviewed.improvement.improvementId,
        findingRowIds: [ROW],
        taskId: "k3j9x2ab",
        publicationId: PUB,
        changeArtifactId: null,
        changeReceiptId: null,
        approvedBy: OWNER,
        description: "Added",
        baselineCaptureIds: [],
        expectedVersion: 0,
        expectedHeadId: null,
      },
      reviewed,
      issues: [],
      errorKey: "citationForward.error.conflict",
      conflict: null,
      savedVersion: null,
    };
    let html = render(base);
    expect(html).toContain("https://acme.example/services");
    expect(html).toContain("citationForward.improvement.retry");
    expect(html).toContain("citationForward.error.conflict");
    expect(html).not.toContain("citationForward.error.conflictContinue");
    html = render({
      ...base,
      conflict: { version: 2, id: "00000000-0000-4000-8000-0000000000a2" },
    });
    expect(html).toContain("citationForward.error.conflictContinue");
  });
  it("lists improvements with LIVE status labels and the honest status note; a foreign-scope save is not rendered as attested", () => {
    reset();
    h.queries["citation-findings"] = ok({ findings: [] });
    h.queries["citation-improvements"] = ok({
      improvements: [
        {
          id: "00000000-0000-4000-8000-0000000000a1",
          improvementId: "00000000-0000-4000-8000-000000000071",
          version: 1,
          panelId: "00000000-0000-4000-8000-0000000000c1",
          panelVersion: 2,
          client: { name: "Acme", market: "SE" },
          actorId: OWNER,
          supersedesId: null,
          predecessorDeleted: false,
          createdAt: "2026-09-26T10:00:00Z",
          verificationStatus: "connector_receipt",
          evidenceStatus: "baseline_recorded",
          scopeEnforcedAt: null,
        },
        {
          id: "00000000-0000-4000-8000-0000000000a2",
          improvementId: "00000000-0000-4000-8000-000000000072",
          version: 1,
          panelId: "00000000-0000-4000-8000-0000000000c1",
          panelVersion: 2,
          client: { name: "Acme", market: "SE" },
          actorId: OWNER,
          supersedesId: null,
          predecessorDeleted: true,
          createdAt: "2026-09-26T11:00:00Z",
          verificationStatus: "unverified",
          evidenceStatus: "baseline_missing",
          scopeEnforcedAt: null,
        },
      ],
    });
    const html = render();
    expect(html).toContain("citationForward.improvement.status.connector_receipt");
    expect(html).toContain("citationForward.improvement.evidence.baseline_missing");
    expect(html).toContain("citationForward.improvement.statusNote");
    expect(html).toContain("citationForward.readiness.receipts 1");
    expect(html).toContain("citationForward.readiness.baselineMissing 1");
    expect(html).not.toContain("citationForward.improvement.status.owner_attested");
  });
  it("detail (pre-opened seam): pinned rows with LIVE link state, task state from the store, the inspection block with a noopener link, three explicit results and the negative note", () => {
    reset();
    h.state = {
      opportunities: [
        {
          id: "k3j9x2ab",
          projectId: "proj_a",
          title: "Task",
          status: "archived",
          archivedAt: "2026-09-26T00:00:00Z",
          sourceRefs: [],
        },
      ],
      content: [],
    };
    h.queries["citation-findings"] = ok({
      findings: [finding({ id: "00000000-0000-4000-8000-0000000000f3", version: 3 }), finding()],
    });
    h.queries["citation-improvements"] = ok({ improvements: [summaryRow] });
    h.queries["citation-improvement"] = ok({
      ...summaryRow,
      record: {
        improvementId: summaryRow.improvementId,
        findingIds: ["00000000-0000-4000-8000-0000000000d1"],
        taskId: "k3j9x2ab",
        change: {
          description: "Added",
          approvedVersion: "a".repeat(64),
          approvedBy: OWNER,
          approvedAt: "2026-09-25T09:05:00Z",
        },
        destination: { kind: "public_url", reference: "https://acme.example/services" },
        baselineCaptureIds: ["00000000-0000-4000-8000-0000000000e1"],
        verification: null,
      },
      boundFindingRowIds: [ROW],
      publicationBinding: {
        publicationId: PUB,
        assetId: "asset-1",
        versionHash: "a".repeat(64),
        ownerInspection: null,
      },
    });
    const html = renderToStaticMarkup(
      createElement(CitationForwardPanel, {
        projectId: "proj_a",
        ownerId: OWNER,
        language: "English",
        initialOpenImprovementId: summaryRow.id,
      }),
    );
    expect(html).toContain('aria-pressed="true"');
    // The pinned row is v2 while the head is v3: shown as superseded, never silently moved to the head.
    expect(html).toContain("citationForward.findings.state.superseded");
    expect(html).toContain("citationForward.findings.pinned 2 3");
    expect(html).toContain("citationForward.task.state.archived");
    expect(html).toContain(
      'href="https://acme.example/services" target="_blank" rel="noopener noreferrer"',
    );
    expect(html).toContain("citationForward.inspection.open");
    for (const r of ["shows_approved_content", "does_not_show", "inconclusive"])
      expect(html).toContain(`value="${r}"`);
    expect(html).toContain("citationForward.inspection.negativeNote");
    expect(html).toContain("citationForward.inspection.record");
    expect(html).toContain("citationForward.improvement.remove");
    // A missing task is reported, never rebound: same detail with an empty store.
    h.state = { opportunities: [], content: [] };
    const missing = renderToStaticMarkup(
      createElement(CitationForwardPanel, {
        projectId: "proj_a",
        ownerId: OWNER,
        language: "English",
        initialOpenImprovementId: summaryRow.id,
      }),
    );
    expect(missing).toContain("citationForward.task.state.missing");
    expect(missing).not.toContain("citationForward.task.state.archived");
  });
  it("change-kind detail (candidate 20260928120000): the bound artifact/receipt, the owner inspection controls without a hyperlink, the independent status, live dissent provenance, inspector chains with validity reasons, and readiness lines", () => {
    reset();
    const ART_SHA = "d".repeat(64);
    const inspector = "00000000-0000-4000-8000-0000000000a1";
    const head = {
      ...summaryRow,
      verificationStatus: "owner_attested",
      evidenceStatus: "baseline_recorded",
      independentStatus: "disputed",
      verifiedEligible: false,
      verifiedAt: null,
    };
    h.queries["citation-findings"] = ok({ findings: [finding()] });
    h.queries["citation-improvements"] = ok({ improvements: [head] });
    h.queries["citation-improvement"] = ok({
      ...head,
      record: {
        improvementId: summaryRow.improvementId,
        findingIds: ["00000000-0000-4000-8000-0000000000d1"],
        taskId: "k3j9x2ab",
        change: {
          description: "Corrected the opening hours.",
          approvedVersion: ART_SHA,
          approvedBy: OWNER,
          approvedAt: "2026-09-27T10:05:00Z",
        },
        destination: { kind: "listing", reference: "google-business-profile:acme" },
        baselineCaptureIds: ["00000000-0000-4000-8000-0000000000e1"],
        verification: {
          method: "owner_inspection",
          receipt: "r",
          verifiedAt: "2026-09-27T12:00:00Z",
          reviewer: OWNER,
        },
      },
      boundFindingRowIds: [ROW],
      publicationBinding: null,
      changeBinding: {
        kind: "listing",
        reference: "google-business-profile:acme",
        artifactId: "00000000-0000-4000-8000-0000000000aa",
        artifactSha256: ART_SHA,
        receiptId: "00000000-0000-4000-8000-0000000000ab",
        ownerInspection: {
          observedAt: "2026-09-27T12:00:00Z",
          checkResult: "shows_approved_content",
          observedReference: "google-business-profile:acme",
        },
        artifactDeleted: false,
      },
      assignments: [
        {
          inspectorId: inspector,
          active: true,
          grantedAt: "2026-09-27T11:00:00Z",
          revokedAt: null,
          effective: true,
        },
      ],
      inspections: [
        {
          id: "00000000-0000-4000-8000-0000000000e7",
          inspectorId: "00000000-0000-4000-8000-0000000000a4",
          version: 1,
          supersedesId: null,
          checkResult: "shows_approved_content",
          observedAt: "2026-09-27T11:20:00Z",
          createdAt: "2026-09-27T11:20:01Z",
          isHead: true,
          effective: false,
          ineffectiveReason: "authority",
        },
        {
          id: "00000000-0000-4000-8000-0000000000e9",
          inspectorId: inspector,
          version: 2,
          supersedesId: "00000000-0000-4000-8000-0000000000e8",
          checkResult: "does_not_show",
          observedAt: "2026-09-27T11:30:00Z",
          createdAt: "2026-09-27T11:30:01Z",
          isHead: true,
          effective: true,
          ineffectiveReason: null,
        },
        {
          id: "00000000-0000-4000-8000-0000000000e8",
          inspectorId: inspector,
          version: 1,
          supersedesId: null,
          checkResult: "shows_approved_content",
          observedAt: "2026-09-27T11:10:00Z",
          createdAt: "2026-09-27T11:10:01Z",
          isHead: false,
          effective: false,
          ineffectiveReason: "superseded",
        },
      ],
      dissent: [
        {
          receiptId: "00000000-0000-4000-8000-0000000000e9",
          improvementRowId: "00000000-0000-4000-8000-0000000000a0",
          inspectorId: inspector,
          observedAt: "2026-09-27T11:30:00Z",
        },
      ],
    });
    const html = renderToStaticMarkup(
      createElement(CitationForwardPanel, {
        projectId: "proj_a",
        ownerId: OWNER,
        language: "English",
        initialOpenImprovementId: summaryRow.id,
      }),
    );
    expect(html).toContain("data-change-binding");
    expect(html).toContain("citationChange.artifact.kind.listing");
    expect(html).toContain("google-business-profile:acme");
    expect(html).toContain("d".repeat(16));
    // Owner inspection controls exist for a change row, but there is no hyperlink to "open" (no URL to visit).
    expect(html).toContain('name="inspection-result"');
    expect(html).not.toContain("citationForward.inspection.open");
    expect(html).not.toContain("citationForward.inspection.snapshot");
    // The independent section: disputed + not eligible although the owner attested; dissent names the earlier row.
    expect(html).toContain('data-independent="disputed"');
    expect(html).toContain('data-eligible="no"');
    expect(html).toContain('data-dissent="1"');
    expect(html).toContain("citationChange.dissent.row");
    expect(html).toContain('data-effective="yes"');
    // A second inspector whose positive head lost effect under renewed authority is labelled with the reason and
    // never counted.
    expect(html).toContain('data-effective="no"');
    expect(html).toContain("citationChange.inspect.reason.authority");
    expect(html).toContain("citationChange.assign.link");
    expect(html).toContain("citationChange.assign.revoke");
    // The list chip carries the server label; readiness waits for the fresh detail of the disputed/attested head
    // (its query key is not mocked here → loading, never a measured count).
    expect(html).toContain("citationChange.independent.disputed");
    expect(html).toContain("citationForward.readiness.title");
    expect(html).not.toContain("citationChange.readiness.disputed 1");
  });
  it("Codex R5: an independent-only eligible row is labelled by its proof source (never 'no baseline recorded'), the neutral readiness count names its sources, and the owner sees the EXACT bound artifact fields with a reference-appropriate instruction; unavailable content disables a positive attestation", () => {
    reset();
    const ART = "00000000-0000-4000-8000-0000000000aa";
    const ART_SHA = "d".repeat(64);
    const independentHead = {
      ...summaryRow,
      verificationStatus: "receipt_recorded",
      evidenceStatus: "baseline_absent",
      independentStatus: "independently_inspected",
      verifiedEligible: true,
      verifiedAt: "2026-09-28T02:53:33Z",
    };
    const detailOf = (changeBinding: Record<string, unknown>) => ({
      ...independentHead,
      record: {
        improvementId: summaryRow.improvementId,
        findingIds: ["00000000-0000-4000-8000-0000000000d1"],
        taskId: "k3j9x2ab",
        change: {
          description: "Set the site title.",
          approvedVersion: ART_SHA,
          approvedBy: OWNER,
          approvedAt: "2026-09-28T02:50:00Z",
        },
        destination: { kind: "configuration", reference: "site-settings:general" },
        baselineCaptureIds: ["00000000-0000-4000-8000-0000000000e1"],
        verification: null,
      },
      boundFindingRowIds: [ROW],
      publicationBinding: null,
      changeBinding: {
        kind: "configuration",
        reference: "site-settings:general",
        artifactId: ART,
        artifactSha256: ART_SHA,
        receiptId: "00000000-0000-4000-8000-0000000000ab",
        ownerInspection: null,
        artifactDeleted: false,
        ...changeBinding,
      },
      assignments: [],
      inspections: [],
      dissent: [],
    });
    const artifact = (sha = ART_SHA) => ({
      id: ART,
      kind: "configuration",
      reference: "site-settings:general",
      fields: { siteTitle: { before: null, after: "Milo fixture title" } },
      artifactSha256: sha,
      createdBy: OWNER,
      createdAt: "2026-09-28T02:49:00Z",
      approval: null,
      receipts: [],
    });
    const renderDetail = () =>
      renderToStaticMarkup(
        createElement(CitationForwardPanel, {
          projectId: "proj_a",
          ownerId: OWNER,
          language: "English",
          initialOpenImprovementId: summaryRow.id,
        }),
      );
    h.queries["citation-findings"] = ok({ findings: [finding()] });
    h.queries["citation-improvements"] = ok({ improvements: [independentHead] });
    h.queries["citation-improvement"] = ok(detailOf({}));
    h.queries["citation-improvement-attested"] = ok(new Map([[summaryRow.id, detailOf({})]]));
    h.queries["citation-change-artifacts"] = ok({ artifacts: [artifact()] });
    const tagOf = (html: string, marker: string) => {
      const at = html.indexOf(marker);
      return html.slice(html.lastIndexOf("<input", at), at);
    };
    let html = renderDetail();
    // Evidence chip: proof-source label, never the owner-axis "no baseline recorded".
    expect(html).toContain("citationChange.evidence.independentBaseline");
    expect(html).not.toContain("citationForward.improvement.evidence.baseline_absent");
    expect(html).toContain('data-evidence="baseline_absent"');
    // Neutral count with its sources: 1 verified through the independent path, 0 owner-attested.
    expect(html).toContain("citationChange.readiness.verified 1 2");
    expect(html).toContain("citationChange.readiness.sources 0 1");
    expect(html).not.toContain("citationForward.readiness.verified");
    // Owner content: the exact bound artifact's fields + the reference-appropriate instruction; positive allowed.
    expect(html).toContain('data-owner-content="fields"');
    expect(html).toContain("siteTitle");
    expect(html).toContain("Milo fixture title");
    expect(html).toContain("citationChange.inspect.ownerIntro");
    expect(html).not.toContain("citationForward.inspection.intro");
    expect(html).not.toContain("citationForward.inspection.open");
    expect(tagOf(html, 'value="shows_approved_content"')).not.toContain('disabled=""');
    // Hash mismatch (a newer artifact under the same id) → unavailable, positive disabled, negative allowed.
    h.queries["citation-change-artifacts"] = ok({ artifacts: [artifact("e".repeat(64))] });
    html = renderDetail();
    expect(html).toContain('data-owner-content="unavailable"');
    expect(html).not.toContain("Milo fixture title");
    expect(tagOf(html, 'value="shows_approved_content"')).toContain('disabled=""');
    expect(tagOf(html, 'value="does_not_show"')).not.toContain('disabled=""');
    // Artifact read error → unavailable; loading → loading (positive disabled until loaded); deleted → unavailable.
    h.queries["citation-change-artifacts"] = failed;
    expect(renderDetail()).toContain('data-owner-content="unavailable"');
    delete h.queries["citation-change-artifacts"];
    html = renderDetail();
    expect(html).toContain('data-owner-content="loading"');
    expect(tagOf(html, 'value="shows_approved_content"')).toContain('disabled=""');
    h.queries["citation-change-artifacts"] = ok({ artifacts: [artifact()] });
    h.queries["citation-improvement"] = ok(detailOf({ artifactDeleted: true }));
    html = renderDetail();
    expect(html).toContain("citationChange.binding.deleted");
    expect(html).not.toContain('name="inspection-result"');
    // An owner-only row keeps the released owner labels; a disputed row never qualifies.
    const ownerHead = {
      ...summaryRow,
      verificationStatus: "owner_attested",
      evidenceStatus: "baseline_recorded",
      independentStatus: "none",
      verifiedEligible: true,
      verifiedAt: "2026-09-28T03:00:00Z",
    };
    h.queries["citation-improvements"] = ok({ improvements: [ownerHead] });
    h.queries["citation-improvement"] = ok({ ...detailOf({}), ...ownerHead });
    h.queries["citation-improvement-attested"] = ok(
      new Map([[summaryRow.id, { ...detailOf({}), ...ownerHead }]]),
    );
    html = renderDetail();
    expect(html).toContain("citationForward.improvement.evidence.baseline_recorded");
    expect(html).not.toContain("citationChange.evidence.independentBaseline");
    // T (PR157 finding 4118473980): a bound receipt from an earlier approval epoch is named as such and the owner
    // inspection controls are withheld (no new inspection may bind that receipt); the audit block stays.
    h.queries["citation-improvement"] = ok(detailOf({ receiptCurrent: false }));
    const stale = renderDetail();
    expect(stale).toContain("data-change-binding");
    expect(stale).toContain("data-receipt-stale");
    expect(stale).toContain("citationChange.binding.receiptStale");
    expect(stale).not.toContain('name="inspection-result"');
    h.queries["citation-improvement"] = ok(detailOf({ receiptCurrent: true }));
    expect(renderDetail()).not.toContain("data-receipt-stale");
  });
});
