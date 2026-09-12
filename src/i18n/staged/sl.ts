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
] as const;
export const SL_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...SL_STAGED_BATCHES.map((batch) => batch.copy)),
);
