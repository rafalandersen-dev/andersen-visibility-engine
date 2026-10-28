/**
 * Seat allowance when the entitlement read is UNCERTAIN.
 *
 * `resolveEntitledPlan` fails closed to `freePreview`, so `freePreview` means
 * "free account OR a failed read". Adding separately-read purchased seats on top
 * of that would turn an entitlement outage into a wider allowance, which is the
 * one direction a fail-closed read must never move in. Both public reads must
 * therefore cap `freePreview` at its own bundle and not consult (or even call)
 * the extras read at all.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLAN_SEATS, type PlanId } from "./billing";

const mocks = vi.hoisted(() => ({ purchased: vi.fn(), rpc: vi.fn() }));
vi.mock("./stripe-lifecycle.server", () => ({ readPurchasedWorkingSeats: mocks.purchased }));

import { readTeamSeatAllowance, readTeamSeats } from "./project-team-seats.server";

const OWNER = "00000000-0000-4000-8000-000000000001";
const plan = (planId: PlanId) => () => Promise.resolve(planId);
/** The seat usage read is irrelevant here; it answers with the owner's own seat. */
const usageRpc = () => Promise.resolve({ data: [{ working: 1, viewer: 0 }], error: null });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.purchased.mockResolvedValue(0);
  mocks.rpc.mockImplementation(usageRpc);
});

describe("purchased seats are added only to a confidently paid plan", () => {
  it("adds purchased working seats to a paid plan's bundle", async () => {
    expect(await readTeamSeatAllowance(OWNER, plan("pro"), () => Promise.resolve(3))).toEqual({
      workingSeats: PLAN_SEATS.pro.workingSeats + 3,
      viewerSeats: PLAN_SEATS.pro.viewerSeats,
    });
    expect(await readTeamSeats(OWNER, mocks.rpc, plan("growth"), () => Promise.resolve(2))).toEqual(
      {
        planId: "growth",
        workingSeats: PLAN_SEATS.growth.workingSeats + 2,
        viewerSeats: PLAN_SEATS.growth.viewerSeats,
        usedWorkingSeats: 1,
        usedViewerSeats: 0,
      },
    );
  });

  it("caps freePreview at its own bundle and never calls the extras read", async () => {
    // This is the fail-closed state: a free account, or an entitlement read that
    // did not succeed. Either way the extras read is not consulted at all.
    const extras = vi.fn(() => Promise.resolve(9));
    expect(await readTeamSeatAllowance(OWNER, plan("freePreview"), extras)).toEqual({
      workingSeats: PLAN_SEATS.freePreview.workingSeats,
      viewerSeats: PLAN_SEATS.freePreview.viewerSeats,
    });
    expect(await readTeamSeats(OWNER, mocks.rpc, plan("freePreview"), extras)).toMatchObject({
      planId: "freePreview",
      workingSeats: PLAN_SEATS.freePreview.workingSeats,
      viewerSeats: PLAN_SEATS.freePreview.viewerSeats,
    });
    expect(extras).not.toHaveBeenCalled();
  });

  it("does not reach the Stripe projection read for freePreview by default", async () => {
    mocks.purchased.mockResolvedValue(7);
    expect(await readTeamSeatAllowance(OWNER, plan("freePreview"))).toEqual({
      workingSeats: 1,
      viewerSeats: 1,
    });
    expect(await readTeamSeats(OWNER, mocks.rpc, plan("freePreview"))).toMatchObject({
      workingSeats: 1,
    });
    expect(mocks.purchased).not.toHaveBeenCalled();
    // A paid plan does use the default read, so the wiring is real.
    expect(await readTeamSeatAllowance(OWNER, plan("starter"))).toEqual({
      workingSeats: PLAN_SEATS.starter.workingSeats + 7,
      viewerSeats: PLAN_SEATS.starter.viewerSeats,
    });
    expect(mocks.purchased).toHaveBeenCalledWith(OWNER);
  });

  it.each([
    ["zero", 0],
    ["a negative count", -3],
    ["a fractional count", 2.5],
    ["an out-of-range count", 1001],
    ["an infinite count", Number.POSITIVE_INFINITY],
    ["not a number", "4" as unknown as number],
    ["nothing", undefined as unknown as number],
    ["NaN", Number.NaN],
  ])("ignores %s from the extras read, even an injected one", async (_label, value) => {
    const extras = () => Promise.resolve(value);
    expect(await readTeamSeatAllowance(OWNER, plan("pro"), extras)).toEqual({
      workingSeats: PLAN_SEATS.pro.workingSeats,
      viewerSeats: PLAN_SEATS.pro.viewerSeats,
    });
    expect(await readTeamSeats(OWNER, mocks.rpc, plan("pro"), extras)).toMatchObject({
      workingSeats: PLAN_SEATS.pro.workingSeats,
    });
  });

  it("accepts the documented maximum but nothing above it", async () => {
    expect(
      (await readTeamSeatAllowance(OWNER, plan("agency"), () => Promise.resolve(1000)))
        .workingSeats,
    ).toBe(PLAN_SEATS.agency.workingSeats + 1000);
    expect(
      (await readTeamSeatAllowance(OWNER, plan("agency"), () => Promise.resolve(1001)))
        .workingSeats,
    ).toBe(PLAN_SEATS.agency.workingSeats);
  });

  it("keeps the owner-approved seat bundles unchanged", async () => {
    // No pricing or bundle change belongs to this packet.
    expect(PLAN_SEATS).toMatchObject({
      freePreview: { workingSeats: 1, viewerSeats: 1, extraWorkingSeatEur: null },
      starter: { workingSeats: 2, viewerSeats: 2, extraWorkingSeatEur: 15 },
      growth: { workingSeats: 3, viewerSeats: 5, extraWorkingSeatEur: 15 },
      pro: { workingSeats: 5, viewerSeats: 10, extraWorkingSeatEur: 12 },
      agency: { workingSeats: 10, viewerSeats: 50, extraWorkingSeatEur: 10 },
    });
  });
});
