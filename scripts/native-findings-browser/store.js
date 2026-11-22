// Synthetic workspace store for the native-findings fixture. Reuses the intake fixture's store machinery
// (the real useSyncExternalStore reading contract + the live session epoch/hydration/project notification
// source) bound to THIS fixture singleton — no copied framework. build.cjs turns every OTHER export of
// src/lib/store.ts into a recorded refusal; the four here are the ones the author/review surfaces read.
import { createWorkspaceStore } from "../native-google-intake-browser/store.js";
import { fixture, record } from "./fixture.js";

const store = createWorkspaceStore(fixture, { recordFn: record });
export const getState = store.getState;
export const setState = store.setState;
export const useStore = store.useStore;
export const getWorkspaceSaveContext = store.getWorkspaceSaveContext;
