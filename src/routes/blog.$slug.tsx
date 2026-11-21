import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { BlogArticleBody } from "@/components/BlogArticleBody";
import { MarketingShell } from "@/components/MarketingShell";
import { Button } from "@/components/ui/button";
import { SITE_ORIGIN } from "@/lib/locales";
import { articleJsonLd } from "@/lib/milo/published";
import { getMiloBlogPost } from "@/lib/milo/published.functions";

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    const post = await getMiloBlogPost({ data: { slug: params.slug } });
    if (!post) throw notFound();
    return post;
  },
  head: ({ loaderData: post }) => {
    if (!post) return {};
    const url = `${SITE_ORIGIN}/blog/${post.slug}`;
    return {
      meta: [
        { title: post.seoTitle },
        { name: "description", content: post.description },
        { property: "og:title", content: post.title },
        { property: "og:description", content: post.description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { property: "article:published_time", content: post.publishedAt },
        { name: "twitter:title", content: post.title },
        { name: "twitter:description", content: post.description },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: articleJsonLd(post).map((data) => ({
        type: "application/ld+json",
        children: JSON.stringify(data),
      })),
    };
  },
  notFoundComponent: () => (
    <MarketingShell>
      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-display text-4xl">Article not found</h1>
        <p className="mt-3 text-muted-foreground">It may not be published yet.</p>
        <Button asChild className="mt-6">
          <Link to="/blog">All articles</Link>
        </Button>
      </section>
    </MarketingShell>
  ),
  component: BlogPostPage,
});

function BlogPostPage() {
  const post = Route.useLoaderData();
  return (
    <MarketingShell>
      <article className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-xs text-muted-foreground">
          <Link to="/blog" className="hover:text-foreground">
            Blog
          </Link>
          {" / "}
          <time dateTime={post.publishedAt}>{post.publishedAt}</time>
        </p>
        <h1 className="mt-2 font-display text-4xl md:text-5xl">{post.title}</h1>
        <BlogArticleBody sections={post.sections} />
      </article>
    </MarketingShell>
  );
}
