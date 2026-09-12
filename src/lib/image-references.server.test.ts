import { afterEach, expect, it, vi } from "vitest";
import { listImageReferenceCandidates } from "./image-references";
import {
  loadSelectedImageReferences,
  readImageReferenceCandidates,
  readBoundedReferenceStream,
} from "./image-references.server";
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  lease = "00000000-0000-4000-8000-000000000003";
const png = () =>
  new Uint8Array(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCGkAAAAASUVORK5CYII=",
      "base64",
    ),
  );
async function fixture() {
  const context = {
    ownerId: owner,
    projectId: "p",
    assetId: "a",
    images: [
      {
        id: "photo",
        concept: "Product",
        source: "uploaded",
        status: "proposed",
        storagePath: `${owner}/p/a/object.png`,
      },
    ],
  };
  const refs = await listImageReferenceCandidates(owner, context);
  const input = {
    projectId: "p",
    assetId: "a",
    references: refs.map(({ imageId, metadataHash }) => ({ imageId, metadataHash })),
  };
  return {
    context,
    input,
    deps: {
      read: vi.fn(async () => structuredClone(context)),
      acquire: vi.fn(async () => lease),
      release: vi.fn(async () => {}),
      download: vi.fn(async () => new Blob([png()], { type: "text/html" })),
    },
  };
}
afterEach(() => vi.useRealTimers());
it("loads only the saved owner-private objects, sniffs actual bytes and rechecks current metadata", async () => {
  const { input, deps } = await fixture();
  const result = await loadSelectedImageReferences(owner, input, deps);
  expect(result.selectionHash).toMatch(/^[a-f0-9]{64}$/);
  expect(result.references[0].manifest.contentType).toBe("image/png");
  expect(deps.download).toHaveBeenCalledExactlyOnceWith(
    "article-assets-private",
    `${owner}/p/a/object.png`,
    expect.any(AbortSignal),
    4 * 1024 * 1024,
  );
  expect(deps.read).toHaveBeenCalledTimes(2);
  expect(deps.read).toHaveBeenLastCalledWith(owner, { projectId: "p", assetId: "a" });
  expect(deps.release).toHaveBeenCalledExactlyOnceWith(owner, lease);
});
it("stops an oversized storage stream before reading its remaining chunks", async () => {
  const cancel = vi.fn(),
    pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => {
      controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1));
    });
  const stream = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
  await expect(readBoundedReferenceStream(stream, new AbortController().signal)).rejects.toThrow(
    "image_reference_bytes",
  );
  expect(pull).toHaveBeenCalledOnce();
  expect(cancel).toHaveBeenCalledOnce();
});
it("cancels a storage stream stalled at the deadline", async () => {
  const cancel = vi.fn(),
    controller = new AbortController();
  const stream = new ReadableStream<Uint8Array>({ cancel });
  const result = readBoundedReferenceStream(stream, controller.signal);
  const assertion = expect(result).rejects.toThrow();
  controller.abort();
  await assertion;
  expect(cancel).toHaveBeenCalledOnce();
});
it("bounds fragmented storage responses even when chunks contain no bytes", async () => {
  const cancel = vi.fn();
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array());
      },
      cancel,
    },
    { highWaterMark: 0 },
  );
  await expect(readBoundedReferenceStream(stream, new AbortController().signal)).rejects.toThrow(
    "image_reference_bytes",
  );
  expect(pulls).toBe(16385);
  expect(cancel).toHaveBeenCalledOnce();
});
it("lists owner candidates without downloading their private bytes", async () => {
  const { deps } = await fixture();
  expect(
    await readImageReferenceCandidates(owner, { projectId: "p", assetId: "a" }, deps.read),
  ).toHaveLength(1);
  expect(deps.download).not.toHaveBeenCalled();
});
it.each(["owner", "project", "asset", "changed"])(
  "refuses wrong %s context before media allowance or download",
  async (kind) => {
    const { input, deps, context } = await fixture();
    if (kind === "owner") context.ownerId = other;
    if (kind === "project") context.projectId = "q";
    if (kind === "asset") context.assetId = "b";
    if (kind === "changed") context.images[0].concept = "changed";
    await expect(loadSelectedImageReferences(owner, input, deps)).rejects.toThrow(
      "could not be confirmed",
    );
    expect(deps.acquire).not.toHaveBeenCalled();
    expect(deps.download).not.toHaveBeenCalled();
  },
);
it("refuses unavailable media allowance without downloading", async () => {
  const { input, deps } = await fixture();
  deps.acquire.mockRejectedValue(Error("private allowance failure"));
  await expect(loadSelectedImageReferences(owner, input, deps)).rejects.toThrow(
    "could not be confirmed",
  );
  expect(deps.download).not.toHaveBeenCalled();
});
it("releases the acquired allowance and withholds bytes when the image changes during download", async () => {
  const { input, deps, context } = await fixture();
  deps.download.mockImplementation(async () => {
    context.images[0].storagePath = `${owner}/p/a/changed.png`;
    return new Blob([png()]);
  });
  await expect(loadSelectedImageReferences(owner, input, deps)).rejects.toThrow(
    "could not be confirmed",
  );
  expect(deps.download).toHaveBeenCalledOnce();
  expect(deps.release).toHaveBeenCalledOnce();
});
it("rejects excessive Blob size before materializing bytes and releases allowance", async () => {
  const { input, deps } = await fixture(),
    arrayBuffer = vi.fn();
  deps.download.mockResolvedValue({ size: 4 * 1024 * 1024 + 1, arrayBuffer } as unknown as Blob);
  await expect(loadSelectedImageReferences(owner, input, deps)).rejects.toThrow(
    "could not be confirmed",
  );
  expect(arrayBuffer).not.toHaveBeenCalled();
  expect(deps.release).toHaveBeenCalledOnce();
});
it("stops at the deadline and cleans up a late allowance without starting a download", async () => {
  const { input, deps } = await fixture();
  vi.useFakeTimers();
  let done!: (value: string) => void;
  deps.acquire.mockImplementation(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  const result = loadSelectedImageReferences(owner, input, deps);
  const assertion = expect(result).rejects.toThrow("could not be confirmed");
  // Hashing uses the real WebCrypto queue; let the preflight reach acquisition.
  await vi.waitFor(() => expect(deps.acquire).toHaveBeenCalledOnce());
  await vi.advanceTimersByTimeAsync(30001);
  await assertion;
  done(lease);
  await vi.waitFor(() => expect(deps.release).toHaveBeenCalledOnce());
  expect(deps.download).not.toHaveBeenCalled();
});
it("caps the next transfer at its remaining aggregate input allowance", async () => {
  const { input, deps, context } = await fixture();
  context.images = Array.from({ length: 3 }, (_, i) => ({
    ...context.images[0],
    id: `photo${i}`,
    storagePath: `${owner}/p/a/object${i}.png`,
  }));
  input.references = (await listImageReferenceCandidates(owner, context)).map(
    ({ imageId, metadataHash }) => ({ imageId, metadataHash }),
  );
  const bytes = new Uint8Array(3 * 1024 * 1024);
  bytes.set(png());
  deps.download.mockImplementation(async () => new Blob([bytes]));
  await expect(loadSelectedImageReferences(owner, input, deps)).rejects.toThrow(
    "could not be confirmed",
  );
  expect(deps.download).toHaveBeenCalledTimes(3);
  expect(deps.download).toHaveBeenLastCalledWith(
    "article-assets-private",
    `${owner}/p/a/object2.png`,
    expect.any(AbortSignal),
    2 * 1024 * 1024,
  );
  expect(deps.acquire).toHaveBeenCalledTimes(3);
  expect(deps.release).toHaveBeenCalledTimes(3);
});
