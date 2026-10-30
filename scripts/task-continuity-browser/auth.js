// Synthetic signed-in actor. Never a real session; sign-out and role refresh are refused.
import { fixture, record } from "./fixture.js";
const refuse = (name) => async () => {
  record("auth." + name, {});
  throw Error(`Fixture refuses auth.${name}.`);
};
const signOut = refuse("signOut");
const refreshRole = refuse("refreshRole");
export function useAuth() {
  const id = fixture.actorId;
  return {
    loading: false,
    session: { user: { id } },
    user: { id, email: "owner@example.invalid" },
    isOwner: true,
    roleLoaded: true,
    signOut,
    refreshRole,
  };
}
export function AuthProvider({ children }) {
  return children;
}
