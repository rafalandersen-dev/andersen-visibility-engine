/**
 * Owner Brand Intelligence save through the REAL store (updateProject owner markers,
 * serialized saveWorkspaceNow, reload) with the fake entity backend at the Supabase
 * client boundary. The fake backend does not emulate concurrent database writers.
 * Apply modes: "fail" rejects before any write; "lost" commits and then returns a
 * transport error (the client cannot know it committed); `gate` holds a request open.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeEntityBackend } from "./workspace-entities.testkit";

const h = vi.hoisted(() => ({
  backend: null as unknown as ReturnType<
    typeof import("./workspace-entities.testkit").makeEntityBackend
  >,
  applyMode: "ok" as "ok" | "fail" | "lost",
  gate: null as Promise<void> | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn !== "apply_workspace_entity_batch") return h.backend.rpc(fn, args);
      if (h.gate) await h.gate;
      if (h.applyMode === "fail") return { data: null, error: { message: "transport failed" } };
      const result = await h.backend.rpc(fn, args);
      if (h.applyMode === "lost") return { data: null, error: { message: "response lost" } };
      return result;
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  },
}));
vi.mock("sonner", () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), dismiss: vi.fn(), message: vi.fn() },
}));

import { getState, hydrateForUser, resetStore, saveWorkspaceNow, updateProject } from "./store";
import {
  ownerBrandBaseline,
  resetOwnerBrandAttempts,
  saveOwnerBrandForm,
  toBrandForm,
} from "@/components/brand-intelligence-form";
import { storeBrandSaveDeps as deps } from "@/components/brand-intelligence-store-deps";
import type { BrandIntelligence } from "./types";

const offers = Array.from({ length: 19 }, (_, i) => ({
  name: `Model ${i + 1}`,
  type: "product" as const,
  priority: "high" as const,
  description: `Model ${i + 1} description`,
}));
const brand: BrandIntelligence = {
  voice: { tone: "Calm" },
  claims: { allowedClaims: ["Existing claim"] },
  offers: { primaryOffers: offers },
  ctas: { primaryCtaLabel: "Contact", primaryCtaUrl: "/contact" },
};
const project = () => getState().projects.find((p) => p.id === "p1")!;

beforeEach(async () => {
  vi.stubGlobal("window", globalThis as unknown as Window);
  h.backend = makeEntityBackend();
  h.applyMode = "ok";
  h.gate = null;
  resetOwnerBrandAttempts();
  h.backend.state.doc = {
    projects: [{ id: "p1", name: "Butelki", brandIntelligence: structuredClone(brand) }],
    activeProjectId: "p1",
  };
  h.backend.state.rev = 1;
  resetStore();
  await hydrateForUser("user1");
});
afterEach(() => vi.unstubAllGlobals());

describe("owner Brand Intelligence save with the real store", () => {
  it("persists a mixed 19-offer edit and reads it back after reload", async () => {
    const baseline = project().brandIntelligence;
    const form = toBrandForm(baseline);
    form.primaryOffers = form.primaryOffers.map((o, i) =>
      i === 0 ? { ...o, url: "https://example.com/model-1" } : o,
    );
    form.primaryCtaLabel = "Ask a question";
    form.allowedClaims = "";
    const result = await saveOwnerBrandForm("p1", form, baseline, deps);
    expect(result).toMatchObject({ status: "saved" });

    resetStore();
    await hydrateForUser("user1");
    const saved = project();
    expect(saved.brandIntelligence?.offers?.primaryOffers).toHaveLength(19);
    expect(saved.brandIntelligence?.offers?.primaryOffers?.[0].url).toBe(
      "https://example.com/model-1",
    );
    expect(saved.brandIntelligence?.offers?.primaryOffers?.slice(1)).toEqual(offers.slice(1));
    expect(saved.brandIntelligence?.ctas).toEqual({
      primaryCtaLabel: "Ask a question",
      primaryCtaUrl: "/contact",
    });
    expect(saved.brandIntelligence?.claims?.allowedClaims).toEqual([]);
    expect(saved.brandIntelligence?.voice?.tone).toBe("Calm");
    expect(saved.brandOwnerFields).toEqual([
      "claims.allowedClaims",
      "ctas.primaryCtaLabel",
      "offers.primaryOffers",
    ]);
  });

  it("writes nothing for an invalid edit", async () => {
    const before = h.backend.state.batches.length;
    const baseline = project().brandIntelligence;
    const form = toBrandForm(baseline);
    form.primaryCtaLabel = "Changed";
    form.primaryCtaUrl = "javascript:alert(1)";
    expect((await saveOwnerBrandForm("p1", form, baseline, deps)).status).toBe("invalid");
    expect(project().brandIntelligence).toEqual(brand);
    expect(project().brandOwnerFields ?? []).toEqual([]);
    expect(h.backend.state.batches.length).toBe(before);
  });

  it("does not report success when the workspace write fails", async () => {
    h.applyMode = "fail";
    const baseline = project().brandIntelligence;
    const form = toBrandForm(baseline);
    form.tone = "Direct";
    expect((await saveOwnerBrandForm("p1", form, baseline, deps)).status).toBe("failed");
  });

  it("does not write before the workspace is hydrated", async () => {
    resetStore();
    const form = toBrandForm(brand);
    form.tone = "Direct";
    expect(await saveOwnerBrandForm("p1", form, brand, deps)).toEqual({ status: "unavailable" });
  });
});

const reload = async () => {
  resetStore();
  await hydrateForUser("user1");
};
type Row = { id: string; name?: string; brandIntelligence?: BrandIntelligence };
const serverProject = () =>
  (h.backend.state.doc as { projects: Row[] }).projects.find((p) => p.id === "p1")!;
const seed = async (patch: BrandIntelligence) => {
  (h.backend.state.doc as { projects: Row[] }).projects[0].brandIntelligence = {
    ...structuredClone(brand),
    ...patch,
  };
  await reload();
};
const flush = () => new Promise((r) => setTimeout(r, 0));
const hold = () => {
  let release!: () => void;
  h.gate = new Promise<void>((r) => (release = r));
  return () => {
    h.gate = null;
    release();
  };
};

describe("CH: failed saves stay retryable, correctable and revertible", () => {
  const fail = async (tone: string) => {
    const baseline = project().brandIntelligence;
    h.applyMode = "fail";
    const result = await saveOwnerBrandForm(
      "p1",
      { ...toBrandForm(baseline), tone },
      baseline,
      deps,
    );
    h.applyMode = "ok";
    return { baseline, result };
  };

  it("failed → changed retry saves the new value (no conflict with its own failed write)", async () => {
    const { baseline, result } = await fail("Direct");
    expect(result).toMatchObject({ status: "failed" });
    // Kept as an unconfirmed workspace change (a lost response may have committed it).
    expect(project().brandIntelligence?.voice?.tone).toBe("Direct");
    expect(serverProject().brandIntelligence?.voice?.tone).toBe("Calm");
    const form = { ...toBrandForm(baseline), tone: "Friendly" };
    expect(await saveOwnerBrandForm("p1", form, baseline, deps)).toMatchObject({ status: "saved" });
    await reload();
    expect(project().brandIntelligence?.voice?.tone).toBe("Friendly");
    expect(project().brandOwnerFields).toEqual(["voice.tone"]);
  });

  it("failed → unchanged retry reaches persistence and confirms", async () => {
    const { baseline } = await fail("Direct");
    const batches = h.backend.state.batches.length;
    const form = { ...toBrandForm(baseline), tone: "Direct" };
    expect(await saveOwnerBrandForm("p1", form, baseline, deps)).toMatchObject({
      status: "saved",
      changed: ["voice.tone"],
    });
    expect(h.backend.state.batches.length).toBe(batches + 1);
    await reload();
    expect(project().brandIntelligence?.voice?.tone).toBe("Direct");
  });

  it.each(["fail", "lost"] as const)(
    "%s → explicit revert → unrelated save → reload keeps the original value",
    async (mode) => {
      const baseline = project().brandIntelligence;
      h.applyMode = mode;
      const attempt = { ...toBrandForm(baseline), tone: "Direct" };
      expect((await saveOwnerBrandForm("p1", attempt, baseline, deps)).status).toBe("failed");
      // "lost": the server did commit the attempt; the client cannot know.
      expect(serverProject().brandIntelligence?.voice?.tone).toBe(
        mode === "lost" ? "Direct" : "Calm",
      );
      h.applyMode = "ok";
      const reverted = toBrandForm(baseline); // the owner reverts the edit and saves
      expect(await saveOwnerBrandForm("p1", reverted, baseline, deps)).toMatchObject({
        status: "saved",
        changed: ["voice.tone"],
      });
      updateProject("p1", { name: "Renamed elsewhere" });
      await saveWorkspaceNow();
      await reload();
      expect(project().name).toBe("Renamed elsewhere");
      expect(project().brandIntelligence?.voice?.tone).toBe("Calm");
    },
  );

  it("an unrelated change made while the save was pending survives failure and correction", async () => {
    const baseline = project().brandIntelligence;
    h.applyMode = "fail";
    const release = hold();
    const pending = saveOwnerBrandForm(
      "p1",
      { ...toBrandForm(baseline), tone: "Direct" },
      baseline,
      deps,
    );
    await flush();
    updateProject("p1", {
      brandIntelligence: { ...project().brandIntelligence, avoid: ["Concurrent"] },
    });
    release();
    expect((await pending).status).toBe("failed");
    h.applyMode = "ok";
    const correction = { ...toBrandForm(baseline), tone: "Friendly" };
    expect(await saveOwnerBrandForm("p1", correction, baseline, deps)).toMatchObject({
      status: "saved",
    });
    await reload();
    expect(project().brandIntelligence).toMatchObject({
      voice: { tone: "Friendly" },
      avoid: ["Concurrent"],
    });
  });

  it("a different writer's value for the same field stays a real conflict after a failure", async () => {
    const baseline = project().brandIntelligence;
    h.applyMode = "fail";
    const release = hold();
    const attempt = { ...toBrandForm(baseline), tone: "Direct", primaryCtaLabel: "Ask" };
    const pending = saveOwnerBrandForm("p1", attempt, baseline, deps);
    await flush();
    const latest = project().brandIntelligence!;
    updateProject("p1", {
      brandIntelligence: { ...latest, ctas: { ...latest.ctas, primaryCtaLabel: "Theirs" } },
    });
    release();
    expect((await pending).status).toBe("failed");
    h.applyMode = "ok";
    expect(await saveOwnerBrandForm("p1", attempt, baseline, deps)).toEqual({
      status: "conflict",
      field: "ctas.primaryCtaLabel",
    });
    expect(project().brandIntelligence?.ctas?.primaryCtaLabel).toBe("Theirs");
  });

  it("a remounted editor treats the failed attempt as an edit and can confirm it", async () => {
    await fail("Direct");
    const current = project().brandIntelligence;
    const baseline = ownerBrandBaseline("p1", current, deps.sessionKey());
    expect(baseline?.voice?.tone).toBe("Calm");
    const form = toBrandForm(current); // the remounted form shows Direct
    expect(await saveOwnerBrandForm("p1", form, baseline, deps)).toMatchObject({
      status: "saved",
      changed: ["voice.tone"],
    });
    await reload();
    expect(project().brandIntelligence?.voice?.tone).toBe("Direct");
  });

  it("a save with no form changes flushes unconfirmed workspace changes", async () => {
    updateProject("p1", { name: "Pending rename" });
    const baseline = project().brandIntelligence;
    expect(await saveOwnerBrandForm("p1", toBrandForm(baseline), baseline, deps)).toMatchObject({
      status: "saved",
      changed: [],
    });
    expect(serverProject().name).toBe("Pending rename");
  });

  it("writes nothing into a new session when the session changes during the save", async () => {
    const baseline = project().brandIntelligence;
    const release = hold();
    const pending = saveOwnerBrandForm(
      "p1",
      { ...toBrandForm(baseline), tone: "Direct" },
      baseline,
      deps,
    );
    await flush();
    resetStore(); // sign-out while the request is open
    release();
    expect(await pending).toMatchObject({
      status: "failed",
      message: expect.stringMatching(/session changed/i),
    });
    expect(getState().hydrated).toBe(false);
    expect(getState().projects.some((p) => p.id === "p1")).toBe(false);
    await hydrateForUser("user1");
    expect(ownerBrandBaseline("p1", project().brandIntelligence, deps.sessionKey())).toBe(
      project().brandIntelligence,
    );
  });
});

describe("CH: list entries and row metadata survive save and reload", () => {
  it("deleting down to one comma entry keeps it intact in claims and proof", async () => {
    await seed({
      claims: { allowedClaims: ["Professional from £1,490", "Other claim"] },
      proof: { proofPoints: ["Professional from £1,490", "Other proof"] },
    });
    const baseline = project().brandIntelligence;
    const form = toBrandForm(baseline);
    form.allowedClaims = "Professional from £1,490\n";
    form.proofPoints = "Professional from £1,490";
    expect((await saveOwnerBrandForm("p1", form, baseline, deps)).status).toBe("saved");
    await reload();
    expect(project().brandIntelligence?.claims?.allowedClaims).toEqual([
      "Professional from £1,490",
    ]);
    expect(project().brandIntelligence?.proof?.proofPoints).toEqual(["Professional from £1,490"]);
  });

  it("editing an offer URL keeps its legacy metadata", async () => {
    const legacyOffer = {
      ...offers[0],
      legacyId: "catalog-15",
      source: { kind: "owner-import", revision: 1 },
    };
    await seed({ offers: { primaryOffers: [legacyOffer, ...offers.slice(1)] } });
    const baseline = project().brandIntelligence;
    const form = toBrandForm(baseline);
    form.primaryOffers = form.primaryOffers.map((o, i) =>
      i === 0 ? { ...o, url: "https://example.com/model-1" } : o,
    );
    expect((await saveOwnerBrandForm("p1", form, baseline, deps)).status).toBe("saved");
    await reload();
    expect(project().brandIntelligence?.offers?.primaryOffers?.[0]).toEqual({
      ...legacyOffer,
      url: "https://example.com/model-1",
    });
    expect(project().brandIntelligence?.offers?.primaryOffers).toHaveLength(19);
  });
});

describe("CI: restore after this editor's failed deletion survives persistence and reload", () => {
  const offer = {
    ...offers[0],
    legacyId: "catalog-15",
    source: { kind: "owner-import", revision: 1 },
  };
  const link = { label: "Book", url: "/book", type: "booking", priority: "high", legacyId: "l-1" };
  const rule = { market: "SE", notes: "Swedish copy", legacyId: "r-1" };
  const seeded = {
    offers: { primaryOffers: [offer, ...offers.slice(1)] },
    internalLinks: [link],
    marketLanguageRules: [rule],
  } as unknown as BrandIntelligence;
  const kinds = ["primaryOffers", "internalLinks", "marketLanguageRules"] as const;
  const rowsOf = (b: BrandIntelligence | undefined, kind: (typeof kinds)[number]) =>
    kind === "primaryOffers" ? b?.offers?.primaryOffers : b?.[kind];

  it.each(
    (["fail", "lost"] as const).flatMap((mode) => kinds.map((kind) => [mode, kind] as const)),
  )("%s deletion of %s → explicit restore → reload", async (mode, kind) => {
    await seed(seeded);
    const baseline = project().brandIntelligence;
    const expected = structuredClone(rowsOf(baseline, kind));
    h.applyMode = mode;
    const deleted = { ...toBrandForm(baseline), [kind]: [] };
    expect((await saveOwnerBrandForm("p1", deleted, baseline, deps)).status).toBe("failed");
    expect(rowsOf(serverProject().brandIntelligence, kind)).toEqual(
      mode === "lost" ? [] : expected,
    );
    h.applyMode = "ok";
    const batches = h.backend.state.batches.length;
    expect(await saveOwnerBrandForm("p1", toBrandForm(baseline), baseline, deps)).toMatchObject({
      status: "saved",
    });
    expect(h.backend.state.batches.length).toBe(batches + 1);
    await reload();
    expect(rowsOf(project().brandIntelligence, kind)).toEqual(expected);
  });

  it("a remounted editor restores the deleted offer with its metadata", async () => {
    await seed(seeded);
    const baseline = project().brandIntelligence;
    h.applyMode = "fail";
    await saveOwnerBrandForm("p1", { ...toBrandForm(baseline), primaryOffers: [] }, baseline, deps);
    h.applyMode = "ok";
    const remounted = ownerBrandBaseline("p1", project().brandIntelligence, deps.sessionKey());
    expect(await saveOwnerBrandForm("p1", toBrandForm(remounted), remounted, deps)).toMatchObject({
      status: "saved",
    });
    await reload();
    expect(project().brandIntelligence?.offers?.primaryOffers?.[0]).toEqual(offer);
    expect(project().brandIntelligence?.offers?.primaryOffers).toHaveLength(19);
  });

  it("an oversized confirmed list shortened by a failed save can be restored, not expanded", async () => {
    const big = Array.from({ length: 205 }, (_, i) => `Claim ${i}`);
    await seed({ claims: { forbiddenClaims: big } });
    const baseline = project().brandIntelligence;
    h.applyMode = "fail";
    const shortened = { ...toBrandForm(baseline), forbiddenClaims: big.slice(0, 10).join("\n") };
    expect((await saveOwnerBrandForm("p1", shortened, baseline, deps)).status).toBe("failed");
    h.applyMode = "ok";
    const larger = { ...toBrandForm(baseline), forbiddenClaims: [...big, "One more"].join("\n") };
    expect(await saveOwnerBrandForm("p1", larger, baseline, deps)).toMatchObject({
      status: "invalid",
      error: { code: "limit" },
    });
    expect(await saveOwnerBrandForm("p1", toBrandForm(baseline), baseline, deps)).toMatchObject({
      status: "saved",
    });
    await reload();
    expect(project().brandIntelligence?.claims?.forbiddenClaims).toEqual(big);
  });
});
