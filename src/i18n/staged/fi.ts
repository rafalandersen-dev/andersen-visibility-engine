import { fiSetupScreen } from "./fi-setup-screen";
import { fiServicesScreen } from "./fi-services-screen";
import { fiAuditScreen } from "./fi-audit-screen";
import { fiCore } from "./fi-core";
import { fiAuthScreen } from "./fi-auth-screen";
import { fiSharedUi } from "./fi-shared-ui";

/** Finnish authoring; never imported by the runtime catalog. */
export const FI_STAGED_BATCHES = [
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
