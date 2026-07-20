/**
 * Schema delivery capability — Article Studio 2.0 / P1.1 H.
 *
 * "Generated" is NOT "delivered". Milo deterministically generates valid JSON-LD
 * from the canonical visible content, but what a connector does with it varies,
 * and Milo does not (yet) verify the live destination. This module reports the
 * honest per-connector status so the UI never claims a schema is live when it
 * only left our side.
 *
 * Levels never conflate implementation / eligibility / appearance (C15): this is
 * strictly about DELIVERY of the markup, not whether Google shows a rich result.
 */
import type { PublishingConnectorType } from "./types";

export type SchemaDeliveryLevel = "yes" | "no" | "unverified" | "unsupported";

export interface SchemaConnectorCapability {
  connector: "wordpress" | "shopify" | "custom";
  /** Milo produced valid JSON-LD for the asset. */
  generated: boolean;
  /** Was the JSON-LD included in what we sent to the connector? */
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
 * - WordPress / Shopify: the JSON-LD is appended to the post/article body we
 *   send, but security plugins / theme sanitisation may strip an inline
 *   <script>, and Milo does not read back the live page — so retention and
 *   destination-verification are UNVERIFIED, not "delivered".
 * - Custom endpoint: receives markdown only; JSON-LD delivery is UNSUPPORTED
 *   without a connector-contract change (which needs approval). Never reported as
 *   complete for this connector.
 */
export function schemaConnectorCapability(
  connectorType: PublishingConnectorType | undefined,
  hasSchema: boolean,
): SchemaConnectorCapability {
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
    includedInPayload: hasSchema ? "yes" : "no",
    retainedByConnector: "unverified",
    verifiedOnDestination: "unverified",
    note: "Structured data is appended to the published body. Retention depends on the site's sanitisation, and Milo does not verify the live page — implementation, not confirmed appearance.",
  };
}
