import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/i18n";
import { addLinkMarketplaceOrder, uid, useStore } from "@/lib/store";
import { buildSuggestedTopic, DEMO_MARKETPLACE_OFFERS, matchMarketplaceOffers } from "@/lib/link-marketplace";
import type { LinkMarketplaceMatch, LinkMarketplaceOrder } from "@/lib/types";
import { CheckCircle2, ExternalLink, Info, Search, ShoppingBasket, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/link-marketplace")({
  head: () => ({ meta: [{ title: "Link Marketplace — Milo Growth" }] }),
  component: LinkMarketplacePage,
});

function LinkMarketplacePage() {
  const t = useT();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const activeProjectId = useStore((state) => state.activeProjectId);
  const project = useStore((state) => state.projects.find((item) => item.id === state.activeProjectId));
  const analysis = useStore((state) => state.backlinkAnalyses.find((item) => item.projectId === state.activeProjectId));
  const orders = useStore((state) => state.linkMarketplaceOrders.filter((item) => item.projectId === state.activeProjectId));

  const offers = useMemo(() => {
    if (!project) return [];
    const normalized = query.trim().toLowerCase();
    return matchMarketplaceOffers(DEMO_MARKETPLACE_OFFERS, project, analysis).filter((item) =>
      !normalized || [item.domain, item.title, ...item.categories].join(" ").toLowerCase().includes(normalized),
    );
  }, [analysis, project, query]);

  if (!project) {
    return (
      <AppShell title={t("marketplace.title")} description={t("marketplace.subtitle")}>
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <ShoppingBasket className="mx-auto h-8 w-8 text-gold/70" />
          <p className="mt-3 text-sm text-muted-foreground">{t("analytics.setupFirst")}</p>
          <Button className="mt-4" onClick={() => navigate({ to: "/app/setup" })}>{t("nav.setup")}</Button>
        </div>
      </AppShell>
    );
  }

  function requestOffer(offer: LinkMarketplaceMatch) {
    if (!project || !activeProjectId) return;
    if (orders.some((order) => order.offerId === offer.id && order.status !== "Cancelled")) {
      toast.info(t("marketplace.toast.exists"));
      return;
    }
    const now = new Date().toISOString();
    const order: LinkMarketplaceOrder = {
      id: uid(), projectId: activeProjectId, offerId: offer.id, provider: offer.provider,
      domain: offer.domain, publicationTitle: offer.title, targetUrl: project.websiteUrl,
      suggestedTopic: buildSuggestedTopic(project, offer), price: offer.price, currency: offer.currency,
      status: "Requested", linkAttributes: "sponsored", createdAt: now, updatedAt: now,
    };
    addLinkMarketplaceOrder(order);
    toast.success(t("marketplace.toast.requested"));
  }

  return (
    <AppShell title={t("marketplace.title")} description={t("marketplace.subtitle")}>
      <div className="mb-5 rounded-lg border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">{t("marketplace.disclosureTitle")}</strong>{" "}{t("marketplace.disclosure")}
      </div>
      <div className="mb-5 flex gap-3 rounded-lg border border-sky-500/25 bg-sky-500/5 p-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
        <p><strong className="text-foreground">{t("marketplace.demoNoticeTitle")}</strong>{" "}{t("marketplace.demoNotice")}</p>
      </div>

      <Tabs defaultValue="offers">
        <TabsList>
          <TabsTrigger value="offers">{t("marketplace.offers")} ({offers.length})</TabsTrigger>
          <TabsTrigger value="orders">{t("marketplace.orders")} ({orders.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="offers" className="mt-5">
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("marketplace.search")} className="pl-9" />
          </div>
          {!analysis ? <p className="mt-3 text-xs text-muted-foreground">{t("marketplace.noAnalysis")}</p> : null}
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {offers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} requested={orders.some((order) => order.offerId === offer.id && order.status !== "Cancelled")} onRequest={() => requestOffer(offer)} t={t} />
            ))}
          </div>
        </TabsContent>
        <TabsContent value="orders" className="mt-5">
          {orders.length ? <div className="space-y-3">{orders.map((order) => <OrderCard key={order.id} order={order} t={t} />)}</div> : <EmptyOrders t={t} />}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function OfferCard({ offer, requested, onRequest, t }: { offer: LinkMarketplaceMatch; requested: boolean; onRequest: () => void; t: Translate }) {
  return (
    <article className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><h2 className="font-display text-lg">{offer.domain}</h2><p className="text-sm text-muted-foreground">{offer.title}</p></div>
        <div className="flex shrink-0 items-center gap-1.5">
          {offer.provider === "demo" ? <Badge variant="outline">{t("marketplace.demoBadge")}</Badge> : null}
          <Badge variant="secondary"><Sparkles className="mr-1 h-3 w-3" />{offer.matchScore}%</Badge>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {offer.isGapDomain ? <Badge>{t("marketplace.reason.linkGap")}</Badge> : null}
        {offer.categories.map((category) => <Badge key={category} variant="outline">{category}</Badge>)}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <Metric label={t("marketplace.rank")} value={String(offer.domainRank)} />
        <Metric label={t("marketplace.traffic")} value={offer.estimatedMonthlyTraffic.toLocaleString()} />
        <Metric label={t("marketplace.turnaround")} value={t("marketplace.days", { count: offer.turnaroundDays })} />
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div><p className="text-xs text-muted-foreground">{t("marketplace.price")}</p><p className="font-display text-2xl">€{offer.price}</p></div>
        <Button onClick={onRequest} disabled={requested}>{requested ? <CheckCircle2 className="h-4 w-4" /> : <ShoppingBasket className="h-4 w-4" />}{requested ? t("marketplace.requested") : t("marketplace.request")}</Button>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-0.5 font-medium">{value}</p></div>;
}

function OrderCard({ order, t }: { order: LinkMarketplaceOrder; t: Translate }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="font-medium">{order.domain}</h3><p className="mt-1 text-sm text-muted-foreground">{order.suggestedTopic}</p><p className="mt-2 text-xs text-muted-foreground"><ExternalLink className="mr-1 inline h-3 w-3" />{order.targetUrl}</p></div>
        <div className="text-right"><Badge variant="outline">{t(`marketplace.status.${order.status}`)}</Badge><p className="mt-2 font-medium">€{order.price}</p></div>
      </div>
    </article>
  );
}

function EmptyOrders({ t }: { t: Translate }) {
  return <div className="rounded-lg border border-dashed border-border p-12 text-center"><ShoppingBasket className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">{t("marketplace.ordersEmpty")}</p></div>;
}
