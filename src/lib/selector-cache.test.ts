import { expect, it } from "vitest";
import { createSelectorCache } from "./selector-cache";

const state = {
  rows: [
    { projectId: "first", id: "a" },
    { projectId: "second", id: "b" },
  ],
};
type Rows = typeof state.rows;
const cache = () =>
  createSelectorCache<typeof state, Rows>(
    (a, b) => a.length === b.length && a.every((item, index) => item === b[index]),
  );
const forProject = (projectId: string) => (snapshot: typeof state) =>
  snapshot.rows.filter((row) => row.projectId === projectId);

it("recomputes when a project-bound selector changes on the same state object", () => {
  const snapshots = cache();
  expect(snapshots.read(state, forProject("first")).map((row) => row.id)).toEqual(["a"]);
  expect(snapshots.read(state, forProject("second")).map((row) => row.id)).toEqual(["b"]);
});

it("recovers from the old project closure used during a hydration notification", () => {
  const snapshots = cache();
  expect(snapshots.read(state, forProject("old")).length).toBe(0);
  expect(snapshots.read(state, forProject("second")).length).toBe(1);
});

it("preserves the selected array identity for equal inline selectors and unrelated updates", () => {
  const snapshots = cache();
  const before = snapshots.read(state, forProject("first"));
  expect(snapshots.read(state, forProject("first"))).toBe(before);
  expect(snapshots.read({ ...state }, forProject("first"))).toBe(before);
});
