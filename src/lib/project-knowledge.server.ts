import { z } from "zod";
import {
  knowledgeRecordSchema,
  knowledgeSourceSchema,
  projectKnowledgeContext,
  selectProjectKnowledge,
  type KnowledgeRecord,
  type KnowledgeScope,
  type KnowledgeSource,
} from "./project-knowledge";

export type KnowledgeRpc = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: unknown }>;
export class KnowledgeUnavailableError extends Error {
  constructor() {
    super("Project knowledge could not be confirmed. Refresh before making another change.");
  }
}
async function call(name: string, args: Record<string, unknown>, injected?: KnowledgeRpc) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let rpc = injected;
    if (!rpc) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as unknown as { rpc: KnowledgeRpc };
      rpc = (method, params) => admin.rpc(method, params);
    }
    const result = await Promise.race([
      rpc(name, args),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new KnowledgeUnavailableError()), 10000);
      }),
    ]);
    if (!result || result.error) throw new KnowledgeUnavailableError();
    return result.data;
  } catch {
    throw new KnowledgeUnavailableError();
  } finally {
    clearTimeout(timer);
  }
}
const scopeSchema = z
  .object({ ownerId: z.string().uuid(), projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) })
  .strict();
const stateSchema = z
  .object({
    sources: z.array(knowledgeSourceSchema).max(100),
    records: z.array(knowledgeRecordSchema).max(300),
  })
  .strict();
function assertScope(target: KnowledgeScope, rows: KnowledgeScope[]) {
  if (rows.some((r) => r.ownerId !== target.ownerId || r.projectId !== target.projectId))
    throw new KnowledgeUnavailableError();
}
export async function readProjectKnowledge(target: KnowledgeScope, rpc?: KnowledgeRpc) {
  const scope = scopeSchema.parse(target);
  const data = await call(
    "read_project_knowledge",
    { p_user: scope.ownerId, p_project: scope.projectId },
    rpc,
  );
  const parsed = stateSchema.safeParse(data);
  if (!parsed.success) throw new KnowledgeUnavailableError();
  assertScope(scope, [...parsed.data.sources, ...parsed.data.records]);
  return parsed.data;
}
export async function writeProjectKnowledge(
  target: KnowledgeScope,
  kind: "source" | "record",
  payload: KnowledgeSource | KnowledgeRecord,
  expectedRevision: number,
  rpc?: KnowledgeRpc,
) {
  const scope = scopeSchema.parse(target);
  const expected = z.number().int().min(0).max(9999).parse(expectedRevision);
  const parsed =
    kind === "source" ? knowledgeSourceSchema.parse(payload) : knowledgeRecordSchema.parse(payload);
  assertScope(scope, [parsed]);
  if (parsed.revision !== expected + 1) throw new KnowledgeUnavailableError();
  const data = await call(
    "save_project_knowledge",
    {
      p_user: scope.ownerId,
      p_project: scope.projectId,
      p_kind: kind,
      p_id: parsed.id,
      p_expected: expected,
      p_payload: parsed,
    },
    rpc,
  );
  const confirmed =
    kind === "source"
      ? knowledgeSourceSchema.safeParse(data)
      : knowledgeRecordSchema.safeParse(data);
  if (!confirmed.success || JSON.stringify(confirmed.data) !== JSON.stringify(parsed))
    throw new KnowledgeUnavailableError();
  return confirmed.data;
}
export async function writeProjectKnowledgePair(
  target: KnowledgeScope,
  rawSource: KnowledgeSource,
  rawRecord: KnowledgeRecord,
  sourceExpected: number,
  recordExpected: number,
  rpc?: KnowledgeRpc,
) {
  const scope = scopeSchema.parse(target);
  const source = knowledgeSourceSchema.parse(rawSource),
    record = knowledgeRecordSchema.parse(rawRecord);
  assertScope(scope, [source, record]);
  if (
    source.revision !== sourceExpected + 1 ||
    record.revision !== recordExpected + 1 ||
    record.sourceId !== source.id ||
    record.sourceRevision !== source.revision
  )
    throw new KnowledgeUnavailableError();
  const data = await call(
    "save_project_knowledge_pair",
    {
      p_user: scope.ownerId,
      p_project: scope.projectId,
      p_source: source,
      p_record: record,
      p_source_expected: sourceExpected,
      p_record_expected: recordExpected,
    },
    rpc,
  );
  const parsed = z
    .object({ source: knowledgeSourceSchema, record: knowledgeRecordSchema })
    .strict()
    .safeParse(data);
  if (!parsed.success || JSON.stringify(parsed.data) !== JSON.stringify({ source, record }))
    throw new KnowledgeUnavailableError();
  return parsed.data;
}

export async function forgetProjectKnowledge(
  target: KnowledgeScope,
  kind: "source" | "record",
  id: string,
  expectedRevision: number,
  rpc?: KnowledgeRpc,
) {
  const scope = scopeSchema.parse(target);
  const data = await call(
    "forget_project_knowledge",
    {
      p_user: scope.ownerId,
      p_project: scope.projectId,
      p_kind: kind,
      p_id: z.string().uuid().parse(id),
      p_expected: z.number().int().min(1).parse(expectedRevision),
    },
    rpc,
  );
  if (
    !z
      .object({ forgotten: z.literal(true), id: z.literal(id), kind: z.literal(kind) })
      .strict()
      .safeParse(data).success
  )
    throw new KnowledgeUnavailableError();
}
export async function readProjectKnowledgeHistory(
  target: KnowledgeScope,
  kind: "source" | "record",
  id: string,
  before?: number,
  rpc?: KnowledgeRpc,
) {
  const scope = scopeSchema.parse(target);
  const data = await call(
    "read_project_knowledge_history",
    {
      p_user: scope.ownerId,
      p_project: scope.projectId,
      p_kind: kind,
      p_id: z.string().uuid().parse(id),
      p_before: before === undefined ? null : z.number().int().min(1).parse(before),
    },
    rpc,
  );
  const parsed =
    kind === "source"
      ? z.array(knowledgeSourceSchema).max(20).safeParse(data)
      : z.array(knowledgeRecordSchema).max(20).safeParse(data);
  if (!parsed.success || parsed.data.some((r) => r.id !== id))
    throw new KnowledgeUnavailableError();
  assertScope(scope, parsed.data);
  return parsed.data;
}

/** Identity and timestamps are computed here, never accepted from an upload. */
export async function saveProjectKnowledgeDocument(
  target: KnowledgeScope,
  input: { id: string; expectedRevision: number; label: string; base64: string },
  rpc?: KnowledgeRpc,
) {
  const scope = scopeSchema.parse(target);
  const parsed = z
    .object({
      id: z.string().uuid(),
      expectedRevision: z.number().int().min(0).max(9999),
      label: z.string().trim().min(1).max(200),
      base64: z
        .string()
        .min(4)
        .max(6990508)
        .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
    })
    .strict()
    .parse(input);
  const bytes = Uint8Array.from(atob(parsed.base64), (c) => c.charCodeAt(0));
  const { inspectBrandDocument } = await import("./brand-document");
  inspectBrandDocument(bytes);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const source = knowledgeSourceSchema.parse({
    ...scope,
    id: parsed.id,
    revision: parsed.expectedRevision + 1,
    label: parsed.label,
    kind: "document",
    status: "active",
    observedAt: new Date().toISOString(),
    fingerprint: Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join(""),
  });
  const data = await call(
    "save_project_knowledge_document",
    {
      p_user: scope.ownerId,
      p_project: scope.projectId,
      p_id: source.id,
      p_expected: parsed.expectedRevision,
      p_payload: source,
      p_base64: parsed.base64,
    },
    rpc,
  );
  const confirmed = knowledgeSourceSchema.safeParse(data);
  if (!confirmed.success || JSON.stringify(confirmed.data) !== JSON.stringify(source))
    throw new KnowledgeUnavailableError();
  return confirmed.data;
}

export async function revokeProjectKnowledgeSource(
  target: KnowledgeScope,
  id: string,
  expectedRevision: number,
  rpc?: KnowledgeRpc,
) {
  const state = await readProjectKnowledge(target, rpc);
  const source = state.sources.find((s) => s.id === id && s.revision === expectedRevision);
  if (!source) throw new KnowledgeUnavailableError();
  return writeProjectKnowledge(
    target,
    "source",
    { ...source, status: "revoked", revision: expectedRevision + 1 },
    expectedRevision,
    rpc,
  );
}

export async function readProjectKnowledgeDocument(
  target: KnowledgeScope,
  id: string,
  expectedRevision: number,
  rpc?: KnowledgeRpc,
) {
  const scope = scopeSchema.parse(target);
  const data = await call(
    "read_project_knowledge_document",
    {
      p_user: scope.ownerId,
      p_project: scope.projectId,
      p_id: z.string().uuid().parse(id),
      p_expected: z.number().int().positive().parse(expectedRevision),
    },
    rpc,
  );
  const result = z
    .object({ source: knowledgeSourceSchema, base64: z.string().min(4).max(6990508) })
    .strict()
    .safeParse(data);
  if (!result.success) throw new KnowledgeUnavailableError();
  assertScope(scope, [result.data.source]);
  const source = result.data.source;
  if (
    source.id !== id ||
    source.revision !== expectedRevision ||
    source.status !== "active" ||
    source.kind !== "document"
  )
    throw new KnowledgeUnavailableError();
  return result.data;
}

/** Revert creates a new revision and requires the source version still to be
 * active. It cannot resurrect forgotten records or silently reaccept a replaced
 * document. A user must review a new proposal for that replacement instead. */
export async function revertProjectKnowledgeRecord(
  target: KnowledgeScope,
  id: string,
  expectedRevision: number,
  restoreRevision: number,
  rpc?: KnowledgeRpc,
) {
  z.number().int().min(1).max(9999).parse(restoreRevision);
  if (restoreRevision >= expectedRevision) throw new KnowledgeUnavailableError();
  const state = await readProjectKnowledge(target, rpc);
  const current = state.records.find((r) => r.id === id && r.revision === expectedRevision);
  const history = await readProjectKnowledgeHistory(target, "record", id, restoreRevision + 1, rpc);
  const old = history.find((r) => r.revision === restoreRevision) as KnowledgeRecord | undefined;
  if (
    !current ||
    !old ||
    current.sourceId !== old.sourceId ||
    !state.sources.some(
      (s) => s.id === old.sourceId && s.revision === old.sourceRevision && s.status === "active",
    )
  )
    throw new KnowledgeUnavailableError();
  const now = new Date().toISOString();
  return writeProjectKnowledge(
    target,
    "record",
    {
      ...old,
      revision: expectedRevision + 1,
      updatedAt: now,
      ...(old.status === "accepted" ? { reviewedAt: now } : {}),
    },
    expectedRevision,
    rpc,
  );
}
/** Fetch immediately before generation; never accept a browser-supplied
 * knowledge snapshot or a cached summary after a revoke/replacement.
 */
export async function loadProjectKnowledgeContext(
  target: KnowledgeScope,
  output: "text" | "visual",
  nowIso = new Date().toISOString(),
  rpc?: KnowledgeRpc,
  maxBytes = 8000,
) {
  const state = await readProjectKnowledge(target, rpc);
  return projectKnowledgeContext(
    selectProjectKnowledge(state.sources, state.records, target, output, nowIso),
    maxBytes,
  );
}
