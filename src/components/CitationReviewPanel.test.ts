/**
 * P4 review UI render regressions (react-dom/server static markup, node environment, no browser):
 * - the assigned reviewer sees the finding RECORD readably (observation / hypothesis / recommendation / support
 *   claims) before the raw JSON, which is a collapsed audit only;
 * - a revoked/expired read renders NO cached finding material but keeps the reviewer's OWN receipt withdrawable;
 * - the owner's live accuracy resolution is rendered from the real contract fields (`humanStatus` +
 *   `resolution`), never from a non-existent `status`.
 * Full component behaviour (clicks, submit/withdraw round-trips, mobile/keyboard) is NOT proven here.
 */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CitationFindingForReview } from "@/lib/citation-finding-review";
import type { CitationAccuracyResolution } from "@/lib/citation-business-fact";
import type { Finding } from "@/lib/citation-finding";
import {
  initialReviewerForm,
  reviewerFormReducer,
  type ReviewerFormEvent,
  type ReviewerFormState,
} from "@/lib/citation-review-ui";

type Q = {
  data?: unknown;
  isError: boolean;
  isSuccess: boolean;
  isPending: boolean;
  isFetching: boolean;
  refetch: () => void;
};
const h = vi.hoisted(() => ({ queries: {} as Record<string, unknown>, keys: [] as string[][] }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: "00000000-0000-4000-8000-0000000000a1" } }),
}));
vi.mock("@/i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    h.keys.push([...queryKey]);
    return (
      (h.queries[queryKey[0]] as Q | undefined) ?? {
        data: undefined,
        isError: false,
        isSuccess: false,
        isPending: true,
        isFetching: true,
        refetch: vi.fn(),
      }
    );
  },
}));
vi.mock("@/lib/citation-record.functions", () => ({
  getCitationFindingFn: vi.fn(),
  readCitationFindingsFn: vi.fn(),
}));
vi.mock("@/lib/citation-finding-review.functions", () => ({
  getCitationFindingForReviewFn: vi.fn(),
  readCitationFindingReviewsFn: vi.fn(),
  saveCitationFindingReviewFn: vi.fn(),
  removeCitationFindingReviewFn: vi.fn(),
  grantCitationReviewAssignmentFn: vi.fn(),
  revokeCitationReviewAssignmentFn: vi.fn(),
}));
vi.mock("@/lib/project-team.functions", () => ({
  readProjectTeamRosterFn: vi.fn(),
  readOwnerTeamPolicyFn: vi.fn(),
}));
// The Radix select needs a DOM; the decision control's rendering is not under test here.
vi.mock("./ui/select", async () => {
  const { createElement: el } = await import("react");
  const box = (name: string) => (p: { children?: ReactNode }) =>
    el("div", { "data-sel": name }, p.children);
  return {
    Select: box("root"),
    SelectContent: box("content"),
    SelectItem: box("item"),
    SelectTrigger: box("trigger"),
    SelectValue: () => null,
  };
});
import { AccuracyResolutionList, CitationReviewPanel } from "./CitationReviewPanel";

const owner = "00000000-0000-4000-8000-000000000001";
const findingRowId = "00000000-0000-4000-8000-0000000000f0";
const OBSERVATION = "ChatGPT cites a competitor page for the weekend opening hours";
const CLAIM = "open every Saturday until 18:00";
const record: Finding = {
  findingId: "00000000-0000-4000-8000-0000000000d1",
  family: "citation_source",
  evidence: [{ kind: "answer", id: "00000000-0000-4000-8000-0000000000e1" }],
  entityMatch: "confirmed",
  capture: { answerComplete: true, citationsComplete: true },
  observation: OBSERVATION,
  hypothesis: "The own site lists hours only as an image",
  competitorCited: true,
  ownCited: false,
  recommendation: {
    status: "mentioned_only",
    passage: "Milo Massage is also in the area",
    target: "Milo Massage",
    suitability: "fits",
    review: { reviewer: owner, reviewedAt: "2026-09-10T10:00:00Z" },
  },
  support: [
    {
      claimSpan: CLAIM,
      citedUrl: "https://competitor.example/hours",
      answerCapturedAt: "2026-09-10T09:00:00Z",
      status: "partly_supports",
      sourcePassage: "Saturday 10–18",
      sourceCapturedAt: "2026-09-10T09:30:00Z",
      reason: "the cited page shows Saturday only",
      review: { reviewer: owner, reviewedAt: "2026-09-10T10:00:00Z" },
      // Intentionally UNPINNED (historical finding on an immutable document): owner-recorded provenance only.
      selectedRecord: null,
    },
  ],
  accuracy: [],
  priority: { harm: "medium", relevance: "high", fixability: "high" },
  decision: "needs_second_review",
  review: { reviewer: owner, reviewedAt: "2026-09-10T10:00:00Z" },
  secondReview: null,
  linkedTaskId: null,
};
const view: CitationFindingForReview = {
  id: findingRowId,
  findingId: record.findingId,
  version: 1,
  family: "citation_source",
  decision: "needs_second_review",
  panelId: "00000000-0000-4000-8000-0000000000c1",
  panelVersion: 1,
  client: { name: "Milo Massage", market: "SE" },
  recordSha256: "a".repeat(64),
  record,
  createdAt: "2026-09-10T10:00:00Z",
  evidenceErased: false,
  sourcePassagesWithheld: false,
  sourceAvailable: true,
  accuracyStatus: "none",
  reviewStatus: "second_review_pending",
  inspectionComplete: true,
  evidence: [],
  facts: [],
  reviews: [],
  reviewTotal: 0,
  reviewsTruncated: false,
  scopeEnforcedAt: null,
};
const ok = (data: unknown): Q => ({
  data,
  isError: false,
  isSuccess: true,
  isPending: false,
  isFetching: false,
  refetch: vi.fn(),
});
const errored = (staleData: unknown): Q => ({
  data: staleData,
  isError: true,
  isSuccess: false,
  isPending: false,
  isFetching: false,
  refetch: vi.fn(),
});
/** Data PRESENT but this observer has not (yet) succeeded: a cache entry from elsewhere / a placeholder /
 * a read still in flight on a new mount. Must expose nothing. */
const presentNotSucceeded = (data: unknown): Q => ({
  data,
  isError: false,
  isSuccess: false,
  isPending: true,
  isFetching: true,
  refetch: vi.fn(),
});
const receiptPage = (mine: boolean) => ({
  reviews: [
    {
      id: "00000000-0000-4000-8000-0000000000b1",
      reviewerId: "00000000-0000-4000-8000-0000000000a1",
      mine,
      owner: false,
      reviewerRole: "reviewer",
      decision: "rejected",
      note: null,
      inspectionComplete: true,
      withdrawn: false,
      withdrawnAt: null,
      findingVersion: 1,
      recordSha256: "a".repeat(64),
      createdAt: "2026-09-11T10:00:00Z",
    },
  ],
  reviewTotal: 1,
  reviewsTruncated: false,
});
const renderReviewer = (form?: ReviewerFormState) =>
  renderToStaticMarkup(
    createElement(CitationReviewPanel, {
      projectId: "synergy_2026",
      reviewerContext: { ownerId: owner, findingRowId },
      initialReviewerForm: form,
    }),
  );
const replay = (events: ReviewerFormEvent[]) =>
  events.reduce(reviewerFormReducer, initialReviewerForm);

describe("assigned reviewer surface", () => {
  it("renders the finding record readably BEFORE the raw JSON audit, with the cited evidence", () => {
    h.queries = { "citation-for-review": ok(view), "citation-reviews": ok(receiptPage(false)) };
    const html = renderReviewer();
    for (const key of [
      "citationReview.record.observation",
      "citationReview.record.hypothesis",
      "citationReview.record.recommendation",
      "citationReview.record.support",
      "citationReview.record.citedUrl",
      "citationReview.record.sourcePassage",
      "citationReview.reviewer.evidence",
    ])
      expect(html).toContain(key);
    expect(html).toContain(OBSERVATION);
    expect(html).toContain(CLAIM);
    expect(html).toContain("partly_supports");
    expect(html).toContain("https://competitor.example/hours");
    // Raw JSON stays a collapsed <details> audit, after the readable record.
    expect(html).toContain("<details");
    expect(html.indexOf(OBSERVATION)).toBeLessThan(html.indexOf("<details"));
    expect(html).not.toContain("citationReview.reviewer.passagesWithheld");
    expect(html).not.toContain("citationReview.reviewer.withdraw");
  });
  it("says so when the server withheld the copied source passages", () => {
    h.queries = {
      "citation-for-review": ok({
        ...view,
        sourcePassagesWithheld: true,
        inspectionComplete: false,
      }),
      "citation-reviews": ok(receiptPage(false)),
    };
    expect(renderReviewer()).toContain("citationReview.reviewer.passagesWithheld");
  });
  it("offers withdrawal of the reviewer's OWN active receipt while the finding is still readable", () => {
    h.queries = { "citation-for-review": ok(view), "citation-reviews": ok(receiptPage(true)) };
    const html = renderReviewer();
    expect(html).toContain("citationReview.reviewer.recorded");
    expect(html).toContain("citationReview.reviewer.withdraw");
  });
  it("after a revoked/expired read renders NO cached finding material, but keeps the own receipt withdrawable", () => {
    h.queries = {
      "citation-for-review": errored(view),
      "citation-reviews": errored(receiptPage(true)),
    };
    const html = renderReviewer();
    expect(html).toContain("citationReview.reviewer.unavailable");
    expect(html).toContain("citationReview.reviewer.revokedOwnReceipt");
    expect(html).toContain("citationReview.reviewer.withdraw");
    expect(html).not.toContain(OBSERVATION);
    expect(html).not.toContain(CLAIM);
    expect(html).not.toContain("<details");
    expect(html).not.toContain("<pre");
  });
  it("after a revoked read with no receipt page in hand offers nothing but the honest unavailable notice", () => {
    h.queries = { "citation-for-review": errored(view), "citation-reviews": errored(undefined) };
    const html = renderReviewer();
    expect(html).toContain("citationReview.reviewer.unavailable");
    expect(html).not.toContain("citationReview.reviewer.withdraw");
    expect(html).not.toContain(OBSERVATION);
  });
  it("authorized cached finding → save FORBIDDEN → own withdrawal start/fail/success: finding stays hidden, own receipt controls only", () => {
    // Both reads still hold SUCCESSFUL cached data (a non-stale refusal does not refetch): the component must
    // hide it on the reducer's sticky `denied`, and no withdrawal transition may un-hide it.
    h.queries = { "citation-for-review": ok(view), "citation-reviews": ok(receiptPage(true)) };
    const forbidden: ReviewerFormEvent[] = [
      { type: "view", currentSha: view.recordSha256 },
      { type: "decision", decision: "approved" },
      { type: "submit_start" },
      { type: "submit_failed", code: "citation_review_forbidden" },
    ];
    const stages: Array<
      [string, ReviewerFormEvent[], { withdrawOffered: boolean; notice: string | null }]
    > = [
      ["after refusal", forbidden, { withdrawOffered: true, notice: null }],
      [
        "withdraw start",
        [...forbidden, { type: "withdraw_start" }],
        { withdrawOffered: true, notice: null },
      ],
      [
        "withdraw failed",
        [...forbidden, { type: "withdraw_start" }, { type: "withdraw_failed" }],
        { withdrawOffered: true, notice: "citationReview.reviewer.withdrawFailed" },
      ],
      [
        "withdraw ok",
        [
          ...forbidden,
          { type: "withdraw_start" },
          { type: "withdraw_ok", id: receiptPage(true).reviews[0].id },
        ],
        { withdrawOffered: false, notice: "citationReview.reviewer.withdrawn" },
      ],
    ];
    for (const [stage, events, expected] of stages) {
      const state = replay(events);
      expect(state.denied, stage).toBe(true);
      const html = renderReviewer(state);
      expect(html, stage).toContain("citationReview.reviewer.unavailable");
      expect(html, stage).not.toContain(OBSERVATION);
      expect(html, stage).not.toContain(CLAIM);
      expect(html, stage).not.toContain("citationReview.reviewer.evidence");
      expect(html, stage).not.toContain("<details");
      expect(html, stage).not.toContain("<pre");
      expect(html, stage).not.toContain("citationReview.reviewer.submit");
      if (expected.withdrawOffered) {
        expect(html, stage).toContain("citationReview.reviewer.revokedOwnReceipt");
        expect(html, stage).toContain("citationReview.reviewer.withdraw");
      } else {
        expect(html, stage).not.toContain("citationReview.reviewer.withdraw<");
        expect(html, stage).not.toContain("citationReview.reviewer.recorded");
      }
      if (expected.notice) expect(html, stage).toContain(expected.notice);
    }
    // Contrast: the same cached reads WITHOUT a refusal render the finding.
    expect(renderReviewer(replay(forbidden.slice(0, 2)))).toContain(OBSERVATION);
  });
  it("a new mount exposes NOTHING before its own read succeeds, even when data is already present", () => {
    // P1 (browser-proven): a remount after forbidden → withdraw showed the previous mount's cached finding
    // while the new slow read was in flight. Data presence is not authorization: only `isSuccess` of THIS
    // mount's own read exposes material.
    h.queries = {
      "citation-for-review": presentNotSucceeded(view),
      "citation-reviews": presentNotSucceeded(receiptPage(true)),
    };
    const html = renderReviewer();
    expect(html).toContain("citationReview.loading");
    expect(html).not.toContain(OBSERVATION);
    expect(html).not.toContain(CLAIM);
    expect(html).not.toContain("citationReview.reviewer.evidence");
    expect(html).not.toContain("<details");
    expect(html).not.toContain("<pre");
    expect(html).not.toContain("citationReview.reviewer.submit");
    expect(html).not.toContain("citationReview.reviewer.withdraw");
  });
  it("every mount scopes its query keys with a NEW mount token (no cross-mount cache reuse), keeping the actor/owner/project/finding scope", () => {
    h.queries = { "citation-for-review": ok(view), "citation-reviews": ok(receiptPage(false)) };
    h.keys = [];
    renderReviewer();
    const first = h.keys.filter(
      (k) => k[0] === "citation-for-review" || k[0] === "citation-reviews",
    );
    h.keys = [];
    renderReviewer();
    const second = h.keys.filter(
      (k) => k[0] === "citation-for-review" || k[0] === "citation-reviews",
    );
    expect(first.length).toBeGreaterThanOrEqual(2);
    expect(second.length).toBeGreaterThanOrEqual(2);
    for (const k of [...first, ...second]) {
      expect(k.slice(1, 5)).toEqual([
        "00000000-0000-4000-8000-0000000000a1",
        owner,
        "synergy_2026",
        findingRowId,
      ]);
      expect(k[5]).toMatch(/^mount-/);
    }
    const viewFirst = first.find((k) => k[0] === "citation-for-review")!;
    const viewSecond = second.find((k) => k[0] === "citation-for-review")!;
    const reviewsFirst = first.find((k) => k[0] === "citation-reviews")!;
    expect(viewFirst[5]).not.toBe(viewSecond[5]); // a remount never shares the previous mount's entries
    expect(reviewsFirst[5]).toBe(viewFirst[5]); // both reads of ONE mount share its token
  });
  it("withheld finding: shows the withheld notice, never a fabricated record", () => {
    h.queries = {
      "citation-for-review": ok({
        ...view,
        record: null,
        recordSha256: null,
        inspectionComplete: false,
      }),
      "citation-reviews": ok(receiptPage(false)),
    };
    const html = renderReviewer();
    expect(html).toContain("citationReview.reviewer.withheld");
    expect(html).not.toContain("citationReview.record.observation");
    expect(html).not.toContain("<details");
  });
});

describe("owner live accuracy resolution", () => {
  it("renders the recorded judgement and the live resolution from the real contract fields", () => {
    const entries: CitationAccuracyResolution[] = [
      {
        claimSpan: "Open until 20:00 on weekdays",
        factKind: "opening_hours",
        humanStatus: "accurate_at_capture",
        factId: "00000000-0000-4000-8000-0000000000f1",
        factVersion: 2,
        factRowId: "00000000-0000-4000-8000-0000000000f2",
        captureEvidenceId: "00000000-0000-4000-8000-0000000000e1",
        capturedAt: "2026-09-01T10:00:00.000000Z",
        resolution: "superseded_correction",
      },
    ];
    const html = renderToStaticMarkup(createElement(AccuracyResolutionList, { entries }));
    expect(html).toContain("Open until 20:00 on weekdays");
    expect(html).toContain("accurate_at_capture");
    expect(html).toContain("citationReview.resolution.superseded_correction");
    expect(html).toContain("2026-09-01");
    expect(html).not.toContain("undefined");
    expect(renderToStaticMarkup(createElement(AccuracyResolutionList, { entries: [] }))).toBe("");
  });
});
