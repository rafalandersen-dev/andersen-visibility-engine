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
      "Source facts need review before this draft can be sent or published. Check source observations in Project Setup.",
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
  if (asset[forgottenSource]) return [forgottenIssue()];
  const dependencies = assetSourceDependencies(asset);
  if (!dependencies.length) return [];
  const scope = { ownerId: userId, projectId: asset.projectId };
  const rows = await readSourceRefresh(scope, rpc);
  return issuesFromRows(userId, asset, rows, now);
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
export async function assertAssetSourcesCurrent(
  userId: string,
  asset: RegistryAsset,
  rpc?: KnowledgeRpc,
) {
  try {
    asset = mergeRegisteredDependencies(
      asset,
      await readOutputSourceDependencies(
        { ownerId: userId, projectId: asset.projectId },
        asset.id,
        rpc,
      ),
    );
    if (asset[forgottenSource]) throw new SourcePublicationHeldError();
    const dependencies = assetSourceDependencies(asset);
    if (!dependencies.length) return;
    const scope = { ownerId: userId, projectId: asset.projectId };
    if (dependencies.some((d) => d.ownerId !== userId || d.projectId !== asset.projectId))
      throw new SourcePublicationHeldError();
    const rows = await readSourceRefresh(scope, rpc);
    const sourceIds = [...new Set(dependencies.map((d) => d.sourceId))];
    if (sourceIds.length > 10) throw new SourcePublicationHeldError();
    for (const sourceId of sourceIds) {
      const row = rows.find((row) => row.sourceId === sourceId);
      if (!row) throw new SourcePublicationHeldError();
      await refreshProjectSource(
        scope,
        { sourceId, expectedRevision: row.sourceRevision },
        { rpc },
      );
    }
    if ((await sourceIssuesForAsset(userId, asset, new Date().toISOString(), rpc)).length)
      throw new SourcePublicationHeldError();
  } catch {
    throw new SourcePublicationHeldError();
  }
}

export async function readProjectSourceImpact(userId: string, projectId: string) {
  const rows = await readSourceRefresh({ ownerId: userId, projectId });
  const { readWorkspaceRow } = await import("./workspace.server");
  const workspace = await readWorkspaceRow(userId);
  if (!workspace) throw new SourcePublicationHeldError();
  const registry = await readOutputSourceDependencies({ ownerId: userId, projectId });
  const now = new Date().toISOString();
  const assets = ((workspace.data.content ?? []) as ContentAsset[])
    .map((asset) => mergeRegisteredDependencies(asset, registry))
    .filter(
      (asset) =>
        asset.projectId === projectId &&
        (asset[forgottenSource] ||
          asset.sourceDependencies?.length ||
          asset.images?.some((image) => image.sourceDependencies?.length)),
    );
  const inspected = assets.slice(0, 100);
  return {
    checked: inspected.length,
    remaining: Math.max(0, assets.length - inspected.length),
    affected: inspected.flatMap((asset) => {
      const planned =
        asset.scheduledPublishAt && Date.parse(asset.scheduledPublishAt) > Date.parse(now)
          ? asset.scheduledPublishAt
          : now;
      const issues = issuesFromRows(userId, asset, rows, now, planned);
      return issues.length
        ? [
            {
              assetId: asset.id,
              title: (asset.h1 || asset.metaTitle || asset.id).slice(0, 300),
              issues,
              plannedAt: asset.scheduledPublishAt ?? null,
            },
          ]
        : [];
    }),
  };
}
