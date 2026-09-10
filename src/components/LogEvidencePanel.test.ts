import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { prepareLogImport } from "@/lib/log-evidence";
const h = vi.hoisted(() => ({ state: [] as unknown[], error: false }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: "00000000-0000-4000-8000-000000000001" } }),
}));
vi.mock("@/i18n", () => ({ useT: () => (key: string) => key }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: h.state, isError: h.error, isPending: false, refetch: vi.fn() }),
}));
vi.mock("@/lib/log-evidence.functions", () => ({
  readLogEvidenceFn: vi.fn(),
  importLogEvidenceFn: vi.fn(),
  removeLogEvidenceFn: vi.fn(),
}));
import { LogEvidencePanel } from "./LogEvidencePanel";
function render() {
  return renderToStaticMarkup(createElement(LogEvidencePanel, { projectId: "p" }));
}
describe("integrated private log UI", () => {
  it("shows unknown empty history and privacy controls, without synthetic counts", () => {
    h.state = [];
    h.error = false;
    const html = render();
    expect(html).toContain("logs.empty");
    expect(html).toContain("logs.privacy");
    expect(html).toContain("logs.template");
    expect(html).not.toContain("<pre");
  });
  it("renders complete safe evidence as text with separate metrics", () => {
    const d = prepareLogImport({
      format: "milo-log-evidence-v1",
      source: "Synthetic",
      layer: "edge",
      method: "manual v1",
      hostname: "example.com",
      windowStart: "2026-08-01T00:00:00Z",
      windowEnd: "2026-08-02T00:00:00Z",
      completeness: "complete",
      publicPathsConfirmed: true,
      supersedesId: null,
      rows: [
        {
          time: "2026-08-01T12:00:00Z",
          page: "/public",
          status: 403,
          method: "GET",
          userAgent: "GPTBot <script>hostile</script>",
        },
      ],
    });
    h.state = [
      {
        ...d,
        id: "00000000-0000-4000-8000-000000000003",
        createdAt: d.input.windowEnd,
        hash: "a".repeat(64),
      },
    ];
    h.error = false;
    const html = render();
    expect(html).toContain("logs.unverified");
    expect(html).toContain("logs.notTraffic");
    expect(html).toContain("403");
    expect(html).toContain("/public");
    expect(html).not.toContain("hostile");
    expect(html).not.toContain("<script");
    expect(html).not.toContain('href="https://example.com');
    expect(html).toContain("logs.unknown");
  });
  it("hides stale private history and export when a scoped read fails", () => {
    h.error = true;
    const html = render();
    expect(html).toContain("logs.error");
    expect(html).not.toContain("/public");
    expect(html).not.toContain("<pre");
    h.error = false;
  });
});
