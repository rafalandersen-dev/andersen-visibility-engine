import { z } from "zod";
import type { ContentAsset, Project } from "./types";
import type { KnowledgeRpc } from "./project-knowledge.server";
import {
  capturePublicationSnapshot,
  evidencePublicUrl,
  outcomeDataSchema,
  evidenceRowSchema,
  observationFromImport,
  type OutcomeData,
} from "./publication-evidence";
import {
  PublishNotPossibleError,
  PublishRecordingFailedError,
  PublishTransportError,
} from "./publish-outcome";
const scopeSchema = z
  .object({ ownerId: z.string().uuid(), projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) })
  .strict();
type Scope = z.infer<typeof scopeSchema>;
async function call(name: string, args: Record<string, unknown>, injected?: KnowledgeRpc) {
  const rpc =
    injected ??
    (async (name, params) => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      return (supabaseAdmin as unknown as { rpc: KnowledgeRpc }).rpc(name, params);
    });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      rpc(name, args),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error("publication_evidence_unavailable")), 10000);
      }),
    ]);
    if (!result || result.error) throw Error("publication_evidence_unavailable");
    return result.data;
  } finally {
    clearTimeout(timer);
  }
}
export async function withPublicationEvidence<T>(args: {
  ownerId: string;
  asset: ContentAsset;
  project: Project;
  paths: string[];
  publish: () => Promise<T>;
  outcome: (result: T) => {
    success: boolean;
    retryable?: boolean;
    liveUrl?: string;
    externalId?: string;
    publishedAt?: string;
  };
  rpc?: KnowledgeRpc;
}) {
  const scope = scopeSchema.parse({ ownerId: args.ownerId, projectId: args.project.id });
  const snapshot = await capturePublicationSnapshot(args.asset, args.project, args.paths),
    id = crypto.randomUUID();
  try {
    if (
      (await call(
        "begin_publication_evidence",
        {
          p_user: scope.ownerId,
          p_project: scope.projectId,
          p_asset: args.asset.id,
          p_id: id,
          p_hash: snapshot.version.hash,
          p_snapshot: snapshot,
        },
        args.rpc,
      )) !== true
    )
      throw Error();
  } catch {
    throw new PublishNotPossibleError(
      "Publication evidence could not be saved. No publication was started.",
    );
  }
  const empty: OutcomeData = {
    liveUrl: "",
    externalId: "",
    publishedAt: null,
    verification: "connector_response_only",
  };
  const finish = (outcome: string, data: OutcomeData) =>
    call(
      "finish_publication_evidence",
      {
        p_user: scope.ownerId,
        p_project: scope.projectId,
        p_id: id,
        p_outcome: outcome,
        p_data: data,
      },
      args.rpc,
    ).then((result) => {
      if (result !== true) throw Error("publication_evidence_unavailable");
    });
  let result: T;
  try {
    result = await args.publish();
  } catch (error) {
    await finish(
      error instanceof PublishTransportError && error.retryable ? "rejected" : "unknown",
      empty,
    ).catch(() => {});
    throw error;
  }
  let returned: ReturnType<typeof args.outcome>, data: OutcomeData;
  try {
    returned = args.outcome(result);
    data = outcomeDataSchema.parse({
      liveUrl: evidencePublicUrl(returned.liveUrl),
      externalId: (returned.externalId ?? "").slice(0, 500),
      publishedAt: returned.success ? (returned.publishedAt ?? new Date().toISOString()) : null,
      verification: "connector_response_only",
    });
  } catch {
    throw new PublishRecordingFailedError(
      "The connector returned, but its evidence could not be validated. Do not publish again; inspect the destination and publication history.",
    );
  }
  try {
    await finish(
      returned.success ? "published" : returned.retryable ? "rejected" : "unknown",
      data,
    );
  } catch {
    if (returned.success)
      throw new PublishRecordingFailedError(
        "The connector reported publication, but the evidence result could not be confirmed. Do not publish again; inspect the destination and publication history.",
        data.liveUrl,
      );
  }
  return result;
}
export async function readPublicationEvidence(
  target: Scope,
  page = 0,
  rpc?: KnowledgeRpc,
  id?: string,
) {
  const s = scopeSchema.parse(target);
  return z
    .object({ items: z.array(evidenceRowSchema).max(50), total: z.number().int().min(0).max(1000) })
    .parse(
      await call(
        "read_publication_evidence",
        {
          p_user: s.ownerId,
          p_project: s.projectId,
          p_page: z.number().int().min(0).max(19).parse(page),
          p_id: id ? z.string().uuid().parse(id) : null,
        },
        rpc,
      ),
    );
}
export async function readPublicationSnapshot(target: Scope, id: string, rpc?: KnowledgeRpc) {
  const s = scopeSchema.parse(target);
  const result = await call(
    "read_publication_snapshot",
    { p_user: s.ownerId, p_project: s.projectId, p_id: z.string().uuid().parse(id) },
    rpc,
  );
  if (!result) throw Error("publication_evidence_missing");
  const parsed = z
    .object({ markdown: z.string().max(2000000) })
    .passthrough()
    .parse(result);
  return { markdown: parsed.markdown, json: JSON.stringify(result) };
}
export async function linkPublicationObservation(target: Scope, id: string, importId: string) {
  const s = scopeSchema.parse(target);
  z.string().uuid().parse(id);
  z.string().max(100).parse(importId);
  const publication = (await readPublicationEvidence(s, 0, undefined, id)).items[0];
  if (!publication) throw Error("publication_evidence_missing");
  const { readWorkspaceRow } = await import("./workspace.server");
  const workspace = await readWorkspaceRow(s.ownerId);
  const project = (workspace?.data.projects as Project[] | undefined)?.find(
    (p) => p.id === s.projectId,
  );
  const imp = project?.gscLite?.imports.find((i) => i.id === importId);
  if (!imp) throw Error("observation_import_missing");
  const observation = observationFromImport(imp, publication);
  if (
    (await call("link_publication_observation", {
      p_user: s.ownerId,
      p_project: s.projectId,
      p_id: id,
      p_import: imp,
      p_observation: observation,
    })) !== true
  )
    throw Error("publication_evidence_unavailable");
  return observation;
}
