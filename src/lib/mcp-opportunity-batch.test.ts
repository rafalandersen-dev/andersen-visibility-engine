import { describe, expect, it } from "vitest";
import {
  opportunityBatchSchema,
  prepareOpportunityBatch,
  applyOpportunityBatch,
} from "./mcp-opportunity-batch";
import type { Opportunity, Project } from "./types";
const args = {
  projectId: "p",
  requestId: "batch-1",
  items: [{ title: "First" }, { title: "Second", source: "competitor" }],
};
const data = {
  projects: [{ id: "p", primaryLanguage: "Polish", targetAudience: "Owners" }, { id: "other" }],
  opportunities: [],
  preserve: { yes: true },
};
const prepare = (input: unknown = args) =>
  prepareOpportunityBatch(opportunityBatchSchema.parse(input));
describe("atomic assistant-authored topic batches", () => {
  it("adds the whole bounded batch with canonical non-live state and preserves unrelated data", async () => {
    const result = applyOpportunityBatch(data, await prepare());
    expect(result.data.preserve).toEqual(data.preserve);
    expect(result.result.opportunityIds).toHaveLength(2);
    const added = result.data.opportunities as Opportunity[];
    expect(added.map((o) => o.status)).toEqual(["captured", "captured"]);
    expect(added.map((o) => o.source)).toEqual(["mcp", "competitor"]);
    expect(added.every((o) => o.language === "Polish")).toBe(true);
    expect(data.opportunities).toHaveLength(0);
    expect((result.data.projects as Project[])[1]).toEqual(data.projects[1]);
  });
  it("returns identical IDs on replay and on revision-conflict callback retries", async () => {
    const prepared = await prepare();
    const first = applyOpportunityBatch(data, prepared);
    expect(applyOpportunityBatch(data, prepared)).toEqual(first);
    const replay = applyOpportunityBatch(first.data, await prepare());
    expect(replay.result).toMatchObject({
      deduped: true,
      opportunityIds: first.result.opportunityIds,
    });
    expect(replay.data).toBe(first.data);
  });
  it("rejects changed input under the same requestId without changing stored topics", async () => {
    const first = applyOpportunityBatch(data, await prepare());
    const changed = await prepare({ ...args, items: [{ title: "Changed" }] });
    expect(() => applyOpportunityBatch(first.data, changed)).toThrow("conflict");
    expect(first.data.opportunities).toHaveLength(2);
  });
  it.each([0, 1])(
    "does not resurrect a batch after the owner removes some or all topics (%s remain)",
    async (remaining) => {
      const first = applyOpportunityBatch(data, await prepare());
      const edited = {
        ...first.data,
        opportunities: (first.data.opportunities as Opportunity[]).slice(0, remaining),
      };
      const replay = await prepare();
      expect(() => applyOpportunityBatch(edited, replay)).toThrow("conflict");
    },
  );
  it("scopes receipts to a project, allowing the same request key in another project", async () => {
    const first = applyOpportunityBatch(data, await prepare());
    const next = applyOpportunityBatch(first.data, await prepare({ ...args, projectId: "other" }));
    expect(next.result.deduped).toBe(false);
    expect(next.data.opportunities).toHaveLength(4);
  });
  it("rejects a batch that cannot fit without partially appending it", async () => {
    const full = { ...data, opportunities: Array(999).fill({ id: "old", projectId: "other" }) };
    const prepared = await prepare();
    expect(() => applyOpportunityBatch(full, prepared)).toThrow("capacity");
    expect(full.opportunities).toHaveLength(999);
  });
  it("normalizes optional defaults and whitespace before comparing retries", async () => {
    const first = applyOpportunityBatch(
      data,
      await prepare({ ...args, items: [{ title: "First" }] }),
    );
    const retry = await prepare({
      requestId: "batch-1",
      items: [{ source: "mcp", priority: "Medium", contentType: "Blog Article", title: " First " }],
      projectId: "p",
    });
    expect(applyOpportunityBatch(first.data, retry).result.deduped).toBe(true);
  });
  it("does not reset a topic's later lifecycle on replay", async () => {
    const first = applyOpportunityBatch(data, await prepare());
    const edited = {
      ...first.data,
      opportunities: (first.data.opportunities as Opportunity[]).map((o) => ({
        ...o,
        status: "published" as const,
      })),
    };
    const replay = applyOpportunityBatch(edited, await prepare());
    expect(replay.result.status).toBe("stored");
    expect(
      (replay.data.opportunities as Opportunity[]).every((o) => o.status === "published"),
    ).toBe(true);
  });
  it("bounds replay receipts without pruning them and making old requests repeatable", async () => {
    const full = {
      ...data,
      projects: [
        {
          ...data.projects[0],
          mcpOpportunityBatches: Array.from({ length: 1000 }, (_, i) => ({
            requestId: String(i),
            fingerprint: "old",
            ids: [],
          })),
        },
      ],
    };
    const prepared = await prepare();
    expect(() => applyOpportunityBatch(full, prepared)).toThrow("capacity");
    expect(full.projects[0].mcpOpportunityBatches).toHaveLength(1000);
  });
  it("accepts exactly 25 valid topics and refuses a malformed existing collection", async () => {
    const prepared = await prepare({
      ...args,
      items: Array.from({ length: 25 }, (_, i) => ({ title: `Topic ${i}` })),
    });
    expect(applyOpportunityBatch(data, prepared).result.opportunityIds).toHaveLength(25);
    expect(() =>
      applyOpportunityBatch({ ...data, opportunities: { invalid: true } }, prepared),
    ).toThrow("conflict");
  });
  it("refuses an unknown project", async () => {
    const prepared = await prepare({ ...args, projectId: "missing" });
    expect(() => applyOpportunityBatch(data, prepared)).toThrow("not_found");
  });
  it.each(
    [[], Array(26).fill({ title: "Too many" }), [{ title: " ", status: "published" }]].map(
      (items) => ({ items }),
    ),
  )("rejects invalid size or forbidden fields", ({ items }) => {
    expect(opportunityBatchSchema.safeParse({ ...args, items }).success).toBe(false);
  });
});
