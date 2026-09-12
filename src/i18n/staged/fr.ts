import { frAnalyticsScreen } from "./fr-analytics-screen";
import { frBillingScreen } from "./fr-billing-screen";
import { frSetupScreen } from "./fr-setup-screen";
import { frServicesScreen } from "./fr-services-screen";
import { frAuditScreen } from "./fr-audit-screen";
import { frEvidenceScreen } from "./fr-evidence-screen";
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
import { frLinks } from "./fr-links";
import { frOutreach } from "./fr-outreach";
import { frEditorScreen } from "./fr-editor-screen";
import { frPlanScreen } from "./fr-plan-screen";

/** Authoring batches only. Dictionary coverage does not establish full interface
 * acceptance. This catalog is not registered by the runtime or language picker. */
export const FR_STAGED_BATCHES = [
  { name: "analytics screen", copy: frAnalyticsScreen, namespaces: ["analyticsScreen"] },
  { name: "billing screen", copy: frBillingScreen, namespaces: ["billingScreen"] },
  { name: "setup screen", copy: frSetupScreen, namespaces: ["setupScreen"] },
  { name: "services screen", copy: frServicesScreen, namespaces: ["servicesScreen"] },
  { name: "audit screen", copy: frAuditScreen, namespaces: ["auditScreen"] },
  { name: "evidence screen", copy: frEvidenceScreen, namespaces: ["evidenceScreen"] },
  { name: "plan screen", copy: frPlanScreen, namespaces: ["planScreen"] },
  {
    name: "editor screen",
    copy: frEditorScreen,
    namespaces: ["editorScreen"],
  },
  {
    name: "outreach",
    copy: frOutreach,
    namespaces: ["outreach", "hook", "anchor"],
  },
  {
    name: "links",
    copy: frLinks,
    namespaces: [
      "linknet",
      "backlinks",
      "marketplace",
      "backlinkMonitor",
      "backlinkDetails",
      "backlinkRecurring",
    ],
  },
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
