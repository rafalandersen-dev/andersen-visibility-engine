import { describe, expect, it } from "vitest";
import {
  brandProposal,
  brandProposalEntries,
  mergeBrandProposal,
  displayBrandValue,
} from "./brand-proposal";
import { validatePendingActionPayload } from "./pending-actions";

describe("bounded Brand Intelligence proposals", () => {
  it("accepts a standalone brand group and trims values", () => {
    expect(
      validatePendingActionPayload("project_setup_proposal", {
        brandIntelligence: { voice: { tone: " Calm " } },
      }),
    ).toEqual({ brandIntelligence: { voice: { tone: "Calm" } } });
  });
  it.each([
    {},
    { voice: {} },
    { updatedAt: "forged" },
    { publishSecret: "private" },
    { voice: { token: "private" } },
    { proof: { credentials: Array(21).fill("x") } },
    { voice: { tone: "x".repeat(501) } },
    { ctas: { primaryCtaUrl: "javascript:alert(1)" } },
    { ctas: { primaryCtaUrl: "https://user:password@example.test" } },
    { offers: { primaryOffers: [{ name: "Offer", publish: true }] } },
  ])("rejects empty, unknown, oversized or unsafe fields", (payload) => {
    expect(brandProposal.schema.safeParse(payload).success).toBe(false);
  });
  it("merges only supplied leaves, with explicit clearing and server-owned time", () => {
    const current = {
      voice: { tone: "Old", styleNotes: "Keep" },
      claims: { forbiddenClaims: ["Keep restriction"] },
      proof: { credentials: ["Remove"] },
      updatedAt: "old",
    };
    const result = mergeBrandProposal(
      current,
      { voice: { tone: "New" }, proof: { credentials: [] } },
      "2026-09-07T14:00:00Z",
    );
    expect(result).toEqual({
      voice: { tone: "New", styleNotes: "Keep" },
      claims: current.claims,
      proof: { credentials: [] },
      updatedAt: "2026-09-07T14:00:00Z",
    });
    expect(current.proof.credentials).toEqual(["Remove"]);
  });
  it("keeps complete offer/link values available for plain-text review", () => {
    const value = {
      offers: {
        primaryOffers: [
          {
            name: "Consultation",
            type: "service",
            priority: "high",
            description: "Details",
            url: "https://example.test",
            notes: "Limitations",
          },
        ],
      },
    };
    const entries = brandProposalEntries(value);
    expect(entries.map((e) => e.field)).toEqual(["offers.primaryOffers"]);
    const text = displayBrandValue(entries[0].value);
    for (const part of [
      "Consultation",
      "service",
      "high",
      "Details",
      "https://example.test",
      "Limitations",
    ])
      expect(text).toContain(part);
    expect(brandProposalEntries({ voice: { privateKey: "must-not-display" } })).toEqual([]);
  });
});
