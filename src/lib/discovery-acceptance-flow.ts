/**
 * Discovery acceptance flow (AQ): the exact accept/retry sequence the DiscoverView runs, without
 * React, so it can be exercised against the REAL store and persistence path in tests. The route is
 * a thin binding over this flow (state getters/setters + toasts).
 *
 * Selection rule: only the ids that were part of a CONFIRMED acceptance are removed from the
 * selection; anything selected later (a still-suggested row, a newer discovery result) is preserved.
 * A retry never touches the selection — the accepted rows are already ineligible by derivation.
 */
import { deriveDiscoverySelection } from "./discovery-selection";
import type { DiscoverySaveController, DiscoverySaveOutcome } from "./discovery-save-recovery";
import type { DiscoverySuggestion, Opportunity } from "./types";

export interface DiscoveryAcceptanceFlowDeps {
  controller: DiscoverySaveController;
  /** The real store action: synchronous, mints ids once, dedupes. */
  accept: (ids: string[]) => Opportunity[];
  visible: () => DiscoverySuggestion[];
  getSelected: () => Set<string>;
  setSelected: (updater: (prev: Set<string>) => Set<string>) => void;
}

export interface DiscoveryAcceptanceResult {
  ids: string[];
  created: Opportunity[];
  outcome: DiscoverySaveOutcome | null;
}

export const withoutIds = (prev: Set<string>, ids: string[]): Set<string> => {
  const next = new Set(prev);
  for (const id of ids) next.delete(id);
  return next;
};

export function createDiscoveryAcceptanceFlow(deps: DiscoveryAcceptanceFlowDeps) {
  return {
    /** Accept the current eligible selection once and run one bound save attempt. */
    async acceptSelected(): Promise<DiscoveryAcceptanceResult | null> {
      if (deps.controller.isPending()) return null; // synchronous double activation: no second batch
      const ids = deriveDiscoverySelection(deps.visible(), deps.getSelected()).selectedIds;
      if (ids.length === 0) return null;
      const created = deps.accept(ids);
      const outcome = await deps.controller.start();
      if (outcome?.kind === "confirmed") {
        deps.setSelected((prev) => withoutIds(prev, ids)); // newer selections are preserved
        deps.controller.clear(); // the ordinary success path (toast + Undo) takes over
      }
      return { ids, created, outcome };
    },
    /** Retry the bound action's save (current workspace changes); the selection is untouched. */
    retry: (): Promise<DiscoverySaveOutcome | null> => deps.controller.retry(),
  };
}

export type DiscoveryAcceptanceFlow = ReturnType<typeof createDiscoveryAcceptanceFlow>;
