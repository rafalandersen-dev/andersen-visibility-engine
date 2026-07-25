/**
 * Auto-scheduler server helpers — the pure, I/O-free parts. The runner's
 * guardrail math lives in auto-scheduler.test.ts; here we pin the server-side
 * hook auto-approval: it must apply the SAME validateHook gate the editor
 * uses, and must return null (→ hold, never publish) when nothing survives.
 */
import { describe, it, expect } from "vitest";
import { attachBestHook, buildAssetFromGeneration } from "./auto-scheduler.server";
import type { ContentAsset, HookProposal, Opportunity, Project } from "./types";

const asset = (proposals: HookProposal[]): ContentAsset =>
  ({
    id: "a1",
    projectId: "p1",
    title: "Calm sessions",
    slug: "calm",
    markdown: "A relaxing article body about sessions in our studio.",
    visualModelVersion: 3,
    hookProposals: proposals,
  }) as ContentAsset;

describe("attachBestHook", () => {
  it("approves the first proposal that passes the editor's hook gate", () => {
    const out = attachBestHook(
      asset([
        { text: "We guarantee a 300% boost in bookings.", type: "promise" },
        { text: "Need a calmer studio session?", type: "question" },
      ]),
      "2026-07-24T06:00:00.000Z",
    );
    expect(out?.hook?.text).toBe("Need a calmer studio session?");
    expect(out?.hook?.approval).toBe("approved");
    expect(out?.hook?.provenance).toBe("generated");
  });

  it("returns null when no proposal survives — the runner holds, never publishes", () => {
    expect(
      attachBestHook(
        asset([{ text: "We guarantee a 300% boost in bookings.", type: "promise" }]),
        "2026-07-24T06:00:00.000Z",
      ),
    ).toBeNull();
    expect(attachBestHook(asset([]), "2026-07-24T06:00:00.000Z")).toBeNull();
  });
});

describe("buildAssetFromGeneration (H1 regression)", () => {
  it("carries the generated hookProposals and the month marker onto the asset", () => {
    const gen = {
      metaTitle: "MT",
      metaDescription: "MD",
      h1: "H",
      markdown: "Body text.",
      hookProposals: [{ text: "Need calmer sessions?", type: "question" }],
    } as never;
    const opp = { id: "o1", projectId: "p1", title: "T", language: "en" } as unknown as Opportunity;
    const project = { id: "p1", name: "N" } as Project;
    const a = buildAssetFromGeneration(gen, opp, project, "2026-07-24T06:00:00.000Z", "2026-09");
    expect(a.hookProposals).toHaveLength(1); // without these, auto mode can never arm
    expect(a.autoScheduledFor).toBe("2026-09");
    expect(a.visualModelVersion).toBe(3);
    expect(a.status).toBe("Draft");
  });
});

describe("generation language follows the opportunity (P1-7)", () => {
  const gen = { metaTitle: "T", metaDescription: "D", h1: "H", markdown: "Body." } as never;
  const project = { id: "p1", name: "N", primaryContentLanguage: "sv" } as unknown as Project;

  it("a Polish opportunity on a Swedish project yields a Polish asset", () => {
    const opp = {
      id: "o1",
      projectId: "p1",
      title: "T",
      language: "Polish",
    } as unknown as Opportunity;
    expect(
      buildAssetFromGeneration(gen, opp, project, "2026-07-25T06:00:00.000Z", "2026-09").language,
    ).toBe("Polish");
  });

  it("falls back to the project content language when the opportunity has none", () => {
    const opp = { id: "o2", projectId: "p1", title: "T" } as unknown as Opportunity;
    expect(
      buildAssetFromGeneration(gen, opp, project, "2026-07-25T06:00:00.000Z", "2026-09").language,
    ).toBe("Swedish");
  });
});
