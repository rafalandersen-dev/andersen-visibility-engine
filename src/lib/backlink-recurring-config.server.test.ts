import { expect, it, vi } from "vitest";
import {
  readBacklinkMonitorConfig,
  saveBacklinkMonitorConfig,
} from "./backlink-recurring-config.server";
const user = "00000000-0000-4000-8000-000000000001",
  change = "00000000-0000-4000-8000-000000000002";
const input = {
  projectId: "p",
  changeId: change,
  expectedRevision: 0,
  expectedWebsite: "https://example.test",
  settings: {
    enabled: false,
    cadence: "weekly" as const,
    lookbackDays: 7,
    includeSubdomains: false,
    monthlyCapMicrousd: 0,
  },
};
function setup() {
  const record = {
    billingMonth: "2026-09",
    spending: { reservedOrSpentMicrousd: 0, unsettled: false },
    user_id: user,
    project_id: "p",
    monitor_id: change,
    revision: 1,
    website_value: "  https://example.test  ",
    settings: input.settings,
    next_due_at: "2026-09-12T00:00:00Z",
    updated_at: "2026-09-12T00:00:00Z",
    last_change_id: "private-change",
  };
  const rpc = vi.fn(
    async (
      name: string,
      args: Record<string, unknown>,
    ): Promise<{ data: unknown; error: unknown }> => ({
      data:
        name === "read_backlink_monitoring_context" ? { website: record.website_value } : record,
      error: null,
    }),
  );
  return { record, rpc };
}
it("projects only confirmed owner/project configuration and strips internal mutation identity", async () => {
  const d = setup();
  const value = await readBacklinkMonitorConfig(user, { projectId: "p" }, d.rpc);
  expect(value?.settings).toEqual(input.settings);
  expect(JSON.stringify(value)).not.toContain("private-change");
});
it("preserves authoritative website whitespace while matching the displayed value", async () => {
  const d = setup();
  expect((await saveBacklinkMonitorConfig(user, input, d.rpc)).state).toBe("saved");
  expect(d.rpc).toHaveBeenLastCalledWith("save_backlink_recurring_monitor", {
    p_user: user,
    p_project: "p",
    p_change: change,
    p_revision: 0,
    p_website: d.record.website_value,
    p_settings: input.settings,
  });
});
it("refuses stale displayed website without writing settings", async () => {
  const d = setup();
  expect(
    await saveBacklinkMonitorConfig(
      user,
      { ...input, expectedWebsite: "https://other.test" },
      d.rpc,
    ),
  ).toEqual({ state: "website_changed" });
  expect(d.rpc).toHaveBeenCalledOnce();
});
it.each(["userId", "nextDueAt", "monitorId", "spentMicrousd"])(
  "rejects browser operational field %s before any call",
  async (key) => {
    const d = setup();
    await expect(
      saveBacklinkMonitorConfig(user, { ...input, [key]: "forged" }, d.rpc),
    ).rejects.toThrow();
    expect(d.rpc).not.toHaveBeenCalled();
  },
);
it.each(["owner", "project", "revision", "website", "settings"])(
  "refuses mismatched saved configuration %s",
  async (kind) => {
    const d = setup();
    if (kind === "owner") d.record.user_id = change;
    if (kind === "project") d.record.project_id = "other";
    if (kind === "revision") d.record.revision = 2;
    if (kind === "website")
      d.rpc.mockResolvedValueOnce({ data: { website: "https://example.test" }, error: null });
    if (kind === "settings") d.record.settings = { ...input.settings, lookbackDays: 8 };
    await expect(saveBacklinkMonitorConfig(user, input, d.rpc)).rejects.toThrow();
  },
);
it("keeps absent configuration distinct from enabled settings", async () => {
  const d = setup();
  d.rpc.mockResolvedValueOnce({ data: null, error: null });
  expect(await readBacklinkMonitorConfig(user, { projectId: "p" }, d.rpc)).toBeNull();
});
