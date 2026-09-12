import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  list: vi.fn(),
  check: vi.fn(),
  user: { id: "owner" } as { id: string } | null,
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: h.query, useMutation: h.mutation }));
vi.mock("./auth", () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock("@/i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("./image-references.functions", () => ({
  listImageReferenceCandidatesFn: h.list,
  checkImageReferencesFn: h.check,
}));
import { ProductImageReferences } from "@/components/ProductImageReferences";
import { listImageReferenceCandidates } from "./image-references";
import type { ContentImage } from "./types";
const choice = { imageId: "photo", metadataHash: "a".repeat(64) };
const render = (choices = [choice], photosSaved = true, images: ContentImage[] = []) =>
  renderToStaticMarkup(
    createElement(ProductImageReferences, {
      projectId: "p",
      assetId: "a",
      photosVersion: "snapshot",
      photosSaved,
      choices,
      images,
      onChange: vi.fn(),
    }),
  );
beforeEach(() => {
  vi.clearAllMocks();
  h.user = { id: "owner" };
  h.query.mockReturnValue({ isSuccess: true, data: [{ ...choice, concept: "Ceramic cup" }] });
  h.mutation.mockReturnValue({ isPending: false, reset: vi.fn(), mutate: vi.fn() });
});
it("loads nothing automatically and binds candidate reads to the owner, project, article and image version", () => {
  const html = render();
  expect(h.query.mock.calls[0][0]).toMatchObject({
    queryKey: ["image-reference-candidates", "owner", "p", "a", "snapshot", true],
    enabled: false,
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  expect(html).toContain("Ceramic cup");
  expect(html).toContain("imageRefs.unavailable");
  expect(html).not.toContain(choice.metadataHash);
  expect(h.list).not.toHaveBeenCalled();
  expect(h.check).not.toHaveBeenCalled();
});
it("withholds stale checked results after a selected photo changes", () => {
  h.mutation.mockReturnValue({ isSuccess: true, variables: [choice], data: { images: [] } });
  const html = render([{ ...choice, metadataHash: "b".repeat(64) }]);
  expect(html).toContain("imageRefs.changed");
  expect(html).not.toContain("imageRefs.checked");
});
it("requires saved metadata before selection and hides previous candidates when a reload fails", () => {
  expect(render([], false)).toContain("imageRefs.savePhotos");
  expect(render([], false)).not.toContain("Ceramic cup");
  h.query.mockReturnValue({ isError: true, data: [{ ...choice, concept: "stale photo" }] });
  const html = render();
  expect(html).toContain("imageRefs.loadError");
  expect(html).not.toContain("stale photo");
});
it("explicit checks submit only the selected IDs and fingerprints without retries", async () => {
  render();
  const opts = h.mutation.mock.calls[0][0];
  expect(opts.retry).toBe(false);
  h.check.mockResolvedValue({
    version: 1,
    selectionHash: "a".repeat(64),
    images: [
      {
        ...choice,
        sha256: "b".repeat(64),
        contentType: "image/png",
        width: 1,
        height: 1,
        size: 68,
      },
    ],
  });
  await opts.mutationFn([choice]);
  expect(h.check).toHaveBeenCalledExactlyOnceWith({
    data: { projectId: "p", assetId: "a", references: [choice] },
  });
});
it("clears the entire interface on sign-out without reading another account's references", () => {
  h.user = null;
  expect(render()).toBe("");
  expect(h.query).not.toHaveBeenCalled();
});
it("refuses a thumbnail whose local object was changed while saved candidates were loading", async () => {
  const owner = "00000000-0000-4000-8000-000000000001";
  h.user = { id: owner };
  const photo: ContentImage = {
    id: "photo",
    concept: "Cup",
    source: "uploaded",
    status: "proposed",
    storagePath: `${owner}/p/a/photo.png`,
    alt: "",
    placement: "inline",
  };
  const saved = await listImageReferenceCandidates(owner, {
    ownerId: owner,
    projectId: "p",
    assetId: "a",
    images: [photo],
  });
  h.list.mockResolvedValue(saved);
  render([], true, [photo]);
  const query = h.query.mock.calls[0][0];
  await expect(query.queryFn()).resolves.toEqual(saved);
  photo.storagePath = `${owner}/p/a/changed.png`;
  await expect(query.queryFn()).rejects.toThrow("image_reference_changed");
});
