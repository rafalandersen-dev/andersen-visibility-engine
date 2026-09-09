import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acquireMcpImageRequest, MCP_MAX_ACTIVE_IMAGE_REQUESTS } from "./mcp-transport.server";
import { Route } from "@/routes/api.mcp";
import { checkRateLimit, RATE_BUCKETS } from "./oauth.server";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  handle: vi.fn(),
  bump: vi.fn(),
  audit: vi.fn(),
  check: vi.fn(),
  write: vi.fn(),
}));
vi.mock("./oauth.server", async (original) => {
  const actual = await original<typeof import("./oauth.server")>();
  return {
    ...actual,
    isOAuthEnabled: () => true,
    isWriteToolsEnabled: () => true,
    resolveAccessToken: mocks.resolve,
    logOAuthEvent: mocks.audit,
    checkRateLimit: mocks.check,
    bumpRateLimit: mocks.bump,
  };
});
vi.mock("./mcp.server", () => ({
  resolveUser: vi.fn().mockResolvedValue(null),
  handleMcpMessage: mocks.handle,
  buildMcpAuditEvent: () => null,
}));
const post = (
  Route.options as unknown as {
    server: { handlers: { POST: (args: { request: Request }) => Promise<Response> } };
  }
).server.handlers.POST;
const call = (payload: unknown) =>
  post({
    request: new Request("https://example.com/api/mcp", {
      method: "POST",
      headers: { Authorization: "Bearer synthetic-test" },
      body: JSON.stringify(payload),
    }),
  });
beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.resolve.mockResolvedValue({
    userId: "owner",
    scope: "milo.content.write",
    clientId: "client",
  });
  const actual = await vi.importActual<typeof import("./oauth.server")>("./oauth.server");
  mocks.check.mockImplementation(actual.checkRateLimit);
  mocks.bump.mockResolvedValue(1);
  mocks.handle.mockImplementation(async (_grant, message, hooks) => {
    if (message.method === "write-fixture") {
      const rate = await hooks.checkWriteLimit();
      if (rate.allowed) mocks.write();
    }
    return { jsonrpc: "2.0", id: message.id, result: {} };
  });
});
afterEach(() => vi.restoreAllMocks());
describe("actual MCP HTTP admission and dispatch", () => {
  it("retains the route lease after responding while tracked storage work is still pending", async () => {
    let reply!: () => void;
    let pending!: Promise<void>;
    mocks.handle.mockImplementationOnce(async (_grant, _message, hooks) => {
      pending = hooks.trackImageWork(
        () =>
          new Promise<void>((resolve) => {
            reply = resolve;
          }),
      );
      return { id: 1, result: { isError: true } };
    });
    const image = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "add_content_image", arguments: { dataBase64: "A".repeat(210000) } },
    };
    expect((await call(image)).status).toBe(200);
    const other = acquireMcpImageRequest();
    try {
      expect(acquireMcpImageRequest).toThrow("Image uploads are busy");
    } finally {
      other();
      reply();
      await pending;
    }
    const reusable = acquireMcpImageRequest();
    reusable();
  });

  it("releases large-body slots after dispatch failure and refuses overflow before tool execution", async () => {
    const image = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "add_content_image", arguments: { dataBase64: "A".repeat(210000) } },
    };
    mocks.handle.mockRejectedValue(new Error("private"));
    for (let i = 0; i < MCP_MAX_ACTIVE_IMAGE_REQUESTS + 1; i++)
      expect((await call(image)).status).toBe(500);
    mocks.handle.mockClear();
    const releases = Array.from({ length: MCP_MAX_ACTIVE_IMAGE_REQUESTS }, () =>
      acquireMcpImageRequest(),
    );
    try {
      expect((await call(image)).status).toBe(429);
      expect(mocks.handle).not.toHaveBeenCalled();
    } finally {
      for (const release of releases) release();
    }
  });

  it("only grants the larger image body to an OAuth content writer", async () => {
    const image = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "add_content_image", arguments: { dataBase64: "A".repeat(210000) } },
    };
    expect((await call(image)).status).toBe(200);
    expect(mocks.handle).toHaveBeenCalledOnce();
    mocks.handle.mockClear();
    mocks.resolve.mockResolvedValue({
      userId: "owner",
      scope: "milo.content.read",
      clientId: "client",
    });
    expect((await call(image)).status).toBe(413);
    expect(mocks.handle).not.toHaveBeenCalled();
  });

  it("does not read the body or dispatch without authentication", async () => {
    mocks.resolve.mockResolvedValue(null);
    const response = await call(Array.from({ length: 21 }, () => ({ method: "write-fixture" })));
    expect(response.status).toBe(401);
    expect(mocks.handle).not.toHaveBeenCalled();
  });
  it("rejects an entire oversized batch before any tool starts", async () => {
    const response = await call(
      Array.from({ length: 21 }, (_, id) => ({ id, method: "write-fixture" })),
    );
    expect(response.status).toBe(400);
    expect(mocks.handle).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("wires fail-closed limits for a write and preserves neighboring read results", async () => {
    mocks.bump.mockImplementation(async (bucket) => (bucket === "write" ? 0 : 1));
    const response = await call([
      { id: 1, method: "ping" },
      { id: 2, method: "write-fixture" },
      { id: 3, method: "ping" },
    ]);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result[0]).toMatchObject({ id: 1, result: {} });
    expect(result[1]).toMatchObject({ id: 2, error: { code: -32003 } });
    expect(result[2]).toMatchObject({ id: 3, result: {} });
    expect(checkRateLimit).toHaveBeenCalledWith(
      RATE_BUCKETS.write,
      "synthetic-test",
      expect.objectContaining({ failureMode: "deny" }),
    );
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("performs one confirmed write and retains CORS", async () => {
    const response = await call({ id: 1, method: "write-fixture" });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(mocks.write).toHaveBeenCalledOnce();
  });
  it("keeps unexpected single-message errors private", async () => {
    mocks.handle.mockRejectedValue(new Error("private-provider-body"));
    const response = await call({ id: 1, method: "ping" });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private-provider-body");
    expect(console.error).toHaveBeenCalledWith("[api.mcp] request failed");
  });
  it("keeps earlier batch success and labels the remaining work after an unexpected failure", async () => {
    mocks.handle
      .mockResolvedValueOnce({ id: 1, result: {} })
      .mockRejectedValueOnce(new Error("private-provider-body"));
    const response = await call([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const result = await response.json();
    expect(result[0]).toEqual({ id: 1, result: {} });
    expect(result[1]).toMatchObject({ id: 2, error: { code: -32603 } });
    expect(result[2]).toMatchObject({ id: 3, error: { code: -32004 } });
    expect(JSON.stringify(result)).not.toContain("private-provider-body");
    expect(mocks.handle).toHaveBeenCalledTimes(2);
  });
});
