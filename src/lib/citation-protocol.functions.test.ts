import { describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  auth: Symbol("auth"),
  registered: [] as unknown[][],
  read: vi.fn(),
  resolved: vi.fn(),
  draft: vi.fn(),
  lock: vi.fn(),
  brand: vi.fn(),
  capture: vi.fn(),
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
vi.mock("./citation-protocol.server", () => ({
  readCitationProtocol: h.read,
  readResolvedCaptures: h.resolved,
  saveCitationPanelDraft: h.draft,
  lockCitationPanel: h.lock,
  approveBrandRun: h.brand,
  importManualCapture: h.capture,
}));
import {
  approveBrandRunFn,
  importManualCaptureFn,
  lockCitationPanelFn,
  readCitationProtocolFn,
  readResolvedCapturesFn,
  saveCitationPanelDraftFn,
} from "./citation-protocol.functions";
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const scope = { expectedOwnerId: owner, projectId: "p" };
const answer = {
  promptId: "00000000-0000-4000-8000-000000000101",
  promptRevision: 1,
  surface: "s",
  mode: "search",
  method: "m",
  modelVersion: null,
  capturedAt: "2026-09-08T10:00:00Z",
  status: "complete",
  rawAnswer: "x",
  citations: [],
  citationsComplete: true,
  failure: null,
  reportedCostUsd: null,
  sourceUrl: null,
  supersedesId: null,
};
const call = (fn: unknown, data: unknown) =>
  (fn as (v: unknown) => Promise<unknown>)({ data, context: { userId: owner } });
describe("citation protocol endpoint authentication", () => {
  it("requires auth on every endpoint", () => {
    expect(h.registered).toHaveLength(6);
    for (const registration of h.registered) expect(registration).toEqual([h.auth]);
  });
  it("binds reads to the authenticated owner and refuses an owner switch", async () => {
    await call(readCitationProtocolFn, scope);
    expect(h.read).toHaveBeenLastCalledWith({ ownerId: owner, projectId: "p" });
    await call(readResolvedCapturesFn, scope);
    expect(h.resolved).toHaveBeenLastCalledWith({ ownerId: owner, projectId: "p" });
    await expect(
      call(readCitationProtocolFn, { ...scope, expectedOwnerId: other }),
    ).rejects.toThrow("owner_changed");
    await expect(
      call(importManualCaptureFn, { ...scope, expectedOwnerId: other, answer }),
    ).rejects.toThrow("owner_changed");
    expect(h.capture).not.toHaveBeenCalled();
  });
  it("refuses caller-supplied owners, malformed project IDs and mutation extras", () => {
    for (const data of [
      { ...scope, ownerId: other },
      { ...scope, projectId: "../p" },
    ])
      expect(() => call(readCitationProtocolFn, data)).toThrow();
    expect(() => call(importManualCaptureFn, { ...scope, answer: { verified: true } })).toThrow();
    expect(() =>
      call(saveCitationPanelDraftFn, { ...scope, panelId: owner, expected: -1, panel: {} }),
    ).toThrow();
    expect(() =>
      call(approveBrandRunFn, { ...scope, run: { runId: owner, panelId: owner } }),
    ).toThrow();
    expect(() =>
      call(lockCitationPanelFn, { ...scope, panelId: owner, expectedVersion: 0 }),
    ).toThrow();
  });
});
