import { etPublicPricing } from "./et-public-pricing";
import { etPublicHome } from "./et-public-home";
import { etPublicStudies } from "./et-public-studies";
import { etAnalyticsScreen } from "./et-analytics-screen";
import { etEvidenceScreen } from "./et-evidence-screen";
import { etPlanScreen } from "./et-plan-screen";
import { etEditorScreen } from "./et-editor-screen";
import { etBillingScreen } from "./et-billing-screen";
import { etSetupScreen } from "./et-setup-screen";
import { etServicesScreen } from "./et-services-screen";
import { etAuditScreen } from "./et-audit-screen";
import { etAuthScreen } from "./et-auth-screen";
import { etSharedUi } from "./et-shared-ui";
import { etCore } from "./et-core";
/** Estonian authoring; never imported by the runtime catalog. */
export const ET_STAGED_BATCHES = [
  {
    name: "public home",
    copy: etPublicHome,
    namespaces: ["publicHome"],
    sourceRevision: "7555b58",
    sourceHash: "2855ce0efcce2fc714afc7f61a15d64ed5975809acefb98df75a3e275ccae141",
  },
  {
    name: "public pricing",
    copy: etPublicPricing,
    namespaces: ["publicPricing"],
    sourceRevision: "316fc14",
    sourceHash: "8e7cecc9d6ca14af722fe8b4131d7982241e9e856335586f8d4e724469d0de60",
  },
  {
    name: "public studies",
    copy: etPublicStudies,
    namespaces: ["publicStudies"],
    sourceRevision: "316fc14",
    sourceHash: "ace563fb757a52abcd667e7e691d3e48024045a4e4f265e6949c66a828f5e8de",
  },
  {
    name: "editor screen",
    copy: etEditorScreen,
    namespaces: ["editorScreen"],
    sourceRevision: "a6a6b23",
    sourceHash: "1e827d2744ea1f2d3364b54983f06b42082f45ab6dfb0eda7b1375fdddd9ec9f",
  },
  {
    name: "plan screen",
    copy: etPlanScreen,
    namespaces: ["planScreen"],
    sourceRevision: "2cd6e0b",
    sourceHash: "288f529ed3a18c00623c05011262d3cce0374158e558959fa8fc9dbc63174bb7",
  },
  {
    name: "evidence screen",
    copy: etEvidenceScreen,
    namespaces: ["evidenceScreen"],
    sourceRevision: "46938bc",
    sourceHash: "2c7e9ccb48b02cd12911d0df6c31a96ec8ddfc6c558dfda3b3e14790d156c136",
  },
  {
    name: "analytics screen",
    copy: etAnalyticsScreen,
    namespaces: ["analyticsScreen"],
    sourceRevision: "afb3a89",
    sourceHash: "d86d151031ad82c4dbc559e9816ad14cecaa3e4f1b0de2ff8de3c484de5b02c5",
  },
  {
    name: "billing screen",
    copy: etBillingScreen,
    namespaces: ["billingScreen"],
    sourceRevision: "afb3a89",
    sourceHash: "d0e701bae4247d1129cc13dd6df6d9b569e725edbf5136255b68ca3fb2307194",
  },
  {
    name: "setup screen",
    copy: etSetupScreen,
    namespaces: ["setupScreen"],
    sourceRevision: "27e9a21",
    sourceHash: "565b0bcd89f346fd85f3b87d4e44716826a65bee54fd60eaa3b677c4d732a5ca",
  },
  {
    name: "services screen",
    copy: etServicesScreen,
    namespaces: ["servicesScreen"],
    sourceRevision: "27e9a21",
    sourceHash: "c769d10ab21c34754c6c4a6c57c3ee5f04881605b1dabc10030bca0e9122313d",
  },
  {
    name: "audit screen",
    copy: etAuditScreen,
    namespaces: ["auditScreen"],
    sourceRevision: "27e9a21",
    sourceHash: "2c15a7061c169b3f2da7446d4280ff94cb6b5ce2e6cb56d156af72ab154f1aed",
  },
  {
    name: "core",
    copy: etCore,
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
    sourceRevision: "c969097",
    sourceHash: "845b2b1ade4a0935ab924dcc4bdc27d72a7a120388740354bd69a697aa1c7ff2",
  },
  {
    name: "authentication",
    copy: etAuthScreen,
    namespaces: ["authScreen"],
    sourceRevision: "73cfdf8",
    sourceHash: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  },
  {
    name: "shared controls",
    copy: etSharedUi,
    namespaces: ["sharedUi"],
    sourceRevision: "73cfdf8",
    sourceHash: "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  },
] as const;
export const ET_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...ET_STAGED_BATCHES.map((batch) => batch.copy)),
);
