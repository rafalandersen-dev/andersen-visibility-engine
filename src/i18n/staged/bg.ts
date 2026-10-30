import { bgConversation } from "./bg-conversation";
import { bgWorkflow } from "./bg-workflow";
import { bgEvidence } from "./bg-evidence";
import { bgLinks } from "./bg-links";
import { bgCommerce } from "./bg-commerce";
import { bgGrowth } from "./bg-growth";
import { bgOutreach } from "./bg-outreach";
import { bgMeasurements } from "./bg-measurements";
import { bgTechnical } from "./bg-technical";
import { bgKnowledge } from "./bg-knowledge";
import { bgCollaboration } from "./bg-collaboration";
import { bgConfiguration } from "./bg-configuration";
import { bgPublicBeta } from "./bg-public-beta";
import { bgBetaGuide } from "./bg-beta-guide";
import { bgBetaScreen } from "./bg-beta-screen";
import { bgPublicHome } from "./bg-public-home";
import { bgPublicStudies } from "./bg-public-studies";
import { bgPublicPricing } from "./bg-public-pricing";
import { bgEditorScreen } from "./bg-editor-screen";
import { bgPlanScreen } from "./bg-plan-screen";
import { bgEvidenceScreen } from "./bg-evidence-screen";
import { bgBillingScreen } from "./bg-billing-screen";
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
import { bgAnalyticsScreen } from "./bg-analytics-screen";
import { bgAuditScreen } from "./bg-audit-screen";
import { bgServicesScreen } from "./bg-services-screen";
import { bgSetupScreen } from "./bg-setup-screen";
import { bgCore } from "./bg-core";
import { bgAuthScreen } from "./bg-auth-screen";
import { bgSharedUi } from "./bg-shared-ui";
import { bgCitationReview } from "./bg-citation-review";
import { bgCitationAuthoring } from "./bg-citation-authoring";
import { bgCitationForward } from "./bg-citation-forward";
import { bgCitationChange } from "./bg-citation-change";
/** Bulgarian authoring; never imported by the runtime catalog. */
export const BG_STAGED_BATCHES = [
  {
    name: "conversation",
    copy: bgConversation,
    namespaces: ["chat"],
    sourceRevision: "metadata proposal candidate after eb971e8",
    sourceHash: "74f337bf67e5535d01204d3cc74776cadfc013420012271c70a4e07adc44d630",
  },
  {
    name: "workflow",
    copy: bgWorkflow,
    namespaces: [
      "autoSched",
      "prev",
      "imgGen",
      "arrange",
      "visual",
      "editor",
      "dashboard",
      "status",
      "quality",
      "calsched",
      "pres",
      "featured",
      "today",
      "plan",
      "generationResults",
      "workflow",
      "publishingFidelity",
    ],
    sourceRevision: "5ee65d5",
    sourceHash: "1e9eeb70de2eb0a03fdfd3224f3643010b33cd658e7a4274934edb7ffd3cc6ec",
  },
  {
    name: "evidence",
    copy: bgEvidence,
    namespaces: ["answer", "logs", "proof", "aiEval", "benchmark"],
    sourceRevision: "081c8b3",
    sourceHash: "1f9a2a7eea39cee7f70dfc8fa256ee24b64223a0743142ff8894fbde7cdbb2f5",
  },
  {
    name: "links",
    copy: bgLinks,
    namespaces: [
      "linknet",
      "backlinks",
      "marketplace",
      "backlinkMonitor",
      "backlinkDetails",
      "backlinkRecurring",
    ],
    sourceRevision: "a999ef7",
    sourceHash: "7b8c4cfd6fb08b518e7e0eb7fd53e767b72972a0048a75521eda0d4b9ebd40d7",
  },
  {
    name: "commerce",
    copy: bgCommerce,
    namespaces: ["billing", "launch", "beta"],
    sourceRevision: "f995f32",
    sourceHash: "6cd0596e8ff09ae38f9decb763ab31a3fe2c311109c9b5f85edc9721d7058ff2",
  },
  {
    name: "growth",
    copy: bgGrowth,
    namespaces: ["authority", "actions", "publicAudit"],
    sourceRevision: "e2f656c",
    sourceHash: "79460ac604f31155136687fbf43e146ccd11625f12316625da192cdb8188f136",
  },
  {
    name: "outreach",
    copy: bgOutreach,
    namespaces: ["outreach", "hook", "anchor"],
    sourceRevision: "42f102e",
    sourceHash: "c2bfe98eb710f1587237c92b04696e6f9221e67def7d1080eb7ce08e3d1161b4",
  },
  {
    name: "measurements",
    copy: bgMeasurements,
    namespaces: ["analytics", "gsc", "report"],
    sourceRevision: "0846c03",
    sourceHash: "2080a1c30718c7f9c9a2c3f414305a52232950b304c200e271c0b6945f125cb8",
  },
  {
    name: "technical",
    copy: bgTechnical,
    namespaces: ["crawl", "gindex", "perf"],
    sourceRevision: "c6c451f",
    sourceHash: "106a19b8ceaf725528ddc9d4de7317d823108425584418d93729346f29c135e6",
  },
  {
    name: "knowledge",
    copy: bgKnowledge,
    namespaces: ["knowledge", "weekly", "approval", "refresh"],
    sourceRevision: "a672ef5",
    sourceHash: "1e4b4ca8d390967bb9420df4148f75cd81ba4516ed137e06496ba213a3652c59",
  },
  {
    name: "collaboration",
    copy: bgCollaboration,
    namespaces: ["collaboration", "team", "notifications", "awareness", "emailSettings"],
    sourceRevision: "67581a2",
    sourceHash: "66e659da6d8b879af77aef68c0bba3717cb793240da5ae2364a93212f16bd83f",
  },
  {
    name: "configuration",
    copy: bgConfiguration,
    namespaces: ["brand", "wp", "shopify", "claude", "connect", "connections", "coverage"],
    sourceRevision: "abd962a",
    sourceHash: "c7a21405a0e079bfafbf14747dfad84b284e717e035127aaf77bae98d6583413",
  },
  {
    name: "public beta",
    copy: bgPublicBeta,
    namespaces: ["publicBeta"],
    sourceRevision: "c06deab",
    sourceHash: "e670953b131c40fc4433b5ce6e5b256556bf37ea8709bc495b211efc361fb59e",
  },
  {
    name: "beta guidance",
    copy: bgBetaGuide,
    namespaces: ["betaGuide"],
    sourceRevision: "11a57eb",
    sourceHash: "8c815e10a73590a6e2911d1b5618d5d545c15a47b3a75462ccaaae6faf33520d",
  },
  {
    name: "beta screen",
    copy: bgBetaScreen,
    namespaces: ["betaScreen"],
    sourceRevision: "4e56d69",
    sourceHash: "c4dcf4827cb49219199aab22d2969e33f643ade8a8c2c348bb899d61f3a08119",
  },
  {
    name: "public home",
    copy: bgPublicHome,
    namespaces: ["publicHome"],
    sourceRevision: "788b5ae",
    sourceHash: "09e34a037936057698a84cecda0fb297d2fe94c43288d416ab04efcef466f384",
  },
  {
    name: "public pricing",
    copy: bgPublicPricing,
    namespaces: ["publicPricing"],
    sourceRevision: "7e16ed1",
    sourceHash: "8e7cecc9d6ca14af722fe8b4131d7982241e9e856335586f8d4e724469d0de60",
  },
  {
    name: "public studies",
    copy: bgPublicStudies,
    namespaces: ["publicStudies"],
    sourceRevision: "7e16ed1",
    sourceHash: "ace563fb757a52abcd667e7e691d3e48024045a4e4f265e6949c66a828f5e8de",
  },
  {
    name: "editor screen",
    copy: bgEditorScreen,
    namespaces: ["editorScreen"],
    sourceRevision: "eda0235",
    sourceHash: "541d9eb0143c53f9f6995353a0f17830e8603f3a91e43a94fca6187c398d6b92",
  },
  {
    name: "plan screen",
    copy: bgPlanScreen,
    namespaces: ["planScreen"],
    sourceRevision: "b330d65",
    sourceHash: "2bbe51606245c7a6fa86d34f4c932c7ecb9ac0332b116270fff96c3c8e5175c4",
  },
  {
    name: "evidence screen",
    copy: bgEvidenceScreen,
    namespaces: ["evidenceScreen"],
    sourceRevision: "7d62eb3",
    sourceHash: "2c7e9ccb48b02cd12911d0df6c31a96ec8ddfc6c558dfda3b3e14790d156c136",
  },
  {
    name: "analytics screen",
    copy: bgAnalyticsScreen,
    namespaces: ["analyticsScreen"],
    sourceRevision: "9ff877a",
    sourceHash: "04eaafb940167093319015d367692b7ba088651ec8e791146edb646e5b74b724",
  },
  {
    name: "billing screen",
    copy: stagedBillingScreen(bgBillingScreen),
    namespaces: ["billingScreen"],
    sourceRevision: "5804ec62b92d2a2d957a7b3fb536b7c5225ff128 (126 added keys: English fallback)",
    sourceHash: "392ef009ccb9de83e3b6d64691a9a1aaee3ea0f59008db22c806638b5873477f",
  },
  {
    name: "setup screen",
    copy: bgSetupScreen,
    namespaces: ["setupScreen"],
    sourceRevision: "07d0f22",
    sourceHash: "565b0bcd89f346fd85f3b87d4e44716826a65bee54fd60eaa3b677c4d732a5ca",
  },
  {
    name: "services screen",
    copy: bgServicesScreen,
    namespaces: ["servicesScreen"],
    sourceRevision: "07d0f22",
    sourceHash: "c769d10ab21c34754c6c4a6c57c3ee5f04881605b1dabc10030bca0e9122313d",
  },
  {
    name: "audit screen",
    copy: bgAuditScreen,
    namespaces: ["auditScreen"],
    sourceRevision: "07d0f22",
    sourceHash: "2c15a7061c169b3f2da7446d4280ff94cb6b5ce2e6cb56d156af72ab154f1aed",
  },
  {
    name: "core",
    copy: bgCore,
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
    sourceRevision: "57f1c83",
    sourceHash: "8476f0a4138861b0b333d132799933037eda17dbd2d1ba4207b7cc4e0c9337d1",
  },
  {
    name: "authentication",
    copy: bgAuthScreen,
    namespaces: ["authScreen"],
    sourceRevision: "7a9ab2d",
    sourceHash: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  },
  {
    name: "shared controls",
    copy: bgSharedUi,
    namespaces: ["sharedUi"],
    sourceRevision: "7a9ab2d",
    sourceHash: "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  },
  {
    name: "citation review",
    copy: bgCitationReview,
    namespaces: ["citationReview"],
    sourceRevision: "P4 citation review candidate after bab861c8",
    sourceHash: "6320ed498d4ce0af5c43d77d46109f8e85cffeebb25d64f16d815eb2332beae4",
  },
  {
    name: "citation authoring",
    copy: bgCitationAuthoring,
    namespaces: ["citationAuthoring"],
    sourceRevision: "citation owner authoring candidate after a392775c",
    sourceHash: "ffb6a332b8756b5467c8e06e740b9829d118f7c6112240a88046298922055c2a",
  },
  {
    name: "citation forward",
    copy: bgCitationForward,
    namespaces: ["citationForward"],
    sourceRevision: "citation forward workflow candidate after 64db7a4b (Codex N1 corrections)",
    sourceHash: "692652100abfecf97689fd04a6f508d7d66db62417cfd2cfc3dc6f2adf8fcb70",
  },
  {
    name: "citation change",
    copy: bgCitationChange,
    namespaces: ["citationChange"],
    sourceRevision: "citation change evidence candidate 20260928120000 (R/R1/R2)",
    sourceHash: "576b6f207594745c1c3e082e0bba5d773318eb96241d4d5cf18187b680cdc2d5",
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
export const BG_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...BG_STAGED_BATCHES.map((batch) => batch.copy)),
);
