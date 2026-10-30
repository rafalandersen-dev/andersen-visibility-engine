// Synthetic signed-in actor; the fixture toolbar can switch it to exercise the keyed reset.
import { fixture } from "./fixture.js";
export function useAuth() {
  return { user: { id: fixture.actorId } };
}
export function AuthProvider({ children }) {
  return children;
}
