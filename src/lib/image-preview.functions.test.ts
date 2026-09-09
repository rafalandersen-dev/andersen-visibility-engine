import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (value: unknown) => value;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: typeof validate) => {
        validate = fn;
        return builder;
      },
      handler: (fn: (value: unknown) => unknown) => (args: { data: unknown; context: unknown }) =>
        fn({ ...args, data: validate(args.data) }),
    };
    return builder;
  },
}));
vi.mock("./image-preview.server", () => ({ readArticleImagePreview: h.read }));
import { getArticleImagePreviewFn } from "./image-preview.functions";
const call = (data: unknown) =>
  (getArticleImagePreviewFn as unknown as (args: unknown) => Promise<unknown>)({
    data,
    context: { userId: "actual-owner" },
  });
beforeEach(() => {
  vi.clearAllMocks();
  h.read.mockResolvedValue("fresh-preview");
});
describe("authenticated preview wrapper", () => {
  it("uses authenticated identity and returns only the refreshed preview", async () => {
    await expect(call({ path: "actual-owner/p/c/image.png" })).resolves.toEqual({
      previewUrl: "fresh-preview",
    });
    expect(h.read).toHaveBeenCalledExactlyOnceWith("actual-owner", "actual-owner/p/c/image.png");
  });
  it.each([
    { userId: "victim" },
    { bucket: "public" },
    { approve: true },
    { path: "a".repeat(281) },
  ])("refuses injected ownership/mutation parameters %#", (extra) => {
    expect(() => call({ path: "actual-owner/p/c/image.png", ...extra })).toThrow();
    expect(h.read).not.toHaveBeenCalled();
  });
});
