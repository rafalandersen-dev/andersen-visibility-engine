import { createFileRoute } from "@tanstack/react-router";
import { MarketPage } from "@/components/MarketPage";
import { MARKETS } from "@/lib/markets";

const cfg = MARKETS.dk;

export const Route = createFileRoute("/dk")({
  head: () => ({
    meta: [{ title: cfg.title }, { name: "description", content: cfg.metaDescription }],
    links: [{ rel: "canonical", href: "https://milogrowth.com/dk" }],
  }),
  component: () => <MarketPage config={cfg} />,
});
