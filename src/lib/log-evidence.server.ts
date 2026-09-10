import { z } from "zod";
import { evidenceProjectId } from "./answer-evidence";
import { prepareLogImport, logDocumentSchema, logRowSchema } from "./log-evidence";
import type { KnowledgeRpc } from "./project-knowledge.server";
const scope = z.object({ ownerId: z.string().uuid(), projectId: evidenceProjectId }).strict();
async function call(name: string, args: Record<string, unknown>, injected?: KnowledgeRpc) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let rpc = injected;
    if (!rpc) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as unknown as { rpc: KnowledgeRpc };
      rpc = (method, params) => admin.rpc(method, params);
    }
    const r = await Promise.race([
      rpc(name, args),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error("log_evidence_unavailable")), 10000);
      }),
    ]);
    if (r.error) throw Error("log_evidence_unavailable");
    return r.data;
  } finally {
    clearTimeout(timer);
  }
}

export async function readLogEvidence(raw: z.infer<typeof scope>, rpc?: KnowledgeRpc) {
  const s = scope.parse(raw);
  return z
    .array(logRowSchema)
    .max(50)
    .parse(
      await call("read_project_log_evidence", { p_user: s.ownerId, p_project: s.projectId }, rpc),
    );
}
export async function importLogEvidence(
  raw: z.infer<typeof scope>,
  value: unknown,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw);
  // Only this derived allowlist crosses the durable-storage boundary.
  const document = logDocumentSchema.parse(value);
  if (new TextEncoder().encode(JSON.stringify(document)).length > 180000)
    throw Error("log_import_too_large");
  // Validate time/window bounds again on the server without reintroducing raw UA strings.
  const canonical = prepareLogImport({
    ...document.input,
    rows: document.input.rows.map((r) => ({
      time: r.time,
      page: r.page,
      status: r.status,
      method: r.method,
      userAgent: r.claimedAgent,
    })),
  });
  if (JSON.stringify(canonical.input) !== JSON.stringify(document.input))
    throw Error("log_noncanonical_input");
  if (document.submittedRows !== document.input.rows.length + document.duplicateRows)
    throw Error("log_counts_invalid");
  return z
    .string()
    .uuid()
    .parse(
      await call(
        "save_project_log_evidence",
        { p_user: s.ownerId, p_project: s.projectId, p_document: document },
        rpc,
      ),
    );
}
export async function removeLogEvidence(
  raw: z.infer<typeof scope>,
  id: string,
  rpc?: KnowledgeRpc,
) {
  const s = scope.parse(raw);
  return z
    .literal(true)
    .parse(
      await call(
        "remove_project_log_evidence",
        { p_user: s.ownerId, p_project: s.projectId, p_id: z.string().uuid().parse(id) },
        rpc,
      ),
    );
}
