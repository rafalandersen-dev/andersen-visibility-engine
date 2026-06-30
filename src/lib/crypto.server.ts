/**
 * Server-only secret encryption (Sprint 17) for Google refresh tokens.
 *
 * AES-256-GCM via the global WebCrypto API (works in both the Node dev runtime
 * and the Cloudflare Workers production runtime). The key comes from the
 * server-only env var GSC_TOKEN_ENCRYPTION_KEY (base64-encoded 32 bytes).
 *
 * NEVER import this from client code. Ciphertext format: "v1.<ivB64>.<ctB64>".
 * If no key is configured, encryption is considered unavailable and the OAuth
 * flow must not persist long-lived refresh tokens (offline access is skipped).
 */

const subtle = (globalThis.crypto as Crypto | undefined)?.subtle;

/** Copy a view into a standalone ArrayBuffer (satisfies WebCrypto BufferSource). */
function ab(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

function envKey(): string {
  return (process.env.GSC_TOKEN_ENCRYPTION_KEY ?? "").trim();
}

/** True when a usable encryption key + WebCrypto are available server-side. */
export function isEncryptionConfigured(): boolean {
  if (!subtle) return false;
  try {
    return decodeKeyBytes(envKey()).length === 32;
  } catch {
    return false;
  }
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function decodeKeyBytes(raw: string): Uint8Array {
  if (!raw) throw new Error("missing key");
  // Accept base64 (preferred, 44 chars for 32 bytes) or 64-char hex.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) out[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  return b64ToBytes(raw);
}

async function importKey(): Promise<CryptoKey> {
  if (!subtle) throw new Error("WebCrypto unavailable");
  const bytes = decodeKeyBytes(envKey());
  if (bytes.length !== 32) throw new Error("GSC_TOKEN_ENCRYPTION_KEY must be 32 bytes (base64 or hex).");
  return subtle.importKey("raw", ab(bytes), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Encrypt a UTF-8 secret. Returns "v1.<ivB64>.<ctB64>". Throws if not configured. */
export async function encryptSecret(plaintext: string): Promise<string> {
  if (!subtle) throw new Error("WebCrypto unavailable");
  const key = await importKey();
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const ct = await subtle.encrypt({ name: "AES-GCM", iv: ab(iv) }, key, ab(data));
  return `v1.${bytesToB64(iv)}.${bytesToB64(new Uint8Array(ct))}`;
}

/** Decrypt a "v1.<ivB64>.<ctB64>" payload. Returns "" on any failure. */
export async function decryptSecret(payload: string): Promise<string> {
  try {
    if (!subtle) return "";
    const parts = (payload || "").split(".");
    if (parts.length !== 3 || parts[0] !== "v1") return "";
    const key = await importKey();
    const iv = b64ToBytes(parts[1]);
    const ct = b64ToBytes(parts[2]);
    const pt = await subtle.decrypt({ name: "AES-GCM", iv: ab(iv) }, key, ab(ct));
    return new TextDecoder().decode(pt);
  } catch {
    return "";
  }
}
