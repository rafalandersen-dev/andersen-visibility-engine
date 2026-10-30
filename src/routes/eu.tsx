import { createFileRoute } from "@tanstack/react-router";
import { MarketPage } from "@/components/MarketPage";
import { MARKETS } from "@/lib/markets";

const cfg = MARKETS.eu;

/**
 * Generic English market page. Selectable like every other market and keeps its
 * own self-canonical, but deliberately emits no hreflang: it is not a separate
 * language version of `/`. See the note in @/lib/locales.
 */
export const Route = createFileRoute("/eu")({
  head: () => ({
    meta: [{ title: cfg.title }, { name: "description", content: cfg.metaDescription }],
    links: [{ rel: "canonical", href: "https://milogrowth.com/eu" }],
  }),
  component: () => <MarketPage config={cfg} />,
});
