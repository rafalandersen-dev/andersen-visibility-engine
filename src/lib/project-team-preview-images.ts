/** Only replace generated image sources. Prose, code and other attributes must
 * retain their canonical text even if they contain the placeholder prefix. */
export function substituteTeamPreviewImages(html: string, urls: Record<string, string>) {
  const escape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  return html.replace(/<img\b[^>]*>/gi, (tag) =>
    tag.replace(
      /(\ssrc=")milo-review-image:([A-Za-z0-9_~-]+)(")/g,
      (_, before: string, key: string, after: string) =>
        before + escape(Object.hasOwn(urls, key) ? urls[key] : "") + after,
    ),
  );
}
