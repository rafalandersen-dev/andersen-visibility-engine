/**
 * Static-markup regressions for the inspector surface (supporting evidence only, node env, no DOM): the masked
 * view renders the exact reference, the approved version/content, the independence gate, the real result
 * controls and the fresh-inspection prompt; a refused read shows the honest error. Clicks/retries are exercised
 * in the isolated browser harness and the PGlite suite, not here.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ view: undefined as unknown, isError: false }));
vi.mock("@/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    vars ? `${key} ${Object.values(vars).join(" ")}` : key,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: h.view,
    isError: h.isError,
    isSuccess: h.view !== undefined,
    isPending: h.view === undefined && !h.isError,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/citation-change.functions", () => ({
  getImprovementForInspectionFn: vi.fn(),
  saveImprovementInspectionFn: vi.fn(),
}));
import { CitationInspectionPanel } from "./CitationInspectionPanel";

const OWNER = "00000000-0000-4000-8000-000000000001";
const ACTOR = "00000000-0000-4000-8000-0000000000a1";
const ROW = "00000000-0000-4000-8000-0000000000f1";
const HEAD = "00000000-0000-4000-8000-0000000000e1";
const SHA = "a".repeat(64);
const view = (over: Record<string, unknown> = {}) => ({
  id: ROW,
  improvementId: "00000000-0000-4000-8000-000000000071",
  version: 2,
  expectedSha: SHA,
  kind: "listing",
  destinationReference: "google-business-profile:acme",
  approvedVersion: "d".repeat(64),
  approval: { known: true, approvedAt: "2026-09-27T10:05:00Z" },
  performer: { known: true, anchorAt: "2026-09-27T10:10:00Z" },
  independenceAvailable: true,
  approvedContent: { fields: { openingHours: { before: "9–17", after: "9–18" } } },
  boundFindings: [
    {
      findingId: "00000000-0000-4000-8000-0000000000d1",
      version: 1,
      family: "citation_source",
      decision: "accepted",
    },
  ],
  myHead: null,
  myInspections: [],
  ...over,
});
const render = () =>
  renderToStaticMarkup(
    createElement(CitationInspectionPanel, {
      ownerId: OWNER,
      projectId: "proj_a",
      improvementRowId: ROW,
      actorId: ACTOR,
    }),
  );

describe("inspector panel — masked view and honest gates", () => {
  it("renders loading, then the exact reference, approved version and enumerated fields with real result controls", () => {
    h.view = undefined;
    h.isError = false;
    expect(render()).toContain("citationForward.common.loading");
    h.view = view();
    const html = render();
    expect(html).toContain("google-business-profile:acme");
    expect(html).toContain("d".repeat(16));
    expect(html).toContain("9–18");
    expect(html).toContain("citationChange.artifact.kind.listing");
    expect(html).toContain('name="independent-inspection-result"');
    expect(html).toContain("citationChange.inspect.record");
    expect(html).not.toContain("citationChange.inspect.withdraw");
    expect(html).toContain('data-independence="available"');
    // No baseline ids, no owner inspection, no other improvements are part of the masked view.
    expect(html).not.toContain("baselineCaptureIds");
    // A listing reference is not a hyperlink; a public URL is.
    expect(html).not.toContain("citationChange.inspect.open");
    h.view = view({ kind: "public_url", destinationReference: "https://acme.example/services" });
    expect(render()).toContain("citationChange.inspect.open");
  });
  it("hides the result controls when independence is unavailable, and prompts a FRESH inspection when the head lost effect", () => {
    h.isError = false;
    h.view = view({ independenceAvailable: false, performer: { known: false, anchorAt: null } });
    let html = render();
    expect(html).toContain('data-independence="unavailable"');
    expect(html).toContain("citationChange.inspect.identityUnavailable");
    expect(html).not.toContain('name="independent-inspection-result"');
    h.view = view({
      myHead: { version: 1, id: HEAD, effective: false, ineffectiveReason: "authority" },
      myInspections: [
        {
          id: HEAD,
          version: 1,
          checkResult: "shows_approved_content",
          observedAt: "2026-09-27T11:00:00Z",
          createdAt: "2026-09-27T11:00:01Z",
        },
      ],
    });
    html = render();
    expect(html).toContain('data-fresh-needed="authority"');
    expect(html).toContain("citationChange.inspect.reason.authority");
    expect(html).toContain("citationChange.inspect.withdraw");
    expect(html).toContain("citationChange.inspect.head");
    // A withdrawn head offers no further withdrawal.
    h.view = view({
      myHead: { version: 2, id: HEAD, effective: false, ineffectiveReason: "withdrawn" },
      myInspections: [
        { id: HEAD, version: 2, checkResult: "withdrawn", observedAt: null, createdAt: "x" },
      ],
    });
    expect(render()).not.toContain("citationChange.inspect.withdraw<");
  });
  it("shows the honest error when the read is refused (unassigned, revoked, changed row) and never a fabricated view", () => {
    h.view = undefined;
    h.isError = true;
    const html = render();
    expect(html).toContain("citationChange.inspect.loadError");
    expect(html).not.toContain("citationChange.inspect.record");
  });
});
