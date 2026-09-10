import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PublishingChecklist } from "./PublishingChecklist";
import { schemaConnectorCapability } from "@/lib/schema-delivery";
import { publishingFidelity } from "@/i18n/publishing-fidelity";
let locale: "en" | "pl" | "sv" | "da" = "en";
vi.mock("@/i18n", () => ({
  useT:
    () =>
    (key: string, vars: Record<string, string | number> = {}) =>
      Object.entries(vars).reduce(
        (text, [name, value]) => text.replace(`{${name}}`, String(value)),
        publishingFidelity[locale][key] ?? key,
      ),
}));
describe("actual Studio checklist evidence labels", () => {
  it.each(["en", "pl", "sv", "da"] as const)(
    "renders translated planned/unknown/custom states in %s",
    (language) => {
      locale = language;
      expect(Object.keys(publishingFidelity[locale]).sort()).toEqual(
        Object.keys(publishingFidelity.en).sort(),
      );
      for (const connector of [undefined, "wordpress", "shopify", "custom"] as const) {
        const schema = schemaConnectorCapability(connector, true);
        const html = renderToStaticMarkup(
          createElement(PublishingChecklist, { items: [], schema }),
        );
        expect(html).not.toContain("publishingFidelity.");
        expect(html).not.toContain("Ready to publish");
        expect(schema.includedInPayload).not.toBe("yes");
        expect(html).toContain(publishingFidelity[locale]["publishingFidelity.clear"]);
        expect(html).toContain(publishingFidelity[locale]["publishingFidelity.gates"]);
        if (!connector) expect(schema.connector).toBe("none");
      }
    },
  );
});
