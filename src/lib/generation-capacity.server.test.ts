import { beforeEach, describe, expect, it } from "vitest";
import { readGenerationCapacity, type CapacityReader } from "./generation-capacity.server";
import { capFor } from "./ai-usage.server";
const user = "owner",
  now = new Date("2026-09-07T10:00:00Z");
let responses: Record<string, { data: unknown; error: unknown }>;
let filters: Array<[string, string, unknown]>;
let limits: number[];
const db = {
  from(table: string) {
    const q = {
      select: () => q,
      eq: (column: string, value: unknown) => {
        filters.push([table, column, value]);
        return q;
      },
      limit: (n: number) => {
        limits.push(n);
        return q;
      },
      then: (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve(responses[table]).then(resolve, reject),
    };
    return q;
  },
} as unknown as CapacityReader;
beforeEach(() => {
  filters = [];
  limits = [];
  responses = {
    entitlements: {
      data: [{ plan_id: "pro", status: "active", current_period_end: "2026-10-01T00:00:00Z" }],
      error: null,
    },
    user_roles: { data: [], error: null },
    ai_usage: { data: [{ used: 2 }], error: null },
  };
});
describe("strict server generation-capacity snapshot", () => {
  it("reads the verified account, current UTC period and content bucket with bounded queries", async () => {
    expect(await readGenerationCapacity(user, now, db)).toEqual({
      status: "verified",
      usagePeriod: "2026-09",
      remaining: capFor("pro", "contentGeneration") - 2,
    });
    for (const table of Object.keys(responses))
      expect(filters).toContainEqual([table, "user_id", user]);
    expect(filters).toContainEqual(["ai_usage", "period", "2026-09"]);
    expect(filters).toContainEqual(["ai_usage", "bucket", "contentGeneration"]);
    expect(limits).toEqual([2, 2, 2]);
  });
  it("applies the existing owner ceiling only after a verified owner-role read", async () => {
    responses.user_roles.data = [{ role: "owner" }];
    expect(await readGenerationCapacity(user, now, db)).toMatchObject({
      remaining: capFor("pro", "contentGeneration", true) - 2,
    });
  });
  it("treats absent entitlement and usage rows as the known free tier and no usage", async () => {
    responses.entitlements.data = [];
    responses.ai_usage.data = [];
    expect(await readGenerationCapacity(user, now, db)).toMatchObject({
      status: "verified",
      remaining: capFor("freePreview", "contentGeneration"),
    });
  });
  it("uses the effective free tier for an expired paid period", async () => {
    responses.entitlements.data = [
      { plan_id: "pro", status: "active", current_period_end: "2026-09-01T00:00:00Z" },
    ];
    responses.ai_usage.data = [];
    expect(await readGenerationCapacity(user, now, db)).toMatchObject({
      remaining: capFor("freePreview", "contentGeneration"),
    });
  });
  it.each(["entitlements", "user_roles", "ai_usage"])(
    "reports %s read errors as unavailable",
    async (table) => {
      responses[table] = { data: null, error: { message: "private" } };
      expect(await readGenerationCapacity(user, now, db)).toEqual({
        status: "unavailable",
        usagePeriod: "2026-09",
      });
    },
  );
  it.each([
    ["ai_usage", [{ used: -1 }]],
    ["ai_usage", [{ used: "2" }]],
    ["ai_usage", [{ used: 0 }, { used: 1 }]],
    ["entitlements", [{ plan_id: "invented", status: "active", current_period_end: null }]],
    ["entitlements", [{ plan_id: "pro", status: "active", current_period_end: "bad-date" }]],
    ["user_roles", [{ role: "admin" }]],
    ["user_roles", [{ role: "owner" }, { role: "owner" }]],
  ])("reports malformed %s data as unavailable", async (table, data) => {
    responses[table as string].data = data;
    expect(await readGenerationCapacity(user, now, db)).toEqual({
      status: "unavailable",
      usagePeriod: "2026-09",
    });
  });
  it("returns unavailable after a transport throw without exposing its response", async () => {
    const failing = {
      from() {
        throw new Error("private response");
      },
    };
    expect(await readGenerationCapacity(user, now, failing)).toEqual({
      status: "unavailable",
      usagePeriod: "2026-09",
    });
  });
});
