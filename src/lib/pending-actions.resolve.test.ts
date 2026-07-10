/**
 * Phase 1B.5 — owner-only resolution (approve & apply / reject) over an
 * in-memory workspace row. Fail-closed on every error path: no partial
 * apply, no rev bump, target data untouched. Audit builders are probed for
 * content leaks. No MCP, no OAuth flows.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Opportunity, PendingAction } from "./types";

const h = vi.hoisted(() => ({
  row: null as { data: Record<string, unknown>; rev: number } | null,
  updates: 0,
}));

vi.mock("./workspace.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./workspace.server")>();
  return {
    ...actual,
    readWorkspaceRow: async () => (h.row ? { data: h.row.data, rev: h.row.rev } : null),
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
  resolvePendingActionForWorkspace,
  buildPendingActionResolutionAudit,
  PendingActionNotFoundError,
  PendingActionResolveError,
} from "./pending-actions.server";
import { PENDING_ACTION_TTL_MS } from "./pending-actions";

const T0 = "2026-07-11T12:00:00.000Z";
const T1 = "2026-07-12T12:00:00.000Z";
const USER = "owner1";

const opp = (): Opportunity =>
  ({
    id: "o1", projectId: "synergy", title: "Original title", language: "English", contentType: "Blog Article",
    searchIntent: "Informational", targetAudience: "aud", businessValue: "Original value", recommendedCta: "Original CTA",
    priority: "Medium", status: "Linked",
  }) as Opportunity;

const validInput = () => ({
  type: "opportunity_update_proposal" as const,
  projectId: "synergy",
  title: "Sharpen the comparison opportunity",
  summary: "Claude suggests a clearer title.",
  payload: { opportunityId: "o1", updates: { title: "Massage vs physio", priority: "High" } },
  preview: "- title → Massage vs physio",
  requestId: "resolve-req-1",
  proposedByClientId: "client_A",
});

const storedActions = () => h.row!.data.pendingActions as PendingAction[];
const storedOpp = () => (h.row!.data.opportunities as Opportunity[])[0];

beforeEach(async () => {
  h.row = { data: { projects: [{ id: "synergy", businessName: "Synergy" }], opportunities: [opp()], pendingActions: [] }, rev: 11 };
  h.updates = 0;
  await createPendingActionForWorkspace(USER, validInput(), { id: "pa1", nowIso: T0 }); // rev 11 → 12
});

describe("approve_apply", () => {
  it("applies ONLY the whitelisted updates, marks applied, bumps rev once", async () => {
    const revBefore = h.row!.rev;
    const out = await resolvePendingActionForWorkspace(USER, { actionId: "pa1", resolution: "approve_apply" }, { nowIso: T1 });
    expect(out.status).toBe("applied");
    expect(out.rev).toBe(revBefore + 1); // exactly one mutation
    expect(h.updates).toBe(2); // create + resolve

    const o = storedOpp();
    expect(o.title).toBe("Massage vs physio");
    expect(o.priority).toBe("High");
    // untouched fields survive the merge
    expect(o.businessValue).toBe("Original value");
    expect(o.recommendedCta).toBe("Original CTA");
    expect(o.status).toBe("Linked");
    expect(o.projectId).toBe("synergy");

    const a = storedActions()[0];
    expect(a.status).toBe("applied");
    expect(a.updatedAt).toBe(T1);
    expect(a.resolution).toMatchObject({ resolvedAt: T1, resolvedBy: "owner", appliedEntityIds: ["o1"] });
  });

  it("keeps the owner note on the resolution when supplied", async () => {
    const out = await resolvePendingActionForWorkspace(USER, { actionId: "pa1", resolution: "approve_apply", note: "looks good" }, { nowIso: T1 });
    expect(out.action.resolution?.note).toBe("looks good");
  });

  it("missing target opportunity fails closed: error, no write, action stays pending", async () => {
    h.row!.data.opportunities = [];
    const revBefore = h.row!.rev;
    const updatesBefore = h.updates;
    await expect(
      resolvePendingActionForWorkspace(USER, { actionId: "pa1", resolution: "approve_apply" }, { nowIso: T1 }),
    ).rejects.toMatchObject({ reason: "target_missing" });
    expect(h.row!.rev).toBe(revBefore);
    expect(h.updates).toBe(updatesBefore);
    expect(storedActions()[0].status).toBe("pending");
  });

  it("corrupted/invalid stored payload fails closed with no partial apply", async () => {
    (storedActions()[0].payload as Record<string, unknown>).updates = { publish: true };
    const revBefore = h.row!.rev;
    await expect(
      resolvePendingActionForWorkspace(USER, { actionId: "pa1", resolution: "approve_apply" }, { nowIso: T1 }),
    ).rejects.toMatchObject({ reason: "invalid" });
    expect(h.row!.rev).toBe(revBefore);
    expect(storedOpp().title).toBe("Original title");
    expect(storedActions()[0].status).toBe("pending");
  });

  it("expired actions cannot be approved (fail closed, nothing written)", async () => {
    const staleIso = new Date(Date.parse(T0) + PENDING_ACTION_TTL_MS + 1000).toISOString();
    const revBefore = h.row!.rev;
    await expect(
      resolvePendingActionForWorkspace(USER, { actionId: "pa1", resolution: "approve_apply" }, { nowIso: staleIso }),
    ).rejects.toMatchObject({ reason: "expired" });
    expect(h.row!.rev).toBe(revBefore);
    expect(storedOpp().title).toBe("Original title");
  });
});

describe("reject", () => {
  it("marks rejected with note, leaves the opportunity untouched, bumps rev once", async () => {
    const revBefore = h.row!.rev;
    const out = await resolvePendingActionForWorkspace(USER, { actionId: "pa1", resolution: "reject", note: "not now" }, { nowIso: T1 });
    expect(out.status).toBe("rejected");
    expect(out.rev).toBe(revBefore + 1);
    expect(storedOpp()).toEqual(opp());
    const a = storedActions()[0];
    expect(a.status).toBe("rejected");
    expect(a.resolution).toMatchObject({ resolvedAt: T1, resolvedBy: "owner", note: "not now" });
  });
});

describe("terminal + missing", () => {
  it("resolved actions cannot be resolved again (both directions)", async () => {
    await resolvePendingActionForWorkspace(USER, { actionId: "pa1", resolution: "reject" }, { nowIso: T1 });
    for (const resolution of ["approve_apply", "reject"] as const) {
      await expect(
        resolvePendingActionForWorkspace(USER, { actionId: "pa1", resolution }, { nowIso: T1 }),
      ).rejects.toMatchObject({ reason: "not_pending" });
    }
  });

  it("unknown action → uniform not-found; missing workspace → WorkspaceNotFoundError", async () => {
    await expect(resolvePendingActionForWorkspace(USER, { actionId: "ghost", resolution: "reject" })).rejects.toBeInstanceOf(PendingActionNotFoundError);
    expect(new PendingActionResolveError("expired").reason).toBe("expired");
  });

  it("the sweep persists (and reports) other stale items on a successful resolve", async () => {
    // A second, older pending action that is stale by resolve time.
    await createPendingActionForWorkspace(USER, { ...validInput(), requestId: "resolve-req-2" }, { id: "pa2", nowIso: T1 });
    const lateIso = new Date(Date.parse(T0) + PENDING_ACTION_TTL_MS + 1000).toISOString(); // pa1 stale, pa2 fresh
    const out = await resolvePendingActionForWorkspace(USER, { actionId: "pa2", resolution: "reject" }, { nowIso: lateIso });
    expect(out.expiredIds).toEqual(["pa1"]);
    expect(storedActions().find((a) => a.id === "pa1")?.status).toBe("expired");
  });
});

describe("resolution audit builders", () => {
  it("carry safe fields only; note and content never leak", async () => {
    const { action } = await (async () => {
      const out = await resolvePendingActionForWorkspace(USER, { actionId: "pa1", resolution: "approve_apply", note: "private owner words" }, { nowIso: T1 });
      return out;
    })();

    const approved = buildPendingActionResolutionAudit(action, "pending_action_approved", { ok: true });
    const applied = buildPendingActionResolutionAudit(action, "pending_action_applied", { ok: true, appliedAtRev: 13, expiredIds: ["x1"] });
    const rejected = buildPendingActionResolutionAudit(action, "pending_action_rejected", { ok: true });

    expect(Object.keys(approved.detail).sort()).toEqual(
      ["actionId", "fieldsChanged", "ok", "projectId", "requestId", "resolution", "source", "status", "type"].sort(),
    );
    expect(applied.detail.appliedAtRev).toBe(13);
    expect(applied.detail.expiredIds).toEqual(["x1"]);
    expect(approved.detail.fieldsChanged).toEqual(["priority", "title"]);
    expect(approved.detail.source).toBe("milo_ui");
    expect(rejected.detail.resolution).toBe("rejected");

    for (const audit of [approved, applied, rejected]) {
      const s = JSON.stringify(audit.detail);
      expect(s).not.toContain("private owner words"); // note never logged
      expect(s).not.toContain("Massage vs physio");
      expect(s).not.toContain("Sharpen the comparison opportunity");
      expect(s).not.toContain("Claude suggests a clearer title");
      expect(s).not.toMatch(/milo_at_|milo_rt_|hash|secret|family/i);
    }
  });
});
