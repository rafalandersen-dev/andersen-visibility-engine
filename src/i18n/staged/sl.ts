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
import { slAnalyticsScreen } from "./sl-analytics-screen";
import { slAuditScreen } from "./sl-audit-screen";
import { slServicesScreen } from "./sl-services-screen";
import { slSetupScreen } from "./sl-setup-screen";
import { slCore } from "./sl-core";
import { slAuthScreen } from "./sl-auth-screen";
import { slSharedUi } from "./sl-shared-ui";
import { slCitationReview } from "./sl-citation-review";
/** Slovenian authoring; never imported by the runtime catalog. */
export const SL_STAGED_BATCHES = [
  {
    name: "conversation",
    copy: slConversation,
    namespaces: ["chat"],
    sourceRevision: "metadata proposal candidate after eb971e8",
    sourceHash: "d37f66e7435e11e49b2e69c75ace0f494c1d288b7c4e4b1d3f3c110a1274649b",
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
    sourceHash: "649e9d723e890e3a356652ad7a515080081167e2d06a4dc5d3ad58cc5e2b6615",
  },
  {
    name: "evidence",
    copy: slEvidence,
    namespaces: ["answer", "logs", "proof", "aiEval", "benchmark"],
    sourceRevision: "d30a733",
    sourceHash: "2911f87d7691a2bf04548e0b7c0e63b3c93f25cdcd73c9af1ba5d22ffdee211d",
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
    sourceHash: "216126da773525ef913fe7e10a4db7af57539ea07dae497fd349051da3088395",
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
    sourceHash: "a3a3297006f23628e422ddedfb5b6f5a51c6dd5f6abbc6d6e589481e49915816",
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
    sourceHash: "0e11ebfcac212ec85d91c8734430e0cd661dc727057c565c1cfcd33f59a1aa60",
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
    sourceHash: "845b2b1ade4a0935ab924dcc4bdc27d72a7a120388740354bd69a697aa1c7ff2",
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
    sourceHash: "d86d151031ad82c4dbc559e9816ad14cecaa3e4f1b0de2ff8de3c484de5b02c5",
  },
  {
    name: "billing screen",
    copy: slBillingScreen,
    namespaces: ["billingScreen"],
    sourceRevision: "1113cc5",
    sourceHash: "d0e701bae4247d1129cc13dd6df6d9b569e725edbf5136255b68ca3fb2307194",
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
    sourceHash: "288f529ed3a18c00623c05011262d3cce0374158e558959fa8fc9dbc63174bb7",
  },
  {
    name: "editor screen",
    copy: slEditorScreen,
    namespaces: ["editorScreen"],
    sourceRevision: "9d577d4",
    sourceHash: "1e827d2744ea1f2d3364b54983f06b42082f45ab6dfb0eda7b1375fdddd9ec9f",
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
    sourceHash: "d41949f7901f0d37b4debab152a406f238c34273ed422fe230df34ff41dcb151",
  },
] as const;
export const SL_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...SL_STAGED_BATCHES.map((batch) => batch.copy)),
);
