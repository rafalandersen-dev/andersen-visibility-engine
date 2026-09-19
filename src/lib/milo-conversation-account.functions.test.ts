import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  auth: Symbol("auth"),
  middleware: [] as unknown[][],
  list: vi.fn(),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: h.auth }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (value: unknown) => value;
    const builder = {
      middleware: (items: unknown[]) => {
        h.middleware.push(items);
        return builder;
      },
      inputValidator: (fn: typeof parse) => {
        parse = fn;
        return builder;
      },
      handler: (fn: (args: unknown) => unknown) => (args: { data: unknown; context: unknown }) =>
        fn({ ...args, data: parse(args.data) }),
    };
    return builder;
  },
}));
vi.mock("./milo-conversation-account.server", () => ({ listAccountConversations: h.list }));
import * as endpoints from "./milo-conversation-account.functions";
const actor = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const before = { createdAt: "2026-09-13T12:00:00.123456+00:00", conversationId: other };
function invoke(data: unknown) {
  return (endpoints.listMyMiloConversationsFn as unknown as (args: unknown) => Promise<unknown>)({
    data,
    context: { userId: actor },
  });
}
beforeEach(() => vi.clearAllMocks());
describe("authenticated account conversation directory endpoint", () => {
  it("authenticates the only public directory action and exposes no account-level erase", () => {
    expect(h.middleware).toEqual([[h.auth]]);
    expect(Object.keys(endpoints)).toEqual(["listMyMiloConversationsFn"]);
  });
  it("derives the actor from the session for first and later pages", async () => {
    await invoke({});
    expect(h.list).toHaveBeenCalledWith(actor, {});
    await invoke({ before });
    expect(h.list).toHaveBeenLastCalledWith(actor, { before });
  });
  it("refuses actor overrides, client scope, offsets, content and half cursors before the server action", () => {
    for (const data of [
      { actorId: other },
      { ownerId: other },
      { projectId: "p" },
      { offset: 25 },
      { title: "private" },
      { before: { createdAt: before.createdAt } },
      { before: { ...before, actorId: other } },
      { before: { ...before, createdAt: "not a time" } },
    ])
      expect(() => invoke(data)).toThrow();
    expect(h.list).not.toHaveBeenCalled();
  });
});
