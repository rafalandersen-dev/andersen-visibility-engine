/**
 * Authenticated gate. Every route under /app/* lives below this layout.
 * If there's no Supabase session once auth has loaded, redirect to /auth.
 * Also responsible for loading the user's workspace from Cloud on sign-in
 * and resetting in-memory store state on sign-out.
 *
 * Onboarding guard: once hydrated, if the active project is not set up (or the
 * user has no projects), normal users are redirected into /app/onboarding.
 * Owners bypass the guard (dev/admin), and /app/onboarding itself is exempt.
 */
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { hydrateForUser, resetStore, useStore } from "@/lib/store";
import { isProjectSetupComplete } from "@/lib/onboarding";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

const ONBOARDING_PATH = "/app/onboarding";
const CONNECT_PATH = "/app/connect";

function AuthenticatedLayout() {
  const { loading, session, isOwner, roleLoaded } = useAuth();
  const navigate = useNavigate();
  const [hydrating, setHydrating] = useState(true);
  const location = useRouterState({ select: (s) => s.location });
  const pathname = location.pathname;
  const projects = useStore((s) => s.projects);
  const activeProjectId = useStore((s) => s.activeProjectId);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      resetStore();
      // Preserve where the user was headed so login can return them there
      // (e.g. the /app/connect consent page for the Claude OAuth flow).
      const redirect = `${location.pathname}${location.searchStr}`;
      navigate({ to: "/auth", search: { redirect } as never, replace: true });
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

  // Onboarding redirect — only after hydration AND once the owner-role lookup
  // has resolved (otherwise a stale isOwner === false races the async role
  // load and yanks owners into onboarding), for non-owner users, off the
  // onboarding route itself.
  useEffect(() => {
    if (loading || !session || hydrating || !roleLoaded || isOwner) return;
    // The consent page must render for any authenticated user regardless of
    // onboarding state, so it is exempt from the onboarding guard.
    if (pathname === ONBOARDING_PATH || pathname === CONNECT_PATH) return;
    const active = projects.find((p) => p.id === activeProjectId) ?? projects[0];
    const needsOnboarding = projects.length === 0 || !isProjectSetupComplete(active);
    if (needsOnboarding) {
      navigate({ to: ONBOARDING_PATH, replace: true });
    }
  }, [loading, session, hydrating, roleLoaded, isOwner, pathname, projects, activeProjectId, navigate]);

  if (loading || !session || hydrating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading workspace…</div>
      </div>
    );
  }

  return <Outlet />;
}
