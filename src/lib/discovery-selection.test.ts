/**
 * Transition regression for the discovery selection view state (AN, review 4123370116): the exact
 * derivation the plan route renders, driven through the real sequence — initial default selection →
 * store marks two rows accepted while the workspace save is still pending (local selection not yet
 * cleared) → the save is rejected (selection still not cleared) → a later successful completion clears
 * it. At no step may an accepted or dismissed row be pressed, and the Add-selected count must follow
 * the rows that are still suggested.
 */
import { describe, expect, it } from "vitest";
import { deriveDiscoverySelection } from "./discovery-selection";
import type { DiscoverySuggestion } from "./types";

const row = (id: string, status: DiscoverySuggestion["status"]) => ({ id, status });
const initial = [
  row("s1", "suggested"),
  row("s2", "suggested"),
  row("s3", "suggested"),
  row("s4", "suggested"),
  row("s5", "accepted"),
];
const defaultSelected = new Set(["s1", "s2", "s3"]); // DiscoverView's initial state: first three suggested

describe("deriveDiscoverySelection", () => {
  it("initial render: default-selected suggested rows pressed, others not, accepted row disabled", () => {
    const { rows, selectedIds } = deriveDiscoverySelection(initial, defaultSelected);
    expect(rows).toEqual([
      { id: "s1", checked: true, disabled: false },
      { id: "s2", checked: true, disabled: false },
      { id: "s3", checked: true, disabled: false },
      { id: "s4", checked: false, disabled: false },
      { id: "s5", checked: false, disabled: true },
    ]);
    expect(selectedIds).toEqual(["s1", "s2", "s3"]);
  });

  it("save pending: store has accepted s1/s2 but the local selection is unchanged → no accepted row is pressed; s3 stays selected", () => {
    const afterStoreAccept = [
      row("s1", "accepted"),
      row("s2", "accepted"),
      row("s3", "suggested"),
      row("s4", "suggested"),
      row("s5", "accepted"),
    ];
    const { rows, selectedIds } = deriveDiscoverySelection(afterStoreAccept, defaultSelected);
    expect(rows.filter((r) => r.checked).map((r) => r.id)).toEqual(["s3"]);
    expect(rows.find((r) => r.id === "s1")).toEqual({ id: "s1", checked: false, disabled: true });
    expect(rows.find((r) => r.id === "s2")).toEqual({ id: "s2", checked: false, disabled: true });
    expect(selectedIds).toEqual(["s3"]); // Add-selected counts only still-suggested rows
  });

  it("save rejected: selection is still not cleared, yet accepted rows remain unpressed and disabled", () => {
    const afterStoreAccept = [
      row("s1", "accepted"),
      row("s2", "accepted"),
      row("s3", "suggested"),
      row("s4", "suggested"),
      row("s5", "accepted"),
    ];
    // Same stale set as before the rejection — exactly the state the review found.
    const stale = new Set(["s1", "s2", "s3"]);
    const { rows } = deriveDiscoverySelection(afterStoreAccept, stale);
    expect(rows.filter((r) => r.checked).map((r) => r.id)).toEqual(["s3"]);
    expect(rows.filter((r) => r.disabled).map((r) => r.id)).toEqual(["s1", "s2", "s5"]);
  });

  it("dismissed rows are never pressed either", () => {
    const { rows } = deriveDiscoverySelection([row("s1", "dismissed")], new Set(["s1"]));
    expect(rows).toEqual([{ id: "s1", checked: false, disabled: true }]);
  });

  it("successful completion: selection cleared → nothing pressed; remaining suggested rows still toggle", () => {
    const afterAll = [
      row("s1", "accepted"),
      row("s2", "accepted"),
      row("s3", "accepted"),
      row("s4", "suggested"),
      row("s5", "accepted"),
    ];
    expect(deriveDiscoverySelection(afterAll, new Set()).rows.some((r) => r.checked)).toBe(false);
    const reselect = deriveDiscoverySelection(afterAll, new Set(["s4"]));
    expect(reselect.rows.find((r) => r.id === "s4")).toEqual({
      id: "s4",
      checked: true,
      disabled: false,
    });
    expect(reselect.selectedIds).toEqual(["s4"]);
  });
});
