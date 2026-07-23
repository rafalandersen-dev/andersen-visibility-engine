/**
 * Internal-link prompt rule — the generation-side half of link safety.
 *
 * Root cause this fixes: the drafting prompts used to TEACH the model an example
 * path ("relative paths like /services"), so on sites where the page map was
 * unknown the model dutifully linked every service mention to an invented
 * "/services" — a path that often does not exist. The resolver then blocked
 * publishing (correctly), and already-live articles carried dead links.
 *
 * The rule is now derived from the project's REAL page map: the same-origin
 * sitemap inventory (P1.1 D) plus the user's explicitly-approved paths — the
 * exact same sources `buildKnownInternalPaths`/`buildActiveInternalPaths` feed
 * the link-safety resolver, so generation and the gate share one vocabulary.
 * With no inventory available the model is told to invent NOTHING.
 *
 * Pure — no I/O; safe for the server fns (project travels in the request).
 */
import type { Project } from "./types";
import { normalizeInternalPath } from "./markdown";

/** Prompt-size bound: enough for a small-business site, never a token flood. */
export const MAX_PROMPT_PATHS = 60;

/** The real internal paths the model may link to: sitemap inventory ∪ approved. */
export function promptLinkPaths(project: Project | undefined): string[] {
  const paths = new Set<string>();
  for (const p of project?.sitemapInventory?.paths ?? []) {
    if (typeof p === "string" && p.startsWith("/")) paths.add(p);
  }
  for (const p of project?.approvedInternalPaths ?? []) {
    if (typeof p === "string" && p.startsWith("/")) paths.add(normalizeInternalPath(p));
  }
  return [...paths].slice(0, MAX_PROMPT_PATHS);
}

/**
 * The "Internal links" rule line for every drafting/improve prompt. One bullet,
 * ready to sit inside a Markdown-rules list.
 */
export function internalLinkRule(project: Project | undefined): string {
  const paths = promptLinkPaths(project);
  if (paths.length) {
    return (
      `- Internal links: link ONLY to paths from this exact list of REAL pages on this site ` +
      `(never invent, guess or generalise a path): ${paths.join(", ")}. ` +
      `When linking a treatment/service/product by name, use its exact page from the list. ` +
      `If nothing on the list fits, leave the mention as plain text.`
    );
  }
  return (
    `- Internal links: this site's page map is not available, so do NOT invent internal ` +
    `paths (no "/services", no guessed slugs). You may link "/" where genuinely relevant; ` +
    `leave every other internal mention as plain text.`
  );
}
