import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Execute the real route handler with controlled service boundaries. No router,
// account credentials, network, provider calls or production workspace are used.
const route = readFileSync(
  new URL("../routes/_authenticated/app.onboarding.tsx", import.meta.url),
  "utf8",
);
const ast = ts.createSourceFile(
  "onboarding.tsx",
  route,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let handler = "";
function find(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "handleGenerate")
    handler = node.getText(ast);
  ts.forEachChild(node, find);
}
find(ast);
if (!handler) throw new Error("The actual onboarding completion handler must be tested.");
const executable = ts.transpileModule(handler, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(
  options: {
    planFails?: boolean;
    calendarFails?: boolean;
    auditFails?: boolean;
    oldOpportunity?: boolean;
  } = {},
) {
  const events: string[] = [];
  const opportunities = options.oldOpportunity
    ? [{ id: "old-opportunity", projectId: "test-project" }]
    : [];
  const deps = {
    generatingRef: { current: false },
    alive: { current: true },
    setGenerating: vi.fn(),
    setGenStatus: vi.fn(),
    setReviewProjectId: vi.fn(),
    reviewProjectId: "test-project",
    pendingProjectId: { current: "test-project" },
    updateProject: vi.fn(),
    persistSetupProject: vi.fn(),
    saveWorkspaceNow: vi.fn().mockResolvedValue(undefined),
    getState: () => ({
      projects: [{ id: "test-project", primaryLanguage: "English" }],
      services: [],
      opportunities,
    }),
    w: {
      services: [],
      websiteUrl: options.auditFails ? "https://example.invalid" : "",
      competitorUrls: [],
    },
    addService: vi.fn(),
    ProjectLimitError: class extends Error {},
    generateSeoOpportunities: options.planFails
      ? vi.fn().mockRejectedValue(new Error("budget_unconfigured"))
      : vi.fn().mockResolvedValue([{}]),
    generateContentCalendar: options.calendarFails
      ? vi.fn().mockRejectedValue(new Error("calendar unavailable"))
      : vi.fn().mockResolvedValue([{}]),
    runSiteAudit: options.auditFails
      ? vi.fn().mockRejectedValue(new Error("audit unavailable"))
      : vi.fn(),
    runCompetitorGap: vi.fn(),
    pickSampleOpportunity: () => opportunities[0] ?? null,
    generateContentForOpportunity: vi.fn().mockResolvedValue({ id: "sample-draft" }),
    defaultAssetTypeFor: vi.fn().mockReturnValue("blog"),
    sessionStorage: { removeItem: vi.fn() },
    draftKey: "synthetic-draft",
    navigate: vi.fn(async () => {
      events.push("navigation");
    }),
    t: (key: string) => key,
    toast: {
      success: vi.fn((key: string) => events.push(key)),
      message: vi.fn((key: string) => events.push(key)),
      error: vi.fn(),
    },
  };
  const run = new Function(...Object.keys(deps), `${executable}\nreturn handleGenerate;`)(
    ...Object.values(deps),
  ) as (reviewed: boolean) => Promise<void>;
  return { run, deps, events };
}

describe("real onboarding completion outcome", () => {
  it("keeps saved setup when an unfunded plan fails and reports the partial outcome after navigation", async () => {
    const f = fixture({ planFails: true, oldOpportunity: true });
    await f.run(true);
    expect(f.deps.saveWorkspaceNow).toHaveBeenCalled();
    expect(f.deps.generateSeoOpportunities).toHaveBeenCalledTimes(1);
    expect(f.deps.generateContentCalendar).not.toHaveBeenCalled();
    expect(f.deps.generateContentForOpportunity).not.toHaveBeenCalled();
    expect(f.events).toEqual(["navigation", "onboarding.toast.partial"]);
    expect(f.deps.generatingRef.current).toBe(false);
  });
  it("does not announce a complete plan when the calendar fails", async () => {
    const f = fixture({ calendarFails: true });
    await f.run(true);
    expect(f.events).toEqual(["navigation", "onboarding.toast.partial"]);
  });
  it("records an independent audit failure instead of converting it into success", async () => {
    const f = fixture({ auditFails: true });
    await f.run(true);
    expect(f.events).toEqual(["navigation", "onboarding.toast.partial"]);
  });
  it("announces a completed plan only after successful generation and navigation", async () => {
    const f = fixture();
    await f.run(true);
    expect(f.events).toEqual(["navigation", "onboarding.toast.ready"]);
  });
  it("still opens a successfully prepared first draft", async () => {
    const f = fixture({ oldOpportunity: true });
    await f.run(true);
    expect(f.deps.navigate).toHaveBeenCalledWith({
      to: "/app/editor",
      search: { id: "sample-draft" },
    });
    expect(f.events).toEqual(["navigation", "onboarding.toast.sampleReady"]);
  });
});
