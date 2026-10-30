import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  analyzeAnswer,
  answerEvidenceSchema,
  declaredDomains,
  evidenceCohorts,
  evidenceFocusIds,
  evidenceQuality,
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
describe("domain coverage of saved answers (CG-03A)", () => {
  const W = ["2026-08-01T00:00:00Z", "2026-09-01T00:00:00Z"] as const;
  const p3: EvidencePrompt = {
    ...prompt,
    data: {
      ...prompt.data,
      websiteUrl: "https://www.example.com/home",
      competitorUrls: [
        "https://competitor.com",
        "https://WWW.competitor.com/pricing",
        "https://rival.org/x",
      ],
    },
  };
  const at = (id: number, change: Partial<AnswerEvidence> = {}, p = p3) => row(id, change, p);
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const mixed = () => [
    // Own domain cited three times (incl. www) in ONE answer: counts once.
    at(1, {
      citations: ["https://example.com/a", "https://example.com/b", "https://www.example.com/c"],
    }),
    // Look-alike hosts are third parties; a competitor subdomain counts; a rival URL only in prose does not.
    at(2, {
      rawAnswer: "Milo, see https://rival.org/offer",
      citations: [
        "https://notexample.com",
        "https://example.com.evil.com",
        "https://shop.competitor.com/x",
      ],
    }),
    // Complete answer, explicitly complete EMPTY citation list: a measured zero for every domain.
    at(3, { citations: [], citationsComplete: true }),
    // Excluded qualities, each with an own-domain citation that must NOT count.
    at(4, { citations: ["https://example.com"], citationsComplete: false }),
    at(5, { status: "failed", rawAnswer: "", failure: "Unavailable", citations: [] }),
    at(6, {
      status: "truncated",
      failure: "Cut off",
      citations: ["https://example.com"],
      citationsComplete: true,
    }),
  ];

  it("declares one row per normalized host, own first, duplicates collapsed, declared order kept", () => {
    expect(
      declaredDomains(p3).map(({ host, role, overlaps, alsoCompetitor }) => ({
        host,
        role,
        overlaps,
        alsoCompetitor,
      })),
    ).toEqual([
      { host: "example.com", role: "own", overlaps: [], alsoCompetitor: false },
      { host: "competitor.com", role: "competitor", overlaps: [], alsoCompetitor: false },
      { host: "rival.org", role: "competitor", overlaps: [], alsoCompetitor: false },
    ]);
  });

  it("counts x of the same n eligible answers, once per answer, from supplied citations only", () => {
    const [g] = evidenceCohorts(mixed(), ...W);
    expect(g.total).toBe(6);
    expect(g.eligibleAnswerIds).toEqual([id(1), id(2), id(3)]);
    expect(g.quality).toEqual({
      eligible: [id(1), id(2), id(3)],
      incompleteCitations: [id(4)],
      failed: [id(5)],
      truncated: [id(6)],
    });
    expect(g.domains.map((d) => [d.host, d.presentAnswerIds])).toEqual([
      ["example.com", [id(1)]],
      ["competitor.com", [id(2)]],
      ["rival.org", []],
    ]);
    // Exact-ID reconciliation: every numerator is a subset of the one shared denominator, and the quality
    // lists partition all answers of the cohort.
    for (const d of g.domains)
      expect(d.presentAnswerIds.every((a) => g.eligibleAnswerIds.includes(a))).toBe(true);
    expect(Object.values(g.quality).flat().sort()).toEqual([...g.answerIds].sort());
    expect(Object.values(g.quality).flat()).toHaveLength(g.total);
  });

  it("classifies quality mutually exclusively", () => {
    const q = mixed().map((r) => evidenceQuality(r.input));
    expect(q).toEqual([
      "eligible",
      "eligible",
      "eligible",
      "incompleteCitations",
      "failed",
      "truncated",
    ]);
  });

  it("an empty eligible set stays unknown: n=0 with no domain numerators", () => {
    const [g] = evidenceCohorts(mixed().slice(3), ...W);
    expect(g.total).toBe(3);
    expect(g.eligibleAnswerIds).toEqual([]);
    expect(g.domains.every((d) => d.presentAnswerIds.length === 0)).toBe(true);
  });

  it("failed and truncated answers with a complete citation list are still not eligible (n=0)", () => {
    const rows = [
      at(1, {
        status: "failed",
        rawAnswer: "",
        failure: "Unavailable",
        citations: ["https://example.com"],
        citationsComplete: true,
      }),
      at(2, {
        status: "truncated",
        failure: "Cut off",
        citations: ["https://competitor.com"],
        citationsComplete: true,
      }),
    ];
    const [g] = evidenceCohorts(rows, ...W);
    expect(g.eligibleAnswerIds).toEqual([]);
    expect(g.quality).toMatchObject({ eligible: [], failed: [id(1)], truncated: [id(2)] });
    expect(g.domains.every((d) => d.presentAnswerIds.length === 0)).toBe(true);
  });

  it("marks own/competitor identity and hierarchical overlaps as not independent", () => {
    const p: EvidencePrompt = {
      ...prompt,
      data: {
        ...prompt.data,
        websiteUrl: "https://example.com",
        competitorUrls: [
          "https://www.example.com",
          "https://shop.example.com",
          "https://partner.net",
          "https://partner.net/again",
        ],
      },
    };
    const [g] = evidenceCohorts([at(1, { citations: ["https://shop.example.com/x"] }, p)], ...W);
    expect(
      g.domains.map((d) => ({
        host: d.host,
        alsoCompetitor: d.alsoCompetitor,
        overlaps: d.overlaps,
        x: d.presentAnswerIds.length,
      })),
    ).toEqual([
      // A competitor identical to the own domain is folded into the own row and flagged, never a second row.
      { host: "example.com", alsoCompetitor: true, overlaps: ["shop.example.com"], x: 1 },
      // The same citation counts for the parent and the subdomain; both rows say so.
      { host: "shop.example.com", alsoCompetitor: false, overlaps: ["example.com"], x: 1 },
      { host: "partner.net", alsoCompetitor: false, overlaps: [], x: 0 },
    ]);
  });

  it("keeps coverage per cohort and never pools unknown model versions", () => {
    const rows = [
      at(1),
      at(2, { mode: "api" }),
      at(3, { modelVersion: null }),
      at(4, { modelVersion: null }),
      at(5, {}, { ...p3, revision: 2 }),
      at(6, {}, { ...p3, data: { ...p3.data, market: "Norway" } }),
    ];
    const groups = evidenceCohorts(rows, ...W);
    expect(groups).toHaveLength(6);
    expect(groups.map((g) => g.eligibleAnswerIds)).toEqual([
      [id(1)],
      [id(2)],
      [id(3)],
      [id(4)],
      [id(5)],
      [id(6)],
    ]);
  });

  it("keeps the half-open UTC window: start included, end excluded", () => {
    const rows = [
      at(1, { capturedAt: "2026-08-01T00:00:00Z" }),
      at(2, { capturedAt: "2026-08-31T23:59:59Z" }),
      at(3, { capturedAt: "2026-09-01T00:00:00Z" }),
    ];
    expect(evidenceCohorts(rows, ...W)[0].eligibleAnswerIds).toEqual([id(1), id(2)]);
  });

  it("retires corrected answers by canonical UUID, even mixed-case and outside the window", () => {
    // Stored row ids are lowercase (uuid column); a correction's `supersedesId` keeps the client's spelling.
    const first = { ...at(1), id: "aaaaaaaa-0000-4000-8000-0000000000a1" },
      second = {
        ...at(2, { supersedesId: "AAAAAAAA-0000-4000-8000-0000000000A1", citations: [] }),
        id: "bbbbbbbb-0000-4000-8000-0000000000b2",
      },
      third = at(3, {
        supersedesId: "BbBbBbBb-0000-4000-8000-0000000000B2",
        capturedAt: "2026-09-15T00:00:00Z",
      });
    // third (outside the window) corrects second, which corrects first: nothing current remains inside.
    expect(evidenceCohorts([first, second, third], ...W)).toEqual([]);
    // Without third, second is current and first is retired despite the UPPERCASE reference.
    const [g] = evidenceCohorts([first, second], ...W);
    expect(g.answerIds).toEqual([second.id]);
    expect(g.domains[0].presentAnswerIds).toEqual([]);
    // The stored spelling is never rewritten.
    expect(second.input.supersedesId).toBe("AAAAAAAA-0000-4000-8000-0000000000A1");
  });

  it("groups one prompt regardless of the UUID spelling in its snapshot", () => {
    const lower = { ...p3, id: "abcdef00-0000-4000-8000-00000000000c" };
    const upper = { ...lower, id: lower.id.toUpperCase() };
    expect(evidenceCohorts([at(1, {}, lower), at(2, {}, upper)], ...W)).toHaveLength(1);
  });

  it("resolves a drill-down to exact current ids, or to nothing once the result changes", () => {
    const groups = evidenceCohorts(mixed(), ...W);
    const key = groups[0].key;
    expect(evidenceFocusIds(groups, { key, kind: "present", host: "example.com" })).toEqual([
      id(1),
    ]);
    expect(evidenceFocusIds(groups, { key, kind: "eligible" })).toEqual([id(1), id(2), id(3)]);
    expect(evidenceFocusIds(groups, { key, kind: "truncated" })).toEqual([id(6)]);
    expect(evidenceFocusIds(groups, { key, kind: "present", host: "unknown.com" })).toBeNull();
    // A later window has no such cohort: the old selection resolves to nothing, never to stale ids.
    const later = evidenceCohorts(mixed(), "2027-01-01T00:00:00Z", "2027-02-01T00:00:00Z");
    expect(evidenceFocusIds(later, { key, kind: "eligible" })).toBeNull();
  });
});
