// Reactive synthetic auth for the native-findings fixture. Unlike the intake fixture's no-op always-owner
// auth, this models TWO distinct identities — the workspace owner and an independent reviewer — and is
// genuinely subscribeable: it reads the live `fixture.authSnapshot` (rebuilt by the fixture only when the
// identity/role/hydration changes) through the SAME notification source as the store (`fixture.subscribe`,
// installed by createWorkspaceStore), so switching actor, signing out or losing hydration re-renders every
// `useAuth` consumer WITHOUT a harness remount. isOwner is the actor's OWN role (true only for the owner
// identity), never a blanket true — the reviewer is not a workspace owner.
import { useSyncExternalStore } from "react";
import { fixture } from "./fixture.js";

export function useAuth() {
  return useSyncExternalStore(
    fixture.subscribe ?? (() => () => {}),
    () => fixture.authSnapshot,
    () => fixture.authSnapshot,
  );
}

export function AuthProvider({ children }) {
  return children;
}
