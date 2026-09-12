import { ptSetupScreen } from "./pt-setup-screen";
import { ptServicesScreen } from "./pt-services-screen";
import { ptAuditScreen } from "./pt-audit-screen";
import { ptCore } from "./pt-core";
import { ptAuthScreen } from "./pt-auth-screen";
import { ptSharedUi } from "./pt-shared-ui";

/** Incomplete European Portuguese authoring. Never imported by the runtime catalog. */
export const PT_STAGED_BATCHES = [
  {
    name: "core",
    copy: ptCore,
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
    sourceRevision: "8f057b2",
    sourceHash: "845b2b1ade4a0935ab924dcc4bdc27d72a7a120388740354bd69a697aa1c7ff2",
  },
  {
    name: "authentication",
    copy: ptAuthScreen,
    namespaces: ["authScreen"],
    sourceRevision: "a95a276",
    sourceHash: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  },
  {
    name: "shared controls",
    copy: ptSharedUi,
    namespaces: ["sharedUi"],
    sourceRevision: "a95a276",
    sourceHash: "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  },
  {
    name: "setup screen",
    copy: ptSetupScreen,
    namespaces: ["setupScreen"],
    sourceRevision: "30eef6d",
    sourceHash: "565b0bcd89f346fd85f3b87d4e44716826a65bee54fd60eaa3b677c4d732a5ca",
  },
  {
    name: "services screen",
    copy: ptServicesScreen,
    namespaces: ["servicesScreen"],
    sourceRevision: "30eef6d",
    sourceHash: "c769d10ab21c34754c6c4a6c57c3ee5f04881605b1dabc10030bca0e9122313d",
  },
  {
    name: "audit screen",
    copy: ptAuditScreen,
    namespaces: ["auditScreen"],
    sourceRevision: "30eef6d",
    sourceHash: "2c15a7061c169b3f2da7446d4280ff94cb6b5ce2e6cb56d156af72ab154f1aed",
  },
] as const;
export const PT_STAGED_CATALOG: Readonly<Record<string, string>> = Object.assign(
  {},
  ...PT_STAGED_BATCHES.map((batch) => batch.copy),
);
