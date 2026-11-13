// Synthetic signed-in actor; the fixture can sign it out (null) to exercise forced session loss.
import { fixture, record } from "./fixture.js";
export function useAuth() {
  const id = fixture.actorId;
  return {
    loading: false,
    session: id ? { user: { id } } : null,
    user: id ? { id, email: "owner@example.invalid" } : null,
    isOwner: true,
    roleLoaded: true,
    signOut: async () => {
      record("auth.signOut", {});
      throw Error("Fixture refuses auth.signOut.");
    },
    refreshRole: async () => {},
  };
}
export function AuthProvider({ children }) {
  return children;
}
