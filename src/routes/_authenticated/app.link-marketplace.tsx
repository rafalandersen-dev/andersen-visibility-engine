import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { translate, useAppLanguage, useT } from "@/i18n";
import {
  confirmMarketplaceOrderFn,
  createMarketplaceQuoteFn,
  listMarketplaceOffersFn,
} from "@/lib/link-marketplace.functions";
import { addLinkMarketplaceOrder, saveWorkspaceNow, uid, useStore } from "@/lib/store";
import { buildSuggestedTopic, DEMO_MARKETPLACE_OFFERS, matchMarketplaceOffers } from "@/lib/link-marketplace";
import type {
  LinkMarketplaceIntegrationStatus,
  LinkMarketplaceMatch,
  LinkMarketplaceOffer,
  LinkMarketplaceOrder,
  LinkMarketplaceQuote,
} from "@/lib/types";
import { CheckCircle2, ExternalLink, Info, Loader2, Search, ShieldCheck, ShoppingBasket, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/link-marketplace")({
  head: () => ({ meta: [{ title: "Link Marketplace — Milo Growth" }] }),
  component: LinkMarketplacePage,
});

function LinkMarketplacePage() {
  const t = useT();
  const appLanguage = useAppLanguage();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<LinkMarketplaceOffer[]>(DEMO_MARKETPLACE_OFFERS);
  const [integration, setIntegration] = useState<LinkMarketplaceIntegrationStatus>({
    mode: "demo",
    provider: "linkhouse",
    credentialsPresent: false,
    signingReady: false,
    marginConfigured: false,
    catalogConnected: false,
    orderingEnabled: false,
    documentationPending: true,
  });
  const [quote, setQuote] = useState<LinkMarketplaceQuote | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<LinkMarketplaceMatch | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [preparingOfferId, setPreparingOfferId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [acknowledgedSponsored, setAcknowledgedSponsored] = useState(false);
  const [acknowledgedPayment, setAcknowledgedPayment] = useState(false);
  const activeProjectId = useStore((state) => state.activeProjectId);
  const project = useStore((state) => state.projects.find((item) => item.id === state.activeProjectId));
  const analysis = useStore((state) => state.backlinkAnalyses.find((item) => item.projectId === state.activeProjectId));
  const orders = useStore((state) => state.linkMarketplaceOrders.filter((item) => item.projectId === state.activeProjectId));

  const offers = useMemo(() => {
    if (!project) return [];
    const normalized = query.trim().toLowerCase();
    return matchMarketplaceOffers(catalog, project, analysis).filter((item) =>
      !normalized || [item.domain, item.title, ...item.categories].join(" ").toLowerCase().includes(normalized),
    );
  }, [analysis, catalog, project, query]);

  useEffect(() => {
    let cancelled = false;
    void listMarketplaceOffersFn()
      .then((result) => {
        if (cancelled) return;
        setCatalog(result.offers);
        setIntegration(result.status);
      })
      .catch(() => {
        if (!cancelled) toast.error(translate(appLanguage, "marketplace.toast.catalogError"));
      });
    return () => {
      cancelled = true;
    };
  }, [appLanguage]);

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

  async function prepareQuote(offer: LinkMarketplaceMatch) {
    if (!project || !activeProjectId || preparingOfferId) return;
    if (orders.some((order) => order.offerId === offer.id && order.status !== "Cancelled")) {
      toast.info(t("marketplace.toast.exists"));
      return;
    }
    setPreparingOfferId(offer.id);
    try {
      const nextQuote = await createMarketplaceQuoteFn({ data: { offerId: offer.id, targetUrl: project.websiteUrl } });
      setSelectedOffer(offer);
      setQuote(nextQuote);
      setAcknowledgedSponsored(false);
      setAcknowledgedPayment(false);
      setQuoteOpen(true);
    } catch {
      toast.error(t("marketplace.toast.quoteError"));
    } finally {
      setPreparingOfferId(null);
    }
  }

  async function confirmOrder() {
    if (!project || !activeProjectId || !quote || !selectedOffer || submitting || !acknowledgedSponsored || !acknowledgedPayment) return;
    setSubmitting(true);
    try {
      const result = await confirmMarketplaceOrderFn({
        data: {
          confirmationToken: quote.confirmationToken,
          confirmedTotalPrice: quote.totalPrice,
          acknowledgedSponsored,
          acknowledgedPayment,
        },
      });
      const now = new Date().toISOString();
      const order: LinkMarketplaceOrder = {
        id: uid(),
        projectId: activeProjectId,
        offerId: selectedOffer.id,
        provider: selectedOffer.provider,
        domain: selectedOffer.domain,
        publicationTitle: selectedOffer.title,
        targetUrl: project.websiteUrl,
        suggestedTopic: buildSuggestedTopic(project, selectedOffer),
        basePrice: quote.basePrice,
        serviceFee: quote.serviceFee,
        marginPercent: quote.marginPercent,
        price: quote.totalPrice,
        currency: quote.currency,
        status: result.status,
        linkAttributes: "sponsored",
        quoteId: quote.id,
        quoteExpiresAt: quote.expiresAt,
        confirmedAt: now,
        providerOrderId: result.providerOrderId,
        providerStatus: result.providerStatus,
        events: [{
          status: result.status,
          at: now,
          note: result.submitted ? "Order submitted to Linkhouse." : "Demo request saved in Milo; no provider order or payment was created.",
        }],
        createdAt: now,
        updatedAt: now,
      };
      addLinkMarketplaceOrder(order);
      await saveWorkspaceNow();
      setQuoteOpen(false);
      setQuote(null);
      setSelectedOffer(null);
      toast.success(result.submitted ? t("marketplace.toast.submitted") : t("marketplace.toast.requested"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast.error(message.includes("expired") ? t("marketplace.toast.quoteExpired") : t("marketplace.toast.orderError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title={t("marketplace.title")} description={t("marketplace.subtitle")}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
          <div>
            <p className="font-medium">{t("marketplace.integrationTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {integration.mode === "live" ? t("marketplace.integrationLive") : t("marketplace.integrationPending")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={integration.catalogConnected ? "secondary" : "outline"}>
            {integration.catalogConnected ? t("marketplace.catalogConnected") : t("marketplace.catalogDemo")}
          </Badge>
          <Badge variant={integration.orderingEnabled ? "secondary" : "outline"}>
            {integration.orderingEnabled ? t("marketplace.orderingEnabled") : t("marketplace.orderingLocked")}
          </Badge>
        </div>
      </div>
      <div className="mb-5 rounded-lg border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">{t("marketplace.disclosureTitle")}</strong>{" "}{t("marketplace.disclosure")}
      </div>
      {integration.mode === "demo" ? (
        <div className="mb-5 flex gap-3 rounded-lg border border-sky-500/25 bg-sky-500/5 p-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
          <p><strong className="text-foreground">{t("marketplace.demoNoticeTitle")}</strong>{" "}{t("marketplace.demoNotice")}</p>
        </div>
      ) : null}

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
              <OfferCard
                key={offer.id}
                offer={offer}
                requested={orders.some((order) => order.offerId === offer.id && order.status !== "Cancelled")}
                loading={preparingOfferId === offer.id}
                onRequest={() => prepareQuote(offer)}
                t={t}
              />
            ))}
          </div>
        </TabsContent>
        <TabsContent value="orders" className="mt-5">
          {orders.length ? <div className="space-y-3">{orders.map((order) => <OrderCard key={order.id} order={order} t={t} />)}</div> : <EmptyOrders t={t} />}
        </TabsContent>
      </Tabs>

      <Dialog open={quoteOpen} onOpenChange={(open) => { if (!submitting) setQuoteOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">{t("marketplace.quoteTitle")}</DialogTitle>
            <DialogDescription>{selectedOffer?.domain}</DialogDescription>
          </DialogHeader>
          {quote ? (
            <div className="space-y-4">
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4 text-sm">
                <PriceRow label={t("marketplace.basePrice")} value={quote.basePrice} />
                <PriceRow label={t("marketplace.serviceFee", { count: quote.marginPercent })} value={quote.serviceFee} />
                <div className="border-t border-border pt-2">
                  <PriceRow label={t("marketplace.totalPrice")} value={quote.totalPrice} strong />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("marketplace.quoteExpires", { time: new Date(quote.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}
              </p>
              <label className="flex items-start gap-3 text-sm">
                <Checkbox checked={acknowledgedSponsored} onCheckedChange={(checked) => setAcknowledgedSponsored(checked === true)} />
                <span>{t("marketplace.confirmSponsored")}</span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <Checkbox checked={acknowledgedPayment} onCheckedChange={(checked) => setAcknowledgedPayment(checked === true)} />
                <span>{quote.live ? t("marketplace.confirmPaymentLive", { total: quote.totalPrice }) : t("marketplace.confirmPaymentDemo", { total: quote.totalPrice })}</span>
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuoteOpen(false)} disabled={submitting}>{t("common.cancel")}</Button>
            <Button onClick={confirmOrder} disabled={!quote || !acknowledgedSponsored || !acknowledgedPayment || submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {quote?.live ? t("marketplace.confirmPurchase") : t("marketplace.confirmDemoRequest")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function OfferCard({ offer, requested, loading, onRequest, t }: { offer: LinkMarketplaceMatch; requested: boolean; loading: boolean; onRequest: () => void; t: Translate }) {
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
        <Button onClick={onRequest} disabled={requested || loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : requested ? <CheckCircle2 className="h-4 w-4" /> : <ShoppingBasket className="h-4 w-4" />}
          {requested ? t("marketplace.requested") : t("marketplace.reviewPrice")}
        </Button>
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
      {typeof order.basePrice === "number" && typeof order.serviceFee === "number" ? (
        <div className="mt-4 grid gap-2 border-t border-border pt-3 text-xs text-muted-foreground sm:grid-cols-3">
          <span>{t("marketplace.basePrice")}: €{order.basePrice.toFixed(2)}</span>
          <span>{t("marketplace.serviceFee", { count: order.marginPercent ?? 0 })}: €{order.serviceFee.toFixed(2)}</span>
          <span>{t("marketplace.confirmedAt")}: {order.confirmedAt ? new Date(order.confirmedAt).toLocaleString() : "—"}</span>
        </div>
      ) : null}
      {order.events?.length ? (
        <div className="mt-3 rounded-md bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
          {order.events.at(-1)?.note}
        </div>
      ) : null}
    </article>
  );
}

function PriceRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${strong ? "font-semibold text-foreground" : ""}`}>
      <span>{label}</span>
      <span>€{value.toFixed(2)}</span>
    </div>
  );
}

function EmptyOrders({ t }: { t: Translate }) {
  return <div className="rounded-lg border border-dashed border-border p-12 text-center"><ShoppingBasket className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">{t("marketplace.ordersEmpty")}</p></div>;
}
