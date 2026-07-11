/**
 * Phase 1C.2/1C.3 — server-side create + apply of project_setup_proposal over
 * an in-memory workspace row. Apply tests seed pending actions directly (the
 * exact stored shape the create path mints). Covers: atomic apply (fields +
 * services + opportunities in one rev bump), whitelist merge, defaults,
 * dedupe/caps/overflow, fail-closed paths, retry purity, and audit metadata
 * redaction.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Opportunity, PendingAction, Project, ServiceItem } from "./types";

const h = vi.hoisted(() => ({
  row: null as { data: Record<string, unknown>; rev: number } | null,
  updates: 0,
  retryOnce: false,
}));

vi.mock("./workspace.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./workspace.server")>();
  return {
    ...actual,
    readWorkspaceRow: async () => (h.row ? { data: h.row.data, rev: h.row.rev } : null),
    mutateWorkspace: async (_userId: string, mutate: (data: Record<string, unknown>) => { data: Record<string, unknown>; result: unknown }) => {
      if (!h.row) throw new actual.WorkspaceNotFoundError();
      if (h.retryOnce) {
        // Simulate a rev-conflict retry: the pure callback runs twice on
        // fresh clones; only the second run persists.
        h.retryOnce = false;
        mutate(structuredClone(h.row.data));
      }
      const next = mutate(structuredClone(h.row.data));
      h.row = { data: next.data, rev: h.row.rev + 1 };
      h.updates += 1;
      return { result: next.result, rev: h.row.rev };
    },
  };
});

import {
  createPendingActionForWorkspace,
  resolvePendingActionForWorkspace,
  buildPendingActionCreatedAudit,
  buildPendingActionResolutionAudit,
  PendingActionNotFoundError,
  PendingActionResolveError,
} from "./pending-actions.server";
import { MILO_ACTIONS_PROPOSE_SCOPE, PENDING_ACTION_TTL_MS } from "./pending-actions";

const T0 = "2026-07-11T12:00:00.000Z";
const T1 = "2026-07-12T12:00:00.000Z";
const USER = "owner1";
const IDS = ["id1", "id2", "id3", "id4", "id5", "id6", "id7", "id8", "id9", "id10"]; // positional pool: consumed in creation order (services first, then opportunities)

// Planted probe strings — none may ever reach an audit detail.
const PLANT = {
  business: "PlantedXBusinessName",
  service: "PlantedXServiceName",
  oppTitle: "PlantedXOpportunityTitle",
  url: "https://plantedx-competitor.example",
  cta: "PlantedXCallToAction",
  audience: "PlantedXAudience",
  description: "PlantedXDescription",
};

const project = (): Project =>
  ({
    id: "synergy",
    name: "Synergy (identity)",
    websiteUrl: "https://synergymassage.se",
    businessName: "Old business name",
    businessType: "Old type",
    primaryLanguage: "Swedish",
    additionalLanguages: [],
    mainLocation: "Old town",
    targetLocations: ["Old town"],
    description: "Old description",
    targetAudience: "Old audience",
    toneOfVoice: "Old tone",
    uniqueSellingPoints: "Old USP",
    brandNotes: "Old notes",
    publishEndpoint: "https://keep.example/publish",
    publishSecret: "keep-this-secret",
    connectorType: "custom",
    setupComplete: false,
    market: "SE",
    currency: "SEK",
    appLanguage: "sv",
    growthGoals: ["keep-goal"],
    gscLite: { keep: true } as never,
  }) as Project;

const setupPayload = (): Record<string, unknown> => ({
  projectFields: {
    businessName: PLANT.business,
    description: PLANT.description,
    targetLocations: ["Stockholm", "Solna"],
    competitorUrls: [PLANT.url],
  },
  services: [{ name: PLANT.service, kind: "Service", priority: "High" }, { name: "Gift cards", kind: "Product" }],
  opportunities: [
    { title: PLANT.oppTitle, recommendedCta: PLANT.cta, targetAudience: PLANT.audience, businessValue: "Planted value", priority: "High", contentType: "Guide", searchIntent: "Commercial" },
    { title: "Second topic" },
  ],
});

const seedAction = (payload: Record<string, unknown>, overrides: Partial<PendingAction> = {}): void => {
  const action: PendingAction = {
    id: "ps1",
    type: "project_setup_proposal",
    projectId: "synergy",
    title: "Set up Synergy Massage",
    summary: "Fill the project profile from the website.",
    status: "pending",
    source: "claude",
    createdAt: T0,
    updatedAt: T0,
    expiresAt: new Date(Date.parse(T0) + PENDING_ACTION_TTL_MS).toISOString(),
    requestId: "setup-req-1",
    proposedByClientId: "client_A",
    requiredScope: MILO_ACTIONS_PROPOSE_SCOPE,
    payload,
    preview: "- businessName → …",
    riskLevel: "medium",
    ...overrides,
  };
  (h.row!.data.pendingActions as PendingAction[]).push(action);
};

const approve = (deps: { nowIso?: string; ids?: string[] } = { nowIso: T1, ids: IDS }) =>
  resolvePendingActionForWorkspace(USER, { actionId: "ps1", resolution: "approve_apply" }, deps);

const storedProject = () => (h.row!.data.projects as Project[])[0];
const storedServices = () => h.row!.data.services as ServiceItem[];
const storedOpportunities = () => h.row!.data.opportunities as Opportunity[];
const storedAction = () => (h.row!.data.pendingActions as PendingAction[]).find((a) => a.id === "ps1")!;

beforeEach(() => {
  h.row = {
    data: {
      projects: [project()],
      services: [{ id: "s0", projectId: "synergy", name: "Existing Service", kind: "Service", description: "", targetAudience: "", locationRelevance: "", priority: "Medium" }],
      opportunities: [{ id: "o0", projectId: "synergy", title: "Existing Opportunity", language: "Swedish", contentType: "Blog Article", searchIntent: "Informational", targetAudience: "", businessValue: "", recommendedCta: "", priority: "Medium", status: "New" } as Opportunity],
      pendingActions: [],
    },
    rev: 20,
  };
  h.updates = 0;
  h.retryOnce = false;
});

describe("internal create path (registered in 1C.3)", () => {
  it("creates a pending project_setup_proposal when the target project exists", async () => {
    const out = await createPendingActionForWorkspace(
      USER,
      { type: "project_setup_proposal", projectId: "synergy", title: "t", summary: "s", payload: setupPayload(), preview: "p" },
      { id: "created1", nowIso: T0 },
    );
    expect(out.deduped).toBe(false);
    expect(out.action.status).toBe("pending");
    expect(h.row!.data.pendingActions).toHaveLength(1);
  });

  it("unknown target project → uniform not-found, nothing persisted", async () => {
    await expect(
      createPendingActionForWorkspace(
        USER,
        { type: "project_setup_proposal", projectId: "ghost", title: "t", summary: "s", payload: setupPayload(), preview: "p" },
        { id: "nope", nowIso: T0 },
      ),
    ).rejects.toThrowError(PendingActionNotFoundError);
    expect(h.row!.data.pendingActions).toHaveLength(0);
  });
});

describe("approve_apply — happy paths", () => {
  it("fields-only: hand-written whitelist merge, omitted + excluded fields preserved, no entities, empty appliedEntityIds", async () => {
    seedAction({ projectFields: { businessName: "New name", description: "New description", competitorUrls: ["https://a.se"] } });
    const out = await approve();
    expect(out.status).toBe("applied");
    expect(out.rev).toBe(21); // exactly one mutation
    expect(h.updates).toBe(1);

    const p = storedProject();
    expect(p.businessName).toBe("New name");
    expect(p.description).toBe("New description");
    expect(p.competitorUrls).toEqual(["https://a.se"]);
    // Omitted whitelisted fields preserved.
    expect(p.toneOfVoice).toBe("Old tone");
    expect(p.targetLocations).toEqual(["Old town"]);
    expect(p.mainLocation).toBe("Old town");
    // Excluded fields byte-identical.
    expect(p.name).toBe("Synergy (identity)");
    expect(p.websiteUrl).toBe("https://synergymassage.se");
    expect(p.setupComplete).toBe(false);
    expect(p.market).toBe("SE");
    expect(p.currency).toBe("SEK");
    expect(p.appLanguage).toBe("sv");
    expect(p.publishEndpoint).toBe("https://keep.example/publish");
    expect(p.publishSecret).toBe("keep-this-secret");
    expect(p.connectorType).toBe("custom");
    expect(p.growthGoals).toEqual(["keep-goal"]);
    expect(p.gscLite).toEqual({ keep: true });

    expect(storedServices()).toHaveLength(1);
    expect(storedOpportunities()).toHaveLength(1);
    expect(storedAction().status).toBe("applied");
    expect(storedAction().resolution?.appliedEntityIds).toEqual([]);
    expect(storedAction().resolution?.resolvedBy).toBe("owner");
    expect(out.applySummary).toEqual({ createdServices: 0, createdOpportunities: 0, skippedServiceDuplicates: 0, skippedOpportunityDuplicates: 0, skippedOpportunityOverflow: 0 });
  });

  it("competitorUrls untouched when not in the payload", async () => {
    h.row!.data.projects = [{ ...project(), competitorUrls: ["https://keep.se"] }];
    seedAction({ projectFields: { businessName: "New name" } });
    await approve();
    expect(storedProject().competitorUrls).toEqual(["https://keep.se"]);
  });

  it("services-only: server-minted ids, forced projectId, documented defaults, existing services untouched", async () => {
    seedAction({ services: [{ name: "Deep tissue", kind: "Service" }, { name: "Gift cards", kind: "Product", description: "d", targetAudience: "a", locationRelevance: "l", priority: "High" }] });
    const out = await approve();
    const created = storedServices().slice(1);
    expect(created).toEqual([
      { id: "id1", projectId: "synergy", name: "Deep tissue", kind: "Service", description: "", targetAudience: "", locationRelevance: "", priority: "Medium" },
      { id: "id2", projectId: "synergy", name: "Gift cards", kind: "Product", description: "d", targetAudience: "a", locationRelevance: "l", priority: "High" },
    ]);
    expect(storedServices()[0].id).toBe("s0"); // untouched
    expect(storedProject()).toEqual(project()); // no field merge happened
    expect(out.action.resolution?.appliedEntityIds).toEqual(["id1", "id2"]);
  });

  it("opportunities-only: status New, source claude, project language + 1A defaults, createdAt stamped", async () => {
    seedAction({ opportunities: [{ title: "Fresh topic" }] });
    await approve();
    const created = storedOpportunities()[1];
    expect(created).toEqual({
      id: "id1", // first id in the pool — services consumed none
      projectId: "synergy",
      title: "Fresh topic",
      language: "Swedish",
      contentType: "Blog Article",
      searchIntent: "Informational",
      targetAudience: "Old audience", // project default, 1A parity
      businessValue: "Suggested via the Claude connector",
      recommendedCta: "",
      priority: "Medium",
      status: "New",
      source: "claude",
      createdAt: T1,
    });
  });

  it("falls back to English when the project language is not a valid union member", async () => {
    h.row!.data.projects = [{ ...project(), primaryLanguage: "Norwegian" as never }];
    seedAction({ opportunities: [{ title: "Fresh topic" }] });
    await approve();
    expect(storedOpportunities()[1].language).toBe("English");
  });

  it("composite: fields + services + opportunities land in ONE atomic rev bump with correct appliedEntityIds order", async () => {
    seedAction(setupPayload());
    const out = await approve();
    expect(h.updates).toBe(1);
    expect(out.rev).toBe(21);
    expect(storedProject().businessName).toBe(PLANT.business);
    expect(storedServices()).toHaveLength(3);
    expect(storedOpportunities()).toHaveLength(3);
    expect(out.action.resolution?.appliedEntityIds).toEqual(["id1", "id2", "id3", "id4"]);
    expect(storedOpportunities()[1].searchIntent).toBe("Commercial");
    expect(storedOpportunities()[1].contentType).toBe("Guide");
    expect(storedProject().setupComplete).toBe(false); // never flipped
    expect(out.applySummary).toEqual({ createdServices: 2, createdOpportunities: 2, skippedServiceDuplicates: 0, skippedOpportunityDuplicates: 0, skippedOpportunityOverflow: 0 });
  });
});

describe("approve_apply — dedupe and caps", () => {
  it("dedupes services case-insensitively and whitespace-normalized against existing project services", async () => {
    seedAction({ services: [{ name: "  EXISTING service ", kind: "Service" }, { name: "Brand new", kind: "Service" }] });
    const out = await approve();
    expect(storedServices()).toHaveLength(2); // 1 existing + 1 created
    expect(storedServices()[1].name).toBe("Brand new");
    expect(out.applySummary?.skippedServiceDuplicates).toBe(1);
    expect(out.action.resolution?.appliedEntityIds).toEqual(["id1"]); // only the created one
  });

  it("does NOT dedupe against another project's service of the same name", async () => {
    (h.row!.data.services as ServiceItem[]).push({ id: "s9", projectId: "other", name: "Cross-project", kind: "Service", description: "", targetAudience: "", locationRelevance: "", priority: "Medium" });
    seedAction({ services: [{ name: "cross-PROJECT", kind: "Service" }] });
    const out = await approve();
    expect(out.applySummary?.createdServices).toBe(1);
  });

  it("dedupes duplicate services within the same proposal", async () => {
    seedAction({ services: [{ name: "Same Thing", kind: "Service" }, { name: " same thing ", kind: "Product" }] });
    const out = await approve();
    expect(out.applySummary).toMatchObject({ createdServices: 1, skippedServiceDuplicates: 1 });
  });

  it("dedupes opportunities against existing titles and within the proposal", async () => {
    seedAction({ opportunities: [{ title: " existing OPPORTUNITY " }, { title: "New topic" }, { title: "NEW topic" }] });
    const out = await approve();
    expect(storedOpportunities()).toHaveLength(2);
    expect(out.applySummary).toMatchObject({ createdOpportunities: 1, skippedOpportunityDuplicates: 2 });
  });

  it("skips overflow deterministically at MAX_OPPORTUNITIES and counts it (duplicates don't consume slots)", async () => {
    const filler = Array.from({ length: 997 }, (_, i) => ({ id: `f${i}`, projectId: "synergy", title: `Filler ${i}` }) as Opportunity);
    h.row!.data.opportunities = [...(h.row!.data.opportunities as Opportunity[]), ...filler]; // 998 total
    seedAction({ opportunities: [{ title: "Existing Opportunity" }, { title: "Fits 1" }, { title: "Fits 2" }, { title: "Overflow 1" }, { title: "Overflow 2" }] });
    const out = await approve();
    expect(out.applySummary).toEqual({ createdServices: 0, createdOpportunities: 2, skippedServiceDuplicates: 0, skippedOpportunityDuplicates: 1, skippedOpportunityOverflow: 2 });
    const titles = storedOpportunities().map((o) => o.title);
    expect(titles).toContain("Fits 1");
    expect(titles).toContain("Fits 2");
    expect(titles).not.toContain("Overflow 1");
    expect(storedOpportunities()).toHaveLength(1000);
  });
});

describe("approve_apply — fail-closed paths (atomic: nothing written)", () => {
  const expectUnchanged = () => {
    expect(h.updates).toBe(0);
    expect(storedProject()).toEqual(project());
    expect(storedServices()).toHaveLength(1);
    expect(storedOpportunities()).toHaveLength(1);
    expect(storedAction().status).toBe(storedAction().status); // still stored as seeded
  };

  it("project removed between proposal and approval → target_missing, nothing changes", async () => {
    seedAction(setupPayload());
    h.row!.data.projects = [];
    await expect(approve()).rejects.toThrowError(PendingActionResolveError);
    await expect(approve()).rejects.toMatchObject({ reason: "target_missing" });
    expect(h.updates).toBe(0);
    expect(storedServices()).toHaveLength(1);
    expect(storedOpportunities()).toHaveLength(1);
    expect(storedAction().status).toBe("pending");
  });

  it("malformed stored payload (unknown key / empty) fails closed as invalid", async () => {
    seedAction({ projectFields: { seoTitle: "tampered" } });
    await expect(approve()).rejects.toMatchObject({ reason: "invalid" });
    expectUnchanged();
    (h.row!.data.pendingActions as PendingAction[]).length = 0;
    seedAction({});
    await expect(approve()).rejects.toMatchObject({ reason: "invalid" });
    expectUnchanged();
  });

  it("already applied / rejected actions cannot apply again", async () => {
    seedAction(setupPayload(), { status: "applied" });
    await expect(approve()).rejects.toMatchObject({ reason: "not_pending" });
    (h.row!.data.pendingActions as PendingAction[]).length = 0;
    seedAction(setupPayload(), { status: "rejected" });
    await expect(approve()).rejects.toMatchObject({ reason: "not_pending" });
    expect(h.updates).toBe(0);
    expect(storedServices()).toHaveLength(1);
  });

  it("expired action cannot apply", async () => {
    seedAction(setupPayload());
    const lateIso = new Date(Date.parse(T0) + PENDING_ACTION_TTL_MS + 1000).toISOString();
    await expect(approve({ nowIso: lateIso, ids: IDS })).rejects.toMatchObject({ reason: "expired" });
    expect(h.updates).toBe(0);
    expect(storedServices()).toHaveLength(1);
    expect(storedOpportunities()).toHaveLength(1);
  });

  it("double approve cannot create duplicate entities", async () => {
    seedAction(setupPayload());
    await approve();
    await expect(approve()).rejects.toMatchObject({ reason: "not_pending" });
    expect(storedServices()).toHaveLength(3);
    expect(storedOpportunities()).toHaveLength(3);
    expect(h.updates).toBe(1);
  });

  it("rev-conflict retry re-runs the pure mutation without duplicating entities or changing ids", async () => {
    seedAction(setupPayload());
    h.retryOnce = true;
    const out = await approve();
    expect(storedServices()).toHaveLength(3);
    expect(storedOpportunities()).toHaveLength(3);
    expect(new Set(storedServices().map((s) => s.id)).size).toBe(3);
    expect(out.action.resolution?.appliedEntityIds).toEqual(["id1", "id2", "id3", "id4"]); // pre-minted pool, retry-stable
  });
});

describe("audit metadata — names/ids/counts only", () => {
  it("created audit carries sorted whitelisted fieldsChanged + counts and leaks no values", () => {
    seedAction(setupPayload());
    const { event, detail } = buildPendingActionCreatedAudit(storedAction(), { ok: true });
    expect(event).toBe("pending_action_created");
    expect(detail.fieldsChanged).toEqual(["businessName", "competitorUrls", "description", "targetLocations"]);
    expect(detail.serviceCount).toBe(2);
    expect(detail.opportunityCount).toBe(2);
    expect(detail.competitorCount).toBe(1);
    const s = JSON.stringify(detail);
    for (const planted of Object.values(PLANT)) expect(s, `audit must not contain "${planted}"`).not.toContain(planted);
  });

  it("unknown project field names never appear in fieldsChanged (006eaf8 hardening)", () => {
    seedAction({ projectFields: { seoTitle: "tampered", description: "ok" }, services: "not-an-array" });
    const { detail } = buildPendingActionCreatedAudit(storedAction(), { ok: false, error: "validation" });
    expect(detail.fieldsChanged).toEqual(["description"]);
    expect(detail.serviceCount).toBe(0);
    expect(JSON.stringify(detail)).not.toContain("seoTitle");
  });

  it("approved/applied audits carry appliedEntityIds, appliedAtRev, apply summary — and no planted content", async () => {
    seedAction(setupPayload());
    const out = await approve();
    for (const event of ["pending_action_approved", "pending_action_applied"] as const) {
      const { detail } = buildPendingActionResolutionAudit(out.action, event, {
        ok: true,
        ...(event === "pending_action_applied" ? { appliedAtRev: out.rev } : {}),
        applySummary: out.applySummary,
      });
      expect(detail.type).toBe("project_setup_proposal");
      expect(detail.fieldsChanged).toEqual(["businessName", "competitorUrls", "description", "targetLocations"]);
      expect(detail.appliedEntityIds).toEqual(["id1", "id2", "id3", "id4"]);
      expect(detail.createdServices).toBe(2);
      expect(detail.createdOpportunities).toBe(2);
      expect(detail.skippedServiceDuplicates).toBe(0);
      expect(detail.skippedOpportunityDuplicates).toBe(0);
      expect(detail.skippedOpportunityOverflow).toBe(0);
      if (event === "pending_action_applied") expect(detail.appliedAtRev).toBe(out.rev);
      expect(detail.source).toBe("milo_ui");
      const s = JSON.stringify(detail);
      for (const planted of Object.values(PLANT)) expect(s, `audit must not contain "${planted}"`).not.toContain(planted);
    }
  });

  it("1B opportunity_update audits keep their exact shape (no setup keys added)", () => {
    const oppAction: PendingAction = {
      id: "pb1",
      type: "opportunity_update_proposal",
      projectId: "synergy",
      title: "t",
      summary: "s",
      status: "applied",
      source: "claude",
      createdAt: T0,
      updatedAt: T1,
      requiredScope: MILO_ACTIONS_PROPOSE_SCOPE,
      payload: { opportunityId: "o1", updates: { title: "x", recommendedCta: "y" } },
      preview: "p",
      riskLevel: "medium",
      resolution: { resolvedAt: T1, resolvedBy: "owner", appliedEntityIds: ["o1"] },
    };
    const created = buildPendingActionCreatedAudit(oppAction, { ok: true });
    expect(created.detail.fieldsChanged).toEqual(["recommendedCta", "title"]);
    expect(created.detail).not.toHaveProperty("serviceCount");
    const applied = buildPendingActionResolutionAudit(oppAction, "pending_action_applied", { ok: true, appliedAtRev: 22 });
    expect(applied.detail).not.toHaveProperty("appliedEntityIds");
    expect(applied.detail).not.toHaveProperty("createdServices");
  });
});
