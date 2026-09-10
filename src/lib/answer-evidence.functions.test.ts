import { describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  auth: Symbol("auth"),
  registered: [] as unknown[][],
  read: vi.fn(),
  save: vi.fn(),
  import: vi.fn(),
  remove: vi.fn(),
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
vi.mock("./answer-evidence.server", () => ({
  readAnswerEvidence: h.read,
  saveEvidencePrompt: h.save,
  importAnswerEvidence: h.import,
  removeAnswerEvidence: h.remove,
}));
import {
  readAnswerEvidenceFn,
  saveEvidencePromptFn,
  importAnswerEvidenceFn,
  removeAnswerEvidenceFn,
} from "./answer-evidence.functions";
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const scope = { expectedOwnerId: owner, projectId: "p" };
const call = (fn: unknown, data: unknown) =>
  (fn as (v: unknown) => Promise<unknown>)({ data, context: { userId: owner } });
describe("answer endpoint authentication", () => {
  it("requires auth on all four endpoints", () => {
    expect(h.registered).toHaveLength(4);
    for (const registration of h.registered) expect(registration).toEqual([h.auth]);
  });
  it("binds reads to the authenticated owner", async () => {
    await call(readAnswerEvidenceFn, scope);
    expect(h.read).toHaveBeenLastCalledWith({ ownerId: owner, projectId: "p" });
    await expect(call(readAnswerEvidenceFn, { ...scope, expectedOwnerId: other })).rejects.toThrow(
      "owner_changed",
    );
  });
  it("refuses caller-supplied owners, malformed project IDs and mutation extras", async () => {
    for (const data of [
      { ...scope, ownerId: other },
      { ...scope, projectId: "../p" },
    ])
      expect(() => call(readAnswerEvidenceFn, data)).toThrow();
    expect(() => call(importAnswerEvidenceFn, { ...scope, answer: { verified: true } })).toThrow();
    expect(() =>
      call(saveEvidencePromptFn, { ...scope, id: owner, expected: -1, prompt: {} }),
    ).toThrow();
    expect(() => call(removeAnswerEvidenceFn, { ...scope, id: owner, kind: "all" })).toThrow();
  });
  it("guards account switches on removal", async () => {
    await expect(
      call(removeAnswerEvidenceFn, { ...scope, expectedOwnerId: other, id: owner, kind: "answer" }),
    ).rejects.toThrow("owner_changed");
    expect(h.remove).not.toHaveBeenCalled();
  });
});
