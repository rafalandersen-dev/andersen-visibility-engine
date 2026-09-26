/**
 * Authenticated-layout onboarding guard contract (P4 integration fix): a non-owner reviewer with zero or
 * incomplete own projects must still reach /app/citation-review (the owner-shared review link), while normal
 * onboarding elsewhere is preserved. Authentication/hydration are NOT decided here (see route.tsx).
 */
import { describe, expect, it } from "vitest";
import { ONBOARDING_EXEMPT_PATHS, onboardingRedirectNeeded } from "./onboarding-guard";
import type { Project } from "./types";

const project = (over: Partial<Project>): Project =>
  ({ id: "p1", businessName: "", setupComplete: false, ...over }) as Project;
const complete = project({ id: "p1", setupComplete: true });
const incomplete = project({ id: "p2", setupComplete: false, businessName: "" });

describe("onboardingRedirectNeeded — review link reachable without an owned workspace", () => {
  it("a reviewer with ZERO own projects is NOT redirected off /app/citation-review", () => {
    expect(
      onboardingRedirectNeeded({
        pathname: "/app/citation-review",
        projects: [],
        activeProjectId: null,
      }),
    ).toBe(false);
  });
  it("a reviewer with only an INCOMPLETE own project is NOT redirected off /app/citation-review", () => {
    expect(
      onboardingRedirectNeeded({
        pathname: "/app/citation-review",
        projects: [incomplete],
        activeProjectId: "p2",
      }),
    ).toBe(false);
  });
  it("normal onboarding elsewhere is preserved for the same users", () => {
    expect(
      onboardingRedirectNeeded({ pathname: "/app/plan", projects: [], activeProjectId: null }),
    ).toBe(true);
    expect(
      onboardingRedirectNeeded({
        pathname: "/app/plan",
        projects: [incomplete],
        activeProjectId: "p2",
      }),
    ).toBe(true);
    expect(
      onboardingRedirectNeeded({
        pathname: "/app/ai-visibility",
        projects: [],
        activeProjectId: null,
      }),
    ).toBe(true);
  });
  it("a set-up active project (or first project when none is active) needs no onboarding", () => {
    expect(
      onboardingRedirectNeeded({
        pathname: "/app/plan",
        projects: [complete],
        activeProjectId: "p1",
      }),
    ).toBe(false);
    expect(
      onboardingRedirectNeeded({
        pathname: "/app/plan",
        projects: [complete, incomplete],
        activeProjectId: null,
      }),
    ).toBe(false);
    expect(
      onboardingRedirectNeeded({
        pathname: "/app/plan",
        projects: [complete, incomplete],
        activeProjectId: "p2",
      }),
    ).toBe(true);
  });
  it("the exemption is the EXACT path only — a sibling or prefixed path still onboards", () => {
    expect(
      onboardingRedirectNeeded({
        pathname: "/app/citation-review/other",
        projects: [],
        activeProjectId: null,
      }),
    ).toBe(true);
    expect(
      onboardingRedirectNeeded({ pathname: "/app/citation", projects: [], activeProjectId: null }),
    ).toBe(true);
  });
  it("keeps the previously exempt paths (consent, setup, connect, team pages, workspace root)", () => {
    for (const p of [
      "/app/onboarding",
      "/app/connect",
      "/app/setup",
      "/app/collaborators",
      "/app/conversations",
      "/app",
      "/app/",
    ]) {
      expect(ONBOARDING_EXEMPT_PATHS).toContain(p);
      expect(onboardingRedirectNeeded({ pathname: p, projects: [], activeProjectId: null })).toBe(
        false,
      );
    }
  });
});
