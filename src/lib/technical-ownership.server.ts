import { randomBytes } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";
import { isSafePublicUrl } from "./safe-fetch";

export const OWNERSHIP_DNS_TIMEOUT_MS = 4000;
export function crawlOwnershipChallenge(origin: string, token = randomBytes(32).toString("hex")) {
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    !isSafePublicUrl(origin) ||
    !/^[a-f0-9]{64}$/.test(token) ||
    isIP(url.hostname.replace(/^\[|\]$/g, "")) ||
    !url.hostname.includes(".") ||
    /\.(?:local|localhost|internal)\.?$/i.test(url.hostname) ||
    url.hostname.endsWith(".") ||
    url.hostname.split(".").some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  )
    throw new Error("technical_ownership_origin_invalid");
  const name = `_milo-crawl.${url.hostname}`;
  if (name.length > 253) throw new Error("technical_ownership_origin_invalid");
  return { origin, token, name, value: `milo-crawl-verification=${token}` };
}
type TxtResolver = { resolveTxt(name: string): Promise<string[][]>; cancel(): void };
/** Verification evidence only. Callers must bind the saved challenge to the
 * authenticated owner, current project origin, expiry and one admitted attempt.
 * Never treat a browser-provided token or this boolean alone as crawl authority. */
export async function verifyCrawlOwnershipDns(
  origin: string,
  token: string,
  dependencies: { resolver?: () => TxtResolver; signal?: AbortSignal } = {},
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolver: TxtResolver | undefined;
  let stop: (() => void) | undefined;
  const cancel = () => {
    try {
      resolver?.cancel();
    } catch {
      /* Resolver details never leave this boundary. */
    }
  };
  try {
    const challenge = crawlOwnershipChallenge(origin, token);
    if (dependencies.signal?.aborted) return false;
    resolver = (dependencies.resolver ?? (() => new Resolver({ timeout: 3000, tries: 1 })))();
    const stopped = new Promise<never>((_, reject) => {
      stop = () => {
        reject(new Error("ownership_dns_unavailable"));
        cancel();
      };
      timer = setTimeout(stop, OWNERSHIP_DNS_TIMEOUT_MS);
      dependencies.signal?.addEventListener("abort", stop, { once: true });
    });
    const records = await Promise.race([resolver.resolveTxt(challenge.name), stopped]);
    if (dependencies.signal?.aborted || !Array.isArray(records) || records.length > 64)
      return false;
    let total = 0,
      found = false;
    for (const parts of records) {
      if (!Array.isArray(parts) || parts.length > 16) return false;
      for (const part of parts) {
        if (typeof part !== "string" || part.length > 255) return false;
        total += Buffer.byteLength(part);
        if (total > 8192) return false;
      }
      // TXT character-strings are concatenated within a single RR, never across RRs.
      if (parts.join("") === challenge.value) found = true;
    }
    return found;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    if (stop) dependencies.signal?.removeEventListener("abort", stop);
    cancel();
  }
}
