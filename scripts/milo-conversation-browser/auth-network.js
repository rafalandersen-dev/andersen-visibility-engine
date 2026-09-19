export const supabase = {
  auth: {
    getSession: () => window.authFixture.initial.promise,
    onAuthStateChange: (callback) => {
      window.authFixture.emit = (event, session) => {
        window.authFixture.current = session;
        callback(event, session);
      };
      return {
        data: {
          subscription: {
            unsubscribe() {
              window.authFixture.emit = null;
            },
          },
        },
      };
    },
    signOut: async () => window.authFixture.emit("SIGNED_OUT", null),
  },
  from: (table) => {
    if (table !== "user_roles") throw Error(`Unexpected fixture table ${table}`);
    let actor;
    const query = {
      select: () => query,
      eq: (key, value) => {
        if (key === "user_id") actor = value;
        return query;
      },
      maybeSingle: () => window.authFixture.role(actor),
    };
    return query;
  },
  rpc: async (name, input) => {
    if (name !== "read_workspace_bundle") throw Error(`Unexpected fixture mutation ${name}`);
    window.authFixture.hydrations.push(input.p_user_id);
    return window.authFixture.workspace(input.p_user_id);
  },
};
export const getMyEntitlementFn = async () => ({ entitlement: { planId: "freePreview" } });
export const listMyProjectTeamsFn = async () => ({
  projects: [
    {
      ownerId: window.authFixture.client,
      projectId: "p",
      name: "Shared client context",
      role: "editor",
    },
  ],
  invitations: [],
});
