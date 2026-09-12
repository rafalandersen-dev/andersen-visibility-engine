import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  list: vi.fn(),
  load: vi.fn(),
  auth: Symbol("auth"),
  middleware: [] as unknown[][],
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: h.auth }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (input: unknown) => input;
    const b = {
      middleware: (items: unknown[]) => {
        h.middleware.push(items);
        return b;
      },
      inputValidator: (fn: typeof parse) => {
        parse = fn;
        return b;
      },
      handler: (fn: (input: unknown) => unknown) => (args: { data: unknown; context: unknown }) =>
        fn({ ...args, data: parse(args.data) }),
    };
    return b;
  },
}));
vi.mock("./image-references.server", () => ({
  readImageReferenceCandidates: h.list,
  loadSelectedImageReferences: h.load,
}));
import {
  listImageReferenceCandidatesFn,
  checkImageReferencesFn,
} from "./image-references.functions";
const digest = "a".repeat(64);
const references = [{ imageId: "photo", metadataHash: digest }];
const call = (fn: unknown, data: unknown) =>
  (fn as (args: unknown) => Promise<unknown>)({ data, context: { userId: "authenticated-owner" } });
beforeEach(() => vi.clearAllMocks());
it("requires authentication for both endpoints and takes ownership from the session", async () => {
  expect(h.middleware).toEqual([[h.auth], [h.auth]]);
  h.list.mockResolvedValue([]);
  await call(listImageReferenceCandidatesFn, { projectId: "p", assetId: "a" });
  expect(h.list).toHaveBeenCalledExactlyOnceWith("authenticated-owner", {
    projectId: "p",
    assetId: "a",
  });
  expect(h.load).not.toHaveBeenCalled();
});
it.each(["ownerId", "path", "url", "budget", "approved", "model"])(
  "refuses supplied %s authority before reading private data",
  (field) => {
    expect(() =>
      call(listImageReferenceCandidatesFn, { projectId: "p", assetId: "a", [field]: "forged" }),
    ).toThrow();
    expect(() =>
      call(checkImageReferencesFn, { projectId: "p", assetId: "a", references, [field]: "forged" }),
    ).toThrow();
    expect(h.list).not.toHaveBeenCalled();
    expect(h.load).not.toHaveBeenCalled();
  },
);
it("returns only file facts from a checked set without bytes, storage paths or private scope", async () => {
  h.load.mockResolvedValue({
    selectionHash: digest,
    references: [
      {
        bytes: new Uint8Array([1, 2, 3]),
        manifest: {
          imageId: "photo",
          metadataHash: digest,
          sha256: digest,
          contentType: "image/png",
          size: 68,
          width: 1,
          height: 1,
          ownerId: "private-owner",
          projectId: "p",
          assetId: "a",
          path: "private/path",
        },
      },
    ],
  });
  const result = await call(checkImageReferencesFn, { projectId: "p", assetId: "a", references });
  expect(h.load).toHaveBeenCalledExactlyOnceWith("authenticated-owner", {
    projectId: "p",
    assetId: "a",
    references,
  });
  expect(result).toEqual({
    version: 1,
    selectionHash: digest,
    images: [
      {
        imageId: "photo",
        metadataHash: digest,
        sha256: digest,
        contentType: "image/png",
        size: 68,
        width: 1,
        height: 1,
      },
    ],
  });
});
it("hides internal failures and refuses malformed reference objects", async () => {
  h.load.mockRejectedValue(Error("private object path and credentials"));
  await expect(
    call(checkImageReferencesFn, { projectId: "p", assetId: "a", references }),
  ).rejects.toThrow("The selected product photos could not be checked.");
  h.load.mockClear();
  for (const refs of [
    [],
    [references[0], references[0]],
    [{ ...references[0], url: "https://foreign.test/x" }],
  ])
    expect(() =>
      call(checkImageReferencesFn, { projectId: "p", assetId: "a", references: refs }),
    ).toThrow();
  expect(h.load).not.toHaveBeenCalled();
});
