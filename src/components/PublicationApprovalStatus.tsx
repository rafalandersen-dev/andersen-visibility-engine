import { useEffect, useState } from "react";
import { useT } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { readPublicationApprovalFn } from "@/lib/publication-approval.functions";
import { publicationVersion, samePublicationVersion } from "@/lib/publication-version";
import type { ContentAsset, Project } from "@/lib/types";

export type PublicationApprovalState = "loading" | "current" | "needed" | "unavailable";
export type PublicationApprovalSnapshot = {
  state: PublicationApprovalState;
  asset: ContentAsset;
  project: Project;
  paths: string[];
  revision: number;
  userId: string | undefined;
};

export function PublicationApprovalStatus({
  asset,
  project,
  paths,
  dirty,
  revision,
  onStateChange,
}: {
  asset: ContentAsset;
  project: Project;
  paths: string[];
  dirty: boolean;
  revision: number;
  onStateChange?: (snapshot: PublicationApprovalSnapshot) => void;
}) {
  const t = useT();
  const { user } = useAuth();
  const userId = user?.id;
  const [snapshot, setSnapshot] = useState<PublicationApprovalSnapshot | null>(null);
  // A result belongs to the inputs that were checked. Do not briefly display a
  // previous version's approval while the new effect starts its read.
  const state = dirty
    ? "needed"
    : !userId
      ? "unavailable"
      : snapshot?.asset === asset &&
          snapshot.project === project &&
          snapshot.paths === paths &&
          snapshot.revision === revision &&
          snapshot.userId === userId
        ? snapshot.state
        : "loading";
  useEffect(() => {
    let cancelled = false;
    const report = (state: PublicationApprovalState) => {
      const next = { state, asset, project, paths, revision, userId };
      setSnapshot(next);
      onStateChange?.(next);
    };
    if (!userId) {
      report("unavailable");
      return;
    }
    if (dirty) {
      report("needed");
      return;
    }
    report("loading");
    void Promise.all([
      publicationVersion(asset, project, paths),
      readPublicationApprovalFn({ data: { projectId: project.id, assetId: asset.id } }),
    ])
      .then(([local, saved]) => {
        if (!cancelled)
          report(
            saved.approved && samePublicationVersion(local, saved.version) ? "current" : "needed",
          );
      })
      .catch(() => {
        if (!cancelled) report("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [asset, project, paths, dirty, revision, userId, onStateChange]);
  return (
    <p className="text-xs text-muted-foreground" role="status">
      {t(`approval.${state}`)}
    </p>
  );
}
