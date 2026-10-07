import { mtAnalyticsScreen } from "./mt-analytics-screen";
import { mtAuditScreen } from "./mt-audit-screen";
import { mtAuthScreen } from "./mt-auth-screen";
import { mtBacklinkDetails } from "./mt-backlink-details";
import { mtBacklinkMonitoring } from "./mt-backlink-monitoring";
import { mtBacklinkRecurring } from "./mt-backlink-recurring";
import { mtBetaGuide } from "./mt-beta-guide";
import { mtBetaScreen } from "./mt-beta-screen";
import { mtBillingScreen } from "./mt-billing-screen";
import { mtCollaboration } from "./mt-collaboration";
import { mtCommerce } from "./mt-commerce";
import { mtConfiguration } from "./mt-configuration";
import { mtConversation } from "./mt-conversation";
import { mtCore } from "./mt-core";
import { mtCoverage } from "./mt-coverage";
import { mtCrawl } from "./mt-crawl";
import { mtEditorScreen } from "./mt-editor-screen";
import { mtEmailSettings } from "./mt-email-settings";
import { mtEvidence } from "./mt-evidence";
import { mtEvidenceScreen } from "./mt-evidence-screen";
import { mtGoogleIndex } from "./mt-google-index";
import { mtGrowth } from "./mt-growth";
import { mtKnowledge } from "./mt-knowledge";
import { mtLinks } from "./mt-links";
import { mtMeasurements } from "./mt-measurements";
import { mtNotifications } from "./mt-notifications";
import { mtOutreach } from "./mt-outreach";
import { mtOutreachIntegrity } from "./mt-outreach-integrity";
import { mtPerformance } from "./mt-performance";
import { mtPlanScreen } from "./mt-plan-screen";
import { mtPublicBeta } from "./mt-public-beta";
import { mtPublicHome } from "./mt-public-home";
import { mtPublicPricing } from "./mt-public-pricing";
import { mtPublicStudies } from "./mt-public-studies";
import { mtServicesScreen } from "./mt-services-screen";
import { mtSetupScreen } from "./mt-setup-screen";
import { mtSharedUi } from "./mt-shared-ui";
import { mtTeam } from "./mt-team";
import { mtWorkflowEditor } from "./mt-workflow-editor";
import { mtWorkflowPlan } from "./mt-workflow-plan";
import { mtWorkflowResults } from "./mt-workflow-results";
import { mtCitationReview } from "./mt-citation-review";
import { mtCitationAuthoring } from "./mt-citation-authoring";
import { mtCitationForward } from "./mt-citation-forward";
import { mtCitationChange } from "./mt-citation-change";
/** Maltese authoring in progress; never imported by the runtime catalog. */
export const MT_STAGED_BATCHES = [
  {
    name: "authentication",
    copy: mtAuthScreen,
    namespaces: ["authScreen"],
    sourceRevision: "ff9b085",
    sourceHash: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  },
  {
    name: "shared controls",
    copy: mtSharedUi,
    namespaces: ["sharedUi"],
    sourceRevision: "ff9b085",
    sourceHash: "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  },
  {
    name: "core",
    copy: mtCore,
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
    sourceHash: "8476f0a4138861b0b333d132799933037eda17dbd2d1ba4207b7cc4e0c9337d1",
  },
  {
    name: "setup screen",
    copy: mtSetupScreen,
    namespaces: ["setupScreen"],
    sourceRevision: "ff9b085",
    sourceHash: "565b0bcd89f346fd85f3b87d4e44716826a65bee54fd60eaa3b677c4d732a5ca",
  },
  {
    name: "services screen",
    copy: mtServicesScreen,
    namespaces: ["servicesScreen"],
    sourceRevision: "ff9b085",
    sourceHash: "c769d10ab21c34754c6c4a6c57c3ee5f04881605b1dabc10030bca0e9122313d",
  },
  {
    name: "audit screen",
    copy: mtAuditScreen,
    namespaces: ["auditScreen"],
    sourceRevision: "ff9b085",
    sourceHash: "2c15a7061c169b3f2da7446d4280ff94cb6b5ce2e6cb56d156af72ab154f1aed",
  },
  {
    name: "analytics screen",
    copy: mtAnalyticsScreen,
    namespaces: ["analyticsScreen"],
    sourceRevision: "ff9b085",
    sourceHash: "d86d151031ad82c4dbc559e9816ad14cecaa3e4f1b0de2ff8de3c484de5b02c5",
  },
  {
    name: "billing screen",
    copy: mtBillingScreen,
    namespaces: ["billingScreen"],
    sourceRevision: "ff9b085",
    sourceHash: "d0e701bae4247d1129cc13dd6df6d9b569e725edbf5136255b68ca3fb2307194",
  },
  {
    name: "evidence screen",
    copy: mtEvidenceScreen,
    namespaces: ["evidenceScreen"],
    sourceRevision: "ff9b085",
    sourceHash: "2c7e9ccb48b02cd12911d0df6c31a96ec8ddfc6c558dfda3b3e14790d156c136",
  },
  {
    name: "plan screen",
    copy: mtPlanScreen,
    namespaces: ["planScreen"],
    sourceRevision: "ff9b085",
    sourceHash: "2bbe51606245c7a6fa86d34f4c932c7ecb9ac0332b116270fff96c3c8e5175c4",
  },
  {
    name: "editor screen",
    copy: mtEditorScreen,
    namespaces: ["editorScreen"],
    sourceRevision: "ff9b085",
    sourceHash: "1e827d2744ea1f2d3364b54983f06b42082f45ab6dfb0eda7b1375fdddd9ec9f",
  },
  {
    name: "public pricing",
    copy: mtPublicPricing,
    namespaces: ["publicPricing"],
    sourceRevision: "ff9b085",
    sourceHash: "8e7cecc9d6ca14af722fe8b4131d7982241e9e856335586f8d4e724469d0de60",
  },
  {
    name: "public studies",
    copy: mtPublicStudies,
    namespaces: ["publicStudies"],
    sourceRevision: "ff9b085",
    sourceHash: "ace563fb757a52abcd667e7e691d3e48024045a4e4f265e6949c66a828f5e8de",
  },
  {
    name: "public home",
    copy: mtPublicHome,
    namespaces: ["publicHome"],
    sourceRevision: "ff9b085",
    sourceHash: "09e34a037936057698a84cecda0fb297d2fe94c43288d416ab04efcef466f384",
  },
  {
    name: "beta screen",
    copy: mtBetaScreen,
    namespaces: ["betaScreen"],
    sourceRevision: "ff9b085",
    sourceHash: "c4dcf4827cb49219199aab22d2969e33f643ade8a8c2c348bb899d61f3a08119",
  },
  {
    name: "public beta",
    copy: mtPublicBeta,
    namespaces: ["publicBeta"],
    sourceRevision: "ff9b085",
    sourceHash: "e670953b131c40fc4433b5ce6e5b256556bf37ea8709bc495b211efc361fb59e",
  },
  {
    name: "beta guidance",
    copy: mtBetaGuide,
    namespaces: ["betaGuide"],
    sourceRevision: "ff9b085",
    sourceHash: "8c815e10a73590a6e2911d1b5618d5d545c15a47b3a75462ccaaae6faf33520d",
  },
  {
    name: "collaboration",
    // Authored per English source file; one batch keeps the shared reviewed fingerprint.
    copy: { ...mtCollaboration, ...mtTeam, ...mtNotifications, ...mtEmailSettings },
    namespaces: ["collaboration", "team", "notifications", "awareness", "emailSettings"],
    sourceRevision: "ff9b085",
    sourceHash: "66e659da6d8b879af77aef68c0bba3717cb793240da5ae2364a93212f16bd83f",
  },
  {
    name: "knowledge",
    copy: mtKnowledge,
    namespaces: ["knowledge", "weekly", "approval", "refresh"],
    sourceRevision: "ff9b085",
    sourceHash: "c3e618b7a0da63afa9cb94ee232e917d78e2c7704c84d99659ac0112474dd13a",
  },
  {
    name: "technical",
    copy: { ...mtCrawl, ...mtGoogleIndex, ...mtPerformance },
    namespaces: ["crawl", "gindex", "perf"],
    sourceRevision: "ff9b085",
    sourceHash: "106a19b8ceaf725528ddc9d4de7317d823108425584418d93729346f29c135e6",
  },
  {
    name: "measurements",
    copy: mtMeasurements,
    namespaces: ["analytics", "gsc", "report"],
    sourceRevision: "ff9b085",
    sourceHash: "216126da773525ef913fe7e10a4db7af57539ea07dae497fd349051da3088395",
  },
  {
    name: "outreach",
    copy: { ...mtOutreach, ...mtOutreachIntegrity },
    namespaces: ["outreach", "hook", "anchor"],
    sourceRevision: "ff9b085",
    sourceHash: "c2bfe98eb710f1587237c92b04696e6f9221e67def7d1080eb7ce08e3d1161b4",
  },
  {
    name: "growth",
    copy: mtGrowth,
    namespaces: ["authority", "actions", "publicAudit"],
    sourceRevision: "ff9b085",
    sourceHash: "79460ac604f31155136687fbf43e146ccd11625f12316625da192cdb8188f136",
  },
  {
    name: "commerce",
    copy: mtCommerce,
    namespaces: ["billing", "launch", "beta"],
    sourceRevision: "ff9b085",
    sourceHash: "6cd0596e8ff09ae38f9decb763ab31a3fe2c311109c9b5f85edc9721d7058ff2",
  },
  {
    name: "links",
    copy: {
      ...mtLinks,
      ...mtBacklinkMonitoring,
      ...mtBacklinkDetails,
      ...mtBacklinkRecurring,
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
    copy: mtEvidence,
    namespaces: ["answer", "logs", "proof", "aiEval", "benchmark"],
    sourceRevision: "ff9b085",
    sourceHash: "1f9a2a7eea39cee7f70dfc8fa256ee24b64223a0743142ff8894fbde7cdbb2f5",
  },
  {
    name: "workflow",
    copy: { ...mtWorkflowEditor, ...mtWorkflowPlan, ...mtWorkflowResults },
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
    sourceHash: "d09e361f8affe1c2ee3903432c21b1e6453dcd4b99a9996658ec1ec14989ee70",
  },
  {
    name: "configuration",
    copy: { ...mtConfiguration, ...mtCoverage },
    namespaces: ["brand", "wp", "shopify", "claude", "connect", "connections", "coverage"],
    sourceRevision: "ff9b085",
    sourceHash: "c7a21405a0e079bfafbf14747dfad84b284e717e035127aaf77bae98d6583413",
  },
  {
    name: "conversation",
    copy: mtConversation,
    namespaces: ["chat"],
    sourceRevision: "account conversations candidate after ff9b085",
    sourceHash: "d37f66e7435e11e49b2e69c75ace0f494c1d288b7c4e4b1d3f3c110a1274649b",
  },
  {
    name: "citation review",
    copy: mtCitationReview,
    namespaces: ["citationReview"],
    sourceRevision: "P4 citation review candidate after bab861c8",
    sourceHash: "6320ed498d4ce0af5c43d77d46109f8e85cffeebb25d64f16d815eb2332beae4",
  },
  {
    name: "citation authoring",
    copy: mtCitationAuthoring,
    namespaces: ["citationAuthoring"],
    sourceRevision: "citation owner authoring candidate after a392775c",
    sourceHash: "ffb6a332b8756b5467c8e06e740b9829d118f7c6112240a88046298922055c2a",
  },
  {
    name: "citation forward",
    copy: mtCitationForward,
    namespaces: ["citationForward"],
    sourceRevision: "citation forward workflow candidate after 64db7a4b (Codex N1 corrections)",
    sourceHash: "692652100abfecf97689fd04a6f508d7d66db62417cfd2cfc3dc6f2adf8fcb70",
  },
  {
    name: "citation change",
    copy: mtCitationChange,
    namespaces: ["citationChange"],
    sourceRevision: "citation change evidence candidate 20260928120000 (R/R1/R2)",
    sourceHash: "576b6f207594745c1c3e082e0bba5d773318eb96241d4d5cf18187b680cdc2d5",
  },
] as const;
export const MT_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...MT_STAGED_BATCHES.map((batch) => batch.copy)),
);
