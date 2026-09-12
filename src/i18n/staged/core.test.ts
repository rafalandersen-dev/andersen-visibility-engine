import { expect, it } from "vitest";
import { UI_CATALOGS, isUiLanguage } from "../catalogs";
import { frCore } from "./fr-core";

const namespaces = new Set([
  "common",
  "nav",
  "appShell",
  "shell",
  "onboarding",
  "setup",
  "lang",
  "market",
  "goal",
  "pipeline",
]);
const english = Object.fromEntries(
  Object.entries(UI_CATALOGS.en).filter(([key]) => namespaces.has(key.split(".")[0])),
);
it("French core covers the complete current navigation, setup and work-status batch", () => {
  expect(Object.keys(frCore).sort()).toEqual(Object.keys(english).sort());
  for (const [key, value] of Object.entries(frCore)) {
    expect(value.trim(), key).not.toBe("");
    expect((value.match(/\{[^{}]+\}/g) ?? []).sort(), key).toEqual(
      (english[key].match(/\{[^{}]+\}/g) ?? []).sort(),
    );
  }
});
it("preserves distinct planned, scheduled, sent and published work labels", () => {
  const stages = ["planned", "armed", "sent", "live"].map(
    (stage) => frCore[`pipeline.stage.${stage}`],
  );
  expect(new Set(stages).size).toBe(4);
});
it("keeps incomplete French copy out of available interface languages", () => {
  expect(isUiLanguage("fr")).toBe(false);
  expect(Object.keys(frCore).length).toBeLessThan(Object.keys(UI_CATALOGS.en).length);
});
