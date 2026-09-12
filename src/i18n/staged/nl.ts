import { nlMeasurements } from "./nl-measurements";
import { nlTechnical } from "./nl-technical";
import { nlKnowledge } from "./nl-knowledge";
import { nlCollaboration } from "./nl-collaboration";
import { nlConfiguration } from "./nl-configuration";
import { nlPublicBeta } from "./nl-public-beta";
import { nlBetaGuide } from "./nl-beta-guide";
import { nlBetaScreen } from "./nl-beta-screen";
import { nlPublicHome } from "./nl-public-home";
import { nlPublicStudies } from "./nl-public-studies";
import { nlPublicPricing } from "./nl-public-pricing";
import { nlEditorScreen } from "./nl-editor-screen";
import { nlPlanScreen } from "./nl-plan-screen";
import { nlEvidenceScreen } from "./nl-evidence-screen";
import { nlBillingScreen } from "./nl-billing-screen";
import { nlAnalyticsScreen } from "./nl-analytics-screen";
import { nlAuditScreen } from "./nl-audit-screen";
import { nlServicesScreen } from "./nl-services-screen";
import { nlSetupScreen } from "./nl-setup-screen";
import { nlCore } from "./nl-core";
import { nlAuthScreen } from "./nl-auth-screen";
import { nlSharedUi } from "./nl-shared-ui";

/** Partial Dutch authoring; never imported by the runtime catalog. */
export const NL_STAGED_BATCHES = [
  {
    name: "measurements",
    copy: nlMeasurements,
    namespaces: ["analytics", "gsc", "report"],
    sourceRevision: "d3bc107",
    sourceHash: "cfe9102341aed0899846a94191ac4a27f5a7b371e09775137f3ce10481df6199",
  },
  {
    name: "technical",
    copy: nlTechnical,
    namespaces: ["crawl", "gindex", "perf"],
    sourceRevision: "3c79c3b",
    sourceHash: "106a19b8ceaf725528ddc9d4de7317d823108425584418d93729346f29c135e6",
  },
  {
    name: "knowledge",
    copy: nlKnowledge,
    namespaces: ["knowledge", "weekly", "approval", "refresh"],
    sourceRevision: "b358246",
    sourceHash: "a3a3297006f23628e422ddedfb5b6f5a51c6dd5f6abbc6d6e589481e49915816",
  },
  {
    name: "collaboration",
    copy: nlCollaboration,
    namespaces: ["collaboration", "team", "notifications", "awareness", "emailSettings"],
    sourceRevision: "6759e9e",
    sourceHash: "429e59f16a866242f25a373ebd6b52332ae3f04534230101422ebab727f77ed0",
  },
  {
    name: "configuration",
    copy: nlConfiguration,
    namespaces: ["brand", "wp", "shopify", "claude", "connect", "connections", "coverage"],
    sourceRevision: "053f237",
    sourceHash: "0e11ebfcac212ec85d91c8734430e0cd661dc727057c565c1cfcd33f59a1aa60",
  },
  {
    name: "public beta",
    copy: nlPublicBeta,
    namespaces: ["publicBeta"],
    sourceRevision: "a939517",
    sourceHash: "e670953b131c40fc4433b5ce6e5b256556bf37ea8709bc495b211efc361fb59e",
  },
  {
    name: "beta guidance",
    copy: nlBetaGuide,
    namespaces: ["betaGuide"],
    sourceRevision: "b97d967",
    sourceHash: "8c815e10a73590a6e2911d1b5618d5d545c15a47b3a75462ccaaae6faf33520d",
  },
  {
    name: "beta screen",
    copy: nlBetaScreen,
    namespaces: ["betaScreen"],
    sourceRevision: "dc4b718",
    sourceHash: "c4dcf4827cb49219199aab22d2969e33f643ade8a8c2c348bb899d61f3a08119",
  },
  {
    name: "public home",
    copy: nlPublicHome,
    namespaces: ["publicHome"],
    sourceRevision: "2a88d38",
    sourceHash: "4e132895babfb222b37e92719be5ad2a8be90d9503869e9df9845b00d982adeb",
  },
  {
    name: "public pricing",
    copy: nlPublicPricing,
    namespaces: ["publicPricing"],
    sourceRevision: "c4fc095",
    sourceHash: "8e7cecc9d6ca14af722fe8b4131d7982241e9e856335586f8d4e724469d0de60",
  },
  {
    name: "public studies",
    copy: nlPublicStudies,
    namespaces: ["publicStudies"],
    sourceRevision: "c4fc095",
    sourceHash: "ace563fb757a52abcd667e7e691d3e48024045a4e4f265e6949c66a828f5e8de",
  },
  {
    name: "editor screen",
    copy: nlEditorScreen,
    namespaces: ["editorScreen"],
    sourceRevision: "388747e",
    sourceHash: "1e827d2744ea1f2d3364b54983f06b42082f45ab6dfb0eda7b1375fdddd9ec9f",
  },
  {
    name: "plan screen",
    copy: nlPlanScreen,
    namespaces: ["planScreen"],
    sourceRevision: "9099f42",
    sourceHash: "288f529ed3a18c00623c05011262d3cce0374158e558959fa8fc9dbc63174bb7",
  },
  {
    name: "evidence screen",
    copy: nlEvidenceScreen,
    namespaces: ["evidenceScreen"],
    sourceRevision: "fb56499",
    sourceHash: "2c7e9ccb48b02cd12911d0df6c31a96ec8ddfc6c558dfda3b3e14790d156c136",
  },
  {
    name: "analytics screen",
    copy: nlAnalyticsScreen,
    namespaces: ["analyticsScreen"],
    sourceRevision: "770590a",
    sourceHash: "d86d151031ad82c4dbc559e9816ad14cecaa3e4f1b0de2ff8de3c484de5b02c5",
  },
  {
    name: "billing screen",
    copy: nlBillingScreen,
    namespaces: ["billingScreen"],
    sourceRevision: "770590a",
    sourceHash: "d0e701bae4247d1129cc13dd6df6d9b569e725edbf5136255b68ca3fb2307194",
  },
  {
    name: "setup screen",
    copy: nlSetupScreen,
    namespaces: ["setupScreen"],
    sourceRevision: "a712c08",
    sourceHash: "565b0bcd89f346fd85f3b87d4e44716826a65bee54fd60eaa3b677c4d732a5ca",
  },
  {
    name: "services screen",
    copy: nlServicesScreen,
    namespaces: ["servicesScreen"],
    sourceRevision: "a712c08",
    sourceHash: "c769d10ab21c34754c6c4a6c57c3ee5f04881605b1dabc10030bca0e9122313d",
  },
  {
    name: "audit screen",
    copy: nlAuditScreen,
    namespaces: ["auditScreen"],
    sourceRevision: "a712c08",
    sourceHash: "2c15a7061c169b3f2da7446d4280ff94cb6b5ce2e6cb56d156af72ab154f1aed",
  },
  {
    name: "core",
    copy: nlCore,
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
    sourceRevision: "86460e1",
    sourceHash: "845b2b1ade4a0935ab924dcc4bdc27d72a7a120388740354bd69a697aa1c7ff2",
  },
  {
    name: "authentication",
    copy: nlAuthScreen,
    namespaces: ["authScreen"],
    sourceRevision: "c0ac84b",
    sourceHash: "f0d4cd1cdcf0283517e3a90abea9abdbc8528a76d9a15c10c7cad3ef84729dc8",
  },
  {
    name: "shared controls",
    copy: nlSharedUi,
    namespaces: ["sharedUi"],
    sourceRevision: "c0ac84b",
    sourceHash: "678278d00a51f6b4df582627cce0d38b176e65972d6ac578682f8e2e247d9de5",
  },
] as const;
export const NL_STAGED_CATALOG: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null), ...NL_STAGED_BATCHES.map((batch) => batch.copy)),
);
