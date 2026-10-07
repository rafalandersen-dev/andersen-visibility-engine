import {
  getState,
  getWorkspaceSaveContext,
  hasUnsavedWorkspaceChanges,
  updateProject,
  saveWorkspaceNow,
} from "@/lib/store";
import type { BrandSaveDeps } from "./brand-intelligence-form";

/** The Brand Intelligence editor's save dependencies on the real workspace store. */
export const storeBrandSaveDeps: BrandSaveDeps = {
  getProject: (id) => getState().projects.find((item) => item.id === id),
  isReady: () => getState().hydrated && !!getState().userId,
  // Epoch + user: a same-account sign-out/sign-in is a different session too.
  sessionKey: () => {
    const { epoch, userId } = getWorkspaceSaveContext();
    return userId ? `${epoch}:${userId}` : null;
  },
  hasUnsavedChanges: hasUnsavedWorkspaceChanges,
  updateProject,
  saveWorkspaceNow,
  now: () => new Date().toISOString(),
};
