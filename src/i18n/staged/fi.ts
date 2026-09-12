import { fiPublicPricing } from "./fi-public-pricing";
import { fiPublicStudies } from "./fi-public-studies";
import { fiEditorScreen } from "./fi-editor-screen";
import { fiPlanScreen } from "./fi-plan-screen";
import { fiEvidenceScreen } from "./fi-evidence-screen";
import { fiAnalyticsScreen } from "./fi-analytics-screen";
import { fiBillingScreen } from "./fi-billing-screen";
import { fiSetupScreen } from "./fi-setup-screen";
import { fiServicesScreen } from "./fi-services-screen";
import { fiAuditScreen } from "./fi-audit-screen";
import { fiCore } from "./fi-core";
import { fiAuthScreen } from "./fi-auth-screen";
import { fiSharedUi } from "./fi-shared-ui";

/** Finnish authoring; never imported by the runtime catalog. */
export const FI_STAGED_BATCHES = [
  {
    name: "public pricing",
    copy: fiPublicPricing,
    namespaces: ["publicPricing"],
    sourceRevision: "e1e8bf7",
    sourceHash: "8e7cecc9d6ca14af722fe8b4131d7982241e9e856335586f8d4e724469d0de60",
  },
  {
    name: "public studies",
    copy: fiPublicStudies,
    namespaces: ["publicStudies"],
    sourceRevision: "e1e8bf7",
    sourceHash: "ace563fb757a52abcd667e7e691d3e48024045a4e4f265e6949c66a828f5e8de",
  },

  {
    name: "editor screen",
    copy: fiEditorScreen,
    namespaces: ["editorScreen"],
    sourceRevision: "6ee37f2",
    sourceHash: "1e827d2744ea1f2d3364b54983f06b42082f45ab6dfb0eda7b1375fdddd9ec9f",
  },
  {
    name: "plan screen",
    copy: fiPlanScreen,
    namespaces: ["planScreen"],
    sourceRevision: "176dab6",
    sourceHash: "288f529ed3a18c00623c05011262d3cce0374158e558959fa8fc9dbc63174bb7",
  },
  {
    name: "evidence screen",
    copy: fiEvidenceScreen,
    namespaces: ["evidenceScreen"],
    sourceRevision: "0797a5a",
    sourceHash: "2c7e9ccb48b02cd12911d0df6c31a96ec8ddfc6c558dfda3b3e14790d156c136",
  },
  {
    name: "analytics screen",
    copy: fiAnalyticsScreen,
    namespaces: ["analyticsScreen"],
    sourceRevision: "7e386ca",
    sourceHash: "d86d151031ad82c4dbc559e9816ad14cecaa3e4f1b0de2ff8de3c484de5b02c5",
  },
  {
    name: "billing screen",
    copy: fiBillingScreen,
    namespaces: ["billingScreen"],
    sourceRevision: "7e386ca",
    sourceHash: "d0e701bae4247d1129cc13dd6df6d9b569e725edbf5136255b68ca3fb2307194",
  },
  {
    name: "setup screen",
    copy: fiSetupScreen,
    namespaces: ["setupScreen"],
    sourceRevision: "5ddcfdb",
    sourceHash: "565b0bcd89f346fd85f3b87d4e44716826a65bee54fd60eaa3b677c4d732a5ca",
  },
  {
    name: "services screen",
    copy: fiServicesScreen,
    namespaces: ["servicesScreen"],
    sourceRevision: "5ddcfdb",
    sourceHash: "c769d10ab21c34754c6c4a6c57c3ee5f04881605b1dabc10030bca0e9122313d",
  },
  {
    name: "audit screen",
    copy: fiAuditScreen,
    namespaces: ["auditScreen"],
    sourceRevision: "5ddcfdb",
    sourceHash: "2c15a7061c169b3f2da7446d4280ff94cb6b5ce2e6cb56d156af72ab154f1aed",
  },
  {
    name: "core",
    copy: fiCore,
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
    sourceRevision: "1647171",
    sourceHash: "845b2b1ade4a0935ab924dcc4bdc27d72a7a120388740354bd69a697aa1c7ff2",
  },
  {
    name: "authentication",
    copy: fiAuthScreen,
    namespaces: ["authScreen"],
    sourceRevision: "4fbdd66",
    sourceHash: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  },
  {
    name: "shared controls",
    copy: fiSharedUi,
    namespaces: ["sharedUi"],
    sourceRevision: "4fbdd66",
    sourceHash: "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  },
] as const;
export const FI_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...FI_STAGED_BATCHES.map((batch) => batch.copy)),
);
