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
  isValidStorageObjectPath,
  reusedImageMeta,
  MAX_IMAGE_BYTES,
} from "./image-storage";
import type { ContentImage } from "./types";

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

describe("isValidStorageObjectPath — authorises promote/remove BEFORE trusting the owner segment (fix A)", () => {
  it("accepts the exact server-generated shape", () => {
    expect(isValidStorageObjectPath("user-1/proj-1/asset-1/abc123.jpg")).toBe(true);
    expect(isValidStorageObjectPath("u_1/p_1/a_1/id.png")).toBe(true);
    expect(isValidStorageObjectPath("u/p/a/i.webp")).toBe(true);
  });
  it("REJECTS traversal that a first-segment owner check alone would miss", () => {
    // The critical cross-tenant vector: the URL layer would normalise `..` away,
    // so `victim/..` must be rejected on shape before ownerOfPath is consulted.
    expect(isValidStorageObjectPath("attacker/../victim/asset/x.png")).toBe(false);
    expect(isValidStorageObjectPath("victim/../../victim/a/x.jpg")).toBe(false);
    expect(isValidStorageObjectPath("../victim/asset/id/x.jpg")).toBe(false);
    expect(isValidStorageObjectPath("uid/proj/asset/..%2f..%2fx.jpg")).toBe(false);
  });
  it("rejects off-shape paths: wrong segment count, bad/again-nested extension, disallowed types", () => {
    expect(isValidStorageObjectPath("user-1/proj-1/abc.jpg")).toBe(false); // too few segments
    expect(isValidStorageObjectPath("user-1/proj-1/asset-1/sub/abc.jpg")).toBe(false); // too many
    expect(isValidStorageObjectPath("user-1/proj-1/asset-1/abc.svg")).toBe(false); // SVG never
    expect(isValidStorageObjectPath("user-1/proj-1/asset-1/abc.jpg.svg")).toBe(false);
    expect(isValidStorageObjectPath("user-1/proj-1/asset-1/abc")).toBe(false); // no extension
    expect(isValidStorageObjectPath("user-1/proj-1/asset-1/a\\b.jpg")).toBe(false); // backslash
    expect(isValidStorageObjectPath("")).toBe(false);
    // @ts-expect-error — defends against a non-string reaching the guard
    expect(isValidStorageObjectPath(null)).toBe(false);
  });
  it("a real server path round-trips: shape-valid AND its owner is the first segment", () => {
    const p = storageObjectPath("owner-9", "proj", "asset", "id", "png");
    expect(isValidStorageObjectPath(p)).toBe(true);
    expect(ownerOfPath(p)).toBe("owner-9");
  });
});

describe("reusedImageMeta — a reuse must not delete the shared object (fix B)", () => {
  const source: ContentImage = {
    id: "orig",
    concept: "Team photo",
    url: "https://cdn.example.com/article-assets-public/owner/p/a/img.jpg",
    alt: "The team",
    caption: "On location",
    placement: "featured",
    source: "uploaded",
    status: "accepted",
    required: true,
    storagePath: "owner/p/a/img.jpg",
    previewUrl: "https://signed.example.com/preview",
  };
  it("references the shared PUBLIC url but carries NO storagePath (nor previewUrl)", () => {
    const reuse = reusedImageMeta(source);
    expect(reuse.url).toBe(source.url);
    expect("storagePath" in reuse).toBe(false);
    expect("previewUrl" in reuse).toBe(false);
    // So removeImage() finds no storagePath and never calls removeArticleImageFn —
    // the origin asset / live article keeps its object.
    expect((reuse as ContentImage).storagePath).toBeUndefined();
  });
  it("carries the visible metadata and is marked as an accepted reuse", () => {
    const reuse = reusedImageMeta(source);
    expect(reuse.concept).toBe("Team photo");
    expect(reuse.alt).toBe("The team");
    expect(reuse.caption).toBe("On location");
    expect(reuse.source).toBe("existing");
    expect(reuse.status).toBe("accepted");
    expect(reuse.required).toBe(false); // a reuse is never itself a required slot
  });
});
