/**
 * Tests for the server-only AES-256-GCM secret encryption used for Google
 * refresh tokens. The key here is a throwaway test fixture, never a real key.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptSecret, decryptSecret, isEncryptionConfigured } from "./crypto.server";

// 32 fixed bytes, base64 — test fixture only.
const TEST_KEY_B64 = Buffer.from(new Uint8Array(32).map((_, i) => i + 1)).toString("base64");
const TEST_KEY_HEX = Buffer.from(new Uint8Array(32).map((_, i) => 255 - i)).toString("hex");

const ORIGINAL = process.env.GSC_TOKEN_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.GSC_TOKEN_ENCRYPTION_KEY = TEST_KEY_B64;
});
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.GSC_TOKEN_ENCRYPTION_KEY;
  else process.env.GSC_TOKEN_ENCRYPTION_KEY = ORIGINAL;
});

describe("isEncryptionConfigured", () => {
  it("is true with a 32-byte base64 key", () => {
    expect(isEncryptionConfigured()).toBe(true);
  });
  it("is true with a 64-char hex key", () => {
    process.env.GSC_TOKEN_ENCRYPTION_KEY = TEST_KEY_HEX;
    expect(isEncryptionConfigured()).toBe(true);
  });
  it("is false when the key is missing", () => {
    delete process.env.GSC_TOKEN_ENCRYPTION_KEY;
    expect(isEncryptionConfigured()).toBe(false);
  });
  it("is false when the key is too short", () => {
    process.env.GSC_TOKEN_ENCRYPTION_KEY = "short-key";
    expect(isEncryptionConfigured()).toBe(false);
  });
  it("accepts an arbitrary high-entropy secret of >= 32 chars (SHA-256 derived)", async () => {
    process.env.GSC_TOKEN_ENCRYPTION_KEY = "platform-generated-secret-0123456789abcdef";
    expect(isEncryptionConfigured()).toBe(true);
    const ct = await encryptSecret("value");
    expect(await decryptSecret(ct)).toBe("value");
  });
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a secret and never stores plaintext", async () => {
    const plaintext = "1//refresh-token-test-value";
    const ct = await encryptSecret(plaintext);
    expect(ct.startsWith("v1.")).toBe(true);
    expect(ct).not.toContain(plaintext);
    expect(await decryptSecret(ct)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    const a = await encryptSecret("same");
    const b = await encryptSecret("same");
    expect(a).not.toBe(b);
    expect(await decryptSecret(a)).toBe("same");
    expect(await decryptSecret(b)).toBe("same");
  });

  it("returns empty string for tampered ciphertext", async () => {
    const ct = await encryptSecret("secret");
    const [v, iv, body] = ct.split(".");
    const tampered = `${v}.${iv}.${body.slice(0, -4)}AAAA`;
    expect(await decryptSecret(tampered)).toBe("");
  });

  it("returns empty string for an unknown version or malformed payload", async () => {
    expect(await decryptSecret("v2.a.b")).toBe("");
    expect(await decryptSecret("garbage")).toBe("");
    expect(await decryptSecret("")).toBe("");
  });

  it("cannot decrypt with a different key (rotation requires reconnection)", async () => {
    const ct = await encryptSecret("secret");
    process.env.GSC_TOKEN_ENCRYPTION_KEY = TEST_KEY_HEX; // different key
    expect(await decryptSecret(ct)).toBe("");
  });

  it("throws when encrypting without a configured key", async () => {
    delete process.env.GSC_TOKEN_ENCRYPTION_KEY;
    await expect(encryptSecret("x")).rejects.toThrow();
  });
});
