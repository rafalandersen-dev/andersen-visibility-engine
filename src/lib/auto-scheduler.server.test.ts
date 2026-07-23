/**
 * Auto-scheduler server helpers — the pure, I/O-free parts. The runner's
 * guardrail math lives in auto-scheduler.test.ts; here we pin the server-side
 * hook auto-approval: it must apply the SAME validateHook gate the editor
 * uses, and must return null (→ hold, never publish) when nothing survives.
 */
import { describe, it, expect } from "vitest";
import { attachBestHook } from "./auto-scheduler.server";
import type { ContentAsset, HookProposal } from "./types";

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
