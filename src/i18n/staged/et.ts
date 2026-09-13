import { etAuthScreen } from "./et-auth-screen";
import { etSharedUi } from "./et-shared-ui";
/** Estonian authoring; never imported by the runtime catalog. */
export const ET_STAGED_BATCHES = [
  {
    name: "authentication",
    copy: etAuthScreen,
    namespaces: ["authScreen"],
    sourceRevision: "73cfdf8",
    sourceHash: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  },
  {
    name: "shared controls",
    copy: etSharedUi,
    namespaces: ["sharedUi"],
    sourceRevision: "73cfdf8",
    sourceHash: "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  },
] as const;
export const ET_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...ET_STAGED_BATCHES.map((batch) => batch.copy)),
);
