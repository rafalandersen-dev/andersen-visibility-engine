// Synthetic replacement of src/lib/citation-protocol.functions.ts. Reads return the in-page dataset for the
// requested project: the raw protocol state (authoring) and the RESOLVED result with explicit reports (coverage).
// The only write performed is a lock, to demonstrate the coverage refresh; it is recorded with its exact input.
import { fixture } from "./fixture.js";
const never = () => new Promise(() => {});
const refuse = (name) => async (input) => {
  fixture.calls.push({ name, write: true, refused: true, data: input?.data });
  throw Error(`Fixture refuses ${name}.`);
};
export const readCitationProtocolFn = async ({ data }) => {
  fixture.calls.push({ name: "readCitationProtocolFn", projectId: data.projectId });
  const set = fixture.datasets[data.projectId];
  return structuredClone({
    answers: [],
    panels: set?.panels ?? [],
    brandRuns: set?.brandRuns ?? [],
    tombstones: [],
    runConsumed: [],
    erasureByVersion: [],
    erasureOverflow: set?.erasureOverflow ?? 0,
  });
};
export const readResolvedCapturesFn = async ({ data }) => {
  fixture.calls.push({ name: "readResolvedCapturesFn", projectId: data.projectId });
  if (fixture.variant === "loading") return never();
  if (fixture.variant === "error" || fixture.failCoverage)
    throw Error("Synthetic coverage read failure");
  const set = fixture.datasets[data.projectId];
  return structuredClone({
    panels: set?.panels ?? [],
    brandRuns: set?.brandRuns ?? [],
    captures: [],
    erasedSlots: [],
    reports: set?.reports ?? [],
    erasureOverflow: set?.erasureOverflow ?? 0,
  });
};
export const lockCitationPanelFn = async ({ data }) => {
  fixture.calls.push({ name: "lockCitationPanelFn", write: true, data: structuredClone(data) });
  return fixture.lock(data);
};
export const saveCitationPanelDraftFn = refuse("saveCitationPanelDraftFn");
export const approveBrandRunFn = refuse("approveBrandRunFn");
export const importManualCaptureFn = refuse("importManualCaptureFn");
