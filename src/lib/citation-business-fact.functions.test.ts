import { describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  auth: Symbol("auth"),
  registered: [] as unknown[][],
  save: vi.fn(),
  read: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
  readAcc: vi.fn(),
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
vi.mock("./citation-business-fact.server", () => ({
  saveCitationBusinessFact: h.save,
  readCitationBusinessFacts: h.read,
  getCitationBusinessFact: h.get,
  removeCitationBusinessFact: h.remove,
  readCitationFindingAccuracy: h.readAcc,
}));
import {
  getCitationBusinessFactFn,
  readCitationBusinessFactsFn,
  readCitationFindingAccuracyFn,
  removeCitationBusinessFactFn,
  saveCitationBusinessFactFn,
} from "./citation-business-fact.functions";
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const scope = { expectedOwnerId: owner, projectId: "p" };
const fact = {
  factId: "a0000000-0000-4000-8000-000000000001",
  kind: "price",
  value: "500 SEK",
  confirmedBy: owner,
  confirmedAt: "2026-01-02T00:00:00Z",
  validFrom: "2026-01-01T00:00:00Z",
  validUntil: null,
};
const finding = "60000000-0000-4000-8000-000000000001";
const call = (fn: unknown, data: unknown) =>
  (fn as (v: unknown) => Promise<unknown>)({ data, context: { userId: owner } });
describe("citation business-fact endpoint authentication", () => {
  it("requires auth on all five endpoints", () => {
    expect(h.registered).toHaveLength(5);
    for (const registration of h.registered) expect(registration).toEqual([h.auth]);
  });
  it("binds saves/reads/accuracy to the authenticated owner and refuses a mismatch", async () => {
    await call(saveCitationBusinessFactFn, { ...scope, fact });
    expect(h.save).toHaveBeenLastCalledWith(
      { ownerId: owner, projectId: "p" },
      { fact, expectedVersion: null, expectedHeadId: null },
    );
    // A correction carries the inspected head ROW (version + immutable row id; expected-head conflict guard).
    const head = "b1000000-0000-4000-8000-0000000000aa";
    await call(saveCitationBusinessFactFn, {
      ...scope,
      fact,
      expectedVersion: 1,
      expectedHeadId: head,
    });
    expect(h.save).toHaveBeenLastCalledWith(
      { ownerId: owner, projectId: "p" },
      { fact, expectedVersion: 1, expectedHeadId: head },
    );
    expect(() =>
      call(saveCitationBusinessFactFn, { ...scope, fact, expectedVersion: 1.5 }),
    ).toThrow();
    // Version without row id / row id without version: refused (not an ABA-proof token).
    expect(() =>
      call(saveCitationBusinessFactFn, { ...scope, fact, expectedVersion: 1 }),
    ).toThrow();
    expect(() =>
      call(saveCitationBusinessFactFn, { ...scope, fact, expectedHeadId: head }),
    ).toThrow();
    await call(readCitationBusinessFactsFn, scope);
    expect(h.read).toHaveBeenLastCalledWith({ ownerId: owner, projectId: "p" });
    await call(readCitationFindingAccuracyFn, { ...scope, findingId: finding });
    expect(h.readAcc).toHaveBeenLastCalledWith({ ownerId: owner, projectId: "p" }, finding);
    const foreign = { ...scope, expectedOwnerId: other };
    for (const [fn, data] of [
      [saveCitationBusinessFactFn, { ...foreign, fact }],
      [readCitationBusinessFactsFn, foreign],
      [getCitationBusinessFactFn, { ...foreign, id: owner }],
      [removeCitationBusinessFactFn, { ...foreign, id: owner }],
      [readCitationFindingAccuracyFn, { ...foreign, findingId: finding }],
    ] as const)
      await expect(call(fn, data)).rejects.toThrow("owner_changed");
  });
  it("refuses caller-supplied owners, a wrong project, off-contract facts and malformed ids", async () => {
    for (const data of [
      { ...scope, ownerId: other },
      { ...scope, projectId: "../p" },
    ])
      expect(() => call(readCitationBusinessFactsFn, data)).toThrow();
    // A forged extra key is refused by the strict business-fact schema.
    expect(() =>
      call(saveCitationBusinessFactFn, { ...scope, fact: { ...fact, confirmedById: owner } }),
    ).toThrow();
    // An out-of-contract kind is refused.
    expect(() =>
      call(saveCitationBusinessFactFn, { ...scope, fact: { ...fact, kind: "bogus" } }),
    ).toThrow();
    expect(() => call(getCitationBusinessFactFn, { ...scope, id: "not-a-uuid" })).toThrow();
    expect(() =>
      call(readCitationFindingAccuracyFn, { ...scope, findingId: "not-a-uuid" }),
    ).toThrow();
  });
  it("guards account switches on deletion without touching storage", async () => {
    await expect(
      call(removeCitationBusinessFactFn, { ...scope, expectedOwnerId: other, id: owner }),
    ).rejects.toThrow("owner_changed");
    expect(h.remove).not.toHaveBeenCalled();
  });
});
