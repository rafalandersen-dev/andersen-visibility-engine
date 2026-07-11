/**
 * Phase 1B.4 — read-only Pending Actions UI. The repo's test environment is
 * node-only (no component rendering), so the page's behavior is covered via
 * its pure presentation module, source-level read-only guards on the page
 * file, i18n key coverage, and the generated route registration.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Opportunity, PendingAction } from "./types";
import type { Project } from "./types";
import {
  effectivePendingStatus,
  filterPendingActions,
  countPendingForBadge,
  pendingActionDiff,
  projectSetupView,
  projectSetupCounts,
  proposedFieldNames,
  scopePillTone,
  canResolvePendingAction,
} from "./pending-actions.ui";
import { PENDING_ACTION_TTL_MS } from "./pending-actions";

const T0 = "2026-07-10T12:00:00.000Z";
const T1 = "2026-07-11T12:00:00.000Z";

const action = (over: Partial<PendingAction> = {}): PendingAction => ({
  id: "pa1",
  type: "opportunity_update_proposal",
  projectId: "synergy",
  title: "Sharpen the comparison opportunity",
  summary: "Claude suggests a clearer title.",
  status: "pending",
  source: "claude",
  createdAt: T0,
  updatedAt: T0,
  expiresAt: new Date(Date.parse(T0) + PENDING_ACTION_TTL_MS).toISOString(),
  requiredScope: "milo.actions.propose",
  payload: { opportunityId: "o1", updates: { title: "Massage vs physio", priority: "High" } },
  preview: "- title → Massage vs physio",
  riskLevel: "medium",
  ...over,
});

const OPPS: Opportunity[] = [
  {
    id: "o1", projectId: "synergy", title: "Original title", language: "English", contentType: "Blog Article",
    searchIntent: "Informational", targetAudience: "aud", businessValue: "Original value", recommendedCta: "Original CTA",
    priority: "Medium", status: "Linked",
  } as Opportunity,
];

describe("filtering + effective status", () => {
  const list = [
    action(),
    action({ id: "pa2", projectId: "other", createdAt: T1, updatedAt: T1, expiresAt: new Date(Date.parse(T1) + PENDING_ACTION_TTL_MS).toISOString() }),
    action({ id: "pa3", status: "rejected" }),
  ];

  it("filters by status/project/type; 'all' and undefined mean no filter", () => {
    const now = Date.parse(T0);
    expect(filterPendingActions(list, {}, now)).toHaveLength(3);
    expect(filterPendingActions(list, { status: "all", projectId: "all", type: "all" }, now)).toHaveLength(3);
    expect(filterPendingActions(list, { status: "pending" }, now).map((a) => a.id).sort()).toEqual(["pa1", "pa2"]);
    expect(filterPendingActions(list, { projectId: "other" }, now).map((a) => a.id)).toEqual(["pa2"]);
    expect(filterPendingActions(list, { type: "opportunity_update_proposal" }, now)).toHaveLength(3);
    expect(filterPendingActions(list, { status: "rejected" }, now).map((a) => a.id)).toEqual(["pa3"]);
  });

  it("sorts newest first and treats stale pending items as expired", () => {
    const now = Date.parse(T0);
    expect(filterPendingActions(list, {}, now).map((a) => a.id)).toEqual(["pa2", "pa1", "pa3"]);
    const staleNow = Date.parse(T0) + PENDING_ACTION_TTL_MS + 1000;
    expect(effectivePendingStatus(list[0], staleNow)).toBe("expired");
    expect(effectivePendingStatus(list[1], staleNow)).toBe("pending"); // created a day later
    expect(filterPendingActions(list, { status: "expired" }, staleNow).map((a) => a.id)).toEqual(["pa1"]);
    // resolved items never become expired
    expect(effectivePendingStatus(list[2], staleNow)).toBe("rejected");
  });

  it("badge counts effectively-pending items only", () => {
    expect(countPendingForBadge(list, Date.parse(T0))).toBe(2);
    expect(countPendingForBadge(list, Date.parse(T0) + PENDING_ACTION_TTL_MS + 1000)).toBe(1);
    expect(countPendingForBadge([], Date.parse(T0))).toBe(0);
  });
});

describe("before/after diff", () => {
  it("builds rows for whitelisted fields with current workspace values", () => {
    const diff = pendingActionDiff(action(), OPPS)!;
    expect(diff.opportunityId).toBe("o1");
    expect(diff.targetExists).toBe(true);
    expect(diff.rows).toEqual([
      { field: "title", current: "Original title", proposed: "Massage vs physio" },
      { field: "priority", current: "Medium", proposed: "High" },
    ]);
  });

  it("flags a missing target and leaves current undefined", () => {
    const diff = pendingActionDiff(action(), [])!;
    expect(diff.targetExists).toBe(false);
    expect(diff.rows.every((r) => r.current === undefined)).toBe(true);
  });

  it("ignores non-string proposed values and unknown types", () => {
    const weird = action({ payload: { opportunityId: "o1", updates: { title: 42 as never } } });
    expect(pendingActionDiff(weird, OPPS)!.rows).toEqual([]);
    expect(pendingActionDiff({ ...action(), type: "other" as never }, OPPS)).toBeNull();
  });

  it("exposes proposed field names, sorted", () => {
    expect(proposedFieldNames(action())).toEqual(["priority", "title"]);
    expect(proposedFieldNames(action({ payload: { opportunityId: "o1" } }))).toEqual([]);
  });
});

describe("project_setup_proposal view (1C.4)", () => {
  const setupAction = (payload: Record<string, unknown>, over: Partial<PendingAction> = {}): PendingAction => ({
    ...action(),
    id: "ps1",
    type: "project_setup_proposal",
    projectId: "synergy",
    payload,
    ...over,
  });
  const project = (over: Partial<Project> = {}): Project =>
    ({
      id: "synergy",
      name: "Synergy",
      websiteUrl: "https://synergymassage.se",
      businessName: "Old name",
      businessType: "",
      primaryLanguage: "English",
      additionalLanguages: [],
      mainLocation: "",
      targetLocations: ["Old town"],
      description: "",
      targetAudience: "",
      toneOfVoice: "",
      uniqueSellingPoints: "",
      brandNotes: "",
      ...over,
    }) as Project;

  const full = () => ({
    projectFields: { businessName: "New name", description: "A studio.", targetLocations: ["Stockholm", "Solna"], competitorUrls: ["https://a.se", "https://b.se"] },
    services: [{ name: "Deep tissue", kind: "Service", priority: "High" }, { name: "Gift cards", kind: "Product" }],
    opportunities: [{ title: "Massage guide", contentType: "Guide", priority: "High" }, { title: "Deep tissue vs classic" }],
  });

  it("returns null for non-setup actions", () => {
    expect(projectSetupView(action(), [project()])).toBeNull();
  });

  it("builds a profile diff, stringifies arrays, and splits competitors out", () => {
    const view = projectSetupView(setupAction(full()), [project()])!;
    expect(view.targetExists).toBe(true);
    // competitorUrls is NOT a profile row — it's the competitors section.
    expect(view.profile.map((r) => r.field)).toEqual(["businessName", "description", "targetLocations"]);
    expect(view.profile.find((r) => r.field === "targetLocations")).toMatchObject({ current: "Old town", proposed: "Stockholm, Solna" });
    expect(view.competitors).toEqual({ provided: true, urls: ["https://a.se", "https://b.se"], change: "add" });
    expect(view.services).toEqual([
      { name: "Deep tissue", kind: "Service", priority: "High" },
      { name: "Gift cards", kind: "Product", priority: undefined },
    ]);
    expect(view.opportunities).toEqual([
      { title: "Massage guide", contentType: "Guide", priority: "High" },
      { title: "Deep tissue vs classic", contentType: undefined, priority: undefined },
    ]);
  });

  it("classifies scalar fields: add (empty current), overwrite (differing), none (normalized-equal)", () => {
    const view = projectSetupView(
      setupAction({ projectFields: { businessName: "New name", description: "A studio.", toneOfVoice: "  Warm  " } }),
      [project({ toneOfVoice: "Warm" })], // identical after trim → no change
    )!;
    expect(view.profile.find((r) => r.field === "businessName")!.change).toBe("overwrite"); // "Old name" → "New name"
    expect(view.profile.find((r) => r.field === "description")!.change).toBe("add"); // "" → "A studio."
    expect(view.profile.find((r) => r.field === "toneOfVoice")!.change).toBe("none"); // "Warm" ≡ "  Warm  "
  });

  it("normalizes array/set fields — spacing/order/dupes do not count as an overwrite", () => {
    // Same membership, different order + spacing + a duplicate → no change.
    const equivalent = projectSetupView(
      setupAction({ projectFields: { targetLocations: [" Solna ", "Stockholm", "stockholm"] } }),
      [project({ targetLocations: ["Stockholm", "Solna"] })],
    )!;
    expect(equivalent.profile.find((r) => r.field === "targetLocations")!.change).toBe("none");
    // A real membership change → overwrite.
    const changed = projectSetupView(
      setupAction({ projectFields: { targetLocations: ["Stockholm", "Malmö"] } }),
      [project({ targetLocations: ["Stockholm", "Solna"] })],
    )!;
    expect(changed.profile.find((r) => r.field === "targetLocations")!.change).toBe("overwrite");
    // Empty current set → add.
    const added = projectSetupView(setupAction({ projectFields: { additionalLanguages: ["English"] } }), [project({ additionalLanguages: [] })])!;
    expect(added.profile.find((r) => r.field === "additionalLanguages")!.change).toBe("add");
  });

  it("competitor semantics: add (none current), overwrite/replace (differing), none (equivalent)", () => {
    const add = projectSetupView(setupAction({ projectFields: { competitorUrls: ["https://a.se"] } }), [project()])!;
    expect(add.competitors).toMatchObject({ provided: true, change: "add" });
    const replace = projectSetupView(
      setupAction({ projectFields: { competitorUrls: ["https://a.se", "https://new.se"] } }),
      [project({ competitorUrls: ["https://a.se", "https://old.se"] } as Partial<Project>)],
    )!;
    expect(replace.competitors.change).toBe("overwrite");
    const same = projectSetupView(
      setupAction({ projectFields: { competitorUrls: ["https://A.se", " https://b.se "] } }),
      [project({ competitorUrls: ["https://b.se", "https://a.se"] } as Partial<Project>)],
    )!;
    expect(same.competitors.change).toBe("none");
    // competitorUrls absent → not provided, neutral, empty.
    const absent = projectSetupView(setupAction({ projectFields: { businessName: "X" } }), [project()])!;
    expect(absent.competitors).toEqual({ provided: false, urls: [], change: "none" });
  });

  it("flags a missing target project (current undefined, markers not meaningful)", () => {
    const view = projectSetupView(setupAction(full()), [])!;
    expect(view.targetExists).toBe(false);
    expect(view.profile.every((r) => r.current === undefined)).toBe(true);
  });

  it("hides malformed / non-provided fields (only whitelisted, present keys become rows)", () => {
    // A tampered stored payload with an unknown key: view iterates the whitelist,
    // so unknown keys never surface as rows.
    const view = projectSetupView(setupAction({ projectFields: { businessName: "X", seoTitle: "leak" } as Record<string, unknown> }), [project()])!;
    expect(view.profile.map((r) => r.field)).toEqual(["businessName"]);
  });

  it("handles single-group payloads (services-only / opportunities-only / fields-only)", () => {
    expect(projectSetupView(setupAction({ services: [{ name: "S", kind: "Service" }] }), [project()])!.profile).toEqual([]);
    expect(projectSetupView(setupAction({ opportunities: [{ title: "T" }] }), [project()])!.services).toEqual([]);
    const fieldsOnly = projectSetupView(setupAction({ projectFields: { businessName: "X" } }), [project()])!;
    expect(fieldsOnly.competitors.urls).toEqual([]);
    expect(fieldsOnly.opportunities).toEqual([]);
  });

  it("counts groups without needing the project (competitorUrls excluded from field count)", () => {
    expect(projectSetupCounts(setupAction(full()))).toEqual({ fields: 3, services: 2, opportunities: 2, competitors: 2 });
    expect(projectSetupCounts(setupAction({ services: [{ name: "S", kind: "Service" }] }))).toEqual({ fields: 0, services: 1, opportunities: 0, competitors: 0 });
  });

  it("proposedFieldNames returns setup projectFields keys, sorted", () => {
    expect(proposedFieldNames(setupAction(full()))).toEqual(["businessName", "competitorUrls", "description", "targetLocations"]);
    expect(proposedFieldNames(setupAction({ services: [{ name: "S", kind: "Service" }] }))).toEqual([]);
  });
});

describe("connected-apps scope pills", () => {
  it("propose renders amber like the other write-class scopes; reads stay neutral", () => {
    expect(scopePillTone("milo.actions.propose")).toBe("amber");
    expect(scopePillTone("milo.tasks.write")).toBe("amber");
    expect(scopePillTone("milo.content.publish")).toBe("amber");
    expect(scopePillTone("milo.projects.read")).toBe("neutral");
    expect(scopePillTone("offline_access")).toBe("neutral");
  });
});

describe("resolution boundary guards on the page source (1B.5)", () => {
  const pageSrc = readFileSync(join(__dirname, "../routes/_authenticated/app.actions.tsx"), "utf8");

  it("mutates ONLY through the owner-authenticated resolve server fn", () => {
    // The single allowed mutation path:
    expect(pageSrc).toContain('from "@/lib/pending-actions.functions"');
    expect(pageSrc).toContain("resolvePendingActionFn");
    // Never direct workspace/store mutation or raw lifecycle helpers:
    for (const forbidden of [
      "mutateWorkspace", "saveWorkspaceNow", "createServerFn", "setState(",
      "resolvePendingActionForWorkspace", // core is server-side only
      "approvePendingAction(", "rejectPendingAction(", "markPendingActionApplied(",
      "oauth.functions", "mcp.server", "mcp.functions", "/api/mcp",
    ]) {
      expect(pageSrc, `page must not reference ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("reloads server state after a successful resolve, gated on res.ok (follow-up A)", () => {
    // Uses the server RELOAD (no early-return) — not the already-hydrated no-op.
    expect(pageSrc).toContain("reloadWorkspaceForUser");
    // hydrateForUser must not be imported or called (it would no-op here).
    expect(pageSrc).not.toMatch(/hydrateForUser\s*\(/); // no call
    expect(pageSrc).not.toMatch(/import[\s\S]*hydrateForUser[\s\S]*from "@\/lib\/store"/); // not imported
    // Reload is inside the success branch, so a failed apply cannot mask state.
    expect(pageSrc).toMatch(/if \(res\.ok\)[\s\S]*reloadWorkspaceForUser/);
  });

  it("renders controls only behind the effectively-pending guard", () => {
    expect(pageSrc).toContain("canResolvePendingAction");
    expect(pageSrc).toContain("canResolve ?"); // controls branch is gated
  });

  it("renders project-setup proposals via the pure view helper, and competitor URLs as PLAIN TEXT (never links)", () => {
    expect(pageSrc).toContain("projectSetupView");
    // Competitor URLs (untrusted proposal content) must not be turned into
    // anchors or markdown links anywhere on the page.
    expect(pageSrc).not.toMatch(/<a\s/); // no anchor elements at all on this page
    expect(pageSrc).not.toContain("href=");
    // The competitors block iterates the plain string list into <li>{u}</li>.
    expect(pageSrc).toContain("setup.competitors.urls.map");
  });

  it("surfaces the 1C.4 review affordances (state markers, disclaimer, setup confirmation, missing-target block)", () => {
    // Three-state textual markers (not color-only) via the shared helper.
    expect(pageSrc).toContain("StateMarker");
    expect(pageSrc).toContain("actions.detail.stateAdd");
    expect(pageSrc).toContain("actions.detail.stateNone");
    // Services/opportunities skip-disclaimer is shown.
    expect(pageSrc).toContain("actions.detail.createDisclaimer");
    // Setup-specific approval copy (fields + creates + skips + setupComplete + Claude-cannot-apply).
    expect(pageSrc).toContain("actions.resolve.approveBodySetup");
    // A deleted target project DISABLES Approve (Reject stays available).
    expect(pageSrc).toContain("setupTargetMissing");
    expect(pageSrc).toMatch(/disabled=\{busy !== null \|\| setupTargetMissing\}/);
    // Missing-target warning uses a semantic status role.
    expect(pageSrc).toMatch(/role="status"/);
  });

  it("is registered in the generated route tree", () => {
    const routeTree = readFileSync(join(__dirname, "../routeTree.gen.ts"), "utf8");
    expect(routeTree).toContain("'/app/actions'");
    expect(routeTree).toContain("_authenticated/app.actions");
  });

  it("MCP tool registry has NO approve/reject/apply tools", async () => {
    const { TOOL_SCOPES, PENDING_TOOL_NAMES } = await import("./mcp.server");
    for (const name of [...Object.keys(TOOL_SCOPES), ...PENDING_TOOL_NAMES]) {
      expect(name).not.toMatch(/approve|reject|apply|resolve/);
    }
  });
});

describe("canResolvePendingAction", () => {
  it("true only for effectively-pending items", () => {
    const now = Date.parse(T0);
    expect(canResolvePendingAction(action(), now)).toBe(true);
    expect(canResolvePendingAction(action({ status: "applied" }), now)).toBe(false);
    expect(canResolvePendingAction(action({ status: "rejected" }), now)).toBe(false);
    expect(canResolvePendingAction(action({ status: "expired" }), now)).toBe(false);
    // stale pending → effectively expired → not resolvable
    expect(canResolvePendingAction(action(), Date.parse(T0) + PENDING_ACTION_TTL_MS + 1000)).toBe(false);
  });
});

describe("card state after a successful resolve (follow-up A)", () => {
  // The card renders controls when canResolve is true, else a resolution line
  // when action.resolution exists. These assert the exact branch inputs.
  const now = Date.parse(T1);
  const resolvedAt = T1;

  it("applied action: status Applied, controls gone, resolution line present", () => {
    const applied = action({ status: "applied", resolution: { resolvedAt, resolvedBy: "owner", appliedEntityIds: ["o1"] } });
    expect(effectivePendingStatus(applied, now)).toBe("applied");
    expect(canResolvePendingAction(applied, now)).toBe(false); // Approve/Reject controls hidden
    expect(applied.resolution?.resolvedAt).toBe(resolvedAt); // resolution line data
  });

  it("rejected action: status Rejected, controls gone, resolution line present", () => {
    const rejected = action({ status: "rejected", resolution: { resolvedAt, resolvedBy: "owner", note: "not now" } });
    expect(effectivePendingStatus(rejected, now)).toBe("rejected");
    expect(canResolvePendingAction(rejected, now)).toBe(false);
    expect(rejected.resolution?.note).toBe("not now");
  });

  it("a still-pending action keeps its controls (no false resolution)", () => {
    const pending = action({ status: "pending" });
    expect(canResolvePendingAction(pending, now)).toBe(true);
    expect(pending.resolution).toBeUndefined();
  });
});

describe("i18n coverage", () => {
  it("all locales carry every Pending Actions key", async () => {
    const { en } = await import("../i18n/en");
    const { pl } = await import("../i18n/pl");
    const { sv } = await import("../i18n/sv");
    const { da } = await import("../i18n/da");
    const keys = [
      "common.loading",
      "nav.actions",
      "actions.title", "actions.description", "actions.safety",
      "actions.filter.status", "actions.filter.allStatuses", "actions.filter.project", "actions.filter.allProjects",
      "actions.empty.title", "actions.empty.body",
      "actions.status.pending", "actions.status.approved", "actions.status.applied", "actions.status.rejected", "actions.status.expired",
      "actions.risk.low", "actions.risk.medium", "actions.risk.high",
      "actions.type.opportunity_update_proposal", "actions.type.project_setup_proposal",
      "actions.card.project", "actions.card.type", "actions.card.fields", "actions.card.created", "actions.card.expires",
      "actions.card.showDetail", "actions.card.hideDetail",
      "actions.detail.target", "actions.detail.targetMissing", "actions.detail.field", "actions.detail.current",
      "actions.detail.proposed", "actions.detail.preview",
      "actions.detail.profile", "actions.detail.overwrite", "actions.detail.stateAdd", "actions.detail.stateNone",
      "actions.detail.servicesToCreate", "actions.detail.opportunitiesToCreate", "actions.detail.createDisclaimer",
      "actions.detail.competitors", "actions.detail.projectMissing", "actions.detail.none",
      "claude.apps.scope.needsApproval",
      "actions.resolve.approve", "actions.resolve.approveTitle", "actions.resolve.approveBody", "actions.resolve.approveBodySetup",
      "actions.resolve.reject", "actions.resolve.rejectTitle", "actions.resolve.rejectBody",
      "actions.resolve.rejectConfirm", "actions.resolve.notePlaceholder",
      "actions.resolve.appliedToast", "actions.resolve.rejectedToast",
      "actions.resolve.error.not_found", "actions.resolve.error.not_pending", "actions.resolve.error.expired",
      "actions.resolve.error.target_missing", "actions.resolve.error.invalid", "actions.resolve.error.conflict",
      "actions.resolve.error.error",
    ];
    for (const dict of [en, pl, sv, da]) {
      for (const key of keys) expect(dict[key], key).toBeTruthy();
    }
    expect(en["actions.safety"]).toBe("Claude can create proposals for review. Nothing is applied until you approve it.");
    expect(en["actions.empty.title"]).toBe("No pending actions yet.");
  });
});
