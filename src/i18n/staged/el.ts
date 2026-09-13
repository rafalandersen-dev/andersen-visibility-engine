import { elEvidenceScreen } from "./el-evidence-screen";
import { elSetupScreen } from "./el-setup-screen";
import { elServicesScreen } from "./el-services-screen";
import { elAuditScreen } from "./el-audit-screen";
import { elAnalyticsScreen } from "./el-analytics-screen";
import { elBillingScreen } from "./el-billing-screen";
import { elAuthScreen } from "./el-auth-screen";
import { elSharedUi } from "./el-shared-ui";
import { elCore } from "./el-core";
/** Greek authoring; never imported by the runtime catalog. */
export const EL_STAGED_BATCHES = [
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
    sourceHash: "845b2b1ade4a0935ab924dcc4bdc27d72a7a120388740354bd69a697aa1c7ff2",
  },
] as const;
export const EL_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...EL_STAGED_BATCHES.map((batch) => batch.copy)),
);
