import { itEvidence } from "./it-evidence";
import { itLinks } from "./it-links";
import { itCommerce } from "./it-commerce";
import { itGrowth } from "./it-growth";
import { itOutreach } from "./it-outreach";
import { itPublicBeta } from "./it-public-beta";
import { itBetaScreen } from "./it-beta-screen";
import { itBetaGuide } from "./it-beta-guide";
import { itPublicHome } from "./it-public-home";
import { itPublicStudies } from "./it-public-studies";
import { itPublicPricing } from "./it-public-pricing";
import { itConfiguration } from "./it-configuration";
import { itMeasurements } from "./it-measurements";
import { itTechnical } from "./it-technical";
import { itKnowledge } from "./it-knowledge";
import { itCollaboration } from "./it-collaboration";
import { itEditorScreen } from "./it-editor-screen";
import { itPlanScreen } from "./it-plan-screen";
import { itEvidenceScreen } from "./it-evidence-screen";
import { itBillingScreen } from "./it-billing-screen";
import { itAnalyticsScreen } from "./it-analytics-screen";
import { itAuditScreen } from "./it-audit-screen";
import { itServicesScreen } from "./it-services-screen";
import { itSetupScreen } from "./it-setup-screen";
import { itAuthScreen } from "./it-auth-screen";
import { itSharedUi } from "./it-shared-ui";
import { itCore } from "./it-core";

/** Incomplete Italian authoring. Never register this catalog in runtime. */
export const IT_STAGED_BATCHES = [
  {
    name: "core",
    copy: itCore,
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
    sourceRevision: "6002253",
    sourceHash: "924a5d23d5cf76e52c2cae0dbb90b23f1989e850603d1b0462fc4e569e204bcf",
  },
  {
    name: "authentication",
    copy: itAuthScreen,
    namespaces: ["authScreen"],
    sourceRevision: "6002253",
    sourceHash: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  },
  {
    name: "shared controls",
    copy: itSharedUi,
    namespaces: ["sharedUi"],
    sourceRevision: "6002253",
    sourceHash: "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  },
  {
    name: "setup screen",
    copy: itSetupScreen,
    namespaces: ["setupScreen"],
    sourceRevision: "b7534ac",
    sourceHash: "565b0bcd89f346fd85f3b87d4e44716826a65bee54fd60eaa3b677c4d732a5ca",
  },
  {
    name: "services screen",
    copy: itServicesScreen,
    namespaces: ["servicesScreen"],
    sourceRevision: "b7534ac",
    sourceHash: "c769d10ab21c34754c6c4a6c57c3ee5f04881605b1dabc10030bca0e9122313d",
  },
  {
    name: "audit screen",
    copy: itAuditScreen,
    namespaces: ["auditScreen"],
    sourceRevision: "b7534ac",
    sourceHash: "2c15a7061c169b3f2da7446d4280ff94cb6b5ce2e6cb56d156af72ab154f1aed",
  },
  {
    name: "analytics screen",
    copy: itAnalyticsScreen,
    namespaces: ["analyticsScreen"],
    sourceRevision: "b7534ac",
    sourceHash: "d86d151031ad82c4dbc559e9816ad14cecaa3e4f1b0de2ff8de3c484de5b02c5",
  },
  {
    name: "billing screen",
    copy: itBillingScreen,
    namespaces: ["billingScreen"],
    sourceRevision: "b7534ac",
    sourceHash: "d0e701bae4247d1129cc13dd6df6d9b569e725edbf5136255b68ca3fb2307194",
  },
  {
    name: "evidence screen",
    copy: itEvidenceScreen,
    namespaces: ["evidenceScreen"],
    sourceRevision: "f729cd2",
    sourceHash: "2c7e9ccb48b02cd12911d0df6c31a96ec8ddfc6c558dfda3b3e14790d156c136",
  },
  {
    name: "plan screen",
    copy: itPlanScreen,
    namespaces: ["planScreen"],
    sourceRevision: "f729cd2",
    sourceHash: "288f529ed3a18c00623c05011262d3cce0374158e558959fa8fc9dbc63174bb7",
  },
  {
    name: "editor screen",
    copy: itEditorScreen,
    namespaces: ["editorScreen"],
    sourceRevision: "f729cd2",
    sourceHash: "1e827d2744ea1f2d3364b54983f06b42082f45ab6dfb0eda7b1375fdddd9ec9f",
  },
  {
    name: "collaboration",
    copy: itCollaboration,
    namespaces: ["collaboration", "team", "notifications", "awareness", "emailSettings"],
    sourceRevision: "36bcbae",
    sourceHash: "429e59f16a866242f25a373ebd6b52332ae3f04534230101422ebab727f77ed0",
  },
  {
    name: "knowledge",
    copy: itKnowledge,
    namespaces: ["knowledge", "weekly", "approval", "refresh"],
    sourceRevision: "88078b9",
    sourceHash: "a3a3297006f23628e422ddedfb5b6f5a51c6dd5f6abbc6d6e589481e49915816",
  },
  {
    name: "technical",
    copy: itTechnical,
    namespaces: ["crawl", "gindex", "perf"],
    sourceRevision: "b88d167",
    sourceHash: "106a19b8ceaf725528ddc9d4de7317d823108425584418d93729346f29c135e6",
  },
  {
    name: "measurements",
    copy: itMeasurements,
    namespaces: ["analytics", "gsc", "report"],
    sourceRevision: "4efe62c",
    sourceHash: "cfe9102341aed0899846a94191ac4a27f5a7b371e09775137f3ce10481df6199",
  },
  {
    name: "configuration",
    copy: itConfiguration,
    namespaces: ["brand", "wp", "shopify", "claude", "connect", "connections", "coverage"],
    sourceRevision: "ebfca0a",
    sourceHash: "0e11ebfcac212ec85d91c8734430e0cd661dc727057c565c1cfcd33f59a1aa60",
  },
  {
    name: "public pricing",
    copy: itPublicPricing,
    namespaces: ["publicPricing"],
    sourceRevision: "554701d",
    sourceHash: "8e7cecc9d6ca14af722fe8b4131d7982241e9e856335586f8d4e724469d0de60",
  },
  {
    name: "public studies",
    copy: itPublicStudies,
    namespaces: ["publicStudies"],
    sourceRevision: "554701d",
    sourceHash: "ace563fb757a52abcd667e7e691d3e48024045a4e4f265e6949c66a828f5e8de",
  },
  {
    name: "public home",
    copy: itPublicHome,
    namespaces: ["publicHome"],
    sourceRevision: "da6e67e",
    sourceHash: "4e132895babfb222b37e92719be5ad2a8be90d9503869e9df9845b00d982adeb",
  },
  {
    name: "beta guide",
    copy: itBetaGuide,
    namespaces: ["betaGuide"],
    sourceRevision: "bf687f2",
    sourceHash: "8c815e10a73590a6e2911d1b5618d5d545c15a47b3a75462ccaaae6faf33520d",
  },
  {
    name: "beta controls",
    copy: itBetaScreen,
    namespaces: ["betaScreen"],
    sourceRevision: "bf687f2",
    sourceHash: "c4dcf4827cb49219199aab22d2969e33f643ade8a8c2c348bb899d61f3a08119",
  },
  {
    name: "public beta",
    copy: itPublicBeta,
    namespaces: ["publicBeta"],
    sourceRevision: "060b003",
    sourceHash: "e670953b131c40fc4433b5ce6e5b256556bf37ea8709bc495b211efc361fb59e",
  },
  {
    name: "outreach",
    copy: itOutreach,
    namespaces: ["outreach", "hook", "anchor"],
    sourceRevision: "0879c73",
    sourceHash: "c2bfe98eb710f1587237c92b04696e6f9221e67def7d1080eb7ce08e3d1161b4",
  },
  {
    name: "growth",
    copy: itGrowth,
    namespaces: ["authority", "actions", "publicAudit"],
    sourceRevision: "49c401c",
    sourceHash: "79460ac604f31155136687fbf43e146ccd11625f12316625da192cdb8188f136",
  },
  {
    name: "commerce",
    copy: itCommerce,
    namespaces: ["billing", "launch", "beta"],
    sourceRevision: "a7fe4e6",
    sourceHash: "2d58b596b76d994df2999d70c42588c8a48ec57ab846dbe5b88238580e59387c",
  },
  {
    name: "links",
    copy: itLinks,
    namespaces: [
      "linknet",
      "backlinks",
      "marketplace",
      "backlinkMonitor",
      "backlinkDetails",
      "backlinkRecurring",
    ],
    sourceRevision: "afde44e",
    sourceHash: "7b8c4cfd6fb08b518e7e0eb7fd53e767b72972a0048a75521eda0d4b9ebd40d7",
  },
  {
    name: "evidence",
    copy: itEvidence,
    namespaces: ["answer", "logs", "proof", "aiEval", "benchmark"],
    sourceRevision: "a8d2c7e",
    sourceHash: "2911f87d7691a2bf04548e0b7c0e63b3c93f25cdcd73c9af1ba5d22ffdee211d",
  },
] as const;
export const IT_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...IT_STAGED_BATCHES.map((batch) => batch.copy)),
);
