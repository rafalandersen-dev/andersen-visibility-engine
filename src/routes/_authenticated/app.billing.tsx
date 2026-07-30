import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useStore, setBillingProfile, refreshEntitlement, saveWorkspaceNow } from "@/lib/store";
import { useT } from "@/i18n";
import {
  PLAN_IDS,
  PLAN_META,
  PLAN_LIMITS,
  MARKET_CURRENCY,
  COUNTRY_OPTIONS,
  deriveBillingMarket,
  planPrice,
  addOnPrice,
  formatMoney,
  getCurrentPlanId,
  isActivePaid,
  type PlanId,
  type CustomerType,
  type BillingMarket,
  type SubscriptionStatus,
} from "@/lib/billing";
import { createPaddleCheckoutFn, createPaddlePortalSessionFn } from "@/lib/billing.functions";
import { setManualEntitlementFn } from "@/lib/entitlements.functions";
import { ShieldCheck, Crown, Check, ExternalLink, Loader2, Link2, CircleMinus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/billing")({
  head: () => ({ meta: [{ title: "Billing — Milo Growth" }] }),
  component: BillingPage,
});

const visualQa = import.meta.env.DEV && import.meta.env.VITE_MILO_VISUAL_QA === "true";

function BillingPage() {
  const t = useT();
  const { isOwner, user } = useAuth();
  const projects = useStore((s) => s.projects);
  const billingProfile = useStore((s) => s.billingProfile);
  const subscription = useStore((s) => s.subscription);

  // ---- Profile form ----
  const [customerType, setCustomerType] = useState<CustomerType>(
    billingProfile?.customerType ?? "business",
  );
  const [billingName, setBillingName] = useState(billingProfile?.billingName ?? "");
  const [businessName, setBusinessName] = useState(billingProfile?.businessName ?? "");
  const [billingEmail, setBillingEmail] = useState(
    billingProfile?.billingEmail ?? user?.email ?? "",
  );
  const [billingCountry, setBillingCountry] = useState(billingProfile?.billingCountry ?? "");
  const [vatId, setVatId] = useState(billingProfile?.vatId ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [checkingOut, setCheckingOut] = useState<PlanId | null>(null);
  const [portalBusy, setPortalBusy] = useState<"manage" | "cancel" | null>(null);

  const market: BillingMarket = billingCountry
    ? deriveBillingMarket(billingCountry)
    : (billingProfile?.billingMarket ?? "European Union");
  const currency = MARKET_CURRENCY[market];
  const currentPlanId: PlanId = visualQa ? "pro" : getCurrentPlanId(subscription);
  const status: SubscriptionStatus = visualQa ? "active" : (subscription?.status ?? "freePreview");
  const paid = visualQa || isActivePaid(subscription);

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const newMarket = billingCountry ? deriveBillingMarket(billingCountry) : undefined;
      const needsReview =
        paid &&
        billingProfile?.billingMarket &&
        newMarket &&
        newMarket !== billingProfile.billingMarket;
      setBillingProfile({
        customerType,
        billingName: billingName.trim() || undefined,
        businessName: customerType === "business" ? businessName.trim() || undefined : undefined,
        billingEmail: billingEmail.trim() || undefined,
        billingCountry: billingCountry || undefined,
        vatId: customerType === "business" ? vatId.trim() || undefined : undefined,
        billingMarket: newMarket,
        billingMarketLockedAt: paid
          ? billingProfile?.billingMarketLockedAt
          : newMarket
            ? new Date().toISOString()
            : undefined,
        billingMarketNeedsReview: needsReview ? true : billingProfile?.billingMarketNeedsReview,
        acceptedPricingCountryAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await saveWorkspaceNow();
      toast.success(t("billing.profileSaved"));
      if (needsReview) toast.message(t("billing.marketReview"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSavingProfile(false);
    }
  }

  async function choosePlan(planId: PlanId) {
    if (planId === "freePreview") {
      // Downgrades are an entitlement change: owners can self-serve, everyone
      // else cancels through the Paddle portal (the webhook then downgrades).
      if (!isOwner) {
        await openSubscriptionPortal("cancel");
        return;
      }
      await setManualEntitlementFn({ data: { planId: "freePreview", status: "freePreview" } });
      await refreshEntitlement();
      toast.success(t("billing.profileSaved"));
      return;
    }
    setCheckingOut(planId);
    try {
      const res = await createPaddleCheckoutFn({
        data: { planId, billingMarket: market, billingEmail: billingEmail.trim() || undefined },
      });
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      }
      // Not configured / no URL → nothing is written anywhere. Paid access is
      // granted exclusively by the verified Paddle webhook.
      toast.message(res.message || t("billing.checkoutNotConfigured"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setCheckingOut(null);
    }
  }

  async function manualActivate(planId: PlanId, manualStatus: "manualBeta" | "manualComped") {
    try {
      await setManualEntitlementFn({ data: { planId, status: manualStatus } });
      await refreshEntitlement();
      toast.success(t("billing.profileSaved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the plan.");
    }
  }

  async function openSubscriptionPortal(intent: "manage" | "cancel") {
    if (!subscription?.paddleCustomerId) {
      toast.message(
        "Your billing account is not linked to Paddle yet. Email billing@milogrowth.com and we will process the request immediately.",
      );
      return;
    }
    setPortalBusy(intent);
    try {
      const portal = await createPaddlePortalSessionFn({
        data: {
          customerId: subscription.paddleCustomerId,
          subscriptionId: subscription.paddleSubscriptionId,
        },
      });
      const target =
        intent === "cancel" ? (portal.cancelUrl ?? portal.overviewUrl) : portal.overviewUrl;
      if (target) {
        window.location.href = target;
        return;
      }
      toast.error(portal.error ?? portal.message ?? "Could not open subscription management.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not open subscription management.",
      );
    } finally {
      setPortalBusy(null);
    }
  }

  return (
    <AppShell title={t("billing.title")} description={t("billing.subtitle")}>
      <Link
        to="/app/beta-notes"
        className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm transition-colors hover:border-foreground/30"
      >
        <span className="text-foreground/85">{t("beta.limit.paddle")}</span>
        <span className="shrink-0 text-xs text-accent">{t("launch.betaNotesCta")} →</span>
      </Link>

      {isOwner ? (
        <div className="mb-8 rounded-xl border border-gold/40 bg-gold/5 p-5 flex items-start gap-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gold/15 text-gold">
            <Crown className="h-4 w-4" />
          </div>
          <div>
            <div className="font-display text-lg">{t("billing.owner.title")}</div>
            <p className="text-sm text-muted-foreground">{t("billing.owner.desc")}</p>
          </div>
        </div>
      ) : null}

      {/* Current plan */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {t("billing.currentPlan")}
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-display text-2xl">
              {isOwner ? "Owner" : PLAN_META[currentPlanId].name}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
          </div>
          <div className="text-right text-sm">
            <div>
              <span className="text-muted-foreground">{t("billing.status")}: </span>
              {isOwner ? "—" : t(`billing.statusLabel.${status}`)}
            </div>
            <div>
              <span className="text-muted-foreground">{t("billing.billingMarket")}: </span>
              {market}
            </div>
            <div>
              <span className="text-muted-foreground">{t("billing.price")}: </span>
              {currentPlanId === "freePreview"
                ? formatMoney(0, currency)
                : `${formatMoney(planPrice(market, currentPlanId), currency)} ${t("billing.perMonth")}`}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Tag>{PLAN_LIMITS[currentPlanId].maxProjects} projects</Tag>
          <Tag>{PLAN_LIMITS[currentPlanId].maxWebsites} websites</Tag>
          <Tag>
            {PLAN_LIMITS[currentPlanId].publishingEnabled ? "Publishing on" : "Publishing off"}
          </Tag>
          <Tag>{PLAN_LIMITS[currentPlanId].monthlyContentGenerations} content/mo</Tag>
        </div>
        {!isOwner && paid ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
            <div>
              <div className="text-sm font-medium text-foreground">Manage your subscription</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Update payment details, download invoices, change plan or cancel at any time.
                {subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd
                  ? ` Cancellation is scheduled for ${subscription.currentPeriodEnd}.`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => openSubscriptionPortal("manage")}
                disabled={portalBusy !== null}
              >
                {portalBusy === "manage" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
                Manage billing
              </Button>
              <Button
                variant="outline"
                className="border-destructive/35 text-destructive hover:bg-destructive/5 hover:text-destructive"
                onClick={() => openSubscriptionPortal("cancel")}
                disabled={portalBusy !== null}
              >
                {portalBusy === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Cancel subscription
              </Button>
            </div>
          </div>
        ) : null}
        {!isOwner && !paid ? (
          <div className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
            When you activate a paid plan, subscription management and cancellation remain visible
            here.
          </div>
        ) : null}
      </section>

      {/* Billing profile */}
      <section className="mt-8 rounded-xl border border-border bg-card p-6">
        <h2 className="font-display text-xl">{t("billing.profile")}</h2>
        <div className="mt-4 grid md:grid-cols-2 gap-4">
          <Field label={t("billing.customerType")}>
            <Select value={customerType} onValueChange={(v) => setCustomerType(v as CustomerType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="business">{t("billing.business")}</SelectItem>
                <SelectItem value="consumer">{t("billing.consumer")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("billing.billingEmail")}>
            <Input
              value={billingEmail}
              onChange={(e) => setBillingEmail(e.target.value)}
              placeholder="billing@example.com"
            />
          </Field>
          <Field label={t("billing.billingName")}>
            <Input value={billingName} onChange={(e) => setBillingName(e.target.value)} />
          </Field>
          {customerType === "business" ? (
            <Field label={t("billing.businessName")}>
              <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
            </Field>
          ) : null}
          <Field label={t("billing.billingCountry")}>
            <Select value={billingCountry || undefined} onValueChange={setBillingCountry}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRY_OPTIONS.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {customerType === "business" ? (
            <Field label={t("billing.vatId")}>
              <Input
                value={vatId}
                onChange={(e) => setVatId(e.target.value)}
                placeholder="optional"
              />
            </Field>
          ) : null}
          <Field label={t("billing.derivedMarket")}>
            <div className="flex h-9 items-center rounded-md border border-border bg-secondary/40 px-3 text-sm text-foreground/80">
              {billingCountry ? market : t("billing.selectCountryFirst")}
            </div>
          </Field>
        </div>
        {billingProfile?.billingMarketNeedsReview ? (
          <p className="mt-3 text-xs text-amber-600">{t("billing.marketReview")}</p>
        ) : null}
        <div className="mt-5 flex justify-end">
          <Button onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? "…" : t("billing.saveProfile")}
          </Button>
        </div>
      </section>

      {/* Choose plan */}
      <h2 className="mt-10 font-display text-2xl">{t("billing.choosePlan")}</h2>
      {!billingCountry ? (
        <p className="mt-1 text-sm text-muted-foreground">{t("billing.selectCountryFirst")}</p>
      ) : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {PLAN_IDS.map((pid) => {
          const meta = PLAN_META[pid];
          const lim = PLAN_LIMITS[pid];
          const isCurrent = !isOwner && pid === currentPlanId;
          return (
            <div
              key={pid}
              className={
                "rounded-xl border p-5 bg-card flex flex-col " +
                (meta.recommended
                  ? "border-gold shadow-[0_0_0_1px_hsl(var(--gold)/0.45)]"
                  : "border-border")
              }
            >
              {meta.recommended ? (
                <div className="mb-2 inline-block self-start rounded-full bg-gold/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-gold">
                  {t("billing.recommended")}
                </div>
              ) : null}
              <h3 className="font-display text-lg">{meta.name}</h3>
              <div className="mt-1.5 flex items-baseline gap-1">
                <span className="font-display text-2xl">
                  {formatMoney(planPrice(market, pid), currency)}
                </span>
                {pid !== "freePreview" ? (
                  <span className="text-xs text-muted-foreground">{t("billing.perMonth")}</span>
                ) : null}
              </div>
              <ul className="mt-4 space-y-1.5 text-xs flex-1">
                {meta.features.map((f) => (
                  <li key={f} className="flex gap-1.5">
                    <Check className="h-3.5 w-3.5 mt-0.5 text-gold/80 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-3 text-[11px] text-muted-foreground">
                {lim.maxProjects} projects · {lim.maxWebsites} websites
              </div>
              {isCurrent ? (
                <Button className="mt-4" variant="outline" disabled>
                  {t("billing.currentLabel")}
                </Button>
              ) : (
                <Button
                  className="mt-4"
                  variant={meta.recommended ? "default" : "outline"}
                  disabled={checkingOut !== null}
                  onClick={() => choosePlan(pid)}
                >
                  {pid === "freePreview" ? t("billing.choose") : t("billing.upgrade")}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add-ons */}
      <h2 className="mt-10 font-display text-2xl">{t("billing.addons")}</h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-lg">{t("billing.assistedSetup")}</h3>
            <div className="mt-1 text-sm text-muted-foreground">
              {formatMoney(addOnPrice(market, "assistedSetup"), currency)} {t("billing.oneTime")}
            </div>
          </div>
          <a href="mailto:support@milogrowth.com?subject=Assisted%20Setup">
            <Button variant="outline" size="sm">
              {t("billing.contactSupport")}
            </Button>
          </a>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-lg">{t("billing.monthlyCare")}</h3>
            <div className="mt-1 text-sm text-muted-foreground">
              {formatMoney(addOnPrice(market, "monthlyCare"), currency)} {t("billing.perMonth")}
            </div>
          </div>
          <a href="mailto:support@milogrowth.com?subject=Monthly%20Care">
            <Button variant="outline" size="sm">
              {t("billing.contactSupport")}
            </Button>
          </a>
        </div>
        <div className="rounded-xl border border-[#d9c394] bg-[#faf6ec] p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#b77f1f]/10 text-[#9d6a14]">
              <Link2 className="h-4 w-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-lg">Backlinks</h3>
                <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Separate add-on
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Link intelligence, marketplace review and outreach. Publisher placements are billed
                individually and approved before purchase.
              </p>
            </div>
          </div>
          <a href="mailto:support@milogrowth.com?subject=Backlinks%20add-on">
            <Button className="mt-4 w-full" variant="outline" size="sm">
              Review add-on
            </Button>
          </a>
        </div>
      </div>

      {/* Owner-only manual activation */}
      {isOwner ? (
        <section className="mt-10 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
          <h2 className="font-display text-lg">{t("billing.manual.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("billing.manual.desc")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void manualActivate("growth", "manualBeta")}
            >
              {t("billing.manual.beta")} (Growth)
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void manualActivate("pro", "manualComped")}
            >
              {t("billing.manual.comped")} (Pro)
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                try {
                  await setManualEntitlementFn({
                    data: { planId: "freePreview", status: "freePreview" },
                  });
                  await refreshEntitlement();
                  toast.success(t("billing.profileSaved"));
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not update the plan.");
                }
              }}
            >
              {t("billing.manual.reset")}
            </Button>
          </div>
        </section>
      ) : null}

      {!isOwner && paid ? (
        <section className="mt-10 flex flex-wrap items-center justify-between gap-5 rounded-xl border border-destructive/45 bg-destructive/[.025] p-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-destructive/50 text-destructive">
              <CircleMinus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-xl text-destructive">Cancel subscription</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Cancel from the secure Paddle portal and keep access through the end of your billing
                period.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                You can export your content before access changes. Backlinks, when active, remains
                separately billed.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="border-destructive/50 text-destructive hover:bg-destructive/5 hover:text-destructive"
            onClick={() => openSubscriptionPortal("cancel")}
            disabled={portalBusy !== null}
          >
            {portalBusy === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Cancel subscription
          </Button>
        </section>
      ) : null}

      {/* Notes */}
      <div className="mt-8 space-y-1.5 text-xs text-muted-foreground max-w-3xl">
        <p>{t("billing.rulesNote")}</p>
        <p>{t("billing.taxNote")}</p>
        <p>{t("billing.paddleNote")}</p>
        <p>{t("billing.noGuarantee")}</p>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-secondary/40 px-2 py-0.5">
      {children}
    </span>
  );
}
