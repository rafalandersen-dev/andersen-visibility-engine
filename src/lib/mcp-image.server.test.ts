import { acquireMcpImageRequest } from "./mcp-transport.server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { addMcpContentImage, MCP_IMAGE_STORAGE_TIMEOUT_MS } from "./mcp-image.server";
const h = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  upload: vi.fn(),
  download: vi.fn(),
  signed: vi.fn(),
  bucket: vi.fn(),
  mutations: vi.fn(),
}));
vi.mock("./workspace.server", () => ({
  mutateWorkspace: async (
    _user: string,
    mutate: (data: Record<string, unknown>) => { data: Record<string, unknown>; result: unknown },
  ) => {
    h.mutations();
    const result = mutate(h.state);
    h.state = result.data;
    return result;
  },
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { storage: { from: h.bucket } },
}));
const dataBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=";
const input = {
  projectId: "p",
  contentId: "c",
  requestId: "r",
  dataBase64,
  concept: "Example",
  alt: "Example",
};
beforeEach(() => {
  vi.clearAllMocks();
  h.state = {
    projects: [{ id: "p" }],
    content: [{ id: "c", projectId: "p", status: "Draft", markdown: "Owner text" }],
  };
  h.bucket.mockReturnValue({ upload: h.upload, download: h.download, createSignedUrl: h.signed });
  h.upload.mockResolvedValue({ data: {}, error: null });
  h.download.mockResolvedValue({
    data: new Blob([Buffer.from(dataBase64, "base64")]),
    error: null,
  });
  h.signed.mockResolvedValue({ data: { signedUrl: "private-preview" }, error: null });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("private MCP image import execution", () => {
  it("deduplicates simultaneous identical calls using one receipt and image", async () => {
    const objects = new Set<string>();
    h.upload.mockImplementation(async (path: string) => {
      if (objects.has(path)) return { error: {} };
      objects.add(path);
      return { error: null };
    });
    const results = await Promise.all([
      addMcpContentImage("user", "client", input),
      addMcpContentImage("user", "client", input),
    ]);
    expect(results[0].imageId).toBe(results[1].imageId);
    expect((h.state.content as Array<{ images: unknown[] }>)[0].images).toHaveLength(1);
    expect(objects.size).toBe(1);
  });

  it("uses private storage only and replays without another upload", async () => {
    const first = await addMcpContentImage("user", "client", input);
    const second = await addMcpContentImage("user", "client", input);
    expect(first).toMatchObject({ status: "proposed", deduped: false });
    expect(second).toMatchObject({ imageId: first.imageId, deduped: true });
    expect(h.upload).toHaveBeenCalledOnce();
    expect(h.bucket.mock.calls.every(([bucket]) => bucket === "article-assets-private")).toBe(true);
    expect(h.upload.mock.calls[0][2]).toEqual({ upsert: false, contentType: "image/png" });
    expect(JSON.stringify(first)).not.toContain("private-preview");
  });
  it("recovers an identical stored object after a lost upload response, without overwriting", async () => {
    h.upload.mockResolvedValue({ error: new Error("private storage details") });
    const result = await addMcpContentImage("user", "client", input);
    expect(result.status).toBe("proposed");
    expect(h.download).toHaveBeenCalledOnce();
  });
  it("refuses a stored object whose bytes differ", async () => {
    h.upload.mockResolvedValue({ error: {} });
    const altered = Buffer.from(dataBase64, "base64");
    altered[altered.length - 1] ^= 1;
    h.download.mockResolvedValue({ data: new Blob([altered]), error: null });
    await expect(addMcpContentImage("user", "client", input)).rejects.toMatchObject({
      reason: "conflict",
    });
    expect(h.signed).not.toHaveBeenCalled();
    expect(h.mutations).toHaveBeenCalledOnce();
  });
  it("retains a reservation when preview creation fails and permits identical recovery", async () => {
    h.signed.mockResolvedValueOnce({ data: null, error: {} });
    await expect(addMcpContentImage("user", "client", input)).rejects.toMatchObject({
      reason: "unavailable",
    });
    const firstPath = h.upload.mock.calls[0][0];
    h.upload.mockResolvedValue({ error: {} });
    await expect(addMcpContentImage("user", "client", input)).resolves.toMatchObject({
      status: "proposed",
    });
    expect(h.upload.mock.calls[1][0]).toBe(firstPath);
  });
  it("does not mutate a draft approved while the image was uploading", async () => {
    h.upload.mockImplementationOnce(async () => {
      (h.state.content as Array<Record<string, unknown>>)[0].status = "Approved";
      return { error: null };
    });
    await expect(addMcpContentImage("user", "client", input)).rejects.toThrow();
    expect((h.state.content as Array<Record<string, unknown>>)[0]).not.toHaveProperty("images");
  });
  it("does not attach or sign after a timed-out upload later succeeds", async () => {
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    let entered!: () => void;
    const uploading = new Promise<void>((resolve) => {
      entered = resolve;
    });
    h.upload.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
          entered();
        }),
    );
    const result = expect(addMcpContentImage("user", "client", input)).rejects.toMatchObject({
      reason: "unavailable",
    });
    await uploading;
    await vi.advanceTimersByTimeAsync(MCP_IMAGE_STORAGE_TIMEOUT_MS + 1);
    await result;
    // The response ended, but the underlying upload still owns its slot.
    const otherSlot = acquireMcpImageRequest();
    expect(acquireMcpImageRequest).toThrow("Image uploads are busy");
    otherSlot();
    finish({ error: null });
    await vi.runAllTimersAsync();
    expect(h.signed).not.toHaveBeenCalled();
    expect(h.mutations).toHaveBeenCalledOnce();
    const recoveredSlot = acquireMcpImageRequest();
    recoveredSlot();
  });
});
