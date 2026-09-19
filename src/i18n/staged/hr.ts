import { hrConversation } from "./hr-conversation";
import { hrWorkflow } from "./hr-workflow";
import { hrEvidence } from "./hr-evidence";
import { hrLinks } from "./hr-links";
import { hrCommerce } from "./hr-commerce";
import { hrGrowth } from "./hr-growth";
import { hrOutreach } from "./hr-outreach";
import { hrMeasurements } from "./hr-measurements";
import { hrTechnical } from "./hr-technical";
import { hrKnowledge } from "./hr-knowledge";
import { hrCollab } from "./hr-collab";
import { hrConfig } from "./hr-config";
import { hrPublicBeta } from "./hr-public-beta";
import { hrBetaGuide } from "./hr-beta-guide";
import { hrBetaScreen } from "./hr-beta-screen";
import { hrPublicHome } from "./hr-public-home";
import { hrPublicPricing } from "./hr-public-pricing";
import { hrPublicStudies } from "./hr-public-studies";
import { hrEditorScreen } from "./hr-editor-screen";
import { hrPlanScreen } from "./hr-plan-screen";
import { hrEvidenceScreen } from "./hr-evidence-screen";
import { hrAnalyticsScreen } from "./hr-analytics-screen";
import { hrBillingScreen } from "./hr-billing-screen";
import { hrSetupScreen } from "./hr-setup-screen";
import { hrServicesScreen } from "./hr-services-screen";
import { hrAuditScreen } from "./hr-audit-screen";
import { hrCore } from "./hr-core";
import { hrAuthScreen } from "./hr-auth-screen";
import { hrSharedUi } from "./hr-shared-ui";
/** Croatian authoring; never imported by the runtime catalog. */
export const HR_STAGED_BATCHES = [
  {
    name: "conversation",
    copy: hrConversation,
    namespaces: ["chat"],
    sourceRevision: "metadata proposal candidate after eb971e8",
    sourceHash: "d37f66e7435e11e49b2e69c75ace0f494c1d288b7c4e4b1d3f3c110a1274649b",
  },
  {
    name: "workflow",
    copy: hrWorkflow,
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
    sourceRevision: "d0218e9",
    sourceHash: "649e9d723e890e3a356652ad7a515080081167e2d06a4dc5d3ad58cc5e2b6615",
  },
  {
    name: "evidence",
    copy: hrEvidence,
    namespaces: ["answer", "logs", "proof", "aiEval", "benchmark"],
    sourceRevision: "e59a229",
    sourceHash: "2911f87d7691a2bf04548e0b7c0e63b3c93f25cdcd73c9af1ba5d22ffdee211d",
  },
  {
    name: "links",
    copy: hrLinks,
    namespaces: [
      "linknet",
      "backlinks",
      "marketplace",
      "backlinkMonitor",
      "backlinkDetails",
      "backlinkRecurring",
    ],
    sourceRevision: "7194081",
    sourceHash: "7b8c4cfd6fb08b518e7e0eb7fd53e767b72972a0048a75521eda0d4b9ebd40d7",
  },
  {
    name: "commerce",
    copy: hrCommerce,
    namespaces: ["billing", "launch", "beta"],
    sourceRevision: "c2a33a6",
    sourceHash: "6cd0596e8ff09ae38f9decb763ab31a3fe2c311109c9b5f85edc9721d7058ff2",
  },
  {
    name: "growth",
    copy: hrGrowth,
    namespaces: ["authority", "actions", "publicAudit"],
    sourceRevision: "3a7929e",
    sourceHash: "79460ac604f31155136687fbf43e146ccd11625f12316625da192cdb8188f136",
  },
  {
    name: "outreach",
    copy: hrOutreach,
    namespaces: ["outreach", "hook", "anchor"],
    sourceRevision: "11dab5c",
    sourceHash: "c2bfe98eb710f1587237c92b04696e6f9221e67def7d1080eb7ce08e3d1161b4",
  },
  {
    name: "measurements",
    copy: hrMeasurements,
    namespaces: ["analytics", "gsc", "report"],
    sourceRevision: "f146e88",
    sourceHash: "216126da773525ef913fe7e10a4db7af57539ea07dae497fd349051da3088395",
  },
  {
    name: "technical",
    copy: hrTechnical,
    namespaces: ["crawl", "gindex", "perf"],
    sourceRevision: "6eb1efc",
    sourceHash: "106a19b8ceaf725528ddc9d4de7317d823108425584418d93729346f29c135e6",
  },
  {
    name: "knowledge",
    copy: hrKnowledge,
    namespaces: ["knowledge", "weekly", "approval", "refresh"],
    sourceRevision: "9e0e08c",
    sourceHash: "a3a3297006f23628e422ddedfb5b6f5a51c6dd5f6abbc6d6e589481e49915816",
  },
  {
    name: "collaboration",
    copy: hrCollab,
    namespaces: ["collaboration", "team", "notifications", "awareness", "emailSettings"],
    sourceRevision: "cb473e8",
    sourceHash: "66e659da6d8b879af77aef68c0bba3717cb793240da5ae2364a93212f16bd83f",
  },
  {
    name: "configuration",
    copy: hrConfig,
    namespaces: ["brand", "wp", "shopify", "claude", "connect", "connections", "coverage"],
    sourceRevision: "aedd7bf",
    sourceHash: "0e11ebfcac212ec85d91c8734430e0cd661dc727057c565c1cfcd33f59a1aa60",
  },
  {
    name: "public beta",
    copy: hrPublicBeta,
    namespaces: ["publicBeta"],
    sourceRevision: "ca38a2c",
    sourceHash: "e670953b131c40fc4433b5ce6e5b256556bf37ea8709bc495b211efc361fb59e",
  },
  {
    name: "beta guidance",
    copy: hrBetaGuide,
    namespaces: ["betaGuide"],
    sourceRevision: "f59616e",
    sourceHash: "8c815e10a73590a6e2911d1b5618d5d545c15a47b3a75462ccaaae6faf33520d",
  },
  {
    name: "beta screen",
    copy: hrBetaScreen,
    namespaces: ["betaScreen"],
    sourceRevision: "43e885c",
    sourceHash: "c4dcf4827cb49219199aab22d2969e33f643ade8a8c2c348bb899d61f3a08119",
  },
  {
    name: "public home",
    copy: hrPublicHome,
    namespaces: ["publicHome"],
    sourceRevision: "dce3a94",
    sourceHash: "09e34a037936057698a84cecda0fb297d2fe94c43288d416ab04efcef466f384",
  },
  {
    name: "public pricing",
    copy: hrPublicPricing,
    namespaces: ["publicPricing"],
    sourceRevision: "9c59c24",
    sourceHash: "8e7cecc9d6ca14af722fe8b4131d7982241e9e856335586f8d4e724469d0de60",
  },
  {
    name: "public studies",
    copy: hrPublicStudies,
    namespaces: ["publicStudies"],
    sourceRevision: "9c59c24",
    sourceHash: "ace563fb757a52abcd667e7e691d3e48024045a4e4f265e6949c66a828f5e8de",
  },
  {
    name: "editor screen",
    copy: hrEditorScreen,
    namespaces: ["editorScreen"],
    sourceRevision: "7b5b342",
    sourceHash: "1e827d2744ea1f2d3364b54983f06b42082f45ab6dfb0eda7b1375fdddd9ec9f",
  },
  {
    name: "plan screen",
    copy: hrPlanScreen,
    namespaces: ["planScreen"],
    sourceRevision: "26439c1",
    sourceHash: "288f529ed3a18c00623c05011262d3cce0374158e558959fa8fc9dbc63174bb7",
  },
  {
    name: "evidence screen",
    copy: hrEvidenceScreen,
    namespaces: ["evidenceScreen"],
    sourceRevision: "5b2f76a",
    sourceHash: "2c7e9ccb48b02cd12911d0df6c31a96ec8ddfc6c558dfda3b3e14790d156c136",
  },
  {
    name: "analytics screen",
    copy: hrAnalyticsScreen,
    namespaces: ["analyticsScreen"],
    sourceRevision: "84890e0",
    sourceHash: "d86d151031ad82c4dbc559e9816ad14cecaa3e4f1b0de2ff8de3c484de5b02c5",
  },
  {
    name: "billing screen",
    copy: hrBillingScreen,
    namespaces: ["billingScreen"],
    sourceRevision: "84890e0",
    sourceHash: "d0e701bae4247d1129cc13dd6df6d9b569e725edbf5136255b68ca3fb2307194",
  },
  {
    name: "setup screen",
    copy: hrSetupScreen,
    namespaces: ["setupScreen"],
    sourceRevision: "cae5a6d",
    sourceHash: "565b0bcd89f346fd85f3b87d4e44716826a65bee54fd60eaa3b677c4d732a5ca",
  },
  {
    name: "services screen",
    copy: hrServicesScreen,
    namespaces: ["servicesScreen"],
    sourceRevision: "cae5a6d",
    sourceHash: "c769d10ab21c34754c6c4a6c57c3ee5f04881605b1dabc10030bca0e9122313d",
  },
  {
    name: "audit screen",
    copy: hrAuditScreen,
    namespaces: ["auditScreen"],
    sourceRevision: "cae5a6d",
    sourceHash: "2c15a7061c169b3f2da7446d4280ff94cb6b5ce2e6cb56d156af72ab154f1aed",
  },
  {
    name: "core",
    copy: hrCore,
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
    sourceRevision: "9146c53",
    sourceHash: "845b2b1ade4a0935ab924dcc4bdc27d72a7a120388740354bd69a697aa1c7ff2",
  },
  {
    name: "authentication",
    copy: hrAuthScreen,
    namespaces: ["authScreen"],
    sourceRevision: "b450bc5",
    sourceHash: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  },
  {
    name: "shared controls",
    copy: hrSharedUi,
    namespaces: ["sharedUi"],
    sourceRevision: "b450bc5",
    sourceHash: "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  },
] as const;
export const HR_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...HR_STAGED_BATCHES.map((batch) => batch.copy)),
);
