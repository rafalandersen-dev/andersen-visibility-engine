/**
 * Schema delivery capability — Article Studio 2.0 / P1.1 H.
 *
 * "Generated" is NOT "delivered". Milo deterministically generates valid JSON-LD
 * from the canonical visible content, but what a connector does with it varies,
 * and Milo does not (yet) verify the live destination. This module reports the
 * honest per-connector status so the UI never claims a schema is live when it
 * is only planned for a payload.
 *
 * Levels never conflate implementation / eligibility / appearance (C15): this is
 * strictly about DELIVERY of the markup, not whether Google shows a rich result.
 */
import type { PublishingConnectorType } from "./types";

export type SchemaDeliveryLevel = "planned" | "no" | "unverified" | "unsupported";

export interface SchemaConnectorCapability {
  connector: "wordpress" | "shopify" | "custom" | "none";
  /** Milo produced valid JSON-LD for the asset. */
  generated: boolean;
  /** Planned inclusion only. This capability is not a receipt of a sent payload. */
  includedInPayload: SchemaDeliveryLevel;
  /** Did the destination keep it? WordPress/Shopify may strip inline <script>. */
  retainedByConnector: SchemaDeliveryLevel;
  /** Have we confirmed it on the live page? (We do not — always unverified/unsupported.) */
  verifiedOnDestination: SchemaDeliveryLevel;
  note: string;
}

/**
 * The honest schema-delivery matrix for a connector. `hasSchema` is whether Milo
 * generated any JSON-LD for the asset.
 *
 * - WordPress / Shopify: JSON-LD is planned for the post/article body, but security plugins / theme sanitisation may strip an inline
 *   <script>, and Milo does not read back the live page — so retention and
 *   destination-verification are UNVERIFIED. This function has no dispatch receipt.
 * - Custom endpoint: receives markdown only; JSON-LD delivery is UNSUPPORTED
 *   without a connector-contract change (which needs approval). Never reported as
 *   complete for this connector.
 */
export function schemaConnectorCapability(
  connectorType: PublishingConnectorType | undefined,
  hasSchema: boolean,
): SchemaConnectorCapability {
  if (!connectorType) {
    return {
      connector: "none",
      generated: hasSchema,
      includedInPayload: "unverified",
      retainedByConnector: "unverified",
      verifiedOnDestination: "unverified",
      note: "No publishing connector selected. No payload delivery is established.",
    };
  }
  if (connectorType === "custom") {
    return {
      connector: "custom",
      generated: hasSchema,
      includedInPayload: "no",
      retainedByConnector: "unsupported",
      verifiedOnDestination: "unsupported",
      note: "The custom endpoint receives markdown only. JSON-LD delivery is not supported without a connector-contract change.",
    };
  }
  const connector = connectorType === "shopify" ? "shopify" : "wordpress";
  return {
    connector,
    generated: hasSchema,
    includedInPayload: hasSchema ? "planned" : "no",
    retainedByConnector: "unverified",
    verifiedOnDestination: "unverified",
    note: "Structured data is planned for the outgoing body; this is not a dispatch receipt. Retention depends on the site's sanitisation, and Milo does not verify the live page — implementation, not confirmed appearance.",
  };
}
