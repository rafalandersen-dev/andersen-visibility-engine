/**
 * Shared constants for the public legal / trust pages (Sprint 3 — Security &
 * Compliance Readiness Pack).
 *
 * These are practical beta-readiness placeholders, NOT final lawyer-approved
 * text. Company legal entity details, addresses and registration numbers are
 * intentionally left as placeholders — do not invent them.
 */

/** Fixed publication date shown on every legal page ("Last updated"). */
export const LEGAL_LAST_UPDATED = "30 June 2026";

/** Operator / contact placeholders. Confirm real details before public launch. */
export const LEGAL_IDENTITY = {
  product: "Milo Growth",
  operator: "Andersen Innovations",
  legalName: "Andersen Innovations [legal entity details to be added]",
  supportEmail: "support@milogrowth.com",
  securityEmail: "security@milogrowth.com",
  address: "[business address to be added]",
} as const;

/** Standard beta / legal-review banner copy. */
export const LEGAL_REVIEW_NOTE =
  "This page is provided for beta readiness and should be reviewed by a qualified legal professional before broad commercial launch.";

/** Note shown about localized (PL/SV/DA) versions. */
export const LEGAL_LOCALIZATION_NOTE =
  "Localized versions may be added before wider launch in Poland, Sweden and Denmark.";

/** All public legal/trust pages — used for cross-linking and footer links. */
export const LEGAL_PAGES: { to: string; title: string }[] = [
  { to: "/terms", title: "Terms of Service" },
  { to: "/privacy", title: "Privacy Policy" },
  { to: "/dpa", title: "Data Processing Agreement" },
  { to: "/subprocessors", title: "Subprocessors" },
  { to: "/security", title: "Security" },
  { to: "/ai-disclaimer", title: "AI Content Disclaimer" },
  { to: "/cookies", title: "Cookie & Analytics Policy" },
];
