import { MIMEType } from "node:util";
import sniffHtmlEncoding from "html-encoding-sniffer";
/** Decode bounded response bytes before HTML parsing. BOM beats HTTP charset;
 * HTML meta prescan uses the standard's first-1024-byte algorithm. Invalid
 * byte sequences fail closed instead of becoming complete corrupted evidence. */
export function decodeTechnicalHtml(bytes: Uint8Array, contentType: string, truncated = false) {
  const mime = new MIMEType(contentType);
  const html = mime.essence === "text/html";
  const xml = mime.essence === "application/xhtml+xml";
  let transport = mime.params.get("charset") ?? undefined;
  if (xml && !transport) {
    const prefix = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
    const declaration = /^<\?xml\s[^?]*\bencoding\s*=\s*(["'])([^"']+)\1[^?]*\?>/.exec(prefix);
    transport = declaration?.[2];
  }
  const encoding = sniffHtmlEncoding(bytes, {
    xml: !html,
    transportLayerEncodingLabel: transport,
    defaultEncoding: html ? "windows-1252" : "UTF-8",
  });
  const decoder = new TextDecoder(encoding, { fatal: true });
  // A truncated body may end in the middle of a valid character. Keep it partial;
  // do not flush that trailing sequence or invent replacement characters.
  return decoder.decode(bytes, { stream: truncated });
}
