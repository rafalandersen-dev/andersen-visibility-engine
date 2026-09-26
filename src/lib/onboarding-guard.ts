/**
 * The authenticated layout's ONBOARDING decision, as a pure function so the route contract is testable.
 * Authentication (`/auth` redirect), hydration and the owner bypass stay in `src/routes/_authenticated/route.tsx`;
 * this only answers: "given a hydrated, non-owner user's projects and the current path, must they be sent
 * into onboarding?" (P4 review link integration fix, 2026-09-26.)
 */
import { isProjectSetupComplete } from "./onboarding";
import type { Project } from "./types";

export const ONBOARDING_PATH = "/app/onboarding";
export const CONNECT_PATH = "/app/connect";
export const SETUP_PATH = "/app/setup";
/**
 * Routes that must render for ANY authenticated user regardless of how far through onboarding they are
 * (consent page, project setup itself, team pages) — and, since P4, the scoped citation-review link:
 * an assigned reviewer opens the OWNER's finding via a deep link and need not own or set up a project of
 * their own (`reviewerLinkContext` supplies the owner's project). The route itself still validates the
 * link and the server still re-checks the finding-scoped assignment; this exemption grants no access, it
 * only stops the onboarding wizard from swallowing the link.
 */
export const ONBOARDING_EXEMPT_PATHS: readonly string[] = [
  ONBOARDING_PATH,
  CONNECT_PATH,
  SETUP_PATH,
  "/app/collaborators",
  "/app/conversations",
  "/app/citation-review",
  "/app",
  "/app/",
];

/** True when a hydrated NON-owner user on `pathname` must be redirected into onboarding: the path is not
 * exempt AND they have no project or their active (else first) project is not set up. */
export function onboardingRedirectNeeded(input: {
  pathname: string;
  projects: readonly Project[];
  activeProjectId: string | null | undefined;
}): boolean {
  if (ONBOARDING_EXEMPT_PATHS.includes(input.pathname)) return false;
  const active = input.projects.find((p) => p.id === input.activeProjectId) ?? input.projects[0];
  return input.projects.length === 0 || !isProjectSetupComplete(active);
}
