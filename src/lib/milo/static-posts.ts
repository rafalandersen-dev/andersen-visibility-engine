// Repo-managed articles that live in their own route files. They are listed on
// /blog and their slugs can never be taken by a Milo article.
export const STATIC_POSTS = [
  {
    slug: "local-seo-guide",
    title: "Local SEO Strategy Guide for Small Businesses",
    description:
      "A practical local SEO guide for small service businesses, covering Google Business Profile basics, local keyword targeting, location pages, reviews and on-page essentials, with links to Google's own documentation.",
    date: "2026-10-30",
  },
] as const;
