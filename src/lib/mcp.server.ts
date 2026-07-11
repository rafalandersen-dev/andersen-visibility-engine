/**
 * Claude Connector (MCP) v1 — SERVER-ONLY. Implements a minimal MCP server
 * (JSON-RPC 2.0, Streamable HTTP) exposing READ-ONLY tools over a user's Milo
 * workspace, plus connection-token management.
 *
 * Auth model: a Bearer token (milo_mcp_…) that the user generates in the app.
 * Only the SHA-256 hash is stored (mcp_connections, service-role). Tokens are
 * never returned after creation, never logged. All tools are scoped to the
 * resolved user's own workspace. Never import from client code.
 */
import type {
  Project,
  Opportunity,
  ContentAsset,
  AuditResult,
  AuthorityOpportunity,
  ServiceItem,
  GrowthTask,
} from "./types";

export const MCP_TOKEN_PREFIX = "milo_mcp_";
export const MCP_SERVER_NAME = "milo-growth";
export const MCP_SERVER_VERSION = "1.0.0";
export const MCP_PROTOCOL_VERSION = "2024-11-05";

// ---- token helpers ----
function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateMcpToken(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return `${MCP_TOKEN_PREFIX}${b64url(bytes)}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data.buffer.slice(0) as ArrayBuffer);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

// ---- service-role DB access ----
interface TokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

// Loose but chainable + awaitable model of the supabase-js query builder.
type Chain<T> = {
  eq: (k: string, v: string) => Chain<T>;
  is: (k: string, v: null) => Chain<T>;
  order: (k: string, o: { ascending: boolean }) => Promise<{ data: T[] | null; error: unknown }>;
  maybeSingle: () => Promise<{ data: T | null; error: unknown }>;
} & Promise<{ data: T | null; error: unknown }>;

type AdminClient = {
  from: (t: string) => {
    select: (c: string) => Chain<TokenRow>;
    insert: (r: unknown) => Promise<{ error: { message: string } | null }>;
    update: (r: unknown) => Chain<never>;
  };
};

async function admin(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AdminClient;
}

export interface McpTokenMeta {
  id: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export async function createToken(userId: string, label: string): Promise<{ token: string; meta: McpTokenMeta }> {
  const token = generateMcpToken();
  const token_hash = await sha256Hex(token);
  const db = await admin();
  const created_at = new Date().toISOString();
  const { error } = await db.from("mcp_connections").insert({ user_id: userId, token_hash, label: label || null, created_at });
  if (error) throw new Error("Could not create the connection token.");
  return { token, meta: { id: "", label: label || null, createdAt: created_at, lastUsedAt: null } };
}

export async function listTokens(userId: string): Promise<McpTokenMeta[]> {
  const db = await admin();
  const { data } = await db.from("mcp_connections").select("id,label,created_at,last_used_at,revoked_at").eq("user_id", userId).is("revoked_at", null).order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({ id: r.id, label: r.label, createdAt: r.created_at, lastUsedAt: r.last_used_at }));
}

export async function revokeToken(userId: string, id: string): Promise<void> {
  const db = await admin();
  await db.from("mcp_connections").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).eq("id", id);
}

/** Resolve a Bearer token to its owning user id (or null). Updates last_used_at. */
export async function resolveUser(token: string): Promise<string | null> {
  if (!token || !token.startsWith(MCP_TOKEN_PREFIX)) return null;
  const token_hash = await sha256Hex(token);
  const db = await admin();
  const { data } = await db.from("mcp_connections").select("*").eq("token_hash", token_hash).is("revoked_at", null).maybeSingle();
  if (!data) return null;
  // Awaited: Cloudflare Workers may terminate the isolate right after the
  // response, dropping un-awaited writes. A failed touch must not fail auth.
  try {
    await db.from("mcp_connections").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).eq("user_id", data.user_id);
  } catch {
    /* best-effort */
  }
  return data.user_id;
}

// ---- workspace loading ----
interface Workspace {
  projects: Project[];
  services: ServiceItem[];
  opportunities: Opportunity[];
  content: ContentAsset[];
  audits: AuditResult[];
  authorityOpportunities: AuthorityOpportunity[];
}

async function loadWorkspace(userId: string): Promise<Workspace> {
  const db = await admin();
  const res = await (db as unknown as {
    from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: { data?: Partial<Workspace> } | null }> } } };
  }).from("workspaces").select("data").eq("user_id", userId).maybeSingle();
  const d = (res.data?.data ?? {}) as Partial<Workspace>;
  return {
    projects: d.projects ?? [],
    services: d.services ?? [],
    opportunities: d.opportunities ?? [],
    content: d.content ?? [],
    audits: d.audits ?? [],
    authorityOpportunities: d.authorityOpportunities ?? [],
  };
}

// ---- MCP tools (read-only) ----
interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (ws: Workspace, args: Record<string, unknown>) => unknown;
}

const projectId = { type: "string", description: "Milo project id (from list_projects)" };
const obj = (props: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties: props, required });

function resolveProject(ws: Workspace, args: Record<string, unknown>): Project | undefined {
  const id = typeof args.projectId === "string" ? args.projectId : "";
  return ws.projects.find((p) => p.id === id) ?? (ws.projects.length === 1 ? ws.projects[0] : undefined);
}

const TOOLS: McpTool[] = [
  {
    name: "list_projects",
    description: "List the user's Milo Growth projects (id, business, website, connector, market, language).",
    inputSchema: obj({}),
    run: (ws) =>
      ws.projects.map((p) => ({
        id: p.id,
        name: p.name,
        businessName: p.businessName,
        websiteUrl: p.websiteUrl,
        connectorType: p.connectorType ?? "custom",
        market: p.market,
        primaryLanguage: p.primaryLanguage,
        setupComplete: p.setupComplete ?? false,
      })),
  },
  {
    name: "get_project_brief",
    description: "Get a project's brand brief: business, audience, tone, services/products, Brand Intelligence (voice, allowed/forbidden claims, offers) and connector status.",
    inputSchema: obj({ projectId }, []),
    run: (ws, args) => {
      const p = resolveProject(ws, args);
      if (!p) return { error: "Project not found. Call list_projects." };
      const services = ws.services.filter((s) => s.projectId === p.id).map((s) => ({ name: s.name, kind: s.kind, priority: s.priority, description: s.description }));
      return {
        id: p.id,
        businessName: p.businessName,
        businessType: p.businessType,
        websiteUrl: p.websiteUrl,
        mainLocation: p.mainLocation,
        targetLocations: p.targetLocations,
        targetAudience: p.targetAudience,
        toneOfVoice: p.toneOfVoice,
        uniqueSellingPoints: p.uniqueSellingPoints,
        primaryLanguage: p.primaryLanguage,
        market: p.market,
        connectorType: p.connectorType ?? "custom",
        services,
        brandIntelligence: p.brandIntelligence
          ? {
              voice: p.brandIntelligence.voice,
              allowedClaims: p.brandIntelligence.claims?.allowedClaims,
              forbiddenClaims: p.brandIntelligence.claims?.forbiddenClaims,
              requiredCaveats: p.brandIntelligence.claims?.requiredCaveats,
              primaryOffers: p.brandIntelligence.offers?.primaryOffers,
            }
          : null,
      };
    },
  },
  {
    name: "list_opportunities",
    description: "List SEO/content opportunities for a project (title, content type, intent, priority, status).",
    inputSchema: obj({ projectId }, []),
    run: (ws, args) => {
      const p = resolveProject(ws, args);
      if (!p) return { error: "Project not found. Call list_projects." };
      return ws.opportunities
        .filter((o) => o.projectId === p.id)
        .map((o) => ({ id: o.id, title: o.title, contentType: o.contentType, searchIntent: o.searchIntent, priority: o.priority, status: o.status, language: o.language }));
    },
  },
  {
    name: "list_content",
    description: "List content assets for a project (title, type, status, Milo Score, publish + live status).",
    inputSchema: obj({ projectId }, []),
    run: (ws, args) => {
      const p = resolveProject(ws, args);
      if (!p) return { error: "Project not found. Call list_projects." };
      return ws.content
        .filter((c) => c.projectId === p.id)
        .map((c) => ({
          id: c.id,
          title: c.title,
          assetType: c.assetType,
          status: c.status,
          miloScore: c.qualityScore?.overall ?? null,
          miloScoreStatus: c.qualityScore?.status ?? null,
          publishStatus: c.publishStatus ?? "notSent",
          liveUrl: c.liveUrl ?? null,
          updatedAt: c.updatedAt,
        }));
    },
  },
  {
    name: "get_content",
    description: "Get one content asset in full: meta title/description, outline, markdown body, FAQ, internal links, and the full Milo Score breakdown if evaluated.",
    inputSchema: obj({ contentId: { type: "string", description: "Content asset id (from list_content)" } }, ["contentId"]),
    run: (ws, args) => {
      const id = typeof args.contentId === "string" ? args.contentId : "";
      const c = ws.content.find((x) => x.id === id);
      if (!c) return { error: "Content not found. Call list_content." };
      return {
        id: c.id,
        title: c.title,
        slug: c.slug,
        metaTitle: c.metaTitle,
        metaDescription: c.metaDescription,
        h1: c.h1,
        outline: c.outline,
        faq: c.faq,
        cta: c.cta,
        markdown: c.markdown,
        internalLinks: c.internalLinks,
        status: c.status,
        liveUrl: c.liveUrl ?? null,
        miloScore: c.qualityScore
          ? {
              overall: c.qualityScore.overall,
              status: c.qualityScore.status,
              publishingRecommendation: c.qualityScore.publishingRecommendation,
              summary: c.qualityScore.summary,
              topIssues: c.qualityScore.topIssues,
              quickWins: c.qualityScore.quickWins,
              categories: c.qualityScore.categories,
            }
          : null,
      };
    },
  },
  {
    name: "get_latest_audit",
    description: "Get the latest AI Visibility Readiness audit for a project: scores, summary, top fixes and findings.",
    inputSchema: obj({ projectId }, []),
    run: (ws, args) => {
      const p = resolveProject(ws, args);
      if (!p) return { error: "Project not found. Call list_projects." };
      const audit = [...ws.audits.filter((a) => a.projectId === p.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (!audit) return { note: "No audit has been run for this project yet." };
      return {
        createdAt: audit.createdAt,
        overallScore: audit.overallScore,
        seoScore: audit.seoScore,
        localScore: audit.localScore,
        aiReadinessScore: audit.aiReadinessScore,
        conversionScore: audit.conversionScore,
        summary: audit.summary,
        topFixes: audit.topFixes,
        findings: audit.findings.map((f) => ({ title: f.title, category: f.category, severity: f.severity, recommendation: f.recommendation })),
      };
    },
  },
  {
    name: "get_gsc_summary",
    description: "Get the latest Google Search Console import summary for a project (source, totals, top queries and pages).",
    inputSchema: obj({ projectId }, []),
    run: (ws, args) => {
      const p = resolveProject(ws, args);
      if (!p) return { error: "Project not found. Call list_projects." };
      const imports = p.gscLite?.imports ?? [];
      const latest = imports.find((i) => i.id === p.gscLite?.latestImportId) ?? imports[0];
      if (!latest) return { note: "No Search Console data (CSV or API) imported for this project yet." };
      const topQueries = latest.rows.filter((r) => r.query).sort((a, b) => b.clicks - a.clicks).slice(0, 10).map((r) => ({ query: r.query, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
      const topPages = latest.rows.filter((r) => r.page).sort((a, b) => b.clicks - a.clicks).slice(0, 10).map((r) => ({ page: r.page, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
      return {
        source: latest.source === "api" ? "api" : "csv",
        importedAt: latest.importedAt,
        dateRange: latest.dateRange,
        summary: latest.summary,
        topQueries,
        topPages,
      };
    },
  },
  {
    name: "list_authority_opportunities",
    description: "List Authority Builder opportunities for a project (type, title, priority, status, target).",
    inputSchema: obj({ projectId }, []),
    run: (ws, args) => {
      const p = resolveProject(ws, args);
      if (!p) return { error: "Project not found. Call list_projects." };
      return ws.authorityOpportunities
        .filter((a) => a.projectId === p.id)
        .map((a) => ({ id: a.id, type: a.type, title: a.title, priority: a.priority, status: a.status, target: a.suggestedPageToLink, difficulty: a.difficulty }));
    },
  },
];

// ---- JSON-RPC dispatch ----
interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
}

function result(id: JsonRpcMessage["id"], res: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result: res };
}
function rpcError(id: JsonRpcMessage["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

/** Required scope per MCP tool (reads + Phase 1A writes). */
export const TOOL_SCOPES: Record<string, string> = {
  list_projects: "milo.projects.read",
  get_project_brief: "milo.projects.read",
  list_opportunities: "milo.content.read",
  list_content: "milo.content.read",
  get_content: "milo.content.read",
  get_latest_audit: "milo.insights.read",
  get_gsc_summary: "milo.insights.read",
  list_authority_opportunities: "milo.authority.read",
  create_growth_task: "milo.tasks.write",
  create_project_recommendation: "milo.projects.write",
  create_pending_action: "milo.actions.propose",
  list_pending_actions: "milo.actions.propose",
  get_pending_action: "milo.actions.propose",
};

/** Names of the Phase 1A write tools (flag- and scope-gated). */
export const WRITE_TOOL_NAMES = ["create_growth_task", "create_project_recommendation"] as const;
type WriteToolName = (typeof WRITE_TOOL_NAMES)[number];

function isWriteTool(name: string): name is WriteToolName {
  return (WRITE_TOOL_NAMES as readonly string[]).includes(name);
}

/** Phase 1B pending-action tools — write-CLASS gating (flag + explicit scope). */
export const PENDING_TOOL_NAMES = ["create_pending_action", "list_pending_actions", "get_pending_action"] as const;
type PendingToolName = (typeof PENDING_TOOL_NAMES)[number];

function isPendingTool(name: string): name is PendingToolName {
  return (PENDING_TOOL_NAMES as readonly string[]).includes(name);
}

/**
 * A resolved caller. `scopes: null` means a legacy developer token (full
 * READ-ONLY access — never write tools). An array is an OAuth grant's scopes.
 * `writeEnabled` mirrors MCP_WRITE_TOOLS_ENABLED (supplied by the route).
 */
export interface McpGrant {
  userId: string;
  scopes: string[] | null;
  writeEnabled?: boolean;
  /** OAuth client_id (public identifier) — attribution + own-proposal visibility. */
  clientId?: string;
}

/** Whether a tool is callable under the given scopes.
 * Reads: null (developer token) = all; otherwise scope match.
 * Writes + pending actions: ALWAYS require an explicit OAuth scope match —
 * null (developer token) never qualifies. */
export function toolAllowed(name: string, scopes: string[] | null): boolean {
  const required = TOOL_SCOPES[name];
  if (!required) return false;
  if (isWriteTool(name) || isPendingTool(name)) return scopes !== null && scopes.includes(required);
  if (scopes === null) return true;
  return scopes.includes(required);
}

function toolDefs(scopes: string[] | null, writeEnabled: boolean) {
  const reads = TOOLS.filter((t) => toolAllowed(t.name, scopes)).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
  if (!writeEnabled) return reads;
  const writes = WRITE_TOOLS.filter((t) => toolAllowed(t.name, scopes)).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: t.annotations,
  }));
  const pending = PENDING_TOOLS.filter((t) => toolAllowed(t.name, scopes)).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: t.annotations,
  }));
  return [...reads, ...writes, ...pending];
}

// ---------------------------------------------------------------------------
// Phase 1A write tools — create-only, flag- and scope-gated, all writes via
// the rev-guarded workspace.server.mutateWorkspace. No deletes, no publish.
// ---------------------------------------------------------------------------

/** Runtime mirror of the ContentType union (types are erased at runtime). */
const CONTENT_TYPES = ["Landing Page", "Service Page", "Blog Article", "Guide", "FAQ Page", "Comparison", "Location Page"];
const PRIORITIES = ["High", "Medium", "Low"];
const LANGUAGES = ["Polish", "Swedish", "English", "Danish"];
const MAX_TASKS = 500;
const MAX_OPPORTUNITIES = 1000;

const WRITE_ANNOTATIONS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false };

interface WriteToolDef {
  name: WriteToolName;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: typeof WRITE_ANNOTATIONS;
}

const WRITE_TOOLS: WriteToolDef[] = [
  {
    name: "create_growth_task",
    description:
      "Create a growth task in a Milo project (write). Confirm with the user before calling. Pass a stable requestId to make retries safe.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["projectId", "title"],
      properties: {
        projectId: { type: "string", description: "Milo project id (from list_projects)" },
        title: { type: "string", minLength: 1, maxLength: 200 },
        description: { type: "string", maxLength: 2000 },
        dueOn: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "YYYY-MM-DD" },
        priority: { type: "string", enum: PRIORITIES },
        requestId: { type: "string", maxLength: 100, description: "Idempotency key" },
      },
    },
    annotations: WRITE_ANNOTATIONS,
  },
  {
    name: "create_project_recommendation",
    description:
      "Add a growth recommendation (opportunity) to a Milo project (write). Confirm with the user before calling. Pass a stable requestId to make retries safe.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["projectId", "title"],
      properties: {
        projectId: { type: "string", description: "Milo project id (from list_projects)" },
        title: { type: "string", minLength: 1, maxLength: 200 },
        rationale: { type: "string", maxLength: 2000, description: "Why this matters for the business" },
        contentType: { type: "string", enum: CONTENT_TYPES },
        priority: { type: "string", enum: PRIORITIES },
        requestId: { type: "string", maxLength: 100, description: "Idempotency key" },
      },
    },
    annotations: WRITE_ANNOTATIONS,
  },
];

class WriteValidationError extends Error {
  constructor(
    public readonly field: string,
    public readonly reason: string,
  ) {
    super(`${field}: ${reason}`);
    this.name = "WriteValidationError";
  }
}
class EntityNotFoundError extends Error {}

interface WriteInput {
  projectId: string;
  title: string;
  description?: string;
  dueOn?: string;
  rationale?: string;
  contentType?: string;
  priority?: string;
  requestId?: string;
}

/** Validate write-tool args (strict: unknown fields rejected). Throws WriteValidationError. */
function validateWriteArgs(name: WriteToolName, args: Record<string, unknown>): WriteInput {
  const allowed = name === "create_growth_task" ? ["projectId", "title", "description", "dueOn", "priority", "requestId"] : ["projectId", "title", "rationale", "contentType", "priority", "requestId"];
  for (const k of Object.keys(args)) if (!allowed.includes(k)) throw new WriteValidationError(k, "unknown field");

  const str = (k: string, v: unknown, min: number, max: number, required: boolean): string | undefined => {
    if (v === undefined || v === null) {
      if (required) throw new WriteValidationError(k, "is required");
      return undefined;
    }
    if (typeof v !== "string") throw new WriteValidationError(k, "must be a string");
    const t = v.trim();
    if (t.length < min) throw new WriteValidationError(k, `must be at least ${min} character(s)`);
    if (t.length > max) throw new WriteValidationError(k, `must be at most ${max} characters`);
    return t;
  };

  const input: WriteInput = {
    projectId: str("projectId", args.projectId, 1, 100, true)!,
    title: str("title", args.title, 1, 200, true)!,
    requestId: str("requestId", args.requestId, 1, 100, false),
  };
  const priority = str("priority", args.priority, 1, 10, false);
  if (priority !== undefined && !PRIORITIES.includes(priority)) throw new WriteValidationError("priority", "must be High, Medium or Low");
  input.priority = priority;

  if (name === "create_growth_task") {
    input.description = str("description", args.description, 1, 2000, false);
    const dueOn = str("dueOn", args.dueOn, 1, 10, false);
    if (dueOn !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) throw new WriteValidationError("dueOn", "must be YYYY-MM-DD");
    input.dueOn = dueOn;
  } else {
    input.rationale = str("rationale", args.rationale, 1, 2000, false);
    const contentType = str("contentType", args.contentType, 1, 40, false);
    if (contentType !== undefined && !CONTENT_TYPES.includes(contentType)) throw new WriteValidationError("contentType", "must be a valid Milo content type");
    input.contentType = contentType;
  }
  return input;
}

/** Hooks the route supplies so this module stays DB/audit-agnostic for writes. */
export interface McpHooks {
  /** Rate-limit verdict for a write call (fail-open handled by the limiter). */
  checkWriteLimit?: () => Promise<{ allowed: boolean; shouldAudit: boolean; windowStartIso: string; retryAfterSec: number }>;
  /** Awaited audit sink (mcp_write / rate_limited). Must never throw. */
  audit?: (event: string, detail: Record<string, unknown>) => Promise<void>;
}

/** Execute a validated write tool via the rev-guarded workspace write layer. */
async function runWriteTool(userId: string, name: WriteToolName, input: WriteInput): Promise<{ entityId: string; deduped: boolean }> {
  const { mutateWorkspace } = await import("./workspace.server");
  // Ids + timestamps minted BEFORE the mutation: rev-conflict retries re-run
  // the callback and must not generate fresh identity.
  const entityId = Math.random().toString(36).slice(2, 10);
  const nowIso = new Date().toISOString();

  const { result } = await mutateWorkspace<{ entityId: string; deduped: boolean }>(userId, (data) => {
    const projects = ((data.projects as Partial<Project>[] | undefined) ?? []).filter(Boolean);
    const project = projects.find((p) => p.id === input.projectId);
    if (!project) throw new EntityNotFoundError();

    if (name === "create_growth_task") {
      const tasks = ((data.tasks as GrowthTask[] | undefined) ?? []).filter(Boolean);
      if (input.requestId) {
        const existing = tasks.find((t) => t.requestId === input.requestId);
        if (existing) return { data, result: { entityId: String(existing.id), deduped: true } };
      }
      if (tasks.length >= MAX_TASKS) throw new WriteValidationError("tasks", "task limit reached for this workspace");
      const task: GrowthTask = {
        id: entityId,
        projectId: input.projectId,
        title: input.title,
        ...(input.description ? { description: input.description } : {}),
        ...(input.dueOn ? { dueOn: input.dueOn } : {}),
        ...(input.priority ? { priority: input.priority as GrowthTask["priority"] } : {}),
        status: "open",
        origin: "claude",
        ...(input.requestId ? { requestId: input.requestId } : {}),
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      return { data: { ...data, tasks: [...tasks, task] }, result: { entityId, deduped: false } };
    }

    const opportunities = ((data.opportunities as Opportunity[] | undefined) ?? []).filter(Boolean);
    if (input.requestId) {
      const existing = opportunities.find((o) => o.requestId === input.requestId);
      if (existing) return { data, result: { entityId: String(existing.id), deduped: true } };
    }
    if (opportunities.length >= MAX_OPPORTUNITIES) throw new WriteValidationError("opportunities", "opportunity limit reached for this workspace");
    const language = LANGUAGES.includes(String(project.primaryLanguage)) ? (project.primaryLanguage as Opportunity["language"]) : "English";
    const opportunity: Opportunity = {
      id: entityId,
      projectId: input.projectId,
      title: input.title,
      language,
      contentType: (input.contentType ?? "Blog Article") as Opportunity["contentType"],
      searchIntent: "Informational",
      targetAudience: String(project.targetAudience ?? ""),
      businessValue: input.rationale ?? "Suggested via the Claude connector",
      recommendedCta: "",
      priority: (input.priority ?? "Medium") as Opportunity["priority"],
      status: "Linked", // regeneration only replaces "New" — Linked survives
      source: "claude",
      ...(input.requestId ? { requestId: input.requestId } : {}),
      createdAt: nowIso,
    };
    return { data: { ...data, opportunities: [...opportunities, opportunity] }, result: { entityId, deduped: false } };
  });
  return result;
}

/** Names of the caller-provided fields (for audit fieldsChanged — names only, never values). Sorted for deterministic audits. */
function providedFieldNames(input: WriteInput): string[] {
  return (Object.keys(input) as (keyof WriteInput)[])
    .filter((k) => k !== "projectId" && k !== "requestId" && input[k] !== undefined)
    .map(String)
    .sort();
}

/** Execute one write tool call end-to-end: rate limit → validate → mutate → audit. */
async function dispatchWriteTool(
  grant: McpGrant,
  id: JsonRpcMessage["id"],
  name: WriteToolName,
  args: Record<string, unknown>,
  hooks?: McpHooks,
): Promise<object> {
  // Rate limit before validation or any DB work (fail-open inside the limiter).
  if (hooks?.checkWriteLimit) {
    const rl = await hooks.checkWriteLimit();
    if (rl.shouldAudit) await hooks.audit?.("rate_limited", { bucket: "write", window_start: rl.windowStartIso });
    if (!rl.allowed) return rpcError(id, -32003, "Rate limit reached for this tool — try again later.");
  }

  let input: WriteInput;
  try {
    input = validateWriteArgs(name, args);
  } catch (e) {
    if (e instanceof WriteValidationError) return rpcError(id, -32010, `Invalid ${e.field}: ${e.reason}.`);
    throw e;
  }

  // Audit detail: names/ids only — titles, descriptions and rationale are user
  // content and never enter the log.
  const auditBase: Record<string, unknown> = {
    tool: name,
    projectId: input.projectId,
    action: "create",
    fieldsChanged: providedFieldNames(input),
    ...(input.requestId ? { requestId: input.requestId } : {}),
  };

  try {
    const { entityId, deduped } = await runWriteTool(grant.userId, name, input);
    await hooks?.audit?.("mcp_write", { ...auditBase, entityIds: [entityId], ...(deduped ? { deduped: true } : {}), ok: true });
    const payload =
      name === "create_growth_task"
        ? { taskId: entityId, projectId: input.projectId, status: "open", ...(deduped ? { deduped: true } : {}) }
        : { opportunityId: entityId, projectId: input.projectId, status: "Linked", ...(deduped ? { deduped: true } : {}) };
    return result(id, { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] });
  } catch (e) {
    const { WorkspaceConflictError, WorkspaceNotFoundError } = await import("./workspace.server");
    if (e instanceof EntityNotFoundError || e instanceof WorkspaceNotFoundError) {
      await hooks?.audit?.("mcp_write", { ...auditBase, ok: false, error: "not_found" });
      // Uniform: unknown project id and foreign user's project id are indistinguishable.
      return rpcError(id, -32011, "Not found.");
    }
    if (e instanceof WriteValidationError) {
      await hooks?.audit?.("mcp_write", { ...auditBase, ok: false, error: "validation" });
      return rpcError(id, -32010, `Invalid ${e.field}: ${e.reason}.`);
    }
    if (e instanceof WorkspaceConflictError) {
      await hooks?.audit?.("mcp_write", { ...auditBase, ok: false, error: "conflict" });
      return rpcError(id, -32012, "Workspace busy — try again.");
    }
    await hooks?.audit?.("mcp_write", { ...auditBase, ok: false, error: "internal" });
    return result(id, { content: [{ type: "text", text: "Milo could not complete that request." }], isError: true });
  }
}

// ---------------------------------------------------------------------------
// Phase 1B pending-action tools — Claude proposes, the owner approves in the
// Milo UI. Same double-gating as the 1A writes (flag + explicit scope); all
// mutations go through pending-actions.server over the rev-guarded write
// layer. list/get are read-shaped but stay behind the propose scope (they
// expose Claude-authored payloads) and are visibility-filtered to the calling
// client's own proposals.
// ---------------------------------------------------------------------------

const PENDING_STATUSES = ["pending", "approved", "rejected", "applied", "expired"];
const PENDING_TYPES = ["opportunity_update_proposal"];
const LIST_PENDING_DEFAULT_LIMIT = 50;
const LIST_PENDING_MAX_LIMIT = 100;

interface PendingToolDef {
  name: PendingToolName;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean };
}

const PENDING_TOOLS: PendingToolDef[] = [
  {
    name: "create_pending_action",
    description:
      "Propose a change for the Milo owner to review (write). Nothing is applied until the owner approves it in Milo. Confirm with the user before calling. Pass a stable requestId to make retries safe.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["type", "projectId", "title", "summary", "payload"],
      properties: {
        type: { type: "string", enum: PENDING_TYPES },
        projectId: { type: "string", description: "Milo project id (from list_projects)" },
        title: { type: "string", minLength: 1, maxLength: 200 },
        summary: { type: "string", minLength: 1, maxLength: 500, description: "Plain-language description of what this proposal does" },
        payload: {
          type: "object",
          additionalProperties: false,
          required: ["opportunityId", "updates"],
          properties: {
            opportunityId: { type: "string", description: "Target opportunity id (from list_opportunities)" },
            updates: {
              type: "object",
              additionalProperties: false,
              minProperties: 1,
              properties: {
                title: { type: "string", maxLength: 200 },
                businessValue: { type: "string", maxLength: 2000 },
                priority: { type: "string", enum: ["High", "Medium", "Low"] },
                contentType: { type: "string", enum: ["Landing Page", "Service Page", "Blog Article", "Guide", "FAQ Page", "Comparison", "Location Page"] },
                recommendedCta: { type: "string", maxLength: 200 },
              },
            },
          },
        },
        preview: { type: "string", maxLength: 4096, description: "Optional markdown preview shown to the owner; derived from the payload when omitted" },
        requestId: { type: "string", maxLength: 100, description: "Idempotency key" },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  {
    name: "list_pending_actions",
    description: "List the pending actions this connection has proposed (summaries only — use get_pending_action for full detail).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        projectId: { type: "string" },
        status: { type: "string", enum: PENDING_STATUSES },
        type: { type: "string", enum: PENDING_TYPES },
        limit: { type: "integer", minimum: 1, maximum: LIST_PENDING_MAX_LIMIT },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "get_pending_action",
    description: "Get one pending action this connection proposed, including its payload, preview and resolution.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["actionId"],
      properties: { actionId: { type: "string" } },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
];

/** Best-effort human preview when the caller omits one. Clipped to the 4KB cap. */
function derivePendingPreview(payload: unknown): string {
  const p = (payload ?? {}) as { opportunityId?: unknown; updates?: Record<string, unknown> };
  const lines = [`Update opportunity ${typeof p.opportunityId === "string" ? p.opportunityId : "?"}:`];
  if (p.updates && typeof p.updates === "object" && !Array.isArray(p.updates)) {
    for (const [k, v] of Object.entries(p.updates)) lines.push(`- ${k} → ${typeof v === "string" ? v : JSON.stringify(v)}`);
  }
  const text = lines.join("\n");
  return text.length > 4000 ? `${text.slice(0, 4000)}…` : text;
}

/** Execute one pending-action tool call. Scope/flag checks happen in the caller. */
async function dispatchPendingTool(
  grant: McpGrant,
  id: JsonRpcMessage["id"],
  name: PendingToolName,
  args: Record<string, unknown>,
  hooks?: McpHooks,
): Promise<object> {
  const {
    createPendingActionForWorkspace,
    listPendingActionsForWorkspace,
    getPendingActionForWorkspace,
    buildPendingActionCreatedAudit,
    PendingActionNotFoundError,
  } = await import("./pending-actions.server");
  const { PendingActionValidationError, PendingActionCapError, MILO_ACTIONS_PROPOSE_SCOPE, OPPORTUNITY_UPDATE_FIELDS } = await import("./pending-actions");
  const { WorkspaceConflictError, WorkspaceNotFoundError } = await import("./workspace.server");

  if (name === "create_pending_action") {
    // Mutating: rides the shared write rate bucket, exactly like the 1A tools.
    if (hooks?.checkWriteLimit) {
      const rl = await hooks.checkWriteLimit();
      if (rl.shouldAudit) await hooks.audit?.("rate_limited", { bucket: "write", window_start: rl.windowStartIso });
      if (!rl.allowed) return rpcError(id, -32003, "Rate limit reached for this tool — try again later.");
    }

    // Audit base for FAILURE rows: names/ids only — titles, summaries, previews
    // and payload values are user content and never enter the log. fieldsChanged
    // is intersected with the whitelist so a malformed call's arbitrary unknown
    // update keys (e.g. seoTitle, publish, delete, billing) can NEVER appear;
    // only known field names survive (the success row uses the validated action).
    const updates = (args.payload as { updates?: Record<string, unknown> } | undefined)?.updates;
    const rawUpdateKeys = updates && typeof updates === "object" && !Array.isArray(updates) ? Object.keys(updates) : [];
    const auditBase: Record<string, unknown> = {
      type: typeof args.type === "string" ? args.type : "unknown",
      ...(typeof args.projectId === "string" ? { projectId: args.projectId } : {}),
      requiredScope: MILO_ACTIONS_PROPOSE_SCOPE,
      fieldsChanged: rawUpdateKeys.filter((k) => (OPPORTUNITY_UPDATE_FIELDS as readonly string[]).includes(k)).sort(),
      ...(typeof args.requestId === "string" ? { requestId: args.requestId } : {}),
    };

    try {
      const input = {
        ...(args as object),
        ...(args.preview === undefined ? { preview: derivePendingPreview(args.payload) } : {}),
        proposedByClientId: grant.clientId,
      } as Parameters<typeof createPendingActionForWorkspace>[1];
      const { action, deduped, expiredIds, rev } = await createPendingActionForWorkspace(grant.userId, input);
      const audit = buildPendingActionCreatedAudit(action, { ok: true, ...(deduped ? { deduped: true } : {}) });
      await hooks?.audit?.(audit.event, { ...audit.detail, ...(expiredIds.length ? { expiredIds } : {}) });
      const payload = {
        actionId: action.id,
        type: action.type,
        projectId: action.projectId,
        status: action.status,
        riskLevel: action.riskLevel,
        requiredScope: action.requiredScope,
        ...(action.requestId ? { requestId: action.requestId } : {}),
        deduped,
        ...(expiredIds.length ? { expiredIds } : {}),
        rev,
      };
      return result(id, { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] });
    } catch (e) {
      if (e instanceof PendingActionValidationError) {
        await hooks?.audit?.("pending_action_created", { ...auditBase, ok: false, error: "validation" });
        return rpcError(id, -32010, `Invalid ${e.field}: ${e.reason}.`);
      }
      if (e instanceof PendingActionCapError) {
        await hooks?.audit?.("pending_action_created", { ...auditBase, ok: false, error: "cap" });
        return rpcError(id, -32013, "Pending action limit reached — resolve some proposals in Milo first.");
      }
      if (e instanceof PendingActionNotFoundError || e instanceof WorkspaceNotFoundError) {
        await hooks?.audit?.("pending_action_created", { ...auditBase, ok: false, error: "not_found" });
        // Uniform: unknown project/opportunity and foreign ids are indistinguishable.
        return rpcError(id, -32011, "Not found.");
      }
      if (e instanceof WorkspaceConflictError) {
        await hooks?.audit?.("pending_action_created", { ...auditBase, ok: false, error: "conflict" });
        return rpcError(id, -32012, "Workspace busy — try again.");
      }
      await hooks?.audit?.("pending_action_created", { ...auditBase, ok: false, error: "internal" });
      return result(id, { content: [{ type: "text", text: "Milo could not complete that request." }], isError: true });
    }
  }

  try {
    if (name === "list_pending_actions") {
      for (const k of Object.keys(args)) {
        if (!["projectId", "status", "type", "limit"].includes(k)) return rpcError(id, -32010, `Invalid ${k}: unknown field.`);
      }
      if (args.status !== undefined && !PENDING_STATUSES.includes(args.status as string)) return rpcError(id, -32010, "Invalid status: unknown value.");
      if (args.type !== undefined && !PENDING_TYPES.includes(args.type as string)) return rpcError(id, -32010, "Invalid type: unknown value.");
      let limit = LIST_PENDING_DEFAULT_LIMIT;
      if (args.limit !== undefined) {
        if (typeof args.limit !== "number" || !Number.isInteger(args.limit) || args.limit < 1 || args.limit > LIST_PENDING_MAX_LIMIT) {
          return rpcError(id, -32010, `Invalid limit: must be an integer between 1 and ${LIST_PENDING_MAX_LIMIT}.`);
        }
        limit = args.limit;
      }
      const summaries = await listPendingActionsForWorkspace(grant.userId, {
        ...(typeof args.projectId === "string" ? { projectId: args.projectId } : {}),
        ...(typeof args.status === "string" ? { status: args.status as never } : {}),
        ...(typeof args.type === "string" ? { type: args.type as never } : {}),
        // Own-proposal visibility: this connection sees only what it proposed.
        proposedByClientId: grant.clientId ?? "",
      });
      const actions = summaries.slice(0, limit);
      return result(id, { content: [{ type: "text", text: JSON.stringify({ actions, count: actions.length }, null, 2) }] });
    }

    // get_pending_action
    for (const k of Object.keys(args)) {
      if (k !== "actionId") return rpcError(id, -32010, `Invalid ${k}: unknown field.`);
    }
    if (typeof args.actionId !== "string" || !args.actionId.trim()) return rpcError(id, -32010, "Invalid actionId: is required.");
    const action = await getPendingActionForWorkspace(grant.userId, args.actionId.trim());
    // Uniform not-found for other clients' proposals — indistinguishable from missing.
    if (!grant.clientId || action.proposedByClientId !== grant.clientId) return rpcError(id, -32011, "Not found.");
    return result(id, { content: [{ type: "text", text: JSON.stringify(action, null, 2) }] });
  } catch (e) {
    if (e instanceof PendingActionNotFoundError || e instanceof WorkspaceNotFoundError) return rpcError(id, -32011, "Not found.");
    if (e instanceof PendingActionValidationError) return rpcError(id, -32010, `Invalid ${e.field}: ${e.reason}.`);
    return result(id, { content: [{ type: "text", text: "Milo could not complete that request." }], isError: true });
  }
}

/**
 * Handle one JSON-RPC message for a resolved grant. `tools/list` is filtered to
 * the grant's scopes (+ write flag) and `tools/call` rejects tools the grant
 * lacks scope for with a JSON-RPC error (the token is valid but unauthorized —
 * not a 401). Returns the response object, or null for notifications.
 */
export async function handleMcpMessage(grant: McpGrant, msg: JsonRpcMessage, hooks?: McpHooks): Promise<object | null> {
  const { method, id } = msg;
  const isNotification = id === undefined || id === null;
  const writeEnabled = grant.writeEnabled === true;

  if (method === "initialize") {
    return result(id, {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    });
  }
  if (method === "notifications/initialized" || method === "notifications/cancelled") {
    return null;
  }
  if (method === "ping") {
    return result(id, {});
  }
  if (method === "tools/list") {
    return result(id, { tools: toolDefs(grant.scopes, writeEnabled) });
  }
  if (method === "tools/call") {
    const name = typeof msg.params?.name === "string" ? msg.params.name : "";
    const args = (msg.params?.arguments as Record<string, unknown>) ?? {};

    if (isWriteTool(name)) {
      // Flag off ⇒ write tools are not part of the registry view at all.
      if (!writeEnabled) return rpcError(id, -32602, `Unknown tool: ${name}`);
      if (!toolAllowed(name, grant.scopes)) return rpcError(id, -32002, "Insufficient scope for this tool.");
      return dispatchWriteTool(grant, id, name, args, hooks);
    }

    if (isPendingTool(name)) {
      // Same registry-view gating as the 1A writes: flag off ⇒ unknown tool.
      if (!writeEnabled) return rpcError(id, -32602, `Unknown tool: ${name}`);
      if (!toolAllowed(name, grant.scopes)) return rpcError(id, -32002, "Insufficient scope for this tool.");
      return dispatchPendingTool(grant, id, name, args, hooks);
    }

    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) return rpcError(id, -32602, `Unknown tool: ${name}`);
    // Valid token but missing scope → JSON-RPC error, not 401. Message is
    // deliberately generic (does not reveal which scope would be needed).
    if (!toolAllowed(name, grant.scopes)) return rpcError(id, -32002, "Insufficient scope for this tool.");
    try {
      const ws = await loadWorkspace(grant.userId);
      const out = tool.run(ws, args);
      return result(id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
    } catch {
      return result(id, { content: [{ type: "text", text: "Milo could not complete that request." }], isError: true });
    }
  }

  if (isNotification) return null;
  return rpcError(id, -32601, `Method not found: ${method ?? "unknown"}`);
}

/** Names of exposed tools (for docs/UI). */
export function mcpToolNames(): string[] {
  return TOOLS.map((t) => t.name);
}

/**
 * Build the audit event for one handled MCP message (pure; the /api/mcp route
 * persists it). `mcp_denied` for insufficient-scope rejections (-32002),
 * `mcp_call` otherwise. Detail carries method/tool/outcome only — never
 * arguments, content, tokens, or response bodies.
 */
export interface McpAuditEvent {
  event: "mcp_call" | "mcp_denied";
  detail: Record<string, unknown>;
}

export function buildMcpAuditEvent(msg: Record<string, unknown> | null | undefined, response: object | null): McpAuditEvent | null {
  const method = typeof msg?.method === "string" ? msg.method : "unknown";
  const params = (msg?.params ?? {}) as Record<string, unknown>;
  const tool = method === "tools/call" && typeof params.name === "string" ? params.name : undefined;
  const res = response as { error?: { code?: number }; result?: { isError?: boolean } } | null;
  if (res?.error?.code === -32002 && tool) {
    return { event: "mcp_denied", detail: { tool, requiredScope: TOOL_SCOPES[tool] ?? null } };
  }
  // Write-tool outcomes are covered by mcp_write / rate_limited from the
  // dispatch hooks — skip the generic mcp_call to avoid double-logging. Same
  // for create_pending_action (covered by pending_action_created); the
  // read-shaped list/get pending tools keep normal mcp_call rows.
  if (tool && (isWriteTool(tool) || tool === "create_pending_action")) return null;
  const ok = response === null ? true : !res?.error && !res?.result?.isError;
  return { event: "mcp_call", detail: { method, ...(tool ? { tool } : {}), ok } };
}
