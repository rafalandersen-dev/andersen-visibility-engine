import { csBetaGuidance } from "./cs-beta-guidance";
import { csBetaScreen } from "./cs-beta-screen";
import { csPublicHome } from "./cs-public-home";
import { csPublicStudies } from "./cs-public-studies";
import { csPublicPricing } from "./cs-public-pricing";
import { csEditorScreen } from "./cs-editor-screen";
import { csPlanScreen } from "./cs-plan-screen";
import { csEvidenceScreen } from "./cs-evidence-screen";
import { csBillingScreen } from "./cs-billing-screen";
import { csAnalyticsScreen } from "./cs-analytics-screen";
import { csAuditScreen } from "./cs-audit-screen";
import { csServicesScreen } from "./cs-services-screen";
import { csSetupScreen } from "./cs-setup-screen";
import { csCore } from "./cs-core";
import { csAuthScreen } from "./cs-auth-screen";
import { csSharedUi } from "./cs-shared-ui";
/** Czech authoring; never imported by the runtime catalog. */
export const CS_STAGED_BATCHES = [
  {
    name: "beta guidance",
    copy: csBetaGuidance,
    namespaces: ["betaGuide"],
    sourceRevision: "cf9c004",
    sourceHash: "8c815e10a73590a6e2911d1b5618d5d545c15a47b3a75462ccaaae6faf33520d",
  },
  {
    name: "beta screen",
    copy: csBetaScreen,
    namespaces: ["betaScreen"],
    sourceRevision: "f462e40",
    sourceHash: "c4dcf4827cb49219199aab22d2969e33f643ade8a8c2c348bb899d61f3a08119",
  },
  {
    name: "public home",
    copy: csPublicHome,
    namespaces: ["publicHome"],
    sourceRevision: "b9e714e",
    sourceHash: "2855ce0efcce2fc714afc7f61a15d64ed5975809acefb98df75a3e275ccae141",
  },
  {
    name: "public studies",
    copy: csPublicStudies,
    namespaces: ["publicStudies"],
    sourceRevision: "77f6ac6",
    sourceHash: "ace563fb757a52abcd667e7e691d3e48024045a4e4f265e6949c66a828f5e8de",
  },
  {
    name: "public pricing",
    copy: csPublicPricing,
    namespaces: ["publicPricing"],
    sourceRevision: "77f6ac6",
    sourceHash: "8e7cecc9d6ca14af722fe8b4131d7982241e9e856335586f8d4e724469d0de60",
  },
  {
    name: "editor screen",
    copy: csEditorScreen,
    namespaces: ["editorScreen"],
    sourceRevision: "7b7c947",
    sourceHash: "1e827d2744ea1f2d3364b54983f06b42082f45ab6dfb0eda7b1375fdddd9ec9f",
  },
  {
    name: "plan screen",
    copy: csPlanScreen,
    namespaces: ["planScreen"],
    sourceRevision: "eca937a",
    sourceHash: "288f529ed3a18c00623c05011262d3cce0374158e558959fa8fc9dbc63174bb7",
  },
  {
    name: "evidence screen",
    copy: csEvidenceScreen,
    namespaces: ["evidenceScreen"],
    sourceRevision: "7da1abf",
    sourceHash: "2c7e9ccb48b02cd12911d0df6c31a96ec8ddfc6c558dfda3b3e14790d156c136",
  },
  {
    name: "billing screen",
    copy: csBillingScreen,
    namespaces: ["billingScreen"],
    sourceRevision: "0dd4047",
    sourceHash: "d0e701bae4247d1129cc13dd6df6d9b569e725edbf5136255b68ca3fb2307194",
  },
  {
    name: "analytics screen",
    copy: csAnalyticsScreen,
    namespaces: ["analyticsScreen"],
    sourceRevision: "0dd4047",
    sourceHash: "d86d151031ad82c4dbc559e9816ad14cecaa3e4f1b0de2ff8de3c484de5b02c5",
  },
  {
    name: "audit screen",
    copy: csAuditScreen,
    namespaces: ["auditScreen"],
    sourceRevision: "2028903",
    sourceHash: "2c15a7061c169b3f2da7446d4280ff94cb6b5ce2e6cb56d156af72ab154f1aed",
  },
  {
    name: "services screen",
    copy: csServicesScreen,
    namespaces: ["servicesScreen"],
    sourceRevision: "2028903",
    sourceHash: "c769d10ab21c34754c6c4a6c57c3ee5f04881605b1dabc10030bca0e9122313d",
  },
  {
    name: "setup screen",
    copy: csSetupScreen,
    namespaces: ["setupScreen"],
    sourceRevision: "2028903",
    sourceHash: "565b0bcd89f346fd85f3b87d4e44716826a65bee54fd60eaa3b677c4d732a5ca",
  },
  {
    name: "core",
    copy: csCore,
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
    sourceRevision: "f01c604",
    sourceHash: "845b2b1ade4a0935ab924dcc4bdc27d72a7a120388740354bd69a697aa1c7ff2",
  },
  {
    name: "authentication",
    copy: csAuthScreen,
    namespaces: ["authScreen"],
    sourceRevision: "78cd575",
    sourceHash: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  },
  {
    name: "shared controls",
    copy: csSharedUi,
    namespaces: ["sharedUi"],
    sourceRevision: "78cd575",
    sourceHash: "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  },
] as const;
export const CS_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...CS_STAGED_BATCHES.map((batch) => batch.copy)),
);
