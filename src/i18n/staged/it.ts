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
] as const;
export const IT_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...IT_STAGED_BATCHES.map((batch) => batch.copy)),
);
