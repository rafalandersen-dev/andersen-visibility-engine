import { skAuthScreen } from "./sk-auth-screen";
import { skSharedUi } from "./sk-shared-ui";
/** Slovak authoring; never imported by the runtime catalog. */
export const SK_STAGED_BATCHES = [
  {
    name: "authentication",
    copy: skAuthScreen,
    namespaces: ["authScreen"],
    sourceRevision: "e72328d",
    sourceHash: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  },
  {
    name: "shared controls",
    copy: skSharedUi,
    namespaces: ["sharedUi"],
    sourceRevision: "e72328d",
    sourceHash: "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  },
] as const;
export const SK_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...SK_STAGED_BATCHES.map((batch) => batch.copy)),
);
