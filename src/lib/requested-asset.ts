import { useCallback, useEffect, useRef, useState } from "react";
import {
  getState,
  reloadWorkspaceForUser,
  useStore,
  useWorkspaceSaveStatus,
  type WorkspaceReloadResult,
} from "./store";

/** CX (23 October 2026): an explicitly requested content asset (`/app/editor?id=`,
 * e.g. from an approval notification) can be created on the server by background
 * work after this tab loaded its workspace. The editor then showed "No asset
 * selected" until a full reload.
 *
 * - `loading`: one bounded workspace reload is in flight for this id.
 * - `missing`: fresh server truth was applied and the asset is still not there
 *   (genuinely absent, removed or not this account's) — nothing is revealed.
 * - `unsaved`: the reload was refused because local changes are unsaved; they are
 *   never overwritten. The owner saves, then retries.
 * - `unavailable`: the read failed or was superseded; the owner may retry.
 * One automatic attempt per request, plus at most one more when an `unsaved`
 * refusal is followed by a confirmed save (e.g. the notification just switched the
 * active project, which autosaves). Further attempts only through an explicit
 * retry. No polling; each read has the store's finite reload deadline. */
export type RequestedAssetStatus = "present" | "loading" | "missing" | "unsaved" | "unavailable";

export function requestedAssetStatus(
  result: WorkspaceReloadResult,
  foundAfter: boolean,
): RequestedAssetStatus {
  if (foundAfter) return "present";
  if (result === "applied") return "missing";
  if (result === "unsaved") return "unsaved";
  return "unavailable";
}

/** One recovery attempt for a requested id that the local workspace lacks. */
export async function recoverRequestedAsset(
  assetId: string,
  deps: {
    userId: string;
    reload: (userId: string) => Promise<WorkspaceReloadResult>;
    has: (assetId: string) => boolean;
  },
): Promise<RequestedAssetStatus> {
  if (deps.has(assetId)) return "present";
  const result = await deps.reload(deps.userId);
  return requestedAssetStatus(result, deps.has(assetId));
}

/** The editor lists only the active project's assets, so a requested id counts as
 * present only there. An id that belongs to another project stays generically
 * `missing`; the active project is never switched here. */
const hasInProject = (
  content: readonly { id: string; projectId: string }[],
  assetId: string,
  projectId: string,
) => content.some((c) => c.id === assetId && c.projectId === projectId);

/** Editor hook: recovers an explicitly requested asset missing from a stale
 * workspace with a single bounded reload, plus an explicit `retry`.
 *
 * Each attempt belongs to one request key (user, active project, requested id,
 * attempt). An attempt is invalidated when its key changes or the asset becomes
 * present, the id goes away, or the editor unmounts; an invalidated attempt can
 * never set the status. The status shown is only ever the current key's result,
 * otherwise `loading` while its attempt runs. Returning to an earlier key starts a
 * fresh attempt rather than waiting on an invalidated one. */
export function useRequestedAsset(requestedId: string | undefined) {
  const userId = useStore((s) => s.userId);
  const hydrated = useStore((s) => s.hydrated);
  const projectId = useStore((s) => s.activeProjectId);
  const present = useStore(
    (s) => !!requestedId && hasInProject(s.content, requestedId, s.activeProjectId),
  );
  const saveKind = useWorkspaceSaveStatus().kind;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; status: RequestedAssetStatus } | null>(null);
  const scope = requestedId && userId ? JSON.stringify([userId, projectId, requestedId]) : "";
  const key = scope ? `${scope}#${attempt}` : "";
  const active = !!key && hydrated && !present;
  useEffect(() => {
    if (!active || !requestedId || !userId) return;
    let live = true;
    void recoverRequestedAsset(requestedId, {
      userId,
      reload: reloadWorkspaceForUser,
      has: (id) => hasInProject(getState().content, id, projectId),
    }).then((status) => {
      if (live) setResult({ key, status });
    });
    return () => {
      live = false;
      setResult((r) => (r?.key === key ? null : r));
    };
  }, [active, key, requestedId, userId, projectId]);
  const status: RequestedAssetStatus =
    !requestedId || present ? "present" : result?.key === key ? result.status : "loading";
  // After an `unsaved` refusal, retry once automatically when the save is confirmed
  // (e.g. the notification's project switch autosaves). Once per request scope.
  const retriedAfterSave = useRef("");
  useEffect(() => {
    if (status !== "unsaved" || saveKind !== "saved" || !scope) return;
    if (retriedAfterSave.current === scope) return;
    retriedAfterSave.current = scope;
    setAttempt((n) => n + 1);
  }, [status, saveKind, scope]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { status, retry };
}
