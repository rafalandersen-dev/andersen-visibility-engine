import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const m = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: m.query }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => createElement("a", null, children),
}));
vi.mock("./work-awareness.functions", () => ({ getWorkAwarenessFn: vi.fn() }));
vi.mock("./auth", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("./store", () => ({
  useStore: (selector: (s: unknown) => unknown) =>
    selector({ projects: [{ id: "p", name: "Project" }], activeProjectId: "p" }),
  setActiveProject: vi.fn(),
}));
vi.mock("@/i18n", () => ({ useT: () => (key: string) => key, useAppLanguage: () => "en" }));
import { WorkAwareness } from "@/components/WorkAwareness";
const report = {
  projectId: "p",
  checkedAt: "2026-09-10T12:00:00Z",
  timeZone: "UTC",
  engine: "paused",
  enabled: true,
  page: 0,
  pages: 1,
  approvals: [
    {
      id: "q",
      assetId: "a",
      title: "Held draft",
      publishAt: "2026-09-01T12:00:00Z",
      state: "resume",
      late: true,
    },
  ],
  weeks: [],
};
beforeEach(() => {
  m.query.mockReturnValue({ data: report, isError: false, isPending: false });
});
describe("in-app work presentation", () => {
  it("falls back to explicit UTC dates if a retained report has an invalid zone", () => {
    m.query.mockReturnValue({
      data: { ...report, timeZone: "Invalid/Zone" },
      isError: false,
      isPending: false,
    });
    const html = renderToStaticMarkup(createElement(WorkAwareness));
    expect(html).toContain("2026-09-01T12:00:00.000Z");
    expect(html).toContain("Held draft");
  });

  it("renders intentional pause, exact approval hold and late-date guidance together", () => {
    const html = renderToStaticMarkup(createElement(WorkAwareness));
    for (const text of [
      "awareness.paused",
      "awareness.resume",
      "awareness.late",
      "Held draft",
      "notifications.calendar",
      "awareness.help",
    ])
      expect(html).toContain(text);
  });
  it("hides previous successful records if recheck fails and does not report an empty queue", () => {
    m.query.mockReturnValue({ data: report, isError: true, isPending: false });
    const html = renderToStaticMarkup(createElement(WorkAwareness));
    expect(html).toContain("awareness.error");
    expect(html).not.toContain("Held draft");
    expect(html).not.toContain("awareness.empty");
  });
  it("labels saved weekly blockers as historical and preserves current cancelled slots", () => {
    m.query.mockReturnValue({
      data: {
        ...report,
        engine: "weekly",
        weeks: [
          {
            period: "week:2026-09-07",
            summary: {
              updatedAt: "2026-09-08T12:00:00Z",
              summary: { action: "capacity-required" },
            },
            readiness: [{ slotId: "s", publishAt: "2026-09-10T12:00:00Z", state: "cancelled" }],
            stages: [],
          },
        ],
      },
    });
    const html = renderToStaticMarkup(createElement(WorkAwareness));
    expect(html).toContain("awareness.history");
    expect(html).toContain("weekly.action.capacity-required");
    expect(html).toContain("weekly.state.cancelled");
  });
});
