/**
 * AS — static render of the shell's workspace status bar with real active copy (en/pl): status
 * roles for saved/unsaved/saving, alert + non-submit Retry for unconfirmed/conflict, nothing for
 * notReady, and no raw error text (only translated keys render). The sign-out dialog is a portal
 * component and is exercised in the local harness, not statically.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { translate } from "@/i18n/translate";
import { WorkspaceSaveStatusBar } from "@/components/WorkspaceSaveStatus";
import type { WorkspaceSaveStatusKind } from "@/lib/workspace-save-status";

const render = (kind: WorkspaceSaveStatusKind, lang: "en" | "pl" = "en", retrying = false) =>
  renderToStaticMarkup(
    createElement(WorkspaceSaveStatusBar, {
      status: { kind },
      retrying,
      onRetry: () => undefined,
      t: (key: string) => translate(lang, key),
    }),
  );

describe("WorkspaceSaveStatusBar", () => {
  it("renders nothing when not ready", () => {
    expect(render("notReady")).toBe("");
  });
  it.each(["saved", "unsaved", "saving"] as const)("%s: polite status, no button", (kind) => {
    const html = render(kind);
    expect(html).toMatch(/role="status"[^>]*aria-live="polite"/);
    expect(html).toContain(translate("en", `shell.workspaceSave.${kind}`));
    expect(html).not.toContain("<button");
  });
  it("unsaved without a scheduled save: polite status with an explicit non-submit Save now", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceSaveStatusBar, {
        status: { kind: "unsaved", scheduled: false },
        retrying: false,
        onRetry: () => undefined,
        t: (key: string) => translate("en", key),
      }),
    );
    expect(html).toMatch(/role="status"/);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Save now<\/button>/);
  });
  it("unconfirmed: alert with the shared unconfirmed copy, retry note and a non-submit Retry", () => {
    const html = render("unconfirmed");
    expect(html).toMatch(/role="alert"/);
    expect(html).toContain("in this open workspace and are not confirmed as saved");
    expect(html).toContain("Retry saves the current workspace changes.");
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Retry save<\/button>/);
    expect(html).not.toMatch(/type="submit"/);
    expect(html).not.toMatch(/not saved yet|lost|error/i);
  });
  it("conflict: alert with the conflict copy; Retry is disabled while a retry runs", () => {
    const html = render("conflict", "en", true);
    expect(html).toContain("changed in another session");
    expect(html).toContain("not confirmed as saved");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Retry save<\/button>/);
  });
  it("pl: unconfirmed uses the Polish copy", () => {
    const html = render("unconfirmed", "pl");
    expect(html).toContain("Nie udało się potwierdzić zapisu.");
    expect(html).toContain(">Ponów zapis</button>");
  });
});
