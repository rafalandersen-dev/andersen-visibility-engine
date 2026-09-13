import { z } from "zod";
import { readAdmittedTeamProject } from "./project-team-read-admission.server";
import { projectTeamRpc } from "./project-team-membership.server";
import type { TeamReadRpc } from "./project-team-read.server";
import { teamProjectTarget } from "./project-team-view";
import { readWorkspaceRow } from "./workspace.server";
import { clipUtf8, specialistTool, toolAllowed, type SpecialistTool } from "./milo-specialist";
import { specialistRoles, type SpecialistRole } from "./specialist-team";
import type { ConversationEvent } from "./milo-conversation";
import type { Project, ServiceItem, Opportunity, AuditResult } from "./types";

type Target = z.infer<typeof teamProjectTarget>;
export interface SpecialistToolResult {
  state: "completed" | "unavailable";
  evidence: string;
  reference?: ConversationEvent["reference"];
}
export interface SpecialistToolContext {
  actorId: string;
  target: Target;
  role: SpecialistRole;
  operationId: string;
  jobId: string;
  signal: AbortSignal;
  beforeDispatch: () => Promise<void>;
  allowDraftGeneration?: boolean;
}
export interface SpecialistToolDeps {
  rpc: TeamReadRpc;
  workspace: typeof readWorkspaceRow;
  knowledge: typeof import("./project-knowledge.server").loadProjectKnowledgeContext;
  weekly: typeof import("./weekly-preparation.server").readWeeklyPreparation;
  generate: (
    actor: string,
    data: {
      project: Project;
      services: ServiceItem[];
      opportunity: Opportunity;
      assetType:
        | "brief"
        | "article"
        | "servicePage"
        | "landingPage"
        | "faq"
        | "comparison"
        | "gbpPost"
        | "meta"
        | "socialPack";
    },
    metering: {
      enforceLimit: boolean;
      attempt: { requestId: string; jobId: string };
      signal: AbortSignal;
      beforeDispatch: () => Promise<void>;
    },
  ) => Promise<{ generationReceiptId: string; resultId: string }>;
}
const production: SpecialistToolDeps = {
  rpc: projectTeamRpc,
  workspace: readWorkspaceRow,
  knowledge: async (...args) =>
    (await import("./project-knowledge.server")).loadProjectKnowledgeContext(...args),
  weekly: async (...args) =>
    (await import("./weekly-preparation.server")).readWeeklyPreparation(...args),
  generate: async (...args) => (await import("./ai.functions")).generateContentCore(...args),
};
function result(data: unknown, reference?: ConversationEvent["reference"]): SpecialistToolResult {
  const full = JSON.stringify(data);
  const content = clipUtf8(full, 5000);
  return {
    state: "completed",
    evidence: JSON.stringify({ content, partial: content !== full }),
    ...(reference ? { reference } : {}),
  };
}
async function ownerState(context: SpecialistToolContext, deps: SpecialistToolDeps) {
  if (context.actorId !== context.target.ownerId) throw new Error("Owner tool unavailable.");
  context.signal.throwIfAborted();
  const row = await deps.workspace(context.actorId);
  context.signal.throwIfAborted();
  if (!row || !Array.isArray(row.data.projects) || row.data.projects.length > 200)
    throw new Error("Project context unavailable.");
  const project = (row.data.projects as Project[]).find((p) => p.id === context.target.projectId);
  if (!project) throw new Error("Project context unavailable.");
  return { row, project };
}
export async function runSpecialistTool(
  raw: SpecialistTool,
  context: SpecialistToolContext,
  deps: SpecialistToolDeps = production,
): Promise<SpecialistToolResult> {
  const tool = specialistTool.parse(raw);
  const actor = z.string().uuid().parse(context.actorId),
    target = teamProjectTarget.parse(context.target);
  const role = z.enum(specialistRoles).parse(context.role);
  z.string().uuid().parse(context.operationId);
  z.string().uuid().parse(context.jobId);
  context.signal.throwIfAborted();
  if (
    !toolAllowed(role, tool, actor === target.ownerId) ||
    (tool.name === "draft_generation" && context.allowDraftGeneration !== true)
  )
    return {
      state: "unavailable",
      evidence: JSON.stringify({ reason: "outside_current_role_or_owner_permission" }),
    };
  // Fresh safe projection also checks current account/project access before
  // any owner-only reader; do not turn a member into the client's owner.
  const snapshot = await readAdmittedTeamProject(
    actor,
    {
      ...target,
      ...(tool.name === "draft_read" || tool.name === "draft_seo_review"
        ? { assetId: tool.assetId }
        : {}),
    },
    deps.rpc,
  );
  context.signal.throwIfAborted();
  await context.beforeDispatch();
  if (tool.name === "project_brief") {
    let opportunities: Array<Pick<Opportunity, "id" | "title" | "language" | "status">> = [];
    let omittedOpportunities = 0;
    if (actor === target.ownerId) {
      const { row } = await ownerState(context, deps);
      if (!Array.isArray(row.data.opportunities) || row.data.opportunities.length > 10000)
        throw new Error("Opportunity context unavailable.");
      const matches = (row.data.opportunities as Opportunity[]).filter(
        (o) => o.projectId === target.projectId && !o.deletedAt && !o.archivedAt,
      );
      opportunities = matches.slice(0, 25).map((o) => ({
        id: o.id,
        title: clipUtf8(o.title, 300),
        language: o.language,
        status: o.status,
      }));
      omittedOpportunities = Math.max(0, matches.length - opportunities.length);
    }
    return result(
      {
        project: snapshot.project,
        drafts: snapshot.drafts.slice(0, 25),
        omittedDrafts: snapshot.remaining + Math.max(0, snapshot.drafts.length - 25),
        opportunities,
        omittedOpportunities,
        source: "saved_project_context",
        fetchedWebsite: false,
      },
      { kind: "project", id: target.projectId },
    );
  }
  if (tool.name === "draft_read" || tool.name === "draft_seo_review") {
    const draft = snapshot.draft;
    if (!draft) throw new Error("Draft context unavailable.");
    const version = {
      workspaceRevision: snapshot.workspaceRevision,
      draftHash: snapshot.draftHash,
      observedAt: new Date().toISOString(),
    };
    if (tool.name === "draft_read")
      return result(
        {
          draft: {
            id: draft.id,
            title: draft.title,
            status: draft.status,
            metaTitle: draft.metaTitle,
            metaDescription: draft.metaDescription,
            markdown: clipUtf8(draft.markdown, 5000),
            partialBody: new TextEncoder().encode(draft.markdown).byteLength > 5000,
          },
          version,
        },
        { kind: "draft", id: draft.id },
      );
    return result(
      {
        source: "saved_draft_structure",
        liveWebsiteChecked: false,
        rankingMeasured: false,
        draftId: draft.id,
        title: draft.title,
        ...version,
        wordCount: draft.markdown.trim() ? draft.markdown.trim().split(/\s+/u).length : 0,
        h2Count: (draft.markdown.match(/^##\s+.+/gm) ?? []).length,
        h3Count: (draft.markdown.match(/^###\s+.+/gm) ?? []).length,
        metaTitleCharacters: [...draft.metaTitle].length,
        metaDescriptionCharacters: [...draft.metaDescription].length,
        hasTitle: !!draft.title.trim(),
        hasBody: !!draft.markdown.trim(),
        limitations:
          "Text syntax counts include code/examples. No SEO score, index check, source verification or publication approval was produced.",
        bodyExcerpt: clipUtf8(draft.markdown, 4500),
        partialBody: new TextEncoder().encode(draft.markdown).byteLength > 4500,
      },
      { kind: "draft", id: draft.id },
    );
  }
  if (tool.name === "project_knowledge") {
    const knowledge = await deps.knowledge(target, "text");
    context.signal.throwIfAborted();
    return result(
      {
        context: knowledge.context,
        references: knowledge.references,
        conflicts: knowledge.conflicts,
        omitted: knowledge.omitted,
        sourceDependencies: knowledge.sourceDependencies,
      },
      { kind: "knowledge", id: target.projectId },
    );
  }
  if (tool.name === "weekly_preparation") {
    const weekly = await deps.weekly(target, tool.weekStart);
    context.signal.throwIfAborted();
    return result(
      {
        weekStart: tool.weekStart,
        enabled: weekly.enabled,
        engine: weekly.control.engine,
        readiness: weekly.readiness,
        stages: weekly.stages.map((stage) => ({
          stage: stage.stage,
          state: stage.state,
          deliveredAt: stage.deliveredAt,
          requestId: stage.requestId,
        })),
        note: "Read only; no preparation, scheduling or publication was started.",
      },
      { kind: "weekly", id: target.projectId },
    );
  }
  const { row, project } = await ownerState(context, deps);
  if (tool.name === "saved_audit") {
    if (!Array.isArray(row.data.audits) || row.data.audits.length > 5000)
      throw new Error("Audit context unavailable.");
    const audit = (row.data.audits as AuditResult[])
      .filter((a) => a.projectId === target.projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return result(
      audit
        ? {
            id: audit.id,
            createdAt: audit.createdAt,
            fetchedWebsite: audit.fetchedWebsite,
            summary: audit.summary,
            topFixes: audit.topFixes,
            findings: audit.findings.slice(0, 15).map((f) => ({
              title: f.title,
              category: f.category,
              severity: f.severity,
              explanation: f.explanation,
              recommendation: f.recommendation,
            })),
            omittedFindings: Math.max(0, audit.findings.length - 15),
            note: "Historical audit; no new fetch or measurement.",
          }
        : { audit: null, note: "No saved audit. This is missing evidence, not a clean audit." },
      { kind: "audit", id: target.projectId },
    );
  }
  if (
    !Array.isArray(row.data.opportunities) ||
    row.data.opportunities.length > 10000 ||
    !Array.isArray(row.data.services) ||
    row.data.services.length > 10000
  )
    throw new Error("Generation context unavailable.");
  const opportunity = (row.data.opportunities as Opportunity[]).find(
    (o) =>
      o.id === tool.opportunityId &&
      o.projectId === target.projectId &&
      !o.deletedAt &&
      !o.archivedAt,
  );
  if (!opportunity) throw new Error("Generation opportunity unavailable.");
  const services = (row.data.services as ServiceItem[]).filter(
    (s) => s.projectId === target.projectId,
  );
  if (services.length > 100) throw new Error("Generation context too large.");
  context.signal.throwIfAborted();
  const generated = await deps.generate(
    actor,
    { project, services, opportunity, assetType: tool.assetType },
    {
      enforceLimit: true,
      attempt: { requestId: context.operationId, jobId: context.jobId },
      signal: context.signal,
      beforeDispatch: context.beforeDispatch,
    },
  );
  const id = z.string().uuid().parse(generated.generationReceiptId);
  return result(
    {
      retained: true,
      generationResultId: id,
      title: opportunity.title,
      assetType: tool.assetType,
      published: false,
      editorImportRequired: true,
    },
    { kind: "generation", id },
  );
}
