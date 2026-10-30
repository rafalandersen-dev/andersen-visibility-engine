export const useStore = (selector) => selector(window.full.store);
export const setActiveProject = (projectId) => {
  window.full.store.activeProjectId = projectId;
};
export const saveWorkspaceNow = async () => {
  throw Error("Workspace saving is outside this read fixture.");
};
// Synthetic save status for the shell (no persistence here). A hydrated fixture
// workspace reports the ordinary confirmed "saved" bar, as the product does after
// loading; otherwise nothing renders. Snapshots are constants so React's external
// store comparison stays stable.
const SAVED = Object.freeze({ kind: "saved" }),
  NOT_READY = Object.freeze({ kind: "notReady" });
export const getWorkspaceSaveStatus = () =>
  window.full.store.hydrated && window.full.store.userId ? SAVED : NOT_READY;
export const useWorkspaceSaveStatus = () => getWorkspaceSaveStatus();
export const getWorkspaceSaveContext = () => ({
  epoch: 0,
  userId: window.full.store.userId ?? null,
  hydrated: !!window.full.store.hydrated,
});
export const reloadWorkspaceForUser = async () => {
  throw Error("Workspace hydration is outside this read fixture.");
};
export const useAuth = () => ({
  user: { id: window.full.actor, email: "member@example.test" },
  isOwner: false,
  signOut: async () => {
    throw Error("Signing out is outside this local fixture.");
  },
});
export const listMyProjectTeamsFn = async () => {
  if (window.full.denied) throw Error("shared access unavailable");
  return {
    projects: [
      {
        ownerId: window.full.other,
        projectId: "p",
        name: window.full.sharedName,
        role: window.full.sharedRole ?? "editor",
      },
    ],
    invitations: [],
  };
};
