import { fiAuthScreen } from "./fi-auth-screen";
import { fiSharedUi } from "./fi-shared-ui";

/** Finnish authoring; never imported by the runtime catalog. */
export const FI_STAGED_BATCHES = [
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
