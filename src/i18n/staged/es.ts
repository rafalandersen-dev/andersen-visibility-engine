import { esAnalyticsScreen } from "./es-analytics-screen";
import { esAuditScreen } from "./es-audit-screen";
import { esAuthScreen } from "./es-auth-screen";
import { esBetaGuide } from "./es-beta-guide";
import { esBetaScreen } from "./es-beta-screen";
import { esBillingScreen } from "./es-billing-screen";
import { esCollaboration } from "./es-collaboration";
import { esCommerce } from "./es-commerce";
import { esConfiguration } from "./es-configuration";
import { esCore } from "./es-core";
import { esEditorScreen } from "./es-editor-screen";
import { esEvidenceScreen } from "./es-evidence-screen";
import { esEvidence } from "./es-evidence";
import { esGrowth } from "./es-growth";
import { esKnowledge } from "./es-knowledge";
import { esLinks } from "./es-links";
import { esMeasurements } from "./es-measurements";
import { esOutreach } from "./es-outreach";
import { esPlanScreen } from "./es-plan-screen";
import { esPublicBeta } from "./es-public-beta";
import { esPublicHome } from "./es-public-home";
import { esPublicPricing } from "./es-public-pricing";
import { esServicesScreen } from "./es-services-screen";
import { esSetupScreen } from "./es-setup-screen";
import { esSharedUi } from "./es-shared-ui";
import { esTechnical } from "./es-technical";
import { esWorkflow } from "./es-workflow";

/** Incomplete Spanish authoring: 3734 messages / 27 batches.
 * Baseline: 3,734 English keys at 47bb01c; newer source needs reconciliation.
 * Legacy monthly scheduler, publication guarantees and provider/product claims
 * require review before activation. No fluent-user or full-interface acceptance.
 * Not imported by the runtime or language picker. Hashes detect source drift. */
export const ES_STAGED_BATCHES = [
  {
    name: "analytics screen",
    copy: esAnalyticsScreen,
    namespaces: ["analyticsScreen"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "d86d151031ad82c4dbc559e9816ad14cecaa3e4f1b0de2ff8de3c484de5b02c5",
  },
  {
    name: "audit screen",
    copy: esAuditScreen,
    namespaces: ["auditScreen"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "2c15a7061c169b3f2da7446d4280ff94cb6b5ce2e6cb56d156af72ab154f1aed",
  },
  {
    name: "authentication screen",
    copy: esAuthScreen,
    namespaces: ["authScreen"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  },
  {
    name: "beta playbook guidance",
    copy: esBetaGuide,
    namespaces: ["betaGuide"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "8c815e10a73590a6e2911d1b5618d5d545c15a47b3a75462ccaaae6faf33520d",
  },
  {
    name: "beta screen controls",
    copy: esBetaScreen,
    namespaces: ["betaScreen"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "c4dcf4827cb49219199aab22d2969e33f643ade8a8c2c348bb899d61f3a08119",
  },
  {
    name: "billing screen",
    copy: esBillingScreen,
    namespaces: ["billingScreen"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "efc54955c540e8fbc0c9f63b08a05595e82c60fa5335054dacc1607e7ba99b44",
  },
  {
    name: "collaboration",
    copy: esCollaboration,
    namespaces: ["collaboration", "team", "notifications", "awareness", "emailSettings"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "429e59f16a866242f25a373ebd6b52332ae3f04534230101422ebab727f77ed0",
  },
  {
    name: "commerce",
    copy: esCommerce,
    namespaces: ["billing", "launch", "beta"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "2d58b596b76d994df2999d70c42588c8a48ec57ab846dbe5b88238580e59387c",
  },
  {
    name: "configuration",
    copy: esConfiguration,
    namespaces: ["brand", "wp", "shopify", "claude", "connect", "connections", "coverage"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "c5fffe69452f29226bfabcf4cd8633801d03536d5fd9f9681092c425569e6561",
  },
  {
    name: "core",
    copy: esCore,
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
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "924a5d23d5cf76e52c2cae0dbb90b23f1989e850603d1b0462fc4e569e204bcf",
  },
  {
    name: "editor screen",
    copy: esEditorScreen,
    namespaces: ["editorScreen"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "1e827d2744ea1f2d3364b54983f06b42082f45ab6dfb0eda7b1375fdddd9ec9f",
  },
  {
    name: "evidence screen",
    copy: esEvidenceScreen,
    namespaces: ["evidenceScreen"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "2c7e9ccb48b02cd12911d0df6c31a96ec8ddfc6c558dfda3b3e14790d156c136",
  },
  {
    name: "evidence",
    copy: esEvidence,
    namespaces: ["answer", "logs", "proof", "aiEval", "benchmark"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "2911f87d7691a2bf04548e0b7c0e63b3c93f25cdcd73c9af1ba5d22ffdee211d",
  },
  {
    name: "growth",
    copy: esGrowth,
    namespaces: ["authority", "actions", "publicAudit"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "79460ac604f31155136687fbf43e146ccd11625f12316625da192cdb8188f136",
  },
  {
    name: "knowledge",
    copy: esKnowledge,
    namespaces: ["knowledge", "weekly", "approval", "refresh"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "a3a3297006f23628e422ddedfb5b6f5a51c6dd5f6abbc6d6e589481e49915816",
  },
  {
    name: "links",
    copy: esLinks,
    namespaces: [
      "linknet",
      "backlinks",
      "marketplace",
      "backlinkMonitor",
      "backlinkDetails",
      "backlinkRecurring",
    ],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "7b8c4cfd6fb08b518e7e0eb7fd53e767b72972a0048a75521eda0d4b9ebd40d7",
  },
  {
    name: "measurements",
    copy: esMeasurements,
    namespaces: ["analytics", "gsc", "report"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "d5a84c283031ca1ef2c696e427fb9d9327a475370d497840df4293c1c9840cd9",
  },
  {
    name: "outreach",
    copy: esOutreach,
    namespaces: ["outreach", "hook", "anchor"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "c2bfe98eb710f1587237c92b04696e6f9221e67def7d1080eb7ce08e3d1161b4",
  },
  {
    name: "plan screen",
    copy: esPlanScreen,
    namespaces: ["planScreen"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "288f529ed3a18c00623c05011262d3cce0374158e558959fa8fc9dbc63174bb7",
  },
  {
    name: "public beta and demo",
    copy: esPublicBeta,
    namespaces: ["publicBeta"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "e670953b131c40fc4433b5ce6e5b256556bf37ea8709bc495b211efc361fb59e",
  },
  {
    name: "public home",
    copy: esPublicHome,
    namespaces: ["publicHome"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "4e132895babfb222b37e92719be5ad2a8be90d9503869e9df9845b00d982adeb",
  },
  {
    name: "public pricing",
    copy: esPublicPricing,
    namespaces: ["publicPricing"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "4202dd4c670e4a227660092955e20b89d3aa24b792855d72b11264330b325ed6",
  },
  {
    name: "services screen",
    copy: esServicesScreen,
    namespaces: ["servicesScreen"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "c769d10ab21c34754c6c4a6c57c3ee5f04881605b1dabc10030bca0e9122313d",
  },
  {
    name: "setup screen",
    copy: esSetupScreen,
    namespaces: ["setupScreen"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "565b0bcd89f346fd85f3b87d4e44716826a65bee54fd60eaa3b677c4d732a5ca",
  },
  {
    name: "shared UI",
    copy: esSharedUi,
    namespaces: ["sharedUi"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  },
  {
    name: "technical",
    copy: esTechnical,
    namespaces: ["crawl", "gindex", "perf"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "106a19b8ceaf725528ddc9d4de7317d823108425584418d93729346f29c135e6",
  },
  {
    name: "workflow",
    copy: esWorkflow,
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
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "51745ca43f59875396b2251d308f4cff913717c3868a9679f6be5c7fa3e0c35f",
  },
] as const;

export const ES_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...ES_STAGED_BATCHES.map((batch) => batch.copy)),
);
