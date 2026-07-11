/**
 * Phase 1C.1 — project_setup_proposal schema + validator. Pure tests: fixed
 * clocks and ids, no mocks, no DB, no MCP. Also proves the type is DARK in
 * 1C.1: it has a validator but is NOT creatable (createPendingAction rejects
 * it), so no runtime path — flag on or off — can mint one until 1C.2/1C.3.
 */
import { describe, it, expect } from "vitest";
import {
  PENDING_ACTION_TYPES,
  PROJECT_SETUP_PROJECT_FIELDS,
  PROJECT_SETUP_SERVICE_FIELDS,
  PROJECT_SETUP_OPPORTUNITY_FIELDS,
  MAX_PROJECT_SETUP_SERVICES,
  MAX_PROJECT_SETUP_OPPORTUNITIES,
  MAX_PROJECT_SETUP_TARGET_LOCATIONS,
  MAX_PROJECT_SETUP_ADDITIONAL_LANGUAGES,
  MAX_PROJECT_SETUP_COMPETITOR_URLS,
  MAX_PENDING_ACTION_PAYLOAD_BYTES,
  PendingActionValidationError,
  createPendingAction,
  validatePendingActionPayload,
  validateProjectSetupPayload,
  derivePendingActionRisk,
  type ProjectSetupProposalPayload,
} from "./pending-actions";

const T0 = "2026-07-11T12:00:00.000Z";

const validPayload = (): Record<string, unknown> => ({
  projectFields: {
    businessName: "Synergy Massage",
    businessType: "Massage studio",
    description: "A boutique massage studio in central Stockholm.",
    targetAudience: "Office workers with desk-related tension",
    toneOfVoice: "Warm, professional, reassuring",
    uniqueSellingPoints: "Late evening hours; certified medical massage",
    brandNotes: "Avoid spa clichés",
    mainLocation: "Stockholm",
    targetLocations: ["Stockholm", "Solna"],
    primaryLanguage: "Swedish",
    additionalLanguages: ["English"],
    competitorUrls: ["https://competitor-a.se", "https://competitor-b.se/prices"],
  },
  services: [
    { name: "Deep tissue massage", kind: "Service", description: "60 or 90 minutes", targetAudience: "Athletes", locationRelevance: "Stockholm", priority: "High" },
    { name: "Gift cards", kind: "Product" },
  ],
  opportunities: [
    {
      title: "Massage for office workers — complete guide",
      contentType: "Guide",
      searchIntent: "Informational",
      targetAudience: "Desk workers",
      businessValue: "High-volume informational query with local booking intent.",
      recommendedCta: "Book a session",
      priority: "High",
    },
    { title: "Deep tissue vs classic massage" },
  ],
});

const validate = (payload: unknown) => validatePendingActionPayload("project_setup_proposal", payload);
const expectInvalid = (payload: unknown, fieldContains: string) => {
  try {
    validate(payload);
  } catch (e) {
    expect(e).toBeInstanceOf(PendingActionValidationError);
    expect((e as PendingActionValidationError).field).toContain(fieldContains);
    return;
  }
  throw new Error(`expected validation to fail on ${fieldContains}`);
};

describe("1C.1 darkness — schema exists but the type is not creatable", () => {
  it("PENDING_ACTION_TYPES (the create gate) still contains only opportunity_update_proposal", () => {
    expect([...PENDING_ACTION_TYPES]).toEqual(["opportunity_update_proposal"]);
  });

  it("createPendingAction rejects project_setup_proposal as an unknown type, even with a valid payload", () => {
    expect(() =>
      createPendingAction(
        [],
        {
          type: "project_setup_proposal",
          projectId: "synergy",
          title: "Set up Synergy Massage",
          summary: "Fill in the project profile from the website.",
          payload: validPayload(),
          preview: "- businessName → Synergy Massage",
        },
        { id: "pa1", nowIso: T0 },
      ),
    ).toThrowError(/unknown pending action type/);
  });

  it("derives medium risk for project_setup_proposal (decision §12.7)", () => {
    expect(derivePendingActionRisk("project_setup_proposal")).toBe("medium");
  });
});

describe("validateProjectSetupPayload — valid payloads", () => {
  it("accepts a maximal realistic payload and returns only whitelisted, trimmed values", () => {
    const out = validate(validPayload()) as ProjectSetupProposalPayload;
    expect(out.projectFields?.businessName).toBe("Synergy Massage");
    expect(out.projectFields?.competitorUrls).toEqual(["https://competitor-a.se", "https://competitor-b.se/prices"]);
    expect(out.services).toHaveLength(2);
    expect(out.services?.[1]).toEqual({ name: "Gift cards", kind: "Product" });
    expect(out.opportunities).toHaveLength(2);
    expect(out.opportunities?.[1]).toEqual({ title: "Deep tissue vs classic massage" });
  });

  it("accepts a single-group payload (each group alone)", () => {
    expect(validate({ projectFields: { description: "A studio." } })).toBeTruthy();
    expect(validate({ services: [{ name: "Massage", kind: "Service" }] })).toBeTruthy();
    expect(validate({ opportunities: [{ title: "A topic" }] })).toBeTruthy();
  });

  it("trims strings", () => {
    const out = validate({ projectFields: { businessName: "  Synergy  " } }) as ProjectSetupProposalPayload;
    expect(out.projectFields?.businessName).toBe("Synergy");
  });

  it("deduplicates competitorUrls and additionalLanguages, preserving order", () => {
    const out = validate({
      projectFields: {
        competitorUrls: ["https://a.se", "https://b.se", "https://a.se"],
        additionalLanguages: ["English", "English"],
      },
    }) as ProjectSetupProposalPayload;
    expect(out.projectFields?.competitorUrls).toEqual(["https://a.se", "https://b.se"]);
    expect(out.projectFields?.additionalLanguages).toEqual(["English"]);
  });

  it("accepts the documented maximum array sizes", () => {
    const out = validate({
      projectFields: {
        targetLocations: Array.from({ length: MAX_PROJECT_SETUP_TARGET_LOCATIONS }, (_, i) => `City ${i}`),
        additionalLanguages: ["English", "Polish", "Danish"].slice(0, MAX_PROJECT_SETUP_ADDITIONAL_LANGUAGES),
        competitorUrls: Array.from({ length: MAX_PROJECT_SETUP_COMPETITOR_URLS }, (_, i) => `https://competitor-${i}.se`),
      },
      services: Array.from({ length: MAX_PROJECT_SETUP_SERVICES }, (_, i) => ({ name: `Service ${i}`, kind: "Service" })),
      opportunities: Array.from({ length: MAX_PROJECT_SETUP_OPPORTUNITIES }, (_, i) => ({ title: `Topic ${i}` })),
    }) as ProjectSetupProposalPayload;
    expect(out.services).toHaveLength(MAX_PROJECT_SETUP_SERVICES);
    expect(out.opportunities).toHaveLength(MAX_PROJECT_SETUP_OPPORTUNITIES);
  });
});

describe("validateProjectSetupPayload — group presence rules", () => {
  it("rejects an empty payload (no groups)", () => expectInvalid({}, "payload"));
  it("rejects empty projectFields", () => expectInvalid({ projectFields: {} }, "projectFields"));
  it("rejects an empty services array", () => expectInvalid({ services: [] }, "services"));
  it("rejects an empty opportunities array", () => expectInvalid({ opportunities: [] }, "opportunities"));
  it("rejects non-object payloads", () => {
    for (const bad of [null, "x", 5, ["a"]]) expectInvalid(bad, "payload");
  });
});

describe("validateProjectSetupPayload — unknown and excluded fields fail closed", () => {
  it("rejects unknown top-level keys", () => expectInvalid({ ...validPayload(), keywords: ["massage"] }, "keywords"));

  it("rejects nested unknown keys in every group", () => {
    expectInvalid({ projectFields: { seoTitle: "x" } }, "projectFields.seoTitle");
    expectInvalid({ services: [{ name: "S", kind: "Service", price: 100 }] }, "services[0].price");
    expectInvalid({ opportunities: [{ title: "T", publish: true }] }, "opportunities[0].publish");
  });

  it("keeps identity/ops/billing/publishing/GSC fields inexpressible (unknown field)", () => {
    const excluded = [
      "name",
      "websiteUrl",
      "setupComplete",
      "market",
      "currency",
      "appLanguage",
      "primaryContentLanguage",
      "growthGoals",
      "onboardingCompletedAt",
      "onboardingSourceData",
      "publishingPlatform",
      "publishEndpoint",
      "publishSecret",
      "livePublishEndpoint",
      "publishMode",
      "connectorType",
      "wordpress",
      "shopify",
      "gscLite",
      "gscOAuth",
      "brandIntelligence",
      "billing",
      "id",
    ];
    for (const key of excluded) {
      expectInvalid({ projectFields: { [key]: "x" } }, `projectFields.${key}`);
      expect((PROJECT_SETUP_PROJECT_FIELDS as readonly string[]).includes(key)).toBe(false);
    }
    expect((PROJECT_SETUP_SERVICE_FIELDS as readonly string[]).includes("id")).toBe(false);
    expect((PROJECT_SETUP_OPPORTUNITY_FIELDS as readonly string[]).includes("status")).toBe(false);
  });
});

describe("validateProjectSetupPayload — bounds and caps", () => {
  it("enforces string bounds", () => {
    expectInvalid({ projectFields: { businessName: "x".repeat(201) } }, "businessName");
    expectInvalid({ projectFields: { description: "x".repeat(2001) } }, "description");
    expectInvalid({ projectFields: { mainLocation: "x".repeat(121) } }, "mainLocation");
    expectInvalid({ services: [{ name: "x".repeat(121), kind: "Service" }] }, "services[0].name");
    expectInvalid({ services: [{ name: "S", kind: "Service", description: "x".repeat(401) }] }, "services[0].description");
    expectInvalid({ opportunities: [{ title: "x".repeat(201) }] }, "opportunities[0].title");
    expectInvalid({ opportunities: [{ title: "T", businessValue: "x".repeat(501) }] }, "opportunities[0].businessValue");
    expectInvalid({ projectFields: { businessName: "   " } }, "businessName"); // whitespace-only trims to empty
  });

  it("enforces array caps", () => {
    expectInvalid({ services: Array.from({ length: MAX_PROJECT_SETUP_SERVICES + 1 }, (_, i) => ({ name: `S${i}`, kind: "Service" })) }, "services");
    expectInvalid({ opportunities: Array.from({ length: MAX_PROJECT_SETUP_OPPORTUNITIES + 1 }, (_, i) => ({ title: `T${i}` })) }, "opportunities");
    expectInvalid({ projectFields: { targetLocations: Array.from({ length: MAX_PROJECT_SETUP_TARGET_LOCATIONS + 1 }, (_, i) => `C${i}`) } }, "targetLocations");
    expectInvalid({ projectFields: { additionalLanguages: ["English", "Polish", "Danish", "Swedish"] } }, "additionalLanguages");
    expectInvalid({ projectFields: { competitorUrls: Array.from({ length: MAX_PROJECT_SETUP_COMPETITOR_URLS + 1 }, (_, i) => `https://c${i}.se`) } }, "competitorUrls");
  });

  it("rejects required fields when missing and malformed members", () => {
    expectInvalid({ services: [{ kind: "Service" }] }, "services[0].name");
    expectInvalid({ services: [{ name: "S" }] }, "services[0].kind");
    expectInvalid({ opportunities: [{ contentType: "Guide" }] }, "opportunities[0].title");
    expectInvalid({ services: ["not-an-object"] }, "services[0]");
    expectInvalid({ projectFields: { targetLocations: [42] } }, "targetLocations[0]");
    expectInvalid({ projectFields: { targetLocations: "Stockholm" } }, "targetLocations");
  });

  it("rejects payloads over the 16KB cap before field validation", () => {
    const oversized = { projectFields: { description: "x".repeat(MAX_PENDING_ACTION_PAYLOAD_BYTES) } };
    expectInvalid(oversized, "payload");
  });
});

describe("validateProjectSetupPayload — enums", () => {
  it("checks enum-backed fields against the runtime mirrors", () => {
    expectInvalid({ projectFields: { primaryLanguage: "German" } }, "primaryLanguage");
    expectInvalid({ projectFields: { additionalLanguages: ["Klingon"] } }, "additionalLanguages[0]");
    expectInvalid({ services: [{ name: "S", kind: "Subscription" }] }, "services[0].kind");
    expectInvalid({ services: [{ name: "S", kind: "Service", priority: "Urgent" }] }, "services[0].priority");
    expectInvalid({ opportunities: [{ title: "T", contentType: "Press Release" }] }, "opportunities[0].contentType");
    expectInvalid({ opportunities: [{ title: "T", searchIntent: "Curious" }] }, "opportunities[0].searchIntent");
    expectInvalid({ opportunities: [{ title: "T", priority: "Top" }] }, "opportunities[0].priority");
  });
});

describe("validateProjectSetupPayload — competitor URL validation", () => {
  it("accepts only https URLs with a host", () => {
    for (const bad of ["http://competitor.se", "ftp://competitor.se", "competitor.se", "not a url", "https://", "javascript:alert(1)"]) {
      expectInvalid({ projectFields: { competitorUrls: [bad] } }, "competitorUrls[0]");
    }
    const out = validate({ projectFields: { competitorUrls: ["https://competitor.se/path?x=1"] } }) as ProjectSetupProposalPayload;
    expect(out.projectFields?.competitorUrls).toEqual(["https://competitor.se/path?x=1"]);
  });

  it("bounds URL length at 300", () => {
    expectInvalid({ projectFields: { competitorUrls: [`https://c.se/${"x".repeat(300)}`] } }, "competitorUrls[0]");
  });
});

describe("validateProjectSetupPayload — direct export parity", () => {
  it("validateProjectSetupPayload and validatePendingActionPayload agree", () => {
    const direct = validateProjectSetupPayload(validPayload());
    const dispatched = validate(validPayload());
    expect(dispatched).toEqual(direct);
  });

  it("validatePendingActionPayload still rejects unknown types", () => {
    expect(() => validatePendingActionPayload("growth_plan_proposal" as never, { projectFields: { description: "x" } })).toThrowError(
      /unknown pending action type/,
    );
  });
});
