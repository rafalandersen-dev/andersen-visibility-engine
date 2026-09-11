/** Bounds retained image data and decoded surfaces before browser decoding. */
export const REVIEW_IMAGE_LIMITS = {
  count: 128,
  bytes: 16 * 1024 * 1024,
  imageBytes: 5 * 1024 * 1024,
  pixels: 16 * 1024 * 1024,
  imagePixels: 8 * 1024 * 1024,
  side: 4096,
} as const;
function fail(): never {
  throw new Error("review_image_budget");
}
export function reviewImageDimensions(bytes: Uint8Array, type: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  let width = 0,
    height = 0;
  if (type === "image/png") {
    if (
      bytes.length < 33 ||
      view.getUint32(0) !== 0x89504e47 ||
      view.getUint32(4) !== 0x0d0a1a0a ||
      tag(12) !== "IHDR" ||
      view.getUint32(8) !== 13
    )
      fail();
    width = view.getUint32(16);
    height = view.getUint32(20);
    let offset = 8,
      count = 0,
      ended = false;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset),
        kind = tag(offset + 4);
      if (
        ++count > 4096 ||
        offset + 12 + length > bytes.length ||
        (kind === "IHDR" && offset !== 8) ||
        kind === "acTL" ||
        kind === "fcTL" ||
        kind === "fdAT"
      )
        fail();
      offset += 12 + length;
      if (kind === "IEND") {
        ended = true;
        break;
      }
    }
    if (!ended) fail();
  } else if (type === "image/jpeg") {
    if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) fail();
    let offset = 2,
      count = 0;
    while (offset + 4 <= bytes.length) {
      if (++count > 4096 || bytes[offset++] !== 0xff) fail();
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) fail();
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) fail();
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        )
      ) {
        if (length < 8) fail();
        const nextHeight = view.getUint16(offset + 3),
          nextWidth = view.getUint16(offset + 5);
        if (width && (width !== nextWidth || height !== nextHeight)) fail();
        height = nextHeight;
        width = nextWidth;
      }
      offset += length;
    }
  } else if (type === "image/webp") {
    if (
      bytes.length < 20 ||
      tag(0) !== "RIFF" ||
      tag(8) !== "WEBP" ||
      view.getUint32(4, true) + 8 !== bytes.length
    )
      fail();
    let offset = 12,
      count = 0;
    while (offset + 8 <= bytes.length) {
      const kind = tag(offset),
        length = view.getUint32(offset + 4, true),
        start = offset + 8;
      if (++count > 4096 || start + length > bytes.length || kind === "ANIM" || kind === "ANMF")
        fail();
      if (kind === "VP8X") {
        if (length < 10 || bytes[start] & 2) fail();
        const nextWidth = 1 + bytes[start + 4] + (bytes[start + 5] << 8) + (bytes[start + 6] << 16),
          nextHeight = 1 + bytes[start + 7] + (bytes[start + 8] << 8) + (bytes[start + 9] << 16);
        if (width && (width !== nextWidth || height !== nextHeight)) fail();
        width = nextWidth;
        height = nextHeight;
      } else if (kind === "VP8 ") {
        if (
          length < 10 ||
          bytes[start + 3] !== 0x9d ||
          bytes[start + 4] !== 1 ||
          bytes[start + 5] !== 0x2a
        )
          fail();
        const nextWidth = view.getUint16(start + 6, true) & 0x3fff,
          nextHeight = view.getUint16(start + 8, true) & 0x3fff;
        if (width && (width !== nextWidth || height !== nextHeight)) fail();
        width = nextWidth;
        height = nextHeight;
      } else if (kind === "VP8L") {
        if (length < 5 || bytes[start] !== 0x2f || bytes[start + 4] >> 5) fail();
        const nextWidth = 1 + bytes[start + 1] + ((bytes[start + 2] & 63) << 8);
        const nextHeight =
          1 + (bytes[start + 2] >> 6) + (bytes[start + 3] << 2) + ((bytes[start + 4] & 15) << 10);
        if (width && (width !== nextWidth || height !== nextHeight)) fail();
        width = nextWidth;
        height = nextHeight;
      }
      offset = start + length + (length & 1);
    }
  } else fail();
  if (
    !width ||
    !height ||
    width > REVIEW_IMAGE_LIMITS.side ||
    height > REVIEW_IMAGE_LIMITS.side ||
    width * height > REVIEW_IMAGE_LIMITS.imagePixels
  )
    fail();
  return { width, height };
}
export function createReviewImageBudget(count: number) {
  if (!Number.isInteger(count) || count < 0 || count > REVIEW_IMAGE_LIMITS.count) fail();
  let bytesUsed = 0,
    pixelsUsed = 0;
  return {
    beforeDownload() {
      // Reserve the endpoint's worst-case response before fetching the next file.
      if (
        bytesUsed + REVIEW_IMAGE_LIMITS.imageBytes > REVIEW_IMAGE_LIMITS.bytes ||
        pixelsUsed >= REVIEW_IMAGE_LIMITS.pixels
      )
        fail();
    },
    accept(bytes: Uint8Array, type: string) {
      if (
        bytes.length > REVIEW_IMAGE_LIMITS.imageBytes ||
        bytesUsed + bytes.length > REVIEW_IMAGE_LIMITS.bytes
      )
        fail();
      const size = reviewImageDimensions(bytes, type);
      if (pixelsUsed + size.width * size.height > REVIEW_IMAGE_LIMITS.pixels) fail();
      bytesUsed += bytes.length;
      pixelsUsed += size.width * size.height;
      return size;
    },
  };
}
