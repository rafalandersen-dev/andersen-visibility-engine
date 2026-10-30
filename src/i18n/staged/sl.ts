import { slConversation } from "./sl-conversation";
import { slWorkflow } from "./sl-workflow";
import { slEvidence } from "./sl-evidence";
import { slLinks } from "./sl-links";
import { slCommerce } from "./sl-commerce";
import { slGrowth } from "./sl-growth";
import { slOutreach } from "./sl-outreach";
import { slMeasurements } from "./sl-measurements";
import { slTechnical } from "./sl-technical";
import { slKnowledge } from "./sl-knowledge";
import { slCollaboration } from "./sl-collaboration";
import { slConfiguration } from "./sl-configuration";
import { slPublicBeta } from "./sl-public-beta";
import { slBetaGuide } from "./sl-beta-guide";
import { slBetaScreen } from "./sl-beta-screen";
import { slPublicHome } from "./sl-public-home";
import { slPublicStudies } from "./sl-public-studies";
import { slPublicPricing } from "./sl-public-pricing";
import { slEditorScreen } from "./sl-editor-screen";
import { slPlanScreen } from "./sl-plan-screen";
import { slEvidenceScreen } from "./sl-evidence-screen";
import { slBillingScreen } from "./sl-billing-screen";
import { stagedBillingScreen } from "./billing-screen-fallback";
import { STAGED_FIRST_USE_SOURCE_HASH, stagedFirstUse } from "./first-use-fallback";
import { slAnalyticsScreen } from "./sl-analytics-screen";
import { slAuditScreen } from "./sl-audit-screen";
import { slServicesScreen } from "./sl-services-screen";
import { slSetupScreen } from "./sl-setup-screen";
import { slCore } from "./sl-core";
import { slAuthScreen } from "./sl-auth-screen";
import { slSharedUi } from "./sl-shared-ui";
import { slCitationReview } from "./sl-citation-review";
import { slCitationAuthoring } from "./sl-citation-authoring";
import { slCitationForward } from "./sl-citation-forward";
import { slCitationChange } from "./sl-citation-change";
/** Slovenian authoring; never imported by the runtime catalog. */
export const SL_STAGED_BATCHES = [
  {
    name: "conversation",
    copy: slConversation,
    namespaces: ["chat"],
    sourceRevision: "metadata proposal candidate after eb971e8",
    sourceHash: "74f337bf67e5535d01204d3cc74776cadfc013420012271c70a4e07adc44d630",
  },
  {
    name: "workflow",
    copy: slWorkflow,
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
    sourceRevision: "166a4cf",
    sourceHash: "1e9eeb70de2eb0a03fdfd3224f3643010b33cd658e7a4274934edb7ffd3cc6ec",
  },
  {
    name: "evidence",
    copy: slEvidence,
    namespaces: ["answer", "logs", "proof", "aiEval", "benchmark"],
    sourceRevision: "d30a733",
    sourceHash: "1f9a2a7eea39cee7f70dfc8fa256ee24b64223a0743142ff8894fbde7cdbb2f5",
  },
  {
    name: "links",
    copy: slLinks,
    namespaces: [
      "linknet",
      "backlinks",
      "marketplace",
      "backlinkMonitor",
      "backlinkDetails",
      "backlinkRecurring",
    ],
    sourceRevision: "bf2af3a",
    sourceHash: "7b8c4cfd6fb08b518e7e0eb7fd53e767b72972a0048a75521eda0d4b9ebd40d7",
  },
  {
    name: "commerce",
    copy: slCommerce,
    namespaces: ["billing", "launch", "beta"],
    sourceRevision: "d3313ba",
    sourceHash: "6cd0596e8ff09ae38f9decb763ab31a3fe2c311109c9b5f85edc9721d7058ff2",
  },
  {
    name: "growth",
    copy: slGrowth,
    namespaces: ["authority", "actions", "publicAudit"],
    sourceRevision: "0704f32",
    sourceHash: "79460ac604f31155136687fbf43e146ccd11625f12316625da192cdb8188f136",
  },
  {
    name: "outreach",
    copy: slOutreach,
    namespaces: ["outreach", "hook", "anchor"],
    sourceRevision: "2705f3f",
    sourceHash: "c2bfe98eb710f1587237c92b04696e6f9221e67def7d1080eb7ce08e3d1161b4",
  },
  {
    name: "measurements",
    copy: slMeasurements,
    namespaces: ["analytics", "gsc", "report"],
    sourceRevision: "324d5f5",
    sourceHash: "2080a1c30718c7f9c9a2c3f414305a52232950b304c200e271c0b6945f125cb8",
  },
  {
    name: "technical",
    copy: slTechnical,
    namespaces: ["crawl", "gindex", "perf"],
    sourceRevision: "4ae023a",
    sourceHash: "106a19b8ceaf725528ddc9d4de7317d823108425584418d93729346f29c135e6",
  },
  {
    name: "knowledge",
    copy: slKnowledge,
    namespaces: ["knowledge", "weekly", "approval", "refresh"],
    sourceRevision: "99fd1c8",
    sourceHash: "1e4b4ca8d390967bb9420df4148f75cd81ba4516ed137e06496ba213a3652c59",
  },
  {
    name: "collaboration",
    copy: slCollaboration,
    namespaces: ["collaboration", "team", "notifications", "awareness", "emailSettings"],
    sourceRevision: "0698092",
    sourceHash: "66e659da6d8b879af77aef68c0bba3717cb793240da5ae2364a93212f16bd83f",
  },
  {
    name: "configuration",
    copy: slConfiguration,
    namespaces: ["brand", "wp", "shopify", "claude", "connect", "connections", "coverage"],
    sourceRevision: "b8f7f14",
    sourceHash: "c7a21405a0e079bfafbf14747dfad84b284e717e035127aaf77bae98d6583413",
  },
  {
    name: "authentication",
    copy: slAuthScreen,
    namespaces: ["authScreen"],
    sourceRevision: "5f7faa9",
    sourceHash: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  },
  {
    name: "shared controls",
    copy: slSharedUi,
    namespaces: ["sharedUi"],
    sourceRevision: "5f7faa9",
    sourceHash: "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  },
  {
    name: "core",
    copy: slCore,
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
    sourceRevision: "ddee742",
    sourceHash: "8476f0a4138861b0b333d132799933037eda17dbd2d1ba4207b7cc4e0c9337d1",
  },
  {
    name: "setup screen",
    copy: slSetupScreen,
    namespaces: ["setupScreen"],
    sourceRevision: "32a8a48",
    sourceHash: "565b0bcd89f346fd85f3b87d4e44716826a65bee54fd60eaa3b677c4d732a5ca",
  },
  {
    name: "services screen",
    copy: slServicesScreen,
    namespaces: ["servicesScreen"],
    sourceRevision: "32a8a48",
    sourceHash: "c769d10ab21c34754c6c4a6c57c3ee5f04881605b1dabc10030bca0e9122313d",
  },
  {
    name: "audit screen",
    copy: slAuditScreen,
    namespaces: ["auditScreen"],
    sourceRevision: "32a8a48",
    sourceHash: "2c15a7061c169b3f2da7446d4280ff94cb6b5ce2e6cb56d156af72ab154f1aed",
  },
  {
    name: "analytics screen",
    copy: slAnalyticsScreen,
    namespaces: ["analyticsScreen"],
    sourceRevision: "1113cc5",
    sourceHash: "04eaafb940167093319015d367692b7ba088651ec8e791146edb646e5b74b724",
  },
  {
    name: "billing screen",
    copy: stagedBillingScreen(slBillingScreen),
    namespaces: ["billingScreen"],
    sourceRevision: "5804ec62b92d2a2d957a7b3fb536b7c5225ff128 (126 added keys: English fallback)",
    sourceHash: "392ef009ccb9de83e3b6d64691a9a1aaee3ea0f59008db22c806638b5873477f",
  },
  {
    name: "evidence screen",
    copy: slEvidenceScreen,
    namespaces: ["evidenceScreen"],
    sourceRevision: "b51ac1f",
    sourceHash: "2c7e9ccb48b02cd12911d0df6c31a96ec8ddfc6c558dfda3b3e14790d156c136",
  },
  {
    name: "plan screen",
    copy: slPlanScreen,
    namespaces: ["planScreen"],
    sourceRevision: "b949563",
    sourceHash: "2bbe51606245c7a6fa86d34f4c932c7ecb9ac0332b116270fff96c3c8e5175c4",
  },
  {
    name: "editor screen",
    copy: slEditorScreen,
    namespaces: ["editorScreen"],
    sourceRevision: "9d577d4",
    sourceHash: "541d9eb0143c53f9f6995353a0f17830e8603f3a91e43a94fca6187c398d6b92",
  },
  {
    name: "public pricing",
    copy: slPublicPricing,
    namespaces: ["publicPricing"],
    sourceRevision: "187b94e",
    sourceHash: "8e7cecc9d6ca14af722fe8b4131d7982241e9e856335586f8d4e724469d0de60",
  },
  {
    name: "public studies",
    copy: slPublicStudies,
    namespaces: ["publicStudies"],
    sourceRevision: "187b94e",
    sourceHash: "ace563fb757a52abcd667e7e691d3e48024045a4e4f265e6949c66a828f5e8de",
  },
  {
    name: "public home",
    copy: slPublicHome,
    namespaces: ["publicHome"],
    sourceRevision: "f1846ab",
    sourceHash: "09e34a037936057698a84cecda0fb297d2fe94c43288d416ab04efcef466f384",
  },
  {
    name: "beta screen",
    copy: slBetaScreen,
    namespaces: ["betaScreen"],
    sourceRevision: "63e1a10",
    sourceHash: "c4dcf4827cb49219199aab22d2969e33f643ade8a8c2c348bb899d61f3a08119",
  },
  {
    name: "beta guidance",
    copy: slBetaGuide,
    namespaces: ["betaGuide"],
    sourceRevision: "75198c7",
    sourceHash: "8c815e10a73590a6e2911d1b5618d5d545c15a47b3a75462ccaaae6faf33520d",
  },
  {
    name: "public beta",
    copy: slPublicBeta,
    namespaces: ["publicBeta"],
    sourceRevision: "6a24f17",
    sourceHash: "e670953b131c40fc4433b5ce6e5b256556bf37ea8709bc495b211efc361fb59e",
  },
  {
    name: "citation review",
    copy: slCitationReview,
    namespaces: ["citationReview"],
    sourceRevision: "P4 citation review candidate after bab861c8",
    sourceHash: "6320ed498d4ce0af5c43d77d46109f8e85cffeebb25d64f16d815eb2332beae4",
  },
  {
    name: "citation authoring",
    copy: slCitationAuthoring,
    namespaces: ["citationAuthoring"],
    sourceRevision: "citation owner authoring candidate after a392775c",
    sourceHash: "ffb6a332b8756b5467c8e06e740b9829d118f7c6112240a88046298922055c2a",
  },
  {
    name: "citation forward",
    copy: slCitationForward,
    namespaces: ["citationForward"],
    sourceRevision: "citation forward workflow candidate after 64db7a4b (Codex N1 corrections)",
    sourceHash: "692652100abfecf97689fd04a6f508d7d66db62417cfd2cfc3dc6f2adf8fcb70",
  },
  {
    name: "citation change",
    copy: slCitationChange,
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
] as const;
export const SL_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...SL_STAGED_BATCHES.map((batch) => batch.copy)),
);
