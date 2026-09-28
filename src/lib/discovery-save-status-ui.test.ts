/**
 * AP — static render of the DiscoverySaveStatus banner with real active copy (en/pl):
 * pending/confirmed use role="status", unconfirmed uses role="alert", the Retry control
 * is an explicit non-submit button that exists ONLY in the unconfirmed state, and no raw error text
 * can appear because the component only ever renders translated keys.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { translate } from "@/i18n/translate";
import { DiscoverySaveStatus } from "@/components/DiscoverySaveStatus";
import type { DiscoverySaveStatus as Status } from "@/lib/discovery-save-recovery";

const bound = { epoch: 1, userId: "u1", scope: "p1" };
const render = (status: Status, lang: "en" | "pl" = "en") =>
  renderToStaticMarkup(
    createElement(DiscoverySaveStatus, {
      status,
      onRetry: () => undefined,
      t: (key: string) => translate(lang, key),
    }),
  );

describe("DiscoverySaveStatus", () => {
  it("renders nothing when idle", () => {
    expect(render({ kind: "idle" })).toBe("");
  });
  it("pending: polite status, no retry control", () => {
    const html = render({ kind: "pending", requestId: "r1", attempt: 1, bound });
    expect(html).toMatch(/role="status"[^>]*aria-live="polite"/);
    expect(html).toContain(translate("en", "planScreen.discovery.save.pending"));
    expect(html).not.toContain("<button");
  });
  it("unconfirmed (rejected): alert, open-workspace + not-confirmed wording, retry note, non-submit Retry button", () => {
    const html = render({
      kind: "unconfirmed",
      requestId: "r1",
      attempt: 2,
      reason: "rejected",
      bound,
    });
    expect(html).toMatch(/role="alert"/);
    expect(html).toContain("We couldn&#x27;t confirm the save.");
    expect(html).toContain("in this open workspace and are not confirmed as saved");
    expect(html).not.toMatch(/not saved yet|kept on this device|workspace only/i);
    expect(html).toContain(translate("en", "planScreen.discovery.save.retryNote"));
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Retry save<\/button>/);
    expect(html).not.toMatch(/type="submit"/);
    expect(html).not.toMatch(/Undo/);
    expect(html).toContain('data-attempt="2"');
  });
  it("unconfirmed (notReady): alert with the not-ready wording and Retry", () => {
    const html = render({
      kind: "unconfirmed",
      requestId: "r1",
      attempt: 1,
      reason: "notReady",
      bound,
    });
    expect(html).toContain(
      "ready to save yet. Your changes are in this open workspace and are not confirmed as saved.",
    );
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Retry save<\/button>/);
  });
  it("confirmed: polite status, no Undo", () => {
    const html = render({ kind: "confirmed", requestId: "r1", attempt: 2, bound });
    expect(html).toMatch(/role="status"/);
    expect(html).toContain("Save confirmed.");
    expect(html).not.toContain("<button");
  });
  it("pl: unconfirmed uses the Polish copy", () => {
    const html = render(
      { kind: "unconfirmed", requestId: "r1", attempt: 1, reason: "rejected", bound },
      "pl",
    );
    expect(html).toContain("Nie udało się potwierdzić zapisu.");
    expect(html).toContain(">Ponów zapis</button>");
  });
});
