import { describe, expect, it } from "vitest";
import { projectReadiness } from "./project-readiness";
import type { Project, ServiceItem } from "./types";
const project = {
  id: "p",
  businessName: "Business",
  websiteUrl: "https://example.test",
  publishSecret: "private-fixture",
  wordpress: { applicationPassword: "private-fixture", lastTestStatus: "success" },
} as Project;
describe("stored profile completeness", () => {
  it("reports individual gaps without treating the old setup checkbox as proof", () => {
    const result = projectReadiness({ ...project, setupComplete: true }, []);
    expect(result.sections.find((s) => s.id === "business")).toEqual({
      id: "business",
      status: "partial",
      present: ["businessName", "websiteUrl"],
      missing: ["businessType", "description"],
    });
    expect(result.integrations).toBe("not_checked");
    expect(result.publication).toBe("not_checked");
  });
  it("counts only described services in the selected project", () => {
    const services = [
      { projectId: "other", name: "Other", description: "Other" },
      { projectId: "p", name: "Own", description: "  " },
    ] as ServiceItem[];
    expect(projectReadiness(project, services).catalog).toEqual({
      total: 1,
      withNameAndDescription: 0,
    });
  });
  it("uses actual language fields and ignores whitespace-only brand entries", () => {
    const result = projectReadiness(
      {
        ...project,
        primaryContentLanguage: "pl",
        brandIntelligence: { claims: { allowedClaims: [" "] }, voice: { tone: "Calm" } },
      },
      [],
    );
    expect(result.sections.find((s) => s.id === "audience_and_market")?.present).toContain(
      "primaryLanguage",
    );
    expect(result.sections.find((s) => s.id === "brand_claims")?.status).toBe("empty");
    expect(result.sections.find((s) => s.id === "brand_voice")?.present).toEqual(["tone"]);
  });
  it("never returns profile values, credentials or modifies source records", () => {
    const before = structuredClone(project);
    const output = JSON.stringify(projectReadiness(project, []));
    expect(output).not.toContain("private-fixture");
    expect(output).not.toContain("https://example.test");
    expect(output).not.toContain("applicationPassword");
    expect(project).toEqual(before);
  });
});
