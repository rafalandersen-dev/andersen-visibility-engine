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
export async function forgetProjectKnowledge(
  target: KnowledgeScope,
  kind: "source" | "record",
  id: string,
  expectedRevision: number,
  rpc?: KnowledgeRpc,
) {
  const scope = scopeSchema.parse(target);
  await call(
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
      p_before: before ?? null,
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
/** Fetch immediately before generation; never accept a browser-supplied
 * knowledge snapshot or a cached summary after a revoke/replacement.
 */
export async function loadProjectKnowledgeContext(
  target: KnowledgeScope,
  output: "text" | "visual",
  nowIso = new Date().toISOString(),
  rpc?: KnowledgeRpc,
) {
  const state = await readProjectKnowledge(target, rpc);
  return projectKnowledgeContext(
    selectProjectKnowledge(state.sources, state.records, target, output, nowIso),
  );
}
