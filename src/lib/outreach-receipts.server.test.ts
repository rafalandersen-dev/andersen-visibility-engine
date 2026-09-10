import { describe, it, expect } from "vitest";
import { readOutreachDeliveries, outreachRpc } from "./outreach-receipts.server";
const user = "00000000-0000-4000-8000-000000000001";
describe("bounded private outreach receipt reader", () => {
  it("keeps unavailable distinct from empty and sanitizes storage details", async () => {
    await expect(
      readOutreachDeliveries(user, "p", async () => ({
        data: null,
        error: { message: "private upstream details" },
      })),
    ).rejects.toThrow(/^outreach_storage_unavailable$/);
    await expect(
      readOutreachDeliveries(user, "p", async () => ({ data: [], error: null })),
    ).resolves.toEqual([]);
  });
  it("rejects malformed, excessive and foreign scoped history", async () => {
    for (const data of [null, {}, Array(3001).fill({}), [{ project_id: "other" }]])
      await expect(
        readOutreachDeliveries(user, "p", async () => ({ data, error: null })),
      ).rejects.toThrow("outreach_storage_unavailable");
  });
  it("only returns exact allowlisted local storage reasons", async () => {
    await expect(
      outreachRpc("reserve", {}, async () => ({
        data: null,
        error: { message: "outreach_daily_limit_reached" },
      })),
    ).rejects.toThrow(/^outreach_daily_limit_reached$/);
    await expect(
      outreachRpc("reserve", {}, async () => ({
        data: null,
        error: { message: "outreach_daily_limit_reached private" },
      })),
    ).rejects.toThrow(/^outreach_storage_unavailable$/);
  });
});
