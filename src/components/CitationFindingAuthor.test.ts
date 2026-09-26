/**
 * Static-markup regressions (supporting evidence only, node env, no DOM): the owner authoring surfaces render
 * honest empty/blocked states and expose the real controls. Clicks, saves and conflicts are exercised in the
 * isolated browser harness (.coordination/harness) and by the PGlite/server tests, not here.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PanelProtocol } from "@/lib/citation-panel";

type Q = {
  data?: unknown;
  isError: boolean;
  isSuccess: boolean;
  isPending: boolean;
  isFetching: boolean;
  refetch: () => void;
};
const h = vi.hoisted(() => ({ queries: {} as Record<string, unknown> }));
// The key is echoed, followed by the interpolation values so raw stored data (instants, versions) can be asserted.
vi.mock("@/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    vars ? `${key} ${Object.values(vars).join(" ")}` : key,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) =>
    (h.queries[queryKey[0]] as Q | undefined) ?? {
      data: undefined,
      isError: false,
      isSuccess: false,
      isPending: true,
      isFetching: true,
      refetch: vi.fn(),
    },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/answer-evidence.functions", () => ({ readAnswerEvidenceFn: vi.fn() }));
vi.mock("@/lib/citation-protocol.functions", () => ({
  readCitationProtocolFn: vi.fn(),
  saveCitationPanelDraftFn: vi.fn(),
  lockCitationPanelFn: vi.fn(),
}));
vi.mock("@/lib/project-knowledge.functions", () => ({ readProjectKnowledgeFn: vi.fn() }));
vi.mock("@/lib/citation-business-fact.functions", () => ({
  readCitationBusinessFactsFn: vi.fn(),
  saveCitationBusinessFactFn: vi.fn(),
  removeCitationBusinessFactFn: vi.fn(),
}));
vi.mock("@/lib/citation-record.functions", () => ({
  getCitationFindingFn: vi.fn(),
  readCitationFindingsFn: vi.fn(),
  saveCitationFindingFn: vi.fn(),
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
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: "00000000-0000-4000-8000-000000000001" } }),
}));
vi.mock("./ui/select", async () => {
  const { createElement: el } = await import("react");
  const box = (name: string) => (p: { children?: React.ReactNode }) =>
    el("div", { "data-sel": name }, p.children);
  return {
    Select: box("root"),
    SelectContent: box("content"),
    SelectItem: box("item"),
    SelectTrigger: box("trigger"),
    SelectValue: () => null,
  };
});
import { CitationFindingAuthor } from "./CitationFindingAuthor";
import { CitationPanelProtocolPanel } from "./CitationPanelProtocolPanel";
import { CitationBusinessFactsPanel } from "./CitationBusinessFactsPanel";
import {
  authoringIdentity,
  authoringReducer,
  draftFromRecord,
  draftToFinding,
  emptySupport,
  initialAuthoringState,
  newFindingDraft,
  type AuthoringState,
} from "@/lib/citation-authoring";

const owner = "00000000-0000-4000-8000-000000000001";
const ok = (data: unknown): Q => ({
  data,
  isError: false,
  isSuccess: true,
  isPending: false,
  isFetching: false,
  refetch: vi.fn(),
});
const errored = (): Q => ({
  data: undefined,
  isError: true,
  isSuccess: false,
  isPending: false,
  isFetching: false,
  refetch: vi.fn(),
});
const lockedPanel: PanelProtocol = {
  panelId: "40000000-0000-4000-8000-000000000001",
  version: 2,
  kind: "brand",
  client: { name: "Acme", market: "SE" },
  questionLanguage: "sv-SE",
  interfaceLanguage: "sv-SE",
  surface: {
    service: "ChatGPT",
    interface: "web",
    mode: "consumer-web",
    searchMode: null,
    modelLabel: null,
    webSearchEvidenced: "unknown",
  },
  session: {
    freshSession: true,
    personalisation: "non_personalised",
    signedIn: "signed_out",
    memory: "off",
    customInstructions: "none",
    connectedTools: "none",
    extraInstruction: null,
    priorMessages: 0,
  },
  collection: { country: null, city: null, devicePermission: "unknown", vpn: null },
  questions: [
    {
      id: "AC-B01",
      promptId: "20000000-0000-4000-8000-000000000001",
      promptRevision: 1,
      text: "Q?",
      language: "sv-SE",
    },
  ],
  rounds: 0,
  status: "locked",
  approval: { approvedBy: owner, approvedAt: "2026-09-26T10:00:00.000Z" },
};
const draftPanel: PanelProtocol = {
  ...lockedPanel,
  panelId: "40000000-0000-4000-8000-000000000002",
  version: 1,
  status: "draft",
  approval: null,
};
const props = { projectId: "p", ownerId: owner };

describe("panel draft/lock surface", () => {
  it("lists a locked and a draft head; only the draft offers revise + review-and-lock; no auto-lock", () => {
    h.queries = {
      "citation-protocol": ok({ panels: [lockedPanel, draftPanel], brandRuns: [], answers: [] }),
      "answer-evidence": ok({
        prompts: [
          {
            id: "20000000-0000-4000-8000-000000000001",
            revision: 1,
            createdAt: "x",
            data: { prompt: "Q?", language: "sv-SE" },
          },
        ],
        answers: [],
      }),
    };
    const html = renderToStaticMarkup(
      createElement(CitationPanelProtocolPanel, {
        ...props,
        seed: { clientName: "Acme", market: "SE", language: "sv-SE" },
      }),
    );
    expect(html).toContain("citationAuthoring.panels.status.locked");
    expect(html).toContain("citationAuthoring.panels.status.draft");
    expect(html).toContain("citationAuthoring.panels.reviewLock");
    expect(html).toContain("citationAuthoring.panels.edit");
    expect(html).toContain("citationAuthoring.panels.new");
    expect(html).not.toContain("citationAuthoring.panels.lockConfirmTitle"); // confirmation only after an explicit click
  });
  // Codex B2: the review-and-lock region and the inspect toggle show the EXACT stored version, not a summary.
  const tenQuestions = Array.from({ length: 10 }, (_, i) => ({
    id: `AC-D${String(i + 1).padStart(2, "0")}`,
    promptId: `20000000-0000-4000-8000-0000000000${String(i + 1).padStart(2, "0")}`,
    promptRevision: i === 3 ? 2 : 1,
    text: `Distinct question number ${i + 1} about massage in Malmö?`,
    language: "sv-SE",
  }));
  const discoveryDraft: PanelProtocol = {
    ...draftPanel,
    panelId: "40000000-0000-4000-8000-000000000003",
    kind: "discovery",
    questionLanguage: "sv-SE",
    interfaceLanguage: "en-GB",
    surface: {
      service: "ChatGPT",
      interface: "web",
      mode: "search",
      searchMode: "web",
      modelLabel: "GPT-5 Thinking",
      webSearchEvidenced: "evidenced",
    },
    session: {
      freshSession: true,
      personalisation: "personalised",
      signedIn: "signed_in",
      memory: "on",
      customInstructions: "present",
      connectedTools: "present",
      accountTier: "Plus",
      extraInstruction: null,
      priorMessages: 0,
    },
    collection: { country: "Sweden", city: "Malmö", devicePermission: "denied", vpn: true },
    questions: tenQuestions,
    rounds: 4,
    schedule: {
      timezone: "Europe/Stockholm",
      slots: [1, 2, 3, 4].map((r) => ({
        round: r,
        intendedAt: `2027-01-${String(4 + 7 * (r - 1)).padStart(2, "0")}T09:00:00.000Z`,
      })),
    },
  };
  const apiPanel: PanelProtocol = {
    ...lockedPanel,
    panelId: "40000000-0000-4000-8000-000000000004",
    surface: { ...lockedPanel.surface, mode: "api" },
  };
  const prompts = ok({
    prompts: tenQuestions.map((q) => ({
      id: q.promptId,
      revision: q.promptRevision,
      createdAt: "x",
      data: { prompt: q.text, language: "sv-SE" },
    })),
    answers: [],
  });
  it("review-and-lock shows every stored question (text + prompt revision), languages, true mode/model/search, session, location and the schedule; no auto-lock", () => {
    h.queries = {
      "citation-protocol": ok({ panels: [discoveryDraft], brandRuns: [], answers: [] }),
      "answer-evidence": prompts,
    };
    const html = renderToStaticMarkup(
      createElement(CitationPanelProtocolPanel, {
        ...props,
        seed: { clientName: "Acme", market: "SE", language: "sv-SE" },
        initialView: { lockCandidate: `${discoveryDraft.panelId}:1` },
      }),
    );
    expect(html).toContain('role="region"');
    expect(html).toContain("aria-labelledby=");
    expect(html).toContain("citationAuthoring.panels.reviewRegion");
    expect(html).toContain("citationAuthoring.panels.lockConfirmTitle");
    for (const q of tenQuestions) expect(html).toContain(q.text);
    expect(html).toContain("AC-D04");
    expect(html).toContain("citationAuthoring.panels.detail.revision"); // every question shows prompt id + revision
    expect(html).toContain("en-GB");
    expect(html).toContain("citationAuthoring.panels.surface.mode.search"); // the TRUE stored mode
    expect(html).toContain("GPT-5 Thinking");
    expect(html).toContain("citationAuthoring.option.evidenced");
    expect(html).toContain("citationAuthoring.option.personalised");
    expect(html).toContain("citationAuthoring.option.signed_in");
    expect(html).toContain("citationAuthoring.option.on");
    expect(html).toContain("citationAuthoring.option.present");
    expect(html).toContain("Plus");
    expect(html).toContain("Malmö");
    expect(html).toContain("citationAuthoring.option.denied");
    expect(html).toContain("Europe/Stockholm");
    expect(html).toContain("2027-01-25 10:00"); // round 4 as Stockholm wall-clock…
    expect(html).toContain("2027-01-25T09:00:00.000Z"); // …beside the exact stored instant
    expect(html).toContain("citationAuthoring.panels.lock"); // explicit Approve and lock…
    expect(html).toContain("citationAuthoring.common.cancel"); // …and Cancel; nothing is called at render
    expect(html).toMatch(/citationAuthoring\.panels\.lockConfirmBody/);
  });
  it("an already-locked head can be inspected read-only and an api mode is shown as api, never rewritten", () => {
    h.queries = {
      "citation-protocol": ok({ panels: [apiPanel], brandRuns: [], answers: [] }),
      "answer-evidence": prompts,
    };
    const html = renderToStaticMarkup(
      createElement(CitationPanelProtocolPanel, {
        ...props,
        seed: { clientName: "Acme", market: "SE", language: "sv-SE" },
        initialView: { inspect: `${apiPanel.panelId}:2` },
      }),
    );
    expect(html).toContain("citationAuthoring.panels.hideDetail");
    expect(html).toContain("citationAuthoring.panels.detail.title");
    expect(html).toContain("citationAuthoring.panels.surface.mode.api");
    expect(html).not.toContain("citationAuthoring.panels.surface.mode.consumer-web");
    expect(html).toContain("citationAuthoring.panels.detail.noSchedule");
    expect(html).toContain("2026-09-26T10:00:00.000Z"); // the server-minted approval instant, verbatim
    expect(html).not.toContain('role="region"'); // no lock review for a locked head
    expect(html).not.toContain("citationAuthoring.panels.reviewLock");
  });
  it("without an explicit review click nothing is under review and heads only offer Inspect", () => {
    h.queries = {
      "citation-protocol": ok({ panels: [discoveryDraft, apiPanel], brandRuns: [], answers: [] }),
      "answer-evidence": prompts,
    };
    const html = renderToStaticMarkup(
      createElement(CitationPanelProtocolPanel, {
        ...props,
        seed: { clientName: "Acme", market: "SE", language: "sv-SE" },
      }),
    );
    expect(html).not.toContain('role="region"');
    expect(html).not.toContain("citationAuthoring.panels.lockConfirmTitle");
    expect(html).toContain("citationAuthoring.panels.inspect");
    expect(html).not.toContain(tenQuestions[9].text); // collapsed until Inspect / Review
  });
  it("renders an honest error when the protocol read fails", () => {
    h.queries = {
      "citation-protocol": errored(),
      "answer-evidence": ok({ prompts: [], answers: [] }),
    };
    const html = renderToStaticMarkup(
      createElement(CitationPanelProtocolPanel, {
        ...props,
        seed: { clientName: "Acme", market: "SE", language: "sv-SE" },
      }),
    );
    expect(html).toContain("citationAuthoring.panels.error");
    expect(html).not.toContain("citationAuthoring.panels.new");
  });
});

describe("dated business facts surface", () => {
  it("shows the head version per fact with correct/delete/history controls and a New fact action", () => {
    h.queries = {
      "citation-business-facts": ok({
        facts: [
          {
            id: "b1000001-0000-4000-8000-000000000001",
            version: 1,
            supersedesId: null,
            predecessorDeleted: false,
            createdAt: "2026-01-01T00:00:00Z",
            record: {
              factId: "a1000000-0000-4000-8000-000000000001",
              kind: "price",
              value: "500 SEK",
              confirmedBy: owner,
              confirmedAt: "2026-01-01T00:00:00Z",
              validFrom: "2026-01-01T00:00:00Z",
              validUntil: null,
            },
          },
          {
            id: "b1000002-0000-4000-8000-000000000001",
            version: 2,
            supersedesId: "b1000001-0000-4000-8000-000000000001",
            predecessorDeleted: false,
            createdAt: "2026-06-01T00:00:00Z",
            record: {
              factId: "a1000000-0000-4000-8000-000000000001",
              kind: "price",
              value: "550 SEK",
              confirmedBy: owner,
              confirmedAt: "2026-06-01T00:00:00Z",
              validFrom: "2026-06-01T00:00:00Z",
              validUntil: null,
            },
          },
        ],
      }),
    };
    const html = renderToStaticMarkup(createElement(CitationBusinessFactsPanel, props));
    expect(html).toContain("550 SEK");
    expect(html).not.toContain(">500 SEK<"); // history is collapsed until opened
    expect(html).toContain("citationAuthoring.facts.correct");
    expect(html).toContain("citationAuthoring.facts.removeVersion");
    expect(html).toContain("citationAuthoring.facts.history");
    expect(html).toContain("citationAuthoring.facts.new");
  });
  it("distinguishes empty from failed reads", () => {
    h.queries = { "citation-business-facts": ok({ facts: [] }) };
    expect(renderToStaticMarkup(createElement(CitationBusinessFactsPanel, props))).toContain(
      "citationAuthoring.facts.empty",
    );
    h.queries = { "citation-business-facts": errored() };
    const html = renderToStaticMarkup(createElement(CitationBusinessFactsPanel, props));
    expect(html).toContain("citationAuthoring.facts.error");
    expect(html).not.toContain("citationAuthoring.facts.empty");
  });
});

describe("finding author surface", () => {
  it("blocks authoring until a locked panel exists (no scope → no new-finding path) and says why", () => {
    h.queries = {
      "citation-protocol": ok({ panels: [draftPanel], brandRuns: [], answers: [] }),
      "answer-evidence": ok({ prompts: [], answers: [] }),
      "project-knowledge": ok({ sources: [], records: [] }),
      "citation-business-facts": ok({ facts: [] }),
      "citation-findings": ok({ findings: [] }),
    };
    const html = renderToStaticMarkup(createElement(CitationFindingAuthor, props));
    expect(html).toContain("citationAuthoring.author.scopeNone");
    expect(html).toContain("citationAuthoring.author.new");
    expect(html).toContain("disabled");
  });
  it("offers both families once a locked scope exists and the edit picker when findings exist, with provenance", () => {
    h.queries = {
      "citation-protocol": ok({ panels: [lockedPanel], brandRuns: [], answers: [] }),
      "answer-evidence": ok({ prompts: [], answers: [] }),
      "project-knowledge": ok({ sources: [], records: [] }),
      "citation-business-facts": ok({ facts: [] }),
      "citation-findings": ok({
        findings: [
          {
            id: "60000000-0000-4000-8000-000000000001",
            findingId: "61000000-0000-4000-8000-000000000001",
            version: 1,
            family: "citation_source",
            decision: "needs_second_review",
            panelId: lockedPanel.panelId,
            panelVersion: 2,
            client: lockedPanel.client,
            actorId: owner,
            reviewerId: owner,
            supersedesId: null,
            predecessorDeleted: false,
            createdAt: "2026-09-26T10:00:00Z",
            sourceAvailable: true,
            accuracyStatus: "none",
            reviewStatus: "second_review_pending",
            scopeEnforcedAt: null,
          },
        ],
      }),
    };
    const html = renderToStaticMarkup(createElement(CitationFindingAuthor, props));
    expect(html).toContain("citationReview.family.citation_source");
    expect(html).toContain("citationReview.family.recommendation_accuracy");
    expect(html).not.toContain("citationAuthoring.author.scopeNone");
    expect(html).toContain("citationAuthoring.author.editExisting");
    expect(html).toContain("citationAuthoring.binding.legacy");
  });
  const findingRow = (
    id: string,
    version: number,
    findingId = "61000000-0000-4000-8000-000000000001",
  ) => ({
    id,
    findingId,
    version,
    family: "citation_source" as const,
    decision: "needs_second_review" as const,
    panelId: lockedPanel.panelId,
    panelVersion: 2,
    client: lockedPanel.client,
    actorId: owner,
    reviewerId: owner,
    supersedesId: null,
    predecessorDeleted: false,
    createdAt: `2026-09-2${version}T10:00:00Z`,
    sourceAvailable: true,
    accuracyStatus: "none" as const,
    reviewStatus: "second_review_pending" as const,
    scopeEnforcedAt: "2026-09-26T10:00:00Z",
  });
  it("the edit picker offers only the HEAD of each finding, never a historical version", () => {
    h.queries = {
      "citation-protocol": ok({ panels: [lockedPanel], brandRuns: [], answers: [] }),
      "answer-evidence": ok({ prompts: [], answers: [] }),
      "project-knowledge": ok({ sources: [], records: [] }),
      "citation-business-facts": ok({ facts: [] }),
      "citation-findings": ok({
        findings: [
          findingRow("60000000-0000-4000-8000-000000000001", 1),
          findingRow("60000000-0000-4000-8000-000000000002", 2),
        ],
      }),
    };
    const html = renderToStaticMarkup(createElement(CitationFindingAuthor, props));
    expect(html).toContain('value="60000000-0000-4000-8000-000000000002"');
    expect(html).not.toContain('value="60000000-0000-4000-8000-000000000001"');
    expect(html).toContain("v2");
  });
  // Reviewed-stage renders from a reducer state (the component's test seam): the conflict box offers the
  // "continue on top of version N" consent ONLY when the current head record could be shown and validated.
  const reviewedState = (conflictRecord: "valid" | "invalid" | null): AuthoringState => {
    const d = newFindingDraft("61000000-0000-4000-8000-000000000001", "citation_source");
    d.scope = { panelId: lockedPanel.panelId, panelVersion: 2, client: lockedPanel.client };
    d.answerId = "10000000-0000-4000-8000-000000000001";
    d.observation = "Observed.";
    let s = authoringReducer(initialAuthoringState(authoringIdentity(owner, "p")), {
      type: "startNew",
      draft: d,
    });
    s = authoringReducer(s, {
      type: "review",
      ownerId: owner,
      nowIso: "2026-09-26T10:00:00.000Z",
      answerCapturedAt: "2026-09-10T09:00:00Z",
    });
    if (conflictRecord === null) return s;
    s = authoringReducer(s, { type: "saveStarted" });
    s = authoringReducer(s, { type: "saveFailed", code: "citation_finding_version_conflict" });
    const built = draftToFinding(d, owner, "2026-09-26T09:00:00.000Z", "2026-09-10T09:00:00Z");
    if (!built.ok) throw new Error(built.issues.join());
    return authoringReducer(s, {
      type: "conflictLoaded",
      head: {
        id: "60000000-0000-4000-8000-000000000002",
        version: 2,
        record: conflictRecord === "valid" ? built.finding : null,
      },
    });
  };
  const withAnswer = () => {
    h.queries = {
      "citation-protocol": ok({ panels: [lockedPanel], brandRuns: [], answers: [] }),
      "answer-evidence": ok({
        prompts: [],
        answers: [
          {
            id: "10000000-0000-4000-8000-000000000001",
            createdAt: "2026-09-10T09:00:00Z",
            hash: "a".repeat(64),
            input: {
              promptId: "20000000-0000-4000-8000-000000000001",
              promptRevision: 1,
              surface: "ChatGPT web",
              mode: "consumer-web",
              method: "manual",
              modelVersion: null,
              capturedAt: "2026-09-10T09:00:00Z",
              status: "complete",
              rawAnswer: "x",
              citations: [],
              citationsComplete: true,
              failure: null,
              reportedCostUsd: null,
              sourceUrl: null,
              supersedesId: null,
            },
            prompt: {
              id: "20000000-0000-4000-8000-000000000001",
              revision: 1,
              createdAt: "x",
              data: { prompt: "Q?", language: "sv-SE" },
            },
            analysis: null,
          },
        ],
      }),
      "project-knowledge": ok({ sources: [], records: [] }),
      "citation-business-facts": ok({ facts: [] }),
      "citation-findings": ok({ findings: [] }),
    };
  };
  it("review stage renders the FROZEN reviewed record and the save for version 1", () => {
    withAnswer();
    const html = renderToStaticMarkup(
      createElement(CitationFindingAuthor, { ...props, initialState: reviewedState(null) }),
    );
    expect(html).toContain("citationAuthoring.author.review");
    expect(html).toContain("Observed.");
    expect(html).toContain("citationAuthoring.author.save");
    expect(html).not.toContain("citationAuthoring.author.conflictTitle");
  });
  it("a conflict whose current head is valid offers the explicit continue consent with the head shown", () => {
    withAnswer();
    const html = renderToStaticMarkup(
      createElement(CitationFindingAuthor, { ...props, initialState: reviewedState("valid") }),
    );
    expect(html).toContain("citationAuthoring.saveError.versionConflict");
    expect(html).toContain("citationAuthoring.author.conflictTitle");
    expect(html).toContain("citationAuthoring.author.conflictContinue");
    expect(html).not.toContain("citationAuthoring.author.conflictUnavailable");
  });
  it("a conflict whose current head cannot be shown/validated explains and offers NO continue consent; the draft stays", () => {
    withAnswer();
    const html = renderToStaticMarkup(
      createElement(CitationFindingAuthor, { ...props, initialState: reviewedState("invalid") }),
    );
    expect(html).toContain("citationAuthoring.author.conflictTitle");
    expect(html).toContain("citationAuthoring.author.conflictUnavailable");
    expect(html).not.toContain("citationAuthoring.author.conflictContinue");
    expect(html).toContain("Observed."); // the owner's reviewed draft is still there
    expect(html).toContain("citationAuthoring.author.save");
  });
  it("reopened source timestamps are visible in the UTC control and the exact stored form is shown when it differs (Codex B1)", () => {
    withAnswer();
    const d = newFindingDraft("61000000-0000-4000-8000-000000000001", "citation_source");
    d.scope = { panelId: lockedPanel.panelId, panelVersion: 2, client: lockedPanel.client };
    d.answerId = "10000000-0000-4000-8000-000000000001";
    d.observation = "Observed.";
    d.support = [
      {
        ...emptySupport(),
        claimSpan: "a",
        citedUrl: "https://x.example/a",
        status: "supports",
        sourcePassage: "p",
        sourceCapturedAt: "2026-09-10T09:30:00Z",
      },
      {
        ...emptySupport(),
        claimSpan: "b",
        citedUrl: "https://x.example/b",
        status: "supports",
        sourcePassage: "p",
        sourceCapturedAt: "2026-09-10T11:30:00.123456+02:00",
      },
    ];
    const built = draftToFinding(d, owner, "2026-09-26T10:00:00.000Z", "2026-09-10T09:00:00Z");
    if (!built.ok) throw new Error(built.issues.join());
    // Reopen exactly as startEdit does (from the stored record), then render the edit stage.
    const reopened = draftFromRecord(built.finding, d.scope!, {
      id: "60000000-0000-4000-8000-000000000002",
      version: 1,
    });
    const state = authoringReducer(initialAuthoringState(authoringIdentity(owner, "p")), {
      type: "startEdit",
      draft: reopened,
    });
    const html = renderToStaticMarkup(
      createElement(CitationFindingAuthor, { ...props, initialState: state }),
    );
    // Both instants are visible as UTC wall-clock in a seconds-capable datetime-local control…
    expect(html.match(/type="datetime-local" step="1" value="2026-09-10T09:30:00"/g)?.length).toBe(
      2,
    );
    expect(html).not.toContain('value="2026-09-10T09:30:00Z"'); // no undisplayable raw ISO in the control
    expect(html).toContain("citationAuthoring.author.utcInstant");
    // …and the offset/microsecond form is shown verbatim next to its control (kept unless edited).
    expect(html).toContain("2026-09-10T11:30:00.123456+02:00");
    expect(html.match(/citationAuthoring\.author\.storedInstant/g)?.length).toBe(1);
  });
  it("a state started under another owner/project identity is never rendered under this one", () => {
    withAnswer();
    const foreign = { ...reviewedState(null), identity: authoringIdentity(owner, "other-project") };
    const html = renderToStaticMarkup(
      createElement(CitationFindingAuthor, { ...props, initialState: foreign }),
    );
    expect(html).not.toContain("Observed.");
    expect(html).toContain("citationAuthoring.author.new");
  });
});
