import { deConfiguration } from "./de-configuration";
import { deEvidence } from "./de-evidence";
import { deTechnical } from "./de-technical";
import { deMeasurements } from "./de-measurements";
import { deCollaboration } from "./de-collaboration";
import { deKnowledge } from "./de-knowledge";
import { deEditorScreen } from "./de-editor-screen";
import { deWorkflow } from "./de-workflow";
import { deCore } from "./de-core";
import { deAuthScreen } from "./de-auth-screen";
import { deSharedUi } from "./de-shared-ui";
import { deSetupScreen } from "./de-setup-screen";
import { deServicesScreen } from "./de-services-screen";
import { deAuditScreen } from "./de-audit-screen";
import { deAnalyticsScreen } from "./de-analytics-screen";
import { deBillingScreen } from "./de-billing-screen";
import { deEvidenceScreen } from "./de-evidence-screen";
import { dePlanScreen } from "./de-plan-screen";

/** Incomplete German authoring. This registry never registers a runtime language.
 * Complete namespace coverage is checked per batch; unlisted areas remain open. */
export const DE_STAGED_BATCHES = [
  {
    name: "core",
    copy: deCore,
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
  { name: "authentication", copy: deAuthScreen, namespaces: ["authScreen"] },
  { name: "shared controls", copy: deSharedUi, namespaces: ["sharedUi"] },
  { name: "setup screen", copy: deSetupScreen, namespaces: ["setupScreen"] },
  { name: "services screen", copy: deServicesScreen, namespaces: ["servicesScreen"] },
  { name: "audit screen", copy: deAuditScreen, namespaces: ["auditScreen"] },
  { name: "analytics screen", copy: deAnalyticsScreen, namespaces: ["analyticsScreen"] },
  { name: "billing screen", copy: deBillingScreen, namespaces: ["billingScreen"] },
  { name: "evidence screen", copy: deEvidenceScreen, namespaces: ["evidenceScreen"] },
  { name: "plan screen", copy: dePlanScreen, namespaces: ["planScreen"] },
  { name: "editor screen", copy: deEditorScreen, namespaces: ["editorScreen"] },
  {
    name: "workflow",
    copy: deWorkflow,
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
    copy: deCollaboration,
    namespaces: ["collaboration", "team", "notifications", "awareness", "emailSettings"],
  },
  {
    name: "knowledge",
    copy: deKnowledge,
    namespaces: ["knowledge", "weekly", "approval", "refresh"],
  },
  { name: "technical", copy: deTechnical, namespaces: ["crawl", "gindex", "perf"] },
  { name: "measurements", copy: deMeasurements, namespaces: ["analytics", "gsc", "report"] },
  {
    name: "configuration",
    copy: deConfiguration,
    namespaces: ["brand", "wp", "shopify", "claude", "connect", "connections", "coverage"],
  },
  {
    name: "evidence",
    copy: deEvidence,
    namespaces: ["answer", "logs", "proof", "aiEval", "benchmark"],
  },
] as const;
export const DE_STAGED_CATALOG: Readonly<Record<string, string>> = Object.assign(
  {},
  ...DE_STAGED_BATCHES.map((batch) => batch.copy),
);
