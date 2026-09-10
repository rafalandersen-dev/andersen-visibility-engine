import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { OutreachHistory } from "./OutreachHistory";
import { outreachIntegrityCopy } from "@/i18n/outreach-integrity";
import type { OutreachReceipt } from "@/lib/outreach-receipts";
const row: OutreachReceipt = {
  draft_id: "deleted-draft",
  project_id: "p",
  step: "initial",
  version_hash: "a".repeat(64),
  recipient: "editor@example.com",
  state: "unknown",
  reserved_at: "2026-09-10T10:00:00Z",
  updated_at: "2026-09-10T10:00:01Z",
  provider_message_id: null,
};
const render = (rows: OutreachReceipt[], ready = true, locale = "en") =>
  renderToStaticMarkup(
    createElement(OutreachHistory, {
      receipts: rows,
      ready,
      loading: false,
      refresh: async () => {},
      t: (key) => outreachIntegrityCopy[locale][key] ?? key,
    }),
  );
describe("actual outreach receipt history UI", () => {
  it("distinguishes unavailable history from empty and hides stale private rows", () => {
    const html = render([row], false);
    expect(html).toContain("history is unavailable");
    expect(html).not.toContain(row.recipient);
    expect(html).not.toContain("No service-owned delivery records");
    expect(render([])).toContain("No service-owned delivery records");
  });
  it("retains deleted draft attempts, exact version and truthful uncertain state without retry buttons", () => {
    const html = render([row]);
    expect(html).toContain("deleted-draft");
    expect(html).toContain(row.version_hash);
    expect(html).toContain("Unknown outcome");
    expect(html).toContain("do not retry");
    expect(html).not.toContain("Send now");
  });
  it("labels provider acceptance separately from delivery and renders every locale", () => {
    for (const locale of ["en", "pl", "sv", "da"]) {
      const html = render(
        [{ ...row, state: "accepted", provider_message_id: "message-1" }],
        true,
        locale,
      );
      expect(html).toContain(outreachIntegrityCopy[locale]["outreach.integrity.accepted"]);
      expect(html).toContain("message-1");
      expect(html).not.toContain("outreach.integrity.");
      expect(Object.keys(outreachIntegrityCopy[locale])).toEqual(
        Object.keys(outreachIntegrityCopy.en),
      );
    }
  });
});
