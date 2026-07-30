import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { LOCALE_ROUTES, SITE_ORIGIN } from "@/lib/locales";

const BASE_URL = SITE_ORIGIN;

/**
 * The sitemap is DERIVED from the route files on disk (same source the route
 * tree is generated from), so adding a marketing or legal page automatically
 * lists it. Importing routeTree.gen here would be circular — this route is
 * itself part of that tree — so we enumerate the route modules instead.
 * Everything non-indexable is excluded by the rules below rather than by an
 * easily-stale allow-list.
 */
const ROUTE_FILES = import.meta.glob("./**/*.{tsx,ts}");

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

/** Turn a route filename ("./blog.local-seo-guide.tsx") into its URL path. */
function fileToPath(file: string): string | null {
  let name = file.replace(/^\.\//, "").replace(/\.(tsx|ts)$/, "");
  if (name === "__root" || name.endsWith("/route") || name === "route") return null;
  // Folder separators and dot separators are equivalent in file-based routing.
  name = name.replace(/\//g, ".");
  // "[.]" escapes a literal dot (sitemap[.]xml -> sitemap.xml).
  name = name.replace(/\[\.\]/g, "\u0000");
  const segments = name
    .split(".")
    .map((s) => s.replace(/\u0000/g, "."))
    .filter((s) => s.length > 0);
  const cleaned = segments.filter((s, i) => !(s === "index" && i === segments.length - 1));
  if (cleaned.length === 0) return "/";
  return "/" + cleaned.join("/");
}

function indexablePaths(): string[] {
  const all = new Set<string>();
  for (const file of Object.keys(ROUTE_FILES)) {
    const path = fileToPath(file);
    if (path) all.add(path);
  }

  const paths = [...all]
    .map((p) => (p !== "/" ? p.replace(/\/+$/, "") : p))
    .filter((p) => p.startsWith("/"))
    .filter((p) => !p.includes("$") && !p.includes("*"))
    .filter((p) => !EXCLUDE_EXACT.has(p))
    .filter((p) => !EXCLUDE_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + "/")))
    .filter((p) => !p.split("/").some((seg) => seg.startsWith("_")));

  return [...new Set(paths)].sort((a, b) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)));
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
