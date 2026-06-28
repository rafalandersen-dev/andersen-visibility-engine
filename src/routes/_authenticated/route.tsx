/**
 * Authenticated gate. Every route under /app/* lives below this layout.
 * If there's no Supabase session once auth has loaded, redirect to /auth.
 * Also responsible for loading the user's workspace from Cloud on sign-in
 * and resetting in-memory store state on sign-out.
 */
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { hydrateForUser, resetStore } from "@/lib/store";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { loading, session } = useAuth();
  const navigate = useNavigate();
  const [hydrating, setHydrating] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      resetStore();
      navigate({ to: "/auth", search: { redirect: "/app" } as never, replace: true });
      return;
    }
    let cancelled = false;
    setHydrating(true);
    hydrateForUser(session.user.id).finally(() => {
      if (!cancelled) setHydrating(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loading, session, navigate]);

  if (loading || !session || hydrating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading workspace…</div>
      </div>
    );
  }

  return <Outlet />;
}

