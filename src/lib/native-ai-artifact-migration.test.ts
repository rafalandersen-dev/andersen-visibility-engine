import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import {
  getNativeArtifact,
  readNativeArtifacts,
  removeNativeArtifact,
  stageNativeArtifact,
} from "./native-ai-artifact.server";
import {
  MAX_NATIVE_ARTIFACT_BASE64,
  MAX_NATIVE_ARTIFACT_METADATA_BYTES,
  nativeArtifactBase64ByteLength,
  nativeArtifactBase64Schema,
  nativeArtifactMetadataJsonbBytes,
  nativeArtifactMetadataSchema,
  nativeArtifactScopeKey,
  nativeArtifactStageInputSchema,
} from "./native-ai-artifact";
import { MAX_NATIVE_REPORT_BYTES } from "./native-ai-report";
import type { KnowledgeRpc } from "./project-knowledge.server";
let db: PGlite;
const user = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const scope = { ownerId: user, projectId: "p" };
const metadata = {
  source: "bing_ai_performance" as const,
  declaredProperty: "https://example.com/",
  reportKind: "table" as const,
  dimension: "page" as const,
  aggregation: "page" as const,
  period: { start: "2026-08-01", end: "2026-08-28", timezone: null },
  marketScope: { country: null, exposed: false },
  filters: {},
  capturedAt: "2026-08-29T00:00:00Z",
  filename: "ai-performance-export",
};
// Opaque bytes: the artifact is never parsed at P1, so the content deliberately is not a CSV.
const bytes = new TextEncoder().encode("synthetic-opaque-native-export-artifact-bytes");
const base64 = Buffer.from(bytes).toString("base64");
const sha = createHash("sha256").update(bytes).digest("hex");
const b64 = (text: string) => Buffer.from(new TextEncoder().encode(text)).toString("base64");
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
const stage = (m: unknown, body: string, s = scope) =>
  stageNativeArtifact(s, { metadata: m, base64: body }, rpc);
// Direct SQL save that bypasses the client validators, to probe the database boundary itself.
const rawSave = (m: unknown, body = base64) =>
  db.query("SELECT save_ai_native_report_artifact($1,'p',$2::jsonb,$3)", [
    user,
    JSON.stringify(m),
    body,
  ]);
const count = async () =>
  Number(
    (await db.query<{ n: number }>("SELECT count(*)::int n FROM ai_native_report_artifacts"))
      .rows[0].n,
  );
const totalBytes = async () =>
  Number(
    (
      await db.query<{ n: string }>(
        "SELECT coalesce(sum(byte_length),0)::bigint n FROM ai_native_report_artifacts",
      )
    ).rows[0].n,
  );
const findArtifact = async (id: string) =>
  (await readNativeArtifacts(scope, rpc)).artifacts.find((r) => r.id === id);
// Real PostgreSQL canonical jsonb byte length of a stored row's metadata — the exact value the
// table CHECK and save RPC bound at <=8000, used to prove the client projection is byte-exact.
const dbMetadataBytes = async (id: string) =>
  Number(
    (
      await db.query<{ n: number }>(
        "SELECT octet_length(metadata::text)::int n FROM ai_native_report_artifacts WHERE id=$1",
        [id],
      )
    ).rows[0].n,
  );
// Each CJK ideograph is one JS char but three UTF-8 bytes, so char-length bounds and byte cost diverge.
const cjk = (chars: number) => "文".repeat(chars);
const parsedBytes = (m: unknown) =>
  nativeArtifactMetadataJsonbBytes(nativeArtifactMetadataSchema.parse(m));
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);CREATE TABLE workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));",
  );
  await db.query("INSERT INTO auth.users VALUES($1),($2)", [user, other]);
  await db.query("INSERT INTO workspace_meta(user_id) VALUES($1),($2)", [user, other]);
  for (const name of [
    "20260909200000_project_knowledge.sql",
    "20260919150000_native_report_artifacts.sql",
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
describe("raw native-report artifact staging SQL with real server round trips", () => {
  it("stores opaque bytes with a server-derived hash and scope, pending status, and no bytes in the list", async () => {
    const a = await stage(metadata, base64);
    // Every trustworthy field is attributed by the server, not the caller.
    expect(a).toMatchObject({
      sha256: sha,
      byteLength: bytes.length,
      status: "pending_parser",
      supersedesId: null,
      actorId: user,
    });
    // The scope key is DB-derived (a sha256 hex of the canonical declared identity), never imported.
    expect(a.scopeKey).toMatch(/^[a-f0-9]{64}$/);
    // A byte-identical re-stage under the same scope is idempotent, never a second row.
    expect((await stage(metadata, base64)).id).toBe(a.id);
    expect(await count()).toBe(1);
    const state = await readNativeArtifacts(scope, rpc);
    expect(state.artifacts).toHaveLength(1);
    expect((state.artifacts[0] as Record<string, unknown>).base64).toBeUndefined();
    // Single retrieval returns the exact raw bytes verbatim.
    const detail = await getNativeArtifact(scope, a.id, rpc);
    expect(Buffer.from(detail.base64, "base64").equals(Buffer.from(bytes))).toBe(true);
    expect(detail.sha256).toBe(sha);
  });
  it("derives scope in the database, collapsing canonical equivalents and separating different meanings", async () => {
    const base = {
      ...metadata,
      declaredProperty: "https://example.com/report",
      marketScope: { country: "usa", exposed: true },
      filters: { device: "mobile", country: "us" },
    };
    // Canonical equivalents: scheme/host case folds, country case folds, filter order is irrelevant.
    const equivalents = [
      { ...base, declaredProperty: "HTTPS://Example.COM/report" },
      { ...base, marketScope: { country: "USA", exposed: true } },
      { ...base, filters: { country: "us", device: "mobile" } },
    ];
    // Different meanings: the path stays case-significant, and a different filter value is distinct.
    const distinct = [
      { ...base, declaredProperty: "https://example.com/Report" },
      { ...base, filters: { device: "desktop", country: "us" } },
    ];
    const first = await stage(base, base64);
    for (const m of equivalents) {
      // The client predictor agrees these are one logical scope, and the DB collapses them (same
      // derived scope + identical bytes is idempotent, not a forged second lineage).
      expect(nativeArtifactScopeKey(m)).toBe(nativeArtifactScopeKey(base));
      expect((await stage(m, base64)).id).toBe(first.id);
    }
    for (const m of distinct) {
      expect(nativeArtifactScopeKey(m)).not.toBe(nativeArtifactScopeKey(base));
      const r = await stage(m, base64);
      expect(r.id).not.toBe(first.id);
      // A different meaning is its own lineage, never a supersession of an unrelated scope.
      expect(r.supersedesId).toBe(null);
    }
    expect(await count()).toBe(3);
  });
  it("keeps byte-identical exports under different declared scope as independent lineages", async () => {
    const base = await stage(metadata, base64);
    const differ = [
      { ...metadata, aggregation: "property" as const },
      { ...metadata, period: { ...metadata.period, end: "2026-08-29" } },
      { ...metadata, filters: { device: "mobile" } },
    ];
    const rows = [base];
    for (const m of differ) rows.push(await stage(m, base64));
    // Same bytes, different scope: four distinct staged rows, none superseding another.
    expect(new Set(rows.map((r) => r.id)).size).toBe(4);
    expect(new Set(rows.map((r) => r.scopeKey)).size).toBe(4);
    expect(rows.every((r) => r.supersedesId === null)).toBe(true);
    expect(await count()).toBe(4);
  });
  it("versions a same-scope reimport by superseding the head and refuses a competing successor", async () => {
    const v1 = await stage(metadata, base64);
    const v2 = await stage(metadata, b64("corrected-native-export"));
    expect(v2.supersedesId).toBe(v1.id);
    // A byte-identical re-stage of the original bytes stays idempotent even after supersession.
    expect((await stage(metadata, base64)).id).toBe(v1.id);
    // A second successor pinned to the same predecessor is rejected by the unique guard.
    await expect(
      db.query(
        "INSERT INTO ai_native_report_artifacts(user_id,project_id,scope_key,artifact_sha256,byte_length,bytes,metadata,supersedes_id,actor_id) VALUES($1,'p',$2,repeat('a',64),3,convert_to('xyz','UTF8'),$3::jsonb,$4,$1)",
        [user, v1.scopeKey, JSON.stringify(metadata), v1.id],
      ),
    ).rejects.toThrow();
    expect(await count()).toBe(2);
  });
  it("never cascades a kept later version away when its predecessor is deleted", async () => {
    // Build a three-version lineage v1<-v2<-v3 plus an unrelated-scope artifact.
    const v1 = await stage(metadata, b64("chain-v1"));
    const v2 = await stage(metadata, b64("chain-v2"));
    const v3 = await stage(metadata, b64("chain-v3"));
    expect([v2.supersedesId, v3.supersedesId]).toEqual([v1.id, v2.id]);
    const unrelated = await stage(
      { ...metadata, aggregation: "unknown" as const },
      b64("unrelated"),
    );
    const before = await totalBytes();
    // Deleting the MIDDLE version must not erase the distinct later version the owner kept.
    await removeNativeArtifact(scope, v2.id, rpc);
    const ids = new Set((await readNativeArtifacts(scope, rpc)).artifacts.map((r) => r.id));
    expect(ids.has(v1.id) && ids.has(v3.id) && ids.has(unrelated.id)).toBe(true);
    expect(ids.has(v2.id)).toBe(false);
    expect(await count()).toBe(3);
    // v3's raw bytes survive verbatim; it is orphaned to a lineage root (history gap, by design).
    expect(
      Buffer.from((await getNativeArtifact(scope, v3.id, rpc)).base64, "base64").toString(),
    ).toBe("chain-v3");
    expect(
      (await readNativeArtifacts(scope, rpc)).artifacts.find((r) => r.id === v3.id)?.supersedesId,
    ).toBe(null);
    // Only the deleted artifact's quota is freed; the unrelated lineage is untouched.
    expect(await totalBytes()).toBe(before - v2.byteLength);
    // A same-scope reimport supersedes the latest surviving head of that lineage (the two orphaned
    // roots v1 and v3 are ordered exactly as the DB head-selection does: createdAt then id, desc).
    const roots = (await readNativeArtifacts(scope, rpc)).artifacts.filter(
      (r) => r.scopeKey === v3.scopeKey,
    );
    const expectedHead = roots.reduce((a, b) =>
      b.createdAt > a.createdAt || (b.createdAt === a.createdAt && b.id > a.id) ? b : a,
    );
    expect((await stage(metadata, b64("chain-v4"))).supersedesId).toBe(expectedHead.id);
    // A byte-identical replay of a surviving version stays idempotent.
    expect((await stage(metadata, b64("chain-v3"))).id).toBe(v3.id);
  });
  it("re-heads a lineage correctly when the oldest or the latest version is deleted", async () => {
    const oldest = await stage(metadata, b64("oldest"));
    const middle = await stage(metadata, b64("middle"));
    const latest = await stage(metadata, b64("latest"));
    // Delete the OLDEST: its successor is orphaned, the rest of the chain and its bytes survive.
    await removeNativeArtifact(scope, oldest.id, rpc);
    expect(await count()).toBe(2);
    expect(
      (await readNativeArtifacts(scope, rpc)).artifacts.find((r) => r.id === middle.id)
        ?.supersedesId,
    ).toBe(null);
    expect(
      Buffer.from((await getNativeArtifact(scope, latest.id, rpc)).base64, "base64").toString(),
    ).toBe("latest");
    // Delete the LATEST (current head): the earlier chain below it stays linked and re-heads.
    await removeNativeArtifact(scope, latest.id, rpc);
    expect(await count()).toBe(1);
    const survivor = (await readNativeArtifacts(scope, rpc)).artifacts;
    expect(survivor.map((r) => r.id)).toEqual([middle.id]);
    expect((await stage(metadata, b64("reimport"))).supersedesId).toBe(middle.id);
  });
  it("records a server-derived predecessor_deleted marker only on the direct successor of a removed predecessor", async () => {
    // A genuinely new root carries no deleted-predecessor marker.
    const solo = await stage({ ...metadata, aggregation: "unknown" as const }, b64("solo"));
    expect(solo.supersedesId).toBe(null);
    expect(solo.predecessorDeleted).toBe(false);

    // Lineage A (page-aggregated): v1<-v2<-v3, delete the MIDDLE version.
    const a1 = await stage(metadata, b64("A-v1"));
    const a2 = await stage(metadata, b64("A-v2"));
    const a3 = await stage(metadata, b64("A-v3"));
    expect([a1, a2, a3].map((r) => r.predecessorDeleted)).toEqual([false, false, false]);
    await removeNativeArtifact(scope, a2.id, rpc);
    // Only the direct successor of the removed predecessor is orphaned AND marked.
    const a3after = await findArtifact(a3.id);
    expect(a3after?.supersedesId).toBe(null);
    expect(a3after?.predecessorDeleted).toBe(true);
    // The untouched earlier root stays a genuine root with no marker.
    expect((await findArtifact(a1.id))?.predecessorDeleted).toBe(false);
    // The marker is server-derived state, not a caller-writable field; an idempotent byte-identical
    // restage returns the same row and preserves it (the marker is validated back through save too).
    const a3replay = await stage(metadata, b64("A-v3"));
    expect(a3replay.id).toBe(a3.id);
    expect(a3replay.predecessorDeleted).toBe(true);
    expect(a3replay.supersedesId).toBe(null);

    // Lineage B (property-aggregated): delete the OLDEST; only its direct successor is marked.
    const bMeta = { ...metadata, aggregation: "property" as const };
    const b1 = await stage(bMeta, b64("B-v1"));
    const b2 = await stage(bMeta, b64("B-v2"));
    const b3 = await stage(bMeta, b64("B-v3"));
    await removeNativeArtifact(scope, b1.id, rpc);
    expect((await findArtifact(b2.id))?.predecessorDeleted).toBe(true);
    expect((await findArtifact(b2.id))?.supersedesId).toBe(null);
    // The version further down the chain keeps its intact link and no marker (not a transitive flag).
    expect((await findArtifact(b3.id))?.predecessorDeleted).toBe(false);
    expect((await findArtifact(b3.id))?.supersedesId).toBe(b2.id);

    // Lineage C (query-aggregated): delete the LATEST head; nothing gains a marker and only its quota frees.
    const cMeta = { ...metadata, aggregation: "query" as const };
    const c1 = await stage(cMeta, b64("C-v1"));
    const c2 = await stage(cMeta, b64("C-v2"));
    const beforeQuota = await totalBytes();
    const beforeCount = await count();
    await removeNativeArtifact(scope, c2.id, rpc);
    const c1after = await findArtifact(c1.id);
    expect(c1after?.predecessorDeleted).toBe(false);
    expect(c1after?.supersedesId).toBe(null);
    // Deleting a head with no successor marks nothing and cascades no extra rows; only c2's quota frees.
    expect(await totalBytes()).toBe(beforeQuota - c2.byteLength);
    expect(await count()).toBe(beforeCount - 1);
    // The solo unrelated root is still an unmarked genuine root throughout.
    expect((await findArtifact(solo.id))?.predecessorDeleted).toBe(false);
  });
  it("rejects impossible or reversed periods and a wrong GSC timezone at the database", async () => {
    for (const badPeriod of [
      { start: "2026-02-30", end: "2026-02-30", timezone: null }, // impossible day
      { start: "2027-02-29", end: "2027-02-29", timezone: null }, // Feb 29 in a non-leap year
      { start: "2026-13-01", end: "2026-13-01", timezone: null }, // impossible month
      { start: "2026-08-28", end: "2026-08-01", timezone: null }, // reversed
    ])
      await expect(rawSave({ ...metadata, period: badPeriod })).rejects.toThrow(
        /invalid_native_artifact/,
      );
    // GSC is dated in Pacific Time; a missing or foreign timezone is never assumed at the DB.
    for (const tz of [null, "UTC"])
      await expect(
        rawSave({
          ...metadata,
          source: "gsc_generative_ai_search",
          period: { start: "2026-08-01", end: "2026-08-28", timezone: tz },
        }),
      ).rejects.toThrow(/invalid_native_artifact/);
    // A real leap day and the correct GSC timezone are accepted (same-day period allowed).
    expect(
      (
        await stage(
          { ...metadata, period: { start: "2028-02-29", end: "2028-02-29", timezone: null } },
          base64,
        )
      ).status,
    ).toBe("pending_parser");
    expect(
      (
        await stage(
          {
            ...metadata,
            source: "gsc_generative_ai_search" as const,
            period: { start: "2026-08-01", end: "2026-08-28", timezone: "America/Los_Angeles" },
          },
          base64,
        )
      ).status,
    ).toBe("pending_parser");
    expect(await count()).toBe(2);
  });
  it("refuses forged server or parsed fields and any unexpected metadata key at the database", async () => {
    for (const forged of [
      "rows",
      "cells",
      "value",
      "status",
      "sha256",
      "id",
      "actorId",
      "scopeKey",
      "supersedesId",
      "byteLength",
      "bytes",
      "provenance",
      "parserVersion",
      "verified",
      "review",
    ])
      await expect(
        rawSave({ ...metadata, [forged]: forged === "rows" || forged === "cells" ? [] : "x" }),
      ).rejects.toThrow(/invalid_native_artifact/);
    // An arbitrary off-contract key is refused by the strict allowlist, not only the known fields.
    await expect(rawSave({ ...metadata, unexpectedExtra: "x" })).rejects.toThrow(
      /invalid_native_artifact/,
    );
    // Strict sub-object shapes: an extra key inside period is refused too.
    await expect(
      rawSave({ ...metadata, period: { ...metadata.period, extra: "x" } }),
    ).rejects.toThrow(/invalid_native_artifact/);
    expect(await count()).toBe(0);
  });
  it("refuses a null, missing or wrong-typed required enum directly at the database", async () => {
    // A JSON null makes `x ->> k` SQL NULL, so a bare `NOT IN` is UNKNOWN and would not reject; the
    // DB must still refuse null / missing / wrong-typed values for every required string enum, or an
    // off-contract row would persist and later break the strict read/list parse for the whole project.
    for (const key of ["source", "reportKind", "dimension", "aggregation"]) {
      const missing = { ...metadata } as Record<string, unknown>;
      delete missing[key];
      for (const bad of [
        { ...metadata, [key]: null }, // JSON null value (the three-valued-logic gap)
        missing, // key absent entirely
        { ...metadata, [key]: 5 }, // wrong JSON type: number
        { ...metadata, [key]: {} }, // wrong JSON type: object
      ])
        await expect(rawSave(bad)).rejects.toThrow(/invalid_native_artifact/);
    }
    // No poisoned row persisted, and a valid stage + list still work afterwards.
    expect(await count()).toBe(0);
    const ok = await stage(metadata, base64);
    const listed = await readNativeArtifacts(scope, rpc);
    expect(listed.artifacts.map((r) => r.id)).toEqual([ok.id]);
    expect(listed.artifacts[0].status).toBe("pending_parser");
  });
  it("enforces strict base64 at the database boundary", async () => {
    // A positive opaque body is stored and round-trips to the exact bytes.
    const ok = await stage(metadata, base64);
    expect(
      Buffer.from((await getNativeArtifact(scope, ok.id, rpc)).base64, "base64").equals(
        Buffer.from(bytes),
      ),
    ).toBe(true);
    for (const bad of [
      "A".repeat(2796208), // one group past the base64 length of the 2 MiB cap
      base64.slice(0, 4) + " " + base64.slice(4), // embedded whitespace
      base64 + "=", // misplaced padding on an unpadded body (length not a multiple of four)
      base64.slice(0, -1), // length not a multiple of four
      "@@@@", // non-alphabet characters
      "Qh==", // non-canonical trailing-bit encoding (aliases the canonical Qg==)
    ])
      await expect(rawSave(metadata, bad)).rejects.toThrow();
    // Only the single valid body persisted; nothing was coerced or partially stored.
    expect(await count()).toBe(1);
  });
  it("isolates owners and projects for list, retrieval and deletion", async () => {
    const a = await stage(metadata, base64);
    for (const foreign of [
      { ownerId: other, projectId: "p" },
      { ownerId: user, projectId: "q" },
    ]) {
      expect((await readNativeArtifacts(foreign, rpc)).artifacts).toEqual([]);
      await expect(getNativeArtifact(foreign, a.id, rpc)).rejects.toThrow();
      // A foreign removal targets nothing in that scope and cannot erase the owner's artifact.
      await removeNativeArtifact(foreign, a.id, rpc);
    }
    expect((await readNativeArtifacts(scope, rpc)).artifacts).toHaveLength(1);
    await expect(
      readNativeArtifacts({ ownerId: user, projectId: "missing" }, rpc),
    ).rejects.toThrow();
  });
  it("refuses a new scope at capacity with the deterministic capacity code, stays idempotent at capacity, and frees quota on deletion", async () => {
    const a = await stage(metadata, base64);
    // Fill to the 20-artifact bound with distinct-scope synthetic rows.
    await db.query(
      "INSERT INTO ai_native_report_artifacts(user_id,project_id,scope_key,artifact_sha256,byte_length,bytes,metadata,actor_id) SELECT $1,'p','synthetic-scope-'||g,md5(g::text)||md5(g::text),octet_length(convert_to('x'||g,'UTF8')),convert_to('x'||g,'UTF8'),$2::jsonb,$1 FROM generate_series(1,19) g",
      [user, JSON.stringify(metadata)],
    );
    expect(await count()).toBe(20);
    // A NEW scope is refused with the exact allowlisted capacity code the owner resolves by deleting,
    // surfaced through the server wrapper — not collapsed to the generic unavailable code.
    await expect(stage({ ...metadata, aggregation: "unknown" }, base64)).rejects.toThrow(
      "native_artifact_capacity",
    );
    // An idempotent re-stage of an already-present artifact still returns it at capacity: same scope +
    // same bytes short-circuits before the cap check, so no race-unsafe client precheck is needed.
    expect((await stage(metadata, base64)).id).toBe(a.id);
    expect(await count()).toBe(20);
    // Explicit deletion frees quota so a new scope can be staged again.
    await removeNativeArtifact(scope, a.id, rpc);
    expect(await count()).toBe(19);
    expect((await stage({ ...metadata, aggregation: "unknown" }, base64)).status).toBe(
      "pending_parser",
    );
    expect(await count()).toBe(20);
  });
  it("cascades raw bytes when the owning project is deleted", async () => {
    await stage(metadata, base64);
    await db.query(
      "DELETE FROM workspace_entities WHERE user_id=$1 AND collection='projects' AND entity_id='p'",
      [user],
    );
    expect(await count()).toBe(0);
  });
  it("has RLS and exposes only the service RPCs, not the table", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query("SELECT * FROM ai_native_report_artifacts")).rejects.toThrow(
        /permission denied/,
      );
      if (role !== "service_role")
        await expect(
          db.query("SELECT read_ai_native_report_artifacts($1,$2)", [user, "p"]),
        ).rejects.toThrow(/permission denied/);
      else
        expect(
          (await db.query("SELECT read_ai_native_report_artifacts($1,$2) data", [user, "p"]))
            .rows[0],
        ).toEqual({ data: { artifacts: [] } });
      await db.exec("RESET ROLE");
    }
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM pg_class WHERE relname='ai_native_report_artifacts' AND relrowsecurity",
        )
      ).rows[0],
    ).toEqual({ n: 1 });
  });
});
describe("aggregate declared-metadata byte cap aligned with the real database jsonb limit", () => {
  it("rejects a per-field-valid payload that sums past the DB byte cap before any RPC, matching the DB", async () => {
    // Twenty filters, each individually in-bounds (<=20 filters; key<=64; value<=200 chars) but whose
    // multibyte values sum far past the DB's 8000-byte metadata cap. Before this boundary check such a
    // payload cleared validation and then died with a generic RPC size error.
    const huge = {
      ...metadata,
      filters: Object.fromEntries(
        Array.from({ length: 20 }, (_, i): [string, string] => ["k" + i, cjk(200)]),
      ),
    };
    expect(Object.keys(huge.filters)).toHaveLength(20);
    expect(Object.values(huge.filters).every((v) => v.length === 200)).toBe(true);
    expect(Object.keys(huge.filters).every((k) => k.length <= 64)).toBe(true);
    // Aggregate jsonb bytes exceed the cap; the shared metadata schema now refuses it.
    const hugeBytes = nativeArtifactMetadataJsonbBytes(huge);
    expect(hugeBytes).toBeGreaterThan(MAX_NATIVE_ARTIFACT_METADATA_BYTES);
    expect(nativeArtifactMetadataSchema.safeParse(huge).success).toBe(false);
    // The client boundary rejects it BEFORE any RPC (no row created)...
    await expect(stage(huge, base64)).rejects.toThrow();
    expect(await count()).toBe(0);
    // ...and the database itself rejects the same payload on its metadata byte cap, so the boundary
    // mirrors a real DB refusal instead of an invented undersized limit.
    await expect(rawSave(huge)).rejects.toThrow(/invalid_native_artifact/);
    expect(await count()).toBe(0);
  });
  it("accepts a multibyte payload packed to the cap and retrieves it byte-exactly through real SQL", async () => {
    // Pack 200-char CJK filters until one more would cross the cap; the byte budget, not the 20-filter
    // count, is what bounds the set, so this exercises the size boundary specifically.
    const filters: Record<string, string> = {};
    for (let i = 0; i < 20; i++) {
      const next = { ...metadata, filters: { ...filters, ["k" + i]: cjk(200) } };
      if (nativeArtifactMetadataJsonbBytes(next) > MAX_NATIVE_ARTIFACT_METADATA_BYTES) break;
      filters["k" + i] = cjk(200);
    }
    const packed = { ...metadata, filters };
    const filterCount = Object.keys(packed.filters).length;
    expect(filterCount).toBeGreaterThan(0);
    // Stopped by the byte budget, not the 20-filter count cap.
    expect(filterCount).toBeLessThan(20);
    const projected = parsedBytes(packed);
    expect(projected).toBeLessThanOrEqual(MAX_NATIVE_ARTIFACT_METADATA_BYTES);
    // Genuinely near the cap (within one filter of it), spending the multibyte budget.
    expect(projected).toBeGreaterThan(7000);
    // One further in-bounds filter (still <=20, value<=200) tips it over: the boundary and DB agree.
    const over = { ...packed, filters: { ...packed.filters, extra: cjk(200) } };
    expect(Object.keys(over.filters).length).toBeLessThanOrEqual(20);
    const overBytes = nativeArtifactMetadataJsonbBytes(over);
    expect(overBytes).toBeGreaterThan(MAX_NATIVE_ARTIFACT_METADATA_BYTES);
    expect(nativeArtifactMetadataSchema.safeParse(over).success).toBe(false);
    await expect(rawSave(over)).rejects.toThrow(/invalid_native_artifact/);
    // The packed payload stages, and the DB's actual metadata byte length equals the client projection
    // (byte-exact vs real PostgreSQL) within the cap, so an accepted payload cannot fail only on size.
    const staged = await stage(packed, base64);
    expect(staged.status).toBe("pending_parser");
    const dbBytes = await dbMetadataBytes(staged.id);
    expect(dbBytes).toBe(projected);
    expect(dbBytes).toBeLessThanOrEqual(MAX_NATIVE_ARTIFACT_METADATA_BYTES);
    // The multibyte metadata round-trips through real SQL exactly, and the raw bytes are untouched.
    const detail = await getNativeArtifact(scope, staged.id, rpc);
    expect(detail.metadata).toEqual(nativeArtifactMetadataSchema.parse(packed));
    expect(Buffer.from(detail.base64, "base64").equals(Buffer.from(bytes))).toBe(true);
    expect(await count()).toBe(1);
  });
  it("projects the DB metadata byte length exactly for ASCII, escaping and spacing-sensitive payloads", async () => {
    // Representative shapes around the cap: plain ASCII, multibyte fields, an escaping-heavy value
    // (quote / backslash / newline / tab / control char) and twenty tiny filters that maximize the
    // ", " and ": " separator overhead. For each, the client projection must equal the DB's canonical
    // octet_length, so a JS-accepted canonical payload can never fail only on the database size check.
    const escaping = 'q:"quote" b:\\back nl:\n tab:\t ctrl:' + String.fromCharCode(1);
    const tinyFilters = Object.fromEntries(
      Array.from({ length: 20 }, (_, i): [string, string] => [String.fromCharCode(97 + i), "x"]),
    );
    const samples: unknown[] = [
      metadata, // plain ASCII, empty filters
      { ...metadata, declaredProperty: "https://例え.example/パス", filename: "レポート.csv" },
      { ...metadata, filters: { note: escaping } },
      { ...metadata, filters: tinyFilters },
    ];
    for (const sample of samples) {
      const staged = await stage(sample, base64);
      const projected = parsedBytes(sample);
      expect(await dbMetadataBytes(staged.id)).toBe(projected);
      expect(projected).toBeLessThanOrEqual(MAX_NATIVE_ARTIFACT_METADATA_BYTES);
      // The escaping-heavy value survives verbatim through the jsonb round trip.
      expect((await getNativeArtifact(scope, staged.id, rpc)).metadata).toEqual(
        nativeArtifactMetadataSchema.parse(sample),
      );
    }
    expect(await count()).toBe(samples.length); // four distinct declared scopes, none collapsed
  });
});
describe("base64 decoded-byte boundary and canonical trailing-bit padding", () => {
  // Three bodies whose decoded sizes straddle the 2 MiB cap by one byte, built as zero-filled buffers so
  // the encoding is deterministic. The finding: 2 MiB - 1 (two `=`), 2 MiB (one `=`) and 2 MiB + 1 (no
  // padding) all encode to the SAME MAX_NATIVE_ARTIFACT_BASE64-length string, so the encoded-length
  // ceiling alone cannot separate in-cap from oversize — only the pre-decode padding arithmetic can.
  const oneUnder = Buffer.alloc(MAX_NATIVE_REPORT_BYTES - 1).toString("base64");
  const atCap = Buffer.alloc(MAX_NATIVE_REPORT_BYTES).toString("base64");
  const overByOne = Buffer.alloc(MAX_NATIVE_REPORT_BYTES + 1).toString("base64");
  it("bounds the decoded byte count where the identical encoded length cannot (padding 2/1/0)", () => {
    // All three share the exact maximum encoded length: a length-only gate would accept every one.
    for (const v of [oneUnder, atCap, overByOne]) expect(v.length).toBe(MAX_NATIVE_ARTIFACT_BASE64);
    // They differ only in trailing padding — two, one and zero `=` — which is what the byte count turns on.
    expect(oneUnder.endsWith("==")).toBe(true);
    expect(atCap.endsWith("=") && !atCap.endsWith("==")).toBe(true);
    expect(overByOne.endsWith("=")).toBe(false);
    // The pre-decode arithmetic recovers the true decoded size for each padding case.
    expect(nativeArtifactBase64ByteLength(oneUnder)).toBe(MAX_NATIVE_REPORT_BYTES - 1);
    expect(nativeArtifactBase64ByteLength(atCap)).toBe(MAX_NATIVE_REPORT_BYTES);
    expect(nativeArtifactBase64ByteLength(overByOne)).toBe(MAX_NATIVE_REPORT_BYTES + 1);
    // The schema accepts exactly the in-cap bodies and refuses the +1 of identical encoded length.
    expect(nativeArtifactBase64Schema.safeParse(oneUnder).success).toBe(true);
    expect(nativeArtifactBase64Schema.safeParse(atCap).success).toBe(true);
    expect(nativeArtifactBase64Schema.safeParse(overByOne).success).toBe(false);
  });
  it("accepts a 2 MiB body end-to-end but refuses 2 MiB+1 before any RPC, while the DB still refuses oversize", async () => {
    // Exactly 2 MiB stages and round-trips to the exact bytes through real SQL.
    const okStaged = await stage(metadata, atCap);
    expect(okStaged.byteLength).toBe(MAX_NATIVE_REPORT_BYTES);
    const detail = await getNativeArtifact(scope, okStaged.id, rpc);
    const roundTrip = Buffer.from(detail.base64, "base64");
    expect(roundTrip.equals(Buffer.alloc(MAX_NATIVE_REPORT_BYTES))).toBe(true);
    expect(detail.base64.length).toBe(MAX_NATIVE_ARTIFACT_BASE64);
    expect(await count()).toBe(1);
    // 2 MiB + 1 — identical encoded length — is refused at the client boundary BEFORE the RPC: no new row.
    await expect(stage(metadata, overByOne)).rejects.toThrow();
    expect(await count()).toBe(1);
    // The database independently still refuses the same oversize decoded body (rawSave bypasses the client
    // schema), so the input boundary mirrors a real DB rejection rather than an invented undersized limit.
    await expect(rawSave(metadata, overByOne)).rejects.toThrow();
    expect(await count()).toBe(1);
  });
  it("mirrors the DB's canonical trailing-bit padding for short bodies", () => {
    // With `==` the two dead bits must be zero: canonical `Qg==` (byte 0x42) is accepted; the alias `Qh==`
    // decodes to the same byte but is refused at the boundary exactly as the DB's canonical round-trip
    // refuses it (see the strict-base64 DB probe above).
    expect(nativeArtifactBase64Schema.safeParse("Qg==").success).toBe(true);
    expect(nativeArtifactBase64Schema.safeParse("Qh==").success).toBe(false);
    // With one `=` the final data char carries two dead bits: canonical `AAA=` (two zero bytes) is
    // accepted, its non-canonical alias `AAB=` refused.
    expect(nativeArtifactBase64Schema.safeParse("AAA=").success).toBe(true);
    expect(nativeArtifactBase64Schema.safeParse("AAB=").success).toBe(false);
    // A canonical short body passes through the schema byte-for-byte — owner bytes are never rewritten.
    expect(nativeArtifactBase64Schema.parse("Qg==")).toBe("Qg==");
  });
});
describe("server wrapper surfaces only allowlisted capacity codes, else the generic code with no raw leak", () => {
  const okInput = { metadata, base64 };
  const failing =
    (message: string): KnowledgeRpc =>
    async () => ({ data: null, error: { message } });
  it("passes each allowlisted capacity code through verbatim so the owner can resolve it by deleting", async () => {
    for (const code of ["native_artifact_capacity", "native_artifact_byte_capacity"])
      await expect(stageNativeArtifact(scope, okInput, failing(code))).rejects.toThrow(
        new RegExp("^" + code + "$"),
      );
  });
  it("collapses every other DB, auth, network or missing-row error to the generic code, leaking no raw text", async () => {
    for (const raw of [
      "invalid_native_artifact",
      "native_artifact_too_large",
      "permission denied for function save_ai_native_report_artifact",
      "connection terminated unexpectedly",
      'duplicate key value violates unique constraint "ai_native_report_artifacts_pkey"',
    ])
      await expect(stageNativeArtifact(scope, okInput, failing(raw))).rejects.toThrow(
        /^native_artifact_unavailable$/,
      );
  });
});
describe("DB free-text bounds count UTF-16 code units, matching Zod and the read-back parse", () => {
  // Each astral (supplementary) character is one Postgres code point but two JS/Zod UTF-16 units, so a
  // value in-bounds by code points can still exceed the Zod cap by units. `rawSave` bypasses the client
  // schema to probe the DB boundary directly — exactly the path a direct service RPC would take, which
  // previously persisted a poison row that then broke the whole project's strict list/get parse.
  const emoji = (n: number) => "😀".repeat(n); // U+1F600: 1 code point, 2 UTF-16 units
  const cases = [
    {
      field: "filter value <=200",
      at: { ...metadata, filters: { k: emoji(100) } },
      over: { ...metadata, filters: { k: emoji(101) } },
    },
    {
      field: "filter key <=64",
      at: { ...metadata, filters: { [emoji(32)]: "v" } },
      over: { ...metadata, filters: { [emoji(33)]: "v" } },
    },
    {
      field: "declaredProperty <=500",
      at: { ...metadata, declaredProperty: emoji(250) },
      over: { ...metadata, declaredProperty: emoji(251) },
    },
    {
      field: "filename <=255",
      at: { ...metadata, filename: emoji(127) },
      over: { ...metadata, filename: emoji(128) },
    },
    {
      field: "Bing timezone 1..64",
      at: { ...metadata, period: { ...metadata.period, timezone: emoji(32) } },
      over: { ...metadata, period: { ...metadata.period, timezone: emoji(33) } },
    },
    {
      field: "mixed BMP+astral filter value <=200",
      at: { ...metadata, filters: { k: cjk(100) + emoji(50) } },
      over: { ...metadata, filters: { k: cjk(100) + emoji(51) } },
    },
  ];
  it.each(cases)(
    "bounds $field by UTF-16 units at the DB, refusing one unit over with no poison row and staying list-readable at the cap",
    async ({ at, over }) => {
      // One UTF-16 unit over the cap is refused directly by the DB; no off-contract poison row persists.
      await expect(rawSave(over)).rejects.toThrow(/invalid_native_artifact/);
      expect(await count()).toBe(0);
      // Exactly at the cap is accepted and stored, and the list stays readable through the strict Zod
      // parse (which also counts UTF-16 units) — proving a DB-accepted value can never break the read.
      await rawSave(at);
      const listed = await readNativeArtifacts(scope, rpc);
      expect(listed.artifacts).toHaveLength(1);
    },
  );
  it("keeps the nullable Bing branches (null timezone, null filename) working after the length swap", async () => {
    const bingNulls = {
      ...metadata,
      period: { ...metadata.period, timezone: null },
      filename: null,
    };
    await rawSave(bingNulls);
    const listed = await readNativeArtifacts(scope, rpc);
    expect(listed.artifacts).toHaveLength(1);
    expect(listed.artifacts[0].metadata.filename).toBeNull();
    expect(listed.artifacts[0].metadata.period.timezone).toBeNull();
  });
  it("round-trips an at-cap astral filter value through the full client+DB path and refuses one unit over before the RPC", async () => {
    const staged = await stage({ ...metadata, filters: { k: emoji(100) } }, base64); // 200 units, at cap
    expect(staged.status).toBe("pending_parser");
    const detail = await getNativeArtifact(scope, staged.id, rpc);
    expect(detail.metadata.filters.k).toBe(emoji(100));
    // The client schema and the DB agree on the same UTF-16 boundary: one unit over is refused before RPC.
    await expect(stage({ ...metadata, filters: { k: emoji(101) } }, base64)).rejects.toThrow();
    expect(await count()).toBe(1);
  });
});
describe("capturedAt DB validation matches the Zod datetime({offset:true}) reader, preventing rollover poison", () => {
  // Finding 4054871438: PG's ::timestamptz cast rolls a 24:00:00 hour over to the next midnight (and is
  // lenient about 60 min/sec, case and spacing), so the old `\d{2}:\d{2}:\d{2}` regex stored an original
  // string that the read-back Zod `.datetime({offset:true})` then rejects — poisoning the whole project
  // list. The DB now bounds the time components to the reader's ranges, while the ::timestamptz cast still
  // enforces the real calendar and the 2020..now instant and the original string is stored verbatim.
  const bad = [
    "2026-08-29T24:00:00Z", // hour 24: PG rolls to next midnight; the reader rejects it (the finding)
    "2026-08-29T23:60:00Z", // minute 60
    "2026-08-29T23:59:60Z", // second 60 (leap-second style)
    "2026-08-29t12:00:00Z", // lowercase t
    "2026-08-29T12:00:00z", // lowercase z
    "2026-08-29 12:00:00Z", // space instead of T
    "2026-08-29T12:00:00", // missing zone
  ];
  const good = [
    "2026-08-29T00:00:00Z", // canonical midnight (the form 24:00:00 would have aliased)
    "2026-08-29T23:59:59Z", // maximum in-day time
    "2026-08-29T12:34:56.789Z", // fractional seconds
    "2026-08-29T12:00:00+02:00", // positive offset
    "2026-08-29T12:00:00-05:30", // negative offset
    "2024-02-29T12:00:00Z", // real leap day
    "2020-01-01T00:00:00Z", // inclusive lower instant bound
  ];
  it.each(bad)(
    "refuses %s at the DB with no poison row, in agreement with the reader, leaving the list readable",
    async (capturedAt) => {
      // The read-back schema rejects it too, so the DB boundary and the reader now agree.
      expect(nativeArtifactMetadataSchema.safeParse({ ...metadata, capturedAt }).success).toBe(
        false,
      );
      // The DB refuses it directly (rawSave bypasses the client schema); no off-contract row persists.
      await expect(rawSave({ ...metadata, capturedAt })).rejects.toThrow(/invalid_native_artifact/);
      expect(await count()).toBe(0);
      // A valid stage + list still works afterward — no poisoned row was left behind.
      const ok = await stage(metadata, base64);
      expect((await readNativeArtifacts(scope, rpc)).artifacts.map((r) => r.id)).toEqual([ok.id]);
    },
  );
  it.each(good)(
    "accepts %s at the DB, stores it verbatim, and the stored value parses the reader schema",
    async (capturedAt) => {
      // Every DB-accepted value is also reader-valid, so it can never break the project's list/get parse.
      expect(nativeArtifactMetadataSchema.safeParse({ ...metadata, capturedAt }).success).toBe(
        true,
      );
      await rawSave({ ...metadata, capturedAt });
      const listed = await readNativeArtifacts(scope, rpc);
      expect(listed.artifacts).toHaveLength(1);
      // Preserved verbatim (no coercion) and readable through the strict reader schema.
      expect(listed.artifacts[0].metadata.capturedAt).toBe(capturedAt);
    },
  );
  it("rejects an omitted-seconds capturedAt at the DB even though the reader accepts it (stricter write, no poison)", async () => {
    // The reader's `.datetime({offset:true})` permits an omitted seconds field, but the DB deliberately
    // requires HH:MM:SS. This is a WRITE-only tightening — the DB refuses a value the reader would accept,
    // so it can never persist an unreadable row — and is NOT a both-reject parity case; the reader
    // acceptance is asserted explicitly here rather than claimed as a mutual rejection.
    const secondsOmitted = "2026-08-29T12:00Z";
    expect(
      nativeArtifactMetadataSchema.safeParse({ ...metadata, capturedAt: secondsOmitted }).success,
    ).toBe(true);
    await expect(rawSave({ ...metadata, capturedAt: secondsOmitted })).rejects.toThrow(
      /invalid_native_artifact/,
    );
    expect(await count()).toBe(0);
    // Nothing was persisted, so a valid stage + list still works afterward.
    const ok = await stage(metadata, base64);
    expect((await readNativeArtifacts(scope, rpc)).artifacts.map((r) => r.id)).toEqual([ok.id]);
  });
});
describe("staging input applies the DB-compatible capturedAt grammar before the RPC", () => {
  // Finding 4054952996: the shared reader schema's `.datetime({offset:true})` accepts forms the DB's
  // capturedAt grammar refuses (an omitted seconds field, a colon-less offset), so a valid-looking value
  // cleared the public schema and then failed the RPC with a generic error. The stage input now enforces
  // the DB grammar up front (field-specific, before any RPC) while the shared read-back schema stays
  // looser so already-stored values keep parsing.
  const readerValidDbIncompatible = [
    "2026-08-29T12:00Z", // omitted seconds — reader accepts, DB grammar requires HH:MM:SS
    "2026-08-29T12:00:00+0200", // colon-less offset — reader accepts, DB grammar requires [+-]HH:MM
  ];
  const canonical = [
    "2026-08-29T12:00:00Z",
    "2026-08-29T12:00:00.5Z", // fractional seconds
    "2026-08-29T12:00:00+02:00", // colon offset
    "2026-08-29T12:00:00-05:30",
  ];
  it.each(readerValidDbIncompatible)(
    "refuses %s at the stage input boundary before any RPC, while the shared reader schema still accepts it",
    async (capturedAt) => {
      // Historical read-back compatibility retained: the shared metadata schema still accepts the form.
      expect(nativeArtifactMetadataSchema.safeParse({ ...metadata, capturedAt }).success).toBe(
        true,
      );
      // The stage input schema (used by the serverfn and the server) rejects it with a capturedAt path.
      const parsed = nativeArtifactStageInputSchema.safeParse({
        metadata: { ...metadata, capturedAt },
        base64,
      });
      expect(parsed.success).toBe(false);
      if (!parsed.success)
        expect(parsed.error.issues.some((i) => i.path.join(".") === "metadata.capturedAt")).toBe(
          true,
        );
      // End to end through the server path: staging rejects before the RPC, so no row is created.
      await expect(stage({ ...metadata, capturedAt }, base64)).rejects.toThrow();
      expect(await count()).toBe(0);
    },
  );
  it.each(canonical)(
    "accepts canonical %s at the stage input boundary and stages it through real SQL, stored verbatim",
    async (capturedAt) => {
      expect(
        nativeArtifactStageInputSchema.safeParse({ metadata: { ...metadata, capturedAt }, base64 })
          .success,
      ).toBe(true);
      const staged = await stage({ ...metadata, capturedAt }, base64);
      expect(staged.status).toBe("pending_parser");
      expect((await getNativeArtifact(scope, staged.id, rpc)).metadata.capturedAt).toBe(capturedAt);
    },
  );
});
describe("server wrapper normalizes thrown/rejected rpc failures without leaking raw errors", () => {
  // Finding 4055003613: call() had a finally but no catch, so a rejected or synchronously-thrown rpc
  // promise (transport/client failure) escaped past the returned-error allowlist with its raw message.
  // The catch now routes every thrown/rejected error through the same allowlist: only the two exact
  // capacity codes survive (via the returned-error path) and everything else — including secret-like
  // internal text — collapses to the generic code.
  const okInput = { metadata, base64 };
  const rejecting =
    (message: string): KnowledgeRpc =>
    () =>
      Promise.reject(Error(message));
  const throwingSync: KnowledgeRpc = () => {
    throw Error("internal detail: dsn=postgres://user:s3cr3t@host/db");
  };
  it("collapses a rejected rpc promise, including a secret-like internal message, to the generic code", async () => {
    for (const message of [
      "connection terminated: password=hunter2",
      "getaddrinfo ENOTFOUND db.internal",
      "service key sb_secret_abc123 leaked in error text",
    ])
      await expect(stageNativeArtifact(scope, okInput, rejecting(message))).rejects.toThrow(
        /^native_artifact_unavailable$/,
      );
  });
  it("collapses a synchronous throw from the rpc to the generic code", async () => {
    await expect(stageNativeArtifact(scope, okInput, throwingSync)).rejects.toThrow(
      /^native_artifact_unavailable$/,
    );
  });
  it("preserves a returned capacity code but never a rejected one (rejection is transport, not the DB's cap signal)", async () => {
    // A capacity code arrives from the DB as a RETURNED error and is surfaced verbatim...
    await expect(
      stageNativeArtifact(scope, okInput, async () => ({
        data: null,
        error: { message: "native_artifact_capacity" },
      })),
    ).rejects.toThrow(/^native_artifact_capacity$/);
    // ...whereas the same token arriving as a REJECTION is a client/transport failure and is not
    // treated as a deterministic capacity signal — no ambiguous write is retried on its basis.
    await expect(
      stageNativeArtifact(scope, okInput, rejecting("native_artifact_capacity")),
    ).rejects.toThrow(/^native_artifact_unavailable$/);
  });
  it("returns data on a successful response and clears the timeout timer", async () => {
    vi.useFakeTimers();
    try {
      const okRpc: KnowledgeRpc = async () => ({ data: { artifacts: [] }, error: null });
      const state = await readNativeArtifacts(scope, okRpc);
      expect(state.artifacts).toEqual([]);
      // The 10s timeout timer was cleared in the finally, leaving no dangling timer.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
describe("staging input bounds the capturedAt offset to PostgreSQL's ±15:59 displacement range", () => {
  // Finding 4055076298: the reader Zod / Date.parse tolerate an offset like +16:00 (and unrestricted
  // minute digits), but PostgreSQL rejects any displacement outside ±15:59 at the cast (SQLSTATE 22009).
  // The stage grammar now bounds the offset to hour 00..15 / minute 00..59 (both signs) so those values
  // are refused before the RPC; the shared reader schema and the DB cast are unchanged.
  const stageRejected = [
    "2026-08-29T12:00:00+16:00", // hour 16 — one past the max positive displacement
    "2026-08-29T12:00:00-16:00", // hour 16 — one past the max negative displacement
    "2026-08-29T12:00:00+01:60", // minute 60 — out of range
    "2026-08-29T12:00:00+15:60", // minute 60 at the boundary hour
  ];
  const accepted = [
    "2026-08-29T12:00:00+15:59", // maximum positive displacement PostgreSQL accepts
    "2026-08-29T12:00:00-15:59", // maximum negative displacement
    "2026-08-29T12:00:00+00:00",
    "2026-08-29T12:00:00-05:30",
    "2026-08-29T12:00:00Z",
    "2020-01-01T00:00:00Z", // lower instant boundary still accepted (date semantics unchanged)
  ];
  it.each(stageRejected)(
    "refuses %s at the stage input before any RPC (offset outside PostgreSQL's ±15:59)",
    async (capturedAt) => {
      const parsed = nativeArtifactStageInputSchema.safeParse({
        metadata: { ...metadata, capturedAt },
        base64,
      });
      expect(parsed.success).toBe(false);
      if (!parsed.success)
        expect(parsed.error.issues.some((i) => i.path.join(".") === "metadata.capturedAt")).toBe(
          true,
        );
      // End to end through the server path: rejected before the RPC, so no row is created.
      await expect(stage({ ...metadata, capturedAt }, base64)).rejects.toThrow();
      expect(await count()).toBe(0);
    },
  );
  it("keeps the shared reader schema permissive for +16:00 / -16:00 so read-back stays compatible", () => {
    // The reader (used for read-back) still accepts the out-of-range offset; only the write boundary is
    // stricter, so this tightening never rejects an already-stored value.
    for (const capturedAt of ["2026-08-29T12:00:00+16:00", "2026-08-29T12:00:00-16:00"])
      expect(nativeArtifactMetadataSchema.safeParse({ ...metadata, capturedAt }).success).toBe(
        true,
      );
  });
  it.each(accepted)(
    "accepts boundary/normal offset %s at the stage input and round-trips it through real SQL verbatim",
    async (capturedAt) => {
      expect(
        nativeArtifactStageInputSchema.safeParse({ metadata: { ...metadata, capturedAt }, base64 })
          .success,
      ).toBe(true);
      const staged = await stage({ ...metadata, capturedAt }, base64);
      expect(staged.status).toBe("pending_parser");
      // Stored and read back verbatim — no silent normalization of the offset.
      expect((await getNativeArtifact(scope, staged.id, rpc)).metadata.capturedAt).toBe(capturedAt);
    },
  );
});
