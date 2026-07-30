import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { routeTree } from "@/routeTree.gen";
import { LOCALE_ROUTES, SITE_ORIGIN } from "@/lib/locales";

const BASE_URL = SITE_ORIGIN;

/**
 * The sitemap is DERIVED from the generated route tree, so adding a marketing
 * or legal page automatically lists it. Everything non-indexable is excluded by
 * the rules below rather than by an easily-stale allow-list.
 */
const EXCLUDE_PREFIXES = [
  "/app", // authenticated product
  "/api",
  "/lovable",
  "/email",
  "/.well-known",
  "/_",
];

const EXCLUDE_EXACT = new Set([
  "/auth",
  "/reset-password",
  "/unsubscribe",
  "/demo-script", // internal sales script, noindex
  "/sitemap.xml",
  "/milo-analytics.js",
]);

/** Per-path priority/changefreq hints; everything else gets sensible defaults. */
const HINTS: Record<string, { changefreq: string; priority: string }> = {
  "/": { changefreq: "weekly", priority: "1.0" },
  "/pricing": { changefreq: "monthly", priority: "0.9" },
  "/free-ai-visibility-audit": { changefreq: "monthly", priority: "0.9" },
  "/case-studies": { changefreq: "monthly", priority: "0.8" },
  "/beta": { changefreq: "monthly", priority: "0.8" },
  "/blog/local-seo-guide": { changefreq: "monthly", priority: "0.7" },
};

const LEGAL = new Set([
  "/privacy",
  "/terms",
  "/cookies",
  "/dpa",
  "/subprocessors",
  "/security",
  "/trust",
  "/ai-disclaimer",
]);

interface AnyRoute {
  fullPath?: string;
  children?: AnyRoute[] | Record<string, AnyRoute>;
}

function collectPaths(route: AnyRoute, acc: Set<string>): void {
  if (typeof route.fullPath === "string") acc.add(route.fullPath);
  const kids = route.children;
  if (!kids) return;
  const list = Array.isArray(kids) ? kids : Object.values(kids);
  for (const child of list) collectPaths(child as AnyRoute, acc);
}

function indexablePaths(): string[] {
  const all = new Set<string>();
  collectPaths(routeTree as unknown as AnyRoute, all);

  const paths = [...all]
    .map((p) => (p !== "/" ? p.replace(/\/+$/, "") : p))
    .filter((p) => p.startsWith("/"))
    .filter((p) => !p.includes("$") && !p.includes("*"))
    .filter((p) => !EXCLUDE_EXACT.has(p))
    .filter((p) => !EXCLUDE_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + "/")))
    .filter((p) => !EXCLUDE_PREFIXES.some((prefix) => p.startsWith(prefix) && prefix === "/_"));

  return [...new Set(paths)].sort((a, b) =>
    a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b),
  );
}

function hintFor(path: string): { changefreq: string; priority: string } {
  if (HINTS[path]) return HINTS[path];
  if (LEGAL.has(path)) return { changefreq: "yearly", priority: "0.3" };
  if (LOCALE_ROUTES.some((l) => l.path === path)) return { changefreq: "monthly", priority: "0.8" };
  return { changefreq: "monthly", priority: "0.6" };
}

/** hreflang alternates, emitted only on pages that are part of the locale set. */
function alternatesFor(path: string): string[] {
  if (!LOCALE_ROUTES.some((l) => l.path === path)) return [];
  return [
    ...LOCALE_ROUTES.map(
      (l) =>
        `    <xhtml:link rel="alternate" hreflang="${l.hreflang}" href="${BASE_URL}${l.path}" />`,
    ),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${BASE_URL}/" />`,
  ];
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const urls = indexablePaths().map((path) => {
          const { changefreq, priority } = hintFor(path);
          return [
            `  <url>`,
            `    <loc>${BASE_URL}${path}</loc>`,
            ...alternatesFor(path),
            `    <changefreq>${changefreq}</changefreq>`,
            `    <priority>${priority}</priority>`,
            `  </url>`,
          ].join("\n");
        });

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
