import { createFileRoute } from "@tanstack/react-router";
import { MarketPage } from "@/components/MarketPage";
import { MARKETS } from "@/lib/markets";

const cfg = MARKETS.eu;

export const Route = createFileRoute("/eu")({
  head: () => ({
    meta: [{ title: cfg.title }, { name: "description", content: cfg.metaDescription }],
    links: [{ rel: "canonical", href: "https://milogrowth.com/eu" }],
  }),
  component: () => <MarketPage config={cfg} />,
});
