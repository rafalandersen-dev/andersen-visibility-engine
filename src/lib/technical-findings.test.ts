import { describe, it, expect, vi } from "vitest";
import { technicalFindings, technicalFindingLabels } from "./technical-findings";
import { inspectTechnicalPage } from "./technical-page";
import { startTechnicalCrawl } from "./technical-crawl";
import { robotsEvidence } from "./technical-robots";
import { captureTechnicalFinding } from "./technical-findings.server";
const now = "2026-09-11T00:00:00.000Z",
  origin = "https://example.test";
const user = "00000000-0000-4000-8000-000000000001",
  runId = "00000000-0000-4000-8000-000000000002";
const target = { projectId: "p", runId, revision: 3, pageIndex: 0, code: "missing_title" as const };
const page = () => ({
  requestedUrl: origin + "/a",
  depth: 1,
  state: "observed" as const,
  observation: inspectTechnicalPage({
    url: origin + "/a",
    status: 200,
    observedAt: now,
    html: "<html><body></body></html>",
  }),
});
function setup() {
  const state = startTechnicalCrawl({
    siteUrl: origin,
    now,
    robots: robotsEvidence(404),
    robotsFetchedAt: now,
  });
  state.pages = [page()];
  state.queue = [];
  state.status = "completed";
  const record = {
    user_id: user,
    project_id: "p",
    run_id: runId,
    website_value: origin,
    origin,
    status: "completed",
    revision: 3,
    state,
    created_at: now,
    updated_at: now,
  };
  const receipt = {
    opportunityExists: true,
    evidenceId: "00000000-0000-4000-8000-000000000003",
    opportunityId: "00000000-0000-4000-8000-000000000004",
    hash: "a".repeat(64),
  };
  const rpc = vi.fn(
    async (
      name: string,
      _args: Record<string, unknown>,
    ): Promise<{ data: unknown; error: null }> => ({
      data:
        name === "read_technical_crawl"
          ? record
          : name === "read_technical_crawl_context"
            ? { appLanguage: "pl" }
            : receipt,
      error: null,
    }),
  );
  return { state, record, receipt, rpc };
}
describe("technical findings", () => {
  it("derives absence only from a complete successful observation", () => {
    const p = page();
    expect(technicalFindings(p)).toEqual(["missing_title", "missing_description", "missing_h1"]);
    p.observation.complete = false;
    expect(technicalFindings(p)).toEqual([]);
    p.observation.status = 404;
    expect(technicalFindings(p)).toEqual(["http_error"]);
  });
  it("does not turn an unsuccessful fetch into a page defect", () => {
    expect(technicalFindings({ requestedUrl: origin, depth: 0, state: "fetch_failed" })).toEqual(
      [],
    );
  });
  it("records noindex scope as a review action and JSON syntax separately", () => {
    const p = page();
    p.observation.robots = [
      { source: "header", agent: "googlebot", value: "googlebot: noindex, follow" },
    ];
    p.observation.structuredData = [{ state: "invalid_json", types: [], complete: true }];
    expect(technicalFindings(p)).toContain("noindex");
    expect(technicalFindings(p)).toContain("invalid_jsonld");
    p.observation.complete = false;
    expect(technicalFindings(p)).not.toContain("invalid_jsonld");
  });
  it.each(["none", "NONE", "googlebot: none", "follow, none"])(
    "recognizes the none alias: %s",
    (value) => {
      const p = page();
      p.observation.robots = [{ source: "header", agent: "*", value }];
      expect(technicalFindings(p)).toContain("noindex");
    },
  );
  it.each(["nonetheless", "x-none", "none-other", "index, follow"])(
    "does not infer noindex from %s",
    (value) => {
      const p = page();
      p.observation.robots = [{ source: "meta", agent: "*", value }];
      expect(technicalFindings(p)).not.toContain("noindex");
    },
  );
  it("uses authenticated saved scope and canonical project language", async () => {
    const d = setup();
    expect(await captureTechnicalFinding(user, target, d.rpc)).toEqual(d.receipt);
    expect(d.rpc).toHaveBeenLastCalledWith(
      "capture_technical_crawl_finding",
      expect.objectContaining({
        p_user: user,
        p_run: runId,
        p_revision: 3,
        p_code: "missing_title",
        p_title: `${technicalFindingLabels.pl.missing_title}: ${origin}/a`,
      }),
    );
  });
  it("rejects browser evidence or title overrides before database calls", async () => {
    const d = setup();
    await expect(
      captureTechnicalFinding(user, { ...target, title: "Invented" }, d.rpc),
    ).rejects.toThrow();
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("does not write a stale or unsupported finding", async () => {
    const d = setup();
    d.record.revision = 4;
    await expect(captureTechnicalFinding(user, target, d.rpc)).rejects.toThrow(
      "technical_finding_changed",
    );
    expect(d.rpc.mock.calls.every(([name]) => name !== "capture_technical_crawl_finding")).toBe(
      true,
    );
  });
});

it.each([206, 226, 200])(
  "does not capture synthetic-head noindex from an incomplete representation (%s)",
  (status) => {
    const observation = inspectTechnicalPage({
      url: origin,
      status,
      observedAt: now,
      html: '<meta name="robots" content="noindex">',
      headers: status === 200 ? { "content-range": "bytes 50-99/100" } : {},
    });
    expect(observation.complete).toBe(false);
    const p = { requestedUrl: origin, depth: 0, state: "observed" as const, observation };
    expect(technicalFindings(p)).not.toContain("noindex");
    observation.robots.push({ source: "header", agent: "googlebot", value: "googlebot: noindex" });
    expect(technicalFindings(p)).toContain("noindex");
  },
);
