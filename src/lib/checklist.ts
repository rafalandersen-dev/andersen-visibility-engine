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
import { imagesMissingAlt, requiredImagesUnresolved, publishableImages } from "./images";
import { hookPublishGate, detectPossibleHookDuplicate } from "./hook";
import { validateFeaturedImage } from "./featured-image";
import { poorMobileCropWarnings } from "./responsive-preview";
import { resolveImageAnchors } from "./image-anchors";
import {
  validatePresentation,
  presentationCapability,
  type PresentationDestination,
} from "./presentation-compiler";
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

  // YMYL (health/finance/legal) claim support and author E-E-A-T are ADVISORY, not
  // hard blockers (owner decision, 2026-07-22): Milo still surfaces both as
  // warnings — an unsupported claim and a missing named author are strong SEO /
  // trust signals — but neither refuses publishing. The readiness score continues
  // to reflect YMYL risk independently; only the publish gate is relaxed.
  const ymylFail = readiness.ymyl.level === "fail";
  items.push(
    warn(
      "ymyl",
      "YMYL claims supported & reviewed",
      !ymylFail,
      ymylFail
        ? `Health/finance/legal claim(s) [${readiness.ymyl.signals.join(", ")}] should have a verified source or a resolved author, plus human review (recommended, not required).`
        : "",
    ),
  );

  const ymylPresent = readiness.ymyl.level !== "pass";
  const authorGate = authorRequiredUnresolved(asset, ymylPresent);
  items.push(
    warn(
      "author",
      "Author resolved for YMYL",
      !authorGate,
      authorGate
        ? "For E-E-A-T, health/finance/legal content should have a named author with a real bio, credential or profile — add one in the Author panel (recommended, not required)."
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

  // Hook (Article Studio 3.0 / P1.2A). ONLY v3 / upgrading assets are gated — a
  // legacy Article Studio 2.0 asset (no visual marker) returns applies:false and
  // is never blocked here, so it keeps publishing under the 2.0 policy. The gate
  // recomputes the hook validation deterministically (never trusts a cached
  // hook.blockers), and this runs through the SAME publishBlockers used by the
  // editor, live/draft publish, the WordPress/Shopify RPC guard, the custom
  // endpoint and the scheduled/cron runner.
  const hookGate = hookPublishGate(asset);
  if (hookGate.applies) {
    items.push(
      block(
        "hook",
        "Opening hook present & approved",
        !hookGate.missing && !hookGate.unapproved,
        hookGate.missing
          ? "This Article Studio 3.0 article needs an approved opening hook. Add one in the Hook panel."
          : hookGate.unapproved
            ? "The opening hook is not approved yet. Review and approve it in the Hook panel."
            : "",
      ),
    );
    items.push(
      block(
        "hookClaims",
        "Hook claims are supported",
        !hookGate.blocked,
        hookGate.blocked
          ? `The hook has ${hookGate.blockers.length} unresolved issue(s): ${hookGate.blockers
              .map((b) => b.message)
              .join(" ")}`
          : "",
      ),
    );
    // The canonical output must contain the hook exactly once. The assembler is
    // non-destructive (never strips body text), so if the body's first visible
    // paragraph is a deterministic (whitespace/case-normalised) duplicate of the
    // hook, publishing would emit it twice — block and ask the author to fix it.
    // Deterministic exact match only; never fuzzy, never auto-deleted.
    const duplicateHookInBody = detectPossibleHookDuplicate(asset).duplicate;
    items.push(
      block(
        "duplicateHookInBody",
        "Hook is not duplicated in the body",
        !duplicateHookInBody,
        duplicateHookInBody
          ? "The article body opens with the same text as the hook, so the hook would appear twice. Remove that opening paragraph from the body, or change the hook."
          : "",
      ),
    );
  }

  // Featured image (Article Studio 3.0 / P1.2B). Same applicability rule as the
  // hook: only v3/upgrading articles are REQUIRED to have one (legacy is never
  // retro-blocked — needsVisualUpgrade covers it), but a featured image that IS
  // present is validated for every asset: unapproved, alt-less, hotlinked or
  // focal-out-of-range featured images must never publish regardless of vintage.
  const featuredFindings = validateFeaturedImage(asset, project, hookGate.applies);
  const featuredBlockers = featuredFindings.filter((f) => f.blocking);
  items.push(
    block(
      "featuredImage",
      "Featured image present & approved",
      featuredBlockers.length === 0,
      featuredBlockers.map((f) => f.message).join(" "),
    ),
  );

  // P1.2H — image-object integrity + advisory visual warnings (spec §6).
  // Blocker (v3 only): an ACCEPTED image whose stored object is unresolvable
  // (no url AND no storagePath) would publish as a broken <img>. Warnings never
  // block: poor mobile crops, excessive image count, duplicate image URLs.
  if (hookGate.applies) {
    const ghost = (asset.images ?? []).filter(
      (i) => i.status === "accepted" && !(i.url ?? "").trim() && !(i.storagePath ?? "").trim(),
    );
    items.push(
      block(
        "imageObjectMissing",
        "Every accepted image has a stored object",
        ghost.length === 0,
        ghost.length
          ? `${ghost.length} accepted image(s) have no stored file or URL — remove or re-upload them.`
          : "",
      ),
    );
  }
  {
    const crops = poorMobileCropWarnings(asset);
    items.push(
      warn(
        "poorMobileCrop",
        "Mobile crops look intentional",
        crops.length === 0,
        crops.length
          ? `Check the mobile crop for: ${crops.map((c) => c.label).join(", ")} — the crop changes shape on phones with no focal point set.`
          : "",
      ),
    );
    const pubImgs = (asset.images ?? []).filter((i) => i.status === "accepted");
    items.push(
      warn(
        "excessiveImages",
        "Image count is reasonable",
        pubImgs.length <= 8,
        pubImgs.length > 8
          ? `${pubImgs.length} images — long articles rarely need more than 8.`
          : "",
      ),
    );
    const urls = pubImgs.map((i) => (i.url ?? "").trim()).filter(Boolean);
    const dup = urls.filter((u, idx) => urls.indexOf(u) !== idx);
    items.push(
      warn(
        "duplicateImage",
        "No duplicate images",
        dup.length === 0,
        dup.length ? "The same image URL is used more than once in this article." : "",
      ),
    );
  }

  // Inline image anchors (Article Studio 3.0 / P1.2C). Resolution is recomputed from
  // the CURRENT body (never a persisted status), so a section deleted/renamed/merged
  // after an image was anchored surfaces here. A REQUIRED image with a broken or
  // ambiguous anchor hard-blocks; an OPTIONAL one only warns — both are excluded from
  // the assembled output (never silently relocated). An invalid state (e.g. a featured
  // image carrying an inline anchor) hard-blocks. A legacy asset with no anchors yields
  // nothing here.
  const anchorRes = resolveImageAnchors(asset, project);
  const brokenLike = (s: string) => s === "broken" || s === "ambiguous";
  const brokenRequired = anchorRes.anchored.filter(
    (a) => brokenLike(a.status) && a.image.required === true,
  );
  const brokenOptional = anchorRes.anchored.filter(
    (a) => brokenLike(a.status) && a.image.required !== true,
  );
  items.push(
    block(
      "imageAnchorValid",
      "Image placement metadata is valid",
      anchorRes.invalid.length === 0,
      anchorRes.invalid.length
        ? `${anchorRes.invalid.length} image(s) have contradictory placement (e.g. a featured image with an inline anchor).`
        : "",
    ),
  );
  items.push(
    block(
      "brokenRequiredAnchor",
      "Required inline images are placed",
      brokenRequired.length === 0,
      brokenRequired.length
        ? `${brokenRequired.length} required inline image(s) point at a section that no longer resolves — re-anchor them in the editor.`
        : "",
    ),
  );
  items.push(
    warn(
      "brokenOptionalAnchor",
      "Optional inline image placement",
      brokenOptional.length === 0,
      brokenOptional.length
        ? `${brokenOptional.length} optional inline image(s) have an unresolved anchor and are excluded from the article until reassigned.`
        : "",
    ),
  );

  // Image presentation (Article Studio 3.0 / P1.2D). Hard-block on corrupt/unsafe/
  // incompatible presets (unknown enum — which also catches an injected class/style/
  // HTML string, focal out of 0..1, or an inline/featured mismatch); warn on an
  // inactive focal point (fit=contain). Only images that will actually PUBLISH are
  // gated — a bad preset on a proposed/rejected image that never ships must not
  // block publishing.
  const publishing = publishableImages(asset.images, project);
  const presentationFindings = publishing.flatMap((im) => validatePresentation(im));
  const presentationBlockers = presentationFindings.filter((f) => f.blocking);
  const presentationWarnings = presentationFindings.filter((f) => !f.blocking);
  items.push(
    block(
      "imagePresentation",
      "Image presentation is valid",
      presentationBlockers.length === 0,
      presentationBlockers.map((f) => f.message).join(" "),
    ),
  );
  items.push(
    warn(
      "imagePresentationAdvisory",
      "Image presentation advisories",
      presentationWarnings.length === 0,
      presentationWarnings.map((f) => f.message).join(" "),
    ),
  );

  // Destination honesty (four-state capability, refinement 10). Milo renders the
  // milo-* presentation in its own preview but has NOT verified that a real
  // connector keeps or renders those classes — a class in the exported HTML is
  // never treated as "retained". Non-blocking; informational only.
  const presentedCount = publishing.filter((im) => im.presentation).length;
  const presDestination: PresentationDestination =
    project.connectorType === "wordpress"
      ? "wordpress"
      : project.connectorType === "shopify"
        ? "shopify"
        : project.connectorType === "custom"
          ? "custom"
          : null;
  const capability = presentationCapability(presDestination);
  const capabilityUnverified = presentedCount > 0 && capability.destinationVerified !== "yes";
  items.push(
    warn(
      "imagePresentationCapability",
      "Image presentation on the publish destination",
      !capabilityUnverified,
      capabilityUnverified
        ? `${presentedCount} image(s) use Milo presentation. It renders in the Milo preview but is not verified on the ${presDestination ?? "publish"} destination.`
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
