import { describe, expect, it } from "vitest";
import type { ContentAsset, Opportunity } from "./types";
import {
  InvalidOpportunityTransitionError,
  canTransitionOpportunity,
  newOpportunityRecord,
  opportunityDeduplicationKey,
  opportunityLifecycleStatus,
  opportunityView,
  restoreOpportunityRecord,
  transitionOpportunityRecord,
} from "./opportunities";

const legacyOpportunity: Opportunity = {
  id: "opp-1",
  projectId: "project-1",
  title: "Reusable makeup remover guide",
  language: "English",
  contentType: "Guide",
  searchIntent: "Commercial",
  targetAudience: "Eco-conscious shoppers",
  businessValue: "Strong search demand and product relevance.",
  recommendedCta: "Shop reusable cloths",
  priority: "High",
  status: "Linked",
  source: "audit",
};

const draft: ContentAsset = {
  id: "asset-1",
  projectId: "project-1",
  opportunityId: "opp-1",
  title: legacyOpportunity.title,
  slug: "reusable-makeup-remover-guide",
  metaTitle: "Reusable makeup remover guide",
  metaDescription: "Guide",
  h1: legacyOpportunity.title,
  outline: [],
  faq: [],
  cta: "Shop",
  markdown: "Draft",
  internalLinks: [],
  schemaSuggestions: [],
  editorNotes: "",
  status: "Draft",
  updatedAt: "2026-07-19T08:00:00.000Z",
};

describe("opportunity lifecycle", () => {
  it("maps legacy records without mutating them", () => {
    expect(opportunityLifecycleStatus(legacyOpportunity)).toBe("captured");
    expect(legacyOpportunity.status).toBe("Linked");
  });

  it("derives content workflow state from the linked asset", () => {
    expect(opportunityLifecycleStatus(legacyOpportunity, draft)).toBe("drafting");
    expect(opportunityLifecycleStatus(legacyOpportunity, { ...draft, status: "In Review" })).toBe(
      "in_review",
    );
    expect(
      opportunityLifecycleStatus(legacyOpportunity, {
        ...draft,
        status: "Approved",
        livePublishStatus: "published",
        liveUrl: "https://example.com/reusable-guide",
      }),
    ).toBe("published");
  });

  it("adds provenance and governance defaults for legacy views", () => {
    const view = opportunityView(legacyOpportunity);
    expect(view.primarySource).toBe("site_audit");
    expect(view.reasonDiscovered).toBe(legacyOpportunity.businessValue);
    expect(view.businessImpact).toBe("high");
    expect(view.version).toBe(1);
    expect(view.sourceRefs).toHaveLength(1);
  });

  it("enforces the canonical forward workflow", () => {
    expect(canTransitionOpportunity("captured", "prioritized")).toBe(true);
    expect(canTransitionOpportunity("captured", "scheduled")).toBe(false);
    expect(() => transitionOpportunityRecord(legacyOpportunity, "scheduled")).toThrow(
      InvalidOpportunityTransitionError,
    );
  });

  it("requires a date when scheduling", () => {
    const prioritized = transitionOpportunityRecord(
      legacyOpportunity,
      "prioritized",
      { ownerName: "Sofia Lind" },
      undefined,
      "2026-07-19T09:00:00.000Z",
    );
    expect(() => transitionOpportunityRecord(prioritized, "scheduled")).toThrow(
      "Choose a due date",
    );
    const scheduled = transitionOpportunityRecord(
      prioritized,
      "scheduled",
      { dueAt: "2026-07-21" },
      undefined,
      "2026-07-19T09:05:00.000Z",
    );
    expect(scheduled.status).toBe("scheduled");
    expect(scheduled.dueAt).toBe("2026-07-21");
  });

  it("archives and restores the previous active stage", () => {
    const prioritized = transitionOpportunityRecord(legacyOpportunity, "prioritized");
    const archived = transitionOpportunityRecord(prioritized, "archived");
    expect(archived.previousStatus).toBe("prioritized");
    expect(archived.archivedAt).toBeTruthy();
    const restored = restoreOpportunityRecord(archived);
    expect(restored.status).toBe("prioritized");
    expect(restored.archivedAt).toBeUndefined();
  });

  it("creates a canonical captured record with a stable discovery trail", () => {
    const created = newOpportunityRecord(
      {
        ...legacyOpportunity,
        id: "opp-new",
        status: "captured",
        creationMode: "milo_discovery",
      },
      "2026-07-19T10:00:00.000Z",
    );
    expect(created.status).toBe("captured");
    expect(created.createdAt).toBe("2026-07-19T10:00:00.000Z");
    expect(created.sourceRefs?.[0]?.capturedAt).toBe("2026-07-19T10:00:00.000Z");
  });

  it("deduplicates by project, source, and normalized title", () => {
    const a = opportunityDeduplicationKey(legacyOpportunity);
    const b = opportunityDeduplicationKey({
      ...legacyOpportunity,
      title: "  REUSABLE   MAKEUP remover guide ",
    });
    expect(a).toBe(b);
  });
});
