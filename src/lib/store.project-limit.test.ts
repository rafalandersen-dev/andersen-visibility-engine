/**
 * The client project cap follows the mirrored plan (Free 1, Starter 1, Growth 3,
 * Pro 5, Agency 15) instead of a fixed 5. Existing over-cap projects stay; only an
 * addition is refused. The database trigger re-checks the same map server-side.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeEntityBackend } from "./workspace-entities.testkit";
import type { PlanId } from "./billing";

const h = vi.hoisted(() => ({
  backend: null as unknown as ReturnType<
    typeof import("./workspace-entities.testkit").makeEntityBackend
  >,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => h.backend.rpc(fn, args) },
}));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

import { ProjectLimitError, addProject, getState, resetStore, setState } from "./store";

const project = { name: "P", websiteUrl: "https://example.test" } as Parameters<
  typeof addProject
>[0];
const withPlan = (planId: PlanId | null, count: number, status = "active") =>
  setState((s) => ({
    ...s,
    subscription: planId
      ? ({ planId, status, billingMarket: "Other", currency: "EUR", priceMonthly: 0 } as never)
      : undefined,
    projects: Array.from({ length: count }, (_, i) => ({ ...project, id: `e${i}` })),
  }));

beforeEach(() => {
  vi.stubGlobal("window", globalThis as unknown as Window);
  h.backend = makeEntityBackend();
  resetStore();
});
afterEach(() => vi.unstubAllGlobals());

describe("addProject uses the plan's project cap", () => {
  it.each([
    [null, 1],
    ["starter", 1],
    ["growth", 3],
    ["pro", 5],
    ["agency", 15],
  ] as const)("%s refuses the project after %i", (planId, cap) => {
    withPlan(planId, cap - 1);
    addProject(project, { isOwner: false });
    expect(getState().projects).toHaveLength(cap);
    expect(() => addProject(project, { isOwner: false })).toThrow(ProjectLimitError);
    expect(getState().projects).toHaveLength(cap);
  });

  it("keeps existing over-cap projects, treats an unpaid mirror as Free, and lets owners add", () => {
    withPlan("growth", 5);
    expect(() => addProject(project, { isOwner: false })).toThrow("Project limit reached (3)");
    expect(getState().projects).toHaveLength(5);
    withPlan("agency", 1, "pastDue");
    expect(() => addProject(project, { isOwner: false })).toThrow("Project limit reached (1)");
    addProject(project, { isOwner: true });
    expect(getState().projects).toHaveLength(2);
  });
});
