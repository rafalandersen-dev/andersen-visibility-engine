/**
 * Client-side auth context for Milo Growth.
 *
 * Wraps the app in __root.tsx and exposes the current Supabase session,
 * the user's profile row, and whether they hold the database-driven `owner` role.
 *
 * Owner-bypass logic everywhere in the app should read `isOwner` from useAuth().
 * Never hardcode an owner email allowlist.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { INITIAL_AUTH_SESSION, observeAuthSession } from "./auth-session";

type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  isOwner: boolean;
  /**
   * True once the owner-role lookup for the CURRENT session user has resolved.
   * `isOwner === false` is ambiguous until this is true (not-yet-checked vs
   * confirmed-not-owner), so owner-bypass guards must wait for it to avoid
   * misfiring during the async role load (e.g. redirecting an owner into
   * onboarding before their role comes back).
   */
  roleLoaded: boolean;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(INITIAL_AUTH_SESSION);
  const observer = useRef<ReturnType<typeof observeAuthSession> | null>(null);

  useEffect(() => {
    const current = observeAuthSession(
      supabase.auth,
      async (userId) => {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "owner")
          .maybeSingle();
        if (error) throw error;
        return !!data;
      },
      setSnapshot,
    );
    observer.current = current;
    return () => {
      current.dispose();
      if (observer.current === current) observer.current = null;
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      ...snapshot,
      user: snapshot.session?.user ?? null,
      signOut: async () => {
        await supabase.auth.signOut();
      },
      refreshRole: async () => {
        await observer.current?.refreshRole();
      },
    }),
    [snapshot],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
