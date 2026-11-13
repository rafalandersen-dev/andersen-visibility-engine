import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import {
  readNativeArtifacts,
  stageNativeArtifact,
  removeNativeArtifact,
} from "./native-ai-artifact.server";
import {
  persistNativeReport,
  readNativeReportParsed,
  readNativeReportParseStates,
} from "./native-google-intake.server";
import type { KnowledgeRpc } from "./project-knowledge.server";
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const scope = { ownerId: user, projectId: "p" };
// SYNTHETIC: a real-shaped GSC chart export + its declared staging metadata. Not real customer data.
const chartCsv = "Date,Impressions\n2026-09-01,12\n2026-09-02,0\n";
const base64 = Buffer.from(new TextEncoder().encode(chartCsv)).toString("base64");
const metadata = {
  source: "gsc_generative_ai_search" as const,
  declaredProperty: "https://example.test/",
  reportKind: "chart" as const,
  dimension: "date" as const,
  aggregation: "property" as const,
  period: { start: "2026-09-01", end: "2026-11-13", timezone: "America/Los_Angeles" },
  marketScope: { country: "SWE", exposed: true },
  filters: { "Search type": "Web (text-based)", Date: "Last 3 months", Country: "Sweden" },
  capturedAt: "2026-11-13T09:00:00Z",
  filename: "Chart.csv",
};
const rpc: KnowledgeRpc = async (name, args) => {
  try {
    const keys = Object.keys(args);
    const result = await db.query<{ data: unknown }>(
      `SELECT public.${name}(${keys.map((_, i) => "$" + (i + 1)).join(",")}) data`,
      Object.values(args),
    );
    return { data: result.rows[0].data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};
const stage = (m: unknown = metadata, body = base64, s = scope) =>
  stageNativeArtifact(s, { metadata: m, base64: body }, rpc);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));",
  );
  await db.query("INSERT INTO auth.users VALUES($1),($2)", [user, other]);
  await db.query("INSERT INTO workspace_meta(user_id) VALUES($1),($2)", [user, other]);
  for (const name of [
    "20260909200000_project_knowledge.sql",
    "20260919165000_native_report_artifacts.sql",
    "20261113120000_native_report_parsed_interpretation.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + name, "utf8"));
}, 30000);
beforeEach(async () => {
  await db.exec("RESET ROLE;TRUNCATE workspace_entities CASCADE;");
  await db.query(
    "INSERT INTO workspace_entities(user_id,collection,entity_id) VALUES($1,'projects','p'),($1,'projects','q'),($2,'projects','p')",
    [user, other],
  );
});
afterAll(async () => {
  await db?.close();
});
describe("additive parsed-interpretation persistence with real server round trips", () => {
  it("leaves a freshly staged artifact unparsed, raw-stage APIs unchanged", async () => {
    const a = await stage();
    expect(a.status).toBe("pending_parser");
    const list = await readNativeArtifacts(scope, rpc);
    // The list RPC is untouched: no parsed/base64 fields leak into it.
    expect(list.artifacts).toHaveLength(1);
    expect((list.artifacts[0] as Record<string, unknown>).parsed).toBeUndefined();
    expect((list.artifacts[0] as Record<string, unknown>).base64).toBeUndefined();
    const read = await readNativeReportParsed(scope, a.id, rpc);
    expect(read).toMatchObject({
      parseState: "unparsed",
      parsed: null,
      parsedAt: null,
      parsedActorId: null,
    });
  });
  it("re-parses the stored bytes and persists a typed interpretation bound to the artifact", async () => {
    const a = await stage();
    const saved = await persistNativeReport(scope, a.id, "partial", "9–11 Nov 2026 outage", rpc);
    expect(saved).toMatchObject({ id: a.id, parseState: "parsed", parsedActorId: user });
    expect(saved.parsed?.artifactSha256).toBe(a.sha256);
    expect(saved.parsed?.input.artifact.sha256).toBe(a.sha256);
    expect(saved.parsed?.limitationNote).toBe("9–11 Nov 2026 outage");
    expect(saved.parsed?.input.rows).toHaveLength(2);
    // The bare exported zero stays unknown; value statuses survive the round trip.
    expect(saved.parsed?.input.rows[1].cells.impressions.status).toBe("unknown_export_zero");
    // Reload shows the persisted interpretation with provenance.
    const read = await readNativeReportParsed(scope, a.id, rpc);
    expect(read.parsed?.limitationNote).toBe("9–11 Nov 2026 outage");
    expect(read.parsedAt).not.toBeNull();
    // The overview surfaces parse state + a row count without the full rows.
    const states = await readNativeReportParseStates(scope, rpc);
    expect(states.states).toEqual([
      expect.objectContaining({
        id: a.id,
        parseState: "parsed",
        completeness: "partial",
        partial: false,
        withheldPageRows: 0,
        rowCount: 2,
        parserVersion: "native-google-ai-csv-v1",
      }),
    ]);
  });
  it("is idempotent on a byte-identical re-parse and conflicts on a different interpretation", async () => {
    const a = await stage();
    const first = await persistNativeReport(scope, a.id, "partial", "outage", rpc);
    const retry = await persistNativeReport(scope, a.id, "partial", "outage", rpc);
    expect(retry.parsed).toEqual(first.parsed);
    // A different completeness/note is an explicit conflict, never a silent overwrite.
    await expect(persistNativeReport(scope, a.id, "complete", "outage", rpc)).rejects.toThrow(
      /native_parsed_conflict/,
    );
    await expect(persistNativeReport(scope, a.id, "partial", "different", rpc)).rejects.toThrow(
      /native_parsed_conflict/,
    );
  });
  it("deletes the parsed data with the raw artifact", async () => {
    const a = await stage();
    await persistNativeReport(scope, a.id, "partial", "outage", rpc);
    await removeNativeArtifact(scope, a.id, rpc);
    await expect(readNativeReportParsed(scope, a.id, rpc)).rejects.toThrow();
    expect((await readNativeReportParseStates(scope, rpc)).states).toEqual([]);
  });
  it("rejects an unsupported report kind and a declared-metadata mismatch", async () => {
    const unsupported = await stage({
      ...metadata,
      dimension: "unknown",
      reportKind: "table",
      aggregation: "unknown",
    });
    await expect(persistNativeReport(scope, unsupported.id, "partial", "", rpc)).rejects.toThrow(
      /native_parsed_unsupported/,
    );
    // Declared aggregation 'page' over a chart whose parser re-derives 'property' is an explicit mismatch.
    const mismatch = await stage({ ...metadata, aggregation: "page" });
    await expect(persistNativeReport(scope, mismatch.id, "partial", "", rpc)).rejects.toThrow(
      /native_parsed_metadata_mismatch/,
    );
  });
  it("refuses a parsed record whose hash does not bind to the stored artifact", async () => {
    const a = await stage();
    const saved = await persistNativeReport(scope, a.id, "partial", "outage", rpc);
    const forged = JSON.stringify({ ...saved.parsed, artifactSha256: "a".repeat(64) });
    await expect(
      db.query("SELECT save_ai_native_report_parsed($1,'p',$2,$3::jsonb)", [user, a.id, forged]),
    ).rejects.toThrow(/native_parsed_hash_mismatch/);
  });
  it("isolates owners/projects and exposes only the service RPCs, not the table", async () => {
    const a = await stage();
    await persistNativeReport(scope, a.id, "partial", "outage", rpc);
    // A project the owner has but did not stage into is empty, not an error.
    expect(
      (await readNativeReportParseStates({ ownerId: user, projectId: "q" }, rpc)).states,
    ).toEqual([]);
    // A foreign owner cannot read another owner's interpretation.
    await expect(
      readNativeReportParsed({ ownerId: other, projectId: "p" }, a.id, rpc),
    ).rejects.toThrow();
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query("SELECT parsed FROM ai_native_report_artifacts")).rejects.toThrow(
        /permission denied/,
      );
      if (role !== "service_role")
        await expect(
          db.query("SELECT read_ai_native_report_parse_states($1,$2)", [user, "p"]),
        ).rejects.toThrow(/permission denied/);
      else
        expect(
          (await db.query("SELECT read_ai_native_report_parse_states($1,$2) data", [user, "q"]))
            .rows[0],
        ).toEqual({ data: { states: [] } });
      await db.exec("RESET ROLE");
    }
  });
  it("maps a parse failure to a static code, never reflecting the owner's raw input", async () => {
    // A chart CSV whose invalid date key embeds secret-looking text; the parser rejects it.
    const secret = "SECRET-TOKEN-9f3a?q=private";
    const badCsv = `Date,Impressions\n${secret},5\n`;
    const badB64 = Buffer.from(new TextEncoder().encode(badCsv)).toString("base64");
    const a = await stage(metadata, badB64);
    await expect(persistNativeReport(scope, a.id, "partial", "", rpc)).rejects.toThrow(
      /^native_parse_failed$/,
    );
    // The thrown transport code never contains the raw parser input.
    await persistNativeReport(scope, a.id, "partial", "", rpc).catch((e) =>
      expect(String((e as Error).message)).not.toContain("SECRET-TOKEN"),
    );
  });

  // SYNTHETIC Bing Webmaster Tools "AI Performance" overview + its unknown/unsegmented staging. The
  // same generic parsed-storage path round-trips a Bing record with no new SQL.
  const bingOverviewCsv =
    "Date,Citations,Cited Pages\n8/13/2026 12:00:00 AM,2,1\n8/14/2026 12:00:00 AM,0,0\n";
  const bingB64 = Buffer.from(new TextEncoder().encode(bingOverviewCsv)).toString("base64");
  const bingMetadata = {
    source: "bing_ai_performance" as const,
    declaredProperty: "https://example.test/",
    reportKind: "table" as const,
    dimension: "date" as const,
    aggregation: "property" as const,
    period: { start: "2026-08-13", end: "2026-11-12", timezone: null },
    marketScope: { country: null, exposed: false },
    filters: {},
    capturedAt: "2026-11-13T11:16:20Z",
    filename: "Overview.csv",
  };
  it("re-parses and persists a Bing overview, idempotent on an exact retry", async () => {
    const a = await stage(bingMetadata, bingB64);
    const saved = await persistNativeReport(
      scope,
      a.id,
      "partial",
      "Nov 11–12 not yet in export",
      rpc,
    );
    expect(saved.parsed).toMatchObject({
      parserVersion: "native-bing-ai-csv-v1",
      file: "bing_overview",
    });
    expect(saved.parsed?.input.source).toBe("bing_ai_performance");
    expect(saved.parsed?.input.period.timezone).toBeNull();
    expect(saved.parsed?.input.rows).toHaveLength(2);
    expect(saved.parsed?.input.rows[0].cells.citations.status).toBe("known_value");
    expect(saved.parsed?.input.rows[0].cells.cited_pages).toMatchObject({
      status: "known_value",
      value: 1,
    });
    // A bare exported 0 stays unknown for both Bing metrics.
    expect(saved.parsed?.input.rows[1].cells.citations.status).toBe("unknown_export_zero");
    expect(saved.parsed?.input.rows[1].cells.cited_pages.status).toBe("unknown_export_zero");
    // Exact retry (same bytes + completeness + note) returns the stored interpretation unchanged.
    const retry = await persistNativeReport(
      scope,
      a.id,
      "partial",
      "Nov 11–12 not yet in export",
      rpc,
    );
    expect(retry.parsed).toEqual(saved.parsed);
  });
  it("rejects a Bing artifact whose staged metadata forges a market, timezone or filter", async () => {
    const market = await stage({ ...bingMetadata, marketScope: { country: "SWE", exposed: true } });
    await expect(persistNativeReport(scope, market.id, "partial", "", rpc)).rejects.toThrow(
      /native_parsed_metadata_mismatch/,
    );
    const tz = await stage({
      ...bingMetadata,
      period: { ...bingMetadata.period, timezone: "UTC" },
    });
    await expect(persistNativeReport(scope, tz.id, "partial", "", rpc)).rejects.toThrow(
      /native_parsed_metadata_mismatch/,
    );
    const filtered = await stage({ ...bingMetadata, filters: { Country: "Sweden" } });
    await expect(persistNativeReport(scope, filtered.id, "partial", "", rpc)).rejects.toThrow(
      /native_parsed_metadata_mismatch/,
    );
  });
  it("keeps an already-stored Google v1 record readable unchanged after the Bing variant", async () => {
    // A Google record saved through the same (now source-routed) schema still round-trips: the
    // widened parserVersion/file enums and Bing branch add no new required fields to a Google record.
    const a = await stage();
    const saved = await persistNativeReport(scope, a.id, "partial", "outage", rpc);
    const read = await readNativeReportParsed(scope, a.id, rpc);
    expect(read.parsed).toEqual(saved.parsed);
    expect(read.parsed?.parserVersion).toBe("native-google-ai-csv-v1");
    expect(read.parsed?.input.source).toBe("gsc_generative_ai_search");
  });
});
