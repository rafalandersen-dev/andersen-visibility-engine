import { describe, expect, it } from "vitest";
import {
  HOP_LABELS,
  HOP_MAX_RESPONSE_BYTES,
  fromBase64,
  hopCodeFromError,
  hopRequestSchema,
  hopResponseSchema,
  importHopKey,
  signHop,
  toBase64,
  utf8,
  verifyHop,
} from "./protocol";

const KEY = "fixture-only-key-not-a-secret-0123456789abcdef";
describe("pinned-hop protocol", () => {
  it("refuses keys shorter than 32 bytes", async () => {
    await expect(importHopKey("x".repeat(31))).rejects.toThrow("hop_key_too_short");
  });
  it("binds signatures to one label and the exact bytes", async () => {
    const key = await importHopKey(KEY);
    const body = utf8('{"a":1}');
    const sig = await signHop(key, HOP_LABELS.hopRequest, body);
    expect(await verifyHop(key, HOP_LABELS.hopRequest, body, sig)).toBe(true);
    expect(await verifyHop(key, HOP_LABELS.hopResponse, body, sig)).toBe(false);
    expect(await verifyHop(key, HOP_LABELS.hopRequest, utf8('{"a":2}'), sig)).toBe(false);
    for (const bad of [null, "", "zz", sig.slice(1)])
      expect(await verifyHop(key, HOP_LABELS.hopRequest, body, bad)).toBe(false);
  });
  it("hop request schema is strict and homepage-only", () => {
    const ok = {
      v: 1,
      requestId: crypto.randomUUID(),
      hop: 0,
      purpose: "homepage",
      url: "https://a.test/",
      address: "93.184.216.34",
      family: 4,
      maxMs: 1000,
      incarnation: "a".repeat(32),
      nonce: "b".repeat(32),
    };
    expect(hopRequestSchema.safeParse(ok).success).toBe(true);
    for (const patch of [
      { purpose: "technical" },
      { admission: "x" },
      { hop: 4 },
      { maxMs: 100 },
      { url: "x".repeat(4097) },
    ])
      expect(hopRequestSchema.safeParse({ ...ok, ...patch }).success).toBe(false);
  });
  it("response schema refuses unknown codes and malformed base64", () => {
    const bind = { v: 1, requestId: crypto.randomUUID(), hop: 0, nonce: "b".repeat(32) };
    expect(hopResponseSchema.safeParse({ ...bind, kind: "failed", code: "made_up" }).success).toBe(
      false,
    );
    expect(
      hopResponseSchema.safeParse({
        ...bind,
        kind: "response",
        status: 200,
        headers: {},
        contentAccepted: true,
        truncated: false,
        bodyB64: "@@",
      }).success,
    ).toBe(false);
  });
  it("round-trips UTF-8 through base64 and stays within the response ceiling", () => {
    const text = "Zażółć gęślą jaźń — ✓ ".repeat(1000);
    expect(fromBase64(toBase64(text))).toBe(text);
    expect(toBase64("�".repeat(300_000)).length).toBeLessThanOrEqual(1_200_000);
    expect(HOP_MAX_RESPONSE_BYTES).toBe(1_466_240);
  });
  it("maps only known core messages; everything else is connect_failed or timeout", () => {
    expect(hopCodeFromError(new Error("blocked_address"), false)).toBe("blocked_address");
    expect(hopCodeFromError(new Error("constructor"), false)).toBe("connect_failed");
    expect(hopCodeFromError(new Error("ECONNRESET 1.2.3.4"), false)).toBe("connect_failed");
    expect(hopCodeFromError(new Error("blocked_address"), true)).toBe("timeout");
  });
});
