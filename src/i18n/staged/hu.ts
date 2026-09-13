import { huSetupScreen } from "./hu-setup-screen";
import { huServicesScreen } from "./hu-services-screen";
import { huAuditScreen } from "./hu-audit-screen";
import { huAnalyticsScreen } from "./hu-analytics-screen";
import { huBillingScreen } from "./hu-billing-screen";
import { huAuthScreen } from "./hu-auth-screen";
import { huSharedUi } from "./hu-shared-ui";
import { huCore } from "./hu-core";
/** Hungarian authoring; never imported by the runtime catalog. */
export const HU_STAGED_BATCHES = [
  {
    name: "setup screen",
    copy: huSetupScreen,
    namespaces: ["setupScreen"],
    sourceRevision: "9f42e68",
    sourceHash: "565b0bcd89f346fd85f3b87d4e44716826a65bee54fd60eaa3b677c4d732a5ca",
  },
  {
    name: "services screen",
    copy: huServicesScreen,
    namespaces: ["servicesScreen"],
    sourceRevision: "9f42e68",
    sourceHash: "c769d10ab21c34754c6c4a6c57c3ee5f04881605b1dabc10030bca0e9122313d",
  },
  {
    name: "audit screen",
    copy: huAuditScreen,
    namespaces: ["auditScreen"],
    sourceRevision: "9f42e68",
    sourceHash: "2c15a7061c169b3f2da7446d4280ff94cb6b5ce2e6cb56d156af72ab154f1aed",
  },
  {
    name: "analytics screen",
    copy: huAnalyticsScreen,
    namespaces: ["analyticsScreen"],
    sourceRevision: "9f42e68",
    sourceHash: "d86d151031ad82c4dbc559e9816ad14cecaa3e4f1b0de2ff8de3c484de5b02c5",
  },
  {
    name: "billing screen",
    copy: huBillingScreen,
    namespaces: ["billingScreen"],
    sourceRevision: "9f42e68",
    sourceHash: "d0e701bae4247d1129cc13dd6df6d9b569e725edbf5136255b68ca3fb2307194",
  },
  {
    name: "authentication",
    copy: huAuthScreen,
    namespaces: ["authScreen"],
    sourceRevision: "78911a7",
    sourceHash: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  },
  {
    name: "shared controls",
    copy: huSharedUi,
    namespaces: ["sharedUi"],
    sourceRevision: "78911a7",
    sourceHash: "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  },
  {
    name: "core",
    copy: huCore,
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
    sourceRevision: "78911a7",
    sourceHash: "845b2b1ade4a0935ab924dcc4bdc27d72a7a120388740354bd69a697aa1c7ff2",
  },
] as const;
export const HU_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...HU_STAGED_BATCHES.map((batch) => batch.copy)),
);
