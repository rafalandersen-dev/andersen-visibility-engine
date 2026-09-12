import { frCore } from "./fr-core";
import { frWorkflow } from "./fr-workflow";
import { frCollaboration } from "./fr-collaboration";
import { frKnowledge } from "./fr-knowledge";
import { frTechnical } from "./fr-technical";
import { frMeasurements } from "./fr-measurements";
import { frEvidence } from "./fr-evidence";
import { frConfiguration } from "./fr-configuration";
import { frGrowth } from "./fr-growth";
import { frCommerce } from "./fr-commerce";

/** Authoring batches only. This catalog is incomplete and is not registered by
 * the runtime or offered in the language picker. */
export const FR_STAGED_BATCHES = [
  {
    name: "commerce",
    copy: frCommerce,
    namespaces: ["billing", "launch", "beta"],
  },
  {
    name: "growth",
    copy: frGrowth,
    namespaces: ["authority", "actions", "publicAudit"],
  },
  {
    name: "configuration",
    copy: frConfiguration,
    namespaces: ["brand", "wp", "shopify", "claude", "connect", "connections", "coverage"],
  },
  {
    name: "evidence",
    copy: frEvidence,
    namespaces: ["answer", "logs", "proof", "aiEval", "benchmark"],
  },
  {
    name: "measurements",
    copy: frMeasurements,
    namespaces: ["analytics", "gsc", "report"],
  },
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
