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
    sourceHash: "649e9d723e890e3a356652ad7a515080081167e2d06a4dc5d3ad58cc5e2b6615",
  },
  {
    name: "evidence",
    copy: huEvidence,
    namespaces: ["answer", "logs", "proof", "aiEval", "benchmark"],
    sourceRevision: "4f58bc4",
    sourceHash: "2911f87d7691a2bf04548e0b7c0e63b3c93f25cdcd73c9af1ba5d22ffdee211d",
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
    sourceHash: "a3a3297006f23628e422ddedfb5b6f5a51c6dd5f6abbc6d6e589481e49915816",
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
    sourceHash: "0e11ebfcac212ec85d91c8734430e0cd661dc727057c565c1cfcd33f59a1aa60",
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
    sourceHash: "288f529ed3a18c00623c05011262d3cce0374158e558959fa8fc9dbc63174bb7",
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
    sourceHash: "845b2b1ade4a0935ab924dcc4bdc27d72a7a120388740354bd69a697aa1c7ff2",
  },
  {
    name: "citation review",
    copy: huCitationReview,
    namespaces: ["citationReview"],
    sourceRevision: "P4 citation review candidate after bab861c8",
    sourceHash: "d41949f7901f0d37b4debab152a406f238c34273ed422fe230df34ff41dcb151",
  },
  {
    name: "citation authoring",
    copy: huCitationAuthoring,
    namespaces: ["citationAuthoring"],
    sourceRevision: "citation owner authoring candidate after a392775c",
    sourceHash: "3affd8936a8bce81ce411aaffbf2909c58d56d85e7ccc9e5c3efd6d11e650d4f",
  },
] as const;
export const HU_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...HU_STAGED_BATCHES.map((batch) => batch.copy)),
);
