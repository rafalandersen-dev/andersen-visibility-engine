import { elConversation } from "./el-conversation";
import { elWorkflow } from "./el-workflow";
import { elEvidence } from "./el-evidence";
import { elLinks } from "./el-links";
import { elCommerce } from "./el-commerce";
import { elGrowth } from "./el-growth";
import { elOutreach } from "./el-outreach";
import { elMeasurements } from "./el-measurements";
import { elTechnical } from "./el-technical";
import { elKnowledge } from "./el-knowledge";
import { elCollaboration } from "./el-collaboration";
import { elConfiguration } from "./el-configuration";
import { elPublicBeta } from "./el-public-beta";
import { elBetaGuide } from "./el-beta-guide";
import { elBetaScreen } from "./el-beta-screen";
import { elPublicHome } from "./el-public-home";
import { elPublicPricing } from "./el-public-pricing";
import { elPublicStudies } from "./el-public-studies";
import { elEditorScreen } from "./el-editor-screen";
import { elPlanScreen } from "./el-plan-screen";
import { elEvidenceScreen } from "./el-evidence-screen";
import { elSetupScreen } from "./el-setup-screen";
import { elServicesScreen } from "./el-services-screen";
import { elAuditScreen } from "./el-audit-screen";
import { elAnalyticsScreen } from "./el-analytics-screen";
import { elBillingScreen } from "./el-billing-screen";
import { elAuthScreen } from "./el-auth-screen";
import { elSharedUi } from "./el-shared-ui";
import { elCore } from "./el-core";
import { elCitationReview } from "./el-citation-review";
import { elCitationAuthoring } from "./el-citation-authoring";
import { elCitationForward } from "./el-citation-forward";
import { elCitationChange } from "./el-citation-change";
/** Greek authoring; never imported by the runtime catalog. */
export const EL_STAGED_BATCHES = [
  {
    name: "conversation",
    copy: elConversation,
    namespaces: ["chat"],
    sourceRevision: "metadata proposal candidate after eb971e8",
    sourceHash: "d37f66e7435e11e49b2e69c75ace0f494c1d288b7c4e4b1d3f3c110a1274649b",
  },
  {
    name: "workflow",
    copy: elWorkflow,
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
    sourceRevision: "f0d1d3a",
    sourceHash: "d09e361f8affe1c2ee3903432c21b1e6453dcd4b99a9996658ec1ec14989ee70",
  },
  {
    name: "evidence",
    copy: elEvidence,
    namespaces: ["answer", "logs", "proof", "aiEval", "benchmark"],
    sourceRevision: "21f2898",
    sourceHash: "1f9a2a7eea39cee7f70dfc8fa256ee24b64223a0743142ff8894fbde7cdbb2f5",
  },
  {
    name: "links",
    copy: elLinks,
    namespaces: [
      "linknet",
      "backlinks",
      "marketplace",
      "backlinkMonitor",
      "backlinkDetails",
      "backlinkRecurring",
    ],
    sourceRevision: "85a85fa",
    sourceHash: "7b8c4cfd6fb08b518e7e0eb7fd53e767b72972a0048a75521eda0d4b9ebd40d7",
  },
  {
    name: "commerce",
    copy: elCommerce,
    namespaces: ["billing", "launch", "beta"],
    sourceRevision: "fbd1e97",
    sourceHash: "6cd0596e8ff09ae38f9decb763ab31a3fe2c311109c9b5f85edc9721d7058ff2",
  },
  {
    name: "growth",
    copy: elGrowth,
    namespaces: ["authority", "actions", "publicAudit"],
    sourceRevision: "92ce7b4",
    sourceHash: "79460ac604f31155136687fbf43e146ccd11625f12316625da192cdb8188f136",
  },
  {
    name: "outreach",
    copy: elOutreach,
    namespaces: ["outreach", "hook", "anchor"],
    sourceRevision: "b68c89e",
    sourceHash: "c2bfe98eb710f1587237c92b04696e6f9221e67def7d1080eb7ce08e3d1161b4",
  },
  {
    name: "measurements",
    copy: elMeasurements,
    namespaces: ["analytics", "gsc", "report"],
    sourceRevision: "a6b4745",
    sourceHash: "216126da773525ef913fe7e10a4db7af57539ea07dae497fd349051da3088395",
  },
  {
    name: "technical",
    copy: elTechnical,
    namespaces: ["crawl", "gindex", "perf"],
    sourceRevision: "312e0a7",
    sourceHash: "106a19b8ceaf725528ddc9d4de7317d823108425584418d93729346f29c135e6",
  },
  {
    name: "knowledge",
    copy: elKnowledge,
    namespaces: ["knowledge", "weekly", "approval", "refresh"],
    sourceRevision: "f258853",
    sourceHash: "78a4fd67fd0f878a2a05f99de85ce989e7d57ac84e9abdb74a4bf8e6f4a0ae9d",
  },
  {
    name: "collaboration",
    copy: elCollaboration,
    namespaces: ["collaboration", "team", "notifications", "awareness", "emailSettings"],
    sourceRevision: "fe63887",
    sourceHash: "66e659da6d8b879af77aef68c0bba3717cb793240da5ae2364a93212f16bd83f",
  },
  {
    name: "configuration",
    copy: elConfiguration,
    namespaces: ["brand", "wp", "shopify", "claude", "connect", "connections", "coverage"],
    sourceRevision: "341b208",
    sourceHash: "c60d43a37be661079475896eeebe2c3cd1337a321e05df01b27a0e803ac823cc",
  },
  {
    name: "public beta",
    copy: elPublicBeta,
    namespaces: ["publicBeta"],
    sourceRevision: "de5089f",
    sourceHash: "e670953b131c40fc4433b5ce6e5b256556bf37ea8709bc495b211efc361fb59e",
  },
  {
    name: "beta guidance",
    copy: elBetaGuide,
    namespaces: ["betaGuide"],
    sourceRevision: "e2b8358",
    sourceHash: "8c815e10a73590a6e2911d1b5618d5d545c15a47b3a75462ccaaae6faf33520d",
  },
  {
    name: "beta screen",
    copy: elBetaScreen,
    namespaces: ["betaScreen"],
    sourceRevision: "fee1eff",
    sourceHash: "c4dcf4827cb49219199aab22d2969e33f643ade8a8c2c348bb899d61f3a08119",
  },
  {
    name: "public home",
    copy: elPublicHome,
    namespaces: ["publicHome"],
    sourceRevision: "4a844ff",
    sourceHash: "09e34a037936057698a84cecda0fb297d2fe94c43288d416ab04efcef466f384",
  },
  {
    name: "public pricing",
    copy: elPublicPricing,
    namespaces: ["publicPricing"],
    sourceRevision: "1435f84",
    sourceHash: "8e7cecc9d6ca14af722fe8b4131d7982241e9e856335586f8d4e724469d0de60",
  },
  {
    name: "public studies",
    copy: elPublicStudies,
    namespaces: ["publicStudies"],
    sourceRevision: "1435f84",
    sourceHash: "ace563fb757a52abcd667e7e691d3e48024045a4e4f265e6949c66a828f5e8de",
  },
  {
    name: "editor screen",
    copy: elEditorScreen,
    namespaces: ["editorScreen"],
    sourceRevision: "47bc368",
    sourceHash: "1e827d2744ea1f2d3364b54983f06b42082f45ab6dfb0eda7b1375fdddd9ec9f",
  },
  {
    name: "plan screen",
    copy: elPlanScreen,
    namespaces: ["planScreen"],
    sourceRevision: "2880b96",
    sourceHash: "2bbe51606245c7a6fa86d34f4c932c7ecb9ac0332b116270fff96c3c8e5175c4",
  },
  {
    name: "evidence screen",
    copy: elEvidenceScreen,
    namespaces: ["evidenceScreen"],
    sourceRevision: "51a2a9f",
    sourceHash: "2c7e9ccb48b02cd12911d0df6c31a96ec8ddfc6c558dfda3b3e14790d156c136",
  },
  {
    name: "setup screen",
    copy: elSetupScreen,
    namespaces: ["setupScreen"],
    sourceRevision: "57b6fe5",
    sourceHash: "565b0bcd89f346fd85f3b87d4e44716826a65bee54fd60eaa3b677c4d732a5ca",
  },
  {
    name: "services screen",
    copy: elServicesScreen,
    namespaces: ["servicesScreen"],
    sourceRevision: "57b6fe5",
    sourceHash: "c769d10ab21c34754c6c4a6c57c3ee5f04881605b1dabc10030bca0e9122313d",
  },
  {
    name: "audit screen",
    copy: elAuditScreen,
    namespaces: ["auditScreen"],
    sourceRevision: "57b6fe5",
    sourceHash: "2c15a7061c169b3f2da7446d4280ff94cb6b5ce2e6cb56d156af72ab154f1aed",
  },
  {
    name: "analytics screen",
    copy: elAnalyticsScreen,
    namespaces: ["analyticsScreen"],
    sourceRevision: "57b6fe5",
    sourceHash: "d86d151031ad82c4dbc559e9816ad14cecaa3e4f1b0de2ff8de3c484de5b02c5",
  },
  {
    name: "billing screen",
    copy: elBillingScreen,
    namespaces: ["billingScreen"],
    sourceRevision: "57b6fe5",
    sourceHash: "d0e701bae4247d1129cc13dd6df6d9b569e725edbf5136255b68ca3fb2307194",
  },
  {
    name: "authentication",
    copy: elAuthScreen,
    namespaces: ["authScreen"],
    sourceRevision: "73e6880",
    sourceHash: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  },
  {
    name: "shared controls",
    copy: elSharedUi,
    namespaces: ["sharedUi"],
    sourceRevision: "73e6880",
    sourceHash: "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  },
  {
    name: "core",
    copy: elCore,
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
    sourceRevision: "73e6880",
    sourceHash: "8476f0a4138861b0b333d132799933037eda17dbd2d1ba4207b7cc4e0c9337d1",
  },
  {
    name: "citation review",
    copy: elCitationReview,
    namespaces: ["citationReview"],
    sourceRevision: "P4 citation review candidate after bab861c8",
    sourceHash: "6320ed498d4ce0af5c43d77d46109f8e85cffeebb25d64f16d815eb2332beae4",
  },
  {
    name: "citation authoring",
    copy: elCitationAuthoring,
    namespaces: ["citationAuthoring"],
    sourceRevision: "citation owner authoring candidate after a392775c",
    sourceHash: "ffb6a332b8756b5467c8e06e740b9829d118f7c6112240a88046298922055c2a",
  },
  {
    name: "citation forward",
    copy: elCitationForward,
    namespaces: ["citationForward"],
    sourceRevision: "citation forward workflow candidate after 64db7a4b (Codex N1 corrections)",
    sourceHash: "692652100abfecf97689fd04a6f508d7d66db62417cfd2cfc3dc6f2adf8fcb70",
  },
  {
    name: "citation change",
    copy: elCitationChange,
    namespaces: ["citationChange"],
    sourceRevision: "citation change evidence candidate 20260928120000 (R/R1/R2)",
    sourceHash: "576b6f207594745c1c3e082e0bba5d773318eb96241d4d5cf18187b680cdc2d5",
  },
] as const;
export const EL_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...EL_STAGED_BATCHES.map((batch) => batch.copy)),
);
