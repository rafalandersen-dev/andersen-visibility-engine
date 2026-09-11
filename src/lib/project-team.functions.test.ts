import { describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  auth: Symbol("auth"),
  registered: [] as unknown[][],
  update: vi.fn(),
  accept: vi.fn(),
  roster: vi.fn(),
  list: vi.fn(),
  read: vi.fn(),
  rpc: vi.fn(),
  edit: vi.fn(),
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
      handler: (fn: (a: unknown) => unknown) => (a: { data: unknown; context: unknown }) =>
        fn({ ...a, data: parse(a.data) }),
    };
    return b;
  },
}));
vi.mock("./project-team-membership.server", () => ({
  updateProjectTeam: h.update,
  acceptProjectTeam: h.accept,
  readProjectTeamRoster: h.roster,
  listMyProjectTeams: h.list,
  projectTeamRpc: h.rpc,
}));
vi.mock("./project-team-read.server", () => ({ readTeamProject: h.read }));
vi.mock("./project-team-edit.server", () => ({ saveProjectTeamDraft: h.edit }));
import * as endpoints from "./project-team.functions";
const actor = "00000000-0000-4000-8000-000000000001";
const owner = "00000000-0000-4000-8000-000000000002";
const invite = "00000000-0000-4000-8000-000000000003";
const invoke = (fn: unknown, data: unknown) =>
  (fn as (args: unknown) => Promise<unknown>)({ data, context: { userId: actor } });
describe("team authentication entry points", () => {
  it("requires authentication on every entry point", () => {
    expect(h.registered).toHaveLength(8);
    expect(h.registered.every((items) => items.length === 1 && items[0] === h.auth)).toBe(true);
  });
  it("derives owner administration from authentication and rejects supplied actor/owner overrides", async () => {
    const data = {
      action: "invite",
      projectId: "p",
      inviteId: invite,
      email: "member@example.test",
      role: "viewer",
    };
    await invoke(endpoints.updateProjectTeamFn, data);
    expect(h.update).toHaveBeenCalledWith(actor, data);
    expect(() => invoke(endpoints.updateProjectTeamFn, { ...data, ownerId: owner })).toThrow();
    expect(() => invoke(endpoints.updateProjectTeamFn, { ...data, actorId: owner })).toThrow();
  });
  it("keeps authenticated acceptor and reader distinct from project owner", async () => {
    const data = { ownerId: owner, projectId: "p", inviteId: invite };
    await invoke(endpoints.acceptProjectTeamFn, data);
    expect(h.accept).toHaveBeenCalledWith(actor, data);
    await invoke(endpoints.readTeamProjectFn, { ownerId: owner, projectId: "p" });
    expect(h.read).toHaveBeenCalledWith(
      actor,
      { ownerId: owner, projectId: "p", offset: 0 },
      h.rpc,
    );
    expect(() =>
      invoke(endpoints.acceptProjectTeamFn, { ...data, email: "spoof@example.test" }),
    ).toThrow();
  });
  it("does not accept another person's identity for roster or discovery", async () => {
    await invoke(endpoints.readProjectTeamRosterFn, { projectId: "p" });
    expect(h.roster).toHaveBeenCalledWith(actor, { projectId: "p" });
    await invoke(endpoints.listMyProjectTeamsFn, {});
    expect(h.list).toHaveBeenCalledWith(actor);
    expect(() => invoke(endpoints.listMyProjectTeamsFn, { actorId: owner })).toThrow();
  });
  it("binds draft edits to the authenticated actor and rejects approval/evidence fields", async () => {
    const fields = {
      title: "Draft",
      markdown: "Edited",
      h1: "",
      metaTitle: "",
      metaDescription: "",
      cta: "",
      outline: [],
      faq: [],
    };
    const data = {
      ownerId: owner,
      projectId: "p",
      assetId: "a",
      editId: invite,
      expectedHash: "a".repeat(64),
      expectedMembershipRevision: 1,
      fields,
    };
    await invoke(endpoints.saveProjectTeamDraftFn, data);
    expect(h.edit).toHaveBeenCalledWith(actor, data);
    expect(() => invoke(endpoints.saveProjectTeamDraftFn, { ...data, actorId: owner })).toThrow();
    expect(() =>
      invoke(endpoints.saveProjectTeamDraftFn, {
        ...data,
        fields: { ...fields, status: "Approved" },
      }),
    ).toThrow();
    expect(() =>
      invoke(endpoints.saveProjectTeamDraftFn, {
        ...data,
        fields: { ...fields, knowledgeReferences: [] },
      }),
    ).toThrow();
  });
});
