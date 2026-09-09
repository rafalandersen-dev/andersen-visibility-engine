import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discardGenerationResult,
  listGenerationResults,
  readGenerationResult,
  retainGenerationResult,
  GENERATION_RESULT_TIMEOUT_MS,
} from "./generation-result.server";
const user = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
const time = "2026-09-09T12:00:00.123456+00:00";
const payload = {
  imageId: "image",
  version: 1,
  kind: "image",
  projectId: "p",
  assetId: "a",
  title: "Image",
  concept: "A studio",
  output: { path: `${user}/p/a/i.webp`, alt: "A studio" },
};
const response = (data: unknown) => ({ data, error: null });
afterEach(() => vi.useRealTimers());
describe("private result server boundary", () => {
  it("stores only the validated payload under the server-owned identity", async () => {
    const rpc = vi.fn().mockResolvedValue(response([{ receipt_id: id, state: "retained" }]));
    await retainGenerationResult(user, id, payload, rpc);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("record_generation_result", {
      p_user: user,
      p_id: id,
      p_result: payload,
    });
    await expect(
      retainGenerationResult(user, id, { ...payload, previewUrl: "secret-preview" }, rpc),
    ).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each([
    [],
    null,
    [{ receipt_id: id, state: "completed" }],
    [{ receipt_id: user, state: "retained" }],
  ])("refuses unconfirmed storage %#", async (data) => {
    await expect(
      retainGenerationResult(user, id, payload, vi.fn().mockResolvedValue(response(data))),
    ).rejects.toMatchObject({ code: "generation_result_unavailable" });
  });
  it("lists metadata under the exact account/project and preserves cursor precision", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue(
        response([
          { receipt_id: id, created_at: time, project_id: "p", title: "Image", kind: "image" },
        ]),
      );
    expect(await listGenerationResults(user, "p", { id, createdAt: time }, rpc)).toEqual({
      items: [{ id, createdAt: time, projectId: "p", title: "Image", kind: "image" }],
      nextCursor: null,
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("list_generation_results", {
      p_user: user,
      p_project: "p",
      p_before: time,
      p_before_id: id,
    });
  });
  it("returns null only for a confirmed absence and rejects a foreign image path", async () => {
    await expect(
      readGenerationResult(user, id, vi.fn().mockResolvedValue(response([]))),
    ).resolves.toBeNull();
    const rpc = vi
      .fn()
      .mockResolvedValue(response([{ receipt_id: id, created_at: time, payload }]));
    expect(await readGenerationResult(user, id, rpc)).toEqual({
      id,
      createdAt: time,
      result: payload,
    });
    rpc.mockResolvedValue(
      response([
        {
          receipt_id: id,
          created_at: time,
          payload: { ...payload, output: { ...payload.output, path: "someone/p/a/i.webp" } },
        },
      ]),
    );
    await expect(readGenerationResult(user, id, rpc)).rejects.toMatchObject({
      code: "generation_result_unavailable",
    });
  });
  it("rejects repeated or wrong-project list rows", async () => {
    const row = {
      receipt_id: id,
      created_at: time,
      project_id: "p",
      title: "Image",
      kind: "image",
    };
    await expect(
      listGenerationResults(
        user,
        undefined,
        undefined,
        vi.fn().mockResolvedValue(response([row, row])),
      ),
    ).rejects.toThrow();
    await expect(
      listGenerationResults(user, "another", undefined, vi.fn().mockResolvedValue(response([row]))),
    ).rejects.toThrow();
  });
  it("discards only through a confirmed scoped RPC", async () => {
    const rpc = vi.fn().mockResolvedValue(response([{ receipt_id: id, state: "discarded" }]));
    await discardGenerationResult(user, id, rpc);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("discard_generation_result", {
      p_user: user,
      p_id: id,
    });
  });
  it("bounds a stalled result write without starting another write", async () => {
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    const rpc = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const result = expect(
      retainGenerationResult(user, id, payload, rpc as never),
    ).rejects.toMatchObject({ code: "generation_result_unavailable" });
    await vi.advanceTimersByTimeAsync(GENERATION_RESULT_TIMEOUT_MS + 1);
    await result;
    finish(response([{ receipt_id: id, state: "retained" }]));
    await vi.runAllTimersAsync();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not expose a database response in the user error", async () => {
    await expect(
      listGenerationResults(
        user,
        undefined,
        undefined,
        vi.fn().mockResolvedValue({ data: null, error: { message: "private database content" } }),
      ),
    ).rejects.toThrow("Milo could not confirm the saved result");
  });
});
