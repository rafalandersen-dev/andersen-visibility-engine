// CO regressions for the verified Synergy agent path (22 October 2026).
// A: transient 55P03 on the read-only project snapshot; B: bounded owner brief with
// brand/services/opportunity linkage; C: plan/proposal reply parsing; D: owner-only
// Search Console and AI readiness readers; E: existing-draft reuse.
import { describe, expect, it, vi } from "vitest";
import {
  runSpecialistTool,
  SNAPSHOT_READ_ATTEMPTS,
  type SpecialistToolContext,
  type SpecialistToolDeps,
} from "./milo-specialist-tools.server";
import {
  runConversationSpecialists,
  type SpecialistExecutorDeps,
} from "./milo-specialist-executor.server";
import { conversationEvent, conversationTurn, type ConversationTurn } from "./milo-conversation";
import { ModelResponseFormatError, parseModelJson, specialistPlan } from "./milo-specialist";
import {
  BRIEF_EVIDENCE_MAX_BYTES,
  READER_EVIDENCE_MAX_BYTES,
  aiAdviceEvidence,
  knowledgeEvidence,
  projectBriefEvidence,
} from "./milo-specialist-context";
import { TeamAdmissionBusyError } from "./project-team-admission";

const owner = "00000000-0000-4000-8000-0000000000a1",
  member = "00000000-0000-4000-8000-0000000000a2",
  operationId = "00000000-0000-4000-8000-0000000000a3",
  jobId = "00000000-0000-4000-8000-0000000000a4",
  receiptId = "00000000-0000-4000-8000-0000000000a5",
  conversationId = "00000000-0000-4000-8000-0000000000a6",
  attemptId = "00000000-0000-4000-8000-0000000000a7";

/** Real-shape Synergy fixture: 53 saved drafts, 15 saved offers, 30 opportunities
 * (10 linked to drafts, 2 deleted/archived), plus another project's data. */
function synergyWorkspace() {
  const drafts = Array.from({ length: 53 }, (_, i) => ({
    id: `d${String(i).padStart(2, "0")}`,
    projectId: "synergy",
    title: `Guide ${i}: Massage i Limhamn och återhämtning för vardagen`,
    status: i % 4 ? "Draft" : "Approved",
    updatedAt: new Date(Date.UTC(2026, 8, 1 + i)).toISOString(),
    ...(i < 10 ? { opportunityId: `o${i}` } : {}),
    markdown: "Body",
    publishSecret: "fixture-private",
  }));
  const opportunities = Array.from({ length: 30 }, (_, i) => ({
    id: `o${i}`,
    projectId: "synergy",
    title: `Möjlighet ${i}: Svensk klassisk massage för stressade småbarnsföräldrar`,
    language: "Swedish",
    status: i % 3 ? "captured" : "prioritized",
    priority: i % 2 ? "High" : "Medium",
    ...(i === 28 ? { deletedAt: "2026-10-01" } : {}),
    ...(i === 29 ? { archivedAt: "2026-10-01" } : {}),
  }));
  const offers = Array.from({ length: 15 }, (_, i) => ({
    name: `Behandling ${i + 1}`,
    type: "service",
    priority: i < 5 ? "high" : "medium",
    description:
      "Lugn, personlig behandling i studion i Limhamn med fokus på återhämtning, rörlighet och välbefinnande.",
    url: `https://synergymassage.se/behandlingar/${i + 1}`,
  }));
  return {
    rev: 7,
    data: {
      projects: [
        {
          id: "synergy",
          name: "Synergy Massage",
          publishSecret: "fixture-private",
          gscOAuth: { googleAccountEmail: "private@example.test" },
          brandIntelligence: {
            voice: { tone: "Lugn och personlig", wordsToAvoid: ["mirakel"] },
            claims: { forbiddenClaims: ["Botar sjukdomar"], requiredCaveats: ["Ej vård"] },
            offers: { primaryOffers: offers.slice(0, 5), secondaryOffers: offers.slice(5) },
            ctas: { primaryCtaLabel: "Boka tid", primaryCtaUrl: "https://synergymassage.se/book" },
          },
          gscLite: {
            imports: [
              {
                id: "g-old",
                importedAt: "2026-07-01T10:00:00Z",
                integrityVersion: 2,
                source: "manual_csv",
                importType: "queries",
                rows: [
                  {
                    type: "query",
                    query: "massage limhamn",
                    clicks: 4,
                    impressions: 90,
                    ctr: 4.4,
                    position: 7.1,
                  },
                ],
                summary: {
                  totalClicks: 4,
                  totalImpressions: 90,
                  averageCtr: 4.4,
                  averagePosition: 7.1,
                  rowCount: 1,
                },
              },
              {
                id: "g-new",
                importedAt: "2026-10-01T10:00:00Z",
                integrityVersion: 2,
                aggregate: { clicks: 500, impressions: 20000, ctr: 2.5, position: 11 },
                source: "api",
                importType: "pages",
                selectedSiteUrl: "sc-domain:synergymassage.se",
                dateRange: { start: "2026-09-01", end: "2026-09-28" },
                rows: Array.from({ length: 900 }, (_, i) => ({
                  type: "page",
                  page: `https://synergymassage.se/guides/${i}`,
                  path: `/guides/${i}`,
                  clicks: i % 7 === 0 ? null : 900 - i,
                  impressions: 2000 - i,
                  ctr: null,
                  position: 12.5,
                })),
                // Deliberately wrong cached summary: the reader must recompute, never trust it.
                summary: {
                  totalClicks: 999999,
                  totalImpressions: 1,
                  averageCtr: 99,
                  averagePosition: 1,
                  rowCount: 1,
                },
                truncated: true,
              },
            ],
          },
        },
        {
          id: "other",
          name: "Other client",
          brandIntelligence: {
            offers: {
              primaryOffers: [{ name: "Foreign offer", type: "service", priority: "high" }],
            },
          },
          gscLite: {
            imports: [
              {
                id: "foreign-gsc",
                importedAt: "2026-10-20",
                source: "api",
                importType: "queries",
                rows: [],
                summary: {
                  totalClicks: 1,
                  totalImpressions: 1,
                  averageCtr: 1,
                  averagePosition: 1,
                  rowCount: 0,
                },
              },
            ],
          },
        },
      ],
      content: [
        ...drafts,
        {
          id: "foreign-draft",
          projectId: "other",
          title: "Foreign",
          opportunityId: "o11",
          status: "Draft",
        },
      ],
      opportunities: [
        ...opportunities,
        { id: "foreign-opp", projectId: "other", title: "Foreign opportunity", status: "captured" },
      ],
      services: [
        ...Array.from({ length: 6 }, (_, i) => ({
          id: `s${i}`,
          projectId: "synergy",
          name: `Tjänst ${i}`,
          kind: "Service",
          description: "Klassisk massage och återhämtning.",
          priority: "High",
          targetAudience: "Vuxna",
        })),
        { id: "foreign-s", projectId: "other", name: "Foreign service" },
      ],
      aiVisibilityAnalyses: [
        {
          id: "ai-old",
          projectId: "synergy",
          createdAt: "2026-06-01",
          overallAiVisibilityScore: 10,
          summary: "Old",
          visibilityGaps: [],
        },
        {
          id: "ai-new",
          projectId: "synergy",
          createdAt: "2026-07-23T09:00:00Z",
          overallAiVisibilityScore: 41,
          promptCoverageScore: 30,
          answerReadinessScore: 50,
          localAiReadinessScore: 60,
          trustCitationScore: 20,
          contentGapScore: 55,
          authorityGapScore: 70,
          summary: "Readiness estimate from saved site content.",
          topAiVisibilityActions: ["Add FAQ about prices"],
          visibilityGaps: Array.from({ length: 14 }, (_, i) => ({
            id: `gap${i}`,
            title: `Gap ${i}`,
            category: "content",
            priority: "High",
            recommendation: "Describe the treatment in plain Swedish.",
          })),
        },
        {
          id: "ai-foreign",
          projectId: "other",
          createdAt: "2026-10-21",
          overallAiVisibilityScore: 99,
          summary: "Foreign advice",
          visibilityGaps: [],
        },
      ],
    },
    drafts,
  };
}

type Snapshot = { error?: { code: string } | null };
function toolSetup(who = owner, snapshotFailures: Snapshot[] = []) {
  const ws = synergyWorkspace();
  const controller = new AbortController();
  const context: SpecialistToolContext = {
    actorId: who,
    target: { ownerId: owner, projectId: "synergy" },
    role: "research",
    operationId,
    jobId,
    signal: controller.signal,
    beforeDispatch: vi.fn(async () => {}),
    allowDraftGeneration: true,
  };
  const failures = [...snapshotFailures];
  const rpc = vi.fn(async (name: string, params: Record<string, unknown>) => {
    if (name !== "read_project_team_snapshot") throw new Error(`unexpected ${name}`);
    const failure = failures.shift();
    if (failure?.error) return { data: null, error: failure.error };
    return {
      data: {
        actorId: params.p_actor,
        ownerId: owner,
        projectId: "synergy",
        canEdit: true,
        draftHash: null,
        membershipRevision: 1,
        workspaceRevision: 7,
        project: {
          id: "synergy",
          name: "Synergy Massage",
          description: "Massage i Limhamn",
          primaryLanguage: "Swedish",
          publishSecret: "fixture-private",
        },
        drafts: ws.drafts.map(({ id, projectId, title, status, updatedAt }) => ({
          id,
          projectId,
          title,
          status,
          updatedAt,
        })),
        remaining: 0,
        draft: null,
      },
      error: null,
    };
  });
  const generate = vi.fn(
    async (_who: string, _data: unknown, metering: { beforeDispatch: () => Promise<void> }) => {
      await metering.beforeDispatch();
      return { generationReceiptId: receiptId, resultId: receiptId };
    },
  );
  const knowledge = vi.fn(async () => ({
    context:
      "Editorial lesson v1: flag unknown or conflicting offer facts instead of inventing them.",
    references: [{ recordId: "k1" }],
    conflicts: [],
    omitted: 0,
    sourceDependencies: [],
  }));
  const deps = {
    rpc,
    workspace: vi.fn(async () => ws),
    knowledge,
    generate,
  } as unknown as SpecialistToolDeps;
  return { context, deps, rpc, generate, controller, ws };
}
const busy = { error: { code: "55P03" } };
const snapshotCalls = (rpc: ReturnType<typeof toolSetup>["rpc"]) =>
  rpc.mock.calls.filter(([name]) => name === "read_project_team_snapshot");

describe("A — transient 55P03 on the read-only project snapshot", () => {
  it("retries only the clean read, re-authorizing the same actor each time", async () => {
    const h = toolSetup(owner, [busy, busy]);
    const result = await runSpecialistTool({ name: "project_brief" }, h.context, h.deps);
    expect(result.state).toBe("completed");
    const calls = snapshotCalls(h.rpc);
    expect(calls).toHaveLength(3);
    for (const [, params] of calls)
      expect(params).toMatchObject({ p_actor: owner, p_project: "synergy" });
  });
  it("stops after the bounded attempts with the typed busy error, never another tool step", async () => {
    const h = toolSetup(owner, Array(SNAPSHOT_READ_ATTEMPTS + 2).fill(busy));
    await expect(
      runSpecialistTool({ name: "project_brief" }, h.context, h.deps),
    ).rejects.toBeInstanceOf(TeamAdmissionBusyError);
    expect(snapshotCalls(h.rpc)).toHaveLength(SNAPSHOT_READ_ATTEMPTS);
    expect(h.context.beforeDispatch).not.toHaveBeenCalled();
  });
  it("never retries a non-contention refusal such as revoked access", async () => {
    const h = toolSetup(member, [{ error: { code: "P0001" } }]);
    await expect(runSpecialistTool({ name: "project_brief" }, h.context, h.deps)).rejects.toThrow(
      "Project access could not be confirmed",
    );
    expect(snapshotCalls(h.rpc)).toHaveLength(1);
  });
  it("cancels a pending backoff promptly when the turn deadline aborts", async () => {
    const h = toolSetup(owner, Array(10).fill(busy));
    const run = runSpecialistTool({ name: "project_brief" }, h.context, h.deps);
    setTimeout(() => h.controller.abort(new Error("milo_execution_deadline")), 20);
    await expect(run).rejects.toThrow("milo_execution_deadline");
    expect(snapshotCalls(h.rpc).length).toBeLessThan(SNAPSHOT_READ_ATTEMPTS);
  });

  it("reproduces Brand → Research with contention on Research's project read: no paid step repeats", async () => {
    // Snapshot reads in order: executor brief (1), Brand project_knowledge (2),
    // Research project_brief (3 → busy once, then succeeds).
    const tools = toolSetup(owner, [{}, {}, busy]);
    let stored: ConversationTurn = {
      turnId: jobId,
      ordinal: 1,
      body: "Brand och Research: bedöm beredskapen från befintliga data.",
      locale: "sv",
      state: "running",
      events: [],
      createdAt: "2026-10-22T18:06:01Z",
      updatedAt: "2026-10-22T18:06:01Z",
    };
    const target = { ownerId: owner, projectId: "synergy", conversationId, turnId: jobId };
    const responses = [
      "```json\n" +
        JSON.stringify({
          handoff: "Brand, then Research.",
          assignments: [
            {
              role: "brand",
              task: "Read the editorial lesson",
              tools: [{ name: "project_knowledge" }],
            },
            {
              role: "research",
              task: "Summarize saved context",
              tools: [{ name: "project_brief" }],
            },
          ],
        }) +
        "\n```",
      "Brand: the saved lesson says to flag unknown offer facts.",
      "Research: saved context reviewed; no fresh crawl.",
    ];
    const model = vi.fn(
      async (input: { prompt: string; context: { beforeDispatch: () => Promise<void> } }) => {
        await input.context.beforeDispatch();
        return responses.shift()!;
      },
    );
    const deps = {
      claim: vi.fn(async () => ({ acquired: true, attemptId, turn: structuredClone(stored) })),
      read: vi.fn(async () => ({
        ...target,
        actorId: owner,
        title: "Synergy",
        turnCount: 1,
        turns: [structuredClone(stored)],
        nextAfter: 1,
        hasMore: false,
      })),
      assert: vi.fn(async () => {}),
      advance: vi.fn(
        async (
          _a: unknown,
          _t: unknown,
          update: { expected: number; events: unknown[]; state: ConversationTurn["state"] },
        ) => {
          if (update.expected !== stored.events.length) throw new Error("conflict");
          stored = conversationTurn.parse({
            ...stored,
            events: [...stored.events, ...update.events],
            state: update.state,
          });
          return structuredClone(stored);
        },
      ),
      tool: (input: Parameters<typeof runSpecialistTool>[0], context: SpecialistToolContext) =>
        runSpecialistTool(input, context, tools.deps),
      model,
      diagnostic: vi.fn(async () => {}),
    } as unknown as SpecialistExecutorDeps;
    const turn = await runConversationSpecialists(owner, target, deps);
    expect(turn.state).toBe("completed");
    expect(model).toHaveBeenCalledTimes(3); // plan + Brand + Research, each exactly once
    // D3 prompt contract: performed work is tied to completed receipts, consented
    // checks are not denied, and unoffered actions stay unclaimable.
    const prompt = model.mock.calls[0][0].prompt;
    expect(prompt).toContain("ONLY when this turn has a completed receipt for that exact tool");
    expect(prompt).not.toContain("fetched sources: these actions are not offered");
    expect(prompt).toMatch(
      /publishing or approving publication, ordering placements and checking live rankings are not offered here/,
    );
    expect(snapshotCalls(tools.rpc)).toHaveLength(4); // one bounded re-read only
    expect(turn.events.filter((e) => e.kind === "assistant").map((e) => e.role)).toEqual([
      "brand",
      "research",
    ]);
    expect(
      turn.events.filter((e) => e.kind === "tool" && e.code === "tool_result").map((e) => e.tool),
    ).toEqual(["project_brief", "project_knowledge", "project_brief"]);
  });
});

type BriefView = {
  brand: {
    provenance: string;
    claims: { forbidden: string[] };
    offers: unknown[];
    omittedOffers: number;
  };
  services: unknown[];
  opportunities: Array<{ id: string; existingDraft: { id: string } | null }>;
  omittedOpportunities: number;
  drafts: Array<{ id: string }>;
  omittedDrafts: number;
};
type GscView = {
  omittedImports: number;
  imports: Array<
    {
      id: string;
      numericBasisUnavailable?: string;
      topRowsByClicks: Array<Record<string, unknown>>;
      omittedRows: number;
    } & Record<string, unknown>
  >;
};
type AdviceView = {
  estimatedScores: { overall: number | null };
  limitations: string;
  gaps: unknown[];
  omittedGaps: number;
};
const content = <T = Record<string, unknown>>(evidence: string) =>
  JSON.parse(evidence).content as T;

describe("B — bounded owner brief and brand context", () => {
  it("keeps brand, services and usable linked opportunities for 53 drafts / 15 offers, never torn JSON", async () => {
    const h = toolSetup(owner);
    const result = await runSpecialistTool({ name: "project_brief" }, h.context, h.deps);
    // The evidence must be a complete JSON document within the event ceiling.
    expect(() =>
      conversationEvent.parse({
        kind: "tool",
        role: "lead",
        text: result.evidence,
        tool: "project_brief",
        state: "completed",
      }),
    ).not.toThrow();
    expect(new TextEncoder().encode(result.evidence).byteLength).toBeLessThanOrEqual(10000);
    const brief = content<BriefView>(result.evidence);
    expect(brief.brand.provenance).toBe("owner_saved_brand_intelligence");
    expect(brief.brand.claims.forbidden).toEqual(["Botar sjukdomar"]);
    expect(brief.brand.offers.length + brief.brand.omittedOffers).toBe(15);
    expect(brief.brand.offers.length).toBeGreaterThanOrEqual(10);
    expect(brief.services).toHaveLength(6);
    // Open opportunities survive; deleted/archived are excluded; counts reconcile.
    expect(brief.opportunities.length).toBeGreaterThanOrEqual(12);
    expect(brief.opportunities.length + brief.omittedOpportunities).toBe(28);
    expect(brief.opportunities.find((o) => o.id === "o3")?.existingDraft).toMatchObject({
      id: "d03",
    });
    expect(brief.opportunities.find((o) => o.id === "o20")?.existingDraft).toBeNull();
    // Drafts shrink first, newest first, with an explicit omitted count.
    expect(brief.drafts.length + brief.omittedDrafts).toBe(53);
    if (brief.drafts.length) expect(brief.drafts[0].id).toBe("d52");
    // Never another project's data or private connector/publishing fields.
    expect(result.evidence).not.toMatch(/fixture-private|private@example|Foreign|foreign/);
  });
  it("keeps the collaborator brief to the safe project projection and drafts (D07)", async () => {
    const h = toolSetup(member);
    const result = await runSpecialistTool(
      { name: "project_brief" },
      { ...h.context, role: "seo" },
      h.deps,
    );
    const brief = content(result.evidence);
    expect(Object.keys(brief).sort()).toEqual([
      "drafts",
      "fetchedWebsite",
      "omittedDrafts",
      "project",
      "shortenedFields",
      "source",
    ]);
    expect(result.evidence).not.toMatch(/Behandling|Tjänst|Möjlighet|fixture-private/);
  });
  it("labels owner knowledge brand context by provenance", async () => {
    const h = toolSetup(owner);
    h.deps.knowledge = vi.fn(async () => ({
      context: "Accepted",
      references: [],
      conflicts: [],
      omitted: 0,
      sourceDependencies: [],
      brandIntelligence: { voice: { tone: "Lugn" } },
    })) as unknown as SpecialistToolDeps["knowledge"];
    const result = await runSpecialistTool(
      { name: "project_knowledge" },
      { ...h.context, role: "brand" },
      h.deps,
    );
    expect(content(result.evidence).brand).toMatchObject({
      provenance: "accepted_knowledge_brand_records",
      voice: { tone: "Lugn" },
    });
  });
});

describe("C — bounded plan/proposal reply parsing", () => {
  const plan = { handoff: "Lead", assignments: [{ role: "lead", task: "Answer", tools: [] }] };
  it.each([
    ["bare", JSON.stringify(plan)],
    ["fenced", "```json\n" + JSON.stringify(plan) + "\n```"],
    ["unlabelled fence", "```\n" + JSON.stringify(plan, null, 2) + "\n```"],
    ["surrounding prose", "Here is the plan:\n" + JSON.stringify(plan) + "\nDone."],
    ["braces inside strings", JSON.stringify({ ...plan, handoff: 'Use {curly} and "quotes"' })],
  ])("accepts one %s object", (_label, text) => {
    expect(parseModelJson(text, specialistPlan).assignments[0].role).toBe("lead");
  });
  it.each([
    ["two objects", JSON.stringify(plan) + JSON.stringify(plan)],
    ["unbalanced", "{" + JSON.stringify(plan)],
    ["no object", "I cannot plan this."],
    ["missing required field", JSON.stringify({ assignments: plan.assignments })],
    ["oversized", JSON.stringify({ ...plan, handoff: "x".repeat(70000) })],
    ["prose with a stray brace", "Plan {draft} " + JSON.stringify(plan)],
  ])("refuses %s deterministically", (_label, text) => {
    expect(() => parseModelJson(text, specialistPlan)).toThrow(ModelResponseFormatError);
  });
});

describe("D — owner-only saved Search Console and AI readiness readers", () => {
  it("returns this project's newest imports, bounded, with nulls preserved and no fetch", async () => {
    const h = toolSetup(owner);
    const result = await runSpecialistTool(
      { name: "search_console_evidence" },
      { ...h.context, role: "seo" },
      h.deps,
    );
    expect(result.reference).toEqual({ kind: "search_console", id: "synergy" });
    expect(new TextEncoder().encode(result.evidence).byteLength).toBeLessThanOrEqual(6000);
    const data = content<GscView>(result.evidence);
    expect(data).toMatchObject({
      source: "saved_search_console_imports",
      fetched: false,
      omittedImports: 0,
    });
    expect(data.imports.map((i) => i.id)).toEqual(["g-new", "g-old"]);
    const latest = data.imports[0];
    expect(latest).toMatchObject({
      source: "api_sync",
      property: "sc-domain:synergymassage.se",
      sourceTruncated: true,
      basis: "aggregate",
    });
    expect(latest.summary).toEqual({
      clicks: 500,
      impressions: 20000,
      averageCtr: 2.5,
      averagePosition: 11,
      savedRows: 900,
    });
    expect(result.evidence).not.toMatch(/999999/);
    expect(latest.topRowsByClicks[0]).toMatchObject({
      page: "/guides/1",
      clicks: 899,
      ctr: null,
      position: 12.5,
    });
    expect(latest.topRowsByClicks.length + latest.omittedRows).toBe(900);
    expect(result.evidence).not.toMatch(/foreign|private@example|fixture-private/);
  });
  it("withholds every metric, row and count of legacy imports, as Analytics does", async () => {
    const h = toolSetup(owner);
    // Synergy's five saved imports are legacy (no integrityVersion), dated 6–10 September.
    (h.ws.data.projects[0] as Record<string, unknown>).gscLite = {
      imports: Array.from({ length: 5 }, (_, i) => ({
        id: `legacy-${i}`,
        importedAt:
          ["2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10"][i] + "T08:00:00Z",
        source: "manual_csv",
        importType: "queries",
        rows: [
          {
            type: "query",
            query: `fråga ${i}`,
            clicks: 4321,
            impressions: 98765,
            ctr: 4.37,
            position: 3.3,
          },
        ],
        summary: {
          totalClicks: 4321,
          totalImpressions: 98765,
          averageCtr: 4.37,
          averagePosition: 3.3,
          rowCount: 1,
        },
      })),
    };
    const result = await runSpecialistTool(
      { name: "search_console_evidence" },
      { ...h.context, role: "seo" },
      h.deps,
    );
    const data = content<GscView>(result.evidence);
    expect(data.omittedImports).toBe(2);
    for (const item of data.imports) {
      expect(item).toMatchObject({
        basis: "legacy",
        summary: {
          clicks: null,
          impressions: null,
          averageCtr: null,
          averagePosition: null,
          savedRows: null,
        },
        topRowsByClicks: [],
        omittedRows: 0,
      });
      expect(item.numericBasisUnavailable).toMatch(/cannot be recovered reliably/);
    }
    expect(result.evidence).not.toMatch(/4321|98765|4\.37|fråga/);
  });
  it("returns the latest saved AI readiness advice, labelled as estimates", async () => {
    const h = toolSetup(owner);
    const result = await runSpecialistTool(
      { name: "saved_ai_advice" },
      { ...h.context, role: "ai" },
      h.deps,
    );
    const data = content<AdviceView>(result.evidence);
    expect(data).toMatchObject({
      source: "saved_ai_readiness_advice",
      id: "ai-new",
      createdAt: "2026-07-23T09:00:00Z",
    });
    expect(data.estimatedScores.overall).toBe(41);
    expect(data.limitations).toMatch(/Not observed/);
    expect(data.gaps.length + data.omittedGaps).toBe(14);
    expect(result.evidence).not.toMatch(/Foreign advice/);
  });
  it("keeps both readers owner-only and inside their roles, without any read", async () => {
    for (const [who, role, tool] of [
      [member, "seo", "search_console_evidence"],
      [member, "ai", "saved_ai_advice"],
      [owner, "ai", "search_console_evidence"],
      [owner, "seo", "saved_ai_advice"],
      [owner, "brand", "search_console_evidence"],
    ] as const) {
      const h = toolSetup(who);
      const result = await runSpecialistTool({ name: tool }, { ...h.context, role }, h.deps);
      expect(result.state).toBe("unavailable");
      expect(h.rpc).not.toHaveBeenCalled();
    }
  });
});

describe("E — existing-draft reuse instead of a duplicate generation", () => {
  it("returns the saved draft for a linked opportunity without generating or charging", async () => {
    const h = toolSetup(owner);
    const result = await runSpecialistTool(
      { name: "draft_generation", opportunityId: "o3", assetType: "article" },
      { ...h.context, role: "content" },
      h.deps,
    );
    expect(h.generate).not.toHaveBeenCalled();
    expect(result.reference).toEqual({ kind: "draft", id: "d03" });
    expect(JSON.parse(JSON.parse(result.evidence).content)).toMatchObject({
      existingDraft: true,
      generated: false,
      draftId: "d03",
    });
  });
  it("links through the opportunity's currentContentAssetId too", async () => {
    const h = toolSetup(owner);
    (h.ws.data.opportunities[20] as Record<string, unknown>).currentContentAssetId = "d40";
    const result = await runSpecialistTool(
      { name: "draft_generation", opportunityId: "o20", assetType: "faq" },
      { ...h.context, role: "content" },
      h.deps,
    );
    expect(h.generate).not.toHaveBeenCalled();
    expect(result.reference).toEqual({ kind: "draft", id: "d40" });
  });
  it("still generates once for an opportunity without a draft; another project's draft never counts", async () => {
    const h = toolSetup(owner);
    const result = await runSpecialistTool(
      { name: "draft_generation", opportunityId: "o11", assetType: "article" },
      { ...h.context, role: "content" },
      h.deps,
    );
    expect(h.generate).toHaveBeenCalledOnce();
    expect(result.reference).toEqual({ kind: "generation", id: receiptId });
  });
  it("keeps deleted and archived opportunities unavailable", async () => {
    for (const opportunityId of ["o28", "o29"]) {
      const h = toolSetup(owner);
      await expect(
        runSpecialistTool(
          { name: "draft_generation", opportunityId, assetType: "article" },
          { ...h.context, role: "content" },
          h.deps,
        ),
      ).rejects.toThrow("Generation opportunity unavailable.");
      expect(h.generate).not.toHaveBeenCalled();
    }
  });
});

// Review corrections (22 October): truthful completeness of capped brand rules,
// current-draft selection independent of workspace order, and listener cleanup.
type BrandView = {
  claims: { forbidden: string[]; requiredCaveats: string[] };
  voice: { wordsToUse: string[] };
  omittedBrandEntries: number;
  shortenedBrandText: number;
  claimRulesComplete: boolean;
};
const ownerBrand = (h: ReturnType<typeof toolSetup>) =>
  (h.ws.data.projects[0] as Record<string, unknown>).brandIntelligence as Record<string, unknown>;
async function briefWith(h: ReturnType<typeof toolSetup>) {
  const result = await runSpecialistTool({ name: "project_brief" }, h.context, h.deps);
  const parsed = JSON.parse(result.evidence) as {
    partial: boolean;
    content: { brand: BrandView; opportunities: BriefView["opportunities"] };
  };
  return { partial: parsed.partial, brand: parsed.content.brand, brief: parsed.content };
}
/** A small owner workspace, so the size-fit loop never runs. */
function smallOwner() {
  const h = toolSetup(owner);
  h.ws.data.content = [];
  h.ws.data.opportunities = [];
  h.ws.data.services = [];
  h.ws.drafts.length = 0;
  return h;
}

describe("review correction — capped brand rules are reported, never presented as complete", () => {
  it("keeps all 12 forbidden claims (more than the old cap of 10) as a complete rule set", async () => {
    const h = smallOwner();
    const forbidden = Array.from({ length: 12 }, (_, i) => `Förbjudet påstående ${i + 1}`);
    ownerBrand(h).claims = { forbiddenClaims: forbidden, requiredCaveats: ["Ej vård"] };
    const { brand, partial } = await briefWith(h);
    expect(brand.claims.forbidden).toEqual(forbidden);
    expect(brand).toMatchObject({
      claimRulesComplete: true,
      omittedBrandEntries: 0,
      shortenedBrandText: 0,
    });
    expect(partial).toBe(false);
  });
  it("flags an over-cap rule list truthfully even when the fit loop never runs", async () => {
    const h = smallOwner();
    ownerBrand(h).claims = {
      forbiddenClaims: Array.from({ length: 45 }, (_, i) => `R${i}`),
    };
    const { brand, partial } = await briefWith(h);
    expect(brand.claims.forbidden).toHaveLength(40);
    expect(brand.omittedBrandEntries).toBe(5);
    expect(brand.claimRulesComplete).toBe(false);
    expect(partial).toBe(true);
  });
  it("counts a shortened rule text and a capped style list, separately from rule completeness", async () => {
    const long = "Påstå aldrig medicinsk effekt. ".repeat(20);
    const shortRule = smallOwner();
    ownerBrand(shortRule).claims = { forbiddenClaims: [long] };
    const ruleCase = await briefWith(shortRule);
    expect(ruleCase.brand.claims.forbidden[0].length).toBeLessThan(long.trim().length);
    expect(ruleCase.brand).toMatchObject({ shortenedBrandText: 1, claimRulesComplete: false });
    expect(ruleCase.partial).toBe(true);

    const styleCap = smallOwner();
    ownerBrand(styleCap).voice = { wordsToUse: Array.from({ length: 15 }, (_, i) => `ord${i}`) };
    const styleCase = await briefWith(styleCap);
    expect(styleCase.brand.voice.wordsToUse).toHaveLength(12);
    expect(styleCase.brand).toMatchObject({ omittedBrandEntries: 3, claimRulesComplete: true });
    expect(styleCase.partial).toBe(true);
  });
  it("marks owner knowledge brand rules incomplete the same way", async () => {
    const h = smallOwner();
    h.deps.knowledge = vi.fn(async () => ({
      context: "Accepted",
      references: [],
      conflicts: [],
      omitted: 0,
      sourceDependencies: [],
      brandIntelligence: {
        claims: { requiredCaveats: Array.from({ length: 41 }, (_, i) => `C${i}`) },
      },
    })) as unknown as SpecialistToolDeps["knowledge"];
    const result = await runSpecialistTool(
      { name: "project_knowledge" },
      { ...h.context, role: "brand" },
      h.deps,
    );
    const parsed = JSON.parse(result.evidence) as {
      partial: boolean;
      content: { brand: BrandView };
    };
    expect(parsed.content.brand.claims.requiredCaveats).toHaveLength(40);
    expect(parsed.content.brand.claimRulesComplete).toBe(false);
    expect(parsed.partial).toBe(true);
  });
});

describe("review correction — the current draft wins regardless of workspace order", () => {
  function staleFirst(currentId?: string) {
    const h = toolSetup(owner);
    const linked = (id: string, updatedAt: string) => ({
      id,
      projectId: "synergy",
      title: id,
      status: "Draft",
      opportunityId: "o15",
      updatedAt,
    });
    h.ws.data.content = [
      linked("old", "2026-10-21T10:00:00Z"),
      linked("current", "2026-09-01T10:00:00Z"),
      linked("bad-time", "not a date"),
      { ...linked("foreign-current", "2026-10-22T10:00:00Z"), projectId: "other" },
    ] as unknown as typeof h.ws.data.content;
    if (currentId)
      (h.ws.data.opportunities[15] as Record<string, unknown>).currentContentAssetId = currentId;
    return h;
  }
  it("returns the explicit currentContentAssetId draft even when an older one is listed first", async () => {
    const h = staleFirst("current");
    const result = await runSpecialistTool(
      { name: "draft_generation", opportunityId: "o15", assetType: "article" },
      { ...h.context, role: "content" },
      h.deps,
    );
    expect(h.generate).not.toHaveBeenCalled();
    expect(result.reference).toEqual({ kind: "draft", id: "current" });
    const { brief } = await briefWith(staleFirst("current"));
    expect(brief.opportunities.find((o) => o.id === "o15")?.existingDraft?.id).toBe("current");
  });
  it("falls back to the newest valid linked draft in the same project, never another project", async () => {
    for (const currentId of [undefined, "foreign-current", "deleted-draft"]) {
      const h = staleFirst(currentId);
      const result = await runSpecialistTool(
        { name: "draft_generation", opportunityId: "o15", assetType: "article" },
        { ...h.context, role: "content" },
        h.deps,
      );
      expect(h.generate).not.toHaveBeenCalled();
      expect(result.reference).toEqual({ kind: "draft", id: "old" });
    }
  });
});

describe("review correction — busy-read backoff leaves no abort listeners behind", () => {
  it("removes each backoff listener when its timer fires", async () => {
    const h = toolSetup(owner, [busy, busy, busy]);
    const added = vi.spyOn(h.context.signal, "addEventListener");
    const removed = vi.spyOn(h.context.signal, "removeEventListener");
    const result = await runSpecialistTool({ name: "project_brief" }, h.context, h.deps);
    expect(result.state).toBe("completed");
    const aborts = (calls: unknown[][]) => calls.filter(([type]) => type === "abort").length;
    expect(aborts(added.mock.calls)).toBe(3);
    expect(aborts(removed.mock.calls)).toBe(3);
  });
});

// Final bound correction: the byte limit holds for the FINAL serialized evidence,
// including JSON escaping of fixed free text (quotes double, control characters
// become six-byte \u escapes), with every shortening flagged.
const size = (evidence: string) => new TextEncoder().encode(evidence).byteLength;
const parsed = (evidence: string) =>
  JSON.parse(evidence) as { partial: boolean; content: Record<string, unknown> };

describe("final bound — escaping-heavy fixed text still fits, truthfully flagged", () => {
  it("fits the reviewed escaping-heavy knowledge input instead of throwing", () => {
    const evidence = knowledgeEvidence({
      context: '"'.repeat(3000),
      references: [],
      conflicts: [],
      omitted: [],
      sourceDependencies: [],
      brandIntelligence: {
        voice: { tone: "a".repeat(300), styleNotes: "a".repeat(500) },
        ctas: {
          primaryCtaLabel: "a".repeat(120),
          primaryCtaUrl: "a".repeat(300),
          secondaryCtaLabel: "a".repeat(120),
          secondaryCtaUrl: "a".repeat(300),
        },
      },
    });
    expect(size(evidence)).toBeLessThanOrEqual(BRIEF_EVIDENCE_MAX_BYTES);
    const { partial, content: c } = parsed(evidence);
    expect(partial).toBe(true);
    expect(c.recordsPartial).toBe(true);
    // Brand text survives intact when shrinking the escaped records is enough.
    expect(c.brand).toMatchObject({
      voice: { tone: "a".repeat(300), styleNotes: "a".repeat(500) },
      claimRulesComplete: true,
    });
  });
  it("shrinks escaping-heavy project and brand text before any claim rule, and counts it", () => {
    const control = "\u0001".repeat(1200);
    const quotes = '"'.repeat(500);
    const forbidden = Array.from({ length: 5 }, (_, i) => `Förbjudet ${i}`);
    const evidence = projectBriefEvidence({
      project: { id: "synergy", name: quotes, businessName: quotes, description: control },
      drafts: [],
      omittedDrafts: 0,
      owner: {
        brand: {
          voice: { tone: quotes, styleNotes: quotes },
          claims: { forbiddenClaims: forbidden },
          ctas: { primaryCtaLabel: quotes, primaryCtaUrl: quotes, secondaryCtaUrl: quotes },
        },
        services: [],
        opportunities: [],
        content: [],
      },
    });
    expect(size(evidence)).toBeLessThanOrEqual(BRIEF_EVIDENCE_MAX_BYTES);
    const { partial, content: c } = parsed(evidence);
    const brand = c.brand as BrandView;
    expect(partial).toBe(true);
    expect(brand.claims.forbidden).toEqual(forbidden);
    expect(brand.claimRulesComplete).toBe(true);
    expect((c.shortenedFields as number) + brand.shortenedBrandText).toBeGreaterThan(0);
  });
  it("trims escaping-heavy claim rules only last and marks the rule set incomplete", () => {
    const evidence = projectBriefEvidence({
      project: { id: "synergy", name: "Synergy" },
      drafts: [],
      omittedDrafts: 0,
      owner: {
        brand: { claims: { forbiddenClaims: Array.from({ length: 40 }, () => '"'.repeat(300)) } },
        services: [],
        opportunities: [],
        content: [],
      },
    });
    expect(size(evidence)).toBeLessThanOrEqual(BRIEF_EVIDENCE_MAX_BYTES);
    const { partial, content: c } = parsed(evidence);
    const brand = c.brand as BrandView;
    expect(partial).toBe(true);
    expect(brand.claims.forbidden.length).toBeLessThan(40);
    expect(brand.claimRulesComplete).toBe(false);
  });
  it("keeps escaping-heavy AI advice and the collaborator brief within their bounds", () => {
    const advice = aiAdviceEvidence(
      [
        {
          id: "ai",
          projectId: "synergy",
          createdAt: "2026-07-23",
          summary: "\u0001".repeat(1200),
          topAiVisibilityActions: Array.from({ length: 8 }, () => '"'.repeat(300)),
          visibilityGaps: [],
        },
      ],
      "synergy",
    );
    expect(size(advice)).toBeLessThanOrEqual(READER_EVIDENCE_MAX_BYTES);
    expect(parsed(advice).partial).toBe(true);

    const brief = projectBriefEvidence({
      project: { id: "synergy", name: "Synergy", description: "\u0001".repeat(1200) },
      drafts: Array.from({ length: 30 }, (_, i) => ({
        id: `d${i}`,
        title: '"'.repeat(200),
        status: "Draft",
        updatedAt: "2026-10-01",
      })),
      omittedDrafts: 0,
    });
    expect(size(brief)).toBeLessThanOrEqual(BRIEF_EVIDENCE_MAX_BYTES);
    expect(parsed(brief).partial).toBe(true);
  });
});
