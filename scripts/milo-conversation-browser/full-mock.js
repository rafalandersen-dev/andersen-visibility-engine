export const useStore = (selector) => selector(window.full.store);
export const setActiveProject = (projectId) => {
  window.full.store.activeProjectId = projectId;
};
export const saveWorkspaceNow = async () => {
  throw Error("Workspace saving is outside this read fixture.");
};
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
      { ownerId: window.full.other, projectId: "p", name: window.full.sharedName, role: "editor" },
    ],
    invitations: [],
  };
};
