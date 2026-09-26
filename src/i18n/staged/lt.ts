import { ltAnalyticsScreen } from "./lt-analytics-screen";
import { ltAuditScreen } from "./lt-audit-screen";
import { ltAuthScreen } from "./lt-auth-screen";
import { ltBacklinkDetails } from "./lt-backlink-details";
import { ltBacklinkMonitoring } from "./lt-backlink-monitoring";
import { ltBacklinkRecurring } from "./lt-backlink-recurring";
import { ltBetaGuide } from "./lt-beta-guide";
import { ltBetaScreen } from "./lt-beta-screen";
import { ltBillingScreen } from "./lt-billing-screen";
import { ltCollaboration } from "./lt-collaboration";
import { ltCommerce } from "./lt-commerce";
import { ltConfiguration } from "./lt-configuration";
import { ltConversation } from "./lt-conversation";
import { ltCore } from "./lt-core";
import { ltCoverage } from "./lt-coverage";
import { ltCrawl } from "./lt-crawl";
import { ltGoogleIndex } from "./lt-google-index";
import { ltGrowth } from "./lt-growth";
import { ltPerformance } from "./lt-performance";
import { ltEmailSettings } from "./lt-email-settings";
import { ltNotifications } from "./lt-notifications";
import { ltOutreach } from "./lt-outreach";
import { ltOutreachIntegrity } from "./lt-outreach-integrity";
import { ltTeam } from "./lt-team";
import { ltWorkflowEditor } from "./lt-workflow-editor";
import { ltWorkflowPlan } from "./lt-workflow-plan";
import { ltWorkflowResults } from "./lt-workflow-results";
import { ltEditorScreen } from "./lt-editor-screen";
import { ltEvidence } from "./lt-evidence";
import { ltEvidenceScreen } from "./lt-evidence-screen";
import { ltKnowledge } from "./lt-knowledge";
import { ltLinks } from "./lt-links";
import { ltMeasurements } from "./lt-measurements";
import { ltPlanScreen } from "./lt-plan-screen";
import { ltPublicBeta } from "./lt-public-beta";
import { ltPublicHome } from "./lt-public-home";
import { ltPublicPricing } from "./lt-public-pricing";
import { ltPublicStudies } from "./lt-public-studies";
import { ltServicesScreen } from "./lt-services-screen";
import { ltSetupScreen } from "./lt-setup-screen";
import { ltSharedUi } from "./lt-shared-ui";
import { ltCitationReview } from "./lt-citation-review";
/** Lithuanian authoring in progress; never imported by the runtime catalog. */
export const LT_STAGED_BATCHES = [
  {
    name: "authentication",
    copy: ltAuthScreen,
    namespaces: ["authScreen"],
    sourceRevision: "ff9b085",
    sourceHash: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  },
  {
    name: "shared controls",
    copy: ltSharedUi,
    namespaces: ["sharedUi"],
    sourceRevision: "ff9b085",
    sourceHash: "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  },
  {
    name: "core",
    copy: ltCore,
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
    sourceRevision: "ff9b085",
    sourceHash: "845b2b1ade4a0935ab924dcc4bdc27d72a7a120388740354bd69a697aa1c7ff2",
  },
  {
    name: "setup screen",
    copy: ltSetupScreen,
    namespaces: ["setupScreen"],
    sourceRevision: "ff9b085",
    sourceHash: "565b0bcd89f346fd85f3b87d4e44716826a65bee54fd60eaa3b677c4d732a5ca",
  },
  {
    name: "services screen",
    copy: ltServicesScreen,
    namespaces: ["servicesScreen"],
    sourceRevision: "ff9b085",
    sourceHash: "c769d10ab21c34754c6c4a6c57c3ee5f04881605b1dabc10030bca0e9122313d",
  },
  {
    name: "audit screen",
    copy: ltAuditScreen,
    namespaces: ["auditScreen"],
    sourceRevision: "ff9b085",
    sourceHash: "2c15a7061c169b3f2da7446d4280ff94cb6b5ce2e6cb56d156af72ab154f1aed",
  },
  {
    name: "analytics screen",
    copy: ltAnalyticsScreen,
    namespaces: ["analyticsScreen"],
    sourceRevision: "ff9b085",
    sourceHash: "d86d151031ad82c4dbc559e9816ad14cecaa3e4f1b0de2ff8de3c484de5b02c5",
  },
  {
    name: "billing screen",
    copy: ltBillingScreen,
    namespaces: ["billingScreen"],
    sourceRevision: "ff9b085",
    sourceHash: "d0e701bae4247d1129cc13dd6df6d9b569e725edbf5136255b68ca3fb2307194",
  },
  {
    name: "evidence screen",
    copy: ltEvidenceScreen,
    namespaces: ["evidenceScreen"],
    sourceRevision: "ff9b085",
    sourceHash: "2c7e9ccb48b02cd12911d0df6c31a96ec8ddfc6c558dfda3b3e14790d156c136",
  },
  {
    name: "plan screen",
    copy: ltPlanScreen,
    namespaces: ["planScreen"],
    sourceRevision: "ff9b085",
    sourceHash: "288f529ed3a18c00623c05011262d3cce0374158e558959fa8fc9dbc63174bb7",
  },
  {
    name: "editor screen",
    copy: ltEditorScreen,
    namespaces: ["editorScreen"],
    sourceRevision: "ff9b085",
    sourceHash: "1e827d2744ea1f2d3364b54983f06b42082f45ab6dfb0eda7b1375fdddd9ec9f",
  },
  {
    name: "public pricing",
    copy: ltPublicPricing,
    namespaces: ["publicPricing"],
    sourceRevision: "ff9b085",
    sourceHash: "8e7cecc9d6ca14af722fe8b4131d7982241e9e856335586f8d4e724469d0de60",
  },
  {
    name: "public studies",
    copy: ltPublicStudies,
    namespaces: ["publicStudies"],
    sourceRevision: "ff9b085",
    sourceHash: "ace563fb757a52abcd667e7e691d3e48024045a4e4f265e6949c66a828f5e8de",
  },
  {
    name: "public home",
    copy: ltPublicHome,
    namespaces: ["publicHome"],
    sourceRevision: "ff9b085",
    sourceHash: "09e34a037936057698a84cecda0fb297d2fe94c43288d416ab04efcef466f384",
  },
  {
    name: "beta screen",
    copy: ltBetaScreen,
    namespaces: ["betaScreen"],
    sourceRevision: "ff9b085",
    sourceHash: "c4dcf4827cb49219199aab22d2969e33f643ade8a8c2c348bb899d61f3a08119",
  },
  {
    name: "public beta",
    copy: ltPublicBeta,
    namespaces: ["publicBeta"],
    sourceRevision: "ff9b085",
    sourceHash: "e670953b131c40fc4433b5ce6e5b256556bf37ea8709bc495b211efc361fb59e",
  },
  {
    name: "beta guidance",
    copy: ltBetaGuide,
    namespaces: ["betaGuide"],
    sourceRevision: "ff9b085",
    sourceHash: "8c815e10a73590a6e2911d1b5618d5d545c15a47b3a75462ccaaae6faf33520d",
  },
  {
    name: "collaboration",
    // Authored per English source file; one batch keeps the shared reviewed fingerprint.
    copy: { ...ltCollaboration, ...ltTeam, ...ltNotifications, ...ltEmailSettings },
    namespaces: ["collaboration", "team", "notifications", "awareness", "emailSettings"],
    sourceRevision: "ff9b085",
    sourceHash: "66e659da6d8b879af77aef68c0bba3717cb793240da5ae2364a93212f16bd83f",
  },
  {
    name: "knowledge",
    copy: ltKnowledge,
    namespaces: ["knowledge", "weekly", "approval", "refresh"],
    sourceRevision: "ff9b085",
    sourceHash: "a3a3297006f23628e422ddedfb5b6f5a51c6dd5f6abbc6d6e589481e49915816",
  },
  {
    name: "technical",
    copy: { ...ltCrawl, ...ltGoogleIndex, ...ltPerformance },
    namespaces: ["crawl", "gindex", "perf"],
    sourceRevision: "ff9b085",
    sourceHash: "106a19b8ceaf725528ddc9d4de7317d823108425584418d93729346f29c135e6",
  },
  {
    name: "measurements",
    copy: ltMeasurements,
    namespaces: ["analytics", "gsc", "report"],
    sourceRevision: "ff9b085",
    sourceHash: "216126da773525ef913fe7e10a4db7af57539ea07dae497fd349051da3088395",
  },
  {
    name: "outreach",
    copy: { ...ltOutreach, ...ltOutreachIntegrity },
    namespaces: ["outreach", "hook", "anchor"],
    sourceRevision: "ff9b085",
    sourceHash: "c2bfe98eb710f1587237c92b04696e6f9221e67def7d1080eb7ce08e3d1161b4",
  },
  {
    name: "growth",
    copy: ltGrowth,
    namespaces: ["authority", "actions", "publicAudit"],
    sourceRevision: "ff9b085",
    sourceHash: "79460ac604f31155136687fbf43e146ccd11625f12316625da192cdb8188f136",
  },
  {
    name: "commerce",
    copy: ltCommerce,
    namespaces: ["billing", "launch", "beta"],
    sourceRevision: "ff9b085",
    sourceHash: "6cd0596e8ff09ae38f9decb763ab31a3fe2c311109c9b5f85edc9721d7058ff2",
  },
  {
    name: "links",
    copy: {
      ...ltLinks,
      ...ltBacklinkMonitoring,
      ...ltBacklinkDetails,
      ...ltBacklinkRecurring,
    },
    namespaces: [
      "linknet",
      "backlinks",
      "marketplace",
      "backlinkMonitor",
      "backlinkDetails",
      "backlinkRecurring",
    ],
    sourceRevision: "ff9b085",
    sourceHash: "7b8c4cfd6fb08b518e7e0eb7fd53e767b72972a0048a75521eda0d4b9ebd40d7",
  },
  {
    name: "evidence",
    copy: ltEvidence,
    namespaces: ["answer", "logs", "proof", "aiEval", "benchmark"],
    sourceRevision: "ff9b085",
    sourceHash: "2911f87d7691a2bf04548e0b7c0e63b3c93f25cdcd73c9af1ba5d22ffdee211d",
  },
  {
    name: "workflow",
    copy: { ...ltWorkflowEditor, ...ltWorkflowPlan, ...ltWorkflowResults },
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
    sourceRevision: "ff9b085",
    sourceHash: "649e9d723e890e3a356652ad7a515080081167e2d06a4dc5d3ad58cc5e2b6615",
  },
  {
    name: "configuration",
    copy: { ...ltConfiguration, ...ltCoverage },
    namespaces: ["brand", "wp", "shopify", "claude", "connect", "connections", "coverage"],
    sourceRevision: "ff9b085",
    sourceHash: "0e11ebfcac212ec85d91c8734430e0cd661dc727057c565c1cfcd33f59a1aa60",
  },
  {
    name: "conversation",
    copy: ltConversation,
    namespaces: ["chat"],
    sourceRevision: "account conversations candidate after ff9b085",
    sourceHash: "d37f66e7435e11e49b2e69c75ace0f494c1d288b7c4e4b1d3f3c110a1274649b",
  },
  {
    name: "citation review",
    copy: ltCitationReview,
    namespaces: ["citationReview"],
    sourceRevision: "P4 citation review candidate after bab861c8",
    sourceHash: "d41949f7901f0d37b4debab152a406f238c34273ed422fe230df34ff41dcb151",
  },
] as const;
export const LT_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...LT_STAGED_BATCHES.map((batch) => batch.copy)),
);
