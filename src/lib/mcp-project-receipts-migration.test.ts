import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
let db: PGlite;
const original = {
  id: "p",
  description: "Original",
  mcpProfileFillRequests: [{ requestId: "old" }],
  mcpOpportunityBatches: [{ requestId: "batch" }],
};
const role = (name: string) =>
  db.query("SELECT set_config('request.jwt.claim.role',$1,false)", [name]);
const read = async () =>
  (
    await db.query<{ data: Record<string, unknown> }>(
      "SELECT data FROM workspace_entities WHERE entity_id='p'",
    )
  ).rows[0].data;
const write = (value: unknown) =>
  db.query("UPDATE workspace_entities SET data=$1::jsonb WHERE entity_id='p'", [
    JSON.stringify(value),
  ]);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
    CREATE TABLE workspace_entities(collection text, entity_id text PRIMARY KEY, data jsonb NOT NULL);
    GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
    GRANT ALL ON workspace_entities TO authenticated,service_role;
    CREATE FUNCTION public.browser_save(payload jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ UPDATE workspace_entities SET data=payload WHERE entity_id='p' $$;
    GRANT EXECUTE ON FUNCTION public.browser_save(jsonb) TO authenticated;`);
  await db.exec(
    readFileSync("supabase/migrations/20260907230000_preserve_mcp_project_receipts.sql", "utf8"),
  );
}, 30000);
beforeEach(async () => {
  await db.exec("RESET ROLE; TRUNCATE workspace_entities");
  await role("service_role");
  await db.query("INSERT INTO workspace_entities VALUES ('projects','p',$1::jsonb)", [
    JSON.stringify(original),
  ]);
});
afterAll(async () => {
  await db?.close();
});
describe("server-owned project replay receipts", () => {
  it("preserves both histories when a stale browser payload omits them", async () => {
    await role("authenticated");
    await db.exec("SET ROLE authenticated");
    await write({ id: "p", description: "Owner edit" });
    expect(await read()).toEqual({ ...original, description: "Owner edit" });
  });
  it("refuses client replacement/clearing while saving normal profile changes", async () => {
    await role("authenticated");
    await db.exec("SET ROLE authenticated");
    await write({
      ...original,
      description: "Owner",
      mcpProfileFillRequests: [],
      mcpOpportunityBatches: [{ requestId: "forged" }],
    });
    expect(await read()).toEqual({ ...original, description: "Owner" });
  });
  it("strips forged receipts on a browser-created project", async () => {
    await role("authenticated");
    await db.exec("SET ROLE authenticated");
    await db.query("INSERT INTO workspace_entities VALUES ('projects','new',$1::jsonb)", [
      JSON.stringify({ ...original, id: "new" }),
    ]);
    const row = (
      await db.query<{ data: unknown }>("SELECT data FROM workspace_entities WHERE entity_id='new'")
    ).rows[0];
    expect(row.data).toEqual({ id: "new", description: "Original" });
  });
  it("allows the signed service caller to append receipts", async () => {
    await db.exec("SET ROLE service_role");
    const updated = {
      ...original,
      mcpProfileFillRequests: [...original.mcpProfileFillRequests, { requestId: "new" }],
    };
    await write(updated);
    expect(await read()).toEqual(updated);
  });
  it("keeps caller ownership through a SECURITY DEFINER save wrapper", async () => {
    await role("authenticated");
    await db.exec("SET ROLE authenticated");
    await db.query("SELECT public.browser_save($1::jsonb)", [
      JSON.stringify({ id: "p", description: "Wrapper edit" }),
    ]);
    expect(await read()).toEqual({ ...original, description: "Wrapper edit" });
  });
  it("does not infer service authority from an absent role claim", async () => {
    await role("");
    await write({ id: "p", description: "Edited" });
    expect(await read()).toEqual({ ...original, description: "Edited" });
  });
  it("does not transform unrelated collections or existing malformed receipt values", async () => {
    await write({ ...original, mcpProfileFillRequests: null });
    await role("authenticated");
    await write({ id: "p", description: "Edited" });
    expect((await read()).mcpProfileFillRequests).toBeNull();
    await db.query("INSERT INTO workspace_entities VALUES ('content','asset',$1::jsonb)", [
      JSON.stringify({ id: "asset", note: "Keep" }),
    ]);
    expect(
      (
        await db.query<{ data: unknown }>(
          "SELECT data FROM workspace_entities WHERE entity_id='asset'",
        )
      ).rows[0].data,
    ).toEqual({ id: "asset", note: "Keep" });
  });
});
