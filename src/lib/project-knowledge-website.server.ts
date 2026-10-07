import { knowledgeSourceSchema, type KnowledgeScope } from "./project-knowledge";
import {
  KnowledgeUnavailableError,
  readProjectKnowledge,
  writeProjectKnowledgePair,
} from "./project-knowledge.server";

/** Captures bounded actual homepage text, without a model call. Source text
 * becomes a proposal; fetching or owner acceptance cannot independently verify
 * business claims. Failed fetches do not replace the last successful source: an
 * unreachable or unreadable page is refused BEFORE any write with the fixed
 * code `website_source_unreadable` (BU), so the caller can tell this known,
 * deterministic rejection apart from an unconfirmed save that needs a refresh. */
/** Optional seam (CC): an explicit pinned-hop transport config. `undefined`
 * reads the default-OFF environment switch; `null` forces the in-process path. */
export type WebsiteCaptureDeps = {
  transport?: import("./pinned-hop/client.server").PinnedHopConfig | null;
};
export async function captureProjectWebsiteKnowledge(
  scope: KnowledgeScope,
  url: string,
  deps: WebsiteCaptureDeps = {},
) {
  const now = new Date().toISOString();
  const trimmedUrl = url.trim();
  // Match website-led onboarding's bare-hostname input without upgrading an
  // explicitly supplied unsupported protocol or accepting URL credentials.
  const sourceUrl = knowledgeSourceSchema.shape.url
    .unwrap()
    .parse(/^[a-z][a-z\d+.-]*:/i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`);
  const state = await readProjectKnowledge(scope);
  const pinned = await import("./pinned-hop/client.server");
  const transport = deps.transport !== undefined ? deps.transport : pinned.pinnedHopConfigFromEnv();
  const ai = await import("./ai.functions");
  let site: Awaited<ReturnType<typeof ai.fetchSiteContext>>;
  if (transport) {
    // Homepage purpose only; a cold/busy/unreachable service is a truthful,
    // retryable refusal before any write. No automatic retry.
    const outcome = await pinned.fetchHomepageViaPinnedHop(sourceUrl, transport);
    if (outcome.retryable) throw new Error("website_source_temporarily_unavailable");
    site = outcome.html
      ? ai.siteContextFromHtml(outcome.html, new URL(sourceUrl))
      : { ok: false, title: "", metaDescription: "", text: "", links: [] };
  } else {
    // Default OFF: exactly the released in-process path.
    site = await ai.fetchSiteContext(sourceUrl);
  }
  if (!site.ok || site.text.trim().length < 80) throw new Error("website_source_unreadable");
  const excerpt = site.text.slice(0, 2000);
  const fingerprint = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(excerpt))),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const previous = state.sources.find(
    (s) => s.kind === "website" && s.url === sourceUrl && s.status === "active",
  );
  if (previous?.fingerprint === fingerprint) return { changed: false, source: previous };
  const source = knowledgeSourceSchema.parse({
    ...scope,
    id: previous?.id ?? crypto.randomUUID(),
    revision: (previous?.revision ?? 0) + 1,
    kind: "website",
    url: sourceUrl,
    label: site.title.slice(0, 200) || new URL(sourceUrl).hostname,
    fingerprint,
    observedAt: now,
    status: "active",
  });
  const saved = await writeProjectKnowledgePair(
    scope,
    source,
    {
      ...scope,
      id: crypto.randomUUID(),
      revision: 1,
      sourceId: source.id,
      sourceRevision: source.revision,
      key: "fact.website-excerpt",
      category: "fact",
      appliesTo: "both",
      value: excerpt,
      excerpt,
      locator: "Homepage readable text, first 2,000 characters",
      status: "proposed",
      updatedAt: now,
    },
    previous?.revision ?? 0,
    0,
  );
  if (!saved) throw new KnowledgeUnavailableError();
  return { changed: true, source: saved.source };
}
