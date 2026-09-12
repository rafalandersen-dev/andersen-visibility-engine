import { esEditorScreen } from "./es-editor-screen";
import { esPlanScreen } from "./es-plan-screen";
import { esEvidenceScreen } from "./es-evidence-screen";
import { esAnalyticsScreen } from "./es-analytics-screen";
import { esBillingScreen } from "./es-billing-screen";
import { esCore } from "./es-core";
import { esAuthScreen } from "./es-auth-screen";
import { esSharedUi } from "./es-shared-ui";
import { esSetupScreen } from "./es-setup-screen";
import { esServicesScreen } from "./es-services-screen";
import { esAuditScreen } from "./es-audit-screen";

/** Incomplete Spanish authoring: 785 messages / 11 batches at the first checkpoint.
 * The reviewed baseline has 3,734 English keys; later source additions still need reconciliation.
 * Next: workflow, collaboration, knowledge, technical, measurements, evidence,
 * configuration, growth, commerce, links, outreach and public/beta copy.
 * Existing English provider/product claim gaps require reconciliation before activation.
 * No fluent-user or full-interface acceptance. Not imported by the runtime or language picker.
 * Source hashes require re-review when the corresponding English messages change. */
export const ES_STAGED_BATCHES = [
  {
    name: "editor screen",
    copy: esEditorScreen,
    namespaces: ["editorScreen"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "1e827d2744ea1f2d3364b54983f06b42082f45ab6dfb0eda7b1375fdddd9ec9f",
  },
  {
    name: "billing screen",
    copy: esBillingScreen,
    namespaces: ["billingScreen"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "efc54955c540e8fbc0c9f63b08a05595e82c60fa5335054dacc1607e7ba99b44",
  },
  {
    name: "analytics screen",
    copy: esAnalyticsScreen,
    namespaces: ["analyticsScreen"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "d86d151031ad82c4dbc559e9816ad14cecaa3e4f1b0de2ff8de3c484de5b02c5",
  },
  {
    name: "evidence screen",
    copy: esEvidenceScreen,
    namespaces: ["evidenceScreen"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "2c7e9ccb48b02cd12911d0df6c31a96ec8ddfc6c558dfda3b3e14790d156c136",
  },
  {
    name: "plan screen",
    copy: esPlanScreen,
    namespaces: ["planScreen"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "288f529ed3a18c00623c05011262d3cce0374158e558959fa8fc9dbc63174bb7",
  },

  {
    name: "core",
    copy: esCore,
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
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "924a5d23d5cf76e52c2cae0dbb90b23f1989e850603d1b0462fc4e569e204bcf",
  },
  {
    name: "authentication screen",
    copy: esAuthScreen,
    namespaces: ["authScreen"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  },
  {
    name: "shared UI",
    copy: esSharedUi,
    namespaces: ["sharedUi"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  },
  {
    name: "setup screen",
    copy: esSetupScreen,
    namespaces: ["setupScreen"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "565b0bcd89f346fd85f3b87d4e44716826a65bee54fd60eaa3b677c4d732a5ca",
  },
  {
    name: "services screen",
    copy: esServicesScreen,
    namespaces: ["servicesScreen"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "c769d10ab21c34754c6c4a6c57c3ee5f04881605b1dabc10030bca0e9122313d",
  },
  {
    name: "audit screen",
    copy: esAuditScreen,
    namespaces: ["auditScreen"],
    sourceRevision: "47bb01ca49620ff2005ecebba60dced85e9f68d8",
    sourceHash: "2c15a7061c169b3f2da7446d4280ff94cb6b5ce2e6cb56d156af72ab154f1aed",
  },
] as const;

export const ES_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...ES_STAGED_BATCHES.map((batch) => batch.copy)),
);
