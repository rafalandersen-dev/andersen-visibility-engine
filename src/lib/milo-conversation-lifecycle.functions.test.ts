import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  auth: Symbol("auth"),
  middleware: [] as unknown[][],
  exportPage: vi.fn(),
  erase: vi.fn(),
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
vi.mock("./milo-conversation-lifecycle.server", () => ({
  exportConversationPage: h.exportPage,
  eraseConversation: h.erase,
}));
import * as endpoints from "./milo-conversation-lifecycle.functions";
const actor = "00000000-0000-4000-8000-000000000001",
  ownerId = "00000000-0000-4000-8000-000000000002",
  conversationId = "00000000-0000-4000-8000-000000000003";
const target = { ownerId, projectId: "p", conversationId };
function invoke(fn: unknown, data: unknown) {
  return (fn as (args: unknown) => Promise<unknown>)({ data, context: { userId: actor } });
}
beforeEach(() => vi.clearAllMocks());
describe("authenticated conversation lifecycle endpoints", () => {
  it("authenticates both public actions and exposes no erase-registry or authority endpoint", () => {
    expect(h.middleware).toEqual([[h.auth], [h.auth]]);
    expect(Object.keys(endpoints).sort()).toEqual([
      "eraseMiloConversationFn",
      "exportMiloConversationPageFn",
    ]);
  });
  it("derives the actor from the session for exports and erasure", async () => {
    await invoke(endpoints.exportMiloConversationPageFn, target);
    expect(h.exportPage).toHaveBeenCalledWith(actor, { ...target, after: 0 });
    await invoke(endpoints.eraseMiloConversationFn, target);
    expect(h.erase).toHaveBeenCalledWith(actor, target);
  });
  it("refuses actor overrides, content, state and invalid page continuations before server actions", () => {
    for (const fn of Object.values(endpoints))
      for (const extra of [
        { actorId: ownerId },
        { body: "private" },
        { force: true },
        { state: "erased" },
      ])
        expect(() => invoke(fn, { ...target, ...extra })).toThrow();
    expect(() =>
      invoke(endpoints.exportMiloConversationPageFn, { ...target, after: 20 }),
    ).toThrow();
    expect(() =>
      invoke(endpoints.eraseMiloConversationFn, { ...target, version: "a".repeat(64) }),
    ).toThrow();
    expect(h.exportPage).not.toHaveBeenCalled();
    expect(h.erase).not.toHaveBeenCalled();
  });
});
