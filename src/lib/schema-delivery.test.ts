/**
 * Schema delivery capability (Article Studio 2.0 / P1.1 H).
 *
 * "Generated" is not "delivered": the matrix must report WordPress/Shopify as
 * included-in-payload-but-unverified, and the custom endpoint as UNSUPPORTED —
 * never claiming the schema is live.
 */
import { describe, it, expect } from "vitest";
import { schemaConnectorCapability } from "./schema-delivery";

describe("schema delivery capability — generated ≠ delivered (H)", () => {
  it("wordpress/shopify: in payload, but retention + destination unverified", () => {
    for (const c of ["wordpress", "shopify"] as const) {
      const cap = schemaConnectorCapability(c, true);
      expect(cap.generated).toBe(true);
      expect(cap.includedInPayload).toBe("yes");
      expect(cap.retainedByConnector).toBe("unverified");
      expect(cap.verifiedOnDestination).toBe("unverified");
    }
  });

  it("custom endpoint: JSON-LD delivery unsupported, never claimed complete", () => {
    const cap = schemaConnectorCapability("custom", true);
    expect(cap.connector).toBe("custom");
    expect(cap.includedInPayload).toBe("no");
    expect(cap.retainedByConnector).toBe("unsupported");
    expect(cap.verifiedOnDestination).toBe("unsupported");
    expect(cap.note).toMatch(/not supported/i);
  });

  it("no schema generated → not included in payload", () => {
    expect(schemaConnectorCapability("wordpress", false).includedInPayload).toBe("no");
  });
});
