import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

const PAGE_URL = "https://milogrowth.com/blog/local-seo-guide";
const TITLE = "Local SEO Strategy Guide for Small Businesses";
const DESCRIPTION =
  "A practical local SEO guide for small service businesses — Google Business Profile basics, local keyword targeting, location pages, reviews and on-page essentials, with links to Google's own documentation.";
/** Last factual review of this guide against the sources listed at the end. */
const REVIEWED_ON = "2026-10-30";
const REVIEWED_LABEL = "30 October 2026";

/** Official documentation this guide is checked against. */
const SOURCES = [
  {
    label: "Guidelines for representing your business on Google (name, categories)",
    href: "https://support.google.com/business/answer/3038177?hl=en",
  },
  {
    label: "Chat and call history were turned off in Google Business Profile",
    href: "https://support.google.com/business/answer/14919056?hl=en",
  },
  {
    label: "Contact options available on a Business Profile",
    href: "https://support.google.com/business/answer/3039617?hl=en",
  },
  {
    label: "Google Search Central: make your links crawlable",
    href: "https://developers.google.com/search/docs/crawling-indexing/links-crawlable#internal-links",
  },
];

export const Route = createFileRoute("/blog/local-seo-guide")({
  head: () => ({
    meta: [
      { title: `${TITLE} — Milo Growth` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: PAGE_URL },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: TITLE,
          description: DESCRIPTION,
          inLanguage: "en",
          // Only the review date is claimed: there is no recorded original
          // publication date for this page, so none is asserted.
          dateModified: REVIEWED_ON,
          author: { "@type": "Organization", name: "Milo Growth" },
          publisher: { "@type": "Organization", name: "Milo Growth" },
          mainEntityOfPage: PAGE_URL,
        }),
      },
    ],
  }),
  component: LocalSeoGuide,
});

function LocalSeoGuide() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto max-w-3xl flex items-center justify-between px-6 py-4">
          <Link to="/" className="font-display text-lg">
            Milo Growth
          </Link>
          <Button asChild size="sm">
            <Link to="/auth">Get started</Link>
          </Button>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-6 py-16 prose prose-neutral dark:prose-invert">
        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Guide · Local SEO
        </p>
        <h1 className="font-display text-4xl md:text-5xl mt-2">{TITLE}</h1>
        <p className="mt-2 text-xs text-muted-foreground">
          Reviewed {REVIEWED_LABEL} against the official documentation listed at the end.
        </p>
        <p className="mt-4 text-lg text-foreground/80">
          If you run a clinic, salon, studio, contracting business or any other small service
          company, local search is one of the few channels you can work on yourself, week by week,
          without an agency retainer. This guide walks through a practical local SEO strategy and
          links to Google's own documentation for the parts that change.
        </p>

        <h2 className="mt-12 font-display text-2xl">Why local SEO matters for small businesses</h2>
        <p className="mt-3 text-foreground/85">
          Most people looking for a service nearby start on Google. Appearing in the map results and
          the local organic results is what puts you in front of buyers who already want what you
          sell. Unlike national SEO, this does not need a large backlink budget — clear positioning,
          a complete and accurate Google Business Profile and a handful of well-targeted pages are
          the parts you actually control. None of it guarantees a position: Google decides what to
          rank, and results differ by query and location.
        </p>

        <h2 className="mt-10 font-display text-2xl">
          Step 1 — Get your Google Business Profile right
        </h2>
        <ul className="mt-3 space-y-2 text-foreground/85 list-disc pl-6">
          <li>
            Claim and verify the profile under the name your business actually uses in public — the
            one on your storefront, website and invoices. Google's guidelines ask for the real-world
            name without added keywords, locations or taglines; a legal entity name that no customer
            ever sees is not the name to use.
          </li>
          <li>
            Pick one primary category that describes what the business mainly is, not a single
            service it happens to offer. Add secondary categories only where they describe a real,
            distinct part of the business — the smallest accurate set, not one per service.
            Services, products and the profile description are where the individual offers belong.
          </li>
          <li>
            Fill every field that applies: hours, service area, phone, website, attributes and a
            complete description.
          </li>
          <li>Upload real photos of your team, premises and recent work, and keep them current.</li>
          <li>
            Check which contact options your profile actually offers. Google has turned off Business
            Profile chat and call history, so messaging is no longer part of the profile the way
            older guides describe it. Calls, your website link and — where available for your
            profile type and region — SMS or WhatsApp are configured in the profile's contact
            settings; confirm what is offered to you rather than assuming a channel exists.
          </li>
        </ul>

        <h2 className="mt-10 font-display text-2xl">Step 2 — Target the right local keywords</h2>
        <p className="mt-3 text-foreground/85">
          Your local keyword strategy is the intersection of three things: the services you sell,
          the places you serve, and how people actually phrase their searches. Start with one page
          per service and one page per city or neighbourhood you genuinely serve.
        </p>
        <ul className="mt-3 space-y-2 text-foreground/85 list-disc pl-6">
          <li>
            <strong>Service pages:</strong> "[service] in [city]" — e.g. "emergency plumber in
            Bristol".
          </li>
          <li>
            <strong>Comparison pages:</strong> "[service A] vs [service B]" for buyers narrowing
            options.
          </li>
          <li>
            <strong>Informational pages:</strong> "how much does [service] cost in [city]" or "what
            to expect".
          </li>
        </ul>

        <h2 className="mt-10 font-display text-2xl">Step 3 — Build location pages that convert</h2>
        <p className="mt-3 text-foreground/85">
          A good location page isn't a copy-pasted template with the city name swapped. Include the
          local team or address, area-specific photos, real reviews from clients in that area,
          directions, parking notes and service-area FAQs. A page that is specifically about one
          area is more useful to the person reading it, and gives search engines something concrete
          to understand — which is the part you can influence.
        </p>

        <h2 className="mt-10 font-display text-2xl">Step 4 — Earn reviews systematically</h2>
        <p className="mt-3 text-foreground/85">
          Reviews are what most people read before they choose between two similar businesses. Build
          a simple after-service routine: send a short message with a direct review link within 24
          hours of the job. Respond to every review, positive or negative, in your own voice. Aim
          for a steady flow rather than a big burst, and never incentivise or write them yourself.
        </p>

        <h2 className="mt-10 font-display text-2xl">Step 5 — Cover on-page SEO essentials</h2>
        <ul className="mt-3 space-y-2 text-foreground/85 list-disc pl-6">
          <li>One clear H1 per page that matches the search phrase.</li>
          <li>Unique title and meta description per page — never reuse the home page tags.</li>
          <li>Schema.org LocalBusiness markup on the home page and service pages.</li>
          <li>
            Internal links between service and location pages, as ordinary{" "}
            <code>&lt;a href&gt;</code> links with descriptive text, so Google can reliably discover
            the linked pages.
          </li>
          <li>Fast, mobile-friendly pages — most local searches happen on a phone.</li>
        </ul>

        <h2 className="mt-10 font-display text-2xl">Step 6 — Keep a monthly rhythm</h2>
        <p className="mt-3 text-foreground/85">
          Local SEO is slow work. One new service page, one new location page, one new FAQ block,
          one new customer story per month is easier to sustain — and easier to learn from — than a
          one-off "SEO project" that stops after launch. This is the rhythm Milo Growth helps small
          business owners maintain without hiring an agency.
        </p>

        <h2 className="mt-10 font-display text-2xl">Sources</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Google's requirements change; these are the primary pages to check before acting on any
          local SEO advice, including this guide. Reviewed {REVIEWED_LABEL}.
        </p>
        <ul className="mt-3 space-y-2 text-sm list-disc pl-6">
          {SOURCES.map((source) => (
            <li key={source.href}>
              <a
                href={source.href}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 hover:text-foreground"
              >
                {source.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="mt-12 rounded-xl border border-border bg-card p-6">
          <h3 className="font-display text-xl">Want help planning your next month?</h3>
          <p className="mt-2 text-sm text-foreground/80">
            Milo Growth turns this kind of strategy into a concrete 30-day plan for your business —
            ranked opportunities, briefs, FAQ and exports you can paste straight into your CMS.
          </p>
          <div className="mt-4">
            <Button asChild>
              <Link to="/auth">Start free preview</Link>
            </Button>
          </div>
        </div>
      </article>

      <footer className="border-t border-border bg-card/40">
        <div className="mx-auto max-w-3xl px-6 py-8 text-sm text-muted-foreground flex justify-between">
          <span>Milo Growth — built by Andersen Innovations</span>
          <Link to="/" className="hover:text-foreground">
            Back to home
          </Link>
        </div>
      </footer>
    </div>
  );
}
