/**
 * Static-markup regressions for the CG-03B coverage view (node env, no DOM). The expected numbers are written
 * out here, never derived by the code under test. Interactive checks (keyboard, 390px, refresh after lock) are
 * in scripts/panel-coverage-browser for the reviewer's browser run.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PanelProtocol } from "@/lib/citation-panel";
import type { CitationReport } from "@/lib/citation-protocol";

const h = vi.hoisted(() => ({
  queries: {} as Record<string, Record<string, unknown>>,
  options: [] as { queryKey: unknown[]; queryFn: () => unknown }[],
}));
vi.mock("@/i18n", () => ({
  useT: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key} ${JSON.stringify(vars)}` : key,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (o: { queryKey: unknown[]; queryFn: () => unknown }) => {
    h.options.push(o);
    return (
      h.queries[JSON.stringify(o.queryKey)] ?? {
        data: undefined,
        isError: false,
        isPending: true,
      }
    );
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
const fns = vi.hoisted(() => ({
  readAnswerEvidenceFn: vi.fn(),
  readCitationProtocolFn: vi.fn(),
  readResolvedCapturesFn: vi.fn(),
  saveCitationPanelDraftFn: vi.fn(),
  lockCitationPanelFn: vi.fn(),
}));
vi.mock("@/lib/answer-evidence.functions", () => ({
  readAnswerEvidenceFn: fns.readAnswerEvidenceFn,
}));
vi.mock("@/lib/citation-protocol.functions", () => ({
  readCitationProtocolFn: fns.readCitationProtocolFn,
  readResolvedCapturesFn: fns.readResolvedCapturesFn,
  saveCitationPanelDraftFn: fns.saveCitationPanelDraftFn,
  lockCitationPanelFn: fns.lockCitationPanelFn,
}));
import { CitationPanelProtocolPanel, PanelCoverage } from "./CitationPanelProtocolPanel";

const OWNER = "00000000-0000-4000-8000-000000000001";
const DISCOVERY = "40000000-0000-4000-8000-0000000000d1";
const BRAND = "40000000-0000-4000-8000-0000000000b1";
const RUN = "50000000-0000-4000-8000-0000000000aa";
const panel = (over: Partial<PanelProtocol>): PanelProtocol =>
  ({
    panelId: DISCOVERY,
    version: 1,
    kind: "discovery",
    client: { name: "FIXTURE Nordlys Heating", market: "NO — Oslo" },
    questions: Array.from({ length: 10 }, (_, i) => ({ id: `NH-D${i + 1}` })),
    rounds: 4,
    status: "locked",
    approval: { approvedBy: OWNER, approvedAt: "2026-09-01T00:00:00Z" },
    ...over,
  }) as PanelProtocol;
const report = (over: Partial<CitationReport>): CitationReport => ({
  panelId: DISCOVERY,
  panelVersion: 1,
  kind: "discovery",
  planned: 40,
  observed: 3,
  erased: 1,
  erasedExtra: 1,
  liveExtra: 2,
  recorded: 4,
  neverObserved: 36,
  coverageComplete: true,
  excluded: 2,
  // Deliberately not summing to `observed` (3): an unmatched record adds an outcome without a slot.
  outcomes: { complete: 1, failed: 1, truncated: 0, missed: 0, protocol_deviant: 2 },
  brandRuns: [],
  ...over,
});
const read = (over: Record<string, unknown> = {}) => ({
  panels: [] as PanelProtocol[],
  brandRuns: [],
  captures: [],
  erasedSlots: [],
  reports: [] as CitationReport[],
  erasureOverflow: 0,
  ...over,
});
const ready = (data: ReturnType<typeof read>) =>
  renderToStaticMarkup(
    createElement(PanelCoverage, { state: { kind: "ready", data: data as never } }),
  );
const vars = (key: string, v: Record<string, unknown>) =>
  `${key} ${JSON.stringify(v).replaceAll('"', "&quot;")}`;

beforeEach(() => {
  h.queries = {};
  h.options = [];
  for (const fn of Object.values(fns)) fn.mockClear();
});

describe("panel coverage view (CG-03B)", () => {
  it("discovery: distinct coverage, outcomes, extras and unmatched records stay separate facts", () => {
    const html = ready(read({ panels: [panel({})], reports: [report({})] }));
    expect(html).toContain(
      vars("panelCoverage.planned", { planned: 40, questions: 10, rounds: 4 }),
    );
    expect(html).toContain(vars("panelCoverage.observed", { observed: 3, planned: 40 }));
    expect(html).toContain("panelCoverage.observedHelp");
    expect(html).toContain(vars("panelCoverage.erased", { count: 1 }));
    expect(html).toContain(vars("panelCoverage.neverObserved", { count: 36 }));
    expect(html).toContain(vars("panelCoverage.outcome.complete", { count: 1 }));
    expect(html).toContain(vars("panelCoverage.outcome.failed", { count: 1 }));
    expect(html).toContain(vars("panelCoverage.outcome.protocol_deviant", { count: 2 }));
    expect(html).toContain(vars("panelCoverage.liveExtra", { count: 2 }));
    expect(html).toContain(vars("panelCoverage.erasedExtra", { count: 1 }));
    expect(html).toContain(vars("panelCoverage.excluded", { count: 2 }));
    // Extras never inflate distinct coverage; nothing is a percentage or a money amount.
    expect(html).toContain('data-coverage-observed="3"');
    expect(html).not.toMatch(/%|USD|\$/);
    expect(html).not.toContain("data-coverage-incomplete");
    // Details are a native, keyboard-operable disclosure.
    expect(html).toMatch(/<details[^>]*><summary[^>]*>panelCoverage\.details<\/summary>/);
  });

  it("R1: a deleted observation is not 'not recorded yet' (planned 40, observed 0, deleted 1, never 39)", () => {
    const html = ready(
      read({
        panels: [panel({})],
        reports: [
          report({
            observed: 0,
            erased: 1,
            recorded: 1,
            neverObserved: 39,
            liveExtra: 0,
            erasedExtra: 0,
            excluded: 0,
            outcomes: { complete: 0, failed: 0, truncated: 0, missed: 0, protocol_deviant: 0 },
          }),
        ],
      }),
    );
    // All 40 lack live evidence now, but only 39 were never recorded: the deleted one is its own line.
    expect(html).toContain(vars("panelCoverage.observed", { observed: 0, planned: 40 }));
    expect(html).toContain(vars("panelCoverage.erased", { count: 1 }));
    expect(html).toContain(vars("panelCoverage.neverObserved", { count: 39 }));
    expect(html).toContain('data-coverage-never="39"');
    expect(html).not.toContain(vars("panelCoverage.neverObserved", { count: 40 }));
  });

  it("R1: each Record details summary is a 44px native target", () => {
    const html = ready(read({ panels: [panel({})], reports: [report({})] }));
    const summary = /<summary class="([^"]*)">panelCoverage\.details<\/summary>/.exec(html);
    expect(summary).not.toBeNull();
    expect(summary![1].split(/\s+/)).toEqual(expect.arrayContaining(["min-h-11", "py-3"]));
  });

  it("unknown completeness keeps never-observed unknown with a cause-neutral note", () => {
    const html = ready(
      read({
        panels: [panel({})],
        reports: [report({ coverageComplete: false, neverObserved: null })],
      }),
    );
    expect(html).toContain('data-coverage-never="unknown"');
    expect(html).toContain("panelCoverage.neverObservedUnknown");
    expect(html).toContain("panelCoverage.incomplete");
    expect(html).not.toContain("panelCoverage.neverObserved {");
  });

  it("brand: approved runs with authoritative use, never a 0/0 grid or money", () => {
    const html = ready(
      read({
        panels: [panel({ panelId: BRAND, kind: "brand", rounds: 0 })],
        brandRuns: [
          {
            id: RUN,
            panelId: BRAND,
            panelVersion: 1,
            approvedBy: OWNER,
            approvedAt: "2026-09-02T08:00:00Z",
            observationBudget: 5,
            rounds: 1,
          },
        ],
        reports: [
          report({
            panelId: BRAND,
            kind: "brand",
            planned: 0,
            observed: 0,
            erased: 1,
            recorded: 1,
            neverObserved: 0,
            liveExtra: 0,
            erasedExtra: 0,
            excluded: 0,
            outcomes: { complete: 0, failed: 0, truncated: 0, missed: 0, protocol_deviant: 0 },
            brandRuns: [{ runId: RUN, approvedBudget: 5, consumed: 2, observed: 0, erased: 1 }],
          }),
        ],
      }),
    );
    expect(html).toContain('data-coverage-kind="brand"');
    expect(html).toContain('data-consumed="2"');
    expect(html).toContain(
      vars("panelCoverage.brandRun", {
        date: "2026-09-02",
        budget: 5,
        consumed: 2,
        observed: 0,
        erased: 1,
      }),
    );
    expect(html).toContain("panelCoverage.brandHelp");
    expect(html).not.toContain("data-coverage-planned");
    expect(html).not.toContain("panelCoverage.observed {");
    expect(html).not.toMatch(/0\/0|%|USD|\$/);
  });

  it("an older locked version stays visible behind a newer draft; unattributed deletions are global", () => {
    const html = ready(
      read({
        panels: [panel({ version: 1 }), panel({ version: 2, status: "draft", approval: null })],
        reports: [report({ panelVersion: 1 })],
        erasureOverflow: 4,
      }),
    );
    expect(html).toContain(`data-coverage-version="${DISCOVERY}:1"`);
    expect(html).not.toContain(`data-coverage-version="${DISCOVERY}:2"`);
    expect(html).toContain('data-coverage-overflow="4"');
    expect(html).toContain(vars("panelCoverage.overflow", { count: 4 }));
  });

  it("a locked version without a returned report says unknown, not an empty success", () => {
    const html = ready(read({ panels: [panel({})], reports: [] }));
    expect(html).toContain("data-coverage-missing");
    expect(html).not.toContain("data-coverage-observed");
  });

  it("empty, loading and error states are distinct and never show numbers", () => {
    expect(ready(read())).toContain("panelCoverage.empty");
    const loading = renderToStaticMarkup(
      createElement(PanelCoverage, { state: { kind: "loading" } }),
    );
    expect(loading).toContain('data-panel-coverage="loading"');
    expect(loading).not.toContain("panelCoverage.empty");
    const error = renderToStaticMarkup(createElement(PanelCoverage, { state: { kind: "error" } }));
    expect(error).toContain('role="alert"');
    expect(error).not.toContain("data-coverage-version");
  });
});

describe("coverage read wiring", () => {
  const render = (projectId = "proj_a") =>
    renderToStaticMarkup(
      createElement(CitationPanelProtocolPanel, {
        projectId,
        ownerId: OWNER,
        seed: { clientName: "FIXTURE", market: "NO", language: "en" },
      }),
    );
  const key = (k: string, projectId = "proj_a") => JSON.stringify([k, OWNER, projectId]);
  const loaded = (data: unknown) => ({ data, isError: false, isPending: false });

  it("uses the resolved read under its own owner+project query identity", async () => {
    render();
    const coverage = h.options.find((o) => o.queryKey[0] === "citation-coverage");
    expect(coverage?.queryKey).toEqual(["citation-coverage", OWNER, "proj_a"]);
    expect(h.options.find((o) => o.queryKey[0] === "citation-protocol")?.queryKey).toEqual([
      "citation-protocol",
      OWNER,
      "proj_a",
    ]);
    await coverage?.queryFn();
    expect(fns.readResolvedCapturesFn).toHaveBeenCalledWith({
      data: { projectId: "proj_a", expectedOwnerId: OWNER },
    });
    expect(fns.readCitationProtocolFn).not.toHaveBeenCalled();
  });

  it("a failed refresh with cached data shows the error, never the stale numbers", () => {
    h.queries[key("citation-protocol")] = loaded({ panels: [] });
    h.queries[key("answer-evidence")] = loaded({ prompts: [], answers: [] });
    h.queries[key("citation-coverage")] = {
      data: read({ panels: [panel({})], reports: [report({})] }),
      isError: true,
      isPending: false,
    };
    const html = render();
    expect(html).toContain("panelCoverage.error");
    expect(html).not.toContain("data-coverage-version");
  });

  it("another project never shows this project's coverage, and rendering writes nothing", () => {
    h.queries[key("citation-coverage")] = loaded(
      read({ panels: [panel({})], reports: [report({})] }),
    );
    expect(render()).toContain("data-coverage-version");
    const other = render("proj_b");
    expect(other).toContain('data-panel-coverage="loading"');
    expect(other).not.toContain("data-coverage-version");
    expect(fns.saveCitationPanelDraftFn).not.toHaveBeenCalled();
    expect(fns.lockCitationPanelFn).not.toHaveBeenCalled();
  });
});
