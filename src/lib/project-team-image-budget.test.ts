import { describe, expect, it } from "vitest";
import {
  createReviewImageBudget,
  reviewImageDimensions,
  REVIEW_IMAGE_LIMITS,
} from "./project-team-image-budget";
function png(width: number, height: number, size = 45) {
  const b = new Uint8Array(size),
    v = new DataView(b.buffer);
  v.setUint32(0, 0x89504e47);
  v.setUint32(4, 0x0d0a1a0a);
  v.setUint32(8, 13);
  b.set(new TextEncoder().encode("IHDR"), 12);
  v.setUint32(16, width);
  v.setUint32(20, height);
  if (size > 45) {
    v.setUint32(33, size - 57);
    b.set(new TextEncoder().encode("IDAT"), 37);
  }
  b.set(new TextEncoder().encode("IEND"), size - 8);
  return b;
}
function jpeg(width: number, height: number) {
  const b = new Uint8Array([255, 216, 255, 192, 0, 8, 8, 0, 0, 0, 0, 1, 255, 218]);
  const v = new DataView(b.buffer);
  v.setUint16(7, height);
  v.setUint16(9, width);
  return b;
}
function webp(width: number, height: number) {
  const b = new Uint8Array(30),
    v = new DataView(b.buffer);
  b.set(new TextEncoder().encode("RIFF"));
  v.setUint32(4, 22, true);
  b.set(new TextEncoder().encode("WEBPVP8 "), 8);
  v.setUint32(16, 10, true);
  b.set([0x9d, 1, 0x2a], 23);
  v.setUint16(26, width, true);
  v.setUint16(28, height, true);
  return b;
}
describe("review aggregate image admission", () => {
  it("rejects excessive counts before any download but permits a 40-image preview", () => {
    expect(() => createReviewImageBudget(129)).toThrow();
    const budget = createReviewImageBudget(40);
    for (let i = 0; i < 40; i++) {
      budget.beforeDownload();
      expect(budget.accept(png(100, 100), "image/png")).toEqual({ width: 100, height: 100 });
    }
  });
  it("recognizes PNG, JPEG and WebP dimensions without decoding pixels", () => {
    expect(reviewImageDimensions(png(640, 480), "image/png")).toEqual({ width: 640, height: 480 });
    expect(reviewImageDimensions(jpeg(640, 480), "image/jpeg")).toEqual({
      width: 640,
      height: 480,
    });
    expect(reviewImageDimensions(webp(640, 480), "image/webp")).toEqual({
      width: 640,
      height: 480,
    });
  });
  it("refuses giant decoded surfaces before browser decoding", () => {
    for (const [bytes, type] of [
      [png(10000, 10000), "image/png"],
      [jpeg(4096, 4096), "image/jpeg"],
      [webp(10000, 10000), "image/webp"],
    ] as const)
      expect(() => reviewImageDimensions(bytes, type)).toThrow("review_image_budget");
  });
  it("bounds retained decoded pixels across individually valid files", () => {
    const budget = createReviewImageBudget(3);
    budget.accept(png(4096, 2048), "image/png");
    budget.accept(png(4096, 2048), "image/png");
    expect(() => budget.beforeDownload()).toThrow();
    expect(() => budget.accept(png(1, 1), "image/png")).toThrow();
  });
  it("reserves the maximum response size before downloading the next image", () => {
    const budget = createReviewImageBudget(4);
    for (let i = 0; i < 3; i++) {
      budget.beforeDownload();
      budget.accept(png(1, 1, REVIEW_IMAGE_LIMITS.imageBytes), "image/png");
    }
    expect(() => budget.beforeDownload()).toThrow();
  });
  it("refuses animated PNG/WebP and malformed or unsupported envelopes", () => {
    const animated = png(1, 1, 57);
    animated.set(new TextEncoder().encode("acTL"), 37);
    expect(() => reviewImageDimensions(animated, "image/png")).toThrow();
    const b = webp(1, 1);
    b.set(new TextEncoder().encode("ANIM"), 12);
    expect(() => reviewImageDimensions(b, "image/webp")).toThrow();
    expect(() => reviewImageDimensions(new Uint8Array([1, 2]), "image/png")).toThrow();
    expect(() => reviewImageDimensions(png(1, 1), "image/gif")).toThrow();
  });
});

it("rejects conflicting WebP canvas and codec dimensions before decoding in either chunk order", () => {
  const original = webp(640, 480);
  const extended = new Uint8Array(18);
  extended.set(new TextEncoder().encode("VP8X"));
  new DataView(extended.buffer).setUint32(4, 10, true);
  for (const first of [true, false]) {
    const bytes = new Uint8Array(48);
    bytes.set(original.subarray(0, 12));
    new DataView(bytes.buffer).setUint32(4, 40, true);
    bytes.set(first ? extended : original.subarray(12), 12);
    bytes.set(first ? original.subarray(12) : extended, 30);
    expect(() => reviewImageDimensions(bytes, "image/webp")).toThrow("review_image_budget");
  }
});
