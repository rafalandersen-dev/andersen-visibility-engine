/**
 * AS 2026-10-28 — static render of the editor's Save control and footer indicator with real
 * active copy (en/pl/sv/da). Before this fix, the footer rendered "All changes saved" whenever
 * `isDirty` was false, regardless of whether the network write had actually confirmed — the exact
 * live-reproduced bug (offline save: local commit succeeds, footer says saved, server still has
 * the old baseline). This asserts the footer never claims saved for pending/unconfirmed/conflict.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { translate } from "@/i18n/translate";
import { EditorSaveBar } from "./EditorSaveBar";
import type { WorkspaceSaveStatusKind } from "@/lib/workspace-save-status";

// renderToStaticMarkup escapes text-node apostrophes as the numeric entity;
// normalize both sides so copy comparisons aren't tied to that encoding.
const containsText = (html: string, text: string) => html.replace(/&#x27;/g, "'").includes(text);

const render = (
  isDirty: boolean,
  kind: WorkspaceSaveStatusKind,
  lang: "en" | "pl" | "sv" | "da" = "en",
) =>
  renderToStaticMarkup(
    createElement(EditorSaveBar, {
      isDirty,
      workspaceSaveStatus: { kind },
      onSave: () => undefined,
      t: (key: string) => translate(lang, key),
    }),
  );

describe("EditorSaveBar", () => {
  it("BEFORE-the-fix regression: a confirmed save (not dirty, kind saved) does say saved", () => {
    expect(render(false, "saved")).toContain(translate("en", "editorScreen.saved"));
  });

  it.each(["unconfirmed", "conflict"] as const)(
    "never claims saved while not dirty but the last network attempt is %s (the live-reproduced bug)",
    (kind) => {
      const html = render(false, kind);
      expect(containsText(html, translate("en", "editorScreen.saved"))).toBe(false);
      expect(containsText(html, translate("en", "planScreen.discovery.save.unconfirmed"))).toBe(
        true,
      );
    },
  );

  it("pending: saving in flight is reported as saving, not saved", () => {
    const html = render(false, "saving");
    expect(html).not.toContain(translate("en", "editorScreen.saved"));
    expect(html).toContain(translate("en", "shell.workspaceSave.saving"));
  });

  it("a dirty workspace with an unsaved global diff is reported as unsaved, not saved", () => {
    const html = render(false, "unsaved");
    expect(html).not.toContain(translate("en", "editorScreen.saved"));
    expect(html).toContain(translate("en", "shell.workspaceSave.unsaved"));
  });

  it("notReady: no hydrated workspace yet is neutral, never claims saved", () => {
    const html = render(false, "notReady");
    expect(html).not.toContain(translate("en", "editorScreen.saved"));
    expect(html).not.toContain(translate("en", "shell.workspaceSave.saving"));
    expect(html).not.toContain(translate("en", "shell.workspaceSave.unsaved"));
    expect(containsText(html, translate("en", "planScreen.discovery.save.unconfirmed"))).toBe(
      false,
    );
  });

  it("page-local dirty field always wins over the global status (never saved while isDirty)", () => {
    const html = render(true, "saved");
    expect(html).not.toContain(translate("en", "editorScreen.saved"));
    expect(html).toContain(translate("en", "editorScreen.unsaved"));
  });

  it.each(["notReady", "saved", "unsaved", "saving", "unconfirmed", "conflict"] as const)(
    "page-local dirty field wins over every global status kind (%s)",
    (kind) => {
      const html = render(true, kind);
      expect(html).not.toContain(translate("en", "editorScreen.saved"));
      expect(html).toContain(translate("en", "editorScreen.unsaved"));
    },
  );

  it.each(["pl", "sv", "da"] as const)(
    "%s: unconfirmed uses the shared translated copy",
    (lang) => {
      const html = render(false, "unconfirmed", lang);
      expect(html).toContain(translate(lang, "planScreen.discovery.save.unconfirmed"));
      expect(html).not.toContain(translate(lang, "editorScreen.saved"));
    },
  );

  it.each(["en", "pl", "sv", "da"] as const)(
    "%s: a confirmed save renders the translated saved copy in every active language",
    (lang) => {
      const html = render(false, "saved", lang);
      expect(html).toContain(translate(lang, "editorScreen.saved"));
    },
  );
});
