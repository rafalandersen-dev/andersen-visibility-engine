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
  // best-effort touch
  db.from("mcp_connections").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).eq("user_id", data.user_id);
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

/** Required read scope per MCP tool (Phase 4 OAuth scope enforcement). */
export const TOOL_SCOPES: Record<string, string> = {
  list_projects: "milo.projects.read",
  get_project_brief: "milo.projects.read",
  list_opportunities: "milo.content.read",
  list_content: "milo.content.read",
  get_content: "milo.content.read",
  get_latest_audit: "milo.insights.read",
  get_gsc_summary: "milo.insights.read",
  list_authority_opportunities: "milo.authority.read",
};

/**
 * A resolved caller. `scopes: null` means a legacy developer token (full
 * read-only access to every tool). An array is an OAuth grant's scopes.
 */
export interface McpGrant {
  userId: string;
  scopes: string[] | null;
}

/** Whether a tool is callable under the given scopes (null = developer = all). */
export function toolAllowed(name: string, scopes: string[] | null): boolean {
  if (scopes === null) return true;
  const required = TOOL_SCOPES[name];
  return required ? scopes.includes(required) : false;
}

function toolDefs(scopes: string[] | null) {
  return TOOLS.filter((t) => toolAllowed(t.name, scopes)).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
}

/**
 * Handle one JSON-RPC message for a resolved grant. `tools/list` is filtered to
 * the grant's scopes and `tools/call` rejects tools the grant lacks scope for
 * with a JSON-RPC error (the token is valid but unauthorized — not a 401).
 * Returns the response object, or null for notifications (no id → no reply).
 */
export async function handleMcpMessage(grant: McpGrant, msg: JsonRpcMessage): Promise<object | null> {
  const { method, id } = msg;
  const isNotification = id === undefined || id === null;

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
    return result(id, { tools: toolDefs(grant.scopes) });
  }
  if (method === "tools/call") {
    const name = typeof msg.params?.name === "string" ? msg.params.name : "";
    const args = (msg.params?.arguments as Record<string, unknown>) ?? {};
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
