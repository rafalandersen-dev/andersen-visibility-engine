import { describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  auth: Symbol("auth"),
  registered: [] as unknown[][],
  readF: vi.fn(),
  saveF: vi.fn(),
  getF: vi.fn(),
  removeF: vi.fn(),
  readI: vi.fn(),
  saveI: vi.fn(),
  getI: vi.fn(),
  removeI: vi.fn(),
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
vi.mock("./citation-record.server", () => ({
  readCitationFindings: h.readF,
  saveCitationFinding: h.saveF,
  getCitationFinding: h.getF,
  removeCitationFinding: h.removeF,
  readCitationImprovements: h.readI,
  saveCitationImprovement: h.saveI,
  getCitationImprovement: h.getI,
  removeCitationImprovement: h.removeI,
}));
import {
  getCitationFindingFn,
  getCitationImprovementFn,
  readCitationFindingsFn,
  readCitationImprovementsFn,
  removeCitationFindingFn,
  removeCitationImprovementFn,
  saveCitationFindingFn,
  saveCitationImprovementFn,
} from "./citation-record.functions";
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const answer = "10000000-0000-4000-8000-000000000001";
const scope = { expectedOwnerId: owner, projectId: "p" };
const panelScope = {
  panelId: "40000000-0000-4000-8000-000000000001",
  panelVersion: 1,
  client: { name: "Acme", market: "US" },
};
const finding = {
  findingId: "60000000-0000-4000-8000-000000000001",
  family: "citation_source",
  evidence: [{ kind: "answer", id: answer }],
  entityMatch: "confirmed",
  capture: { answerComplete: true, citationsComplete: true },
  observation: "The answer cites a competitor but not this business.",
  hypothesis: null,
  competitorCited: true,
  ownCited: false,
  recommendation: null,
  support: [],
  accuracy: [],
  priority: { harm: "low", relevance: "low", fixability: "low" },
  decision: "accepted",
  review: { reviewer: owner, reviewedAt: "2026-09-19T12:00:00Z" },
  secondReview: null,
  linkedTaskId: null,
};
const improvement = {
  improvementId: "70000000-0000-4000-8000-000000000001",
  findingIds: [finding.findingId],
  taskId: "50000000-0000-4000-8000-000000000001",
  change: {
    description: "Added a service page.",
    approvedVersion: "v1",
    approvedBy: owner,
    approvedAt: "2026-09-19T12:00:00Z",
  },
  destination: { kind: "public_url", reference: "https://example.com/services" },
  baselineCaptureIds: [answer],
  verification: {
    method: "publication_receipt",
    receipt: "r",
    verifiedAt: "2026-09-19T18:00:00Z",
    reviewer: owner,
  },
};
const call = (fn: unknown, data: unknown) =>
  (fn as (v: unknown) => Promise<unknown>)({ data, context: { userId: owner } });
describe("citation record endpoint authentication", () => {
  it("requires auth on all eight endpoints", () => {
    expect(h.registered).toHaveLength(8);
    for (const registration of h.registered) expect(registration).toEqual([h.auth]);
  });
  it("binds reads and saves to the authenticated owner and refuses a mismatched owner", async () => {
    await call(readCitationFindingsFn, scope);
    expect(h.readF).toHaveBeenLastCalledWith({ ownerId: owner, projectId: "p" });
    await call(saveCitationFindingFn, { ...scope, scope: panelScope, finding });
    expect(h.saveF).toHaveBeenLastCalledWith(
      { ownerId: owner, projectId: "p" },
      { scope: panelScope, finding },
    );
    await call(saveCitationImprovementFn, { ...scope, scope: panelScope, improvement });
    expect(h.saveI).toHaveBeenLastCalledWith(
      { ownerId: owner, projectId: "p" },
      { scope: panelScope, improvement },
    );
    const foreign = { ...scope, expectedOwnerId: other };
    for (const [fn, data] of [
      [readCitationFindingsFn, foreign],
      [saveCitationFindingFn, { ...foreign, scope: panelScope, finding }],
      [getCitationFindingFn, { ...foreign, id: owner }],
      [removeCitationFindingFn, { ...foreign, id: owner }],
      [readCitationImprovementsFn, foreign],
      [saveCitationImprovementFn, { ...foreign, scope: panelScope, improvement }],
      [getCitationImprovementFn, { ...foreign, id: owner }],
      [removeCitationImprovementFn, { ...foreign, id: owner }],
    ] as const)
      await expect(call(fn, data)).rejects.toThrow("owner_changed");
  });
  it("refuses caller-supplied owners, malformed ids and off-contract records at the boundary", async () => {
    for (const data of [
      { ...scope, ownerId: other },
      { ...scope, projectId: "../p" },
    ])
      expect(() => call(readCitationFindingsFn, data)).toThrow();
    // A forged server-only extra key is refused by the strict finding schema.
    expect(() =>
      call(saveCitationFindingFn, {
        ...scope,
        scope: panelScope,
        finding: { ...finding, actorId: owner },
      }),
    ).toThrow();
    // An accepted finding needs a confirmed entity (schema superRefine).
    expect(() =>
      call(saveCitationFindingFn, {
        ...scope,
        scope: panelScope,
        finding: { ...finding, entityMatch: "ambiguous" },
      }),
    ).toThrow();
    // An improvement must reference at least one finding.
    expect(() =>
      call(saveCitationImprovementFn, {
        ...scope,
        scope: panelScope,
        improvement: { ...improvement, findingIds: [] },
      }),
    ).toThrow();
    // A verified improvement needs the baseline captures it improves on (schema superRefine).
    expect(() =>
      call(saveCitationImprovementFn, {
        ...scope,
        scope: panelScope,
        improvement: { ...improvement, baselineCaptureIds: [] },
      }),
    ).toThrow();
    expect(() => call(getCitationFindingFn, { ...scope, id: "not-a-uuid" })).toThrow();
    expect(() => call(removeCitationImprovementFn, { ...scope, id: "not-a-uuid" })).toThrow();
  });
  it("guards account switches on deletion without touching storage", async () => {
    await expect(
      call(removeCitationFindingFn, { ...scope, expectedOwnerId: other, id: owner }),
    ).rejects.toThrow("owner_changed");
    expect(h.removeF).not.toHaveBeenCalled();
  });
});
