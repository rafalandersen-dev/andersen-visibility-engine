/** Pure robots evidence for the technical crawler. RFC9309; no network or grants.
 * Unknown/partial retrieval never becomes permission to crawl or an indexability claim.
 */
export const ROBOTS_MAX_BYTES = 512_000;
const MAX_RULES = 20_000;
export type RobotsRule = { allow: boolean; pattern: string; line: number };
export type RobotsGroup = { agents: string[]; rules: RobotsRule[] };
export type RobotsDocument = {
  groups: RobotsGroup[];
  sitemaps: string[];
  complete: boolean;
};
export type RobotsEvidence =
  | { state: "read"; document: RobotsDocument }
  | { state: "unavailable"; status: number }
  | {
      state: "unknown";
      reason: "network" | "server" | "rate_limited" | "redirect" | "oversize" | "content_type";
    };

export function parseRobots(text: string): RobotsDocument {
  const result: RobotsDocument = { groups: [], sitemaps: [], complete: true };
  if (new TextEncoder().encode(text).byteLength > ROBOTS_MAX_BYTES)
    return { ...result, complete: false };
  let group: RobotsGroup | undefined;
  let hasRules = false;
  let rules = 0;
  for (const [index, raw] of text
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\r|\n/)
    .entries()) {
    const line = raw.split("#", 1)[0].trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "user-agent") {
      if (value.length > 256 || result.groups.length >= 20000) {
        result.complete = false;
        break;
      }
      if (!/^(?:\*|[a-z_-]+)$/i.test(value)) continue;
      if (!group || hasRules) {
        group = { agents: [], rules: [] };
        result.groups.push(group);
        hasRules = false;
      }
      group.agents.push(value.toLowerCase());
    } else if (key === "allow" || key === "disallow") {
      if (!group) continue;
      hasRules = true;
      if (!value || !value.startsWith("/")) continue;
      if (++rules > MAX_RULES || value.length > 8192) {
        result.complete = false;
        break;
      }
      group.rules.push({ allow: key === "allow", pattern: value, line: index + 1 });
    } else if (key === "sitemap" && result.sitemaps.length < 100) {
      try {
        const url = new URL(value);
        if (
          ["https:", "http:"].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !result.sitemaps.includes(url.href)
        )
          result.sitemaps.push(url.href);
      } catch {
        /* malformed extension records do not terminate a group */
      }
    }
  }
  return result;
}

export function robotsEvidence(
  status: number | null,
  body = "",
  contentType = "text/plain",
): RobotsEvidence {
  if (status === null || !Number.isInteger(status) || status < 100 || status > 599)
    return { state: "unknown", reason: "network" };
  if (status === 429) return { state: "unknown", reason: "rate_limited" };
  if (status >= 400 && status < 500) return { state: "unavailable", status };
  if (status >= 500 || status < 200) return { state: "unknown", reason: "server" };
  if (status >= 300) return { state: "unknown", reason: "redirect" };
  if (contentType && !/^text\/plain(?:\s*;|$)/i.test(contentType))
    return { state: "unknown", reason: "content_type" };
  const document = parseRobots(body);
  return document.complete ? { state: "read", document } : { state: "unknown", reason: "oversize" };
}

function octets(value: string): string {
  return Array.from(value)
    .map((c) =>
      c.codePointAt(0)! > 127
        ? Array.from(
            new TextEncoder().encode(c),
            (b) => "%" + b.toString(16).toUpperCase().padStart(2, "0"),
          ).join("")
        : c,
    )
    .join("")
    .replace(/%[a-f0-9]{2}/gi, (encoded) => {
      const character = String.fromCharCode(parseInt(encoded.slice(1), 16));
      return /^[a-z0-9._~-]$/i.test(character) ? character : encoded.toUpperCase();
    });
}

/** Ordered literal segments avoid regex backtracking on untrusted wildcard patterns. */
function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const parts = (anchored ? pattern.slice(0, -1) : pattern).split("*");
  let offset = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const position =
      i === 0
        ? path.startsWith(part)
          ? 0
          : -1
        : anchored && i === parts.length - 1
          ? path.endsWith(part)
            ? path.length - part.length
            : -1
          : path.indexOf(part, offset);
    if (position < offset || position < 0) return false;
    offset = position + part.length;
  }
  return !anchored || offset === path.length;
}

export function evaluateRobots(
  evidence: RobotsEvidence,
  token: string,
  url: string,
): {
  decision: "allowed" | "disallowed" | "unknown";
  rule: RobotsRule | null;
} {
  const unknown = { decision: "unknown" as const, rule: null };
  if (!/^[a-z_-]+$/i.test(token)) return unknown;
  let path: string;
  try {
    const target = new URL(url);
    if (!["https:", "http:"].includes(target.protocol)) return unknown;
    path = octets(target.pathname + target.search);
  } catch {
    return unknown;
  }
  if (
    path.length > 8192 ||
    evidence.state === "unknown" ||
    (evidence.state === "read" && !evidence.document.complete)
  )
    return unknown;
  if (evidence.state === "unavailable" || path === "/robots.txt")
    return { decision: "allowed", rule: null };
  const exact = evidence.document.groups.filter((g) => g.agents.includes(token.toLowerCase()));
  const groups = exact.length
    ? exact
    : evidence.document.groups.filter((g) => g.agents.includes("*"));
  let selected: RobotsRule | null = null;
  let specificity = -1;
  for (const group of groups)
    for (const rule of group.rules) {
      const pattern = octets(rule.pattern);
      if (!matches(pattern, path)) continue;
      const length = pattern.replace(/\*/g, "").replace(/\$$/, "").length;
      if (length > specificity || (length === specificity && rule.allow)) {
        selected = rule;
        specificity = length;
      }
    }
  return { decision: selected && !selected.allow ? "disallowed" : "allowed", rule: selected };
}
