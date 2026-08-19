/**
 * P0-3 publish-secret storage (now the general connector-secret store): the
 * encoding rules TypeScript owns, the named-secret resolution rules
 * (stored-wins, legacy fallback, lazy migration), plus source pins on the
 * boundary — the browser must never receive a saved secret again, and every
 * server publish path must resolve through the service-role store instead of
 * trusting the workspace field alone.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- service-role client mock (captures upserts, serves rows per secret_name) ----
const dbState: {
  rows: Record<string, string>; // secret_name -> stored (encoded) secret
  upserts: { values: Record<string, unknown>; options?: { onConflict?: string } }[];
} = { rows: {}, upserts: [] };

vi.mock("@/integrations/supabase/client.server", () => {
  const makeChain = (filters: Record<string, string>) => ({
    eq: (c: string, v: string) => makeChain({ ...filters, [c]: v }),
    maybeSingle: async () => {
      const secret = dbState.rows[filters.secret_name ?? ""];
      return { data: secret === undefined ? null : { secret }, error: null };
    },
  });
  return {
    supabaseAdmin: {
      from: () => ({
        select: () => makeChain({}),
        upsert: async (values: Record<string, unknown>, options?: { onConflict?: string }) => {
          dbState.upserts.push({ values, options });
          dbState.rows[String(values.secret_name)] = String(values.secret);
          return { error: null };
        },
      }),
    },
  };
});

import {
  decodeStoredSecret,
  encodeStoredSecret,
  resolvePublishSecret,
  resolveShopifyAdminToken,
  resolveWordPressAppPassword,
  storeProjectSecret,
} from "./publish-secret.server";

const KEY_ENV = "GSC_TOKEN_ENCRYPTION_KEY";

describe("stored secret encoding", () => {
  const original = process.env[KEY_ENV];
  afterEach(() => {
    if (original === undefined) delete process.env[KEY_ENV];
    else process.env[KEY_ENV] = original;
  });

  it("encrypts (v1 format) when the encryption key is configured, and round-trips", async () => {
    process.env[KEY_ENV] = "test-key-that-is-definitely-longer-than-32-chars";
    const encoded = await encodeStoredSecret("hunter2-publish-secret");
    expect(encoded.startsWith("v1.")).toBe(true);
    expect(encoded).not.toContain("hunter2");
    await expect(decodeStoredSecret(encoded)).resolves.toBe("hunter2-publish-secret");
  });

  it("falls back to a plain-prefixed value without a key — still out of the browser", async () => {
    delete process.env[KEY_ENV];
    const encoded = await encodeStoredSecret("hunter2");
    expect(encoded).toBe("plain.hunter2");
    await expect(decodeStoredSecret(encoded)).resolves.toBe("hunter2");
  });

  it("returns empty for unknown formats and undecryptable payloads", async () => {
    process.env[KEY_ENV] = "test-key-that-is-definitely-longer-than-32-chars";
    await expect(decodeStoredSecret("")).resolves.toBe("");
    await expect(decodeStoredSecret("garbage")).resolves.toBe("");
    await expect(decodeStoredSecret("v1.not.real")).resolves.toBe("");
  });
});

describe("named secret resolution (stored-first, legacy fallback, lazy migration)", () => {
  const original = process.env[KEY_ENV];
  beforeEach(() => {
    delete process.env[KEY_ENV]; // plain.-prefix mode keeps assertions readable
    dbState.rows = {};
    dbState.upserts = [];
  });
  afterEach(() => {
    if (original === undefined) delete process.env[KEY_ENV];
    else process.env[KEY_ENV] = original;
  });

  it("keys each secret by its own name so the three never collide", async () => {
    await storeProjectSecret("u1", "p1", "publish", "custom-secret");
    await storeProjectSecret("u1", "p1", "wordpressAppPassword", "wp-pass");
    await storeProjectSecret("u1", "p1", "shopifyAdminToken", "shpat_x");
    expect(dbState.upserts.map((u) => u.values.secret_name)).toEqual([
      "publish",
      "wordpressAppPassword",
      "shopifyAdminToken",
    ]);
    expect(
      dbState.upserts.every((u) => u.options?.onConflict === "user_id,project_id,secret_name"),
    ).toBe(true);
    await expect(resolvePublishSecret("u1", { id: "p1" })).resolves.toBe("custom-secret");
    await expect(resolveWordPressAppPassword("u1", { id: "p1" })).resolves.toBe("wp-pass");
    await expect(resolveShopifyAdminToken("u1", { id: "p1" })).resolves.toBe("shpat_x");
  });

  it("stored WordPress password WINS over a stale legacy workspace field", async () => {
    dbState.rows.wordpressAppPassword = "plain.rotated-pass";
    await expect(
      resolveWordPressAppPassword("u1", {
        id: "p1",
        wordpress: { applicationPassword: "old-leaked-pass" },
      }),
    ).resolves.toBe("rotated-pass");
    expect(dbState.upserts).toEqual([]); // no needless re-write
  });

  it("falls back to the legacy WordPress field and lazily migrates it", async () => {
    await expect(
      resolveWordPressAppPassword("u1", {
        id: "p1",
        wordpress: { applicationPassword: " legacy-pass " },
      }),
    ).resolves.toBe("legacy-pass");
    expect(dbState.upserts).toHaveLength(1);
    expect(dbState.upserts[0].values).toMatchObject({
      user_id: "u1",
      project_id: "p1",
      secret_name: "wordpressAppPassword",
      secret: "plain.legacy-pass",
    });
  });

  it("falls back to the legacy Shopify field and lazily migrates it", async () => {
    await expect(
      resolveShopifyAdminToken("u1", { id: "p1", shopify: { adminAccessToken: "shpat_legacy" } }),
    ).resolves.toBe("shpat_legacy");
    expect(dbState.upserts[0].values).toMatchObject({
      secret_name: "shopifyAdminToken",
      secret: "plain.shpat_legacy",
    });
  });

  it("returns empty when neither store nor legacy field has a value", async () => {
    await expect(resolveWordPressAppPassword("u1", { id: "p1" })).resolves.toBe("");
    await expect(resolveShopifyAdminToken("u1", { id: "p1", shopify: {} })).resolves.toBe("");
    expect(dbState.upserts).toEqual([]);
  });
});

describe("publish secret browser boundary (source pins)", () => {
  it("Setup never pre-fills the secret input from project data", () => {
    const setup = readFileSync("src/routes/_authenticated/app.setup.tsx", "utf-8");
    expect(setup).not.toContain("useState(project.publishSecret");
    expect(setup).toContain("savePublishSecretFn");
  });

  it("both server publish paths resolve the secret through the store", () => {
    for (const file of ["src/lib/publish.functions.ts", "src/lib/publish.server.ts"]) {
      const source = readFileSync(file, "utf-8");
      expect(source, file).toContain("resolvePublishSecret(userId, project)");
      // The direct legacy read must not survive outside the store module.
      expect(source, file).not.toMatch(/secret[:=] \(project\.publishSecret \?\? ""\)\.trim\(\)/);
    }
  });

  it("the store module is server-only (imported statically by no client module)", () => {
    // Dynamic imports inside server functions are fine; a static import from
    // client-reachable code would bundle the service-role path into the app.
    const offenders = [
      "src/lib/store.ts",
      "src/lib/mock-ai.ts",
      "src/lib/launch.ts",
      "src/lib/publish-targets.ts",
    ].filter((f) => readFileSync(f, "utf-8").includes('from "./publish-secret.server"'));
    expect(offenders).toEqual([]);
  });
});

describe("WordPress/Shopify token browser boundary (source pins)", () => {
  it("Setup saves new tokens through the server store fns and never reads saved ones", () => {
    const setup = readFileSync("src/routes/_authenticated/app.setup.tsx", "utf-8");
    expect(setup).toContain("saveWordPressAppPasswordFn");
    expect(setup).toContain("saveShopifyAdminTokenFn");
    // The old pre-P0 reads that pulled the saved credential out of the
    // (client-visible) project data into a request body must not come back.
    expect(setup).not.toContain('project.wordpress?.applicationPassword || ""');
    expect(setup).not.toContain('project.shopify?.adminAccessToken || ""');
    // Never pre-filled inputs.
    expect(setup).not.toContain("useState(project.wordpress?.applicationPassword");
    expect(setup).not.toContain("useState(project.shopify?.adminAccessToken");
  });

  it("both server publish paths resolve the connector tokens through the store", () => {
    for (const file of ["src/lib/connector-guard.server.ts", "src/lib/publish.server.ts"]) {
      const source = readFileSync(file, "utf-8");
      expect(source, file).toContain("resolveWordPressAppPassword(userId, project)");
      expect(source, file).toContain("resolveShopifyAdminToken(userId, project)");
    }
  });

  it("the connection-test fns resolve saved tokens server-side (pre-save test flow)", () => {
    expect(readFileSync("src/lib/wordpress.functions.ts", "utf-8")).toContain(
      "resolveWordPressAppPassword",
    );
    expect(readFileSync("src/lib/shopify.functions.ts", "utf-8")).toContain(
      "resolveShopifyAdminToken",
    );
  });
});
