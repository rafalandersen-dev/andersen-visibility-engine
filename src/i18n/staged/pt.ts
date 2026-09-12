import { ptMeasurements } from "./pt-measurements";
import { ptTechnical } from "./pt-technical";
import { ptKnowledge } from "./pt-knowledge";
import { ptCollaboration } from "./pt-collaboration";
import { ptConfiguration } from "./pt-configuration";
import { ptBetaScreen } from "./pt-beta-screen";
import { ptBetaGuide } from "./pt-beta-guide";
import { ptPublicBeta } from "./pt-public-beta";
import { ptPublicHome } from "./pt-public-home";
import { ptPublicPricing } from "./pt-public-pricing";
import { ptPublicStudies } from "./pt-public-studies";
import { ptPlanScreen } from "./pt-plan-screen";
import { ptEditorScreen } from "./pt-editor-screen";
import { ptAnalyticsScreen } from "./pt-analytics-screen";
import { ptBillingScreen } from "./pt-billing-screen";
import { ptEvidenceScreen } from "./pt-evidence-screen";
import { ptSetupScreen } from "./pt-setup-screen";
import { ptServicesScreen } from "./pt-services-screen";
import { ptAuditScreen } from "./pt-audit-screen";
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
  {
    name: "setup screen",
    copy: ptSetupScreen,
    namespaces: ["setupScreen"],
    sourceRevision: "30eef6d",
    sourceHash: "565b0bcd89f346fd85f3b87d4e44716826a65bee54fd60eaa3b677c4d732a5ca",
  },
  {
    name: "services screen",
    copy: ptServicesScreen,
    namespaces: ["servicesScreen"],
    sourceRevision: "30eef6d",
    sourceHash: "c769d10ab21c34754c6c4a6c57c3ee5f04881605b1dabc10030bca0e9122313d",
  },
  {
    name: "audit screen",
    copy: ptAuditScreen,
    namespaces: ["auditScreen"],
    sourceRevision: "30eef6d",
    sourceHash: "2c15a7061c169b3f2da7446d4280ff94cb6b5ce2e6cb56d156af72ab154f1aed",
  },
  {
    name: "analytics screen",
    copy: ptAnalyticsScreen,
    namespaces: ["analyticsScreen"],
    sourceRevision: "2d9acd2",
    sourceHash: "d86d151031ad82c4dbc559e9816ad14cecaa3e4f1b0de2ff8de3c484de5b02c5",
  },
  {
    name: "billing screen",
    copy: ptBillingScreen,
    namespaces: ["billingScreen"],
    sourceRevision: "2d9acd2",
    sourceHash: "d0e701bae4247d1129cc13dd6df6d9b569e725edbf5136255b68ca3fb2307194",
  },
  {
    name: "evidence screen",
    copy: ptEvidenceScreen,
    namespaces: ["evidenceScreen"],
    sourceRevision: "2d9acd2",
    sourceHash: "2c7e9ccb48b02cd12911d0df6c31a96ec8ddfc6c558dfda3b3e14790d156c136",
  },
  {
    name: "plan screen",
    copy: ptPlanScreen,
    namespaces: ["planScreen"],
    sourceRevision: "13cb098",
    sourceHash: "288f529ed3a18c00623c05011262d3cce0374158e558959fa8fc9dbc63174bb7",
  },
  {
    name: "editor screen",
    copy: ptEditorScreen,
    namespaces: ["editorScreen"],
    sourceRevision: "13cb098",
    sourceHash: "1e827d2744ea1f2d3364b54983f06b42082f45ab6dfb0eda7b1375fdddd9ec9f",
  },
  {
    name: "public home",
    copy: ptPublicHome,
    namespaces: ["publicHome"],
    sourceRevision: "eaaa8d4",
    sourceHash: "4e132895babfb222b37e92719be5ad2a8be90d9503869e9df9845b00d982adeb",
  },
  {
    name: "public pricing",
    copy: ptPublicPricing,
    namespaces: ["publicPricing"],
    sourceRevision: "eaaa8d4",
    sourceHash: "8e7cecc9d6ca14af722fe8b4131d7982241e9e856335586f8d4e724469d0de60",
  },
  {
    name: "public studies",
    copy: ptPublicStudies,
    namespaces: ["publicStudies"],
    sourceRevision: "eaaa8d4",
    sourceHash: "ace563fb757a52abcd667e7e691d3e48024045a4e4f265e6949c66a828f5e8de",
  },
  {
    name: "beta screen",
    copy: ptBetaScreen,
    namespaces: ["betaScreen"],
    sourceRevision: "1c5978d",
    sourceHash: "c4dcf4827cb49219199aab22d2969e33f643ade8a8c2c348bb899d61f3a08119",
  },
  {
    name: "beta guidance",
    copy: ptBetaGuide,
    namespaces: ["betaGuide"],
    sourceRevision: "1c5978d",
    sourceHash: "8c815e10a73590a6e2911d1b5618d5d545c15a47b3a75462ccaaae6faf33520d",
  },
  {
    name: "public beta",
    copy: ptPublicBeta,
    namespaces: ["publicBeta"],
    sourceRevision: "1c5978d",
    sourceHash: "e670953b131c40fc4433b5ce6e5b256556bf37ea8709bc495b211efc361fb59e",
  },
  {
    name: "configuration",
    copy: ptConfiguration,
    namespaces: ["brand", "wp", "shopify", "claude", "connect", "connections", "coverage"],
    sourceRevision: "8446b55",
    sourceHash: "0e11ebfcac212ec85d91c8734430e0cd661dc727057c565c1cfcd33f59a1aa60",
  },
  {
    name: "collaboration",
    copy: ptCollaboration,
    namespaces: ["collaboration", "team", "notifications", "awareness", "emailSettings"],
    sourceRevision: "94b72ee",
    sourceHash: "429e59f16a866242f25a373ebd6b52332ae3f04534230101422ebab727f77ed0",
  },
  {
    name: "knowledge",
    copy: ptKnowledge,
    namespaces: ["knowledge", "weekly", "approval", "refresh"],
    sourceRevision: "bf3dd15",
    sourceHash: "a3a3297006f23628e422ddedfb5b6f5a51c6dd5f6abbc6d6e589481e49915816",
  },
  {
    name: "technical",
    copy: ptTechnical,
    namespaces: ["crawl", "gindex", "perf"],
    sourceRevision: "c008772",
    sourceHash: "106a19b8ceaf725528ddc9d4de7317d823108425584418d93729346f29c135e6",
  },
  {
    name: "measurements",
    copy: ptMeasurements,
    namespaces: ["analytics", "gsc", "report"],
    sourceRevision: "465946b",
    sourceHash: "cfe9102341aed0899846a94191ac4a27f5a7b371e09775137f3ce10481df6199",
  },
] as const;
export const PT_STAGED_CATALOG: Readonly<Record<string, string>> = Object.assign(
  {},
  ...PT_STAGED_BATCHES.map((batch) => batch.copy),
);
