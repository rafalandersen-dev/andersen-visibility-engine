import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AiExpenseUnavailableError,
  AI_EXPENSE_RPC_TIMEOUT_MS,
  reserveAiExpense,
  withReservedAiExpense,
  type ExpenseRequest,
} from "./ai-expense.server";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
const request: ExpenseRequest = {
  requestId: "00000000-0000-4000-8000-000000000021",
  userId: "00000000-0000-4000-8000-000000000022",
  jobId: "00000000-0000-4000-8000-000000000023",
  provider: "synthetic",
  model: "fixture",
  operation: "article",
  ceilingMicrousd: 100,
};
const reserved = { data: [{ allowed: true, reason: "reserved", period: "2026-09" }], error: null };
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("provider expense execution boundary", () => {
  it("refuses a hanging reservation and never starts work after its late confirmation", async () => {
    vi.useFakeTimers();
    let resolve!: (value: typeof reserved) => void;
    mocks.rpc.mockImplementationOnce(
      () =>
        new Promise<typeof reserved>((done) => {
          resolve = done;
        }),
    );
    const execute = vi.fn();
    const assertion = expect(withReservedAiExpense(request, execute)).rejects.toMatchObject({
      reason: "reservation_unavailable",
    });
    await vi.advanceTimersByTimeAsync(AI_EXPENSE_RPC_TIMEOUT_MS + 1);
    await assertion;
    resolve(reserved);
    await vi.runAllTimersAsync();
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });
  it("returns a usable result with pending accounting when reconciliation hangs", async () => {
    vi.useFakeTimers();
    mocks.rpc.mockResolvedValueOnce(reserved).mockImplementationOnce(() => new Promise(() => {}));
    const execute = vi
      .fn()
      .mockResolvedValue({ value: "draft", evidence: { actualMicrousd: null } });
    const result = withReservedAiExpense(request, execute);
    await vi.advanceTimersByTimeAsync(AI_EXPENSE_RPC_TIMEOUT_MS + 1);
    expect(await result).toMatchObject({ value: "draft", accounting: "pending" });
    expect(execute).toHaveBeenCalledOnce();
  });
  it.each([
    { data: null, error: null },
    { data: [], error: null },
    { data: [{ allowed: true, reason: "reserved", period: "2026-13" }], error: null },
    { data: [{ allowed: "true", reason: "reserved", period: "2026-09" }], error: null },
    { data: [{ allowed: true, reason: "anything", period: "2026-09" }], error: null },
    { data: null, error: { message: "secret response must never be logged" } },
    { data: [{ allowed: false, reason: "duplicate_request", period: "2026-09" }], error: null },
  ])("never executes a provider without confirmation %#", async (response) => {
    mocks.rpc.mockResolvedValue(response);
    const execute = vi.fn();
    await expect(withReservedAiExpense(request, execute)).rejects.toBeInstanceOf(
      AiExpenseUnavailableError,
    );
    expect(execute).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
  it("refuses a transport failure before provider work", async () => {
    mocks.rpc.mockRejectedValue(new Error("private transport details"));
    const execute = vi.fn();
    await expect(withReservedAiExpense(request, execute)).rejects.toMatchObject({
      reason: "reservation_unavailable",
    });
    expect(execute).not.toHaveBeenCalled();
  });
  it("reserves, executes exactly once and reconciles measured usage", async () => {
    mocks.rpc
      .mockResolvedValueOnce(reserved)
      .mockResolvedValueOnce({ data: [{ state: "settled", overrun: false }], error: null });
    const execute = vi.fn().mockResolvedValue({
      value: "usable draft",
      evidence: {
        actualMicrousd: 42,
        costSource: "supplier-invoice-v1",
        inputTokens: 10,
        outputTokens: 20,
      },
    });
    expect(await withReservedAiExpense(request, execute)).toEqual({
      value: "usable draft",
      accounting: "settled",
      overrun: false,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({
      p_actual: 42,
      p_user: request.userId,
      p_input_tokens: 10,
      p_output_tokens: 20,
    });
  });
  it("keeps useful output when reconciliation fails without calling the provider again", async () => {
    mocks.rpc.mockResolvedValueOnce(reserved).mockRejectedValueOnce(new Error("private"));
    const execute = vi
      .fn()
      .mockResolvedValue({ value: "usable draft", evidence: { actualMicrousd: null } });
    expect(await withReservedAiExpense(request, execute)).toMatchObject({
      value: "usable draft",
      accounting: "pending",
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith("[ai-expense] reconciliation pending");
  });
  it("does not invent a zero cost for a failed provider", async () => {
    mocks.rpc
      .mockResolvedValueOnce(reserved)
      .mockResolvedValueOnce({ data: [{ state: "unknown", overrun: false }], error: null });
    const execute = vi.fn().mockRejectedValue(new Error("provider failed"));
    await expect(withReservedAiExpense(request, execute)).rejects.toThrow("provider failed");
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_actual: null, p_outcome: "uncertain" });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("retains the reservation if cost evidence is malformed", async () => {
    mocks.rpc.mockResolvedValueOnce(reserved);
    const execute = vi.fn().mockResolvedValue({ value: "draft", evidence: { actualMicrousd: 0 } });
    expect(await withReservedAiExpense(request, execute)).toMatchObject({
      accounting: "pending",
      value: "draft",
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("signals a deadline without reauthorizing the same attempt", async () => {
    vi.useFakeTimers();
    mocks.rpc
      .mockResolvedValueOnce(reserved)
      .mockResolvedValueOnce({ data: [{ state: "unknown", overrun: false }], error: null });
    const execute = vi.fn(
      (signal: AbortSignal) =>
        new Promise<never>((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("deadline"))),
        ),
    );
    const result = withReservedAiExpense(request, execute, 20);
    const assertion = expect(result).rejects.toMatchObject({ reason: "provider_timeout" });
    await vi.advanceTimersByTimeAsync(21);
    await assertion;
    expect(execute).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_actual: null });
  });
  it("stops waiting when a supplier ignores abort and never releases on a late success", async () => {
    vi.useFakeTimers();
    mocks.rpc
      .mockResolvedValueOnce(reserved)
      .mockResolvedValueOnce({ data: [{ state: "unknown", overrun: false }], error: null });
    let resolve!: (value: {
      value: string;
      evidence: { actualMicrousd: number; costSource: string };
    }) => void;
    let signal!: AbortSignal;
    const execute = vi.fn((s: AbortSignal) => {
      signal = s;
      return new Promise<{
        value: string;
        evidence: { actualMicrousd: number; costSource: string };
      }>((done) => {
        resolve = done;
      });
    });
    const result = withReservedAiExpense(request, execute, 20);
    const assertion = expect(result).rejects.toMatchObject({ reason: "provider_timeout" });
    await vi.advanceTimersByTimeAsync(21);
    await assertion;
    expect(signal.aborted).toBe(true);
    resolve({ value: "late draft", evidence: { actualMicrousd: 0, costSource: "late-evidence" } });
    await vi.runAllTimersAsync();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_actual: null, p_outcome: "uncertain" });
  });
  it.each([0, -1, NaN, 1.5, 1000000000001])(
    "rejects an invalid upper bound %s before RPC",
    async (ceilingMicrousd) => {
      await expect(reserveAiExpense({ ...request, ceilingMicrousd })).rejects.toBeInstanceOf(
        AiExpenseUnavailableError,
      );
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );
});
