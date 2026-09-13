import { elAuthScreen } from "./el-auth-screen";
import { elSharedUi } from "./el-shared-ui";
import { elCore } from "./el-core";
/** Greek authoring; never imported by the runtime catalog. */
export const EL_STAGED_BATCHES = [
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
