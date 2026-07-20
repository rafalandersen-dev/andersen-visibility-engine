/**
 * Author & E-E-A-T — Article Studio 2.0 / P1.1 F.
 *
 * The author is USER-supplied. Milo never invents a name, bio, or credential —
 * a fabricated reviewer byline is a larger reputational/legal risk than the whole
 * volume question (C22). These helpers render the visible byline, decide when an
 * author is "resolved", and drive the YMYL author gate (J) — WITHOUT demanding
 * clinical credentials for ordinary, non-medical content.
 */
import type { ContentAsset, ContentAuthor } from "./types";

/**
 * An author is "resolved" when it has a real name AND at least one identity /
 * qualification signal (bio, credentials, a profile URL, or a sameAs). A bare
 * name with nothing behind it is not enough for E-E-A-T.
 */
export function isAuthorResolved(author: ContentAuthor | undefined): boolean {
  if (!author || !author.name || !author.name.trim()) return false;
  return Boolean(
    (author.bio && author.bio.trim()) ||
    (author.credentials && author.credentials.trim()) ||
    (author.url && author.url.trim()) ||
    (author.sameAs && author.sameAs.length > 0),
  );
}

/**
 * For YMYL content an author is REQUIRED and must be resolved. Returns true when
 * that gate is UNMET. Non-YMYL content never triggers this — ordinary posts do
 * not need a named author with clinical credentials.
 */
export function authorRequiredUnresolved(asset: ContentAsset, ymyl: boolean): boolean {
  if (!ymyl) return false;
  return !isAuthorResolved(asset.author);
}

/** The author fields for JSON-LD (Person), or undefined when no name is set. */
export function authorSchemaInput(
  author: ContentAuthor | undefined,
): { name: string; url?: string; sameAs?: string[] } | undefined {
  if (!author || !author.name || !author.name.trim()) return undefined;
  return {
    name: author.name.trim(),
    ...(author.url && author.url.trim() ? { url: author.url.trim() } : {}),
    ...(author.sameAs && author.sameAs.length ? { sameAs: author.sameAs } : {}),
  };
}

/**
 * The visible "About the author" markdown block, composed into the canonical body
 * so the byline the reader sees matches the author JSON-LD. "" when no author.
 * Only real supplied fields are rendered — nothing is invented.
 */
export function authorBlockMarkdown(author: ContentAuthor | undefined): string {
  if (!author || !author.name || !author.name.trim()) return "";
  const name = author.name.trim();
  const roleCred = [author.role, author.credentials]
    .map((x) => (x || "").trim())
    .filter(Boolean)
    .join(", ");
  const nameMd =
    author.url && /^https?:\/\//.test(author.url.trim()) ? `[${name}](${author.url.trim()})` : name;
  const byline = `**${nameMd}${roleCred ? ` — ${roleCred}` : ""}**`;
  const parts = [byline];
  if (author.bio && author.bio.trim()) parts.push(author.bio.trim());
  return `## About the author\n\n${parts.join("\n\n")}`;
}
