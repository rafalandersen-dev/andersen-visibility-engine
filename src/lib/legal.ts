/**
 * Shared constants for the public legal / trust pages (Sprint 3 — Security &
 * Compliance Readiness Pack).
 *
 * The seller identity below is REAL registered data (Launch Gate P0-7,
 * e-handelslagen §8) — the same enskild firma that operates the other
 * Andersen Innovations businesses. Legal TEXT on the pages still awaits
 * lawyer review before broad commercial launch; the identity itself is final.
 */

/** Fixed publication date shown on every legal page ("Last updated"). */
export const LEGAL_LAST_UPDATED = "17 August 2026";

/**
 * Registered seller identity (e-handelslagen §8). Deliberately no street
 * address: a sole trader's registered address is a home address and is not
 * published (established owner precedent); it is provided on request via the
 * contact email, which §8 practice accepts alongside city + registry number.
 */
export const LEGAL_IDENTITY = {
  product: "Milo Growth",
  operator: "Andersen Innovations",
  legalName: "Rafal Andersen, enskild näringsidkare (sole trader), trading as Andersen Innovations",
  orgNumber: "871228-7971",
  vatNumber: "SE871228797101",
  fTax: "Godkänd för F-skatt (approved for Swedish F-tax)",
  supportEmail: "support@milogrowth.com",
  securityEmail: "security@milogrowth.com",
  address: "Malmö, Sweden",
} as const;

/** Note shown about localized (PL/SV/DA) versions. */
export const LEGAL_LOCALIZATION_NOTE =
  "Localized versions may be added before wider launch in Poland, Sweden and Denmark.";

/** All public legal/trust pages — used for cross-linking and footer links. */
export const LEGAL_PAGES: { to: string; title: string }[] = [
  { to: "/imprint", title: "Company Information" },
  { to: "/terms", title: "Terms of Service" },
  { to: "/privacy", title: "Privacy Policy" },
  { to: "/dpa", title: "Data Processing Agreement" },
  { to: "/subprocessors", title: "Subprocessors" },
  { to: "/security", title: "Security" },
  { to: "/ai-disclaimer", title: "AI Content Disclaimer" },
  { to: "/cookies", title: "Cookie & Analytics Policy" },
];
