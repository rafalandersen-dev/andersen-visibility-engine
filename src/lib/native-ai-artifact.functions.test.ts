import { describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  auth: Symbol("auth"),
  registered: [] as unknown[][],
  read: vi.fn(),
  stage: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: h.auth }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (v: unknown) => v;
    const b = {
      middleware: (items: unknown[]) => {
        h.registered.push(items);
        return b;
      },
      inputValidator: (fn: typeof parse) => {
        parse = fn;
        return b;
      },
      handler: (fn: (args: unknown) => unknown) => (args: { data: unknown; context: unknown }) =>
        fn({ ...args, data: parse(args.data) }),
    };
    return b;
  },
}));
vi.mock("./native-ai-artifact.server", () => ({
  readNativeArtifacts: h.read,
  stageNativeArtifact: h.stage,
  getNativeArtifact: h.get,
  removeNativeArtifact: h.remove,
}));
import {
  getNativeArtifactFn,
  readNativeArtifactsFn,
  removeNativeArtifactFn,
  stageNativeArtifactFn,
} from "./native-ai-artifact.functions";
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const scope = { expectedOwnerId: owner, projectId: "p" };
const metadata = {
  source: "bing_ai_performance",
  declaredProperty: "https://example.com/",
  reportKind: "table",
  dimension: "page",
  aggregation: "page",
  period: { start: "2026-08-01", end: "2026-08-28", timezone: null },
  marketScope: { country: null, exposed: false },
  filters: {},
  capturedAt: "2026-08-29T00:00:00Z",
  filename: null,
};
const base64 = Buffer.from(new TextEncoder().encode("opaque")).toString("base64");
const call = (fn: unknown, data: unknown) =>
  (fn as (v: unknown) => Promise<unknown>)({ data, context: { userId: owner } });
describe("native artifact endpoint authentication", () => {
  it("requires auth on all four endpoints", () => {
    expect(h.registered).toHaveLength(4);
    for (const registration of h.registered) expect(registration).toEqual([h.auth]);
  });
  it("binds reads and staging to the authenticated owner", async () => {
    await call(readNativeArtifactsFn, scope);
    expect(h.read).toHaveBeenLastCalledWith({ ownerId: owner, projectId: "p" });
    await call(stageNativeArtifactFn, { ...scope, metadata, base64 });
    expect(h.stage).toHaveBeenLastCalledWith(
      { ownerId: owner, projectId: "p" },
      { metadata, base64 },
    );
    // Each endpoint validates its own shape, then refuses a mismatched authenticated owner.
    const foreign = { ...scope, expectedOwnerId: other };
    for (const [fn, data] of [
      [readNativeArtifactsFn, foreign],
      [stageNativeArtifactFn, { ...foreign, metadata, base64 }],
      [getNativeArtifactFn, { ...foreign, id: owner }],
      [removeNativeArtifactFn, { ...foreign, id: owner }],
    ] as const)
      await expect(call(fn, data)).rejects.toThrow("owner_changed");
  });
  it("refuses caller-supplied owners, malformed project ids and forged metadata extras", async () => {
    for (const data of [
      { ...scope, ownerId: other },
      { ...scope, projectId: "../p" },
    ])
      expect(() => call(readNativeArtifactsFn, data)).toThrow();
    // A parsed/server-only field smuggled into declared metadata is refused by the strict schema.
    expect(() =>
      call(stageNativeArtifactFn, {
        ...scope,
        metadata: { ...metadata, status: "unsupported" },
        base64,
      }),
    ).toThrow();
    // A GSC artifact cannot enter with an assumed or missing timezone.
    expect(() =>
      call(stageNativeArtifactFn, {
        ...scope,
        metadata: { ...metadata, source: "gsc_generative_ai_search" },
        base64,
      }),
    ).toThrow();
    // An impossible calendar date is refused by the shared real-date period schema.
    expect(() =>
      call(stageNativeArtifactFn, {
        ...scope,
        metadata: {
          ...metadata,
          period: { start: "2026-02-30", end: "2026-02-30", timezone: null },
        },
        base64,
      }),
    ).toThrow();
    // Non-base64 or whitespace bodies never reach the server wrapper.
    expect(() =>
      call(stageNativeArtifactFn, { ...scope, metadata, base64: "not base64" }),
    ).toThrow();
    expect(() => call(removeNativeArtifactFn, { ...scope, id: "not-a-uuid" })).toThrow();
  });
  it("guards account switches on deletion without touching storage", async () => {
    await expect(
      call(removeNativeArtifactFn, { ...scope, expectedOwnerId: other, id: owner }),
    ).rejects.toThrow("owner_changed");
    expect(h.remove).not.toHaveBeenCalled();
  });
});
