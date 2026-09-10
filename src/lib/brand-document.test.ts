import { describe, expect, it } from "vitest";
import {
  boundedBrandSegments,
  inspectBrandDocument,
  MAX_BRAND_DOCUMENT_BYTES,
} from "./brand-document";

/** Minimal stored ZIP envelope; extraction fixtures are tested separately. */
function zip(names = ["[Content_Types].xml", "word/document.xml"]) {
  const encoded = names.map((n) => new TextEncoder().encode(n));
  const localSize = encoded.reduce((n, b) => n + 30 + b.length + 1, 0);
  const centralSize = encoded.reduce((n, b) => n + 46 + b.length, 0);
  const bytes = new Uint8Array(localSize + centralSize + 22),
    view = new DataView(bytes.buffer);
  let local = 0,
    central = localSize;
  for (const name of encoded) {
    view.setUint32(local, 0x04034b50, true);
    view.setUint16(local + 4, 20, true);
    view.setUint32(local + 18, 1, true);
    view.setUint32(local + 22, 1, true);
    view.setUint16(local + 26, name.length, true);
    bytes.set(name, local + 30);
    bytes[local + 30 + name.length] = 65;
    view.setUint32(central, 0x02014b50, true);
    view.setUint16(central + 6, 20, true);
    view.setUint32(central + 20, 1, true);
    view.setUint32(central + 24, 1, true);
    view.setUint16(central + 28, name.length, true);
    view.setUint32(central + 42, local, true);
    bytes.set(name, central + 46);
    local += 30 + name.length + 1;
    central += 46 + name.length;
  }
  view.setUint32(central, 0x06054b50, true);
  view.setUint16(central + 8, names.length, true);
  view.setUint16(central + 10, names.length, true);
  view.setUint32(central + 12, centralSize, true);
  view.setUint32(central + 16, localSize, true);
  return { bytes, view, central: localSize };
}
describe("bounded brand document intake", () => {
  it("recognizes PDF and DOCX signatures without trusting a filename or MIME", () => {
    expect(inspectBrandDocument(new TextEncoder().encode("%PDF-1.7\n"))).toBe("pdf");
    expect(inspectBrandDocument(zip().bytes)).toBe("docx");
  });
  it("rejects empty, oversized and unrelated files", () => {
    for (const bytes of [
      new Uint8Array(),
      new Uint8Array(MAX_BRAND_DOCUMENT_BYTES + 1),
      new TextEncoder().encode("<html>Not a document</html>"),
    ])
      expect(() => inspectBrandDocument(bytes)).toThrow();
    expect(() => inspectBrandDocument(zip(["unrelated.xml"]).bytes)).toThrow("format");
  });
  it.each(["../word/document.xml", "/word/document.xml", "word\\document.xml"])(
    "rejects unsafe ZIP entry paths %#",
    (name) => {
      expect(() => inspectBrandDocument(zip(["[Content_Types].xml", name]).bytes)).toThrow("zip");
    },
  );
  it("rejects duplicate entries and malformed directory offsets", () => {
    expect(() =>
      inspectBrandDocument(zip(["word/document.xml", "word/document.xml"]).bytes),
    ).toThrow("zip");
    const file = zip();
    file.view.setUint32(file.bytes.length - 6, 0xffffffff, true);
    expect(() => inspectBrandDocument(file.bytes)).toThrow("zip");
  });
  it("rejects encrypted entries and implausible decompression sizes", () => {
    const encrypted = zip();
    encrypted.view.setUint16(encrypted.central + 8, 1, true);
    expect(() => inspectBrandDocument(encrypted.bytes)).toThrow("zip");
    const bomb = zip();
    bomb.view.setUint32(bomb.central + 24, 15 * 1024 * 1024, true);
    expect(() => inspectBrandDocument(bomb.bytes)).toThrow("zip");
  });
  it("keeps page references and reports text-only limitations without executing markup", () => {
    const result = boundedBrandSegments(
      "pdf",
      [{ locator: "Page 2", text: "  <script>publish()</script>\u0000 " }],
      ["text_only", "text_only"],
    );
    expect(result).toEqual({
      kind: "pdf",
      segments: [{ locator: "Page 2", text: "<script>publish()</script>" }],
      warnings: ["text_only"],
    });
  });
  it("refuses empty scanned documents and excessive extracted text", () => {
    expect(() => boundedBrandSegments("pdf", [{ locator: "Page 1", text: "  " }])).toThrow(
      "no_text",
    );
    expect(() =>
      boundedBrandSegments("docx", [{ locator: "Paragraph 1", text: "x".repeat(100001) }]),
    ).toThrow("text_limit");
  });
});
