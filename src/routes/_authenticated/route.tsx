/**
 * Authenticated gate. Every route under /app/* lives below this layout.
 * If there's no Supabase session once auth has loaded, redirect to /auth.
 * Also responsible for loading the user's workspace from Cloud on sign-in
 * and resetting in-memory store state on sign-out.
 *
 * Onboarding guard: once hydrated, if the active project is not set up (or the
 * user has no projects), normal users are redirected into /app/onboarding.
 * Owners bypass the guard (dev/admin); the exempt paths (onboarding itself,
 * consent, setup, team pages, the scoped citation-review link) are the tested
 * pure contract in `@/lib/onboarding-guard`.
 */
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { hydrateForUser, resetStore, useStore } from "@/lib/store";
import { ONBOARDING_PATH, onboardingRedirectNeeded } from "@/lib/onboarding-guard";
import { useT } from "@/i18n";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { loading, session, isOwner, roleLoaded } = useAuth();
  // Screenshot QA can render the seeded workspace locally without weakening
  // production auth. Vite compiles DEV to false in every production build.
  const visualQa = import.meta.env.DEV && import.meta.env.VITE_MILO_VISUAL_QA === "true";
  const navigate = useNavigate();
  const [hydrating, setHydrating] = useState(true);
  const [retry, setRetry] = useState(0);
  const location = useRouterState({ select: (s) => s.location });
  const pathname = location.pathname;
  const isWorkspacePath = pathname === "/app" || pathname.startsWith("/app/");
  const searchStr = location.searchStr;
  const projects = useStore((s) => s.projects);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const hydrationFailed = useStore((s) => s.hydrationFailed);
  const workspaceUserId = useStore((s) => s.userId);
  const hydrated = useStore((s) => s.hydrated);
  const userId = session?.user.id;
  const t = useT();

  useEffect(() => {
    if (visualQa) {
      import("@/lib/visual-qa").then(({ initializeVisualQa }) => {
        initializeVisualQa();
        setHydrating(false);
      });
      return;
    }
    if (loading) return;
    if (!userId) {
      resetStore();
      return;
    }
    let cancelled = false;
    setHydrating(true);
    hydrateForUser(userId).finally(() => {
      if (!cancelled) setHydrating(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loading, userId, visualQa, retry]);

  useEffect(() => {
    if (visualQa || loading || userId || !isWorkspacePath) return;
    // Preserve the exact client/result destination through sign-in.
    void navigate({
      to: "/auth",
      search: { redirect: `${pathname}${searchStr}` } as never,
      replace: true,
    });
  }, [loading, userId, navigate, pathname, searchStr, visualQa, isWorkspacePath]);

  // Onboarding redirect — only after hydration AND once the owner-role lookup
  // has resolved (otherwise a stale isOwner === false races the async role
  // load and yanks owners into onboarding), for non-owner users, off the
  // onboarding route itself.
  useEffect(() => {
    if (visualQa || !isWorkspacePath) return;
    // A FAILED hydrate must never read as "no projects" (2026-07-25 outage:
    // the empty fallback sent a 5-project owner into the onboarding wizard).
    if (
      loading ||
      !userId ||
      workspaceUserId !== userId ||
      !hydrated ||
      hydrating ||
      hydrationFailed ||
      !roleLoaded ||
      isOwner
    )
      return;
    // Exempt paths (consent, setup, team pages, the scoped citation-review link
    // an assigned reviewer opens without an owned workspace) render for any
    // authenticated user; everyone else without a set-up project is onboarded.
    if (onboardingRedirectNeeded({ pathname, projects, activeProjectId })) {
      navigate({ to: ONBOARDING_PATH, replace: true });
    }
  }, [
    loading,
    userId,
    workspaceUserId,
    hydrated,
    hydrating,
    hydrationFailed,
    roleLoaded,
    isOwner,
    pathname,
    projects,
    activeProjectId,
    navigate,
    visualQa,
    isWorkspacePath,
  ]);

  if (
    visualQa
      ? hydrating
      : loading ||
        !userId ||
        workspaceUserId !== userId ||
        hydrating ||
        (!hydrated && !hydrationFailed)
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div role="status" className="text-sm text-muted-foreground">
          {t("common.loading")}
        </div>
      </div>
    );
  }

  if (!visualQa && hydrationFailed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="max-w-sm space-y-4 text-center" role="alert">
          <div className="font-display text-lg text-foreground">{t("shell.loadError.title")}</div>
          <p className="text-sm text-muted-foreground">{t("shell.loadError.body")}</p>
          <Button onClick={() => setRetry((value) => value + 1)}>
            {t("shell.loadError.retry")}
          </Button>
        </div>
      </div>
    );
  }

  // Chat owns its actor/client/conversation keys. Updating a saved conversation
  // bookmark must preserve the live request and composer; other pages retain
  // their existing search-driven reset (editor/result deep links depend on it).
  const pageKey = pathname === "/app" || pathname === "/app/" ? "milo" : `${pathname}:${searchStr}`;
  return <Outlet key={`${userId}:${pageKey}`} />;
}
