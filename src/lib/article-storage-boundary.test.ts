import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
const sql = readFileSync("supabase/migrations/20260907220000_article_storage_boundary.sql", "utf8");
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id text PRIMARY KEY,bucket_id text,name text);
    INSERT INTO storage.buckets(id) VALUES ('article-assets-private'),('article-assets-public'),('other');
    INSERT INTO storage.objects VALUES ('existing','article-assets-public','original');
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
    GRANT ALL ON storage.objects TO anon,authenticated,service_role;
    CREATE POLICY broad_permissive ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);
  `);
  await db.exec(sql);
}, 30000);
afterAll(async () => {
  await db?.close();
});
async function asRole<T>(role: string, run: () => Promise<T>): Promise<T> {
  await db.exec(`SET ROLE ${role}`);
  try {
    return await run();
  } finally {
    await db.exec("RESET ROLE");
  }
}
describe("article storage admission and public-write boundary", () => {
  it("adds storage limits while preserving existing objects and other buckets", async () => {
    expect(
      (
        await db.query(
          "SELECT id,file_size_limit::int,allowed_mime_types FROM storage.buckets ORDER BY id",
        )
      ).rows,
    ).toEqual([
      {
        id: "article-assets-private",
        file_size_limit: 5242880,
        allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
      },
      {
        id: "article-assets-public",
        file_size_limit: 5242880,
        allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
      },
      { id: "other", file_size_limit: null, allowed_mime_types: null },
    ]);
    expect((await db.query("SELECT name FROM storage.objects WHERE id='existing'")).rows).toEqual([
      { name: "original" },
    ]);
  });
  it.each(["anon", "authenticated"])(
    "blocks %s direct public insertion, update and deletion despite a broad permissive policy",
    async (role) => {
      await asRole(role, async () => {
        await expect(
          db.exec("INSERT INTO storage.objects VALUES ('bypass','article-assets-public','unsafe')"),
        ).rejects.toThrow(/row-level security/);
        expect(
          (
            await db.query(
              "UPDATE storage.objects SET name='changed' WHERE id='existing' RETURNING id",
            )
          ).rows,
        ).toEqual([]);
        expect(
          (await db.query("DELETE FROM storage.objects WHERE id='existing' RETURNING id")).rows,
        ).toEqual([]);
        expect(
          (await db.query("SELECT name FROM storage.objects WHERE id='existing'")).rows,
        ).toEqual([{ name: "original" }]);
      });
    },
  );
  it("does not restrict private or unrelated buckets, but prevents moving an object into public", async () => {
    await asRole("authenticated", async () => {
      await db.exec(
        "INSERT INTO storage.objects VALUES ('private','article-assets-private','staged'),('other','other','unrelated')",
      );
      await expect(
        db.exec("UPDATE storage.objects SET bucket_id='article-assets-public' WHERE id='private'"),
      ).rejects.toThrow(/row-level security/);
      expect(
        (await db.query("DELETE FROM storage.objects WHERE id IN ('private','other') RETURNING id"))
          .rows,
      ).toHaveLength(2);
    });
  });
  it("preserves server promotion and removal", async () => {
    await asRole("service_role", async () => {
      await db.exec(
        "INSERT INTO storage.objects VALUES ('approved','article-assets-public','validated')",
      );
      expect(
        (
          await db.query(
            "UPDATE storage.objects SET name='validated-update' WHERE id='approved' RETURNING name",
          )
        ).rows,
      ).toEqual([{ name: "validated-update" }]);
      expect(
        (await db.query("DELETE FROM storage.objects WHERE id='approved' RETURNING id")).rows,
      ).toEqual([{ id: "approved" }]);
    });
  });
  it("is repeatable without widening stricter bucket settings", async () => {
    await db.exec(
      "UPDATE storage.buckets SET file_size_limit=1024,allowed_mime_types=ARRAY['image/png'] WHERE id='article-assets-private'",
    );
    await db.exec(sql);
    expect(
      (
        await db.query(
          "SELECT file_size_limit::int,allowed_mime_types FROM storage.buckets WHERE id='article-assets-private'",
        )
      ).rows,
    ).toEqual([{ file_size_limit: 1024, allowed_mime_types: ["image/png"] }]);
  });
  it("refuses incompatible MIME settings instead of silently widening them", async () => {
    await db.exec(
      "UPDATE storage.buckets SET allowed_mime_types=ARRAY['image/gif'] WHERE id='article-assets-private'",
    );
    await expect(db.exec(sql)).rejects.toThrow("article_mime_configuration_conflict");
    expect(
      (
        await db.query(
          "SELECT allowed_mime_types FROM storage.buckets WHERE id='article-assets-private'",
        )
      ).rows,
    ).toEqual([{ allowed_mime_types: ["image/gif"] }]);
  });
});
