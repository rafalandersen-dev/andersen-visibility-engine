import { describe, it, expect, vi } from "vitest";
const h = vi.hoisted(() => ({
  auth: Symbol("auth"),
  registered: [] as unknown[][],
  read: vi.fn(),
  change: vi.fn(),
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
vi.mock("./project-team-notifications.server", () => ({
  readTeamNotificationSettings: h.read,
  changeTeamNotificationSettings: h.change,
}));
import {
  readTeamNotificationSettingsFn,
  changeTeamNotificationSettingsFn,
} from "./project-team-notifications.functions";
const actor = "00000000-0000-4000-8000-000000000001",
  owner = "00000000-0000-4000-8000-000000000002";
const invoke = (fn: unknown, data: unknown) =>
  (fn as (args: unknown) => Promise<unknown>)({ data, context: { userId: actor } });
describe("recipient settings authentication", () => {
  it("requires authentication for both endpoints and derives the actor from the session", async () => {
    expect(h.registered).toEqual([[h.auth], [h.auth]]);
    const target = { ownerId: owner, projectId: "p", recipientId: actor };
    await invoke(readTeamNotificationSettingsFn, target);
    expect(h.read).toHaveBeenCalledWith(actor, target);
    const data = {
      ...target,
      action: "opt_in",
      enabled: true,
      expectedRevision: 0,
      expectedMembershipRevision: 1,
    };
    await invoke(changeTeamNotificationSettingsFn, data);
    expect(h.change).toHaveBeenCalledWith(actor, data);
    expect(() => invoke(changeTeamNotificationSettingsFn, { ...data, actorId: owner })).toThrow();
  });
});
