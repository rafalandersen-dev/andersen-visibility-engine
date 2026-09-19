import type { Session } from "@supabase/supabase-js";

export type AuthSessionSnapshot = {
  loading: boolean;
  session: Session | null;
  isOwner: boolean;
  roleLoaded: boolean;
};
export const INITIAL_AUTH_SESSION: AuthSessionSnapshot = {
  loading: true,
  session: null,
  isOwner: false,
  roleLoaded: false,
};
type Source = {
  getSession(): Promise<{ data: { session: Session | null }; error?: unknown }>;
  onAuthStateChange(callback: (event: string, session: Session | null) => void): {
    data: { subscription: { unsubscribe(): void } };
  };
};

/** Session events supersede the initial read. Role results belong to one exact
 * observation, including sign-out/sign-in for the same account. This is a UI
 * mirror only; server-side authorization remains authoritative. */
export function observeAuthSession(
  source: Source,
  readOwner: (userId: string) => Promise<boolean>,
  update: (snapshot: AuthSessionSnapshot) => void,
) {
  let active = true,
    sessionRevision = 0,
    roleRevision = 0;
  let snapshot = INITIAL_AUTH_SESSION;
  let roleTimer: ReturnType<typeof setTimeout> | undefined;
  const publish = (next: AuthSessionSnapshot) => {
    if (!active) return;
    snapshot = next;
    update(next);
  };
  const refreshRole = async () => {
    if (!active) return;
    clearTimeout(roleTimer);
    const expectedSession = sessionRevision,
      expectedRole = ++roleRevision,
      userId = snapshot.session?.user.id;
    if (!userId) return;
    publish({ ...snapshot, isOwner: false, roleLoaded: false });
    const current = () =>
      active && expectedSession === sessionRevision && expectedRole === roleRevision;
    try {
      const isOwner = await readOwner(userId);
      if (current()) publish({ ...snapshot, isOwner, roleLoaded: true });
    } catch {
      // Failed lookup is unknown, not a confirmed non-owner role.
      if (current()) publish({ ...snapshot, isOwner: false, roleLoaded: false });
    }
  };
  const accept = (session: Session | null) => {
    if (!active) return;
    sessionRevision++;
    roleRevision++;
    clearTimeout(roleTimer);
    publish({ loading: false, session, isOwner: false, roleLoaded: !session });
    // Supabase calls must run outside its auth callback to avoid deadlocks.
    if (session) roleTimer = setTimeout(() => void refreshRole(), 0);
  };
  const initialRevision = sessionRevision;
  const { data } = source.onAuthStateChange((_event, session) => accept(session));
  void source.getSession().then(
    ({ data, error }) => {
      if (active && initialRevision === sessionRevision) accept(error ? null : data.session);
    },
    () => {
      if (active && initialRevision === sessionRevision) accept(null);
    },
  );
  return {
    refreshRole,
    dispose: () => {
      active = false;
      roleRevision++;
      clearTimeout(roleTimer);
      data.subscription.unsubscribe();
    },
  };
}
