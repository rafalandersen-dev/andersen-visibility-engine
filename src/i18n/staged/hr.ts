import { hrCore } from "./hr-core";
import { hrAuthScreen } from "./hr-auth-screen";
import { hrSharedUi } from "./hr-shared-ui";
/** Croatian authoring; never imported by the runtime catalog. */
export const HR_STAGED_BATCHES = [
  {
    name: "core",
    copy: hrCore,
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
    sourceRevision: "9146c53",
    sourceHash: "845b2b1ade4a0935ab924dcc4bdc27d72a7a120388740354bd69a697aa1c7ff2",
  },
  {
    name: "authentication",
    copy: hrAuthScreen,
    namespaces: ["authScreen"],
    sourceRevision: "b450bc5",
    sourceHash: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  },
  {
    name: "shared controls",
    copy: hrSharedUi,
    namespaces: ["sharedUi"],
    sourceRevision: "b450bc5",
    sourceHash: "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  },
] as const;
export const HR_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...HR_STAGED_BATCHES.map((batch) => batch.copy)),
);
