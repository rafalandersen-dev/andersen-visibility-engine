import { slPlanScreen } from "./sl-plan-screen";
import { slEvidenceScreen } from "./sl-evidence-screen";
import { slBillingScreen } from "./sl-billing-screen";
import { slAnalyticsScreen } from "./sl-analytics-screen";
import { slAuditScreen } from "./sl-audit-screen";
import { slServicesScreen } from "./sl-services-screen";
import { slSetupScreen } from "./sl-setup-screen";
import { slCore } from "./sl-core";
import { slAuthScreen } from "./sl-auth-screen";
import { slSharedUi } from "./sl-shared-ui";
/** Slovenian authoring; never imported by the runtime catalog. */
export const SL_STAGED_BATCHES = [
  {
    name: "authentication",
    copy: slAuthScreen,
    namespaces: ["authScreen"],
    sourceRevision: "5f7faa9",
    sourceHash: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  },
  {
    name: "shared controls",
    copy: slSharedUi,
    namespaces: ["sharedUi"],
    sourceRevision: "5f7faa9",
    sourceHash: "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  },
  {
    name: "core",
    copy: slCore,
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
    sourceRevision: "ddee742",
    sourceHash: "845b2b1ade4a0935ab924dcc4bdc27d72a7a120388740354bd69a697aa1c7ff2",
  },
  {
    name: "setup screen",
    copy: slSetupScreen,
    namespaces: ["setupScreen"],
    sourceRevision: "32a8a48",
    sourceHash: "565b0bcd89f346fd85f3b87d4e44716826a65bee54fd60eaa3b677c4d732a5ca",
  },
  {
    name: "services screen",
    copy: slServicesScreen,
    namespaces: ["servicesScreen"],
    sourceRevision: "32a8a48",
    sourceHash: "c769d10ab21c34754c6c4a6c57c3ee5f04881605b1dabc10030bca0e9122313d",
  },
  {
    name: "audit screen",
    copy: slAuditScreen,
    namespaces: ["auditScreen"],
    sourceRevision: "32a8a48",
    sourceHash: "2c15a7061c169b3f2da7446d4280ff94cb6b5ce2e6cb56d156af72ab154f1aed",
  },
  {
    name: "analytics screen",
    copy: slAnalyticsScreen,
    namespaces: ["analyticsScreen"],
    sourceRevision: "1113cc5",
    sourceHash: "d86d151031ad82c4dbc559e9816ad14cecaa3e4f1b0de2ff8de3c484de5b02c5",
  },
  {
    name: "billing screen",
    copy: slBillingScreen,
    namespaces: ["billingScreen"],
    sourceRevision: "1113cc5",
    sourceHash: "d0e701bae4247d1129cc13dd6df6d9b569e725edbf5136255b68ca3fb2307194",
  },
  {
    name: "evidence screen",
    copy: slEvidenceScreen,
    namespaces: ["evidenceScreen"],
    sourceRevision: "b51ac1f",
    sourceHash: "2c7e9ccb48b02cd12911d0df6c31a96ec8ddfc6c558dfda3b3e14790d156c136",
  },
  {
    name: "plan screen",
    copy: slPlanScreen,
    namespaces: ["planScreen"],
    sourceRevision: "b949563",
    sourceHash: "288f529ed3a18c00623c05011262d3cce0374158e558959fa8fc9dbc63174bb7",
  },
] as const;
export const SL_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...SL_STAGED_BATCHES.map((batch) => batch.copy)),
);
