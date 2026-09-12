import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  save: vi.fn(),
  setData: vi.fn(),
  user: { id: "owner" } as { id: string } | null,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: h.query,
  useMutation: h.mutation,
  useQueryClient: () => ({ setQueryData: h.setData }),
}));
vi.mock("./auth", () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock("@/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, unknown>) =>
    key + (vars ? JSON.stringify(vars) : ""),
  useAppLanguage: () => "en",
}));
vi.mock("./backlink-recurring.functions", () => ({
  readBacklinkMonitorConfigFn: vi.fn(),
  saveBacklinkMonitorConfigFn: h.save,
}));
import { RecurringBacklinkMonitor } from "@/components/RecurringBacklinkMonitor";
const settings = {
  enabled: true,
  cadence: "weekly" as const,
  lookbackDays: 7,
  includeSubdomains: false,
  monthlyCapMicrousd: 1000000,
};
const config = {
  monitorId: "private-monitor",
  revision: 3,
  website: "https://example.test",
  settings,
  billingMonth: "2026-09",
  spending: { reservedOrSpentMicrousd: 24252, unsettled: false },
  nextDueAt: "2026-09-13T00:00:00Z",
  updatedAt: "2026-09-12T00:00:00Z",
};
const render = (available = true, website = config.website) =>
  renderToStaticMarkup(
    createElement(RecurringBacklinkMonitor, {
      projectId: "p",
      website,
      collectionAvailable: available,
    }),
  );
beforeEach(() => {
  vi.clearAllMocks();
  h.user = { id: "owner" };
  h.query.mockReturnValue({ isSuccess: true, data: config });
  h.mutation.mockReturnValue({ isPending: false, mutate: vi.fn() });
});
it("shows exact spending and an explicit pause control without a provider status request", () => {
  const html = render(false);
  expect(html).toContain("backlinkRecurring.pause");
  expect(html).toContain("backlinkRecurring.unavailable");
  expect(html).toContain("$0.024252");
  expect(html).not.toContain("private-monitor");
  expect(h.save).not.toHaveBeenCalled();
  const options = h.query.mock.calls[0][0];
  expect(options).toMatchObject({
    queryKey: ["backlink-recurring", "owner", "p", config.website],
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
});
it("starts an unconfigured monitor paused with zero allowance without saving", () => {
  h.query.mockReturnValue({ isSuccess: true, data: null });
  const html = render();
  expect(html).toContain("backlinkRecurring.paused");
  expect(html).not.toContain('checked=""');
  expect(html).toContain('value="0"');
  expect(h.save).not.toHaveBeenCalled();
});
it.each(["unsettled", "cap", "website"])(
  "shows a %s hold without presenting a next eligible time",
  (kind) => {
    h.query.mockReturnValue({
      isSuccess: true,
      data: {
        ...config,
        spending: {
          reservedOrSpentMicrousd: kind === "cap" ? 1000000 : 24252,
          unsettled: kind === "unsettled",
        },
      },
    });
    const html = render(true, kind === "website" ? "https://other.test" : config.website);
    expect(html).toContain(
      kind === "unsettled"
        ? "backlinkRecurring.unsettled"
        : kind === "cap"
          ? "backlinkRecurring.capHeld"
          : "backlinkRecurring.changedWebsite",
    );
    expect(html).not.toContain("backlinkRecurring.next");
  },
);
it("hides stale saved settings when revalidation fails", () => {
  h.query.mockReturnValue({ isSuccess: false, isError: true, data: config });
  const html = render();
  expect(html).toContain("backlinkRecurring.error");
  expect(html).not.toContain("backlinkRecurring.spending");
  expect(html).not.toContain("backlinkRecurring.save");
});
it("binds the explicit save to the displayed project, website and saved revision without retries", async () => {
  render();
  const options = h.mutation.mock.calls[0][0];
  expect(options.retry).toBe(false);
  await options.mutationFn({ ...settings, enabled: false });
  expect(h.save).toHaveBeenCalledExactlyOnceWith({
    data: {
      projectId: "p",
      expectedWebsite: config.website,
      expectedRevision: 3,
      changeId: expect.stringMatching(/^[a-f0-9-]{36}$/),
      settings: { ...settings, enabled: false },
    },
  });
});
it("does not render or read another session's monitor after sign-out", () => {
  h.user = null;
  expect(render()).toBe("");
  expect(h.query).not.toHaveBeenCalled();
});
