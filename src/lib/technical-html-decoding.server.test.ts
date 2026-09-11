import { describe, it, expect } from "vitest";
import { decodeTechnicalHtml } from "./technical-html-decoding.server";
describe("declared HTML character decoding", () => {
  it("decodes legacy HTTP charset and labels without replacement characters", () => {
    const bytes = Buffer.from("<title>Caf\xe9 \x80</title>", "latin1");
    expect(decodeTechnicalHtml(bytes, 'text/html; charset="windows-1252"')).toBe(
      "<title>Café €</title>",
    );
    expect(decodeTechnicalHtml(bytes, "text/html; charset=iso-8859-1")).toBe(
      "<title>Café €</title>",
    );
  });
  it.each([
    '<meta charset="windows-1252">',
    "<meta http-equiv='content-type' content='text/html; charset=windows-1252'>",
  ])("detects meta declaration %s", (meta) => {
    expect(decodeTechnicalHtml(Buffer.from(meta + "<h1>Caf\xe9</h1>", "latin1"), "text/html")).toBe(
      meta + "<h1>Café</h1>",
    );
  });
  it("uses BOM before HTTP, and HTTP before meta", () => {
    const body = '<meta charset="windows-1252"><title>Łódź</title>';
    expect(decodeTechnicalHtml(Buffer.from(body), "text/html; charset=utf-8")).toBe(body);
    expect(
      decodeTechnicalHtml(
        Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body)]),
        "text/html; charset=windows-1252",
      ),
    ).toBe(body);
    expect(
      decodeTechnicalHtml(
        Buffer.from("\ufeff<h1>Łódź</h1>", "utf16le"),
        "text/html; charset=utf-8",
      ),
    ).toBe("<h1>Łódź</h1>");
  });
  it("ignores declarations inside comments and uses the standard default", () => {
    const body = '<!-- <meta charset="utf-8"> --><title>Caf\xe9</title>';
    expect(decodeTechnicalHtml(Buffer.from(body, "latin1"), "text/html")).toBe(
      body.replace("\xe9", "é"),
    );
  });
  it("does not interpret charset text inside a quoted unrelated MIME parameter", () => {
    const bytes = Buffer.from("<title>Łódź</title>");
    expect(
      decodeTechnicalHtml(bytes, 'text/html; ignored=";charset=windows-1252"; charset=utf-8'),
    ).toBe("<title>Łódź</title>");
  });
  it("uses XML declaration and ignores HTML meta rules for XHTML", () => {
    const body = '<?xml version="1.0" encoding="windows-1252"?><title>Caf\xe9</title>';
    expect(decodeTechnicalHtml(Buffer.from(body, "latin1"), "application/xhtml+xml")).toBe(
      body.replace("\xe9", "é"),
    );
  });
  it("refuses malformed full bytes, and preserves valid prefix of a truncated character", () => {
    const bytes = Buffer.concat([Buffer.from("<title>OK"), Buffer.from([0xe2, 0x82])]);
    expect(() => decodeTechnicalHtml(bytes, "text/html; charset=utf-8")).toThrow();
    expect(decodeTechnicalHtml(bytes, "text/html; charset=utf-8", true)).toBe("<title>OK");
  });
});
