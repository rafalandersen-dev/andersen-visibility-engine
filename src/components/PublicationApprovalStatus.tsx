import { useEffect, useState } from "react";
import { useT } from "@/i18n";
import { readPublicationApprovalFn } from "@/lib/publication-approval.functions";
import { publicationVersion, samePublicationVersion } from "@/lib/publication-version";
import type { ContentAsset, Project } from "@/lib/types";
export function PublicationApprovalStatus({
  asset,
  project,
  paths,
  dirty,
  revision,
}: {
  asset: ContentAsset;
  project: Project;
  paths: string[];
  dirty: boolean;
  revision: number;
}) {
  const t = useT();
  const [state, setState] = useState<"loading" | "current" | "needed" | "unavailable">("loading");
  useEffect(() => {
    let cancelled = false;
    if (dirty) {
      setState("needed");
      return;
    }
    setState("loading");
    void Promise.all([
      publicationVersion(asset, project, paths),
      readPublicationApprovalFn({ data: { projectId: project.id, assetId: asset.id } }),
    ])
      .then(([local, saved]) => {
        if (!cancelled)
          setState(
            saved.approved && samePublicationVersion(local, saved.version) ? "current" : "needed",
          );
      })
      .catch(() => {
        if (!cancelled) setState("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [asset, project, paths, dirty, revision]);
  return (
    <p className="text-xs text-muted-foreground" role="status">
      {t(`approval.${dirty ? "needed" : state}`)}
    </p>
  );
}
