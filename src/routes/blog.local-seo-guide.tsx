import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

const PAGE_URL = "https://milogrowth.com/blog/local-seo-guide";
const TITLE = "Local SEO Strategy Guide for Small Businesses";
const DESCRIPTION =
  "A practical local SEO strategy guide for small service businesses — Google Business Profile, local keyword targeting, reviews and on-page essentials that move the needle.";

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
          <Link to="/" className="font-display text-lg">Milo Growth</Link>
          <Link to="/auth"><Button size="sm">Get started</Button></Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-6 py-16 prose prose-neutral dark:prose-invert">
        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Guide · Local SEO</p>
        <h1 className="font-display text-4xl md:text-5xl mt-2">{TITLE}</h1>
        <p className="mt-4 text-lg text-foreground/80">
          If you run a clinic, salon, studio, contracting business or any other small service company,
          local SEO is the single highest-leverage marketing channel you have. This guide walks through
          a practical local SEO strategy you can execute yourself — without an agency retainer.
        </p>

        <h2 className="mt-12 font-display text-2xl">Why local SEO matters for small businesses</h2>
        <p className="mt-3 text-foreground/85">
          Most people looking for a service nearby start on Google. Ranking in the map pack and the
          local organic results is what puts you in front of buyers who already want what you sell.
          Unlike national SEO, you don't need huge backlink budgets — clear positioning, a complete
          Google Business Profile and a handful of well-targeted pages can move you onto page one.
        </p>

        <h2 className="mt-10 font-display text-2xl">Step 1 — Optimize your Google Business Profile</h2>
        <ul className="mt-3 space-y-2 text-foreground/85 list-disc pl-6">
          <li>Claim and verify the profile with the exact legal business name — no keyword stuffing.</li>
          <li>Pick the most specific primary category, then add secondary categories for each service.</li>
          <li>Fill every field: hours, service area, phone, website, attributes and a complete description.</li>
          <li>Upload real photos of your team, premises and recent work — refresh them monthly.</li>
          <li>Turn on messaging and respond within the day; Google rewards active profiles.</li>
        </ul>

        <h2 className="mt-10 font-display text-2xl">Step 2 — Target the right local keywords</h2>
        <p className="mt-3 text-foreground/85">
          Your local keyword strategy is the intersection of three things: the services you sell, the
          places you serve, and how people actually phrase their searches. Start with one page per
          service and one page per city or neighbourhood you want to win.
        </p>
        <ul className="mt-3 space-y-2 text-foreground/85 list-disc pl-6">
          <li><strong>Service pages:</strong> "[service] in [city]" — e.g. "emergency plumber in Bristol".</li>
          <li><strong>Comparison pages:</strong> "[service A] vs [service B]" for buyers narrowing options.</li>
          <li><strong>Informational pages:</strong> "how much does [service] cost in [city]" or "what to expect".</li>
        </ul>

        <h2 className="mt-10 font-display text-2xl">Step 3 — Build location pages that convert</h2>
        <p className="mt-3 text-foreground/85">
          A good location page isn't a copy-pasted template with the city name swapped. Include the
          local team or location address, area-specific photos, real reviews from clients in that
          area, directions, parking notes and service-area FAQs. The more genuinely local the page
          feels, the better it ranks — and the more it converts.
        </p>

        <h2 className="mt-10 font-display text-2xl">Step 4 — Earn reviews systematically</h2>
        <p className="mt-3 text-foreground/85">
          Reviews are both a ranking signal and a conversion lever. Build a simple after-service
          routine: send a short message with a direct review link within 24 hours of the job. Respond
          to every review, positive or negative, in your own voice. Aim for steady flow rather than a
          big burst.
        </p>

        <h2 className="mt-10 font-display text-2xl">Step 5 — Cover on-page SEO essentials</h2>
        <ul className="mt-3 space-y-2 text-foreground/85 list-disc pl-6">
          <li>One clear H1 per page that matches the search phrase.</li>
          <li>Unique title and meta description per page — never reuse the home page tags.</li>
          <li>Schema.org LocalBusiness markup on the home page and service pages.</li>
          <li>Internal links from service pages to location pages and vice versa.</li>
          <li>Fast, mobile-friendly pages — most local searches happen on a phone.</li>
        </ul>

        <h2 className="mt-10 font-display text-2xl">Step 6 — Keep a monthly rhythm</h2>
        <p className="mt-3 text-foreground/85">
          Local SEO compounds. One new service page, one new location page, one new FAQ block, one new
          customer story per month — multiplied over a year — usually beats a one-off "SEO project".
          This is exactly the rhythm Milo Growth helps small business owners maintain without hiring
          an agency.
        </p>

        <div className="mt-12 rounded-xl border border-border bg-card p-6">
          <h3 className="font-display text-xl">Want help planning your next month?</h3>
          <p className="mt-2 text-sm text-foreground/80">
            Milo Growth turns this kind of strategy into a concrete 30-day plan for your business —
            ranked opportunities, briefs, FAQ and exports you can paste straight into your CMS.
          </p>
          <div className="mt-4">
            <Link to="/auth"><Button>Start free preview</Button></Link>
          </div>
        </div>
      </article>

      <footer className="border-t border-border bg-card/40">
        <div className="mx-auto max-w-3xl px-6 py-8 text-sm text-muted-foreground flex justify-between">
          <span>Milo Growth — built by Andersen Innovations</span>
          <Link to="/" className="hover:text-foreground">Back to home</Link>
        </div>
      </footer>
    </div>
  );
}
