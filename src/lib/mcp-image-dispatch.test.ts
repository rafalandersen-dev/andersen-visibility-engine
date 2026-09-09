import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleMcpMessage, toolAllowed, buildMcpAuditEvent, type McpGrant } from "./mcp.server";
const h = vi.hoisted(() => ({ add: vi.fn(), audit: vi.fn(), quota: vi.fn() }));
vi.mock("./mcp-image.server", () => ({ addMcpContentImage: h.add }));
const args = {
  projectId: "p",
  contentId: "c",
  requestId: "r",
  dataBase64: "AAAA",
  concept: "private concept",
  alt: "private alt",
};
const message = {
  id: 1,
  method: "tools/call",
  params: { name: "add_content_image", arguments: args },
};
const grant: McpGrant = {
  userId: "user",
  clientId: "client",
  scopes: ["milo.content.write"],
  writeEnabled: true,
};
const hooks = { checkWriteLimit: h.quota, audit: h.audit };
beforeEach(() => {
  vi.clearAllMocks();
  h.quota.mockResolvedValue({
    allowed: true,
    shouldAudit: false,
    windowStartIso: "now",
    retryAfterSec: 0,
  });
  h.add.mockResolvedValue({
    contentId: "c",
    imageId: "i",
    status: "proposed",
    deduped: false,
    editorPath: "/app/editor?id=c",
  });
});
describe("image import OAuth boundary", () => {
  it.each([null, [], ["milo.content.read"], ["milo.projects.write"]])(
    "hides and refuses image writes without the specific scope %#",
    async (scopes) => {
      expect(toolAllowed("add_content_image", scopes)).toBe(false);
      const caller = { ...grant, scopes };
      const list = await handleMcpMessage(caller, { id: 1, method: "tools/list" });
      expect(JSON.stringify(list)).not.toContain("add_content_image");
      await expect(handleMcpMessage(caller, message, hooks)).resolves.toMatchObject({
        error: { code: -32002 },
      });
      expect(h.add).not.toHaveBeenCalled();
      expect(h.quota).not.toHaveBeenCalled();
    },
  );
  it("keeps the tool behind the write flag and requires a named OAuth client", async () => {
    await expect(
      handleMcpMessage({ ...grant, writeEnabled: false }, message, hooks),
    ).resolves.toMatchObject({ error: { code: -32602 } });
    await expect(
      handleMcpMessage({ ...grant, clientId: undefined }, message, hooks),
    ).resolves.toMatchObject({ error: { code: -32010 } });
    await expect(
      handleMcpMessage(grant, { ...message, id: undefined }, hooks),
    ).resolves.toMatchObject({ error: { code: -32010 } });
    expect(h.add).not.toHaveBeenCalled();
  });
  it("requires a confirmed write quota even for internal dispatch callers", async () => {
    await expect(handleMcpMessage(grant, message)).resolves.toMatchObject({
      error: { code: -32003 },
    });
    h.quota.mockResolvedValue({
      allowed: false,
      shouldAudit: true,
      windowStartIso: "now",
      retryAfterSec: 1,
    });
    await expect(handleMcpMessage(grant, message, hooks)).resolves.toMatchObject({
      error: { code: -32003 },
    });
    expect(h.add).not.toHaveBeenCalled();
  });
  it("rejects path/status injection before storage and sends safe audit details only", async () => {
    await expect(
      handleMcpMessage(
        grant,
        { ...message, params: { ...message.params, arguments: { ...args, status: "accepted" } } },
        hooks,
      ),
    ).resolves.toMatchObject({ error: { code: -32010 } });
    expect(h.add).not.toHaveBeenCalled();
    await expect(handleMcpMessage(grant, message, hooks)).resolves.toHaveProperty("result");
    expect(h.add).toHaveBeenCalledWith("user", "client", args);
    const audit = JSON.stringify(h.audit.mock.calls);
    expect(audit).not.toContain("AAAA");
    expect(audit).not.toContain("private concept");
    expect(audit).not.toContain("private alt");
    expect(buildMcpAuditEvent(message, { result: {} })).toBeNull();
  });
  it("does not expose unexpected storage details in the response or audit", async () => {
    h.add.mockRejectedValue(new Error("private secret storage URL"));
    const response = await handleMcpMessage(grant, message, hooks);
    expect(response).toMatchObject({ result: { isError: true } });
    expect(JSON.stringify([response, h.audit.mock.calls])).not.toContain("private secret");
  });
});
