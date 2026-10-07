import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  buildBrandFromForm,
  ownerBrandBaseline,
  resetOwnerBrandAttempts,
  saveOwnerBrandForm,
  toBrandForm,
  type BrandSaveDeps,
} from "./brand-intelligence-form";
import { applyOwnerBrandEdits, changedBrandOwnerFields } from "@/lib/brand-owner-edits";
import type { BrandIntelligence, Project } from "@/lib/types";

const now = "2026-10-07T12:00:00Z";
// Stored shapes seen in real profiles: MCP-written offers with `url` first,
// comma-containing list entries, a relative CTA, a market-only rule, stray spaces.
const legacy = {
  voice: { tone: "Calm ", wordsToUse: ["massage Malmö", "recovery, relaxation"] },
  claims: { allowedClaims: ["Starter from £790", "Professional from £1,490 for five pages"] },
  offers: {
    primaryOffers: Array.from({ length: 19 }, (_, i) => ({
      url: i % 2 ? `https://example.com/o${i}` : undefined,
      name: `Offer ${i + 1}`,
      type: "product" as const,
      priority: "high" as const,
      description: `Model ${i + 1}, 1,500 ppb`,
    })),
  },
  ctas: { primaryCtaLabel: "Contact", primaryCtaUrl: "/contact" },
  internalLinks: [
    { label: "Book", url: "/book", type: "booking" as const, priority: "high" as const },
  ],
  marketLanguageRules: [{ market: "SE", language: "Swedish" }],
  updatedAt: "2026-10-01T00:00:00Z",
} satisfies BrandIntelligence;

describe("form serialization", () => {
  it("a no-op round trip changes nothing and adds no owner markers", () => {
    const current = structuredClone(legacy);
    const result = applyOwnerBrandEdits(
      legacy,
      buildBrandFromForm(toBrandForm(legacy), legacy),
      current,
      now,
    );
    expect(result.changed).toEqual([]);
    expect(result.brand).toBe(current);
    expect(changedBrandOwnerFields(legacy, result.brand!)).toEqual([]);
  });

  it("keeps commas inside list entries when another entry is edited", () => {
    const form = toBrandForm(legacy);
    form.allowedClaims = form.allowedClaims.replace("Starter from £790", "Starter from £890");
    const { brand } = applyOwnerBrandEdits(
      legacy,
      buildBrandFromForm(form, legacy),
      structuredClone(legacy),
      now,
    );
    expect(brand?.claims?.allowedClaims).toEqual([
      "Starter from £890",
      "Professional from £1,490 for five pages",
    ]);
    expect(brand?.voice?.wordsToUse).toEqual(["massage Malmö", "recovery, relaxation"]);
  });

  it("keeps a single stored entry with a comma unless that list is edited, and parses typed text as documented", () => {
    const single: BrandIntelligence = { proof: { proofPoints: ["Since 2019, Malmö"] } };
    const form = toBrandForm(single);
    form.tone = "Direct";
    const untouched = applyOwnerBrandEdits(
      single,
      buildBrandFromForm(form, single),
      single,
      now,
    ).brand;
    expect(untouched?.proof?.proofPoints).toEqual(["Since 2019, Malmö"]);
    form.credentials = "Licensed, insured";
    form.trustSignals = "Reviews\nFounded 2019, Malmö";
    const typed = applyOwnerBrandEdits(single, buildBrandFromForm(form, single), single, now).brand;
    expect(typed?.proof?.credentials).toEqual(["Licensed", "insured"]);
    expect(typed?.proof?.trustSignals).toEqual(["Reviews", "Founded 2019, Malmö"]);
  });

  it.each(["", "\n", "\r\n"])(
    "keeps the remaining comma entry intact after deleting the others (ending %j)",
    (ending) => {
      const two: BrandIntelligence = {
        claims: { allowedClaims: ["Professional from £1,490", "Other claim"] },
        proof: { proofPoints: ["Professional from £1,490", "Other proof"] },
      };
      const form = toBrandForm(two);
      form.allowedClaims = `Professional from £1,490${ending}`;
      form.proofPoints = `Professional from £1,490${ending}`;
      const built = buildBrandFromForm(form, two);
      expect(built.claims?.allowedClaims).toEqual(["Professional from £1,490"]);
      const { brand } = applyOwnerBrandEdits(two, built, structuredClone(two), now);
      expect(brand?.claims?.allowedClaims).toEqual(["Professional from £1,490"]);
      expect(brand?.proof?.proofPoints).toEqual(["Professional from £1,490"]);
      // Normalizing the saved value again is idempotent: a second round trip is a no-op.
      const again = applyOwnerBrandEdits(
        brand,
        buildBrandFromForm(toBrandForm(brand), brand),
        brand,
        now,
      );
      expect(again.changed).toEqual([]);
    },
  );

  it("keeps a partly filled market rule instead of silently dropping it", () => {
    const form = toBrandForm(legacy);
    form.marketLanguageRules = [
      ...form.marketLanguageRules,
      { market: "PL", language: "", notes: "" },
    ];
    const { brand } = applyOwnerBrandEdits(
      legacy,
      buildBrandFromForm(form, legacy),
      structuredClone(legacy),
      now,
    );
    expect(brand?.marketLanguageRules).toEqual([
      { market: "SE", language: "Swedish" },
      { market: "PL", language: undefined, notes: undefined },
    ]);
  });
});

function harness(initial: BrandIntelligence | undefined, opts: Partial<BrandSaveDeps> = {}) {
  let project: Project = { id: "p1", name: "P1", brandIntelligence: initial } as Project;
  let ready = true;
  let user: string | null = "u1";
  let dirty = false;
  const deps: BrandSaveDeps = {
    getProject: (id) => (id === project.id ? project : undefined),
    isReady: () => ready,
    sessionKey: () => user,
    hasUnsavedChanges: () => dirty,
    updateProject: vi.fn((_id, patch) => {
      project = { ...project, ...patch };
      dirty = true;
    }),
    saveWorkspaceNow: vi.fn(async () => {
      dirty = false;
    }),
    now: () => now,
    ...opts,
  };
  return {
    deps,
    project: () => project,
    setReady: (v: boolean) => (ready = v),
    setUser: (v: string | null) => (user = v),
    setDirty: (v: boolean) => (dirty = v),
    reject: () => {
      deps.saveWorkspaceNow = vi.fn(async () => {
        throw new Error("network");
      });
    },
    resolve: () => {
      deps.saveWorkspaceNow = vi.fn(async () => {
        dirty = false;
      });
    },
  };
}
const toneForm = (b: BrandIntelligence, tone: string) => ({ ...toBrandForm(b), tone });

beforeEach(() => resetOwnerBrandAttempts());

describe("save lifecycle", () => {
  it("saves a mixed edit on a 19-offer profile and confirms each requested value", async () => {
    const h = harness(structuredClone(legacy));
    const form = toBrandForm(legacy);
    form.tone = "Direct";
    form.primaryCtaLabel = "Get in touch";
    form.primaryOffers = form.primaryOffers.map((o, i) =>
      i === 0 ? { ...o, url: "https://example.com/first" } : o,
    );
    const result = await saveOwnerBrandForm("p1", form, legacy, h.deps);
    expect(result).toMatchObject({
      status: "saved",
      changed: ["voice.tone", "offers.primaryOffers", "ctas.primaryCtaLabel"],
    });
    const saved = h.project().brandIntelligence!;
    expect(saved.offers?.primaryOffers).toHaveLength(19);
    expect(saved.offers?.primaryOffers?.[0].url).toBe("https://example.com/first");
    expect(saved.offers?.primaryOffers?.slice(1)).toEqual(legacy.offers.primaryOffers.slice(1));
    expect(saved.ctas).toEqual({ primaryCtaLabel: "Get in touch", primaryCtaUrl: "/contact" });
    expect(h.deps.saveWorkspaceNow).toHaveBeenCalledOnce();
  });

  it("refuses an invalid URL with no write and no save", async () => {
    const h = harness(structuredClone(legacy));
    const form = toBrandForm(legacy);
    form.tone = "Direct";
    form.secondaryCtaUrl = "//evil.example";
    const result = await saveOwnerBrandForm("p1", form, legacy, h.deps);
    expect(result).toMatchObject({ status: "invalid", error: { code: "invalidUrl" } });
    expect(h.deps.updateProject).not.toHaveBeenCalled();
    expect(h.deps.saveWorkspaceNow).not.toHaveBeenCalled();
    expect(form.tone).toBe("Direct");
  });

  it("reports a conflict without writing", async () => {
    const h = harness({ ...structuredClone(legacy), voice: { tone: "Changed elsewhere" } });
    expect(await saveOwnerBrandForm("p1", toneForm(legacy, "Direct"), legacy, h.deps)).toEqual({
      status: "conflict",
      field: "voice.tone",
    });
    expect(h.deps.updateProject).not.toHaveBeenCalled();
  });

  it("does not write when the workspace is not ready or the project is missing", async () => {
    const h = harness(structuredClone(legacy));
    const form = toneForm(legacy, "Direct");
    h.setReady(false);
    expect(await saveOwnerBrandForm("p1", form, legacy, h.deps)).toEqual({ status: "unavailable" });
    h.setReady(true);
    expect(await saveOwnerBrandForm("missing", form, legacy, h.deps)).toEqual({
      status: "unavailable",
    });
    expect(h.deps.updateProject).not.toHaveBeenCalled();
  });

  it("reports a no-op without writing when nothing is unconfirmed", async () => {
    const h = harness(structuredClone(legacy));
    expect(await saveOwnerBrandForm("p1", toBrandForm(legacy), legacy, h.deps)).toEqual({
      status: "noop",
    });
    expect(h.deps.saveWorkspaceNow).not.toHaveBeenCalled();
  });

  it("flushes instead of claiming no changes while the workspace holds unconfirmed changes", async () => {
    const h = harness(structuredClone(legacy));
    h.setDirty(true);
    expect(await saveOwnerBrandForm("p1", toBrandForm(legacy), legacy, h.deps)).toMatchObject({
      status: "saved",
      changed: [],
    });
    expect(h.deps.updateProject).not.toHaveBeenCalled();
    expect(h.deps.saveWorkspaceNow).toHaveBeenCalledOnce();
  });

  it("failed → unchanged retry rewrites and confirms the same value", async () => {
    const h = harness(structuredClone(legacy));
    h.reject();
    const form = toneForm(legacy, "Direct");
    expect(await saveOwnerBrandForm("p1", form, legacy, h.deps)).toEqual({
      status: "failed",
      message: "network",
    });
    // The attempt stays as an unconfirmed workspace change; nothing is rolled back.
    expect(h.project().brandIntelligence?.voice?.tone).toBe("Direct");
    h.resolve();
    expect(await saveOwnerBrandForm("p1", form, legacy, h.deps)).toMatchObject({
      status: "saved",
      changed: ["voice.tone"],
    });
    expect(h.deps.saveWorkspaceNow).toHaveBeenCalledOnce();
  });

  it("failed → correction saves without a conflict against its own attempt", async () => {
    const h = harness(structuredClone(legacy));
    h.reject();
    await saveOwnerBrandForm("p1", toneForm(legacy, "Direct"), legacy, h.deps);
    h.resolve();
    expect(
      await saveOwnerBrandForm("p1", toneForm(legacy, "Friendly"), legacy, h.deps),
    ).toMatchObject({ status: "saved" });
    expect(h.project().brandIntelligence?.voice?.tone).toBe("Friendly");
  });

  it("failed → explicit revert writes the confirmed value back instead of a no-op", async () => {
    const h = harness(structuredClone(legacy));
    h.reject();
    await saveOwnerBrandForm("p1", toneForm(legacy, "Direct"), legacy, h.deps);
    h.resolve();
    expect(await saveOwnerBrandForm("p1", toBrandForm(legacy), legacy, h.deps)).toMatchObject({
      status: "saved",
      changed: ["voice.tone"],
    });
    expect(h.project().brandIntelligence?.voice?.tone).toBe("Calm");
  });

  it("failed, then another writer changes the same field: a correction is a real conflict", async () => {
    const h = harness(structuredClone(legacy));
    h.reject();
    await saveOwnerBrandForm("p1", toneForm(legacy, "Direct"), legacy, h.deps);
    h.deps.updateProject("p1", {
      brandIntelligence: { ...h.project().brandIntelligence, voice: { tone: "Theirs" } },
    });
    h.resolve();
    expect(await saveOwnerBrandForm("p1", toneForm(legacy, "Friendly"), legacy, h.deps)).toEqual({
      status: "conflict",
      field: "voice.tone",
    });
    expect(h.project().brandIntelligence?.voice?.tone).toBe("Theirs");
  });

  it("a reopened editor shows the unconfirmed attempt as an edit, not as the confirmed baseline", async () => {
    const h = harness(structuredClone(legacy));
    h.reject();
    await saveOwnerBrandForm("p1", toneForm(legacy, "Direct"), legacy, h.deps);
    const current = h.project().brandIntelligence;
    const baseline = ownerBrandBaseline("p1", current, "u1");
    expect(baseline?.voice?.tone).toBe("Calm ");
    expect(ownerBrandBaseline("p1", current, "u2")?.voice?.tone).toBe("Direct");
    h.resolve();
    // Form opened on the current value (Direct), compared with the confirmed baseline.
    expect(await saveOwnerBrandForm("p1", toBrandForm(current), baseline, h.deps)).toMatchObject({
      status: "saved",
      changed: ["voice.tone"],
    });
    expect(ownerBrandBaseline("p1", h.project().brandIntelligence, "u1")?.voice?.tone).toBe(
      "Direct",
    );
  });

  it("does not remember or write anything into a new session", async () => {
    const h = harness(structuredClone(legacy));
    h.deps.saveWorkspaceNow = vi.fn(async () => {
      h.setUser("u2");
    });
    expect(await saveOwnerBrandForm("p1", toneForm(legacy, "Direct"), legacy, h.deps)).toEqual({
      status: "failed",
    });
    expect(ownerBrandBaseline("p1", h.project().brandIntelligence, "u2")?.voice?.tone).toBe(
      "Direct",
    );
  });

  it("does not claim success when the stored value differs after the save", async () => {
    const h = harness(structuredClone(legacy));
    h.deps.saveWorkspaceNow = vi.fn(async () => {
      h.deps.updateProject("p1", { brandIntelligence: { ...legacy, voice: { tone: "Other" } } });
    });
    expect(await saveOwnerBrandForm("p1", toneForm(legacy, "Direct"), legacy, h.deps)).toEqual({
      status: "failed",
    });
    expect(h.project().brandIntelligence?.voice?.tone).toBe("Other");
  });
});

describe("CI: explicit restore after this editor's failed row deletion", () => {
  const meta = {
    voice: { tone: "Calm" },
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
  const kinds = ["primaryOffers", "internalLinks", "marketLanguageRules"] as const;
  const rowsOf = (b: BrandIntelligence | undefined, kind: (typeof kinds)[number]) =>
    kind === "primaryOffers" ? b?.offers?.primaryOffers : b?.[kind];

  it.each(kinds)("persists the restored %s row with its metadata", async (kind) => {
    const h = harness(structuredClone(meta));
    h.reject();
    const rejecting = h.deps.saveWorkspaceNow;
    const deleted = { ...toBrandForm(meta), [kind]: [] };
    expect((await saveOwnerBrandForm("p1", deleted, meta, h.deps)).status).toBe("failed");
    expect(rowsOf(h.project().brandIntelligence, kind)).toEqual([]);
    h.resolve();
    expect(await saveOwnerBrandForm("p1", toBrandForm(meta), meta, h.deps)).toMatchObject({
      status: "saved",
      changed: [kind === "primaryOffers" ? "offers.primaryOffers" : kind],
    });
    expect(rejecting).toHaveBeenCalledOnce();
    expect(h.deps.saveWorkspaceNow).toHaveBeenCalledOnce();
    expect(rowsOf(h.project().brandIntelligence, kind)).toEqual(rowsOf(meta, kind));
  });

  it.each(kinds)("a remounted editor can restore the %s row too", async (kind) => {
    const h = harness(structuredClone(meta));
    h.reject();
    await saveOwnerBrandForm("p1", { ...toBrandForm(meta), [kind]: [] }, meta, h.deps);
    h.resolve();
    const baseline = ownerBrandBaseline("p1", h.project().brandIntelligence, "u1");
    expect(rowsOf(baseline, kind)).toEqual(rowsOf(meta, kind));
    expect(await saveOwnerBrandForm("p1", toBrandForm(baseline), baseline, h.deps)).toMatchObject({
      status: "saved",
    });
    expect(rowsOf(h.project().brandIntelligence, kind)).toEqual(rowsOf(meta, kind));
  });
});
