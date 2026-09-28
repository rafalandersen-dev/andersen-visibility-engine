import type { DiscoverySuggestion } from "./types";

/**
 * Derived selection view for discovery rows. The pressed/selectable state is computed from the
 * CURRENT suggestion status together with the local selection set, never from the set alone:
 * once the store marks a row accepted (or dismissed) — including while its workspace save is still
 * pending or was rejected — the row can no longer be presented or announced as selected, and the
 * Add-selected control counts and submits only rows that are still suggested.
 */
export interface DiscoverySelectionRow {
  id: string;
  /** Pressed state exposed to assistive technology. */
  checked: boolean;
  /** Only rows that are still suggested can be toggled. */
  disabled: boolean;
}

export function deriveDiscoverySelection(
  visible: readonly Pick<DiscoverySuggestion, "id" | "status">[],
  selected: ReadonlySet<string>,
): { rows: DiscoverySelectionRow[]; selectedIds: string[] } {
  const rows = visible.map((item) => {
    const suggested = item.status === "suggested";
    return { id: item.id, checked: suggested && selected.has(item.id), disabled: !suggested };
  });
  return { rows, selectedIds: rows.filter((row) => row.checked).map((row) => row.id) };
}
