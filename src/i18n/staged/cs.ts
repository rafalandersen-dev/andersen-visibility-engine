import { csAuditScreen } from "./cs-audit-screen";
import { csServicesScreen } from "./cs-services-screen";
import { csSetupScreen } from "./cs-setup-screen";
import { csCore } from "./cs-core";
import { csAuthScreen } from "./cs-auth-screen";
import { csSharedUi } from "./cs-shared-ui";
/** Czech authoring; never imported by the runtime catalog. */
export const CS_STAGED_BATCHES = [
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
