/**
 * Single source of truth for Milo Growth pricing & project limits.
 *
 * Pricing is intentionally not wired to Stripe yet — billing buttons in the app
 * should treat these values as the canonical display values and the `MAX_PROJECTS_PER_USER`
 * constant as the enforced ceiling for normal (non-owner) accounts.
 *
 * Owner accounts (role = 'owner' in public.user_roles) bypass all limits and billing.
 */

export const CURRENCY = "PLN" as const;

export type PlanId = "free" | "starter" | "growth";

export type Plan = {
  id: PlanId;
  name: string;
  pricePerMonth: number; // PLN, 0 for free
  projectsIncluded: number; // how many projects this plan includes
  recommended?: boolean;
  tagline: string;
  features: string[];
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free Preview",
    pricePerMonth: 0,
    projectsIncluded: 0,
    tagline: "Explore the workspace with read-only demo data.",
    features: [
      "Browse a fully populated demo project",
      "Preview opportunities, calendar and editor",
      "No project creation, no exports",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    pricePerMonth: 149,
    projectsIncluded: 1,
    tagline: "One brand, the full workflow.",
    features: [
      "1 active project",
      "SEO opportunities & content calendar",
      "Markdown & HTML export",
      "Email support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    pricePerMonth: 249,
    projectsIncluded: 2,
    recommended: true,
    tagline: "For owners running two brands or markets.",
    features: [
      "2 active projects",
      "Everything in Starter",
      "Priority email support",
      "Add more projects at 99 PLN each",
    ],
  },
];

/** Add-on for additional projects beyond the plan's included count. */
export const EXTRA_PROJECT = {
  name: "Extra Project",
  pricePerMonth: 99,
  description: "Add another brand or market to your workspace.",
} as const;

/** Hard cap of projects per normal (non-owner) account, regardless of plan + add-ons. */
export const MAX_PROJECTS_PER_USER = 5;

/** Convenience formatter so every UI surface renders prices identically. */
export function formatPrice(amount: number): string {
  if (amount === 0) return `0 ${CURRENCY}`;
  return `${amount} ${CURRENCY}`;
}

/**
 * Server- and client-callable helper for the project-limit rule.
 * Owners are unlimited. Everyone else is capped at MAX_PROJECTS_PER_USER.
 */
export function canCreateProject(opts: { isOwner: boolean; currentProjectCount: number }): boolean {
  if (opts.isOwner) return true;
  return opts.currentProjectCount < MAX_PROJECTS_PER_USER;
}
