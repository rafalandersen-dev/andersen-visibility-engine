import { createFileRoute } from "@tanstack/react-router";
import { MarketPage } from "@/components/MarketPage";
import { MARKETS } from "@/lib/markets";
import { hreflangLinks } from "@/lib/locales";

const cfg = MARKETS.se;

export const Route = createFileRoute("/se")({
  head: () => ({
    meta: [{ title: cfg.title }, { name: "description", content: cfg.metaDescription }],
    links: [
      { rel: "canonical", href: "https://milogrowth.com/se" },
      ...hreflangLinks(),
    ],
  }),
  component: () => <MarketPage config={cfg} />,
});
