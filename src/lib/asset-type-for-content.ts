import type { AssetType, ContentType } from "./types";

/** The established Plan content type → Studio asset type mapping (moved verbatim from `CreateContentDialog`
 * so non-React modules can reuse it). Unknown or legacy content types fall back exactly as the dialog does. */
export const ASSET_TYPE_BY_CONTENT_TYPE: Readonly<Record<string, AssetType>> = {
  "Blog Article": "article",
  Guide: "article",
  "Landing Page": "landingPage",
  "Location Page": "landingPage",
  "Service Page": "servicePage",
  "FAQ Page": "faq",
  Comparison: "comparison",
};
export function assetTypeForContentType(
  contentType: ContentType | string | undefined,
  fallback: AssetType | null = null,
): AssetType {
  return (contentType && ASSET_TYPE_BY_CONTENT_TYPE[contentType]) || fallback || "article";
}
