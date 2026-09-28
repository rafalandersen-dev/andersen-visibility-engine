/**
 * Server-function boundary of the change evidence (candidate 20260928120000): every function registers the
 * Supabase auth middleware; OWNER functions bind the authenticated user to the owner scope and refuse an account
 * switch; ACTOR functions pass the authenticated user as the actor and the supplied owner/project — never the
 * other way round; inputs are validated by the strict schemas (no secret fields, no missing identities).
 */
import { describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  auth: Symbol("auth"),
  registered: [] as unknown[][],
  saveArtifact: vi.fn(),
  readArtifacts: vi.fn(),
  removeArtifact: vi.fn(),
  setApproval: vi.fn(),
  saveReceipt: vi.fn(),
  removeReceipt: vi.fn(),
  grant: vi.fn(),
  revoke: vi.fn(),
  view: vi.fn(),
  inspect: vi.fn(),
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
vi.mock("./citation-change.server", () => ({
  saveChangeArtifact: h.saveArtifact,
  readChangeArtifacts: h.readArtifacts,
  removeChangeArtifact: h.removeArtifact,
  setChangeApproval: h.setApproval,
  readChangeApprovalProvenance: vi.fn(),
  saveChangeReceipt: h.saveReceipt,
  removeChangeReceipt: h.removeReceipt,
  grantInspectionAssignment: h.grant,
  revokeInspectionAssignment: h.revoke,
  getImprovementForInspection: h.view,
  saveImprovementInspection: h.inspect,
}));
import * as fns from "./citation-change.functions";

const OWNER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const ACTOR = "00000000-0000-4000-8000-0000000000a1";
const ART = "00000000-0000-4000-8000-0000000000aa";
const ROW = "00000000-0000-4000-8000-0000000000f1";
const SHA = "a".repeat(64);
const ctx = (userId: string) => ({ context: { userId } });

describe("registration", () => {
  it("every exported function carries the auth middleware", () => {
    const count = Object.keys(fns).length;
    expect(count).toBe(12);
    expect(h.registered).toHaveLength(count);
    for (const items of h.registered) expect(items).toEqual([h.auth]);
  });
});

describe("owner functions", () => {
  it("bind the authenticated user to the owner scope and refuse an account switch", async () => {
    h.saveArtifact.mockResolvedValue({ id: ART });
    const data = {
      expectedOwnerId: OWNER,
      projectId: "p",
      kind: "listing",
      reference: "google-business-profile:acme",
      fields: { openingHours: { before: null, after: "9–18" } },
    };
    await fns.saveChangeArtifactFn({ data, ...ctx(OWNER) } as never);
    expect(h.saveArtifact).toHaveBeenCalledWith({ ownerId: OWNER, projectId: "p" }, data);
    await expect(fns.saveChangeArtifactFn({ data, ...ctx(OTHER) } as never)).rejects.toThrow(
      "evidence_owner_changed",
    );
    // Validation refusals happen BEFORE the handler runs (synchronously in the input validator).
    expect(() =>
      fns.saveChangeArtifactFn({
        data: { ...data, fields: { apiKey: { after: "x" } } },
        ...ctx(OWNER),
      } as never),
    ).toThrow(/unsupported field/);
    expect(() =>
      fns.saveChangeArtifactFn({
        data: {
          ...data,
          fields: { openingHours: { after: "9–18", password: "DUMMY_NONSECRET_SENTINEL" } },
        },
        ...ctx(OWNER),
      } as never),
    ).toThrow();
    h.setApproval.mockResolvedValue({});
    await fns.setChangeApprovalFn({
      data: {
        expectedOwnerId: OWNER,
        projectId: "p",
        artifactId: ART,
        expectedSha: SHA,
        approved: true,
        expectedRevision: 0,
        requestId: ROW,
      },
      ...ctx(OWNER),
    } as never);
    expect(h.setApproval).toHaveBeenCalledWith(OWNER, {
      ownerId: OWNER,
      projectId: "p",
      artifactId: ART,
      expectedSha: SHA,
      approved: true,
      expectedRevision: 0,
      requestId: ROW,
    });
    expect(() =>
      fns.setChangeApprovalFn({
        data: {
          expectedOwnerId: OWNER,
          projectId: "p",
          artifactId: ART,
          expectedSha: SHA,
          approved: true,
        },
        ...ctx(OWNER),
      } as never),
    ).toThrow();
    h.grant.mockResolvedValue({});
    await fns.grantInspectionAssignmentFn({
      data: { expectedOwnerId: OWNER, projectId: "p", improvementRowId: ROW, inspectorId: ACTOR },
      ...ctx(OWNER),
    } as never);
    expect(h.grant).toHaveBeenCalledWith(
      { ownerId: OWNER, projectId: "p" },
      { improvementRowId: ROW, inspectorId: ACTOR },
    );
    await expect(
      fns.grantInspectionAssignmentFn({
        data: { expectedOwnerId: OWNER, projectId: "p", improvementRowId: ROW, inspectorId: ACTOR },
        ...ctx(OTHER),
      } as never),
    ).rejects.toThrow("evidence_owner_changed");
  });
});

describe("actor functions", () => {
  it("pass the authenticated user as the actor with the supplied owner/project (the database decides authority)", async () => {
    h.view.mockResolvedValue({});
    await fns.getImprovementForInspectionFn({
      data: { ownerId: OWNER, projectId: "p", improvementRowId: ROW },
      ...ctx(ACTOR),
    } as never);
    expect(h.view).toHaveBeenCalledWith(ACTOR, {
      ownerId: OWNER,
      projectId: "p",
      improvementRowId: ROW,
    });
    h.inspect.mockResolvedValue({});
    const input = {
      ownerId: OWNER,
      projectId: "p",
      improvementRowId: ROW,
      expectedSha: SHA,
      checkResult: "does_not_show",
      observedAt: "2026-09-28T10:00:00Z",
      expectedVersion: 0,
      expectedHeadId: null,
    };
    await fns.saveImprovementInspectionFn({ data: input, ...ctx(ACTOR) } as never);
    expect(h.inspect).toHaveBeenCalledWith(ACTOR, input);
    // A caller cannot name the actor: an extra `actorId` field is refused by the strict schema.
    expect(() =>
      fns.saveImprovementInspectionFn({
        data: { ...input, actorId: OWNER },
        ...ctx(ACTOR),
      } as never),
    ).toThrow(/actorId/);
    h.setApproval.mockResolvedValue({});
    await fns.setChangeApprovalAsDelegateFn({
      data: {
        ownerId: OWNER,
        projectId: "p",
        artifactId: ART,
        expectedSha: SHA,
        approved: true,
        expectedRevision: 1,
        requestId: ROW,
      },
      ...ctx(ACTOR),
    } as never);
    expect(h.setApproval).toHaveBeenLastCalledWith(
      ACTOR,
      expect.objectContaining({ ownerId: OWNER }),
    );
  });
});
