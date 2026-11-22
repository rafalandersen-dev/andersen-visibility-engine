/** Daily GA4 runner: synced only after fetch AND save; skips, failures and the property pin are counted apart. */
import { describe, expect, it, vi } from "vitest";
import { Ga4Error } from "./ga4.server";
import {
  GA4_DAILY_PROPERTY_ID,
  runGa4DailySync,
  type Ga4DailyDeps,
  type Ga4DailyTarget,
} from "./ga4-daily.server";

const NOW = new Date("2026-11-22T05:40:00Z");
const target = (projectId: string, lastSuccessAt: string | null = null): Ga4DailyTarget => ({
  userId: "00000000-0000-4000-8000-000000000001",
  projectId,
  lastSuccessAt,
});
const result = (propertyId = GA4_DAILY_PROPERTY_ID) => ({
  periodStart: "2026-10-25",
  periodEnd: "2026-11-21",
  snapshot: {
    source: "ga4_api" as const,
    propertyId,
    propertyName: "Synergy",
    timeZone: "Europe/Stockholm",
    chatgptSessions: 2,
    bookingClicks: null,
    bookingCompleted: null,
    partial: false,
    fetchedAt: NOW.toISOString(),
  },
});

function deps(targets: Ga4DailyTarget[], patch: Partial<Ga4DailyDeps> = {}) {
  return {
    listTargets: vi.fn(async () => targets),
    sync: vi.fn(async () => result()),
    saveSuccess: vi.fn(async () => {}),
    saveFailure: vi.fn(async () => {}),
    now: () => NOW,
    ...patch,
  };
}

describe("runGa4DailySync", () => {
  it("fetches and saves a due target through the shared sync path", async () => {
    const d = deps([target("p")]);
    expect(await runGa4DailySync(d)).toEqual({
      targets: 1,
      synced: 1,
      skippedFresh: 0,
      fetchFailed: 0,
      saveFailed: 0,
      errors: {},
    });
    expect(d.sync).toHaveBeenCalledWith({
      userId: target("p").userId,
      projectId: "p",
      expectedPropertyId: GA4_DAILY_PROPERTY_ID,
    });
    expect(d.saveSuccess).toHaveBeenCalledWith(target("p"), result(), NOW.toISOString());
  });

  it("skips only a target already saved on the same UTC date, without calling Google", async () => {
    const sync = vi.fn<Ga4DailyDeps["sync"]>(async () => result());
    const d = deps(
      [
        target("p", "2026-11-22T00:10:00+00:00"),
        target("q", "2026-11-21T09:00:00Z"),
        target("r", "not a date"),
      ],
      { sync },
    );
    expect(await runGa4DailySync(d)).toMatchObject({ synced: 2, skippedFresh: 1 });
    expect(sync.mock.calls.map((c) => c[0].projectId)).toEqual(["q", "r"]);
  });

  it("does not skip the next morning's run after a late-evening release check", async () => {
    // 7h40m apart, but on adjacent UTC dates.
    const d = deps([target("p", "2026-11-21T22:00:00.000Z")]);
    expect(await runGa4DailySync(d)).toMatchObject({ synced: 1, skippedFresh: 0 });
  });

  it("records a fetch failure with its code and keeps going", async () => {
    const sync = vi
      .fn<Ga4DailyDeps["sync"]>()
      .mockRejectedValueOnce(new Ga4Error("expired"))
      .mockRejectedValueOnce(new Error("raw provider text"))
      .mockResolvedValueOnce(result());
    const saveFailure = vi.fn<Ga4DailyDeps["saveFailure"]>(async () => {});
    const r = await runGa4DailySync(
      deps([target("a"), target("b"), target("c")], { sync, saveFailure }),
    );
    expect(r).toMatchObject({ synced: 1, fetchFailed: 2, errors: { expired: 1, failed: 1 } });
    expect(saveFailure.mock.calls.map((c) => c[1])).toEqual(["expired", "failed"]);
    expect(JSON.stringify(r)).not.toContain("raw provider text");
  });

  it("never stores a snapshot of another property", async () => {
    const d = deps([target("p")], { sync: vi.fn(async () => result("123")) });
    expect(await runGa4DailySync(d)).toMatchObject({
      synced: 0,
      fetchFailed: 1,
      errors: { not_available: 1 },
    });
    expect(d.saveSuccess).not.toHaveBeenCalled();
  });

  it("counts a failed write as saveFailed, not synced", async () => {
    const d = deps([target("p")], {
      saveSuccess: vi.fn(async () => {
        throw new Ga4Error("failed");
      }),
    });
    expect(await runGa4DailySync(d)).toMatchObject({
      synced: 0,
      saveFailed: 1,
      errors: { failed: 1 },
    });
  });

  it("a failure-record write error does not abort the run", async () => {
    const d = deps([target("a"), target("b")], {
      sync: vi
        .fn<Ga4DailyDeps["sync"]>()
        .mockRejectedValueOnce(new Ga4Error("unavailable"))
        .mockResolvedValue(result()),
      saveFailure: vi.fn(async () => {
        throw new Error("db");
      }),
    });
    expect(await runGa4DailySync(d)).toMatchObject({ synced: 1, fetchFailed: 1 });
  });

  it("propagates a failed target listing (the route answers 500)", async () => {
    const d = deps([], { listTargets: vi.fn(async () => Promise.reject(new Ga4Error("failed"))) });
    await expect(runGa4DailySync(d)).rejects.toThrow("failed");
  });
});
