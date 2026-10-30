import { frConversation } from "./fr-conversation";
import { frPublicStudies } from "./fr-public-studies";
import { frPublicPricing } from "./fr-public-pricing";
import { frPublicHome } from "./fr-public-home";
import { frPublicBeta } from "./fr-public-beta";
import { frBetaGuidance } from "./fr-beta-guidance";
import { frBetaScreen } from "./fr-beta-screen";
import { frAuthScreen } from "./fr-auth-screen";
import { frSharedUi } from "./fr-shared-ui";
import { frAnalyticsScreen } from "./fr-analytics-screen";
import { frBillingScreen } from "./fr-billing-screen";
import { stagedBillingScreen } from "./billing-screen-fallback";
import { STAGED_FIRST_USE_SOURCE_HASH, stagedFirstUse } from "./first-use-fallback";
import {
  STAGED_TASK_CONTINUITY_SOURCE_HASH,
  stagedTaskContinuity,
} from "./task-continuity-fallback";
import {
  STAGED_ANSWER_COVERAGE_SOURCE_HASH,
  stagedAnswerCoverage,
} from "./answer-coverage-fallback";
import { STAGED_PANEL_COVERAGE_SOURCE_HASH, stagedPanelCoverage } from "./panel-coverage-fallback";
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
import { frCitationReview } from "./fr-citation-review";
import { frCitationAuthoring } from "./fr-citation-authoring";
import { frCitationForward } from "./fr-citation-forward";
import { frCitationChange } from "./fr-citation-change";

/** Authoring batches only. Dictionary coverage does not establish full interface
 * acceptance. This catalog is not registered by the runtime or language picker. */
export const FR_STAGED_BATCHES = [
  {
    name: "conversation",
    copy: frConversation,
    namespaces: ["chat"],
    sourceRevision: "metadata proposal candidate after eb971e8",
    sourceHash: "74f337bf67e5535d01204d3cc74776cadfc013420012271c70a4e07adc44d630",
  },
  { name: "public case studies", copy: frPublicStudies, namespaces: ["publicStudies"] },
  { name: "public pricing", copy: frPublicPricing, namespaces: ["publicPricing"] },
  { name: "public home", copy: frPublicHome, namespaces: ["publicHome"] },
  { name: "public beta and demo", copy: frPublicBeta, namespaces: ["publicBeta"] },
  { name: "beta playbook guidance", copy: frBetaGuidance, namespaces: ["betaGuide"] },
  { name: "beta screen controls", copy: frBetaScreen, namespaces: ["betaScreen"] },
  { name: "authentication screen", copy: frAuthScreen, namespaces: ["authScreen"] },
  { name: "shared UI", copy: frSharedUi, namespaces: ["sharedUi"] },
  { name: "analytics screen", copy: frAnalyticsScreen, namespaces: ["analyticsScreen"] },
  {
    name: "billing screen",
    copy: stagedBillingScreen(frBillingScreen),
    namespaces: ["billingScreen"],
  },
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
  {
    name: "citation review",
    copy: frCitationReview,
    namespaces: ["citationReview"],
  },
  {
    name: "citation authoring",
    copy: frCitationAuthoring,
    namespaces: ["citationAuthoring"],
  },
  {
    name: "citation forward",
    copy: frCitationForward,
    namespaces: ["citationForward"],
  },
  {
    name: "citation change",
    copy: frCitationChange,
    namespaces: ["citationChange"],
    sourceRevision: "citation change evidence candidate 20260928120000 (R/R1/R2)",
    sourceHash: "1e4b4ca8d390967bb9420df4148f75cd81ba4516ed137e06496ba213a3652c59",
  },
  {
    name: "first use",
    copy: stagedFirstUse(),
    namespaces: ["conversationStart"],
    sourceRevision: "eb95d191 + CG-01A (conversationStart: English fallback)",
    sourceHash: STAGED_FIRST_USE_SOURCE_HASH,
  },
  {
    name: "task continuity",
    copy: stagedTaskContinuity(),
    namespaces: ["taskContinuity"],
    sourceRevision: "881a422d + CG-02A (taskContinuity: English fallback)",
    sourceHash: STAGED_TASK_CONTINUITY_SOURCE_HASH,
  },
  {
    name: "answer coverage",
    copy: stagedAnswerCoverage(),
    namespaces: ["answerCoverage"],
    sourceRevision: "df7a891b + CG-03A (answerCoverage: English fallback)",
    sourceHash: STAGED_ANSWER_COVERAGE_SOURCE_HASH,
  },
  {
    name: "panel coverage",
    copy: stagedPanelCoverage(),
    namespaces: ["panelCoverage"],
    sourceRevision: "3734e2f5 + CG-03B (panelCoverage: English fallback)",
    sourceHash: STAGED_PANEL_COVERAGE_SOURCE_HASH,
  },
] as const;

export const FR_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...FR_STAGED_BATCHES.map((batch) => batch.copy)),
);
