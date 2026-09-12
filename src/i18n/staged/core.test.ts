import { expect, it } from "vitest";
import { UI_CATALOGS, isUiLanguage } from "../catalogs";
import { frCore } from "./fr-core";
import { frWorkflow } from "./fr-workflow";

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
  expect(Object.keys({ ...frCore, ...frWorkflow }).length).toBeLessThan(
    Object.keys(UI_CATALOGS.en).length,
  );
});

it("French workflow covers every current content, planning and recovery message", () => {
  const workflowNamespaces = new Set([
    "editor",
    "today",
    "plan",
    "generationResults",
    "publishingFidelity",
    "quality",
    "imgGen",
    "arrange",
    "visual",
    "autoSched",
    "prev",
    "calsched",
    "pres",
    "featured",
    "status",
    "dashboard",
    "workflow",
  ]);
  const source = Object.fromEntries(
    Object.entries(UI_CATALOGS.en).filter(([key]) => workflowNamespaces.has(key.split(".")[0])),
  );
  expect(Object.keys(frWorkflow).sort()).toEqual(Object.keys(source).sort());
  for (const [key, value] of Object.entries(frWorkflow)) {
    expect(value.trim(), key).not.toBe("");
    expect((value.match(/\{[^{}]+\}/g) ?? []).sort(), key).toEqual(
      (source[key].match(/\{[^{}]+\}/g) ?? []).sort(),
    );
    expect(Object.prototype.hasOwnProperty.call(frCore, key), `duplicate:${key}`).toBe(false);
  }
});
it("French delivery and recovery copy retains separate states and explicit approval boundaries", () => {
  const states = ["notSent", "sent", "notPublished", "published", "failed", "liveFailed"].map(
    (state) => frWorkflow[`editor.publish.${state}`],
  );
  expect(new Set(states).size).toBe(6);
  expect(frWorkflow["editor.schedule.hint"]).toContain("L’approbation ne publie jamais rien");
  expect(frWorkflow["generationResults.review"]).toContain(
    "n’approuve, ne programme ni ne publie rien",
  );
});
