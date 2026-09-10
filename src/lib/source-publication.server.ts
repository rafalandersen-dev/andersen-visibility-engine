import {
  knowledgeIssuesForAsset,
  readOutputKnowledgeDependencies,
  evaluateAssetKnowledge,
} from "./knowledge-publication.server";
import { readProjectKnowledge } from "./project-knowledge.server";
import type { ContentAsset } from "./types";
import type { KnowledgeRpc } from "./project-knowledge.server";
import {
  checkOutputDependencies,
  outputDependencySchema,
  conflictingSourceFacts,
} from "./source-refresh";
import {
  readSourceRefresh,
  refreshProjectSource,
  readOutputSourceDependencies,
} from "./source-refresh.server";
import { z } from "zod";

export class SourcePublicationHeldError extends Error {
  readonly permanent = true;
  readonly sourceHold = true;
  constructor() {
    super(
      "Source facts need review before this draft can be sent or published. Check source observations and project knowledge in Project Setup.",
    );
  }
}

export function assetSourceDependencies(asset: ContentAsset) {
  // Conservative: retained image references are checked even before attachment
  // approval. Removing an image removes its references from this asset's gate.
  if (!Array.isArray(asset.images ?? [])) throw new SourcePublicationHeldError();
  const imageDependencies = (asset.images ?? [])
    .map((image) =>
      z
        .array(outputDependencySchema)
        .max(100)
        .parse(image.sourceDependencies ?? []),
    )
    .filter((dependencies) => dependencies.length > 0);
  // Legacy uploads have no source references and consume no evaluation capacity.
  if (imageDependencies.length > 30) throw new SourcePublicationHeldError();
  const dependencies = [
    ...z
      .array(outputDependencySchema)
      .max(100)
      .parse(asset.sourceDependencies ?? []),
    ...imageDependencies.flat(),
  ];
  const unique = new Map(dependencies.map((d) => [JSON.stringify(d), d]));
  return z
    .array(outputDependencySchema)
    .max(3100)
    .parse([...unique.values()]);
}

/** Stored evidence recheck for draft impact views; never mutates content,
 * approvals or schedules. Withdrawn acceptance makes that exact fact unavailable. */
const uniqueDependencies = (values: unknown[]) =>
  [
    ...new Map(values.map((value) => [JSON.stringify(value), value])).values(),
  ] as import("./source-refresh").OutputDependency[];

const forgottenSource = Symbol("forgotten source evidence");
type RegistryAsset = ContentAsset & { [forgottenSource]?: boolean };
const forgottenIssue = () => ({
  sourceId: "",
  key: "forgotten-source",
  critical: true,
  reason: "unavailable" as const,
});

function mergeRegisteredDependencies(
  asset: ContentAsset,
  rows: Awaited<ReturnType<typeof readOutputSourceDependencies>>,
) {
  const applicable = rows.filter((row) => row.assetId === asset.id);
  return {
    ...asset,
    [forgottenSource]: applicable.some(
      (row) =>
        row.sourceForgotten &&
        (row.kind === "content" || asset.images?.some((image) => image.id === row.outputId)),
    ),
    sourceDependencies: uniqueDependencies([
      ...(asset.sourceDependencies ?? []),
      ...applicable.filter((row) => row.kind === "content").flatMap((row) => row.dependencies),
    ]),
    images: asset.images?.map((image) => ({
      ...image,
      sourceDependencies: uniqueDependencies([
        ...(image.sourceDependencies ?? []),
        ...applicable
          .filter((row) => row.kind === "image" && row.outputId === image.id)
          .flatMap((row) => row.dependencies),
      ]),
    })),
  };
}

export async function sourceIssuesForAsset(
  userId: string,
  asset: RegistryAsset,
  now = new Date().toISOString(),
  rpc?: KnowledgeRpc,
) {
  asset = mergeRegisteredDependencies(
    asset,
    await readOutputSourceDependencies(
      { ownerId: userId, projectId: asset.projectId },
      asset.id,
      rpc,
    ),
  );
  const knowledgeIssues = await knowledgeIssuesForAsset(userId, asset, now, rpc);
  if (asset[forgottenSource]) return [forgottenIssue(), ...knowledgeIssues];
  const dependencies = assetSourceDependencies(asset);
  if (!dependencies.length) return knowledgeIssues;
  const scope = { ownerId: userId, projectId: asset.projectId };
  const rows = await readSourceRefresh(scope, rpc);
  return [...issuesFromRows(userId, asset, rows, now), ...knowledgeIssues];
}

function issuesFromRows(
  userId: string,
  asset: RegistryAsset,
  rows: Awaited<ReturnType<typeof readSourceRefresh>>,
  now: string,
  useAt = now,
) {
  if (asset[forgottenSource]) return [forgottenIssue()];
  const dependencies = assetSourceDependencies(asset);
  const scope = { ownerId: userId, projectId: asset.projectId };
  const conflicts = conflictingSourceFacts(
    rows.flatMap((row) => (row.snapshot ? [row.snapshot] : [])),
  );
  const replaced = dependencies.filter(
    (d) =>
      d.sourceRevision !== undefined &&
      rows.find((row) => row.sourceId === d.sourceId)?.sourceRevision !== d.sourceRevision,
  );
  const snapshots = rows.flatMap((row) =>
    row.snapshot
      ? [
          {
            ...row.snapshot,
            facts: row.snapshot.facts.filter(
              (f) =>
                row.accepted[f.key] === f.fingerprint && !conflicts.has(`${row.sourceId}:${f.key}`),
            ),
          },
        ]
      : [],
  );
  const unavailableSourceIds = rows.filter((row) => row.status !== "ok").map((row) => row.sourceId);
  const issues: import("./source-refresh").DependencyIssue[] = [];
  // Each article/image is bounded at 100 references. Evaluate the combined
  // article + up to 30 images in equally bounded batches instead of rejecting
  // valid independently generated outputs after attachment.
  for (let index = 0; index < dependencies.length; index += 100) {
    issues.push(
      ...checkOutputDependencies({
        scope,
        dependencies: dependencies.slice(index, index + 100),
        snapshots,
        unavailableSourceIds,
        now,
        useAt,
        maxAgeMs: 86400000,
      }),
    );
  }
  return [
    ...issues,
    ...replaced
      .filter((d) => !issues.some((i) => i.key === d.key && i.sourceId === d.sourceId))
      .map((d) => ({
        sourceId: d.sourceId,
        key: d.key,
        critical: d.critical,
        reason: "changed" as const,
      })),
  ];
}

/** All manual and scheduled connector authorization enters here before
 * transport. Refresh admission is bounded and cooldown protected. A failed or
 * unconfirmed check holds publication; no provider retry or draft edit occurs. */
export const SOURCE_PUBLICATION_DEADLINE_MS = 20000;
export async function assertAssetSourcesCurrent(
  userId: string,
  asset: RegistryAsset,
  rpc?: KnowledgeRpc,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  const checkDeadline = () => {
    if (expired) throw new SourcePublicationHeldError();
  };
  try {
    await Promise.race([
      (async () => {
        asset = mergeRegisteredDependencies(
          asset,
          await readOutputSourceDependencies(
            { ownerId: userId, projectId: asset.projectId },
            asset.id,
            rpc,
          ),
        );
        checkDeadline();
        if (asset[forgottenSource]) throw new SourcePublicationHeldError();
        const dependencies = assetSourceDependencies(asset);
        if ((await knowledgeIssuesForAsset(userId, asset, new Date().toISOString(), rpc)).length)
          throw new SourcePublicationHeldError();
        checkDeadline();
        if (!dependencies.length) return;
        const scope = { ownerId: userId, projectId: asset.projectId };
        if (dependencies.some((d) => d.ownerId !== userId || d.projectId !== asset.projectId))
          throw new SourcePublicationHeldError();
        const rows = await readSourceRefresh(scope, rpc);
        checkDeadline();
        const sourceIds = [...new Set(dependencies.map((d) => d.sourceId))];
        if (sourceIds.length > 10) throw new SourcePublicationHeldError();
        await Promise.all(
          sourceIds.map(async (sourceId) => {
            const row = rows.find((row) => row.sourceId === sourceId);
            if (!row) throw new SourcePublicationHeldError();
            await refreshProjectSource(
              scope,
              { sourceId, expectedRevision: row.sourceRevision },
              { rpc },
            );
          }),
        );
        checkDeadline();
        if ((await sourceIssuesForAsset(userId, asset, new Date().toISOString(), rpc)).length)
          throw new SourcePublicationHeldError();
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(new SourcePublicationHeldError());
        }, SOURCE_PUBLICATION_DEADLINE_MS);
      }),
    ]);
  } catch {
    throw new SourcePublicationHeldError();
  } finally {
    clearTimeout(timer);
  }
}

export async function readProjectSourceImpact(userId: string, projectId: string) {
  const rows = await readSourceRefresh({ ownerId: userId, projectId });
  const { readWorkspaceRow } = await import("./workspace.server");
  const workspace = await readWorkspaceRow(userId);
  if (!workspace) throw new SourcePublicationHeldError();
  const assets = ((workspace.data.content ?? []) as ContentAsset[]).filter(
    (asset) => asset.projectId === projectId,
  );
  const selected = assets.slice(0, 100);
  const registry = selected.length
    ? await readOutputSourceDependencies(
        { ownerId: userId, projectId },
        selected.map((asset) => asset.id),
      )
    : [];
  const knowledgeRegistry = selected.length
    ? await readOutputKnowledgeDependencies(
        userId,
        projectId,
        selected.map((a) => a.id),
      )
    : [];
  const knowledge = selected.length
    ? await readProjectKnowledge({ ownerId: userId, projectId })
    : { sources: [], records: [] };
  const now = new Date().toISOString();
  const inspected = selected.map((asset) => mergeRegisteredDependencies(asset, registry));
  return {
    checked: inspected.length,
    remaining: Math.max(0, assets.length - inspected.length),
    affected: inspected.flatMap((asset) => {
      const planned =
        asset.scheduledPublishAt && Date.parse(asset.scheduledPublishAt) > Date.parse(now)
          ? asset.scheduledPublishAt
          : now;
      const issues = [
        ...issuesFromRows(userId, asset, rows, now, planned),
        ...evaluateAssetKnowledge(userId, asset, knowledge, knowledgeRegistry, now),
        ...(planned !== now
          ? evaluateAssetKnowledge(userId, asset, knowledge, knowledgeRegistry, planned)
          : []),
      ];
      const knowledgeIssueCount = new Set(issues.filter((i) => "evidence" in i).map((i) => i.key))
        .size;
      return issues.length
        ? [
            {
              assetId: asset.id,
              title: (asset.h1 || asset.metaTitle || asset.id).slice(0, 300),
              issues,
              knowledgeIssueCount,
              plannedAt: asset.scheduledPublishAt ?? null,
            },
          ]
        : [];
    }),
  };
}
