/**
 * Reproducers from the 7 October 2026 owner-save review, written against the
 * long-standing compatibility exports only (`mergeOwnerBrandEdits`,
 * `changedBrandOwnerFields`) so the same file runs against the pre-repair source.
 * Before the repair, profiles with more than 10 offers or a legacy relative CTA
 * returned the unchanged profile and silently dropped the requested edits.
 */
import { describe, it, expect } from "vitest";
import { changedBrandOwnerFields, mergeOwnerBrandEdits } from "./knowledge-brand";
import { brandProposal } from "./brand-proposal";
import type { BrandIntelligence, BrandOffer } from "./types";

const now = "2026-10-07T12:00:00Z";
const offers = (n: number, prefix = "Offer"): BrandOffer[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `${prefix} ${i + 1}`,
    type: "service",
    priority: "medium",
    description: `${prefix} description ${i + 1}`,
  }));

describe.each([15, 19])("%i-offer profile", (n) => {
  const baseline: BrandIntelligence = {
    voice: { tone: "Calm" },
    offers: { primaryOffers: offers(n), secondaryOffers: offers(n, "Extra") },
  };

  it("saves one offer URL and one description together, keeping every other offer", () => {
    const snapshot = structuredClone(baseline);
    const edited = structuredClone(baseline);
    edited.offers!.primaryOffers![0].url = "https://example.com/offer-1";
    edited.offers!.primaryOffers![7].description = "Updated description";
    edited.offers!.secondaryOffers![n - 1].url = "https://example.com/extra";
    const saved = mergeOwnerBrandEdits(baseline, edited, structuredClone(baseline), now)!;
    expect(saved.offers?.primaryOffers).toHaveLength(n);
    expect(saved.offers?.primaryOffers?.[0].url).toBe("https://example.com/offer-1");
    expect(saved.offers?.primaryOffers?.[7].description).toBe("Updated description");
    expect(saved.offers?.primaryOffers?.map((o) => o.name)).toEqual(
      baseline.offers!.primaryOffers!.map((o) => o.name),
    );
    for (const i of [1, 2, 8, n - 1])
      expect(saved.offers?.primaryOffers?.[i]).toEqual(baseline.offers!.primaryOffers![i]);
    expect(saved.offers?.secondaryOffers).toHaveLength(n);
    expect(saved.offers?.secondaryOffers?.[n - 1].url).toBe("https://example.com/extra");
    expect(baseline).toEqual(snapshot);
  });

  it("saves voice, CTA label and an offer change together (never voice only)", () => {
    const edited = structuredClone(baseline);
    edited.voice = { tone: "Direct" };
    edited.ctas = { primaryCtaLabel: "Book now" };
    edited.offers!.primaryOffers![3].url = "https://example.com/four";
    const saved = mergeOwnerBrandEdits(baseline, edited, structuredClone(baseline), now)!;
    expect(saved.voice?.tone).toBe("Direct");
    expect(saved.ctas?.primaryCtaLabel).toBe("Book now");
    expect(saved.offers?.primaryOffers?.[3].url).toBe("https://example.com/four");
    expect(changedBrandOwnerFields(baseline, saved)).toEqual([
      "ctas.primaryCtaLabel",
      "offers.primaryOffers",
      "voice.tone",
    ]);
  });

  it("saves an explicit clear of allowed claims and marks it", () => {
    const withClaims = { ...structuredClone(baseline), claims: { allowedClaims: ["Kept claim"] } };
    const edited = structuredClone(withClaims);
    edited.claims = { allowedClaims: [] };
    const saved = mergeOwnerBrandEdits(withClaims, edited, structuredClone(withClaims), now)!;
    expect(saved.claims?.allowedClaims ?? []).toEqual([]);
    expect(changedBrandOwnerFields(withClaims, saved)).toContain("claims.allowedClaims");
  });

  it("refuses a different concurrent change to the same offer list instead of ignoring it", () => {
    const edited = structuredClone(baseline);
    edited.offers!.primaryOffers![0].url = "https://example.com/mine";
    const latest = structuredClone(baseline);
    latest.offers!.primaryOffers![0].url = "https://example.com/theirs";
    expect(() => mergeOwnerBrandEdits(baseline, edited, latest, now)).toThrow(
      "brand_profile_changed",
    );
  });
});

describe("legacy root-relative CTA", () => {
  const baseline: BrandIntelligence = {
    offers: { primaryOffers: offers(1) },
    ctas: { primaryCtaLabel: "Contact", primaryCtaUrl: "/contact" },
  };
  it("does not block or hide an unrelated CTA label edit", () => {
    const edited = structuredClone(baseline);
    edited.ctas!.primaryCtaLabel = "Get in touch";
    const saved = mergeOwnerBrandEdits(baseline, edited, structuredClone(baseline), now)!;
    expect(saved.ctas).toEqual({ primaryCtaLabel: "Get in touch", primaryCtaUrl: "/contact" });
  });
  it("saves a replacement absolute HTTPS URL", () => {
    const edited = structuredClone(baseline);
    edited.ctas!.primaryCtaUrl = "https://example.com/contact";
    const saved = mergeOwnerBrandEdits(baseline, edited, structuredClone(baseline), now)!;
    expect(saved.ctas?.primaryCtaUrl).toBe("https://example.com/contact");
  });
});

describe("source-proposal boundary stays strict", () => {
  it("still rejects more than 10 offers and relative URLs from proposals", () => {
    expect(brandProposal.schema.safeParse({ offers: { primaryOffers: offers(11) } }).success).toBe(
      false,
    );
    expect(brandProposal.schema.safeParse({ ctas: { primaryCtaUrl: "/contact" } }).success).toBe(
      false,
    );
    expect(brandProposal.schema.safeParse({ offers: { primaryOffers: offers(10) } }).success).toBe(
      true,
    );
  });
});
