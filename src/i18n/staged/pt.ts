import { ptCore } from "./pt-core";

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
] as const;
export const PT_STAGED_CATALOG: Readonly<Record<string, string>> = Object.assign(
  {},
  ...PT_STAGED_BATCHES.map((batch) => batch.copy),
);
