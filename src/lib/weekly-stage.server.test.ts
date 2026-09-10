import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runWeeklyStage } from "./weekly-stage.server";
const uuid = "00000000-0000-4000-8000-000000000001";
const hash = "a".repeat(64);
const start = {
  acquired: true,
  requestId: uuid,
  outputId: uuid,
  inputHash: hash,
  state: "running",
  result: null,
};
const config = () => ({
  scope: { ownerId: uuid, projectId: "p" },
  lease: uuid,
  revision: 1,
  publishAt: "2099-09-15T07:00:00Z",
  stage: "content" as const,
  inputHash: hash,
  parseResult: (value: unknown) => z.object({ receiptId: z.string().uuid() }).strict().parse(value),
  work: vi.fn().mockResolvedValue({ receiptId: uuid }),
});
describe("weekly stage paid replay prevention", () => {
  it("uses allocated identity and records only a retained result acknowledgement", async () => {
    const args = config();
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: start })
      .mockResolvedValueOnce({ data: true });
    await expect(runWeeklyStage(args, rpc)).resolves.toEqual({ receiptId: uuid });
    expect(args.work).toHaveBeenCalledExactlyOnceWith({ requestId: uuid, outputId: uuid });
    expect(rpc.mock.calls[1][1].p_result).toEqual({ receiptId: uuid });
  });
  it("returns an existing result without another provider callback", async () => {
    const args = config();
    const rpc = vi.fn().mockResolvedValue({
      data: { ...start, acquired: false, state: "retained", result: { receiptId: uuid } },
    });
    await expect(runWeeklyStage(args, rpc)).resolves.toEqual({ receiptId: uuid });
    expect(args.work).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("holds unknown, changed-input and invalid claims without provider work", async () => {
    for (const data of [
      { ...start, acquired: false, state: "unknown" },
      { ...start, inputHash: "b".repeat(64) },
      null,
      { ...start, state: "retained" },
    ]) {
      const args = config();
      await expect(runWeeklyStage(args, vi.fn().mockResolvedValue({ data }))).rejects.toThrow(
        "weekly_stage_recovery_required",
      );
      expect(args.work).not.toHaveBeenCalled();
    }
  });
  it("recovers a lost stage acknowledgement from the exact archived request", async () => {
    const args = config();
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { ...start, acquired: false, state: "unknown" } })
      .mockResolvedValueOnce({ data: { receiptId: uuid } });
    await expect(runWeeklyStage(args, rpc)).resolves.toEqual({ receiptId: uuid });
    expect(args.work).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenLastCalledWith("recover_weekly_preparation_stage", {
      p_user: uuid,
      p_project: "p",
      p_request: uuid,
    });
  });
  it("does not replay work or mark it failed after losing the retention acknowledgement", async () => {
    const args = config();
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: start })
      .mockRejectedValueOnce(new Error("timeout"));
    await expect(runWeeklyStage(args, rpc)).rejects.toThrow("weekly_stage_recovery_required");
    expect(args.work).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("records unknown on callback failure and retains the original error", async () => {
    const args = config();
    args.work.mockRejectedValue(new Error("generation paused"));
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: start })
      .mockResolvedValueOnce({ data: true });
    await expect(runWeeklyStage(args, rpc)).rejects.toThrow("generation paused");
    expect(rpc.mock.calls[1][1].p_result).toBeNull();
    expect(args.work).toHaveBeenCalledTimes(1);
  });
});
