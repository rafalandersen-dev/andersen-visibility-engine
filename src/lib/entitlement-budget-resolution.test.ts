import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readEntitlement, resolveEntitledPlanResult } from "./entitlements.server";

const query = vi.hoisted(() => ({ read: vi.fn(), eq: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({ select: () => ({ eq: query.eq }) }),
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  query.eq.mockReturnValue({ maybeSingle: query.read });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("budget entitlement confidence", () => {
  it("distinguishes an absent free account from an unavailable lookup", async () => {
    query.read.mockResolvedValueOnce({ data: null, error: null });
    expect(await resolveEntitledPlanResult("account-a")).toEqual({
      ok: true,
      planId: "freePreview",
    });
    query.read.mockResolvedValueOnce({ data: null, error: { message: "temporary failure" } });
    expect(await resolveEntitledPlanResult("account-a")).toEqual({ ok: false });
    expect(query.eq).toHaveBeenCalledWith("user_id", "account-a");
  });
  it("preserves unknown after a transport exception while legacy access remains fail closed", async () => {
    query.read.mockRejectedValue(new Error("synthetic transport failure"));
    expect(await resolveEntitledPlanResult("account-a")).toEqual({ ok: false });
    expect(await readEntitlement("account-a")).toMatchObject({ planId: "freePreview" });
  });
  it("recovers the paid plan after a transient failure instead of persisting Free", async () => {
    query.read.mockRejectedValueOnce(new Error("synthetic timeout"));
    query.read.mockResolvedValueOnce({
      data: { plan_id: "agency", status: "manualComped", current_period_end: null },
      error: null,
    });
    expect(await resolveEntitledPlanResult("account-a")).toEqual({ ok: false });
    expect(await resolveEntitledPlanResult("account-a")).toEqual({ ok: true, planId: "agency" });
  });
});
