import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  analyzeAnswer,
  answerEvidenceSchema,
  evidenceCohorts,
  evidenceUrl,
  type AnswerEvidence,
  type EvidencePrompt,
  type EvidenceRow,
} from "./answer-evidence";
import {
  importAnswerEvidence,
  readAnswerEvidence,
  saveEvidencePrompt,
  removeAnswerEvidence,
} from "./answer-evidence.server";
import { answerEvidenceCopy } from "@/i18n/answer-evidence";
export const prompt: EvidencePrompt = {
  id: "00000000-0000-4000-8000-000000000003",
  revision: 1,
  createdAt: "2026-08-01T00:00:00+00:00",
  data: {
    prompt: "Synthetic fixture: which business?",
    intent: "discovery",
    source: "manual",
    market: "Sweden",
    language: "Swedish",
    brand: "Milo",
    websiteUrl: "https://example.com",
    competitorUrls: ["https://competitor.com"],
    active: true,
  },
};
export const input: AnswerEvidence = {
  promptId: prompt.id,
  promptRevision: 1,
  surface: "Synthetic test surface",
  mode: "consumer-web",
  method: "manual copy v1",
  modelVersion: "synthetic-v1",
  capturedAt: "2026-08-10T12:00:00Z",
  status: "complete",
  rawAnswer: "Milo is mentioned.",
  citations: ["https://example.com/page"],
  citationsComplete: true,
  failure: null,
  reportedCostUsd: null,
  sourceUrl: null,
  supersedesId: null,
};
function row(id: number, change: Partial<AnswerEvidence> = {}, p = prompt): EvidenceRow {
  const answer = { ...input, ...change };
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    createdAt: "2026-08-10T12:01:00Z",
    hash: "a".repeat(64),
    input: answer,
    prompt: p,
    analysis: analyzeAnswer(answer, p),
  };
}
describe("supplied answer evidence", () => {
  it.each([
    "http://127.1",
    "http://2130706433",
    "http://[::1]",
    "http://localhost",
    "https://x.local",
    "https://x.internal",
    "https://x.test",
    "https://a.com:444",
    "https://user:pass@a.com",
    "javascript:alert(1)",
    "data:text/html,x",
    "file:///tmp/a",
  ])("rejects unsafe URL %s", (url) => expect(evidenceUrl(url)).toBeNull());
  it("accepts ordinary public DNS names without fetching them", () =>
    expect(evidenceUrl("https://example.com/a?q=b")).toBe("https://example.com/a?q=b"));
  it("uses hostname boundaries and does not assume prose URLs are citations", () => {
    const a = analyzeAnswer(
      {
        ...input,
        rawAnswer: "Milo links https://example.com",
        citations: [
          "https://example.com.evil.com",
          "https://notexample.com",
          "https://sub.example.com",
          "https://competitor.com/a",
        ],
      },
      prompt,
    );
    expect(a.citations.map((c) => c.kind)).toEqual([
      "third-party",
      "third-party",
      "own",
      "competitor",
    ]);
    expect(analyzeAnswer({ ...input, citations: [] }, prompt).ownCitation).toBe(false);
  });
  it.each(["Milo", "MILO", "(Milo)", "Here is Milo."])("matches a literal brand %s", (rawAnswer) =>
    expect(analyzeAnswer({ ...input, rawAnswer }, prompt).mention).toBe(true),
  );
  it.each(["Milogram", "Amilo", "Miloż", "ąMilo"])("does not match a substring %s", (rawAnswer) =>
    expect(analyzeAnswer({ ...input, rawAnswer }, prompt).mention).toBe(false),
  );
  it("escapes regex punctuation in names", () => {
    const p = { ...prompt, data: { ...prompt.data, brand: "A+B (shop)" } };
    expect(analyzeAnswer({ ...input, rawAnswer: "A+B (shop)" }, p).mention).toBe(true);
    expect(analyzeAnswer({ ...input, rawAnswer: "AB shop" }, p).mention).toBe(false);
  });
  it("preserves raw content and renders it as text", () => {
    const rawAnswer = "<img src=x onerror=alert(1)>\n<script>bad()</script>";
    const a = answerEvidenceSchema.parse({ ...input, rawAnswer });
    expect(a.rawAnswer).toBe(rawAnswer);
    const html = renderToStaticMarkup(createElement("pre", null, a.rawAnswer));
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
  });
  it.each([
    { capturedAt: "2026-02-30T00:00:00Z" },
    { capturedAt: "2026-08-01T00:00:00" },
    { capturedAt: "2999-01-01T00:00:00Z" },
    { capturedAt: "2026-08-10T12:00:00+99:99" },
    { capturedAt: "2026-08-10T12:00:00+24:00" },
    { status: "complete", rawAnswer: " " },
    { status: "failed", failure: null },
    { status: "truncated", failure: "" },
    { status: "complete", failure: "failure" },
    { reportedCostUsd: NaN },
    { verified: true },
  ])("rejects malformed or contradictory input %#", (change) =>
    expect(answerEvidenceSchema.safeParse({ ...input, ...change }).success).toBe(false),
  );
  it("keeps unknown, failure and truncation out of denominators", () => {
    const rows = [
      row(1),
      row(2, { status: "failed", rawAnswer: "", failure: "Unavailable" }),
      row(3, { status: "truncated", failure: "Cut off" }),
      row(4, { rawAnswer: "Someone else", citations: [], citationsComplete: false }),
    ];
    const g = evidenceCohorts(rows, "2026-08-01", "2026-09-01")[0];
    expect(g).toMatchObject({
      total: 4,
      mentions: 1,
      mentionSamples: 2,
      ownCitations: 1,
      citationSamples: 1,
    });
    expect(rows[1].analysis.mention).toBeNull();
    expect(rows[2].analysis.ownCitation).toBeNull();
  });
  it("never pools separate samples with unknown model versions", () => {
    const groups = evidenceCohorts(
      [
        row(1, { modelVersion: null }),
        row(2, { modelVersion: null, rawAnswer: "Another business" }),
      ],
      "2026-08-01",
      "2026-09-01",
    );
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.mentionSamples)).toEqual([1, 1]);
    expect(groups.map((g) => g.mentions)).toEqual([1, 0]);
  });
  it("separates all cohort dimensions and half-open capture windows", () => {
    const rows = [
      row(1),
      row(2, { mode: "api" }),
      row(3, { method: "other" }),
      row(4, { surface: "other" }),
      row(5, { modelVersion: "known-v2" }),
      row(6, {}, { ...prompt, revision: 2 }),
      row(7, {}, { ...prompt, data: { ...prompt.data, language: "Polish" } }),
      row(8, { capturedAt: "2026-09-01T00:00:00Z" }),
    ];
    expect(evidenceCohorts(rows, "2026-08-01", "2026-09-01")).toHaveLength(7);
    expect(evidenceCohorts(rows, "2026-01-01", "2026-02-01")).toHaveLength(0);
    expect(() => evidenceCohorts(rows, "bad", "date")).toThrow();
  });
  it("preserves originals but counts only the current correction even outside the window", () => {
    const first = row(1),
      second = row(2, { supersedesId: first.id, capturedAt: "2026-09-01T00:00:00Z" });
    expect(evidenceCohorts([first, second], "2026-08-01", "2026-09-01")).toEqual([]);
    expect(first.input.rawAnswer).toBe(input.rawAnswer);
  });
  it("has matching translated UI keys in four locales", () => {
    for (const locale of ["en", "pl", "sv", "da"]) {
      expect(Object.keys(answerEvidenceCopy[locale])).toEqual(Object.keys(answerEvidenceCopy.en));
      expect(Object.values(answerEvidenceCopy[locale]).every(Boolean)).toBe(true);
    }
  });
});
describe("scoped evidence server, no provider or URL calls", () => {
  const scope = { ownerId: "00000000-0000-4000-8000-000000000001", projectId: "p" };
  it("derives analysis only from a saved prompt, never browser metrics", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { prompts: [prompt], answers: [] }, error: null })
      .mockResolvedValueOnce({ data: row(9).id, error: null });
    await importAnswerEvidence(scope, input, rpc);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      "read_ai_answer_evidence",
      "save_ai_answer_evidence",
    ]);
    expect(rpc.mock.calls[1][1]).toMatchObject({
      p_user: scope.ownerId,
      p_project: "p",
      p_document: { prompt, analysis: { verified: false, mention: true } },
    });
  });
  it("rejects oversized derived cohorts before persistence without poisoning readable state", async () => {
    const escapedPrompt = {
      ...prompt,
      data: { ...prompt.data, market: "\u0001".repeat(80), language: "\u0001".repeat(40) },
    };
    const escapedInput = {
      ...input,
      surface: "\u0001".repeat(100),
      method: "\u0001".repeat(120),
      modelVersion: "\u0001".repeat(120),
    };
    // Each source field is legal; their JSON escaping expands the derived key.
    expect(answerEvidenceSchema.safeParse(escapedInput).success).toBe(true);
    expect(analyzeAnswer(escapedInput, escapedPrompt).cohort.length).toBeGreaterThan(1000);
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: { prompts: [escapedPrompt], answers: [] }, error: null });
    await expect(importAnswerEvidence(scope, escapedInput, rpc)).rejects.toThrow();
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["read_ai_answer_evidence"]);
    expect((await readAnswerEvidence(scope, rpc)).answers).toEqual([]);
  });
  it("rejects missing prompt versions before any write", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { prompts: [], answers: [] }, error: null });
    await expect(importAnswerEvidence(scope, input, rpc)).rejects.toThrow("prompt_missing");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("does not retry uncertain writes", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "timeout" } });
    await expect(saveEvidencePrompt(scope, prompt.id, 0, prompt.data, rpc)).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("validates owner and project before reads/removals", async () => {
    const rpc = vi.fn();
    await expect(readAnswerEvidence({ ...scope, ownerId: "bad" }, rpc)).rejects.toThrow();
    await expect(
      removeAnswerEvidence({ ...scope, projectId: "../p" }, "answer", row(1).id, rpc),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});
