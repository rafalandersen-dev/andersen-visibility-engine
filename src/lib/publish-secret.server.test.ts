/**
 * P0-3 publish-secret storage: the encoding rules TypeScript owns, plus
 * source pins on the boundary — the browser must never receive a saved
 * secret again, and every server publish path must resolve through the
 * service-role store instead of trusting the workspace field alone.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { decodeStoredSecret, encodeStoredSecret } from "./publish-secret.server";

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
    const offenders = ["src/lib/store.ts", "src/lib/mock-ai.ts", "src/lib/launch.ts"].filter((f) =>
      readFileSync(f, "utf-8").includes('from "./publish-secret.server"'),
    );
    expect(offenders).toEqual([]);
  });
});
