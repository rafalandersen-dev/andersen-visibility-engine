import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyzeAnswer,
  evidenceCohorts,
  type EvidencePrompt,
  type AnswerEvidence,
  type EvidenceFocus,
} from "@/lib/answer-evidence";
const h = vi.hoisted(() => ({
  state: { prompts: [] as unknown[], answers: [] as unknown[] },
  query: {} as Record<string, unknown>,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: "00000000-0000-4000-8000-000000000001" } }),
}));
vi.mock("@/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key} ${JSON.stringify(vars)}` : key,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: h.state,
    isError: false,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
    ...h.query,
  }),
}));
const fns = vi.hoisted(() => ({
  readAnswerEvidenceFn: vi.fn(),
  saveEvidencePromptFn: vi.fn(),
  importAnswerEvidenceFn: vi.fn(),
  removeAnswerEvidenceFn: vi.fn(),
}));
vi.mock("@/lib/answer-evidence.functions", () => fns);
import { AnswerEvidencePanel } from "./AnswerEvidencePanel";
const render = (initialFocus?: EvidenceFocus) =>
  renderToStaticMarkup(createElement(AnswerEvidencePanel, { projectId: "p", initialFocus }));
beforeEach(() => {
  h.query = {};
  for (const fn of Object.values(fns)) fn.mockClear();
});
describe("integrated answer evidence rendering", () => {
  it("renders empty state without fabricated observations", () => {
    h.state = { prompts: [], answers: [] };
    const html = render();
    expect(html).toContain("answer.empty");
    expect(html).toContain("answer.help");
    expect(html).toContain("answerCoverage.noneInWindow");
    expect(html).not.toContain("answerCoverage.count");
    expect(html).not.toContain("<pre");
  });
  it("escapes hostile raw evidence and displays separate denominators and unknown cost", () => {
    const prompt: EvidencePrompt = {
      id: "00000000-0000-4000-8000-000000000003",
      revision: 1,
      createdAt: "2026-08-01T00:00:00Z",
      data: {
        prompt: "Synthetic prompt <script>x</script>",
        intent: "discovery",
        source: "manual",
        market: "SE",
        language: "sv",
        brand: "Milo",
        websiteUrl: "https://example.com",
        competitorUrls: [],
        active: true,
      },
    };
    const input: AnswerEvidence = {
      promptId: prompt.id,
      promptRevision: 1,
      surface: "Synthetic",
      mode: "api",
      method: "fixture",
      modelVersion: null,
      capturedAt: "2026-08-01T00:00:00Z",
      status: "complete",
      rawAnswer: "Milo <img src=x onerror=bad()>",
      citations: ["https://example.com"],
      citationsComplete: false,
      failure: null,
      reportedCostUsd: null,
      sourceUrl: null,
      supersedesId: null,
    };
    h.state = {
      prompts: [prompt],
      answers: [
        {
          id: "00000000-0000-4000-8000-000000000004",
          createdAt: "2026-08-01",
          hash: "a".repeat(64),
          input,
          prompt,
          analysis: analyzeAnswer(input, prompt),
        },
      ],
    };
    const html = render();
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("1/1");
    expect(html).toContain("answer.unknown");
    expect(html).toContain("answer.unverified");
    expect(html).not.toContain('href="https://example.com');
    // An incomplete citation list is no measured zero: n=0 is unknown, and the exclusion stays visible.
    expect(html).toContain("answerCoverage.noEligible");
    expect(html).not.toContain("answerCoverage.count");
    expect(html).toContain('data-quality="incompleteCitations"');
  });
});

describe("domain coverage and exact drill-down (CG-03A)", () => {
  const prompt: EvidencePrompt = {
    id: "abcdef00-0000-4000-8000-0000000000c1",
    revision: 2,
    createdAt: "2026-08-01T00:00:00Z",
    data: {
      prompt: "Who cleans after renovation in Gdańsk?",
      intent: "discovery",
      source: "manual",
      market: "PL",
      language: "pl",
      brand: "Jasny Dom",
      websiteUrl: "https://jasny-dom.example.com",
      competitorUrls: ["https://rival.example.org", "https://www.rival.example.org/x"],
      active: true,
    },
  };
  const base: AnswerEvidence = {
    promptId: prompt.id,
    promptRevision: 2,
    surface: "Synthetic surface",
    mode: "consumer-web",
    method: "manual copy v1",
    modelVersion: "synthetic-v1",
    capturedAt: "2026-08-10T12:00:00Z",
    status: "complete",
    rawAnswer: "Jasny Dom",
    citations: [],
    citationsComplete: true,
    failure: null,
    reportedCostUsd: null,
    sourceUrl: null,
    supersedesId: null,
  };
  const ids = {
    own: "aaaaaaaa-0000-4000-8000-0000000000a1",
    rival: "bbbbbbbb-0000-4000-8000-0000000000b2",
    empty: "cccccccc-0000-4000-8000-0000000000c3",
    failed: "dddddddd-0000-4000-8000-0000000000d4",
    old: "eeeeeeee-0000-4000-8000-0000000000e5",
  };
  const answer = (id: string, change: Partial<AnswerEvidence>) => {
    const input = { ...base, ...change };
    return {
      id,
      createdAt: "2026-08-10",
      hash: "b".repeat(64),
      input,
      prompt,
      analysis: analyzeAnswer(input, prompt),
    };
  };
  const answers = [
    answer(ids.old, { citations: ["https://jasny-dom.example.com/old"] }),
    // Corrects `old` through an UPPERCASE reference to its lowercase stored id.
    answer(ids.own, {
      citations: ["https://jasny-dom.example.com/a", "https://jasny-dom.example.com/b"],
      supersedesId: ids.old.toUpperCase(),
    }),
    answer(ids.rival, { citations: ["https://rival.example.org/p"] }),
    answer(ids.empty, { citations: [] }),
    answer(ids.failed, { status: "failed", rawAnswer: "", failure: "Unavailable" }),
  ];
  const key = () =>
    evidenceCohorts(
      answers as Parameters<typeof evidenceCohorts>[0],
      "2020-01-01T00:00:00Z",
      "2030-01-01T00:00:00Z",
    )[0].key;
  beforeEach(() => {
    h.state = { prompts: [prompt], answers };
  });

  it("shows x of the same n per declared domain, the source of the numbers and the quality split", () => {
    const html = render();
    expect(html).toContain("answerCoverage.source {&quot;n&quot;:3}");
    expect(html).toContain('data-domain="jasny-dom.example.com" data-present="1"');
    expect(html).toContain('data-domain="rival.example.org" data-present="1"');
    expect(html.match(/answerCoverage\.count \{&quot;x&quot;:1,&quot;n&quot;:3\}/g)).toHaveLength(
      2,
    );
    // Duplicate competitor declarations collapse to one row.
    expect(html.match(/data-domain="rival.example.org"/g)).toHaveLength(1);
    expect(html).toContain('data-quality-total="4"');
    expect(html).toContain("answerCoverage.quality.eligible {&quot;count&quot;:3}");
    expect(html).toContain("answerCoverage.quality.failed {&quot;count&quot;:1}");
    expect(html).toContain("answerCoverage.quality.truncated {&quot;count&quot;:0}");
    // Keyboard-operable native buttons, none pressed before a selection.
    expect(html).toContain("answerCoverage.showPresent");
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).not.toContain("data-evidence-focus");
  });

  it("failed and truncated answers with complete citation lists render as unknown, not as counts", () => {
    h.state = {
      prompts: [prompt],
      answers: [
        answer(ids.failed, {
          status: "failed",
          rawAnswer: "",
          failure: "Unavailable",
          citations: ["https://jasny-dom.example.com/a"],
          citationsComplete: true,
        }),
        answer(ids.rival, {
          status: "truncated",
          failure: "Cut off",
          citations: ["https://rival.example.org/p"],
          citationsComplete: true,
        }),
      ],
    };
    const html = render();
    expect(html).toContain("answerCoverage.noEligible");
    expect(html).toContain('data-domain-coverage="0"');
    expect(html).not.toContain("answerCoverage.count");
    expect(html).not.toContain("data-domain=");
    // The exclusions stay visible and inspectable.
    expect(html).toContain("answerCoverage.quality.failed {&quot;count&quot;:1}");
    expect(html).toContain("answerCoverage.quality.truncated {&quot;count&quot;:1}");
  });

  it("controls naming a long host wrap instead of overflowing a phone screen", () => {
    const host = `${"a".repeat(63)}.${"b".repeat(40)}.example.com`;
    const long = { ...prompt, data: { ...prompt.data, competitorUrls: [`https://${host}`] } };
    const input = { ...base, citations: [`https://${host}/x`] };
    h.state = {
      prompts: [long],
      answers: [
        { ...answer(ids.rival, {}), input, prompt: long, analysis: analyzeAnswer(input, long) },
      ],
    };
    const html = render();
    const button =
      /<button[^>]*class="([^"]*)"[^>]*>answerCoverage\.showPresent \{&quot;host&quot;:&quot;a{63}/.exec(
        html,
      );
    expect(button).not.toBeNull();
    const classes = button![1].split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(["whitespace-normal", "h-auto", "max-w-full"]));
    expect(classes).not.toContain("whitespace-nowrap");
    expect(classes).not.toContain("h-8");
    // The full host stays readable: no truncation class anywhere in the coverage block.
    expect(html).not.toMatch(/class="[^"]*\btruncate\b/);
    expect(html).toContain(host);
  });

  it("marks the predecessor of a mixed-case correction as superseded and keeps it out of counts", () => {
    const html = render();
    const summary = (id: string) => {
      const at = html.indexOf(id);
      return html.slice(html.lastIndexOf("<summary", at), at);
    };
    expect(summary(ids.old)).toContain("answer.superseded");
    expect(summary(ids.own)).not.toContain("answer.superseded");
    // The original stays in the full history.
    expect(html).toContain(ids.old);
  });

  it("a domain selection shows exactly its answer records and a clear control", () => {
    const html = render({ key: key(), kind: "present", host: "rival.example.org" });
    expect(html).toContain('data-evidence-focus="present"');
    expect(html).toContain("answerCoverage.showing");
    expect(html).toContain("answerCoverage.showAll");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(ids.rival);
    for (const other of [ids.own, ids.empty, ids.failed, ids.old])
      expect(html).not.toContain(other);
  });

  it("an excluded-quality selection keeps that evidence inspectable", () => {
    const html = render({ key: key(), kind: "failed" });
    expect(html).toContain(ids.failed);
    for (const other of [ids.own, ids.rival, ids.empty]) expect(html).not.toContain(other);
  });

  it("a selection outside the current result selects nothing and shows all records", () => {
    const html = render({ key: "stale", kind: "eligible" });
    expect(html).not.toContain("data-evidence-focus");
    expect(html).not.toContain('aria-pressed="true"');
    for (const id of Object.values(ids)) expect(html).toContain(id);
  });

  it("read errors and loading never render coverage numbers", () => {
    h.query = { isError: true };
    let html = render();
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("answerCoverage");
    h.query = { data: undefined, isPending: true };
    html = render();
    expect(html).toContain("answer.loading");
    expect(html).not.toContain("answerCoverage");
  });

  it("rendering and drilling down call no server function", () => {
    render();
    render({ key: key(), kind: "eligible" });
    for (const fn of Object.values(fns)) expect(fn).not.toHaveBeenCalled();
  });
});
