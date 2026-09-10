import { describe, expect, it, vi } from "vitest";
import { refreshProjectSource, readSourceRefresh, reviewSourceFact } from "./source-refresh.server";
const scope = { ownerId: "00000000-0000-4000-8000-000000000001", projectId: "p" };
const sourceId = "00000000-0000-4000-8000-000000000002";
const input = { sourceId, expectedRevision: 1 };
const source = {
  ...scope,
  id: sourceId,
  revision: 1,
  kind: "website",
  status: "active",
  label: "Page",
  fingerprint: "a".repeat(64),
  observedAt: "2026-09-10T08:00:00Z",
  url: "https://example.com",
};
const ok = (data: unknown) => ({ data, error: null });
describe("source refresh server boundary", () => {
  it("acquires a scoped lease before capture and stores bounded warnings", async () => {
    const sequence: string[] = [];
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      sequence.push(name);
      expect(args.p_user).toBe(scope.ownerId);
      if (name.startsWith("begin")) return ok({ acquired: true, revision: 0, source });
      expect(args.p_snapshot).toMatchObject({
        ...scope,
        sourceId,
        revision: 1,
        coverage: "public-page",
        warnings: ["limited_readable_text"],
        conflicts: [],
      });
      return ok({ status: "ok", revision: 1 });
    });
    const fetchPage = vi.fn(async () => {
      sequence.push("fetch");
      return "<p>Short page</p>";
    });
    expect(await refreshProjectSource(scope, input, { rpc, fetchPage })).toEqual({ status: "ok" });
    expect(sequence).toEqual([
      "begin_project_source_refresh",
      "fetch",
      "finish_project_source_refresh",
    ]);
    expect(fetchPage).toHaveBeenCalledWith(source.url);
    expect(rpc.mock.calls[0][1].p_token).toBe(rpc.mock.calls[1][1].p_token);
  });
  it("does not fetch on denied ownership or cooldown", async () => {
    const fetchPage = vi.fn();
    await expect(
      refreshProjectSource(scope, input, {
        rpc: async () => ({ data: null, error: {} }),
        fetchPage,
      }),
    ).rejects.toThrow();
    expect(
      await refreshProjectSource(scope, input, {
        rpc: async () => ok({ acquired: false }),
        fetchPage,
      }),
    ).toEqual({ status: "cooldown" });
    expect(fetchPage).not.toHaveBeenCalled();
  });
  it.each([
    { projectId: "foreign" },
    { ownerId: "00000000-0000-4000-8000-000000000003" },
    { revision: 2 },
    { status: "revoked" },
    { kind: "document" },
    { url: undefined },
  ])("refuses changed or foreign lease source %j", async (patch) => {
    const fetchPage = vi.fn();
    await expect(
      refreshProjectSource(scope, input, {
        rpc: async () => ok({ acquired: true, revision: 0, source: { ...source, ...patch } }),
        fetchPage,
      }),
    ).rejects.toThrow();
    expect(fetchPage).not.toHaveBeenCalled();
  });
  it.each(["", "throw"])("finishes unknown on failed capture %s", async (value) => {
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name.startsWith("begin")) return ok({ acquired: true, revision: 3, source });
      expect(args.p_snapshot).toBeNull();
      return ok({ status: "unknown", revision: 3 });
    });
    expect(
      await refreshProjectSource(scope, input, {
        rpc,
        fetchPage: async () => {
          if (value) throw Error("private transport detail");
          return value;
        },
      }),
    ).toEqual({ status: "unknown" });
  });
  it("does not replay a rejected finish or claim success", async () => {
    const rpc = vi.fn(async (name: string) =>
      name.startsWith("begin")
        ? ok({ acquired: true, revision: 0, source })
        : { data: null, error: {} },
    );
    await expect(
      refreshProjectSource(scope, input, { rpc, fetchPage: async () => "<p>page</p>" }),
    ).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("refuses accepted hashes without a matching scoped snapshot", async () => {
    const rpc = async (name: string) =>
      ok(
        name === "read_project_knowledge"
          ? { sources: [source], records: [] }
          : [
              {
                sourceId,
                sourceRevision: 1,
                revision: 0,
                lastAttempt: "2026-09-10T08:00:00Z",
                status: "unknown",
                snapshot: null,
                history: [],
                accepted: { price: "b".repeat(64) },
              },
            ],
      );
    await expect(readSourceRefresh(scope, rpc)).rejects.toThrow();
  });
  it("requires a confirmed review result", async () => {
    await expect(
      reviewSourceFact(
        scope,
        { ...input, key: "price", fingerprint: "a".repeat(64), accept: true, previous: false },
        async () => ok(false),
      ),
    ).rejects.toThrow();
  });
});

describe("accepted source generation context", () => {
  it("includes exact accepted current facts only, within bytes, and rejects foreign history", async () => {
    const { loadSourceFactContext } = await import("./source-refresh.server");
    const now = "2026-09-10T09:00:00Z";
    const fact = {
      key: "price",
      fingerprint: "b".repeat(64),
      field: "price",
      value: "100",
      locator: "Offer",
    };
    const row = {
      sourceId,
      sourceRevision: 1,
      revision: 1,
      lastAttempt: now,
      status: "ok",
      accepted: { price: fact.fingerprint },
      history: [],
      snapshot: {
        ...scope,
        sourceId,
        revision: 1,
        observedAt: now,
        coverage: "public-page",
        facts: [fact, { ...fact, key: "unaccepted" }],
      },
    };
    const rpc = async (name: string) =>
      ok(name === "read_project_knowledge" ? { sources: [source], records: [] } : [row]);
    const result = await loadSourceFactContext(scope, now, rpc);
    expect(result.dependencies.map((d) => d.key)).toEqual(["price"]);
    expect(result.context).not.toContain("unaccepted");
    expect(await loadSourceFactContext(scope, now, rpc, 10)).toEqual({
      context: "",
      dependencies: [],
    });
    row.status = "unknown";
    expect((await loadSourceFactContext(scope, now, rpc)).dependencies).toEqual([]);
    row.status = "ok";
    row.snapshot.observedAt = "2026-09-01T00:00:00Z";
    expect((await loadSourceFactContext(scope, now, rpc)).dependencies).toEqual([]);
  });
});
