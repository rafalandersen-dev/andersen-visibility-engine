import { describe, expect, it, vi } from "vitest";
import { dispatchWeeklyBatch, WEEKLY_DISPATCH_LIMIT } from "./weekly-dispatch";
const targets = Array.from({ length: WEEKLY_DISPATCH_LIMIT }, (_, i) => ({
  ownerId: "00000000-0000-4000-8000-000000000001",
  projectId: `p${i}`,
}));
describe("bounded weekly batch dispatch", () => {
  it("starts twenty projects concurrently and isolates one failure", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const run = vi.fn(async (scope: (typeof targets)[number]) => {
      await gate;
      if (scope.projectId === "p0") throw new Error("private backend detail");
      return { projectId: scope.projectId, action: "retained" };
    });
    const result = dispatchWeeklyBatch(targets, run);
    expect(run).toHaveBeenCalledTimes(20);
    release();
    const rows = await result;
    expect(rows).toHaveLength(20);
    expect(rows[0]).toEqual({ projectId: "p0", action: "unavailable" });
    expect(rows.slice(1).every((r) => r.action === "retained")).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("private backend");
  });
  it.each(
    [
      [...targets, { ...targets[0], projectId: "overflow" }],
      [targets[0], targets[0]],
      [{ ...targets[0], ownerId: "invalid" }],
    ].map((input) => ({ input })),
  )("rejects invalid batches before any project starts", async ({ input }) => {
    const run = vi.fn();
    await expect(dispatchWeeklyBatch(input, run)).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });
  it("has no work when no weekly projects are eligible", async () => {
    const run = vi.fn();
    expect(await dispatchWeeklyBatch([], run)).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });
});
