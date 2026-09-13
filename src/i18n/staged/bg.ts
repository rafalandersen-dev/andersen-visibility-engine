import { bgEditorScreen } from "./bg-editor-screen";
import { bgPlanScreen } from "./bg-plan-screen";
import { bgEvidenceScreen } from "./bg-evidence-screen";
import { bgBillingScreen } from "./bg-billing-screen";
import { bgAnalyticsScreen } from "./bg-analytics-screen";
import { bgAuditScreen } from "./bg-audit-screen";
import { bgServicesScreen } from "./bg-services-screen";
import { bgSetupScreen } from "./bg-setup-screen";
import { bgCore } from "./bg-core";
import { bgAuthScreen } from "./bg-auth-screen";
import { bgSharedUi } from "./bg-shared-ui";
/** Bulgarian authoring; never imported by the runtime catalog. */
export const BG_STAGED_BATCHES = [
  {
    name: "editor screen",
    copy: bgEditorScreen,
    namespaces: ["editorScreen"],
    sourceRevision: "eda0235",
    sourceHash: "1e827d2744ea1f2d3364b54983f06b42082f45ab6dfb0eda7b1375fdddd9ec9f",
  },
  {
    name: "plan screen",
    copy: bgPlanScreen,
    namespaces: ["planScreen"],
    sourceRevision: "b330d65",
    sourceHash: "288f529ed3a18c00623c05011262d3cce0374158e558959fa8fc9dbc63174bb7",
  },
  {
    name: "evidence screen",
    copy: bgEvidenceScreen,
    namespaces: ["evidenceScreen"],
    sourceRevision: "7d62eb3",
    sourceHash: "2c7e9ccb48b02cd12911d0df6c31a96ec8ddfc6c558dfda3b3e14790d156c136",
  },
  {
    name: "analytics screen",
    copy: bgAnalyticsScreen,
    namespaces: ["analyticsScreen"],
    sourceRevision: "9ff877a",
    sourceHash: "d86d151031ad82c4dbc559e9816ad14cecaa3e4f1b0de2ff8de3c484de5b02c5",
  },
  {
    name: "billing screen",
    copy: bgBillingScreen,
    namespaces: ["billingScreen"],
    sourceRevision: "9ff877a",
    sourceHash: "d0e701bae4247d1129cc13dd6df6d9b569e725edbf5136255b68ca3fb2307194",
  },
  {
    name: "setup screen",
    copy: bgSetupScreen,
    namespaces: ["setupScreen"],
    sourceRevision: "07d0f22",
    sourceHash: "565b0bcd89f346fd85f3b87d4e44716826a65bee54fd60eaa3b677c4d732a5ca",
  },
  {
    name: "services screen",
    copy: bgServicesScreen,
    namespaces: ["servicesScreen"],
    sourceRevision: "07d0f22",
    sourceHash: "c769d10ab21c34754c6c4a6c57c3ee5f04881605b1dabc10030bca0e9122313d",
  },
  {
    name: "audit screen",
    copy: bgAuditScreen,
    namespaces: ["auditScreen"],
    sourceRevision: "07d0f22",
    sourceHash: "2c15a7061c169b3f2da7446d4280ff94cb6b5ce2e6cb56d156af72ab154f1aed",
  },
  {
    name: "core",
    copy: bgCore,
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
    sourceRevision: "57f1c83",
    sourceHash: "845b2b1ade4a0935ab924dcc4bdc27d72a7a120388740354bd69a697aa1c7ff2",
  },
  {
    name: "authentication",
    copy: bgAuthScreen,
    namespaces: ["authScreen"],
    sourceRevision: "7a9ab2d",
    sourceHash: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  },
  {
    name: "shared controls",
    copy: bgSharedUi,
    namespaces: ["sharedUi"],
    sourceRevision: "7a9ab2d",
    sourceHash: "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  },
] as const;
export const BG_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...BG_STAGED_BATCHES.map((batch) => batch.copy)),
);
