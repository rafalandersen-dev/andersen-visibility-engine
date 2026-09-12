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
] as const;
export const IT_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...IT_STAGED_BATCHES.map((batch) => batch.copy)),
);
