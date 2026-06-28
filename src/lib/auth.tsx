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
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  isOwner: boolean;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  async function loadRole(userId: string | undefined) {
    if (!userId) {
      setIsOwner(false);
      return;
    }
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "owner")
      .maybeSingle();
    setIsOwner(!!data);
  }

  useEffect(() => {
    let mounted = true;

    // Subscribe FIRST so we don't miss the initial event.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      // Defer Supabase calls outside the callback to avoid deadlocks.
      setTimeout(() => loadRole(newSession?.user?.id), 0);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      loadRole(data.session?.user?.id).finally(() => {
        if (mounted) setLoading(false);
      });
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      isOwner,
      signOut: async () => {
        await supabase.auth.signOut();
      },
      refreshRole: async () => {
        await loadRole(session?.user?.id);
      },
    }),
    [loading, session, isOwner],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
