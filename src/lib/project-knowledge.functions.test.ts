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
  outputRead: vi.fn(),
  outputSave: vi.fn(),
  outputHistory: vi.fn(),
  outputWithdraw: vi.fn(),
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
vi.mock("./knowledge-output-review.server", () => ({ readKnowledgeOutputReview: h.outputRead }));
vi.mock("./knowledge-output-review-actions.server", () => ({
  saveKnowledgeOutputReview: h.outputSave,
  readKnowledgeOutputReviewHistory: h.outputHistory,
  withdrawKnowledgeOutputReview: h.outputWithdraw,
}));
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
    expect(h.registered).toHaveLength(Object.keys(endpoints).length);
    for (const registered of h.registered) expect(registered).toEqual([h.auth]);
  });
  it("binds all output review actions to authenticated ownership", async () => {
    const target = { projectId: "p", assetId: "a" };
    const bound = { ...scope, assetId: "a" };
    const review = {
      reviewId: id,
      expectedVersion: { algorithm: "milo-publication-v1", hash: "a".repeat(64) },
      expectedContext: "b".repeat(64),
      reviewedFacts: ["fact"],
      confirmDeliverable: true,
    };
    await call(endpoints.readKnowledgeOutputReviewFn, target);
    await call(endpoints.readKnowledgeOutputReviewHistoryFn, target);
    await call(endpoints.saveKnowledgeOutputReviewFn, { ...target, review });
    await call(endpoints.withdrawKnowledgeOutputReviewFn, { ...target, reviewId: id });
    expect(h.outputRead).toHaveBeenCalledExactlyOnceWith(bound);
    expect(h.outputHistory).toHaveBeenCalledExactlyOnceWith(bound);
    expect(h.outputSave).toHaveBeenCalledExactlyOnceWith(bound, review);
    expect(h.outputWithdraw).toHaveBeenCalledExactlyOnceWith(bound, id);
    expect(() =>
      call(endpoints.saveKnowledgeOutputReviewFn, { ...target, ownerId: "forged", review }),
    ).toThrow();
    expect(h.outputSave).toHaveBeenCalledTimes(1);
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

it("rejects malformed or forged structured coverage through teach/propose/review", async () => {
  const badFields = {
    ...fields,
    key: "coverage.local.test",
    category: "fact",
    appliesTo: "text",
    value: '{"verified":true}',
  };
  for (const [fn, data] of [
    [endpoints.teachProjectKnowledgeFn, { projectId: "p", fields: badFields }],
    [
      endpoints.proposeKnowledgeRecordFn,
      { projectId: "p", id, sourceId: id, sourceRevision: 1, fields: badFields },
    ],
    [
      endpoints.reviewProjectKnowledgeFn,
      { projectId: "p", id, expectedRevision: 1, status: "accepted", fields: badFields },
    ],
  ])
    expect(() => call(fn, data)).toThrow();
  expect(h.pair).not.toHaveBeenCalled();
  expect(h.write).not.toHaveBeenCalled();
});

const coverageFields = {
  key: "coverage.local.test",
  category: "fact",
  appliesTo: "text",
  value: JSON.stringify({
    kind: "local",
    target: "Stockholm",
    service: "",
    name: "Example",
    address: "",
    phone: "",
    language: "",
    pageUrl: "",
    alternateUrl: "",
    citationUrl: "",
    reviewUrl: "",
    gbpUrl: "",
    notes: "",
  }),
  locator: "Owner statement",
};
const coverageSource = {
  ...scope,
  id,
  revision: 1,
  status: "active",
  observedAt: "2020-01-01T00:00:00Z",
};
const coverageRecord = {
  ...scope,
  ...coverageFields,
  id,
  revision: 1,
  sourceId: id,
  sourceRevision: 1,
};
it.each([
  { sources: [] },
  { sources: [{ ...coverageSource, status: "revoked" }] },
  { sources: [{ ...coverageSource, revision: 2 }] },
  { sources: [{ ...coverageSource, observedAt: "2099-01-01T00:00:00Z" }] },
  { records: [{ ...coverageRecord, validUntil: "2020-01-01T00:00:00Z" }] },
])("rechecks current coverage source and expiry before an acceptance write %#", async (patch) => {
  h.read.mockResolvedValue({ sources: [coverageSource], records: [coverageRecord], ...patch });
  await expect(
    call(endpoints.reviewProjectKnowledgeFn, {
      projectId: "p",
      id,
      expectedRevision: 1,
      fields: coverageFields,
      status: "accepted",
    }),
  ).rejects.toThrow("unavailable");
  expect(h.write).not.toHaveBeenCalled();
});
it("accepts current coverage and an explicitly reviewed future expiry renewal", async () => {
  h.read.mockResolvedValue({
    sources: [coverageSource],
    records: [{ ...coverageRecord, validUntil: "2020-01-01T00:00:00Z" }],
  });
  await call(endpoints.reviewProjectKnowledgeFn, {
    projectId: "p",
    id,
    expectedRevision: 1,
    fields: { ...coverageFields, validUntil: "2099-01-01T00:00:00Z" },
    status: "accepted",
  });
  expect(h.write).toHaveBeenCalledWith(
    scope,
    "record",
    expect.objectContaining({
      status: "accepted",
      validUntil: "2099-01-01T00:00:00Z",
      sourceRevision: 1,
      revision: 2,
    }),
    1,
  );
});
