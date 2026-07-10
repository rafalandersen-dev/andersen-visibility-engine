/**
 * Phase 1B.2 — server-side pending action operations over an in-memory
 * workspace row. workspace.server is mocked at the module boundary (same
 * pattern as mcp.server.test.ts): mutations apply to the fake row and bump
 * rev exactly like the DB trigger; reads never mutate. No MCP, no OAuth.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PendingAction } from "./types";

const h = vi.hoisted(() => ({
  row: null as { data: Record<string, unknown>; rev: number } | null,
  updates: 0,
}));

vi.mock("./workspace.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./workspace.server")>();
  return {
    ...actual,
    readWorkspaceRow: async () => (h.row ? { data: h.row.data, rev: h.row.rev } : null),
    // The real mutateWorkspace closes over module-internal deps, so mock the
    // whole operation: apply the pure mutation, bump rev (trigger semantics).
    mutateWorkspace: async (_userId: string, mutate: (data: Record<string, unknown>) => { data: Record<string, unknown>; result: unknown }) => {
      if (!h.row) throw new actual.WorkspaceNotFoundError();
      const next = mutate(structuredClone(h.row.data));
      h.row = { data: next.data, rev: h.row.rev + 1 };
      h.updates += 1;
      return { result: next.result, rev: h.row.rev };
    },
  };
});

import {
  createPendingActionForWorkspace,
  listPendingActionsForWorkspace,
  getPendingActionForWorkspace,
  buildPendingActionCreatedAudit,
  PendingActionNotFoundError,
} from "./pending-actions.server";
import { PendingActionCapError, PendingActionValidationError, PENDING_ACTIONS_CAP, PENDING_ACTION_TTL_MS } from "./pending-actions";
import { WorkspaceNotFoundError } from "./workspace.server";

const T0 = "2026-07-10T12:00:00.000Z";
const USER = "owner1";

const baseWorkspace = () => ({
  projects: [{ id: "synergy", businessName: "Synergy Massage" }],
  opportunities: [{ id: "o1", projectId: "synergy", title: "Original title", businessValue: "Original value" }],
  pendingActions: [] as PendingAction[],
});

const validInput = () => ({
  type: "opportunity_update_proposal" as const,
  projectId: "synergy",
  title: "Sharpen the comparison opportunity",
  summary: "Claude suggests a clearer title for one opportunity.",
  payload: { opportunityId: "o1", updates: { title: "Massage vs physio", priority: "High" } },
  preview: "- title → Massage vs physio\n- priority → High",
  requestId: "propose-req-1",
  proposedByClientId: "milo_client_test",
});

beforeEach(() => {
  h.row = { data: baseWorkspace(), rev: 11 };
  h.updates = 0;
});

describe("createPendingActionForWorkspace", () => {
  it("creates, persists via the rev-guarded write, and bumps rev", async () => {
    const out = await createPendingActionForWorkspace(USER, validInput(), { id: "pa1", nowIso: T0 });
    expect(out.deduped).toBe(false);
    expect(out.action.id).toBe("pa1");
    expect(out.action.status).toBe("pending");
    expect(out.action.riskLevel).toBe("medium");
    expect(out.action.proposedByClientId).toBe("milo_client_test");
    expect(out.rev).toBe(12);
    const stored = h.row!.data.pendingActions as PendingAction[];
    expect(stored).toHaveLength(1);
    expect(stored[0].requestId).toBe("propose-req-1");
  });

  it("requestId replay dedupes: same id, deduped:true, no duplicate row (rev still bumps — 1A semantics)", async () => {
    const first = await createPendingActionForWorkspace(USER, validInput(), { id: "pa1", nowIso: T0 });
    const replay = await createPendingActionForWorkspace(USER, validInput(), { id: "pa2", nowIso: T0 });
    expect(replay.deduped).toBe(true);
    expect(replay.action.id).toBe(first.action.id);
    expect(h.row!.data.pendingActions as PendingAction[]).toHaveLength(1);
    expect(replay.rev).toBe(13);
  });

  it("unknown project and unknown opportunity fail uniformly and persist nothing", async () => {
    await expect(
      createPendingActionForWorkspace(USER, { ...validInput(), projectId: "ghost" }, { id: "x", nowIso: T0 }),
    ).rejects.toBeInstanceOf(PendingActionNotFoundError);
    await expect(
      createPendingActionForWorkspace(
        USER,
        { ...validInput(), payload: { opportunityId: "ghost", updates: { title: "t" } } },
        { id: "x", nowIso: T0 },
      ),
    ).rejects.toBeInstanceOf(PendingActionNotFoundError);
    expect(h.row!.data.pendingActions as PendingAction[]).toHaveLength(0);
    expect(h.updates).toBe(0);
  });

  it("invalid payloads and oversized previews reject without persisting", async () => {
    await expect(
      createPendingActionForWorkspace(USER, { ...validInput(), payload: { opportunityId: "o1", updates: { publish: true } } } as never, { id: "x", nowIso: T0 }),
    ).rejects.toBeInstanceOf(PendingActionValidationError);
    await expect(
      createPendingActionForWorkspace(USER, { ...validInput(), preview: "p".repeat(5000) }, { id: "x", nowIso: T0 }),
    ).rejects.toBeInstanceOf(PendingActionValidationError);
    expect(h.updates).toBe(0);
  });

  it("enforces the 200 cap through the server path", async () => {
    const stub = (i: number): PendingAction => ({
      id: `s${i}`, type: "opportunity_update_proposal", projectId: "synergy", title: "t", summary: "s",
      status: "pending", source: "claude", createdAt: T0, updatedAt: T0,
      expiresAt: new Date(Date.parse(T0) + PENDING_ACTION_TTL_MS).toISOString(),
      requiredScope: "milo.actions.propose", payload: { opportunityId: "o1", updates: { title: "x" } }, preview: "p", riskLevel: "medium",
    });
    h.row!.data.pendingActions = Array.from({ length: PENDING_ACTIONS_CAP }, (_, i) => stub(i));
    await expect(
      createPendingActionForWorkspace(USER, { ...validInput(), requestId: "fresh" }, { id: "x", nowIso: T0 }),
    ).rejects.toBeInstanceOf(PendingActionCapError);
  });

  it("the lazy expiry sweep rides the create mutation", async () => {
    const first = await createPendingActionForWorkspace(USER, validInput(), { id: "pa1", nowIso: T0 });
    expect(first.expiredIds).toEqual([]);
    const later = new Date(Date.parse(T0) + PENDING_ACTION_TTL_MS + 1000).toISOString();
    const second = await createPendingActionForWorkspace(USER, { ...validInput(), requestId: "propose-req-2" }, { id: "pa2", nowIso: later });
    expect(second.expiredIds).toEqual(["pa1"]);
    const stored = h.row!.data.pendingActions as PendingAction[];
    expect(stored.find((a) => a.id === "pa1")?.status).toBe("expired");
    expect(stored.find((a) => a.id === "pa2")?.status).toBe("pending");
  });
});

describe("listPendingActionsForWorkspace", () => {
  beforeEach(async () => {
    await createPendingActionForWorkspace(USER, validInput(), { id: "pa1", nowIso: T0 });
    await createPendingActionForWorkspace(
      USER,
      { ...validInput(), requestId: "propose-req-2", summary: "Second proposal." },
      { id: "pa2", nowIso: "2026-07-11T12:00:00.000Z" },
    );
  });

  it("returns bounded summaries, newest first, without payload/preview bodies", async () => {
    const list = await listPendingActionsForWorkspace(USER, undefined, { nowMs: Date.parse(T0) });
    expect(list.map((s) => s.id)).toEqual(["pa2", "pa1"]);
    for (const item of list) {
      expect(item).not.toHaveProperty("payload");
      expect(item).not.toHaveProperty("preview");
      expect(item.status).toBe("pending");
      expect(item.riskLevel).toBe("medium");
    }
  });

  it("filters by projectId, status and type", async () => {
    expect(await listPendingActionsForWorkspace(USER, { projectId: "synergy" }, { nowMs: Date.parse(T0) })).toHaveLength(2);
    expect(await listPendingActionsForWorkspace(USER, { projectId: "other" }, { nowMs: Date.parse(T0) })).toHaveLength(0);
    expect(await listPendingActionsForWorkspace(USER, { status: "pending" }, { nowMs: Date.parse(T0) })).toHaveLength(2);
    expect(await listPendingActionsForWorkspace(USER, { status: "applied" }, { nowMs: Date.parse(T0) })).toHaveLength(0);
    expect(await listPendingActionsForWorkspace(USER, { type: "opportunity_update_proposal" }, { nowMs: Date.parse(T0) })).toHaveLength(2);
  });

  it("reports lazily-expired items as expired WITHOUT persisting (reads stay pure)", async () => {
    const staleMs = Date.parse(T0) + PENDING_ACTION_TTL_MS + 1000;
    const expired = await listPendingActionsForWorkspace(USER, { status: "expired" }, { nowMs: staleMs });
    expect(expired.map((s) => s.id)).toEqual(["pa1"]); // pa2 was created a day later — still live
    const updatesBefore = h.updates;
    await listPendingActionsForWorkspace(USER, undefined, { nowMs: staleMs });
    expect(h.updates).toBe(updatesBefore); // no write happened
    expect((h.row!.data.pendingActions as PendingAction[]).find((a) => a.id === "pa1")?.status).toBe("pending");
  });

  it("missing workspace → WorkspaceNotFoundError", async () => {
    h.row = null;
    await expect(listPendingActionsForWorkspace(USER)).rejects.toBeInstanceOf(WorkspaceNotFoundError);
  });
});

describe("getPendingActionForWorkspace", () => {
  it("returns the full action by id, with effective expiry status", async () => {
    await createPendingActionForWorkspace(USER, validInput(), { id: "pa1", nowIso: T0 });
    const fresh = await getPendingActionForWorkspace(USER, "pa1", { nowMs: Date.parse(T0) });
    expect(fresh.payload).toEqual(validInput().payload);
    expect(fresh.preview).toContain("Massage vs physio");
    expect(fresh.status).toBe("pending");
    const stale = await getPendingActionForWorkspace(USER, "pa1", { nowMs: Date.parse(T0) + PENDING_ACTION_TTL_MS + 1000 });
    expect(stale.status).toBe("expired");
  });

  it("unknown id → uniform not-found", async () => {
    await expect(getPendingActionForWorkspace(USER, "ghost")).rejects.toBeInstanceOf(PendingActionNotFoundError);
  });
});

describe("buildPendingActionCreatedAudit", () => {
  it("carries safe fields only — exact key set, sorted field names, ok flag", async () => {
    const { action } = await createPendingActionForWorkspace(USER, validInput(), { id: "pa1", nowIso: T0 });
    const audit = buildPendingActionCreatedAudit(action, { ok: true });
    expect(audit.event).toBe("pending_action_created");
    expect(Object.keys(audit.detail).sort()).toEqual(
      ["actionId", "fieldsChanged", "ok", "projectId", "requestId", "requiredScope", "riskLevel", "status", "type"].sort(),
    );
    expect(audit.detail.fieldsChanged).toEqual(["priority", "title"]);
    expect(audit.detail.actionId).toBe("pa1");
    expect(audit.detail.requiredScope).toBe("milo.actions.propose");
  });

  it("replay and failure variants add deduped/error; content never leaks", async () => {
    const { action } = await createPendingActionForWorkspace(USER, validInput(), { id: "pa1", nowIso: T0 });
    const deduped = buildPendingActionCreatedAudit(action, { ok: true, deduped: true });
    expect(deduped.detail.deduped).toBe(true);
    const failed = buildPendingActionCreatedAudit(action, { ok: false, error: "not_found" });
    expect(failed.detail.ok).toBe(false);
    expect(failed.detail.error).toBe("not_found");

    for (const audit of [deduped, failed]) {
      const s = JSON.stringify(audit.detail);
      // Planted strings from the input must be absent.
      expect(s).not.toContain("Sharpen the comparison opportunity");
      expect(s).not.toContain("Claude suggests a clearer title");
      expect(s).not.toContain("Massage vs physio");
      // No token/secret material shape either.
      expect(s).not.toMatch(/milo_at_|milo_rt_|hash|secret|family/i);
    }
  });
});
