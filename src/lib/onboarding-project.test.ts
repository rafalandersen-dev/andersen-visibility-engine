import { describe, expect, it } from "vitest";
import { onboardingProjectPatch } from "./onboarding-project";
import type { Project } from "./types";
const project = (patch: Partial<Project>) =>
  ({
    id: "p",
    businessName: "Owner business",
    description: "Owner description",
    ...patch,
  }) as Project;
describe("interrupted onboarding project ownership", () => {
  it("fills missing fields without erasing populated owner fields", () => {
    expect(
      onboardingProjectPatch(project({}), {
        businessName: "Wizard name",
        description: "",
        targetAudience: "Teams",
        uniqueSellingPoints: "",
      }),
    ).toEqual({ targetAudience: "Teams" });
  });
  it("applies a wizard edit only when the saved field is still current", () => {
    expect(
      onboardingProjectPatch(
        project({ description: "Draft" }),
        { description: "Revised" },
        { description: "Draft" },
      ),
    ).toEqual({ description: "Revised" });
    expect(() =>
      onboardingProjectPatch(
        project({ description: "New owner edit" }),
        { description: "Revised" },
        { description: "Draft" },
      ),
    ).toThrow("onboarding_project_changed");
  });
  it("preserves future owner edits on unchanged wizard fields and does not reopen completed setup", () => {
    expect(
      onboardingProjectPatch(
        project({ description: "New owner edit", setupComplete: true }),
        { description: "Draft", setupComplete: false, onboardingCompletedAt: undefined },
        { description: "Draft" },
      ),
    ).toEqual({});
  });
  it("can finish an existing project without rewriting its profile", () => {
    expect(
      onboardingProjectPatch(project({}), {
        setupComplete: true,
        onboardingCompletedAt: "2026-09-10T10:00:00Z",
      }),
    ).toEqual({ setupComplete: true, onboardingCompletedAt: "2026-09-10T10:00:00Z" });
  });
});
