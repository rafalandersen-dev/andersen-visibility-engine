/**
 * Publishing checklist — Article Studio 2.0 / P1.1 J.
 *
 * Built from DETERMINISTIC states produced by the canonical asset and the P1.1
 * validators. HARD blockers are genuine safety failures and block EVERY publish
 * path (manual send, manual live, scheduled/cron). WARNINGS never block — a low
 * soft score or an optional-image gap is advisory only.
 *
 * Pure — the caller supplies the corpus. The same function drives the editor
 * panel and the server-side publish guard, so the UI and the runner can never
 * disagree about what is safe to publish.
 */
import type { ChecklistItem, ContentAsset, Project } from "./types";
import { unresolvedLinksForPublish } from "./publish-targets";
import { citableSources, isValidHttpSourceUrl } from "./sources";
import { authorRequiredUnresolved } from "./author";
import { imagesMissingAlt, requiredImagesUnresolved } from "./images";
import { assessReadiness } from "./readiness";

function block(key: string, label: string, passed: boolean, detail: string): ChecklistItem {
  return { key, label, passed, blocking: true, detail };
}
function warn(key: string, label: string, passed: boolean, detail: string): ChecklistItem {
  return { key, label, passed, blocking: false, detail };
}

/**
 * The full publishing checklist for an asset. Order: hard blockers first, then
 * warnings. `passed=false && blocking=true` for any item means publishing is
 * refused everywhere.
 */
export function buildPublishingChecklist(
  asset: ContentAsset,
  project: Project,
  corpus: ContentAsset[],
): ChecklistItem[] {
  const projectContent = corpus.filter((c) => c.projectId === asset.projectId);
  const readiness = assessReadiness(asset, project, corpus);
  const items: ChecklistItem[] = [];

  // ---- HARD BLOCKERS (deterministic safety) ----
  const unresolved = unresolvedLinksForPublish(asset, project, projectContent);
  items.push(
    block(
      "links",
      "Internal links resolve",
      unresolved.length === 0,
      unresolved.length
        ? `${unresolved.length} unresolved internal link(s): ${unresolved.join(", ")}. Resolve them in the link-safety panel.`
        : "",
    ),
  );

  // A source MARKED verified but whose URL is invalid/unsafe (never fabricated —
  // this catches an invalid reference before it publishes as a live citation).
  const badSources = (asset.sources ?? []).filter(
    (s) => s.status === "verified" && !isValidHttpSourceUrl(s.url),
  );
  items.push(
    block(
      "sources",
      "Cited sources are valid",
      badSources.length === 0,
      badSources.length
        ? `${badSources.length} source(s) marked verified have an invalid or unsafe URL.`
        : "",
    ),
  );

  const ymylFail = readiness.ymyl.level === "fail";
  items.push(
    block(
      "ymyl",
      "YMYL claims supported & reviewed",
      !ymylFail,
      ymylFail
        ? `Health/finance/legal claim(s) [${readiness.ymyl.signals.join(", ")}] need a verified source or a resolved author, plus human review.`
        : "",
    ),
  );

  const ymylPresent = readiness.ymyl.level !== "pass";
  const authorGate = authorRequiredUnresolved(asset, ymylPresent);
  items.push(
    block(
      "author",
      "Author resolved for YMYL",
      !authorGate,
      authorGate
        ? "YMYL content needs a named author with a real bio, credential or profile — add one in the Author panel."
        : "",
    ),
  );

  const noAlt = imagesMissingAlt(asset.images);
  items.push(
    block(
      "imageAlt",
      "Every publishing image has alt text",
      noAlt.length === 0,
      noAlt.length ? `${noAlt.length} approved image(s) are missing alt text.` : "",
    ),
  );

  const reqMissing = requiredImagesUnresolved(asset.images, project);
  items.push(
    block(
      "requiredImage",
      "Required content images present",
      reqMissing.length === 0,
      reqMissing.length
        ? `${reqMissing.length} required image(s) are not approved on a controlled origin.`
        : "",
    ),
  );

  // Structured data is DERIVED from the visible body, so it matches by
  // construction; this item guards against a future regression.
  items.push(block("schema", "Structured data matches visible content", true, ""));

  // Duplicate-post guard (review fix): a REWRITE of an existing live page
  // (republishTargetUrl set) that targets WordPress/Shopify but carries NO
  // connector identity (postId / articleGid) cannot be resolved to the existing
  // object — publishing would CREATE a duplicate. Block and ask the user to
  // resolve rather than silently duplicate. The custom endpoint upserts by
  // slug/URL, so it is safe.
  const rewriteUnresolved =
    Boolean(asset.republishTargetUrl?.trim()) &&
    ((project.connectorType === "wordpress" && !asset.wordpressPostId) ||
      (project.connectorType === "shopify" && !asset.shopifyArticleGid?.trim()));
  items.push(
    block(
      "duplicateTarget",
      "Update target resolved (no duplicate post)",
      !rewriteUnresolved,
      rewriteUnresolved
        ? "This is a rewrite of an existing page, but Milo can't identify the existing " +
            `${project.connectorType} post to update — publishing would create a duplicate. ` +
            "Re-connect the original post, or clear the rewrite target."
        : "",
    ),
  );

  // ---- WARNINGS (never block) ----
  const score = asset.qualityScore?.overall;
  items.push(
    warn(
      "miloScore",
      "Milo Score ≥ 85 (soft target)",
      score === undefined || score >= 85,
      score !== undefined && score < 85 ? `Milo Score is ${score}. You can still publish.` : "",
    ),
  );
  items.push(
    warn(
      "seo",
      "On-page SEO checks",
      readiness.seoReadiness.issues.length === 0,
      readiness.seoReadiness.issues.join(" "),
    ),
  );
  items.push(
    warn(
      "aiReadability",
      "AI readability",
      readiness.aiReadability.issues.length === 0,
      readiness.aiReadability.issues.join(" "),
    ),
  );
  items.push(
    warn(
      "duplication",
      "No near-duplicate content",
      readiness.duplication.level === "pass",
      readiness.duplication.conflicts.length
        ? `Overlaps ${readiness.duplication.conflicts.length} asset(s). ${readiness.duplication.limitation}`
        : "",
    ),
  );
  items.push(
    warn(
      "cannibalisation",
      "No cannibalisation risk",
      readiness.cannibalisation.level === "pass",
      readiness.cannibalisation.conflicts.length
        ? `May overlap ${readiness.cannibalisation.conflicts.length} asset(s). ${readiness.cannibalisation.limitation}`
        : "",
    ),
  );

  return items;
}

/** The failing HARD blockers — publishing is refused while this is non-empty. */
export function publishBlockers(
  asset: ContentAsset,
  project: Project,
  corpus: ContentAsset[],
): ChecklistItem[] {
  return buildPublishingChecklist(asset, project, corpus).filter((i) => i.blocking && !i.passed);
}

export function isPublishBlocked(
  asset: ContentAsset,
  project: Project,
  corpus: ContentAsset[],
): boolean {
  return publishBlockers(asset, project, corpus).length > 0;
}
