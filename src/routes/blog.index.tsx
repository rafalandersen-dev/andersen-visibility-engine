import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/MarketingShell";
import { SITE_ORIGIN } from "@/lib/locales";
import { getMiloBlogListing } from "@/lib/milo/published.functions";
import { STATIC_POSTS } from "@/lib/milo/static-posts";

const PAGE_URL = `${SITE_ORIGIN}/blog`;
const TITLE = "Blog | Milo Growth";
const DESCRIPTION =
  "Practical guides on local SEO, AI search visibility and content planning for small businesses, from the team behind Milo Growth.";

export const Route = createFileRoute("/blog/")({
  loader: () => getMiloBlogListing(),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: PAGE_URL },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
  }),
  component: BlogIndex,
});

function BlogIndex() {
  const published = Route.useLoaderData();
  const posts = [...STATIC_POSTS, ...published].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <MarketingShell>
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-display text-4xl md:text-5xl">Blog</h1>
        <p className="mt-3 text-lg text-foreground/80">{DESCRIPTION}</p>
        <ul className="mt-10 divide-y divide-border border-y border-border">
          {posts.map((post) => (
            <li key={post.slug} className="py-6">
              <p className="text-xs text-muted-foreground">
                <time dateTime={post.date}>{post.date}</time>
              </p>
              <h2 className="mt-1 font-display text-2xl">
                <Link to="/blog/$slug" params={{ slug: post.slug }} className="hover:underline">
                  {post.title}
                </Link>
              </h2>
              {post.description ? (
                <p className="mt-2 text-foreground/80">{post.description}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </MarketingShell>
  );
}
