/**
 * TEST FIXTURE ONLY (PGlite migration tests). Seeds a stored LOCKED brand panel version directly into
 * `citation_panels` so the additive scope-binding trigger (20260926190000) accepts a finding/improvement
 * whose declared scope references it. This deliberately bypasses the P2 draft/lock RPCs (which need bound
 * prompts and, for discovery, the 10×4 grid + prospective schedule) — the RPCs themselves are exercised by
 * `citation-protocol-migration.test.ts`; here only the stored shape the trigger checks matters. Never
 * imported by production code.
 */
export interface LockedPanelFixture {
  userId: string;
  projectId: string;
  panelId: string;
  version?: number;
  client: { name: string; market: string };
  kind?: "brand" | "discovery";
  status?: "draft" | "locked";
}
export function lockedPanelDocument(f: LockedPanelFixture) {
  const status = f.status ?? "locked";
  return {
    panelId: f.panelId,
    version: f.version ?? 1,
    kind: f.kind ?? "brand",
    client: f.client,
    questionLanguage: "sv-SE",
    interfaceLanguage: "sv-SE",
    surface: {
      service: "ChatGPT",
      interface: "web",
      mode: "consumer-web",
      searchMode: null,
      modelLabel: null,
      webSearchEvidenced: "unknown",
    },
    session: {
      freshSession: true,
      personalisation: "non_personalised",
      signedIn: "signed_out",
      memory: "off",
      customInstructions: "none",
      connectedTools: "none",
      extraInstruction: null,
      priorMessages: 0,
    },
    collection: { country: null, city: null, devicePermission: "unknown", vpn: null },
    questions: [
      {
        id: "AC-B01",
        promptId: "20000000-0000-4000-8000-000000000001",
        promptRevision: 1,
        text: "Where can I book a massage in Malmö?",
        language: "sv-SE",
      },
    ],
    rounds: 0,
    status,
    approval:
      status === "locked" ? { approvedBy: f.userId, approvedAt: "2026-09-19T11:00:00.000Z" } : null,
  };
}
/** SQL + params reading the current head ROW of a logical finding/fact id — `v` (0 when absent) and `id` (null
 * when absent) — so a test that re-saves a correction can pass the head it "inspected" (version + immutable row
 * id) to the expected-head guard exactly as the UI does. */
export function headVersionQuery(
  table: "ai_citation_findings" | "ai_citation_business_facts",
  userId: string,
  projectId: string,
  logicalId: string,
): [string, unknown[]] {
  const column = table === "ai_citation_findings" ? "finding_id" : "fact_id";
  return [
    `SELECT coalesce(h.version,0)::int AS v, h.id AS id FROM (SELECT 1) one LEFT JOIN LATERAL (SELECT id,version FROM public.${table} WHERE user_id=$1 AND project_id=$2 AND ${column}=$3 ORDER BY version DESC,created_at DESC,id DESC LIMIT 1) h ON true`,
    [userId, projectId, logicalId],
  ];
}
/** The head token a test passes to a v2 save: `{ expectedVersion, expectedHeadId }` from `headVersionQuery`. */
export function headToken(row: { v: number; id: string | null } | undefined) {
  return { expectedVersion: row?.v ?? 0, expectedHeadId: row?.id ?? null };
}
/** SQL + params for a direct insert; callers run `db.query(sql, params)`. */
export function lockedPanelInsert(f: LockedPanelFixture): [string, unknown[]] {
  return [
    "INSERT INTO public.citation_panels(user_id,project_id,panel_id,version,document) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
    [f.userId, f.projectId, f.panelId, f.version ?? 1, JSON.stringify(lockedPanelDocument(f))],
  ];
}
