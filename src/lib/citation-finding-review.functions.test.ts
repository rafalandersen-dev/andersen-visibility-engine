import { describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  auth: Symbol("auth"),
  registered: [] as unknown[][],
  save: vi.fn(),
  list: vi.fn(),
  view: vi.fn(),
  remove: vi.fn(),
  grant: vi.fn(),
  revoke: vi.fn(),
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
vi.mock("./citation-finding-review.server", () => ({
  saveCitationFindingReview: h.save,
  readCitationFindingReviews: h.list,
  getCitationFindingForReview: h.view,
  removeCitationFindingReview: h.remove,
  grantCitationReviewAssignment: h.grant,
  revokeCitationReviewAssignment: h.revoke,
}));
import {
  getCitationFindingForReviewFn,
  grantCitationReviewAssignmentFn,
  readCitationFindingReviewsFn,
  removeCitationFindingReviewFn,
  revokeCitationReviewAssignmentFn,
  saveCitationFindingReviewFn,
} from "./citation-finding-review.functions";
const owner = "00000000-0000-4000-8000-000000000001";
const reviewer = "00000000-0000-4000-8000-0000000000a1";
const row = "60000000-0000-4000-8000-000000000001";
const sha = "a".repeat(64);
const call = (fn: unknown, data: unknown, userId = reviewer) =>
  (fn as (v: unknown) => Promise<unknown>)({ data, context: { userId } });
describe("citation finding review endpoint authentication", () => {
  it("requires auth on all six endpoints", () => {
    expect(h.registered).toHaveLength(6);
    for (const registration of h.registered) expect(registration).toEqual([h.auth]);
  });
  it("always uses the authenticated caller as the actor — the reviewer can never be a payload field", async () => {
    const input = {
      projectId: "p",
      ownerId: owner,
      findingRowId: row,
      expectedSha: sha,
      decision: "approved" as const,
      note: null,
    };
    await call(saveCitationFindingReviewFn, input, reviewer);
    // actor (1st arg) is context.userId; the supplied ownerId stays in the payload. A caller acting AS the
    // owner would derive actor=owner, which the database then refuses as a self second-review.
    expect(h.save).toHaveBeenLastCalledWith(reviewer, input);
    await call(saveCitationFindingReviewFn, input, owner);
    expect(h.save).toHaveBeenLastCalledWith(owner, input);
    // There is no reviewer/actor input key to forge: the strict schema rejects one.
    expect(() => call(saveCitationFindingReviewFn, { ...input, reviewerId: owner })).toThrow();
  });
  it("passes the actor through the read, view and remove endpoints", async () => {
    await call(readCitationFindingReviewsFn, { projectId: "p", ownerId: owner, findingRowId: row });
    expect(h.list).toHaveBeenLastCalledWith(reviewer, {
      projectId: "p",
      ownerId: owner,
      findingRowId: row,
    });
    await call(getCitationFindingForReviewFn, {
      projectId: "p",
      ownerId: owner,
      findingRowId: row,
    });
    expect(h.view).toHaveBeenLastCalledWith(reviewer, {
      projectId: "p",
      ownerId: owner,
      findingRowId: row,
    });
    await call(removeCitationFindingReviewFn, { projectId: "p", ownerId: owner, id: row });
    expect(h.remove).toHaveBeenLastCalledWith(reviewer, {
      projectId: "p",
      ownerId: owner,
      id: row,
    });
  });
  it("uses the authenticated caller as the OWNER for grant/revoke — the owner is never a payload field (finding 4062796988)", async () => {
    const input = { projectId: "p", findingRowId: row, reviewerId: reviewer };
    // The 1st arg is context.userId (the owner); there is no ownerId key to forge.
    await call(grantCitationReviewAssignmentFn, input, owner);
    expect(h.grant).toHaveBeenLastCalledWith(owner, input);
    await call(revokeCitationReviewAssignmentFn, input, owner);
    expect(h.revoke).toHaveBeenLastCalledWith(owner, input);
    // A stray ownerId (or any extra key) is rejected by the strict schema — no owner-authority to spoof.
    expect(() => call(grantCitationReviewAssignmentFn, { ...input, ownerId: reviewer })).toThrow();
    // Malformed reviewer/finding ids and a bad project are refused.
    expect(() => call(grantCitationReviewAssignmentFn, { ...input, reviewerId: "nope" })).toThrow();
    expect(() =>
      call(revokeCitationReviewAssignmentFn, { ...input, findingRowId: "no" }),
    ).toThrow();
    expect(() => call(grantCitationReviewAssignmentFn, { ...input, projectId: "../p" })).toThrow();
  });
  it("refuses malformed ids, a bad content hash, an off-list decision and a malformed project", () => {
    const base = {
      projectId: "p",
      ownerId: owner,
      findingRowId: row,
      expectedSha: sha,
      decision: "approved" as const,
    };
    expect(() => call(saveCitationFindingReviewFn, { ...base, findingRowId: "nope" })).toThrow();
    expect(() => call(saveCitationFindingReviewFn, { ...base, expectedSha: "zz" })).toThrow();
    expect(() => call(saveCitationFindingReviewFn, { ...base, decision: "meh" })).toThrow();
    expect(() => call(saveCitationFindingReviewFn, { ...base, projectId: "../p" })).toThrow();
    expect(() => call(saveCitationFindingReviewFn, { ...base, ownerId: "nope" })).toThrow();
    expect(() =>
      call(removeCitationFindingReviewFn, { projectId: "p", ownerId: owner, id: "no" }),
    ).toThrow();
  });
});
