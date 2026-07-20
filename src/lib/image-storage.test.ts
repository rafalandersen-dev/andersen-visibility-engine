/**
 * Image storage validation core (Phase A).
 */
import { describe, it, expect } from "vitest";
import {
  sniffImageFormat,
  validateImageBytes,
  storageObjectPath,
  ownerOfPath,
  extForFormat,
  MAX_IMAGE_BYTES,
} from "./image-storage";

const bytes = (...b: number[]) => new Uint8Array(b);
const withHead = (head: number[], len = 32) => {
  const a = new Uint8Array(len);
  a.set(head, 0);
  return a;
};

describe("sniffImageFormat — magic bytes, never the MIME type", () => {
  it("detects JPEG / PNG / WebP by signature", () => {
    expect(sniffImageFormat(withHead([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(sniffImageFormat(withHead([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      "png",
    );
    // RIFF....WEBP
    expect(
      sniffImageFormat(withHead([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])),
    ).toBe("webp");
  });

  it("rejects SVG, HTML, GIF, scripts, and empty (not an allowed raster signature)", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(sniffImageFormat(enc('<?xml version="1.0"?><svg>'))).toBeNull();
    expect(sniffImageFormat(enc("<svg xmlns=…>"))).toBeNull();
    expect(sniffImageFormat(enc("<!DOCTYPE html><script>alert(1)</script>"))).toBeNull();
    expect(sniffImageFormat(enc("GIF89a"))).toBeNull(); // GIF not in the allow-list
    expect(sniffImageFormat(bytes())).toBeNull();
  });

  it("rejects a RIFF container that is NOT WebP (e.g. WAV audio)", () => {
    expect(
      sniffImageFormat(withHead([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])),
    ).toBeNull(); // RIFF....WAVE
  });
});

describe("validateImageBytes", () => {
  it("accepts a real image within the cap", () => {
    expect(validateImageBytes(withHead([0xff, 0xd8, 0xff]))).toEqual({ ok: true, format: "jpeg" });
  });
  it("rejects empty, oversized, and unsupported", () => {
    expect(validateImageBytes(bytes())).toEqual({ ok: false, reason: "empty" });
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set([0xff, 0xd8, 0xff], 0);
    expect(validateImageBytes(big)).toEqual({ ok: false, reason: "too_large" });
    expect(validateImageBytes(new TextEncoder().encode("<svg>"))).toEqual({
      ok: false,
      reason: "unsupported_format",
    });
  });
});

describe("storageObjectPath — server-controlled, traversal-safe", () => {
  it("builds userId/projectId/assetId/id.ext and strips traversal + odd chars", () => {
    const p = storageObjectPath("user-1", "proj-1", "asset-1", "abc123", "jpg");
    expect(p).toBe("user-1/proj-1/asset-1/abc123.jpg");
    expect(ownerOfPath(p)).toBe("user-1");
  });
  it("neutralises path-traversal and slashes in every segment", () => {
    const p = storageObjectPath("../../etc", "a/b", "..", "x/../y", "jpg/../sh");
    expect(p).not.toContain("..");
    expect(p.split("/")).toHaveLength(4); // exactly the 4 server segments
  });
  it("extForFormat maps jpeg→jpg", () => {
    expect(extForFormat("jpeg")).toBe("jpg");
    expect(extForFormat("png")).toBe("png");
    expect(extForFormat("webp")).toBe("webp");
  });
});
