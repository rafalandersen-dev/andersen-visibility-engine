import { describe, it, expect, vi } from "vitest";
const h = vi.hoisted(() => ({
  auth: Symbol("auth"),
  registered: [] as unknown[][],
  read: vi.fn(),
  request: vi.fn(),
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
vi.mock("./project-team-invitation-delivery.server", () => ({
  readTeamInvitationDelivery: h.read,
  requestTeamInvitationDelivery: h.request,
}));
import {
  readTeamInvitationDeliveryFn,
  requestTeamInvitationDeliveryFn,
} from "./project-team-invitation-delivery.functions";
const actor = "00000000-0000-4000-8000-000000000001",
  invite = "00000000-0000-4000-8000-000000000002";
const invoke = (fn: unknown, data: unknown) =>
  (fn as (args: unknown) => Promise<unknown>)({ data, context: { userId: actor } });
describe("invitation email endpoint authentication", () => {
  it("requires authentication and binds owner identity to the session", async () => {
    expect(h.registered).toEqual([[h.auth], [h.auth]]);
    const target = { projectId: "p", inviteId: invite };
    await invoke(readTeamInvitationDeliveryFn, target);
    expect(h.read).toHaveBeenCalledWith(actor, target);
    const data = { ...target, email: "member@example.test", role: "reviewer" };
    await invoke(requestTeamInvitationDeliveryFn, data);
    expect(h.request).toHaveBeenCalledWith(actor, data);
    expect(() => invoke(requestTeamInvitationDeliveryFn, { ...data, ownerId: invite })).toThrow();
    expect(() => invoke(requestTeamInvitationDeliveryFn, { ...data, actorId: invite })).toThrow();
  });
});
