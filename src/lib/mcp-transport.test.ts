import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dispatchMcpPayload,
  readMcpPayload,
  MCP_BODY_TIMEOUT_MS,
  MCP_MAX_BODY_BYTES,
  MCP_MAX_IMAGE_BODY_BYTES,
  acquireMcpImageRequest,
  MCP_MAX_ACTIVE_IMAGE_REQUESTS,
  MCP_MAX_BODY_CHUNKS,
  MCP_MAX_BATCH,
} from "./mcp-transport.server";

const encoded = (s: string) => new TextEncoder().encode(s);
function request(body: string | ReadableStream<Uint8Array>, headers?: HeadersInit) {
  return new Request("https://example.com/api/mcp", {
    method: "POST",
    body,
    headers,
    duplex: "half",
  } as RequestInit);
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("MCP body admission", () => {
  it("accepts the exact byte limit", async () => {
    const text = JSON.stringify("a".repeat(MCP_MAX_BODY_BYTES - 2));
    expect(await readMcpPayload(request(text))).toHaveLength(MCP_MAX_BODY_BYTES - 2);
  });
  it("counts Polish UTF-8 bytes rather than JavaScript characters", async () => {
    const text = JSON.stringify("ą".repeat(MCP_MAX_BODY_BYTES / 2));
    expect(text.length).toBeLessThan(MCP_MAX_BODY_BYTES);
    await expect(readMcpPayload(request(text))).rejects.toMatchObject({ status: 413 });
  });
  it("checks actual bytes even with a falsely small content length", async () => {
    await expect(
      readMcpPayload(request("a".repeat(MCP_MAX_BODY_BYTES + 1), { "Content-Length": "1" })),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("rejects an oversized declared body before taking its reader", async () => {
    const req = request("{}");
    req.headers.set("content-length", String(MCP_MAX_BODY_BYTES + 1));
    const reader = vi.spyOn(req.body!, "getReader");
    await expect(readMcpPayload(req)).rejects.toMatchObject({ status: 413 });
    expect(reader).not.toHaveBeenCalled();
  });
  it("handles a multibyte character split across chunks", async () => {
    const bytes = encoded('{"text":"ą"}');
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (const byte of bytes) c.enqueue(new Uint8Array([byte]));
        c.close();
      },
    });
    expect(await readMcpPayload(request(stream))).toEqual({ text: "ą" });
  });
  it("rejects excessive empty chunks and cancels the stream", async () => {
    const cancel = vi.fn();
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        sent++;
        c.enqueue(new Uint8Array());
      },
      cancel,
    });
    await expect(readMcpPayload(request(stream))).rejects.toMatchObject({ status: 413 });
    expect(sent).toBeLessThanOrEqual(MCP_MAX_BODY_CHUNKS + 2);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("ends a stalled read even when cancellation never resolves", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const result = readMcpPayload(request(stream));
    const assertion = expect(result).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(MCP_BODY_TIMEOUT_MS + 1);
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("clears the timer after success", async () => {
    vi.useFakeTimers();
    expect(await readMcpPayload(request("{}"))).toEqual({});
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["", "{private malformed text", "[]"])(
    "rejects malformed or empty payload %s",
    async (body) => {
      await expect(readMcpPayload(request(body))).rejects.toMatchObject({ status: 400 });
    },
  );
  it("does not expose stream errors or invalid UTF-8", async () => {
    const bad = new ReadableStream<Uint8Array>({
      start(c) {
        c.error(new Error("private credential"));
      },
    });
    await expect(readMcpPayload(request(bad))).rejects.toThrow("Could not read the request body.");
    const utf = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([255]));
        c.close();
      },
    });
    await expect(readMcpPayload(request(utf))).rejects.toMatchObject({ status: 400 });
  });
  it("admits 20 messages and rejects 21 before dispatch", async () => {
    const batch = Array.from({ length: MCP_MAX_BATCH }, (_, id) => ({
      jsonrpc: "2.0",
      id,
      method: "ping",
    }));
    expect(await readMcpPayload(request(JSON.stringify(batch)))).toHaveLength(MCP_MAX_BATCH);
    await expect(
      readMcpPayload(request(JSON.stringify([...batch, batch[0]]))),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("MCP batch dispatch", () => {
  it.each([undefined, null])(
    "does not fabricate a failure response for an unstarted notification with id %s",
    async (id) => {
      const handle = vi.fn().mockRejectedValue(new Error("private"));
      const response = await dispatchMcpPayload(
        [
          { id: 1, method: "ping" },
          { id, method: "notifications/initialized" },
        ],
        handle,
        vi.fn(),
      );
      expect(response).toHaveLength(1);
      expect(response).toMatchObject([{ id: 1, error: { code: -32603 } }]);
      expect(handle).toHaveBeenCalledOnce();
    },
  );
  it("returns no response when a notification-only batch fails", async () => {
    const handle = vi.fn().mockRejectedValue(new Error("private"));
    expect(
      await dispatchMcpPayload(
        [{ method: "notifications/initialized" }, { id: null, method: "notifications/cancelled" }],
        handle,
        vi.fn(),
      ),
    ).toBeNull();
    expect(handle).toHaveBeenCalledOnce();
  });
  it("runs and audits one message at a time in caller order", async () => {
    const order: string[] = [];
    let active = 0;
    let peak = 0;
    const handle = vi.fn(async (m: Record<string, unknown>) => {
      active++;
      peak = Math.max(peak, active);
      order.push(`start${m.id}`);
      await Promise.resolve();
      active--;
      order.push(`end${m.id}`);
      return m.id === 2 ? null : { id: m.id };
    });
    const audit = vi.fn(async (m: Record<string, unknown>) => {
      order.push(`audit${m.id}`);
    });
    expect(await dispatchMcpPayload([{ id: 1 }, { id: 2 }, { id: 3 }], handle, audit)).toEqual([
      { id: 1 },
      { id: 3 },
    ]);
    expect(peak).toBe(1);
    expect(order).toEqual([
      "start1",
      "end1",
      "audit1",
      "start2",
      "end2",
      "audit2",
      "start3",
      "end3",
      "audit3",
    ]);
  });
  it("returns no response for a notification-only batch", async () => {
    expect(
      await dispatchMcpPayload(
        [{}],
        async () => null,
        async () => undefined,
      ),
    ).toBeNull();
  });
  it.each([null, 1, "bad", true])(
    "returns an invalid-request response for %s without invoking a tool",
    async (value) => {
      const handle = vi.fn();
      const audit = vi.fn();
      expect(await dispatchMcpPayload(value, handle, audit)).toMatchObject({
        error: { code: -32600 },
      });
      expect(handle).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
    },
  );
  it("handles invalid members without discarding a valid adjacent response", async () => {
    const handle = vi.fn().mockResolvedValue({ id: 1 });
    const response = await dispatchMcpPayload([null, { id: 1 }], handle, vi.fn());
    expect(response).toEqual([
      { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request." } },
      { id: 1 },
    ]);
    expect(handle).toHaveBeenCalledOnce();
  });
  it("does not start later work or retry when a handler throws", async () => {
    const handle = vi
      .fn()
      .mockResolvedValueOnce({ id: 1 })
      .mockRejectedValueOnce(new Error("unavailable"));
    const audit = vi.fn();
    const response = await dispatchMcpPayload([{ id: 1 }, { id: 2 }, { id: 3 }], handle, audit);
    expect(response).toEqual([
      { id: 1 },
      {
        jsonrpc: "2.0",
        id: 2,
        error: {
          code: -32603,
          message: "This message's result is unconfirmed. Check Milo before retrying.",
        },
      },
      {
        jsonrpc: "2.0",
        id: 3,
        error: {
          code: -32004,
          message: "This message was not started because an earlier batch message failed.",
        },
      },
    ]);
    expect(handle).toHaveBeenCalledTimes(2);
    expect(audit).toHaveBeenCalledOnce();
  });
  it.each([0, MCP_MAX_BATCH + 1])(
    "denies a batch of %s even without the body reader",
    async (size) => {
      const handle = vi.fn();
      await expect(
        dispatchMcpPayload(
          Array.from({ length: size }, () => ({})),
          handle,
          vi.fn(),
        ),
      ).rejects.toMatchObject({ code: -32600 });
      expect(handle).not.toHaveBeenCalled();
    },
  );
});

describe("scoped large MCP image bodies", () => {
  const large = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "add_content_image",
      arguments: { dataBase64: "A".repeat(MCP_MAX_BODY_BYTES) },
    },
  };
  it("admits one large image only when the route has resolved an OAuth content writer", async () => {
    const body = JSON.stringify(large);
    await expect(readMcpPayload(request(body))).rejects.toMatchObject({ status: 413 });
    await expect(readMcpPayload(request(body), { allowImageUpload: true })).resolves.toEqual(large);
  });
  it.each([
    [large],
    { ...large, id: null },
    { ...large, jsonrpc: "wrong" },
    { ...large, method: "other" },
    { ...large, params: { ...large.params, name: "create_content_draft" } },
  ])("rejects large batches, notifications and other tools before dispatch %#", async (payload) => {
    await expect(
      readMcpPayload(request(JSON.stringify(payload)), { allowImageUpload: true }),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("retains a hard image body byte cap despite a false content length", async () => {
    await expect(
      readMcpPayload(request("A".repeat(MCP_MAX_IMAGE_BODY_BYTES + 1), { "content-length": "1" }), {
        allowImageUpload: true,
      }),
    ).rejects.toMatchObject({ status: 413 });
  });
});

describe("large-body memory admission", () => {
  it("keeps timed-out request slots until tracked I/O settles", async () => {
    const leases = Array.from({ length: MCP_MAX_ACTIVE_IMAGE_REQUESTS }, () =>
      acquireMcpImageRequest(),
    );
    const replies: Array<() => void> = [];
    const pending = leases.map((lease) =>
      lease.track(() => new Promise<void>((resolve) => replies.push(resolve))),
    );
    await Promise.resolve();
    for (const lease of leases) lease();
    expect(acquireMcpImageRequest).toThrow("Image uploads are busy");
    replies[0]();
    await pending[0];
    const replacement = acquireMcpImageRequest();
    replacement();
    for (const reply of replies.slice(1)) reply();
    await Promise.all(pending);
    await expect(leases[0].track(async () => {})).rejects.toThrow("already ended");
  });

  it("limits concurrent image requests and releases each slot once", () => {
    const releases = Array.from({ length: MCP_MAX_ACTIVE_IMAGE_REQUESTS }, () =>
      acquireMcpImageRequest(),
    );
    try {
      expect(acquireMcpImageRequest).toThrow("Image uploads are busy");
      releases[0]();
      releases[0]();
      const replacement = acquireMcpImageRequest();
      expect(acquireMcpImageRequest).toThrow("Image uploads are busy");
      replacement();
    } finally {
      for (const release of releases) release();
    }
  });
  it("takes a slot on actual bytes even when content length is falsely small", async () => {
    const onLargeBody = vi.fn();
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "add_content_image", arguments: { dataBase64: "A".repeat(210000) } },
    });
    await readMcpPayload(request(body, { "content-length": "1" }), {
      allowImageUpload: true,
      onLargeBody,
    });
    expect(onLargeBody).toHaveBeenCalledOnce();
  });
});
