import type { ContentAsset } from "./types";
import { describe, expect, it } from "vitest";
import {
  mcpImageSchema,
  prepareMcpImage,
  reserveMcpImage,
  attachMcpImage,
  MAX_MCP_IMAGE_RECEIPTS,
} from "./mcp-image";
import { ExternalDraftStateError } from "./external-draft";
const base64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=";
export const input = {
  projectId: "p",
  contentId: "c",
  requestId: "r",
  dataBase64: base64,
  concept: "A small example",
  alt: "Example pixel",
};
const workspace = () => ({
  projects: [{ id: "p", description: "Keep" }],
  content: [
    {
      id: "c",
      projectId: "p",
      status: "Draft",
      markdown: "Keep body",
      images: [],
      qualityScore: { score: 82 },
      assembled: { old: true },
      checklist: {},
      readiness: {},
    },
  ],
  unrelated: true,
});
const prepare = (value = input, userId = "user", clientId = "client") =>
  prepareMcpImage(userId, clientId, mcpImageSchema.parse(value));

describe("MCP image bytes and target binding", () => {
  it("rejects decoded bytes above 5MiB even when the padded base64 length still fits", async () => {
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
    Buffer.from(input.dataBase64, "base64").copy(oversized);
    await expect(
      prepare({ ...input, dataBase64: oversized.toString("base64") }),
    ).rejects.toBeDefined();
  });

  it.each([
    "https://example.com/x.png",
    "data:image/png;base64," + base64,
    base64 + "\n",
    "!" + base64,
    "AAAA=",
    "AAAA====",
    "PGh0bWw+",
    "PHN2Zz4=",
  ])("refuses noncanonical or unsupported input %#", async (dataBase64) => {
    await expect(prepare({ ...input, dataBase64 })).rejects.toBeDefined();
  });
  it.each([
    { url: "https://example.com/x.png" },
    { storagePath: "victim/p/c/id.png" },
    { status: "accepted" },
    { userId: "victim" },
    { placement: "featured" },
    { dataBase64: "A".repeat(6990512) },
    { projectId: "../victim" },
  ])("rejects privileged or oversized fields %#", (patch) => {
    expect(mcpImageSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });
  it("reserves stable ownership, then appends one private proposed image and invalidates old assessments", async () => {
    const prepared = await prepare();
    const reserved = reserveMcpImage(workspace(), prepared);
    const attached = attachMcpImage(
      reserved.data,
      prepared,
      reserved.result.receipt,
      "private-preview",
    );
    const asset = (attached.data.content as ContentAsset[])[0];
    expect(asset).toMatchObject({
      status: "Draft",
      markdown: "Keep body",
      qualityScoreStale: true,
      images: [
        {
          status: "proposed",
          source: "uploaded",
          placement: "inline",
          alt: input.alt,
          required: false,
        },
      ],
    });
    expect(asset.assembled).toBeUndefined();
    expect(asset.checklist).toBeUndefined();
    expect(asset.readiness).toBeUndefined();
    expect(asset.images?.[0].storagePath).toMatch(/^user\/p\/c\/[a-f0-9-]+\.png$/);
    expect(asset.images?.[0].url).toBeUndefined();
    expect((attached.data as Record<string, unknown>).unrelated).toBe(true);
    expect(JSON.stringify(attached.data.projects)).not.toContain(base64);
    expect(JSON.stringify(attached.result)).not.toContain("private-preview");
  });
  it("replays without undoing an owner edit or issuing another image identity", async () => {
    const first = await prepare();
    const reserved = reserveMcpImage(workspace(), first);
    const attached = attachMcpImage(
      reserved.data,
      first,
      reserved.result.receipt,
      "private-preview",
    );
    (attached.data.content as ContentAsset[])[0].images![0].alt = "Owner's edit";
    (attached.data.content as ContentAsset[])[0].status = "Approved";
    const replay = reserveMcpImage(attached.data, await prepare());
    expect(replay.result.receipt.imageId).toBe(first.receipt.imageId);
    expect(replay.result.completed).toMatchObject({
      imageId: first.receipt.imageId,
      deduped: true,
    });
    expect(replay.data).toBe(attached.data);
  });
  it("does not recreate a removed image or reuse the key for different bytes/metadata", async () => {
    const first = await prepare();
    const reserved = reserveMcpImage(workspace(), first);
    const attached = attachMcpImage(reserved.data, first, reserved.result.receipt, "preview");
    (attached.data.content as ContentAsset[])[0].images = [];
    expect(() => reserveMcpImage(attached.data, first)).toThrow("conflict");
    const changed = await prepare({ ...input, alt: "Changed" });
    expect(() => reserveMcpImage(reserved.data, changed)).toThrow("conflict");
  });
  it.each([
    { status: "Approved" },
    { liveUrl: "https://example.com/live" },
    { scheduledPublishStatus: "armed" },
    { publishStatus: "sent" },
    { livePublishStatus: "unknown" },
  ])("rechecks protected draft state after upload %#", async (patch) => {
    const prepared = await prepare();
    const reserved = reserveMcpImage(workspace(), prepared);
    const data = structuredClone(reserved.data) as ReturnType<typeof workspace>;
    Object.assign(data.content[0], patch);
    expect(() => attachMcpImage(data, prepared, reserved.result.receipt, "preview")).toThrow(
      ExternalDraftStateError,
    );
  });
  it("rechecks project ownership and preserves concurrent drafts/images", async () => {
    const prepared = await prepare();
    expect(() => reserveMcpImage({ ...workspace(), projects: [] }, prepared)).toThrow("not_found");
    const reserved = reserveMcpImage(workspace(), prepared);
    const data = structuredClone(reserved.data) as ReturnType<typeof workspace>;
    data.content[0].markdown = "A concurrent owner edit";
    const attached = attachMcpImage(data, prepared, reserved.result.receipt, "preview");
    expect((attached.data.content as ContentAsset[])[0].markdown).toBe("A concurrent owner edit");
    expect(() =>
      attachMcpImage({ ...data, projects: [] }, prepared, reserved.result.receipt, "preview"),
    ).toThrow("not_found");
  });
  it("rejects forged receipt paths and corrupt replay histories", async () => {
    const prepared = await prepare();
    const reserved = reserveMcpImage(workspace(), prepared);
    const project = (reserved.data.projects as Array<Record<string, unknown>>)[0];
    project.mcpImageRequests = [{ ...prepared.receipt, path: "victim/p/c/id.png" }];
    expect(() => reserveMcpImage(reserved.data, prepared)).toThrow("conflict");
    project.mcpImageRequests = null;
    // null is a legacy empty value; a malformed nonempty object is not.
    project.mcpImageRequests = {};
    expect(() => reserveMcpImage(reserved.data, prepared)).toThrow("conflict");
  });
  it("bounds import history without erasing prior receipts", async () => {
    const prepared = await prepare();
    const data = {
      ...workspace(),
      projects: [
        {
          id: "p",
          mcpImageRequests: Array.from({ length: MAX_MCP_IMAGE_RECEIPTS }, (_, i) => ({
            ...prepared.receipt,
            requestId: `old-${i}`,
          })),
        },
      ],
    };
    expect(() => reserveMcpImage(data, prepared)).toThrow("capacity");
  });
});
