import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ list: vi.fn(), read: vi.fn(), discard: vi.fn(), recover: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (v: unknown) => v;
    const b = {
      middleware: () => b,
      inputValidator: (fn: typeof parse) => {
        parse = fn;
        return b;
      },
      handler: (fn: (arg: unknown) => unknown) => (args: { data: unknown; context: unknown }) =>
        fn({ ...args, data: parse(args.data) }),
    };
    return b;
  },
}));
vi.mock("./generation-result.server", () => ({
  listGenerationResults: h.list,
  readGenerationResult: h.read,
  discardGenerationResult: h.discard,
}));
vi.mock("./generation-recovery.server", () => ({ recoverGenerationResult: h.recover }));
import {
  listGenerationResultsFn,
  readGenerationResultFn,
  discardGenerationResultFn,
  recoverGenerationResultFn,
} from "./generation-result.functions";
const id = "00000000-0000-4000-8000-000000000001";
const call = (fn: unknown, data: unknown) =>
  (fn as (v: unknown) => Promise<unknown>)({ data, context: { userId: "authenticated-owner" } });
beforeEach(() => vi.resetAllMocks());
describe("authenticated generation-result functions", () => {
  it("uses the authenticated account for all reads and writes", async () => {
    await call(listGenerationResultsFn, { projectId: "p" });
    await call(readGenerationResultFn, { receiptId: id });
    await call(discardGenerationResultFn, { receiptId: id });
    await call(recoverGenerationResultFn, { receiptId: id });
    expect(h.list).toHaveBeenCalledExactlyOnceWith("authenticated-owner", "p", undefined);
    for (const fn of [h.read, h.discard, h.recover])
      expect(fn).toHaveBeenCalledExactlyOnceWith("authenticated-owner", id);
  });
  it.each([readGenerationResultFn, discardGenerationResultFn, recoverGenerationResultFn])(
    "refuses caller-supplied ownership, artifact or approval fields %#",
    (fn) => {
      for (const extra of [
        { userId: "victim" },
        { assetId: "override" },
        { approved: true },
        { retry: true },
        { payload: { markdown: "overwrite" } },
        { receiptId: "invalid" },
      ])
        expect(() => call(fn, { receiptId: id, ...extra })).toThrow();
      expect(h.recover).not.toHaveBeenCalled();
    },
  );
  it("rejects unsafe list filters and unexpected scope", () => {
    for (const data of [
      { userId: "victim" },
      { projectId: "../other" },
      { limit: 10000 },
      { cursor: { id, createdAt: "invalid" } },
    ])
      expect(() => call(listGenerationResultsFn, data)).toThrow();
    expect(h.list).not.toHaveBeenCalled();
  });
  it("does not return private infrastructure errors from recovery", async () => {
    h.recover.mockRejectedValue(new Error("private database payload"));
    await expect(call(recoverGenerationResultFn, { receiptId: id })).rejects.toThrow(
      "Milo could not restore this result",
    );
  });
});
