import { frCore } from "./fr-core";
import { frWorkflow } from "./fr-workflow";
import { frCollaboration } from "./fr-collaboration";
import { frKnowledge } from "./fr-knowledge";
import { frTechnical } from "./fr-technical";

/** Authoring batches only. This catalog is incomplete and is not registered by
 * the runtime or offered in the language picker. */
export const FR_STAGED_BATCHES = [
  {
    name: "technical",
    copy: frTechnical,
    namespaces: ["crawl", "gindex", "perf"],
  },
  {
    name: "knowledge",
    copy: frKnowledge,
    namespaces: ["knowledge", "weekly", "approval", "refresh"],
  },
  {
    name: "core",
    copy: frCore,
    namespaces: [
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
    ],
  },
  {
    name: "workflow",
    copy: frWorkflow,
    namespaces: [
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
    ],
  },
  {
    name: "collaboration",
    copy: frCollaboration,
    namespaces: ["collaboration", "team", "notifications", "awareness", "emailSettings"],
  },
] as const;

export const FR_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...FR_STAGED_BATCHES.map((batch) => batch.copy)),
);
