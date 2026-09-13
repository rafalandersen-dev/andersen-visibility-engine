import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  auth: Symbol("auth"),
  middleware: [] as unknown[][],
  begin: vi.fn(),
  run: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
  cancel: vi.fn(),
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
vi.mock("./milo-conversation.server", () => ({
  beginConversationTurn: h.begin,
  readConversation: h.read,
  listConversations: h.list,
  cancelConversationTurn: h.cancel,
}));
vi.mock("./milo-specialist-executor.server", () => ({ runConversationSpecialists: h.run }));
import * as endpoints from "./milo-conversation.functions";
const actor = "00000000-0000-4000-8000-000000000001",
  ownerId = "00000000-0000-4000-8000-000000000002",
  conversationId = "00000000-0000-4000-8000-000000000003",
  turnId = "00000000-0000-4000-8000-000000000004";
const target = { ownerId, projectId: "p", conversationId, turnId };
const input = { ...target, body: "Check my SEO", locale: "en" };
beforeEach(() => {
  vi.clearAllMocks();
  h.begin.mockResolvedValue({ created: true, turn: { state: "pending" } });
  h.run.mockResolvedValue({ state: "completed" });
});
function invoke(fn: unknown, data: unknown) {
  return (fn as (args: unknown) => Promise<unknown>)({ data, context: { userId: actor } });
}
describe("authenticated conversation endpoints", () => {
  it("authenticates all public entries and exposes no claim or evidence-write endpoint", () => {
    expect(h.middleware).toHaveLength(5);
    expect(h.middleware.every((entry) => entry.length === 1 && entry[0] === h.auth)).toBe(true);
    expect(Object.keys(endpoints).sort()).toEqual([
      "cancelMiloTurnFn",
      "listMiloConversationsFn",
      "readMiloConversationFn",
      "resumeMiloTurnFn",
      "sendMiloMessageFn",
    ]);
  });
  it("derives the actor from the session and executes only the persisted pending task", async () => {
    h.begin.mockResolvedValue({ created: true, turn: { state: "pending" } });
    h.run.mockResolvedValue({ state: "completed" });
    expect(await invoke(endpoints.sendMiloMessageFn, input)).toEqual({
      turn: { state: "completed" },
    });
    expect(h.begin).toHaveBeenCalledWith(actor, input);
    expect(h.run).toHaveBeenCalledWith(actor, target);
  });
  it("preserves a received generation choice but cannot accept supplied tool/actor/claim evidence", async () => {
    await invoke(endpoints.sendMiloMessageFn, { ...input, allowDraftGeneration: true });
    expect(h.begin).toHaveBeenLastCalledWith(actor, { ...input, allowDraftGeneration: true });
    for (const extra of [
      { actorId: ownerId },
      { attemptId: turnId },
      { role: "content" },
      { tools: [{ name: "publish" }] },
      { events: [] },
    ])
      expect(() => invoke(endpoints.sendMiloMessageFn, { ...input, ...extra })).toThrow();
  });
  it("does not re-run received running, unknown or completed submissions", async () => {
    for (const state of ["running", "unknown", "completed", "cancelled", "failed"]) {
      h.run.mockClear();
      h.begin.mockResolvedValue({ created: false, turn: { state } });
      expect(await invoke(endpoints.sendMiloMessageFn, input)).toEqual({ turn: { state } });
      expect(h.run).not.toHaveBeenCalled();
    }
  });
  it("can resume a pending recorded task without replacing its body or expanding generation permission", async () => {
    await invoke(endpoints.resumeMiloTurnFn, target);
    expect(h.run).toHaveBeenLastCalledWith(actor, target);
    expect(() =>
      invoke(endpoints.resumeMiloTurnFn, { ...target, allowDraftGeneration: true }),
    ).toThrow();
    expect(() => invoke(endpoints.resumeMiloTurnFn, { ...target, body: "Different" })).toThrow();
  });
  it("keeps history and cancellation scoped to the authenticated reader and submitted client", async () => {
    const readTarget = { ownerId, projectId: "p", conversationId };
    await invoke(endpoints.readMiloConversationFn, readTarget);
    expect(h.read).toHaveBeenCalledWith(actor, { ...readTarget, after: 0 });
    await invoke(endpoints.listMiloConversationsFn, { ownerId, projectId: "p" });
    expect(h.list).toHaveBeenCalledWith(actor, { ownerId, projectId: "p", offset: 0 });
    await invoke(endpoints.cancelMiloTurnFn, target);
    expect(h.cancel).toHaveBeenCalledWith(actor, target);
    expect(() => invoke(endpoints.cancelMiloTurnFn, { ...target, actorId: ownerId })).toThrow();
  });
});
