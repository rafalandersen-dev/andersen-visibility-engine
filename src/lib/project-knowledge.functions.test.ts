import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  auth: Symbol("auth"),
  registered: [] as unknown[][],
  read: vi.fn(),
  readDocument: vi.fn(),
  write: vi.fn(),
  pair: vi.fn(),
  website: vi.fn(),
  upload: vi.fn(),
  revoke: vi.fn(),
  forget: vi.fn(),
  history: vi.fn(),
  revert: vi.fn(),
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
vi.mock("./project-knowledge.server", () => ({
  readProjectKnowledge: h.read,
  readProjectKnowledgeDocument: h.readDocument,
  writeProjectKnowledge: h.write,
  writeProjectKnowledgePair: h.pair,
  saveProjectKnowledgeDocument: h.upload,
  revokeProjectKnowledgeSource: h.revoke,
  forgetProjectKnowledge: h.forget,
  readProjectKnowledgeHistory: h.history,
  revertProjectKnowledgeRecord: h.revert,
  KnowledgeUnavailableError: class extends Error {
    constructor() {
      super("unavailable");
    }
  },
}));
vi.mock("./project-knowledge-website.server", () => ({
  captureProjectWebsiteKnowledge: h.website,
}));
import * as endpoints from "./project-knowledge.functions";
const id = "00000000-0000-4000-8000-000000000001";
const scope = { ownerId: "authenticated-owner", projectId: "p" };
const fields = {
  key: "voice.guidance",
  category: "voice",
  appliesTo: "both",
  value: "Warm",
  locator: "Owner instruction",
};
const call = (fn: unknown, data: unknown) =>
  (fn as (args: unknown) => Promise<unknown>)({ data, context: { userId: scope.ownerId } });
beforeEach(() => vi.resetAllMocks());
describe("authenticated project knowledge endpoints", () => {
  it("requires authentication for every endpoint", () => {
    expect(h.registered).toHaveLength(11);
    for (const registered of h.registered) expect(registered).toEqual([h.auth]);
  });
  it("binds read, upload, revoke, forget, history and revert to the signed-in owner", async () => {
    await call(endpoints.readProjectKnowledgeFn, { projectId: "p" });
    await call(endpoints.readKnowledgeDocumentFn, { projectId: "p", id, expectedRevision: 1 });
    expect(h.readDocument).toHaveBeenCalledExactlyOnceWith(scope, id, 1);
    expect(h.read).toHaveBeenCalledExactlyOnceWith(scope);
    await call(endpoints.buildWebsiteKnowledgeFn, { projectId: "p", url: "https://example.com" });
    expect(h.website).toHaveBeenCalledExactlyOnceWith(scope, "https://example.com");
    await call(endpoints.uploadKnowledgeDocumentFn, {
      projectId: "p",
      id,
      expectedRevision: 0,
      label: "Brand",
      base64: "UERG",
    });
    expect(h.upload).toHaveBeenCalledExactlyOnceWith(scope, {
      id,
      expectedRevision: 0,
      label: "Brand",
      base64: "UERG",
    });
    await call(endpoints.revokeProjectKnowledgeFn, { projectId: "p", id, expectedRevision: 1 });
    expect(h.revoke).toHaveBeenCalledExactlyOnceWith(scope, id, 1);
    await call(endpoints.forgetProjectKnowledgeFn, {
      projectId: "p",
      id,
      kind: "source",
      expectedRevision: 1,
    });
    expect(h.forget).toHaveBeenCalledExactlyOnceWith(scope, "source", id, 1);
    await call(endpoints.knowledgeHistoryFn, { projectId: "p", id, kind: "record" });
    expect(h.history).toHaveBeenCalledExactlyOnceWith(scope, "record", id, undefined);
    await call(endpoints.revertProjectKnowledgeFn, {
      projectId: "p",
      id,
      expectedRevision: 2,
      restoreRevision: 1,
    });
    expect(h.revert).toHaveBeenCalledExactlyOnceWith(scope, id, 2, 1);
  });
  it("never lets the caller forge ownership or mark an imported record accepted", async () => {
    expect(() =>
      call(endpoints.readProjectKnowledgeFn, { projectId: "p", ownerId: "victim" }),
    ).toThrow();
    expect(() =>
      call(endpoints.proposeKnowledgeRecordFn, {
        projectId: "p",
        id,
        sourceId: id,
        sourceRevision: 1,
        fields,
        status: "accepted",
      }),
    ).toThrow();
    await call(endpoints.proposeKnowledgeRecordFn, {
      projectId: "p",
      id,
      sourceId: id,
      sourceRevision: 1,
      fields,
    });
    expect(h.write).toHaveBeenCalledWith(
      scope,
      "record",
      expect.objectContaining({ ...scope, status: "proposed", revision: 1 }),
      0,
    );
  });
  it("preserves source identity during review and rejects a stale owner edit", async () => {
    const current = {
      ...scope,
      ...fields,
      id,
      revision: 2,
      sourceId: id,
      sourceRevision: 4,
      status: "proposed",
      updatedAt: "2026-09-09T10:00:00Z",
    };
    h.read.mockResolvedValue({ sources: [], records: [current] });
    await expect(
      call(endpoints.reviewProjectKnowledgeFn, {
        projectId: "p",
        id,
        expectedRevision: 1,
        fields,
        status: "accepted",
      }),
    ).rejects.toThrow("unavailable");
    expect(h.write).not.toHaveBeenCalled();
    await call(endpoints.reviewProjectKnowledgeFn, {
      projectId: "p",
      id,
      expectedRevision: 2,
      fields: { ...fields, value: "Clear" },
      status: "accepted",
    });
    expect(h.write).toHaveBeenCalledWith(
      scope,
      "record",
      expect.objectContaining({
        sourceId: id,
        sourceRevision: 4,
        value: "Clear",
        revision: 3,
        status: "accepted",
      }),
      2,
    );
  });
});
