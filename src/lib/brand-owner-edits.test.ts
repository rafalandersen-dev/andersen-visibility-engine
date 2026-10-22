import { describe, it, expect } from "vitest";
import {
  applyOwnerBrandEdits,
  changedBrandOwnerFields,
  isSafeOwnerUrl,
  OWNER_BRAND_LIMITS,
  OwnerBrandEditError,
  parseOwnerListText,
} from "./brand-owner-edits";
import { brandRecordDisposition } from "./knowledge-brand";
import type { BrandIntelligence, BrandOffer } from "./types";

const now = "2026-10-07T12:00:00Z";
const offers = (n: number): BrandOffer[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `Offer ${i + 1}`,
    type: "service",
    priority: "medium",
  }));
const clone = <T>(v: T) => structuredClone(v);
function refused(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    if (e instanceof OwnerBrandEditError) return e;
    throw e;
  }
  throw new Error("expected an OwnerBrandEditError");
}

describe("owner URL policy", () => {
  it.each(["https://example.com/contact", "/contact", "/book?x=1#top", "/%2F%2Fstill-a-path"])(
    "accepts %s",
    (url) => expect(isSafeOwnerUrl(url)).toBe(true),
  );
  it.each([
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "data:text/html,x",
    "http://example.com",
    "https://user:pass@example.com",
    "/has space",
    "/tab\there",
    "/nul\u0000",
    "contact",
    "https://",
    `/${"x".repeat(OWNER_BRAND_LIMITS.url)}`,
  ])("rejects %s", (url) => expect(isSafeOwnerUrl(url)).toBe(false));

  it("refuses a newly entered unsafe CTA URL without mutating anything", () => {
    const baseline: BrandIntelligence = { offers: { primaryOffers: offers(19) } };
    const edited = { ...clone(baseline), ctas: { primaryCtaUrl: "javascript:alert(1)" } };
    const current = clone(baseline);
    const snapshots = [clone(baseline), clone(edited), clone(current)];
    const error = refused(() => applyOwnerBrandEdits(baseline, edited, current, now));
    expect(error).toMatchObject({ code: "invalidUrl", field: "ctas.primaryCtaUrl" });
    expect([baseline, edited, current]).toEqual(snapshots);
  });

  it("keeps an untouched legacy relative URL inside an offer and validates only the edited member", () => {
    const baseline: BrandIntelligence = {
      offers: {
        primaryOffers: [
          { name: " Legacy ", type: "service", priority: "high", url: "/legacy-path" },
          ...offers(14),
        ],
      },
    };
    const edited = clone(baseline);
    edited.offers!.primaryOffers![0].name = "Legacy";
    edited.offers!.primaryOffers![1].url = "https://example.com/two";
    const { brand } = applyOwnerBrandEdits(baseline, edited, clone(baseline), now);
    // Member 0 only differed by whitespace: it is the stored object, untouched.
    expect(brand?.offers?.primaryOffers?.[0]).toEqual(baseline.offers!.primaryOffers![0]);
    expect(brand?.offers?.primaryOffers?.[1].url).toBe("https://example.com/two");

    const unsafe = clone(baseline);
    unsafe.offers!.primaryOffers![2].url = "//evil.example";
    expect(
      refused(() => applyOwnerBrandEdits(baseline, unsafe, clone(baseline), now)),
    ).toMatchObject({ code: "invalidUrl", field: "offers.primaryOffers", index: 2 });
  });

  it("requires a name for a partly filled offer row instead of dropping it", () => {
    const baseline: BrandIntelligence = { offers: { primaryOffers: offers(15) } };
    const edited = clone(baseline);
    edited.offers!.primaryOffers!.push({
      name: "",
      type: "service",
      priority: "medium",
      url: "https://example.com/new",
    });
    expect(
      refused(() => applyOwnerBrandEdits(baseline, edited, clone(baseline), now)),
    ).toMatchObject({ code: "required", field: "offers.primaryOffers", index: 15 });
  });
});

describe("explicit clears and owner markers", () => {
  const baseline: BrandIntelligence = {
    voice: { tone: "Calm" },
    claims: { allowedClaims: ["Claim"] },
    proof: { credentials: ["Licensed"] },
    ctas: { primaryCtaLabel: "Book", primaryCtaUrl: "/book" },
    offers: {
      primaryOffers: [{ ...offers(1)[0], url: "https://example.com/1" }, ...offers(15)],
      secondaryOffers: offers(12),
    },
  };
  it("saves every clear together and records a marker for each", () => {
    const edited = clone(baseline);
    edited.voice = {};
    edited.claims = { allowedClaims: [] };
    edited.proof = { credentials: [] };
    edited.ctas = { primaryCtaUrl: "/book" };
    edited.offers!.primaryOffers![0].url = undefined;
    edited.offers!.secondaryOffers = [];
    const { brand, changed } = applyOwnerBrandEdits(baseline, edited, clone(baseline), now);
    expect(changed).toEqual([
      "voice.tone",
      "claims.allowedClaims",
      "offers.primaryOffers",
      "offers.secondaryOffers",
      "proof.credentials",
      "ctas.primaryCtaLabel",
    ]);
    expect(brand?.voice?.tone).toBeUndefined();
    expect(brand?.claims?.allowedClaims).toEqual([]);
    expect(brand?.proof?.credentials).toEqual([]);
    expect(brand?.ctas).toMatchObject({ primaryCtaUrl: "/book" });
    expect(brand?.ctas?.primaryCtaLabel).toBeUndefined();
    expect(brand?.offers?.primaryOffers).toHaveLength(16);
    expect(brand?.offers?.primaryOffers?.[0].url).toBeUndefined();
    expect(brand?.offers?.secondaryOffers).toEqual([]);

    const markers = changedBrandOwnerFields(baseline, brand!, ["avoid"]);
    expect(markers).toEqual([
      "avoid",
      "claims.allowedClaims",
      "ctas.primaryCtaLabel",
      "offers.primaryOffers",
      "offers.secondaryOffers",
      "proof.credentials",
      "voice.tone",
    ]);
    // Source knowledge cannot refill an owner-cleared mapped field.
    expect(
      brandRecordDisposition(
        { brandIntelligence: brand, brandOwnerFields: markers },
        { key: "brand.voice.tone", value: "Loud" },
      ),
    ).toBe("owner");
  });
  it("does not mark empty-to-empty fields or updatedAt", () => {
    expect(
      changedBrandOwnerFields(
        { voice: { tone: "" }, updatedAt: "a" },
        { voice: {}, claims: { allowedClaims: [] }, internalLinks: [], updatedAt: "b" },
      ),
    ).toEqual([]);
  });
});

describe("legacy data and unknown paths", () => {
  const baseline = {
    voice: { tone: "Calm", legacyNote: "keep" },
    legacyMeta: { source: "import-2026" },
    offers: { primaryOffers: offers(19) },
    internalLinks: [{ label: " Contact ", url: "/contact", type: "contact", priority: "high" }],
  } as unknown as BrandIntelligence;
  it("keeps untouched unknown keys, groups and legacy arrays exactly", () => {
    const edited = clone(baseline);
    edited.voice!.tone = "Direct";
    const current = clone(baseline);
    const { brand } = applyOwnerBrandEdits(baseline, edited, current, now);
    expect(brand).toMatchObject({
      voice: { tone: "Direct", legacyNote: "keep" },
      legacyMeta: { source: "import-2026" },
      updatedAt: now,
    });
    expect(brand?.internalLinks).toBe(current.internalLinks);
    expect(brand?.offers).toBe(current.offers);
  });
  it.each([
    ["secretToken", { secretToken: "x" }],
    ["voice.privateKey", { voice: { tone: "Calm", privateKey: "x" } }],
  ])("refuses a new edit to unknown path %s", (field, patch) => {
    const edited = { ...clone(baseline), ...patch } as BrandIntelligence;
    expect(
      refused(() => applyOwnerBrandEdits(baseline, edited, clone(baseline), now)),
    ).toMatchObject({ code: "unknownField", field });
  });
  it("refuses to overwrite a malformed stored group instead of silently replacing it", () => {
    const malformed = { voice: "legacy string" } as unknown as BrandIntelligence;
    expect(
      refused(() => applyOwnerBrandEdits(malformed, { voice: { tone: "New" } }, malformed, now)),
    ).toMatchObject({ code: "malformed", field: "voice.tone" });
  });
});

describe("baseline / current / edited", () => {
  const baseline: BrandIntelligence = {
    voice: { tone: "Calm" },
    offers: { primaryOffers: offers(15) },
  };
  it("keeps unrelated newer changes", () => {
    const edited = { ...clone(baseline), voice: { tone: "Direct" } };
    const current = { ...clone(baseline), avoid: ["Newer owner setting"] };
    expect(applyOwnerBrandEdits(baseline, edited, current, now).brand).toMatchObject({
      voice: { tone: "Direct" },
      avoid: ["Newer owner setting"],
    });
  });
  it("refuses a different newer value for the same field", () => {
    const edited = { ...clone(baseline), voice: { tone: "Direct" } };
    const current = { ...clone(baseline), voice: { tone: "Someone else" } };
    expect(refused(() => applyOwnerBrandEdits(baseline, edited, current, now))).toMatchObject({
      code: "conflict",
      field: "voice.tone",
      message: "brand_profile_changed",
    });
  });
  it("accepts a newer value identical to the requested one", () => {
    const edited = { ...clone(baseline), voice: { tone: "Direct" } };
    const current = { ...clone(baseline), voice: { tone: "Direct" } };
    expect(applyOwnerBrandEdits(baseline, edited, current, now).brand?.voice?.tone).toBe("Direct");
  });
  it("treats the offer list atomically", () => {
    const edited = clone(baseline);
    edited.offers!.primaryOffers![0].url = "https://example.com/a";
    const current = clone(baseline);
    current.offers!.primaryOffers![14].description = "Edited elsewhere";
    expect(refused(() => applyOwnerBrandEdits(baseline, edited, current, now)).code).toBe(
      "conflict",
    );
  });
});

describe("finite owner limits", () => {
  it("allows editing an oversized legacy list but refuses additions past the bound", () => {
    const big = Array.from({ length: OWNER_BRAND_LIMITS.listItems + 5 }, (_, i) => `Entry ${i}`);
    const baseline: BrandIntelligence = { claims: { forbiddenClaims: big } };
    const edited = clone(baseline);
    edited.claims!.forbiddenClaims![3] = "Edited entry";
    const { brand } = applyOwnerBrandEdits(baseline, edited, clone(baseline), now);
    expect(brand?.claims?.forbiddenClaims).toHaveLength(big.length);
    expect(brand?.claims?.forbiddenClaims?.[3]).toBe("Edited entry");
    const added = clone(baseline);
    added.claims!.forbiddenClaims!.push("One more");
    expect(
      refused(() => applyOwnerBrandEdits(baseline, added, clone(baseline), now)),
    ).toMatchObject({ code: "limit", field: "claims.forbiddenClaims" });
  });
  it("refuses adding an offer beyond the owner bound", () => {
    const baseline: BrandIntelligence = {
      offers: { primaryOffers: offers(OWNER_BRAND_LIMITS.offers) },
    };
    const edited = clone(baseline);
    edited.offers!.primaryOffers!.push({ name: "Extra", type: "service", priority: "low" });
    expect(refused(() => applyOwnerBrandEdits(baseline, edited, clone(baseline), now)).code).toBe(
      "limit",
    );
  });
  it("refuses an over-long new list entry", () => {
    const edited: BrandIntelligence = {
      voice: { wordsToUse: ["x".repeat(OWNER_BRAND_LIMITS.listItemLength + 1)] },
    };
    expect(refused(() => applyOwnerBrandEdits(undefined, edited, undefined, now))).toMatchObject({
      code: "tooLong",
      field: "voice.wordsToUse",
      index: 0,
    });
  });
});

describe("list entries keep their identity", () => {
  it("parses typed text once: lines, a stored single entry, or a new comma line", () => {
    expect(parseOwnerListText("a, b\nc", [])).toEqual(["a, b", "c"]);
    // The one-line comma contract applies to new text, with or without a trailing newline.
    expect(parseOwnerListText("Licensed, insured\n", ["x"])).toEqual(["Licensed", "insured"]);
    expect(
      parseOwnerListText("Professional from £1,490", ["Professional from £1,490", "x"]),
    ).toEqual(["Professional from £1,490"]);
    expect(parseOwnerListText("Licensed, insured", ["Other"])).toEqual(["Licensed", "insured"]);
    expect(parseOwnerListText("  \n ", ["x"])).toEqual([]);
  });
  it.each(["claims.allowedClaims", "proof.proofPoints"] as const)(
    "never re-splits a saved %s array (idempotent)",
    (field) => {
      const [group, leaf] = field.split(".");
      const baseline = {
        [group]: { [leaf]: ["Professional from £1,490", "Other"] },
      } as BrandIntelligence;
      const edited = { [group]: { [leaf]: ["Professional from £1,490"] } } as BrandIntelligence;
      const { brand } = applyOwnerBrandEdits(baseline, edited, clone(baseline), now);
      const saved = (brand as Record<string, Record<string, unknown>>)[group][leaf];
      expect(saved).toEqual(["Professional from £1,490"]);
      expect(applyOwnerBrandEdits(brand, clone(brand!), brand, now).changed).toEqual([]);
    },
  );
});

describe("row metadata and association", () => {
  const offer = {
    name: "Massage",
    type: "service",
    priority: "high",
    description: "Existing description",
    legacyId: "catalog-15",
    source: { kind: "owner-import", revision: 1 },
  };
  const link = { label: "Book", url: "/book", type: "booking", priority: "high", legacyId: "l-1" };
  const rule = { market: "SE", language: "Swedish", notes: "Old", legacyId: "r-1" };
  const baseline = {
    offers: { primaryOffers: [offer, ...offers(14)] },
    internalLinks: [link],
    marketLanguageRules: [rule],
  } as unknown as BrandIntelligence;
  const rows = (b: BrandIntelligence | undefined) =>
    b as unknown as {
      offers: { primaryOffers: Record<string, unknown>[] };
      internalLinks: Record<string, unknown>[];
      marketLanguageRules: Record<string, unknown>[];
    };

  it("keeps untouched metadata when a supported offer, link or rule key is edited", () => {
    const edited = clone(baseline);
    rows(edited).offers.primaryOffers[0].url = "https://example.com/massage";
    rows(edited).internalLinks[0].label = "Book now";
    rows(edited).marketLanguageRules[0].notes = "New";
    const { brand, changed } = applyOwnerBrandEdits(baseline, edited, clone(baseline), now);
    expect(changed).toEqual(["offers.primaryOffers", "internalLinks", "marketLanguageRules"]);
    expect(rows(brand).offers.primaryOffers[0]).toEqual({
      ...offer,
      url: "https://example.com/massage",
    });
    expect(rows(brand).internalLinks[0]).toEqual({ ...link, label: "Book now" });
    expect(rows(brand).marketLanguageRules[0]).toEqual({ ...rule, notes: "New" });
    expect(rows(brand).offers.primaryOffers.slice(1)).toEqual(offers(14));
  });

  it("validates the edited supported keys of a preserved row", () => {
    const edited = clone(baseline);
    rows(edited).offers.primaryOffers[0].url = "javascript:alert(1)";
    expect(
      refused(() => applyOwnerBrandEdits(baseline, edited, clone(baseline), now)),
    ).toMatchObject({ code: "invalidUrl", field: "offers.primaryOffers", index: 0 });
  });

  it("sees a concurrent metadata-only change as a conflict", () => {
    const edited = clone(baseline);
    rows(edited).offers.primaryOffers[0].url = "https://example.com/massage";
    const current = clone(baseline);
    (rows(current).offers.primaryOffers[0].source as { revision: number }).revision = 2;
    expect(refused(() => applyOwnerBrandEdits(baseline, edited, current, now))).toMatchObject({
      code: "conflict",
      field: "offers.primaryOffers",
    });
  });

  it("refuses new metadata on an existing or a new row", () => {
    const injected = clone(baseline);
    rows(injected).offers.primaryOffers[1].secret = "x";
    expect(
      refused(() => applyOwnerBrandEdits(baseline, injected, clone(baseline), now)),
    ).toMatchObject({ code: "unknownField", field: "offers.primaryOffers", index: 1 });
    const changedMeta = clone(baseline);
    (rows(changedMeta).offers.primaryOffers[0].source as { revision: number }).revision = 9;
    expect(
      refused(() => applyOwnerBrandEdits(baseline, changedMeta, clone(baseline), now)).code,
    ).toBe("unknownField");
    const added = clone(baseline);
    rows(added).internalLinks.push({
      label: "New",
      url: "/new",
      type: "other",
      priority: "low",
      legacyId: "forged",
    });
    expect(refused(() => applyOwnerBrandEdits(baseline, added, clone(baseline), now)).code).toBe(
      "unknownField",
    );
  });

  it("refuses metadata claimed by more rows than were stored (ambiguous)", () => {
    const edited = clone(baseline);
    rows(edited).marketLanguageRules.push({ ...rule, notes: "Copy" });
    expect(
      refused(() => applyOwnerBrandEdits(baseline, edited, clone(baseline), now)),
    ).toMatchObject({ code: "ambiguous", field: "marketLanguageRules", index: 1 });
  });

  it("handles duplicates, reorder, add and delete without losing metadata", () => {
    const dup = { ...offer, description: "Twin" };
    const base = {
      offers: { primaryOffers: [{ ...dup }, { ...dup }, offers(1)[0]] },
    } as unknown as BrandIntelligence;
    const edited = clone(base);
    const list = rows(edited).offers.primaryOffers;
    list[1].url = "https://example.com/twin"; // edit one of two identical rows
    list.reverse(); // reorder
    list.splice(0, 1); // delete the metadata-free offer (now first)
    list.push({ name: "Brand new", type: "package", priority: "low" }); // add
    const { brand } = applyOwnerBrandEdits(base, edited, clone(base), now);
    expect(rows(brand).offers.primaryOffers).toEqual([
      { ...dup, url: "https://example.com/twin" },
      dup,
      { name: "Brand new", type: "package", priority: "low" },
    ]);
  });
});

describe("CI: restoring after this editor's own failed attempt", () => {
  const meta = {
    offers: {
      primaryOffers: [
        {
          name: "Massage",
          type: "service",
          priority: "high",
          legacyId: "catalog-15",
          source: { kind: "owner-import", revision: 1 },
        },
      ],
    },
    internalLinks: [
      { label: "Book", url: "/book", type: "booking", priority: "high", legacyId: "l-1" },
    ],
    marketLanguageRules: [{ market: "SE", notes: "Swedish copy", legacyId: "r-1" }],
  } as unknown as BrandIntelligence;
  const fields = ["offers.primaryOffers", "internalLinks", "marketLanguageRules"] as const;
  const value = (b: BrandIntelligence | undefined, field: (typeof fields)[number]) =>
    field === "offers.primaryOffers"
      ? (b?.offers?.primaryOffers as unknown[] | undefined)
      : ((b as Record<string, unknown> | undefined)?.[field] as unknown[] | undefined);
  const set = (b: BrandIntelligence, field: (typeof fields)[number], rows: unknown[]) =>
    (field === "offers.primaryOffers"
      ? { ...b, offers: { ...b.offers, primaryOffers: rows } }
      : { ...b, [field]: rows }) as BrandIntelligence;
  const attemptDeleted = (field: (typeof fields)[number]) => ({
    current: set(clone(meta), field, []),
    own: { [field]: { attempted: [], confirmed: clone(value(meta, field)) } },
  });

  it.each(fields)(
    "restores the %s row (with metadata) that the failed attempt removed",
    (field) => {
      const { current, own } = attemptDeleted(field);
      const { brand, changed } = applyOwnerBrandEdits(meta, clone(meta), current, now, own);
      expect(changed).toEqual([field]);
      expect(value(brand, field)).toEqual(value(meta, field));
    },
  );

  it.each(fields)("still refuses claiming the confirmed %s metadata twice", (field) => {
    const { current, own } = attemptDeleted(field);
    const [row] = value(meta, field) as Record<string, unknown>[];
    const twice = set(clone(meta), field, [row, { ...row, notes: "Second claim" }]);
    expect(refused(() => applyOwnerBrandEdits(meta, twice, current, now, own))).toMatchObject({
      code: "ambiguous",
      field,
    });
  });

  it.each(fields)(
    "never overwrites a different current %s value: unchanged restore is skipped, an edit conflicts",
    (field) => {
      const { own } = attemptDeleted(field);
      const theirs = set(clone(meta), field, [
        field === "offers.primaryOffers"
          ? { name: "Theirs", type: "service", priority: "low" }
          : field === "internalLinks"
            ? { label: "Theirs", url: "/theirs", type: "other", priority: "low" }
            : { market: "PL", notes: "Theirs" },
      ]);
      // A plain restore equals the baseline and the field is no longer this editor's
      // attempt: it is not written, so the other writer's value stays.
      const kept = applyOwnerBrandEdits(meta, clone(meta), theirs, now, own);
      expect(kept.changed).toEqual([]);
      expect(value(kept.brand, field)).toEqual(value(theirs, field));
      // Restoring with a further edit is a real conflict.
      const [row] = value(meta, field) as Record<string, unknown>[];
      const edited = set(clone(meta), field, [
        field === "offers.primaryOffers"
          ? { ...row, description: "Edited" }
          : field === "internalLinks"
            ? { ...row, label: "Edited" }
            : { ...row, notes: "Edited" },
      ]);
      expect(refused(() => applyOwnerBrandEdits(meta, edited, theirs, now, own))).toMatchObject({
        code: "conflict",
        field,
      });
    },
  );

  it("restores an oversized confirmed list but refuses expanding beyond it", () => {
    const big = Array.from({ length: OWNER_BRAND_LIMITS.listItems + 5 }, (_, i) => `Entry ${i}`);
    const baseline: BrandIntelligence = { claims: { forbiddenClaims: big } };
    const current: BrandIntelligence = { claims: { forbiddenClaims: big.slice(0, 10) } };
    const own = {
      "claims.forbiddenClaims": { attempted: big.slice(0, 10), confirmed: [...big] },
    };
    const { brand } = applyOwnerBrandEdits(baseline, clone(baseline), current, now, own);
    expect(brand?.claims?.forbiddenClaims).toEqual(big);
    const larger = { claims: { forbiddenClaims: [...big, "One more"] } };
    expect(refused(() => applyOwnerBrandEdits(baseline, larger, current, now, own))).toMatchObject({
      code: "limit",
      field: "claims.forbiddenClaims",
    });
  });
});
