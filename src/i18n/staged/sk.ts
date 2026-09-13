import { skConversation } from "./sk-conversation";
import { skWorkflow } from "./sk-workflow";
import { skEvidence } from "./sk-evidence";
import { skLinks } from "./sk-links";
import { skCommerce } from "./sk-commerce";
import { skGrowth } from "./sk-growth";
import { skOutreach } from "./sk-outreach";
import { skMeasurements } from "./sk-measurements";
import { skTechnical } from "./sk-technical";
import { skKnowledge } from "./sk-knowledge";
import { skCollaboration } from "./sk-collaboration";
import { skConfiguration } from "./sk-configuration";
import { skPublicBeta } from "./sk-public-beta";
import { skBetaGuide } from "./sk-beta-guide";
import { skBetaScreen } from "./sk-beta-screen";
import { skPublicHome } from "./sk-public-home";
import { skPublicStudies } from "./sk-public-studies";
import { skPublicPricing } from "./sk-public-pricing";
import { skEditorScreen } from "./sk-editor-screen";
import { skPlanScreen } from "./sk-plan-screen";
import { skEvidenceScreen } from "./sk-evidence-screen";
import { skBillingScreen } from "./sk-billing-screen";
import { skAnalyticsScreen } from "./sk-analytics-screen";
import { skAuditScreen } from "./sk-audit-screen";
import { skServicesScreen } from "./sk-services-screen";
import { skSetupScreen } from "./sk-setup-screen";
import { skCore } from "./sk-core";
import { skAuthScreen } from "./sk-auth-screen";
import { skSharedUi } from "./sk-shared-ui";
/** Slovak authoring; never imported by the runtime catalog. */
export const SK_STAGED_BATCHES = [
  {
    name: "conversation",
    copy: skConversation,
    namespaces: ["chat"],
    sourceRevision: "metadata proposal candidate after eb971e8",
    sourceHash: "0450c9bb7fd9b51290cc6d053d708938bf7112a802709524479b72a6a9b20864",
  },
  {
    name: "authentication",
    copy: skAuthScreen,
    namespaces: ["authScreen"],
    sourceRevision: "e72328d",
    sourceHash: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  },
  {
    name: "shared controls",
    copy: skSharedUi,
    namespaces: ["sharedUi"],
    sourceRevision: "e72328d",
    sourceHash: "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  },
  {
    name: "core",
    copy: skCore,
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
    sourceRevision: "4ad3d13",
    sourceHash: "845b2b1ade4a0935ab924dcc4bdc27d72a7a120388740354bd69a697aa1c7ff2",
  },
  {
    name: "setup screen",
    copy: skSetupScreen,
    namespaces: ["setupScreen"],
    sourceRevision: "24ddc69",
    sourceHash: "565b0bcd89f346fd85f3b87d4e44716826a65bee54fd60eaa3b677c4d732a5ca",
  },
  {
    name: "services screen",
    copy: skServicesScreen,
    namespaces: ["servicesScreen"],
    sourceRevision: "24ddc69",
    sourceHash: "c769d10ab21c34754c6c4a6c57c3ee5f04881605b1dabc10030bca0e9122313d",
  },
  {
    name: "audit screen",
    copy: skAuditScreen,
    namespaces: ["auditScreen"],
    sourceRevision: "24ddc69",
    sourceHash: "2c15a7061c169b3f2da7446d4280ff94cb6b5ce2e6cb56d156af72ab154f1aed",
  },
  {
    name: "analytics screen",
    copy: skAnalyticsScreen,
    namespaces: ["analyticsScreen"],
    sourceRevision: "e274ada",
    sourceHash: "d86d151031ad82c4dbc559e9816ad14cecaa3e4f1b0de2ff8de3c484de5b02c5",
  },
  {
    name: "billing screen",
    copy: skBillingScreen,
    namespaces: ["billingScreen"],
    sourceRevision: "e274ada",
    sourceHash: "d0e701bae4247d1129cc13dd6df6d9b569e725edbf5136255b68ca3fb2307194",
  },
  {
    name: "evidence screen",
    copy: skEvidenceScreen,
    namespaces: ["evidenceScreen"],
    sourceRevision: "23cb569",
    sourceHash: "2c7e9ccb48b02cd12911d0df6c31a96ec8ddfc6c558dfda3b3e14790d156c136",
  },
  {
    name: "plan screen",
    copy: skPlanScreen,
    namespaces: ["planScreen"],
    sourceRevision: "6b99354",
    sourceHash: "288f529ed3a18c00623c05011262d3cce0374158e558959fa8fc9dbc63174bb7",
  },
  {
    name: "editor screen",
    copy: skEditorScreen,
    namespaces: ["editorScreen"],
    sourceRevision: "120b4dc",
    sourceHash: "1e827d2744ea1f2d3364b54983f06b42082f45ab6dfb0eda7b1375fdddd9ec9f",
  },
  {
    name: "public pricing",
    copy: skPublicPricing,
    namespaces: ["publicPricing"],
    sourceRevision: "c3a04a7",
    sourceHash: "8e7cecc9d6ca14af722fe8b4131d7982241e9e856335586f8d4e724469d0de60",
  },
  {
    name: "public studies",
    copy: skPublicStudies,
    namespaces: ["publicStudies"],
    sourceRevision: "c3a04a7",
    sourceHash: "ace563fb757a52abcd667e7e691d3e48024045a4e4f265e6949c66a828f5e8de",
  },
  {
    name: "public home",
    copy: skPublicHome,
    namespaces: ["publicHome"],
    sourceRevision: "c5c37bb",
    sourceHash: "2855ce0efcce2fc714afc7f61a15d64ed5975809acefb98df75a3e275ccae141",
  },
  {
    name: "beta screen",
    copy: skBetaScreen,
    namespaces: ["betaScreen"],
    sourceRevision: "38b917f",
    sourceHash: "c4dcf4827cb49219199aab22d2969e33f643ade8a8c2c348bb899d61f3a08119",
  },
  {
    name: "beta guidance",
    copy: skBetaGuide,
    namespaces: ["betaGuide"],
    sourceRevision: "6d09db8",
    sourceHash: "8c815e10a73590a6e2911d1b5618d5d545c15a47b3a75462ccaaae6faf33520d",
  },
  {
    name: "public beta",
    copy: skPublicBeta,
    namespaces: ["publicBeta"],
    sourceRevision: "865b87a",
    sourceHash: "e670953b131c40fc4433b5ce6e5b256556bf37ea8709bc495b211efc361fb59e",
  },
  {
    name: "configuration",
    copy: skConfiguration,
    namespaces: ["brand", "wp", "shopify", "claude", "connect", "connections", "coverage"],
    sourceRevision: "b5e84bf",
    sourceHash: "0e11ebfcac212ec85d91c8734430e0cd661dc727057c565c1cfcd33f59a1aa60",
  },
  {
    name: "collaboration",
    copy: skCollaboration,
    namespaces: ["collaboration", "team", "notifications", "awareness", "emailSettings"],
    sourceRevision: "6ee209c",
    sourceHash: "429e59f16a866242f25a373ebd6b52332ae3f04534230101422ebab727f77ed0",
  },
  {
    name: "knowledge",
    copy: skKnowledge,
    namespaces: ["knowledge", "weekly", "approval", "refresh"],
    sourceRevision: "b65e680",
    sourceHash: "a3a3297006f23628e422ddedfb5b6f5a51c6dd5f6abbc6d6e589481e49915816",
  },
  {
    name: "technical",
    copy: skTechnical,
    namespaces: ["crawl", "gindex", "perf"],
    sourceRevision: "9079fb6",
    sourceHash: "106a19b8ceaf725528ddc9d4de7317d823108425584418d93729346f29c135e6",
  },
  {
    name: "measurements",
    copy: skMeasurements,
    namespaces: ["analytics", "gsc", "report"],
    sourceRevision: "2f06d69",
    sourceHash: "216126da773525ef913fe7e10a4db7af57539ea07dae497fd349051da3088395",
  },
  {
    name: "outreach",
    copy: skOutreach,
    namespaces: ["outreach", "hook", "anchor"],
    sourceRevision: "8b4032a",
    sourceHash: "c2bfe98eb710f1587237c92b04696e6f9221e67def7d1080eb7ce08e3d1161b4",
  },
  {
    name: "growth",
    copy: skGrowth,
    namespaces: ["authority", "actions", "publicAudit"],
    sourceRevision: "7c7795f",
    sourceHash: "79460ac604f31155136687fbf43e146ccd11625f12316625da192cdb8188f136",
  },
  {
    name: "commerce",
    copy: skCommerce,
    namespaces: ["billing", "launch", "beta"],
    sourceRevision: "a5d2a42",
    sourceHash: "6cd0596e8ff09ae38f9decb763ab31a3fe2c311109c9b5f85edc9721d7058ff2",
  },
  {
    name: "links",
    copy: skLinks,
    namespaces: [
      "linknet",
      "backlinks",
      "marketplace",
      "backlinkMonitor",
      "backlinkDetails",
      "backlinkRecurring",
    ],
    sourceRevision: "58c329a",
    sourceHash: "7b8c4cfd6fb08b518e7e0eb7fd53e767b72972a0048a75521eda0d4b9ebd40d7",
  },
  {
    name: "evidence",
    copy: skEvidence,
    namespaces: ["answer", "logs", "proof", "aiEval", "benchmark"],
    sourceRevision: "482aa28",
    sourceHash: "2911f87d7691a2bf04548e0b7c0e63b3c93f25cdcd73c9af1ba5d22ffdee211d",
  },
  {
    name: "workflow",
    copy: skWorkflow,
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
    sourceRevision: "aef1c2c",
    sourceHash: "649e9d723e890e3a356652ad7a515080081167e2d06a4dc5d3ad58cc5e2b6615",
  },
] as const;
export const SK_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...SK_STAGED_BATCHES.map((batch) => batch.copy)),
);
