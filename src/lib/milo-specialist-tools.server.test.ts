import { describe, expect, it, vi } from "vitest";
import {
  runSpecialistTool,
  type SpecialistToolContext,
  type SpecialistToolDeps,
} from "./milo-specialist-tools.server";
const owner = "00000000-0000-4000-8000-000000000001",
  actor = "00000000-0000-4000-8000-000000000002",
  operationId = "00000000-0000-4000-8000-000000000003",
  jobId = "00000000-0000-4000-8000-000000000004",
  receiptId = "00000000-0000-4000-8000-000000000005";
function setup(who = actor) {
  const controller = new AbortController();
  const context: SpecialistToolContext = {
    actorId: who,
    target: { ownerId: owner, projectId: "p" },
    role: "seo",
    operationId,
    jobId,
    signal: controller.signal,
    beforeDispatch: vi.fn(async () => {}),
  };
  const rpc = vi.fn(async (name, params) => {
    if (name === "acquire_project_team_preview") return { data: operationId, error: null };
    if (name === "release_project_team_preview") return { data: null, error: null };
    return {
      data: {
        actorId: who,
        ownerId: owner,
        projectId: "p",
        canEdit: true,
        draftHash: params.p_asset ? "a".repeat(64) : null,
        membershipRevision: 1,
        workspaceRevision: 3,
        project: {
          id: "p",
          name: "Client",
          description: "Context",
          publishSecret: "fixture-private",
          integrations: "fixture-private",
        },
        drafts: [
          {
            id: "a",
            projectId: "p",
            title: "Saved",
            status: "Draft",
            updatedAt: "now",
            otherPrivate: "fixture-private",
          },
        ],
        remaining: 0,
        draft: params.p_asset
          ? {
              id: "a",
              projectId: "p",
              title: "Saved",
              status: "Draft",
              updatedAt: "now",
              markdown: "## First\nKnown text\n### Detail\nMore text\n## Second",
              metaTitle: "Title",
              metaDescription: "Description",
              importReceipt: "fixture-private",
              images: [{ id: "i", url: "https://fixture-private.example" }],
            }
          : null,
      },
      error: null,
    };
  });
  const row = {
    rev: 3,
    data: {
      projects: [{ id: "p", name: "Client", publishSecret: "fixture-private" }],
      opportunities: [
        {
          id: "o",
          projectId: "p",
          title: "Requested topic",
          language: "English",
          status: "captured",
        },
        { id: "foreign", projectId: "q", title: "Other client" },
      ],
      services: [
        { id: "s", projectId: "p", name: "Service" },
        { id: "foreign", projectId: "q", name: "Other service" },
      ],
      audits: [
        {
          id: "audit",
          projectId: "p",
          createdAt: "2026-09-12",
          fetchedWebsite: false,
          summary: "Historical advice",
          topFixes: [],
          findings: [],
          rawProviderSecret: "fixture-private",
        },
        { id: "foreign", projectId: "q", createdAt: "2026-09-13", summary: "Other client's audit" },
      ],
    },
  };
  const workspace = vi.fn(async () => row);
  const knowledge = vi.fn(async () => ({
    context: "Reviewed project knowledge",
    references: [],
    conflicts: [],
    omitted: 0,
    sourceDependencies: [],
    privateExtra: "fixture-private",
  }));
  const weekly = vi.fn(async () => ({
    enabled: false,
    control: { engine: "paused" },
    readiness: [],
    stages: [],
    secret: "fixture-private",
  }));
  const generate = vi.fn(async (_who, _data, metering) => {
    await metering.beforeDispatch();
    return { generationReceiptId: receiptId, resultId: receiptId };
  });
  const deps = { rpc, workspace, knowledge, weekly, generate } as unknown as SpecialistToolDeps;
  return { context, deps, rpc, workspace, knowledge, weekly, generate, row, controller };
}
describe("specialist tools reuse authoritative project operations", () => {
  function proposalHarness() {
    const h = setup();
    const model = vi.fn(async (_prompt: string) =>
      JSON.stringify({ explanation: "Clearer", fields: { metaTitle: "Proposed" } }),
    );
    const retain = vi.fn(async () => operationId);
    h.context.proposal = { conversationId: receiptId, attemptId: operationId, locale: "pl", model };
    h.deps.retainProposal = retain;
    const tool = {
      name: "draft_metadata_proposal" as const,
      assetId: "a",
      fields: ["metaTitle" as const],
      instructions: "Improve clarity",
    };
    return { ...h, model, retain, tool };
  }
  it("bounds proposal model input, strips private data and retains the exact read version", async () => {
    const h = proposalHarness();
    const result = await runSpecialistTool(h.tool, h.context, h.deps);
    expect(result).toMatchObject({
      state: "approval_required",
      reference: { kind: "draft_proposal", id: operationId },
    });
    expect(h.model.mock.calls[0][0]).not.toContain("fixture-private");
    expect(h.retain).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        expectedHash: "a".repeat(64),
        expectedMembershipRevision: 1,
        proposalId: operationId,
        conversationId: receiptId,
        turnId: jobId,
        proposal: { explanation: "Clearer", fields: { metaTitle: "Proposed" } },
      }),
      h.rpc,
    );
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.workspace).not.toHaveBeenCalled();
    expect(h.context.beforeDispatch).toHaveBeenCalledTimes(2);
  });
  it("denies wrong specialist, missing execution and current read-only access before a model request", async () => {
    for (const reason of ["role", "execution", "readonly"]) {
      const h = proposalHarness();
      if (reason === "role") h.context.role = "image";
      if (reason === "execution") h.context.proposal = undefined;
      if (reason === "readonly") {
        const original = h.rpc.getMockImplementation()!;
        h.rpc.mockImplementation(async (name, params) => {
          const response = await original(name, params);
          return name === "read_project_team_snapshot" &&
            response.data &&
            typeof response.data === "object"
            ? { ...response, data: { ...response.data, canEdit: false } }
            : response;
        });
      }
      expect((await runSpecialistTool(h.tool, h.context, h.deps)).state).toBe("unavailable");
      expect(h.model).not.toHaveBeenCalled();
      expect(h.retain).not.toHaveBeenCalled();
    }
  });
  it("treats no proposed change as unavailable without persisting an empty edit", async () => {
    for (const fields of [{}, { metaTitle: "Title" }]) {
      const h = proposalHarness();
      h.model.mockResolvedValue(JSON.stringify({ explanation: "Already suitable", fields }));
      expect((await runSpecialistTool(h.tool, h.context, h.deps)).state).toBe("unavailable");
      expect(h.retain).not.toHaveBeenCalled();
    }
  });
  it.each([
    { h1: "Unrequested" },
    { markdown: "Article" },
    { metaTitle: "x".repeat(1001) },
    { metaTitle: null },
  ])("rejects unrequested, unsupported or invalid model fields", async (fields) => {
    const h = proposalHarness();
    h.model.mockResolvedValue(JSON.stringify({ explanation: "Change", fields }));
    await expect(runSpecialistTool(h.tool, h.context, h.deps)).rejects.toThrow();
    expect(h.retain).not.toHaveBeenCalled();
  });
  it("does not retain a model result after cancellation or a failed final authority check", async () => {
    for (const cancel of [true, false]) {
      const h = proposalHarness();
      h.model.mockImplementation(async () => {
        if (cancel) h.controller.abort();
        else
          h.context.beforeDispatch = async () => {
            throw Error("Revoked");
          };
        return JSON.stringify({ explanation: "Change", fields: { metaTitle: "Proposed" } });
      });
      await expect(runSpecialistTool(h.tool, h.context, h.deps)).rejects.toThrow();
      expect(h.retain).not.toHaveBeenCalled();
    }
  });
  it("gives a collaborator only the safe project projection with no owner workspace fallback", async () => {
    const h = setup();
    const result = await runSpecialistTool({ name: "project_brief" }, h.context, h.deps);
    expect(result.evidence).toContain("Client");
    expect(result.evidence).not.toContain("fixture-private");
    expect(h.workspace).not.toHaveBeenCalled();
    expect(h.knowledge).not.toHaveBeenCalled();
    expect(h.rpc).toHaveBeenCalledWith("read_project_team_snapshot", {
      p_actor: actor,
      p_owner: owner,
      p_project: "p",
      p_asset: null,
      p_offset: 0,
    });
  });
  it("computes actual saved-draft checks and retains their version without claiming a crawl", async () => {
    const h = setup();
    const result = await runSpecialistTool(
      { name: "draft_seo_review", assetId: "a" },
      h.context,
      h.deps,
    );
    const data = JSON.parse(JSON.parse(result.evidence).content);
    expect(data).toMatchObject({
      h2Count: 2,
      h3Count: 1,
      liveWebsiteChecked: false,
      rankingMeasured: false,
      draftHash: "a".repeat(64),
      workspaceRevision: 3,
    });
    expect(result.reference).toEqual({ kind: "draft", id: "a" });
    expect(result.evidence).not.toContain("fixture-private");
  });
  it("reads actual draft content without private image URLs, credentials or other fields", async () => {
    const h = setup();
    const result = await runSpecialistTool({ name: "draft_read", assetId: "a" }, h.context, h.deps);
    expect(result.evidence).toContain("Known text");
    expect(result.evidence).not.toContain("fixture-private");
  });
  it("refuses foreign draft data despite a claimed successful backend response", async () => {
    const h = setup(),
      original = h.rpc.getMockImplementation()!;
    h.rpc.mockImplementation(async (name, params) => {
      const response = await original(name, params);
      if (
        name === "read_project_team_snapshot" &&
        response.data &&
        typeof response.data === "object"
      )
        (response.data as { projectId: string }).projectId = "q";
      return response;
    });
    await expect(
      runSpecialistTool({ name: "draft_read", assetId: "a" }, h.context, h.deps),
    ).rejects.toThrow();
    expect(h.generate).not.toHaveBeenCalled();
  });
  it("does not impersonate an owner for knowledge, weekly work, audits or generation", async () => {
    const h = setup();
    h.context.role = "content";
    h.context.allowDraftGeneration = true;
    for (const tool of [
      { name: "project_knowledge" } as const,
      { name: "weekly_preparation", weekStart: "2026-09-14" } as const,
      { name: "saved_audit" } as const,
      { name: "draft_generation", opportunityId: "o", assetType: "article" } as const,
    ])
      expect((await runSpecialistTool(tool, h.context, h.deps)).state).toBe("unavailable");
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.workspace).not.toHaveBeenCalled();
    expect(h.generate).not.toHaveBeenCalled();
  });
  it("requires the saved explicit generation choice and content role, even for owners", async () => {
    const h = setup(owner);
    h.context.role = "content";
    const tool = { name: "draft_generation", opportunityId: "o", assetType: "article" } as const;
    expect((await runSpecialistTool(tool, h.context, h.deps)).state).toBe("unavailable");
    h.context.allowDraftGeneration = true;
    h.context.role = "seo";
    expect((await runSpecialistTool(tool, h.context, h.deps)).state).toBe("unavailable");
    expect(h.generate).not.toHaveBeenCalled();
  });
  it("uses the existing quota and recovery generator for a current same-project opportunity", async () => {
    const h = setup(owner);
    h.context.role = "content";
    h.context.allowDraftGeneration = true;
    const result = await runSpecialistTool(
      { name: "draft_generation", opportunityId: "o", assetType: "article" },
      h.context,
      h.deps,
    );
    expect(h.generate).toHaveBeenCalledOnce();
    expect(h.generate.mock.calls[0][0]).toBe(owner);
    expect(h.generate.mock.calls[0][1].services.map((s: { id: string }) => s.id)).toEqual(["s"]);
    expect(h.generate.mock.calls[0][1].opportunity.id).toBe("o");
    expect(h.generate.mock.calls[0][2]).toMatchObject({
      enforceLimit: true,
      attempt: { requestId: operationId, jobId },
      signal: h.controller.signal,
      beforeDispatch: h.context.beforeDispatch,
    });
    expect(result.reference).toEqual({ kind: "generation", id: receiptId });
    expect(JSON.parse(JSON.parse(result.evidence).content)).toMatchObject({
      retained: true,
      published: false,
      editorImportRequired: true,
    });
    expect(result.evidence).not.toContain("fixture-private");
  });
  it("refuses missing, foreign, deleted or archived opportunities before a generation call", async () => {
    for (const mode of ["missing", "foreign", "deleted", "archived"]) {
      const h = setup(owner);
      h.context.role = "content";
      h.context.allowDraftGeneration = true;
      if (mode === "deleted") Object.assign(h.row.data.opportunities[0], { deletedAt: "now" });
      if (mode === "archived") Object.assign(h.row.data.opportunities[0], { archivedAt: "now" });
      await expect(
        runSpecialistTool(
          {
            name: "draft_generation",
            opportunityId: mode === "missing" || mode === "foreign" ? mode : "o",
            assetType: "article",
          },
          h.context,
          h.deps,
        ),
      ).rejects.toThrow("opportunity unavailable");
      expect(h.generate).not.toHaveBeenCalled();
    }
  });
  it("uses fresh reviewed knowledge and keeps audit evidence scoped and historical", async () => {
    const h = setup(owner);
    const knowledge = await runSpecialistTool({ name: "project_knowledge" }, h.context, h.deps);
    expect(h.knowledge).toHaveBeenCalledWith({ ownerId: owner, projectId: "p" }, "text");
    expect(knowledge.evidence).not.toContain("fixture-private");
    const audit = await runSpecialistTool({ name: "saved_audit" }, h.context, h.deps);
    expect(audit.evidence).toContain("Historical advice");
    expect(audit.evidence).not.toContain("Other client");
    expect(audit.evidence).not.toContain("fixture-private");
  });
  it("summarises saved technical, AI answer/log and backlink evidence without raw rows or new work", async () => {
    const h = setup(owner);
    const at = "2026-09-12T00:00:00Z";
    const technicalRuns = vi.fn(async () => [
      {
        run_id: receiptId,
        origin: "https://example.com",
        status: "completed",
        revision: 2,
        created_at: at,
        updated_at: at,
      },
    ]);
    const googleIndex = vi.fn(async () => [
      {
        requestId: receiptId,
        property: "sc-domain:example.com",
        url: "https://example.com/",
        status: "succeeded",
        error: null,
        createdAt: at,
        updatedAt: at,
        observationJson: JSON.stringify({ verdict: "PASS", detail: "x".repeat(2000) }),
      },
    ]);
    const performance = vi.fn(async () => ({
      configured: { crux: false, pagespeed: true },
      requests: [],
    }));
    const answers = vi.fn(async () => ({
      prompts: [{ id: jobId }],
      answers: [
        {
          id: receiptId,
          createdAt: at,
          hash: "h",
          input: {
            promptId: jobId,
            promptRevision: 1,
            surface: "Assistant",
            mode: "consumer-web",
            capturedAt: at,
            status: "complete",
            rawAnswer: "fixture-private raw answer",
            citations: ["https://example.com/a"],
            citationsComplete: true,
            supersedesId: null,
          },
        },
      ],
    }));
    const logs = vi.fn(async () => [
      {
        id: jobId,
        createdAt: at,
        input: {
          layer: "edge",
          hostname: "example.com",
          windowStart: "2026-09-01T00:00:00Z",
          windowEnd: at,
          completeness: "partial",
          supersedesId: null,
          rows: [{ page: "/fixture-private-path" }],
        },
        duplicateRows: 2,
      },
    ]);
    const backlinks = vi.fn(async () => [
      {
        requestId: receiptId,
        status: "succeeded",
        accounting: "settled",
        createdAt: at,
        recurring: null,
        observation: {
          observedAt: at,
          complete: false,
          days: [
            {
              state: "reported",
              newBacklinks: 3,
              lostBacklinks: 1,
              newReferringDomains: 1,
              lostReferringDomains: 0,
            },
            {
              state: "missing",
              newBacklinks: null,
              lostBacklinks: null,
              newReferringDomains: null,
              lostReferringDomains: null,
            },
          ],
        },
      },
    ]);
    Object.assign(h.deps, { technicalRuns, googleIndex, performance, answers, logs, backlinks });
    const content = (evidence: string) => JSON.parse(JSON.parse(evidence).content);

    h.context.role = "performance";
    const technical = await runSpecialistTool({ name: "technical_evidence" }, h.context, h.deps);
    expect(technicalRuns).toHaveBeenCalledWith(owner, { projectId: "p" });
    expect(technical.reference).toEqual({ kind: "technical", id: "p" });
    const technicalData = content(technical.evidence);
    expect(technicalData).toMatchObject({
      startedNewWork: false,
      crawlRuns: [{ status: "completed" }],
      performance: { configured: { crux: false, pagespeed: true }, requests: [] },
    });
    expect(
      new TextEncoder().encode(technicalData.indexInspections[0].observation).byteLength,
    ).toBeLessThanOrEqual(600);

    h.context.role = "ai";
    const visibility = await runSpecialistTool({ name: "visibility_evidence" }, h.context, h.deps);
    expect(answers).toHaveBeenCalledWith({ ownerId: owner, projectId: "p" });
    expect(visibility.evidence).not.toContain("fixture-private");
    expect(content(visibility.evidence)).toMatchObject({
      verified: false,
      answerSamples: 1,
      recentAnswers: [{ citations: 1, superseded: false }],
      recentLogImports: [{ uniqueRows: 1, duplicateRows: 2, completeness: "partial" }],
    });

    h.context.role = "authority";
    const authority = await runSpecialistTool({ name: "authority_evidence" }, h.context, h.deps);
    expect(authority.reference).toEqual({ kind: "authority", id: "p" });
    expect(content(authority.evidence).requests[0].observation).toMatchObject({
      days: 2,
      missingDays: 1,
      newBacklinks: null,
      lostReferringDomains: null,
    });
    expect(h.workspace).not.toHaveBeenCalled();

    h.context.role = "image";
    for (const name of ["technical_evidence", "visibility_evidence", "authority_evidence"] as const)
      expect((await runSpecialistTool({ name }, h.context, h.deps)).state).toBe("unavailable");
    expect(technicalRuns).toHaveBeenCalledOnce();
    expect(answers).toHaveBeenCalledOnce();
    expect(backlinks).toHaveBeenCalledOnce();
  });
  it("lets a current collaborator read owner-scoped evidence only after fresh team admission", async () => {
    const h = setup();
    h.context.role = "seo";
    const technicalRuns = vi.fn(async () => []);
    const googleIndex = vi.fn(async () => []);
    const performance = vi.fn(async () => ({
      configured: { crux: false, pagespeed: false },
      requests: [],
    }));
    Object.assign(h.deps, { technicalRuns, googleIndex, performance });
    const result = await runSpecialistTool({ name: "technical_evidence" }, h.context, h.deps);
    expect(result.state).toBe("completed");
    expect(technicalRuns).toHaveBeenCalledWith(owner, { projectId: "p" });
    expect(h.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      technicalRuns.mock.invocationCallOrder[0],
    );
    expect(h.workspace).not.toHaveBeenCalled();

    const revoked = setup();
    revoked.context.role = "seo";
    const deniedRuns = vi.fn(async () => []);
    Object.assign(revoked.deps, { technicalRuns: deniedRuns, googleIndex, performance });
    revoked.rpc.mockImplementation((async (name: string) =>
      name === "read_project_team_snapshot"
        ? { data: null, error: { message: "team_access_revoked" } }
        : { data: operationId, error: null }) as never);
    await expect(
      runSpecialistTool({ name: "technical_evidence" }, revoked.context, revoked.deps),
    ).rejects.toThrow();
    expect(deniedRuns).not.toHaveBeenCalled();
  });
  it("runs consented Google checks as the owner with the durable operation as request identity", async () => {
    const h = setup();
    h.context.role = "seo";
    const at = "2026-09-14T00:00:00Z";
    const inspectIndex = vi.fn(async () => ({
      requestId: operationId,
      property: "sc-domain:example.com",
      url: "https://example.com/a",
      status: "succeeded",
      error: null,
      createdAt: at,
      updatedAt: at,
      observationJson: JSON.stringify({ verdict: "PASS", detail: "x".repeat(4000) }),
    }));
    const performanceTest = vi.fn(async () => ({
      requestId: operationId,
      url: "https://example.com/a",
      source: "pagespeed",
      scope: "url",
      device: "mobile",
      status: "failed",
      error: "quota",
      createdAt: at,
      updatedAt: at,
      observationJson: null,
    }));
    Object.assign(h.deps, { inspectIndex, performanceTest });
    const index = { name: "google_index_inspection", url: "https://example.com/a" } as const;
    expect((await runSpecialistTool(index, h.context, h.deps)).state).toBe("unavailable");
    expect(inspectIndex).not.toHaveBeenCalled();

    h.context.allowProviderChecks = true;
    const inspected = await runSpecialistTool(index, h.context, h.deps);
    expect(inspectIndex).toHaveBeenCalledWith(owner, {
      projectId: "p",
      requestId: operationId,
      url: "https://example.com/a",
    });
    expect(inspected.reference).toEqual({ kind: "technical", id: "p" });
    const data = JSON.parse(JSON.parse(inspected.evidence).content);
    expect(data).toMatchObject({ status: "succeeded", requestId: operationId });
    expect(new TextEncoder().encode(data.observation).byteLength).toBeLessThanOrEqual(1500);

    h.context.role = "performance";
    const measured = await runSpecialistTool(
      { name: "performance_test", url: "https://example.com/a", device: "mobile" },
      h.context,
      h.deps,
    );
    expect(performanceTest).toHaveBeenCalledWith(owner, {
      projectId: "p",
      requestId: operationId,
      query: { source: "pagespeed", url: "https://example.com/a", device: "mobile" },
    });
    expect(JSON.parse(JSON.parse(measured.evidence).content)).toMatchObject({
      status: "failed",
      error: "quota",
      observation: null,
    });

    h.context.role = "image";
    expect((await runSpecialistTool(index, h.context, h.deps)).state).toBe("unavailable");
    expect(inspectIndex).toHaveBeenCalledOnce();
    expect(h.workspace).not.toHaveBeenCalled();
  });
  it("starts one consented crawl as the owner, advances bounded steps and reports blocked starts", async () => {
    const view = (status: string, revision: number, pages = 0) => ({
      runId: operationId,
      projectId: "p",
      origin: "https://example.com",
      status,
      revision,
      createdAt: "2026-09-14T00:00:00Z",
      updatedAt: "2026-09-14T00:00:00Z",
      state:
        status === "preparing"
          ? null
          : { pages: Array.from({ length: pages }, () => ({})), queue: [], coverageLimits: [] },
      admissionHold: null,
      retryAfter: null,
    });
    const h = setup();
    h.context.role = "seo";
    const startCrawl = vi.fn(async () => view("preparing", 1));
    const stepCrawl = vi
      .fn()
      .mockResolvedValueOnce(view("running", 2, 3))
      .mockResolvedValueOnce(view("completed", 3, 5));
    Object.assign(h.deps, { startCrawl, stepCrawl });
    expect((await runSpecialistTool({ name: "site_crawl" }, h.context, h.deps)).state).toBe(
      "unavailable",
    );
    expect(startCrawl).not.toHaveBeenCalled();

    h.context.allowProviderChecks = true;
    const crawled = await runSpecialistTool({ name: "site_crawl" }, h.context, h.deps);
    expect(startCrawl).toHaveBeenCalledWith(owner, { projectId: "p", runId: operationId });
    expect(stepCrawl).toHaveBeenCalledTimes(2);
    expect(stepCrawl).toHaveBeenCalledWith(owner, { projectId: "p", runId: operationId });
    expect(crawled.reference).toEqual({ kind: "technical", id: "p" });
    expect(JSON.parse(JSON.parse(crawled.evidence).content)).toMatchObject({
      status: "completed",
      pagesObserved: 5,
      stepsThisRequest: 2,
      continues: false,
    });

    const shared = setup(owner);
    shared.context.role = "research";
    shared.context.allowProviderChecks = true;
    const sharedStep = vi.fn(async () => view("running", 1, 1));
    Object.assign(shared.deps, {
      startCrawl: vi.fn(async () => view("running", 1, 1)),
      stepCrawl: sharedStep,
    });
    const leased = await runSpecialistTool({ name: "site_crawl" }, shared.context, shared.deps);
    expect(sharedStep).toHaveBeenCalledOnce();
    expect(JSON.parse(JSON.parse(leased.evidence).content)).toMatchObject({ continues: true });

    // Cancellation is checked every step; the authority RPC only every fifth step, so a long
    // crawl cannot exhaust the actor's own admission budget.
    const long = setup(owner);
    long.context.role = "seo";
    long.context.allowProviderChecks = true;
    let revision = 1;
    const longStep = vi.fn(async () =>
      view(revision < 12 ? "running" : "completed", ++revision, 1),
    );
    Object.assign(long.deps, {
      startCrawl: vi.fn(async () => view("preparing", 1)),
      stepCrawl: longStep,
    });
    const before = (long.context.beforeDispatch as ReturnType<typeof vi.fn>).mock.calls.length;
    const lengthy = await runSpecialistTool({ name: "site_crawl" }, long.context, long.deps);
    expect(longStep).toHaveBeenCalledTimes(12);
    // Two checks before the start (admission and pre-dispatch) plus steps 5 and 10.
    expect(
      (long.context.beforeDispatch as ReturnType<typeof vi.fn>).mock.calls.length - before,
    ).toBe(4);
    expect(JSON.parse(JSON.parse(lengthy.evidence).content)).toMatchObject({
      stepsThisRequest: 12,
    });

    const blocked = setup(owner);
    blocked.context.role = "performance";
    blocked.context.allowProviderChecks = true;
    const blockedStep = vi.fn();
    Object.assign(blocked.deps, {
      startCrawl: vi.fn(async () => {
        throw new Error("technical_crawl_unavailable");
      }),
      stepCrawl: blockedStep,
    });
    const refused = await runSpecialistTool({ name: "site_crawl" }, blocked.context, blocked.deps);
    expect(refused.state).toBe("unavailable");
    expect(refused.evidence).toContain("crawl_start_unavailable");
    expect(blockedStep).not.toHaveBeenCalled();
  });
  it("does not start a consented check after cancellation or a failed final authority check", async () => {
    for (const mode of ["cancel", "revoked"]) {
      const h = setup(owner);
      h.context.role = "seo";
      h.context.allowProviderChecks = true;
      const inspectIndex = vi.fn(async () => {
        throw new Error("must not run");
      });
      Object.assign(h.deps, { inspectIndex });
      let calls = 0;
      h.context.beforeDispatch = async () => {
        calls += 1;
        if (calls < 2) return;
        if (mode === "cancel") h.controller.abort();
        else throw new Error("Revoked");
      };
      await expect(
        runSpecialistTool(
          { name: "google_index_inspection", url: "https://example.com/a" },
          h.context,
          h.deps,
        ),
      ).rejects.toThrow();
      expect(inspectIndex).not.toHaveBeenCalled();
    }
  });
  it("stops after cancellation during context retrieval, before costly generation", async () => {
    const h = setup(owner);
    h.context.role = "content";
    h.context.allowDraftGeneration = true;
    h.workspace.mockImplementation(async () => {
      h.controller.abort();
      return h.row;
    });
    await expect(
      runSpecialistTool(
        { name: "draft_generation", opportunityId: "o", assetType: "article" },
        h.context,
        h.deps,
      ),
    ).rejects.toThrow();
    expect(h.generate).not.toHaveBeenCalled();
  });
});
