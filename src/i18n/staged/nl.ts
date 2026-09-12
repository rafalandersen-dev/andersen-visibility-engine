import { nlAuditScreen } from "./nl-audit-screen";
import { nlServicesScreen } from "./nl-services-screen";
import { nlSetupScreen } from "./nl-setup-screen";
import { nlCore } from "./nl-core";
import { nlAuthScreen } from "./nl-auth-screen";
import { nlSharedUi } from "./nl-shared-ui";

/** Partial Dutch authoring; never imported by the runtime catalog. */
export const NL_STAGED_BATCHES = [
  {
    name: "setup screen",
    copy: nlSetupScreen,
    namespaces: ["setupScreen"],
    sourceRevision: "a712c08",
    sourceHash: "565b0bcd89f346fd85f3b87d4e44716826a65bee54fd60eaa3b677c4d732a5ca",
  },
  {
    name: "services screen",
    copy: nlServicesScreen,
    namespaces: ["servicesScreen"],
    sourceRevision: "a712c08",
    sourceHash: "c769d10ab21c34754c6c4a6c57c3ee5f04881605b1dabc10030bca0e9122313d",
  },
  {
    name: "audit screen",
    copy: nlAuditScreen,
    namespaces: ["auditScreen"],
    sourceRevision: "a712c08",
    sourceHash: "2c15a7061c169b3f2da7446d4280ff94cb6b5ce2e6cb56d156af72ab154f1aed",
  },
  {
    name: "core",
    copy: nlCore,
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
    sourceRevision: "86460e1",
    sourceHash: "845b2b1ade4a0935ab924dcc4bdc27d72a7a120388740354bd69a697aa1c7ff2",
  },
  {
    name: "authentication",
    copy: nlAuthScreen,
    namespaces: ["authScreen"],
    sourceRevision: "c0ac84b",
    sourceHash: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  },
  {
    name: "shared controls",
    copy: nlSharedUi,
    namespaces: ["sharedUi"],
    sourceRevision: "c0ac84b",
    sourceHash: "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  },
] as const;
export const NL_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...NL_STAGED_BATCHES.map((batch) => batch.copy)),
);
