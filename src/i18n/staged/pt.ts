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
] as const;
export const PT_STAGED_CATALOG: Readonly<Record<string, string>> = Object.assign(
  {},
  ...PT_STAGED_BATCHES.map((batch) => batch.copy),
);
