import { parse, defaultTreeAdapter, type DefaultTreeAdapterMap } from "parse5";
import { SaxesParser } from "saxes";
const XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
function parseXhtml(html: string): DefaultTreeAdapterMap["document"] | null {
  const document = defaultTreeAdapter.createDocument();
  const stack: DefaultTreeAdapterMap["parentNode"][] = [document];
  const parser = new SaxesParser({ xmlns: true });
  let nodes = 0;
  parser.on("doctype", (value) => {
    if (value.includes("[")) throw new Error("xhtml_dtd_subset");
  });
  parser.on("opentag", (tag) => {
    if (++nodes > 100000 || stack.length > 100) throw new Error("xhtml_limit");
    const node = defaultTreeAdapter.createElement(
      tag.local,
      tag.uri as DefaultTreeAdapterMap["element"]["namespaceURI"],
      Object.values(tag.attributes).map((a) => ({ name: a.name, value: a.value })),
    );
    defaultTreeAdapter.appendChild(stack[stack.length - 1], node);
    stack.push(node);
  });
  parser.on("closetag", () => {
    stack.pop();
  });
  const text = (value: string) => {
    if (++nodes > 100000) throw new Error("xhtml_limit");
    defaultTreeAdapter.insertText(stack[stack.length - 1], value);
  };
  parser.on("text", text);
  parser.on("cdata", text);
  try {
    parser.write(html).close();
    return document;
  } catch {
    return null;
  }
}

export const TECHNICAL_HTML_MAX_BYTES = 512_000;
export type TechnicalPageObservation = {
  url: string;
  status: number;
  observedAt: string;
  complete: boolean;
  title: string;
  descriptions: string[];
  headings: string[];
  canonicals: string[];
  alternateLanguages: { language: string; url: string }[];
  robots: { source: "meta" | "header"; agent: string; value: string }[];
  internalLinks: string[];
  externalLinkCount: number;
  structuredData: { state: "valid_json" | "invalid_json"; types: string[]; complete: boolean }[];
};

/** HTML observations only; no claim about Google's index or measured performance. */
export function inspectTechnicalPage(input: {
  url: string;
  status: number;
  observedAt: string;
  html: string;
  headers?: Record<string, string>;
}): TechnicalPageObservation {
  const target = new URL(input.url);
  if (
    !["https:", "http:"].includes(target.protocol) ||
    target.username ||
    target.password ||
    input.url.length > 8192 ||
    !Number.isInteger(input.status) ||
    input.status < 100 ||
    input.status > 599 ||
    !Number.isFinite(Date.parse(input.observedAt))
  )
    throw new Error("technical_observation_invalid");
  target.hash = "";
  const result: TechnicalPageObservation = {
    url: target.href,
    status: input.status,
    observedAt: input.observedAt,
    complete: true,
    title: "",
    descriptions: [],
    headings: [],
    canonicals: [],
    alternateLanguages: [],
    robots: [],
    internalLinks: [],
    externalLinkCount: 0,
    structuredData: [],
  };
  if (new TextEncoder().encode(input.html).byteLength > TECHNICAL_HTML_MAX_BYTES)
    return { ...result, complete: false };
  type Node = DefaultTreeAdapterMap["node"];
  type Element = DefaultTreeAdapterMap["element"];
  const contentType =
    Object.entries(input.headers ?? {}).find(
      ([key]) => key.toLowerCase() === "content-type",
    )?.[1] ?? "";
  const isXhtml = /^application\/xhtml\+xml(?:\s*;|$)/i.test(contentType);
  const document = isXhtml ? parseXhtml(input.html) : parse(input.html);
  if (!document) return { ...result, complete: false };
  const nodes: Element[] = [];
  const pending: Node[] = [document];
  let visited = 0;
  while (pending.length) {
    const node = pending.pop()!;
    if (++visited > 100_000) {
      result.complete = false;
      break;
    }
    if ("tagName" in node && (!isXhtml || node.namespaceURI === XHTML_NAMESPACE)) nodes.push(node);
    if (
      isXhtml &&
      "tagName" in node &&
      node.namespaceURI === XHTML_NAMESPACE &&
      node.tagName === "template"
    )
      continue;
    // Template contents are not rendered content. Never execute any script.
    if ("childNodes" in node)
      for (let i = node.childNodes.length - 1; i >= 0; i--) pending.push(node.childNodes[i]);
  }
  const attr = (node: Element, name: string) =>
    node.attrs.find((a) => a.name === name)?.value ?? "";
  let base = target.href;
  const resolve = (raw: string): string | null => {
    if (!raw) return null;
    if (raw.length > 8192) {
      result.complete = false;
      return null;
    }
    try {
      const value = new URL(raw, base);
      if (!["http:", "https:"].includes(value.protocol) || value.username || value.password)
        return null;
      value.hash = "";
      if (value.href.length > 8192) {
        result.complete = false;
        return null;
      }
      return value.href;
    } catch {
      return null;
    }
  };
  const firstBase = nodes.find((n) => n.tagName === "base" && attr(n, "href"));
  if (firstBase) base = resolve(attr(firstBase, "href")) ?? base;
  const text = (node: Node): string => {
    const stack = [node];
    const chunks: string[] = [];
    let size = 0;
    while (stack.length && size < 16000) {
      const item = stack.pop()!;
      if ("value" in item && item.nodeName === "#text") {
        const value = String(item.value);
        chunks.push(value);
        size += value.length;
      } else if ("childNodes" in item)
        for (let i = item.childNodes.length - 1; i >= 0; i--) stack.push(item.childNodes[i]);
    }
    return chunks.join("").replace(/\s+/g, " ").trim().slice(0, 16000);
  };
  for (const [name, value] of Object.entries(input.headers ?? {}))
    if (name.toLowerCase() === "x-robots-tag") {
      if (value.length > 4000) result.complete = false;
      result.robots.push({ source: "header", agent: "header-scoped", value: value.slice(0, 4000) });
    }
  const internal = new Set<string>();
  const external = new Set<string>();
  for (const node of nodes) {
    if (node.tagName === "title" && !result.title) result.title = text(node).slice(0, 1000);
    if (node.tagName === "h1") result.headings.push(text(node).slice(0, 1000));
    if (node.tagName === "meta") {
      const name = attr(node, "name").toLowerCase();
      const content = attr(node, "content");
      if (name === "description") result.descriptions.push(content.slice(0, 4000));
      if (["robots", "googlebot", "bingbot"].includes(name))
        result.robots.push({ source: "meta", agent: name, value: content.slice(0, 4000) });
      if (content.length > 4000) result.complete = false;
    }
    if (node.tagName === "link") {
      const rel = attr(node, "rel").toLowerCase().split(/\s+/);
      const href = resolve(attr(node, "href"));
      if (href && rel.includes("canonical")) result.canonicals.push(href);
      if (href && rel.includes("alternate") && attr(node, "hreflang"))
        result.alternateLanguages.push({
          language: attr(node, "hreflang").slice(0, 100),
          url: href,
        });
    }
    if (node.tagName === "a" || node.tagName === "area") {
      const href = resolve(attr(node, "href"));
      if (href) (new URL(href).origin === target.origin ? internal : external).add(href);
    }
    if (
      node.tagName === "script" &&
      attr(node, "type").trim().toLowerCase() === "application/ld+json"
    ) {
      const raw = node.childNodes
        .filter((n) => n.nodeName === "#text")
        .map((n) => ("value" in n ? n.value : ""))
        .join("");
      const types = new Set<string>();
      let complete = true;
      try {
        const stack: unknown[] = [JSON.parse(raw)];
        let count = 0;
        while (stack.length) {
          if (++count > 10_000) {
            complete = false;
            break;
          }
          const item = stack.pop();
          if (Array.isArray(item)) {
            if (item.length + stack.length + count > 10_000) {
              complete = false;
              break;
            }
            for (const value of item) stack.push(value);
          } else if (item && typeof item === "object") {
            const record = item as Record<string, unknown>;
            for (const value of Array.isArray(record["@type"])
              ? record["@type"]
              : [record["@type"]])
              if (typeof value === "string") types.add(value.slice(0, 200));
            const values = Object.values(record);
            if (values.length + stack.length + count > 10_000) {
              complete = false;
              break;
            }
            for (const value of values) stack.push(value);
          }
        }
        result.structuredData.push({
          state: "valid_json",
          types: [...types].slice(0, 100),
          complete: complete && types.size <= 100,
        });
      } catch {
        result.structuredData.push({ state: "invalid_json", types: [], complete: true });
      }
    }
  }
  const cap = <T>(items: T[], maximum: number): T[] => {
    if (items.length > maximum) result.complete = false;
    return items.slice(0, maximum);
  };
  result.internalLinks = cap([...internal], 500);
  result.externalLinkCount = external.size;
  result.headings = cap(result.headings, 100);
  result.descriptions = cap(result.descriptions, 20);
  result.canonicals = cap(result.canonicals, 20);
  result.alternateLanguages = cap(result.alternateLanguages, 100);
  result.robots = cap(result.robots, 100);
  result.structuredData = cap(result.structuredData, 100);
  if (result.structuredData.some((s) => !s.complete)) result.complete = false;
  return result;
}
