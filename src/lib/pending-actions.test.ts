/**
 * Phase 1B.1 — pending actions data model + pure lifecycle helpers.
 * Everything here is pure: fixed clocks and ids, no mocks, no DB, no MCP.
 */
import { describe, it, expect } from "vitest";
import type { PendingAction } from "./types";
import {
  MILO_ACTIONS_PROPOSE_SCOPE,
  PENDING_ACTIONS_CAP,
  MAX_PENDING_ACTION_PAYLOAD_BYTES,
  PENDING_ACTION_TTL_MS,
  PendingActionValidationError,
  PendingActionCapError,
  PendingActionTransitionError,
  createPendingAction,
  validatePendingActionPayload,
  derivePendingActionRisk,
  approvePendingAction,
  rejectPendingAction,
  markPendingActionApplied,
  canTransitionPendingAction,
  isPendingActionExpired,
  expireStalePendingActions,
  findPendingActionByRequestId,
} from "./pending-actions";

const T0 = "2026-07-10T12:00:00.000Z";
const T1 = "2026-07-11T12:00:00.000Z";
const DAY_MS = 24 * 60 * 60 * 1000;

const validInput = () => ({
  type: "opportunity_update_proposal" as const,
  projectId: "synergy",
  title: "Sharpen the comparison page opportunity",
  summary: "Claude suggests a clearer title and stronger CTA for one opportunity.",
  payload: {
    opportunityId: "opp1",
    updates: {
      title: "Massage vs physio — which do you need?",
      businessValue: "Clearer intent match should lift bookings.",
      priority: "High",
      contentType: "Comparison",
      recommendedCta: "Book a consultation",
    },
  },
  preview: "**Update opportunity opp1**\n- title → …\n- priority → High",
  requestId: "req-1",
});

const create = (existing: PendingAction[] = [], input: Record<string, unknown> = validInput(), id = "pa1", nowIso = T0) =>
  createPendingAction(existing, input as never, { id, nowIso });

describe("createPendingAction", () => {
  it("creates a pending opportunity_update_proposal with all allowed fields", () => {
    const { actions, action, deduped } = create();
    expect(deduped).toBe(false);
    expect(actions).toHaveLength(1);
    expect(action.id).toBe("pa1");
    expect(action.status).toBe("pending");
    expect(action.source).toBe("claude");
    expect(action.requiredScope).toBe(MILO_ACTIONS_PROPOSE_SCOPE);
    expect(action.createdAt).toBe(T0);
    expect(action.updatedAt).toBe(T0);
    expect(action.expiresAt).toBe(new Date(Date.parse(T0) + PENDING_ACTION_TTL_MS).toISOString());
    expect(action.payload).toEqual(validInput().payload);
  });

  it("derives riskLevel server-side (medium for opportunity updates)", () => {
    expect(derivePendingActionRisk("opportunity_update_proposal")).toBe("medium");
    expect(create().action.riskLevel).toBe("medium");
  });

  it("rejects caller-supplied riskLevel/status/source as unknown fields", () => {
    for (const extra of [{ riskLevel: "low" }, { status: "approved" }, { source: "user" }]) {
      expect(() => create([], { ...validInput(), ...extra })).toThrow(PendingActionValidationError);
    }
  });

  it("dedupes on requestId: same action back, deduped:true, no new row", () => {
    const first = create();
    const replay = create(first.actions, validInput(), "pa2", T1);
    expect(replay.deduped).toBe(true);
    expect(replay.action.id).toBe("pa1");
    expect(replay.actions).toHaveLength(1);
  });

  it("enforces the pendingActions cap", () => {
    const full = Array.from({ length: PENDING_ACTIONS_CAP }, (_, i) => create([], { ...validInput(), requestId: undefined }, `pa${i}`).action);
    expect(() => create(full, { ...validInput(), requestId: "fresh" })).toThrow(PendingActionCapError);
  });

  it("dedupe wins over the cap (replay of an existing id never throws)", () => {
    const first = create();
    const full = [...first.actions, ...Array.from({ length: PENDING_ACTIONS_CAP }, (_, i) => create([], { ...validInput(), requestId: undefined }, `x${i}`).action)];
    expect(create(full).deduped).toBe(true);
  });

  it("rejects missing/oversized top-level fields", () => {
    expect(() => create([], { ...validInput(), title: "" })).toThrow(PendingActionValidationError);
    expect(() => create([], { ...validInput(), summary: "s".repeat(501) })).toThrow(PendingActionValidationError);
    expect(() => create([], { ...validInput(), preview: "p".repeat(5000) })).toThrow(/preview/);
    expect(() => create([], { ...validInput(), type: "growth_plan_proposal" })).toThrow(/type/);
  });
});

describe("validatePendingActionPayload — opportunity_update_proposal", () => {
  const valid = () => validInput().payload;

  it("accepts a whitelisted subset", () => {
    const out = validatePendingActionPayload("opportunity_update_proposal", { opportunityId: "o1", updates: { priority: "Low" } });
    expect(out).toEqual({ opportunityId: "o1", updates: { priority: "Low" } });
  });

  it("rejects unknown payload keys", () => {
    expect(() => validatePendingActionPayload("opportunity_update_proposal", { ...valid(), mode: "force" })).toThrow(/unknown field/);
  });

  it("rejects publish/delete/settings/billing-shaped updates as unknown fields", () => {
    for (const bad of [{ publish: true }, { delete: true }, { status: "Published" }, { settings: {} }, { billing: "pro" }, { publishEndpoint: "https://x" }]) {
      expect(() =>
        validatePendingActionPayload("opportunity_update_proposal", { opportunityId: "o1", updates: { ...bad } }),
      ).toThrow(/unknown field/);
    }
  });

  it("rejects empty updates and missing opportunityId", () => {
    expect(() => validatePendingActionPayload("opportunity_update_proposal", { opportunityId: "o1", updates: {} })).toThrow(/at least one field/);
    expect(() => validatePendingActionPayload("opportunity_update_proposal", { updates: { title: "t" } })).toThrow(/opportunityId/);
  });

  it("rejects bad enum values and non-string fields", () => {
    expect(() => validatePendingActionPayload("opportunity_update_proposal", { opportunityId: "o1", updates: { priority: "Urgent" } })).toThrow(/priority/);
    expect(() => validatePendingActionPayload("opportunity_update_proposal", { opportunityId: "o1", updates: { contentType: "Podcast" } })).toThrow(/contentType/);
    expect(() => validatePendingActionPayload("opportunity_update_proposal", { opportunityId: "o1", updates: { title: 42 } })).toThrow(/string/);
  });

  it("rejects oversized payloads by serialized bytes (before field checks)", () => {
    const huge = { opportunityId: "o1", updates: { title: "a".repeat(MAX_PENDING_ACTION_PAYLOAD_BYTES + 10) } };
    expect(() => validatePendingActionPayload("opportunity_update_proposal", huge)).toThrow(/bytes/);
  });

  it("rejects non-object payloads", () => {
    for (const bad of [null, "x", 7, ["a"]]) {
      expect(() => validatePendingActionPayload("opportunity_update_proposal", bad)).toThrow(/object/);
    }
  });
});

describe("lifecycle transitions", () => {
  const pending = () => create().action;

  it("pending → approved → applied, with resolution metadata", () => {
    const approved = approvePendingAction(pending(), T1);
    expect(approved.status).toBe("approved");
    expect(approved.updatedAt).toBe(T1);
    expect(approved.resolution).toEqual({ resolvedAt: T1, resolvedBy: "owner" });

    const applied = markPendingActionApplied(approved, T1, { appliedEntityIds: ["opp1"], appliedAtRev: 18 });
    expect(applied.status).toBe("applied");
    expect(applied.resolution?.appliedEntityIds).toEqual(["opp1"]);
    expect(applied.resolution?.appliedAtRev).toBe(18);
  });

  it("pending → rejected keeps note; approved → rejected keeps machine error (apply failure)", () => {
    const rejected = rejectPendingAction(pending(), T1, { note: "not now" });
    expect(rejected.status).toBe("rejected");
    expect(rejected.resolution?.note).toBe("not now");

    const failed = rejectPendingAction(approvePendingAction(pending(), T1), T1, { error: "apply_validation" });
    expect(failed.status).toBe("rejected");
    expect(failed.resolution?.error).toBe("apply_validation");
  });

  it("terminal states fail closed", () => {
    const applied = markPendingActionApplied(approvePendingAction(pending(), T1), T1, { appliedEntityIds: [], appliedAtRev: 1 });
    expect(() => approvePendingAction(applied, T1)).toThrow(PendingActionTransitionError);
    expect(() => rejectPendingAction(applied, T1)).toThrow(PendingActionTransitionError);
    const rejected = rejectPendingAction(pending(), T1);
    expect(() => approvePendingAction(rejected, T1)).toThrow(PendingActionTransitionError);
    expect(() => markPendingActionApplied(pending(), T1, { appliedEntityIds: [], appliedAtRev: 1 })).toThrow(PendingActionTransitionError);
  });

  it("canTransitionPendingAction matches the table", () => {
    expect(canTransitionPendingAction("pending", "approved")).toBe(true);
    expect(canTransitionPendingAction("pending", "applied")).toBe(false);
    expect(canTransitionPendingAction("approved", "applied")).toBe(true);
    expect(canTransitionPendingAction("approved", "expired")).toBe(false);
    expect(canTransitionPendingAction("expired", "approved")).toBe(false);
  });
});

describe("lazy 14-day expiry", () => {
  it("is not expired inside the horizon, expired past it", () => {
    const a = create().action;
    expect(isPendingActionExpired(a, Date.parse(T0) + 13 * DAY_MS)).toBe(false);
    expect(isPendingActionExpired(a, Date.parse(T0) + 15 * DAY_MS)).toBe(true);
  });

  it("expireStalePendingActions flips only stale pending items and reports ids", () => {
    const stale = create().action;
    const fresh = create([], { ...validInput(), requestId: "req-2" }, "pa2", T1).action;
    const resolved = rejectPendingAction(create([], { ...validInput(), requestId: "req-3" }, "pa3").action, T0);
    const nowIso = new Date(Date.parse(T0) + 15 * DAY_MS).toISOString();

    const { actions, expiredIds } = expireStalePendingActions([stale, fresh, resolved], nowIso);
    expect(expiredIds).toEqual(["pa1"]);
    expect(actions[0].status).toBe("expired");
    expect(actions[1].status).toBe("pending"); // created a day later — still inside 14d
    expect(actions[2].status).toBe("rejected"); // resolved items never expire
    expect(() => approvePendingAction(actions[0] as PendingAction, nowIso)).toThrow(PendingActionTransitionError);
  });

  it("returns the same array identity when nothing is stale (no save needed)", () => {
    const arr = [create().action];
    const out = expireStalePendingActions(arr, T1);
    expect(out.actions).toBe(arr);
    expect(out.expiredIds).toEqual([]);
  });
});

describe("findPendingActionByRequestId", () => {
  it("finds by requestId and misses cleanly", () => {
    const { actions } = create();
    expect(findPendingActionByRequestId(actions, "req-1")?.id).toBe("pa1");
    expect(findPendingActionByRequestId(actions, "nope")).toBeUndefined();
  });
});
