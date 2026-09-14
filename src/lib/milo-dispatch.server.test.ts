import { afterEach, describe, expect, it, vi } from "vitest";
import { handleMiloDispatch } from "./milo-dispatch.server";
import type { ConversationTurn } from "./milo-conversation";
const target = {
  actorId: "00000000-0000-4000-8000-000000000001",
  ownerId: "00000000-0000-4000-8000-000000000002",
  projectId: "p",
  conversationId: "00000000-0000-4000-8000-000000000003",
  turnId: "00000000-0000-4000-8000-000000000004",
};
// Deliberately synthetic credential; never reads an environment or real secret.
const credential = "fixture-scheduler-value";
function fixture() {
  return {
    secret: vi.fn(async (): Promise<string | null> => credential),
    run: vi.fn(async () => ({ state: "completed", body: "private answer" }) as ConversationTurn),
  };
}
function request(body = JSON.stringify(target), headers: Record<string, string> = {}) {
  return new Request("https://milogrowth.com/api/milo/run", {
    method: "POST",
    headers: {
      authorization: `Bearer ${credential}`,
      "content-type": "application/json",
      ...headers,
    },
    body,
  });
}
afterEach(() => vi.useRealTimers());
describe("private independent Milo dispatch", () => {
  it("authenticates before reading or running any task", async () => {
    const deps = fixture();
    expect((await handleMiloDispatch(request("bad", { authorization: "" }), deps)).status).toBe(
      401,
    );
    expect(deps.secret).not.toHaveBeenCalled();
    for (const authorization of ["Bearer wrong", `Bearer ${credential.toUpperCase()}`])
      expect((await handleMiloDispatch(request("bad", { authorization }), deps)).status).toBe(403);
    expect(deps.run).not.toHaveBeenCalled();
  });
  it("fails closed on absent or failed configuration without exposing its error", async () => {
    const deps = fixture();
    deps.secret.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error(credential));
    for (const error of ["configuration_unavailable", "dispatch_unavailable"]) {
      const result = await handleMiloDispatch(request(), deps);
      expect(result.status).toBe(503);
      expect(await result.json()).toEqual({ error });
    }
    expect(deps.run).not.toHaveBeenCalled();
  });
  it("passes only immutable identifiers to the existing executor and returns no conversation content", async () => {
    const deps = fixture();
    const result = await handleMiloDispatch(request(), deps);
    const { actorId, ...saved } = target;
    expect(deps.run).toHaveBeenCalledExactlyOnceWith(actorId, saved);
    expect(await result.json()).toEqual({ ok: true, state: "completed" });
    expect(result.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects supplied content, generation permission, roles, claims, arrays and invalid scope", async () => {
    const deps = fixture();
    for (const body of [
      { ...target, actorId: "invalid" },
      { ...target, projectId: "../p" },
      { ...target, body: "Replace saved content" },
      { ...target, allowDraftGeneration: true },
      { ...target, role: "content" },
      { ...target, attemptId: target.turnId },
      { ...target, events: [] },
      [target],
      {},
      null,
    ])
      expect((await handleMiloDispatch(request(JSON.stringify(body)), deps)).status).toBe(400);
    expect(deps.run).not.toHaveBeenCalled();
  });
  it("bounds actual bytes regardless of the declared size and rejects malformed envelopes", async () => {
    const deps = fixture();
    for (const [body, headers] of [
      [JSON.stringify(target), { "content-length": "2049" }],
      [JSON.stringify(target), { "content-length": "-1" }],
      [" ".repeat(2049) + JSON.stringify(target), { "content-length": "1" }],
      [" ".repeat(2049) + JSON.stringify(target), {}],
      [JSON.stringify(target), { "content-type": "text/plain" }],
      ["{invalid", {}],
    ] as [string, Record<string, string>][]) {
      expect((await handleMiloDispatch(request(body, headers), deps)).status).toBe(400);
    }
    expect(deps.run).not.toHaveBeenCalled();
  });
  it("cancels a stalled body on its deadline before execution", async () => {
    vi.useFakeTimers();
    const deps = fixture();
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel: cancelled });
    const input = new Request(request(), { body, duplex: "half" } as RequestInit);
    const result = handleMiloDispatch(input, deps);
    await vi.advanceTimersByTimeAsync(5000);
    expect((await result).status).toBe(400);
    expect(cancelled).toHaveBeenCalledOnce();
    expect(deps.run).not.toHaveBeenCalled();
  });
  it("rejects invalid UTF-8 and excessive tiny chunks", async () => {
    const deps = fixture();
    for (const chunks of [
      [new Uint8Array([255])],
      Array.from({ length: 65 }, () => new Uint8Array([32])),
    ]) {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        },
      });
      const input = new Request(request(), { body, duplex: "half" } as RequestInit);
      expect((await handleMiloDispatch(input, deps)).status).toBe(400);
    }
    expect(deps.run).not.toHaveBeenCalled();
  });
  it("rejects query-selected engines and never retries an uncertain execution", async () => {
    const deps = fixture();
    const queried = new Request("https://milogrowth.com/api/milo/run?engine=monthly", request());
    expect((await handleMiloDispatch(queried, deps)).status).toBe(400);
    expect(deps.run).not.toHaveBeenCalled();
    deps.run.mockRejectedValueOnce(new Error(`provider body ${credential}`));
    const response = await handleMiloDispatch(request(), deps);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "dispatch_unavailable" });
    expect(deps.run).toHaveBeenCalledOnce();
  });
});
