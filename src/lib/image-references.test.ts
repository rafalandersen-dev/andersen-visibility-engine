import { expect, it } from "vitest";
import {
  imageReferenceSelection,
  listImageReferenceCandidates,
  resolveImageReferences,
  prepareImageReference,
  imageReferenceSetHash,
} from "./image-references";
const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const photo = {
  id: "photo",
  source: "uploaded",
  status: "proposed",
  concept: "Owner product photo",
  storagePath: `${owner}/p/a/object.png`,
};
const context = () => ({ ownerId: owner, projectId: "p", assetId: "a", images: [{ ...photo }] });
const png = () =>
  new Uint8Array(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCGkAAAAASUVORK5CYII=",
      "base64",
    ),
  );
async function selected() {
  const source = context(),
    candidates = await listImageReferenceCandidates(owner, source);
  const input = {
    projectId: "p",
    assetId: "a",
    references: candidates.map(({ imageId, metadataHash }) => ({ imageId, metadataHash })),
  };
  return { source, input, resolved: await resolveImageReferences(owner, input, source) };
}
it("lists only uploaded references without private paths, owner IDs or signed URLs", async () => {
  const source = context();
  source.images.push({ ...photo, id: "generated", source: "generated" });
  const rows = await listImageReferenceCandidates(owner, source);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    imageId: "photo",
    concept: photo.concept,
    metadataHash: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  expect(JSON.stringify(rows)).not.toContain(owner);
  expect(JSON.stringify(rows)).not.toContain("object.png");
});
it.each([
  "owner",
  "project",
  "asset",
  "path",
  "source",
  "status",
  "concept",
  "removed",
  "duplicate",
])("refuses changed or foreign %s before image download", async (kind) => {
  const { source, input } = await selected();
  if (kind === "owner") source.ownerId = other;
  if (kind === "project") source.projectId = "q";
  if (kind === "asset") source.assetId = "b";
  if (kind === "path") source.images[0].storagePath = `${other}/p/a/object.png`;
  if (kind === "source") source.images[0].source = "generated";
  if (kind === "status") source.images[0].status = "missing";
  if (kind === "concept") source.images[0].concept = "Different product";
  if (kind === "removed") source.images = [];
  if (kind === "duplicate") source.images.push({ ...photo });
  await expect(resolveImageReferences(owner, input, source)).rejects.toThrow();
});
it.each(["url", "path", "ownerId", "model", "ceilingMicrousd"])(
  "rejects supplied %s authority",
  async (key) => {
    const { input } = await selected();
    expect(() => imageReferenceSelection.parse({ ...input, [key]: "forged" })).toThrow();
    expect(() =>
      imageReferenceSelection.parse({
        ...input,
        references: [{ ...input.references[0], [key]: "forged" }],
      }),
    ).toThrow();
  },
);
it("rejects duplicate identities and more than four references", async () => {
  const { input } = await selected();
  expect(() =>
    imageReferenceSelection.parse({
      ...input,
      references: [...input.references, ...input.references],
    }),
  ).toThrow();
  expect(() =>
    imageReferenceSelection.parse({
      ...input,
      references: Array.from({ length: 5 }, (_, i) => ({
        ...input.references[0],
        imageId: `photo${i}`,
      })),
    }),
  ).toThrow();
});
it("binds copied bytes to a stable manifest without trusting caller mutation", async () => {
  const { resolved } = await selected(),
    bytes = png();
  const result = await prepareImageReference(resolved[0], bytes),
    hash = await imageReferenceSetHash([result]);
  expect(result.manifest).toMatchObject({
    width: 1,
    height: 1,
    contentType: "image/png",
    size: bytes.length,
  });
  bytes.fill(0);
  expect(await imageReferenceSetHash([result])).toBe(hash);
  result.bytes[20] ^= 1;
  await expect(imageReferenceSetHash([result])).rejects.toThrow("image_reference_changed");
});
it.each(["svg", "empty", "oversize", "dimension"])(
  "refuses unsupported or over-bound %s bytes",
  async (kind) => {
    const { resolved } = await selected();
    let bytes = png();
    if (kind === "svg") bytes = new TextEncoder().encode("<svg></svg>");
    if (kind === "empty") bytes = new Uint8Array();
    if (kind === "oversize") bytes = new Uint8Array(4 * 1024 * 1024 + 1);
    if (kind === "dimension") new DataView(bytes.buffer).setUint32(16, 2049);
    await expect(prepareImageReference(resolved[0], bytes)).rejects.toThrow(
      kind === "dimension"
        ? "image_reference_dimensions"
        : kind === "oversize"
          ? "image_reference_bytes"
          : "image_reference_format",
    );
  },
);

it("rechecks dimensions, type and scope when building the complete reference set", async () => {
  const { resolved } = await selected();
  for (const kind of ["dimensions", "type", "scope"]) {
    const a = await prepareImageReference(resolved[0], png());
    const b = await prepareImageReference({ ...resolved[0] }, png());
    if (kind === "dimensions") a.manifest.width = 2;
    if (kind === "type") a.manifest.contentType = "image/jpeg";
    if (kind === "scope") {
      b.manifest.imageId = "other";
      b.manifest.ownerId = other;
    }
    await expect(imageReferenceSetHash(kind === "scope" ? [a, b] : [a])).rejects.toThrow();
  }
});
