import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { analyzeAnswer, type EvidencePrompt, type AnswerEvidence } from "@/lib/answer-evidence";
const h = vi.hoisted(() => ({ state: { prompts: [] as unknown[], answers: [] as unknown[] } }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: "00000000-0000-4000-8000-000000000001" } }),
}));
vi.mock("@/i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: h.state, isError: false, isPending: false, refetch: vi.fn() }),
}));
vi.mock("@/lib/answer-evidence.functions", () => ({
  readAnswerEvidenceFn: vi.fn(),
  saveEvidencePromptFn: vi.fn(),
  importAnswerEvidenceFn: vi.fn(),
  removeAnswerEvidenceFn: vi.fn(),
}));
import { AnswerEvidencePanel } from "./AnswerEvidencePanel";
describe("integrated answer evidence rendering", () => {
  it("renders empty state without fabricated observations", () => {
    h.state = { prompts: [], answers: [] };
    const html = renderToStaticMarkup(createElement(AnswerEvidencePanel, { projectId: "p" }));
    expect(html).toContain("answer.empty");
    expect(html).toContain("answer.help");
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
    const html = renderToStaticMarkup(createElement(AnswerEvidencePanel, { projectId: "p" }));
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("1/1");
    expect(html).toContain("answer.unknown");
    expect(html).toContain("answer.unverified");
    expect(html).not.toContain('href="https://example.com');
  });
});
