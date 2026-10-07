import { huConversation } from "./hu-conversation";
import { huWorkflow } from "./hu-workflow";
import { huEvidence } from "./hu-evidence";
import { huLinks } from "./hu-links";
import { huCommerce } from "./hu-commerce";
import { huGrowth } from "./hu-growth";
import { huOutreach } from "./hu-outreach";
import { huMeasurements } from "./hu-measurements";
import { huTechnical } from "./hu-technical";
import { huKnowledge } from "./hu-knowledge";
import { huCollaboration } from "./hu-collaboration";
import { huConfiguration } from "./hu-configuration";
import { huPublicBeta } from "./hu-public-beta";
import { huBetaGuide } from "./hu-beta-guide";
import { huBetaScreen } from "./hu-beta-screen";
import { huPublicHome } from "./hu-public-home";
import { huPublicPricing } from "./hu-public-pricing";
import { huPublicStudies } from "./hu-public-studies";
import { huEditorScreen } from "./hu-editor-screen";
import { huPlanScreen } from "./hu-plan-screen";
import { huEvidenceScreen } from "./hu-evidence-screen";
import { huSetupScreen } from "./hu-setup-screen";
import { huServicesScreen } from "./hu-services-screen";
import { huAuditScreen } from "./hu-audit-screen";
import { huAnalyticsScreen } from "./hu-analytics-screen";
import { huBillingScreen } from "./hu-billing-screen";
import { huAuthScreen } from "./hu-auth-screen";
import { huSharedUi } from "./hu-shared-ui";
import { huCore } from "./hu-core";
import { huCitationReview } from "./hu-citation-review";
import { huCitationAuthoring } from "./hu-citation-authoring";
import { huCitationForward } from "./hu-citation-forward";
import { huCitationChange } from "./hu-citation-change";
/** Hungarian authoring; never imported by the runtime catalog. */
export const HU_STAGED_BATCHES = [
  {
    name: "conversation",
    copy: huConversation,
    namespaces: ["chat"],
    sourceRevision: "metadata proposal candidate after eb971e8",
    sourceHash: "d37f66e7435e11e49b2e69c75ace0f494c1d288b7c4e4b1d3f3c110a1274649b",
  },
  {
    name: "workflow",
    copy: huWorkflow,
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
    sourceRevision: "c0d4a3b",
    sourceHash: "d09e361f8affe1c2ee3903432c21b1e6453dcd4b99a9996658ec1ec14989ee70",
  },
  {
    name: "evidence",
    copy: huEvidence,
    namespaces: ["answer", "logs", "proof", "aiEval", "benchmark"],
    sourceRevision: "4f58bc4",
    sourceHash: "1f9a2a7eea39cee7f70dfc8fa256ee24b64223a0743142ff8894fbde7cdbb2f5",
  },
  {
    name: "links",
    copy: huLinks,
    namespaces: [
      "linknet",
      "backlinks",
      "marketplace",
      "backlinkMonitor",
      "backlinkDetails",
      "backlinkRecurring",
    ],
    sourceRevision: "fe75d11",
    sourceHash: "7b8c4cfd6fb08b518e7e0eb7fd53e767b72972a0048a75521eda0d4b9ebd40d7",
  },
  {
    name: "commerce",
    copy: huCommerce,
    namespaces: ["billing", "launch", "beta"],
    sourceRevision: "9b1389c",
    sourceHash: "6cd0596e8ff09ae38f9decb763ab31a3fe2c311109c9b5f85edc9721d7058ff2",
  },
  {
    name: "growth",
    copy: huGrowth,
    namespaces: ["authority", "actions", "publicAudit"],
    sourceRevision: "ecb37f2",
    sourceHash: "79460ac604f31155136687fbf43e146ccd11625f12316625da192cdb8188f136",
  },
  {
    name: "outreach",
    copy: huOutreach,
    namespaces: ["outreach", "hook", "anchor"],
    sourceRevision: "78af579",
    sourceHash: "c2bfe98eb710f1587237c92b04696e6f9221e67def7d1080eb7ce08e3d1161b4",
  },
  {
    name: "measurements",
    copy: huMeasurements,
    namespaces: ["analytics", "gsc", "report"],
    sourceRevision: "b48828d",
    sourceHash: "216126da773525ef913fe7e10a4db7af57539ea07dae497fd349051da3088395",
  },
  {
    name: "technical",
    copy: huTechnical,
    namespaces: ["crawl", "gindex", "perf"],
    sourceRevision: "ccb1162",
    sourceHash: "106a19b8ceaf725528ddc9d4de7317d823108425584418d93729346f29c135e6",
  },
  {
    name: "knowledge",
    copy: huKnowledge,
    namespaces: ["knowledge", "weekly", "approval", "refresh"],
    sourceRevision: "d6ccd9b",
    sourceHash: "5cc639baf0f188d2a22148d0d12e4a93e6b0329be66fb3cfe1ef6f1c9c30a630",
  },
  {
    name: "collaboration",
    copy: huCollaboration,
    namespaces: ["collaboration", "team", "notifications", "awareness", "emailSettings"],
    sourceRevision: "b1c987f",
    sourceHash: "66e659da6d8b879af77aef68c0bba3717cb793240da5ae2364a93212f16bd83f",
  },
  {
    name: "configuration",
    copy: huConfiguration,
    namespaces: ["brand", "wp", "shopify", "claude", "connect", "connections", "coverage"],
    sourceRevision: "2e1ca3c",
    sourceHash: "c60d43a37be661079475896eeebe2c3cd1337a321e05df01b27a0e803ac823cc",
  },
  {
    name: "public beta",
    copy: huPublicBeta,
    namespaces: ["publicBeta"],
    sourceRevision: "996d90a",
    sourceHash: "e670953b131c40fc4433b5ce6e5b256556bf37ea8709bc495b211efc361fb59e",
  },
  {
    name: "beta guidance",
    copy: huBetaGuide,
    namespaces: ["betaGuide"],
    sourceRevision: "2c74475",
    sourceHash: "8c815e10a73590a6e2911d1b5618d5d545c15a47b3a75462ccaaae6faf33520d",
  },
  {
    name: "beta screen",
    copy: huBetaScreen,
    namespaces: ["betaScreen"],
    sourceRevision: "b3cd32f",
    sourceHash: "c4dcf4827cb49219199aab22d2969e33f643ade8a8c2c348bb899d61f3a08119",
  },
  {
    name: "public home",
    copy: huPublicHome,
    namespaces: ["publicHome"],
    sourceRevision: "a4ecbb9",
    sourceHash: "09e34a037936057698a84cecda0fb297d2fe94c43288d416ab04efcef466f384",
  },
  {
    name: "public pricing",
    copy: huPublicPricing,
    namespaces: ["publicPricing"],
    sourceRevision: "339e7f8",
    sourceHash: "8e7cecc9d6ca14af722fe8b4131d7982241e9e856335586f8d4e724469d0de60",
  },
  {
    name: "public studies",
    copy: huPublicStudies,
    namespaces: ["publicStudies"],
    sourceRevision: "339e7f8",
    sourceHash: "ace563fb757a52abcd667e7e691d3e48024045a4e4f265e6949c66a828f5e8de",
  },
  {
    name: "editor screen",
    copy: huEditorScreen,
    namespaces: ["editorScreen"],
    sourceRevision: "25dae67",
    sourceHash: "1e827d2744ea1f2d3364b54983f06b42082f45ab6dfb0eda7b1375fdddd9ec9f",
  },
  {
    name: "plan screen",
    copy: huPlanScreen,
    namespaces: ["planScreen"],
    sourceRevision: "22410f8",
    sourceHash: "2bbe51606245c7a6fa86d34f4c932c7ecb9ac0332b116270fff96c3c8e5175c4",
  },
  {
    name: "evidence screen",
    copy: huEvidenceScreen,
    namespaces: ["evidenceScreen"],
    sourceRevision: "31bab65",
    sourceHash: "2c7e9ccb48b02cd12911d0df6c31a96ec8ddfc6c558dfda3b3e14790d156c136",
  },
  {
    name: "setup screen",
    copy: huSetupScreen,
    namespaces: ["setupScreen"],
    sourceRevision: "9f42e68",
    sourceHash: "565b0bcd89f346fd85f3b87d4e44716826a65bee54fd60eaa3b677c4d732a5ca",
  },
  {
    name: "services screen",
    copy: huServicesScreen,
    namespaces: ["servicesScreen"],
    sourceRevision: "9f42e68",
    sourceHash: "c769d10ab21c34754c6c4a6c57c3ee5f04881605b1dabc10030bca0e9122313d",
  },
  {
    name: "audit screen",
    copy: huAuditScreen,
    namespaces: ["auditScreen"],
    sourceRevision: "9f42e68",
    sourceHash: "2c15a7061c169b3f2da7446d4280ff94cb6b5ce2e6cb56d156af72ab154f1aed",
  },
  {
    name: "analytics screen",
    copy: huAnalyticsScreen,
    namespaces: ["analyticsScreen"],
    sourceRevision: "9f42e68",
    sourceHash: "d86d151031ad82c4dbc559e9816ad14cecaa3e4f1b0de2ff8de3c484de5b02c5",
  },
  {
    name: "billing screen",
    copy: huBillingScreen,
    namespaces: ["billingScreen"],
    sourceRevision: "9f42e68",
    sourceHash: "d0e701bae4247d1129cc13dd6df6d9b569e725edbf5136255b68ca3fb2307194",
  },
  {
    name: "authentication",
    copy: huAuthScreen,
    namespaces: ["authScreen"],
    sourceRevision: "78911a7",
    sourceHash: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  },
  {
    name: "shared controls",
    copy: huSharedUi,
    namespaces: ["sharedUi"],
    sourceRevision: "78911a7",
    sourceHash: "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  },
  {
    name: "core",
    copy: huCore,
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
    sourceRevision: "78911a7",
    sourceHash: "8476f0a4138861b0b333d132799933037eda17dbd2d1ba4207b7cc4e0c9337d1",
  },
  {
    name: "citation review",
    copy: huCitationReview,
    namespaces: ["citationReview"],
    sourceRevision: "P4 citation review candidate after bab861c8",
    sourceHash: "6320ed498d4ce0af5c43d77d46109f8e85cffeebb25d64f16d815eb2332beae4",
  },
  {
    name: "citation authoring",
    copy: huCitationAuthoring,
    namespaces: ["citationAuthoring"],
    sourceRevision: "citation owner authoring candidate after a392775c",
    sourceHash: "ffb6a332b8756b5467c8e06e740b9829d118f7c6112240a88046298922055c2a",
  },
  {
    name: "citation forward",
    copy: huCitationForward,
    namespaces: ["citationForward"],
    sourceRevision: "citation forward workflow candidate after 64db7a4b (Codex N1 corrections)",
    sourceHash: "692652100abfecf97689fd04a6f508d7d66db62417cfd2cfc3dc6f2adf8fcb70",
  },
  {
    name: "citation change",
    copy: huCitationChange,
    namespaces: ["citationChange"],
    sourceRevision: "citation change evidence candidate 20260928120000 (R/R1/R2)",
    sourceHash: "576b6f207594745c1c3e082e0bba5d773318eb96241d4d5cf18187b680cdc2d5",
  },
] as const;
export const HU_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...HU_STAGED_BATCHES.map((batch) => batch.copy)),
);
