import { z } from "zod";
import type { KnowledgeScope } from "./project-knowledge";
import { readProjectKnowledge } from "./project-knowledge.server";
import { readSourceRefresh, refreshProjectSource } from "./source-refresh.server";
export class WeeklySourceReviewRequiredError extends Error {
  constructor() {
    super("weekly_sources_need_review");
  }
}
type Source = { id: string; revision: number; kind: string; status: string };
type Observation = {
  sourceId: string;
  sourceRevision: number;
  status: string;
  lastAttempt: string;
};
type Dependencies = {
  sources: (scope: KnowledgeScope) => Promise<Source[]>;
  refresh: (
    scope: KnowledgeScope,
    source: { sourceId: string; expectedRevision: number },
  ) => Promise<unknown>;
  observations: (scope: KnowledgeScope) => Promise<Observation[]>;
};
const defaults: Dependencies = {
  sources: async (scope) => (await readProjectKnowledge(scope)).sources,
  refresh: refreshProjectSource,
  observations: readSourceRefresh,
};
/** Bounded website/catalog admission before research. No model call, acceptance,
 * draft edit or publication. Existing observations survive partial failure. */
export async function refreshWeeklySources(
  target: KnowledgeScope,
  assertActive: () => Promise<void>,
  dependencies: Dependencies = defaults,
) {
  const scope = z
    .object({ ownerId: z.string().uuid(), projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) })
    .strict()
    .parse(target);
  await assertActive();
  const configured = (await dependencies.sources(scope)).filter(
    (s) => s.kind === "website" && s.status === "active",
  );
  if (configured.length > 10 || new Set(configured.map((s) => s.id)).size !== configured.length)
    throw new WeeklySourceReviewRequiredError();
  for (const source of configured) {
    await assertActive();
    try {
      await dependencies.refresh(scope, { sourceId: source.id, expectedRevision: source.revision });
    } catch {
      throw new WeeklySourceReviewRequiredError();
    }
  }
  if (!configured.length) return [];
  await assertActive();
  const rows = await dependencies.observations(scope);
  const result = configured.map((source) =>
    rows.find((row) => row.sourceId === source.id && row.sourceRevision === source.revision),
  );
  if (result.some((row) => !row || row.status !== "ok"))
    throw new WeeklySourceReviewRequiredError();
  return result.map((row) => ({
    sourceId: row!.sourceId,
    sourceRevision: row!.sourceRevision,
    lastAttempt: row!.lastAttempt,
  }));
}
