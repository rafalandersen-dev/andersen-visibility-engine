import { describe, expect, it, vi } from "vitest";
import { readSchedulerControl, setSchedulerControl } from "./weekly-preparation.server";
const scope = { ownerId: "00000000-0000-4000-8000-000000000001", projectId: "project" };
const preparation = { preparationWeekday: 5, preparationTime: "16:00", reviewLeadHours: 48 };
const input = { expectedRevision: 2, engine: "weekly" as const, preparation };
describe("authenticated scheduler settings boundary", () => {
  it("passes the validated owner/project and expected revision to the service RPC", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: { revision: 3, engine: "weekly", preparation }, error: null });
    await expect(setSchedulerControl(scope, input, rpc)).resolves.toMatchObject({ revision: 3 });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("set_project_scheduler_control", {
      p_user: scope.ownerId,
      p_project: scope.projectId,
      p_expected: 2,
      p_engine: "weekly",
      p_preparation: preparation,
    });
  });
  it("does not interpret unavailable or malformed settings as permission to use the monthly engine", async () => {
    for (const response of [
      { data: null, error: null },
      { data: { revision: 0, engine: "weekly", preparation: {} }, error: "denied" },
      { data: { revision: 0, engine: "other", preparation }, error: null },
    ]) {
      await expect(
        readSchedulerControl(scope, vi.fn().mockResolvedValue(response)),
      ).rejects.toThrow("scheduler_control_unavailable");
    }
  });
  it("rejects mismatched write acknowledgements without retrying a possible successful mutation", async () => {
    for (const data of [
      { revision: 2, engine: "weekly", preparation },
      { revision: 3, engine: "monthly", preparation },
      { revision: 3, engine: "weekly", preparation: { ...preparation, reviewLeadHours: 24 } },
    ]) {
      const rpc = vi.fn().mockResolvedValue({ data, error: null });
      await expect(setSchedulerControl(scope, input, rpc)).rejects.toThrow(
        "scheduler_control_unavailable",
      );
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  });
  it("rejects extra authority fields and invalid scope before touching storage", async () => {
    const rpc = vi.fn();
    await expect(
      setSchedulerControl(scope, { ...input, ownerId: scope.ownerId } as typeof input, rpc),
    ).rejects.toThrow();
    await expect(readSchedulerControl({ ...scope, projectId: "../other" }, rpc)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});
