import { createFileRoute, Link } from "@tanstack/react-router";
import { StripeSandboxPanel } from "@/components/StripeSandboxPanel";
import { StripeCommercialPanel } from "@/components/billing/StripeCommercialPanel";
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
import { useAppLanguage, useT } from "@/i18n";
import {
  billingCountryLabel,
  billingFeatureLabel,
  billingMarketLabel,
  formatBillingMoney,
} from "@/lib/billing-presentation";
import {
  PLAN_IDS,
  PLAN_META,
  PLAN_LIMITS,
  MARKET_CURRENCY,
  COUNTRY_OPTIONS,
  deriveBillingMarket,
  planPrice,
  addOnPrice,
  type PlanId,
  type CustomerType,
  type BillingMarket,
} from "@/lib/billing";
import { createPaddlePortalSessionFn } from "@/lib/billing.functions";
import { setManualEntitlementFn } from "@/lib/entitlements.functions";
import {
  cancelStripeSubscriptionFn,
  confirmStripeSubscriptionChangeFn,
  getStripeCommercialSummaryFn,
  prepareStripeSubscriptionChangeFn,
  reverseStripeCancellationFn,
} from "@/lib/stripe-commercial.functions";
import {
  canPrepareQuote,
  canResumeIntent,
  canStartCancellation,
  canOpenPaddlePortal,
  canStartReversal,
  canUseManualOverride,
  cancellationAvailable,
  commercialReasonKey,
  commercialUiReducer,
  confirmChangeRequest,
  createSessionGuard,
  createSingleFlight,
  focusIfConnected,
  freeSelectionAvailable,
  initialCommercialUiState,
  routeCancellation,
  routeFreeSelection,
  termsFromQuote,
  type CommercialIntentKind,
  type SellablePlanId,
} from "@/lib/stripe-commercial-ui";
import { Crown, Check, Loader2, Link2, CircleMinus } from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/billing")({
  head: () => ({ meta: [{ title: "Billing — Milo Growth" }] }),
  component: BillingPage,
});

/** Opaque caller-side intent identity. The server owns every provider id, and
 * this one is only ever created for a NEW intent — never to replace an
 * operation that already exists. */
function newIntentId(): string {
  return globalThis.crypto.randomUUID();
}

function BillingPage() {
  const t = useT();
  const locale = useAppLanguage();
  const money = (amount: number) => formatBillingMoney(amount, currency, locale);
  const { isOwner, user } = useAuth();
  const billingProfile = useStore((s) => s.billingProfile);

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
  const [portalBusy, setPortalBusy] = useState<"manage" | "cancel" | null>(null);

  // The CATALOGUE market. It follows the editable form immediately and is
  // deliberately not allowed anywhere near the verified current subscription:
  // selecting another country changes the offer shown, never the agreement the
  // customer already has.
  const market: BillingMarket = billingCountry
    ? deriveBillingMarket(billingCountry)
    : (billingProfile?.billingMarket ?? "European Union");
  const currency = MARKET_CURRENCY[market];

  /* ---------------------------------------------------------------------- */
  /* The authoritative billing summary                                      */
  /* ---------------------------------------------------------------------- */

  const [commercial, dispatchCommercial] = useReducer(
    commercialUiReducer,
    initialCommercialUiState,
  );
  // Request tokens are strictly increasing and never reused, so a response from
  // an earlier request — or from a previous signed-in user — is discarded
  // rather than allowed to overwrite current data.
  const summaryToken = useRef(0);
  const quoteToken = useRef(0);
  // Guards the FIRST awaited response: two clicks before it arrives send one
  // request, not two.
  const singleFlight = useRef(createSingleFlight()).current;
  const userId = user?.id ?? null;
  const summary = commercial.summary;

  // The live session generation. See `createSessionGuard`: it is what stops
  // an obsolete callback from enqueuing a read or settling an operation that
  // is no longer its own, including across A → B → A and unmount.
  const session = useRef(createSessionGuard()).current;
  const sessionCurrent = (epoch: number) => session.current(epoch);

  useEffect(() => () => session.stop(), [session]);

  const loadSummary = useCallback(
    async (epoch: number) => {
      // An obsolete callback must not even START a read: its token would
      // replace the current session's in-flight request.
      if (!sessionCurrent(epoch)) return;
      const token = ++summaryToken.current;
      dispatchCommercial({ type: "summary/request", epoch, token });
      let response: unknown;
      try {
        response = await getStripeCommercialSummaryFn();
      } catch {
        // A transport or validation rejection is UNAVAILABLE. It is never
        // converted into verified Free or into an invented provider.
        response = { ok: false, reason: "billing_read_unavailable" };
      }
      if (!sessionCurrent(epoch)) return;
      // The reducer validates the payload; nothing here trusts its type.
      dispatchCommercial({ type: "summary/resolved", epoch, token, response });
    },
    // `sessionCurrent` reads a ref and is stable for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // A READ on mount and on identity change. No effect in this route reaches a
  // commercial mutation.
  useEffect(() => {
    const epoch = session.next();
    dispatchCommercial({ type: "identity", userId, epoch });
    if (!userId) return;
    void loadSummary(epoch);
  }, [userId, loadSummary, session]);

  /* ---------------------------------------------------------------------- */
  /* Profile                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * A billing-country edit changes the catalogue a preview would be priced
   * from, so an unconfirmed preview stops applying immediately — before any
   * Save, and including a preview still in flight. It changes nothing about
   * the verified current agreement or its currency.
   */
  function changeBillingCountry(code: string) {
    setBillingCountry(code);
    dispatchCommercial({ type: "preview/invalidated" });
  }

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const newMarket = billingCountry ? deriveBillingMarket(billingCountry) : undefined;
      // Only a VERIFIED paid agreement locks a market; the editable form never
      // decides that on its own.
      const paidAgreement = summary?.access === "paid";
      const needsReview =
        paidAgreement &&
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
        billingMarketLockedAt: paidAgreement
          ? billingProfile?.billingMarketLockedAt
          : newMarket
            ? new Date().toISOString()
            : undefined,
        billingMarketNeedsReview: needsReview ? true : billingProfile?.billingMarketNeedsReview,
        acceptedPricingCountryAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await saveWorkspaceNow();
      // The saved billing country decides which catalogue a preview is priced
      // from, so an unconfirmed preview no longer applies. The verified
      // current money and any dispatched intent are untouched.
      dispatchCommercial({ type: "preview/invalidated" });
      toast.success(t("billing.profileSaved"));
      if (needsReview) toast.message(t("billing.marketReview"));
    } catch {
      toast.error(t("billingScreen.saveFailed"));
    } finally {
      setSavingProfile(false);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Provider routing                                                       */
  /* ---------------------------------------------------------------------- */

  async function openSubscriptionPortal(intent: "manage" | "cancel") {
    // Routing follows the VERIFIED provider from the read adapter. The store's
    // `paddleCustomerId` is not consulted: it carries whatever provider id the
    // entitlement had, so a Stripe or manual account would be sent to a Paddle
    // portal that is not theirs.
    //
    // And it follows CURRENT evidence, like every other action here. A portal
    // session is a provider call, so a Paddle flag from a read that has since
    // failed — or one still in flight — cannot authorise it. The disabled
    // button is not the guard; this is.
    if (!canOpenPaddlePortal(commercial)) {
      toast.message(
        summary?.provider === "paddle"
          ? t(commercialReasonKey(summary.heldReason ?? "operation_unavailable"))
          : t("billingScreen.commercial.manageUnavailable"),
      );
      return;
    }
    setPortalBusy(intent);
    try {
      const portal = await createPaddlePortalSessionFn();
      const target =
        intent === "cancel" ? (portal.cancelUrl ?? portal.overviewUrl) : portal.overviewUrl;
      if (target) {
        window.location.href = target;
        return;
      }
      toast.error(t("billingScreen.portalFailed"));
    } catch {
      toast.error(t("billingScreen.portalFailed"));
    } finally {
      setPortalBusy(null);
    }
  }

  /** The one entry point every "end my subscription" control uses. */
  async function requestCancellation(opener?: HTMLElement | null) {
    switch (routeCancellation(commercial)) {
      case "cancelIntent":
        openCommercialDialog("cancel", opener);
        return;
      case "paddlePortal":
        await openSubscriptionPortal("cancel");
        return;
      case "held":
        toast.message(t(commercialReasonKey(summary?.heldReason ?? "held")));
        return;
      default:
        toast.message(
          summary
            ? t("billingScreen.commercial.manageUnavailable")
            : t("billingScreen.commercial.unavailable"),
        );
    }
  }

  async function choosePlan(planId: PlanId, opener?: HTMLElement | null) {
    if (planId !== "freePreview") {
      toast.message(t("publicPricing.hold"));
      return;
    }
    // Moving a Stripe subscription to Free is a CANCELLATION intent with its
    // own explicit confirmation and verified date. It must never reach the
    // manual entitlement setter, which would silently contradict the provider.
    switch (routeFreeSelection(commercial, { isOwner })) {
      case "cancelIntent":
      case "paddlePortal":
        await requestCancellation(opener);
        return;
      case "manualReset":
        await applyManualEntitlement("freePreview", "freePreview");
        return;
      case "held":
        toast.message(t(commercialReasonKey(summary?.heldReason ?? "operation_unavailable")));
        return;
      default:
        toast.message(
          summary
            ? t("billingScreen.commercial.manageUnavailable")
            : t("billingScreen.commercial.unavailable"),
        );
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Owner manual override                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * The client-side half of the manual guard. The server refuses the same
   * cases independently, because a disabled button stops nobody who calls the
   * function directly — which is exactly what this handler must also not do.
   */
  async function applyManualEntitlement(
    planId: PlanId,
    status: "manualBeta" | "manualComped" | "freePreview",
  ) {
    if (!isOwner) return;
    // One centralised gate. A boolean from a read that has since failed, or
    // from a refresh still in flight, is not permission.
    if (!canUseManualOverride(commercial)) {
      toast.message(t("billingScreen.commercial.manualHeldToast"));
      return;
    }
    const epoch = session.epoch();
    try {
      await setManualEntitlementFn({ data: { planId, status } });
      await refreshEntitlement();
      await loadSummary(epoch);
      if (sessionCurrent(epoch)) toast.success(t("billing.profileSaved"));
    } catch (error) {
      if (!sessionCurrent(epoch)) return;
      // Never render the raw message: it may carry a server-side code.
      const held = error instanceof Error && error.message.startsWith("manual_override_held");
      toast.error(
        held ? t("billingScreen.commercial.manualHeldToast") : t("billingScreen.planFailed"),
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Commercial operations                                                  */
  /* ---------------------------------------------------------------------- */

  function selectionChanged(planId: SellablePlanId, seatQuantity: number) {
    dispatchCommercial({ type: "selection/changed", planId, seatQuantity });
  }

  async function prepareQuote(opener?: HTMLElement | null) {
    const selection = commercial.selection;
    if (!selection || !canPrepareQuote(commercial)) return;
    const epoch = session.epoch();
    const token = ++quoteToken.current;
    const request = {
      quoteId: newIntentId(),
      planId: selection.planId,
      seatQuantity: selection.seatQuantity,
    };
    openCommercialDialog("change", opener);
    // The exact question is recorded, so the reducer can bind the answer to it
    // rather than merely parsing whatever comes back.
    dispatchCommercial({ type: "quote/request", epoch, token, request });
    let response: unknown;
    try {
      response = await prepareStripeSubscriptionChangeFn({ data: request });
    } catch {
      response = { ok: false, reason: "preview_unavailable" };
    }
    if (!sessionCurrent(epoch)) return;
    dispatchCommercial({ type: "quote/resolved", epoch, token, response });
  }

  /**
   * One dispatch, one durable operation, one settlement.
   *
   * The epoch and the operation id travel with the completion so a late answer
   * can only ever settle the exact request it belongs to — never another
   * account's operation, and never a different operation of this account's.
   */
  async function dispatchIntent(
    begin: () => void,
    send: () => Promise<unknown>,
    settle: "change" | "cancellation",
    operationId: string,
    resuming: boolean,
  ) {
    const epoch = session.epoch();
    await singleFlight(async () => {
      if (resuming) dispatchCommercial({ type: "intent/resume", epoch, operationId });
      else begin();
      let response: unknown;
      let failed = false;
      try {
        response = await send();
      } catch {
        // No answer at all. The request may exist at the provider, so the same
        // operation id is retained and nothing is re-created.
        failed = true;
      }
      if (failed) dispatchCommercial({ type: "intent/transportFailed", epoch, operationId });
      else if (settle === "change")
        dispatchCommercial({ type: "intent/confirmed", epoch, operationId, response });
      else dispatchCommercial({ type: "intent/cancelled", epoch, operationId, response });
      await loadSummary(epoch);
    });
  }

  async function confirmChange() {
    const resuming = commercial.intent !== null;
    const request = confirmChangeRequest(commercial, Date.now(), newIntentId());
    if (!request) return;
    const epoch = session.epoch();
    const terms = commercial.quote ? termsFromQuote(commercial.quote) : null;
    await dispatchIntent(
      () =>
        dispatchCommercial({
          type: "intent/begin",
          epoch,
          kind: "change",
          operationId: request.operationId,
          quoteId: request.quoteId,
          cancelOperationId: null,
          terms,
        }),
      () => confirmStripeSubscriptionChangeFn({ data: request }),
      "change",
      request.operationId,
      resuming,
    );
  }

  async function confirmCancellation() {
    const existing = commercial.intent;
    const resuming = existing !== null;
    if (resuming && (existing.kind !== "cancel" || !canResumeIntent(commercial))) return;
    if (!resuming && !canStartCancellation(commercial)) return;
    const operationId = resuming ? existing.operationId : newIntentId();
    const epoch = session.epoch();
    await dispatchIntent(
      () =>
        dispatchCommercial({
          type: "intent/begin",
          epoch,
          kind: "cancel",
          operationId,
          quoteId: null,
          cancelOperationId: null,
          terms: null,
        }),
      () => cancelStripeSubscriptionFn({ data: { operationId } }),
      "cancellation",
      operationId,
      resuming,
    );
  }

  async function confirmReversal() {
    const existing = commercial.intent;
    const resuming = existing !== null;
    if (resuming && (existing.kind !== "reverse" || !canResumeIntent(commercial))) return;
    if (!resuming && !canStartReversal(commercial)) return;
    // The EXACT eligible applied cancellation, from the server. React memory
    // and "the latest cancellation" are not acceptable substitutes.
    const cancelOperationId = resuming
      ? existing.cancelOperationId
      : (summary?.eligibleCancellationId ?? null);
    if (!cancelOperationId) return;
    const operationId = resuming ? existing.operationId : newIntentId();
    const epoch = session.epoch();
    await dispatchIntent(
      () =>
        dispatchCommercial({
          type: "intent/begin",
          epoch,
          kind: "reverse",
          operationId,
          quoteId: null,
          cancelOperationId,
          terms: null,
        }),
      () => reverseStripeCancellationFn({ data: { operationId, cancelOperationId } }),
      "cancellation",
      operationId,
      resuming,
    );
  }

  async function resumeOperation() {
    const existing = commercial.intent;
    if (!existing) return;
    if (existing.kind === "cancel") return confirmCancellation();
    if (existing.kind === "reverse") return confirmReversal();
    return confirmChange();
  }

  /* ---------------------------------------------------------------------- */
  /* Dialog focus                                                           */
  /* ---------------------------------------------------------------------- */

  /**
   * The control that opened the current dialog, so an ordinary close or
   * Escape returns focus to it instead of dropping the caret on the body.
   *
   * Opening is the only place this is set, which is why both the panel's own
   * controls and the route's Free-plan card pass their element in. It is
   * cleared whenever the session generation changes so a dialog closed after
   * a sign-in change cannot focus a stale element.
   */
  const dialogOpener = useRef<{ element: HTMLElement; epoch: number } | null>(null);

  function openCommercialDialog(kind: CommercialIntentKind, opener?: HTMLElement | null) {
    dialogOpener.current = opener ? { element: opener, epoch: session.epoch() } : null;
    dispatchCommercial({ type: "dialog/open", kind });
  }

  function restoreDialogFocus() {
    const remembered = dialogOpener.current;
    dialogOpener.current = null;
    if (!remembered) return false;
    if (!session.current(remembered.epoch)) return false;
    return focusIfConnected(remembered.element);
  }

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  const verifiedPlanId: PlanId | null = summary?.planId ?? null;
  const limitsPlanId: PlanId = verifiedPlanId ?? "freePreview";
  const verifiedPaid = summary?.access === "paid";
  const manualAllowed = canUseManualOverride(commercial);
  // The VISIBLE state of the two alternate "end my plan" entries, computed
  // from the same routing their handlers take. The handlers still guard
  // themselves; this only stops a control looking available when the one
  // thing it can do is explain why it is not.
  const freeChoiceAllowed = freeSelectionAvailable(commercial, { isOwner });
  const cancelEntryAllowed = cancellationAvailable(commercial);

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

      {isOwner ? <StripeSandboxPanel /> : null}

      {/* Current plan — from the VERIFIED summary only. No catalogue price is
          shown here: a market price is not this customer's proven debit. */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {t("billing.currentPlan")}
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-display text-2xl">
              {verifiedPlanId === null
                ? commercial.summaryPhase === "loading"
                  ? t("billingScreen.commercial.loading")
                  : t("billingScreen.unknownValue")
                : verifiedPlanId === "freePreview"
                  ? t("billingScreen.freePreview")
                  : PLAN_META[verifiedPlanId].name}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
          </div>
          <div className="text-right text-sm">
            <div>
              <span className="text-muted-foreground">{t("billing.status")}: </span>
              {summary?.status ? t(`billing.statusLabel.${summary.status}`) : "—"}
            </div>
          </div>
        </div>
        {verifiedPlanId ? (
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Tag>{t("billingScreen.projects", { n: PLAN_LIMITS[limitsPlanId].maxProjects })}</Tag>
            <Tag>{t("billingScreen.websites", { n: PLAN_LIMITS[limitsPlanId].maxWebsites })}</Tag>
            <Tag>
              {t(
                PLAN_LIMITS[limitsPlanId].publishingEnabled
                  ? "billingScreen.publishingOn"
                  : "billingScreen.publishingOff",
              )}
            </Tag>
            <Tag>
              {t("billingScreen.contentMonthly", {
                n: PLAN_LIMITS[limitsPlanId].monthlyContentGenerations,
              })}
            </Tag>
          </div>
        ) : null}
        {summary && !verifiedPaid ? (
          <div className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
            {t("billingScreen.inactiveHelp")}
          </div>
        ) : null}
      </section>

      <StripeCommercialPanel
        state={commercial}
        nowMs={Date.now()}
        locale={locale}
        t={t}
        onRefresh={() => void loadSummary(session.epoch())}
        onSelectionChange={selectionChanged}
        onPrepareQuote={(opener) => void prepareQuote(opener)}
        onConfirmChange={() => void confirmChange()}
        onConfirmCancellation={() => void confirmCancellation()}
        onConfirmReversal={() => void confirmReversal()}
        onOpenDialog={openCommercialDialog}
        onCloseDialog={() => dispatchCommercial({ type: "dialog/close" })}
        onRestoreFocus={restoreDialogFocus}
        onResumeOperation={() => void resumeOperation()}
        onDismissOperation={() => dispatchCommercial({ type: "intent/dismiss" })}
        onOpenPortal={() => void openSubscriptionPortal("manage")}
        portalBusy={portalBusy !== null}
      />

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
            <Select value={billingCountry || undefined} onValueChange={changeBillingCountry}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRY_OPTIONS.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {billingCountryLabel(c, locale, t)}
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
                placeholder={t("outreach.optional")}
              />
            </Field>
          ) : null}
          <Field label={t("billing.derivedMarket")}>
            <div className="flex h-9 items-center rounded-md border border-border bg-secondary/40 px-3 text-sm text-foreground/80">
              {billingCountry ? billingMarketLabel(market, t) : t("billing.selectCountryFirst")}
            </div>
          </Field>
        </div>
        {billingProfile?.billingMarketNeedsReview ? (
          <p className="mt-3 text-xs text-amber-600">{t("billing.marketReview")}</p>
        ) : null}
        <div className="mt-5 flex justify-end">
          <Button type="button" onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? "…" : t("billing.saveProfile")}
          </Button>
        </div>
      </section>

      {/* Choose plan — the CATALOGUE for the selected billing country. */}
      <h2 className="mt-10 font-display text-2xl">{t("billing.choosePlan")}</h2>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground" id="paid-plan-hold">
        {t("publicPricing.hold")}
      </p>
      <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
        {t("billingScreen.commercial.catalogNote")}
      </p>
      {/* Why the Free choice is not offered, when it is not. The handler
          holds either way; this says so beside the disabled control. */}
      {summary && !freeChoiceAllowed ? (
        <p role="status" className="mt-1 max-w-3xl text-xs text-muted-foreground">
          {t(commercialReasonKey(summary.heldReason ?? "operation_unavailable"))}
        </p>
      ) : null}
      {summary?.provider === "stripe" && verifiedPaid ? (
        <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
          {t("billingScreen.commercial.freeIsCancellation")}
        </p>
      ) : null}
      {!billingCountry ? (
        <p className="mt-1 text-sm text-muted-foreground">{t("billing.selectCountryFirst")}</p>
      ) : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {PLAN_IDS.map((pid) => {
          const meta = PLAN_META[pid];
          const lim = PLAN_LIMITS[pid];
          const isCurrent = pid === verifiedPlanId;
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
              <h3 className="font-display text-lg">
                {pid === "freePreview" ? t("billingScreen.freePreview") : meta.name}
              </h3>
              <div className="mt-1.5 flex items-baseline gap-1">
                <span className="font-display text-2xl">{money(planPrice(market, pid))}</span>
                {pid !== "freePreview" ? (
                  <span className="text-xs text-muted-foreground">{t("billing.perMonth")}</span>
                ) : null}
              </div>
              <ul className="mt-4 space-y-1.5 text-xs flex-1">
                {meta.features.map((f) => (
                  <li key={f} className="flex gap-1.5">
                    <Check className="h-3.5 w-3.5 mt-0.5 text-gold/80 shrink-0" />
                    {billingFeatureLabel(f, t)}
                  </li>
                ))}
              </ul>
              <div className="mt-3 text-[11px] text-muted-foreground">
                {t("billingScreen.projects", { n: lim.maxProjects })} ·{" "}
                {t("billingScreen.websites", { n: lim.maxWebsites })}
              </div>
              {isCurrent ? (
                <Button type="button" className="mt-4" variant="outline" disabled>
                  {t("billing.currentLabel")}
                </Button>
              ) : (
                <Button
                  type="button"
                  className="mt-4 h-auto min-h-9 whitespace-normal"
                  variant={meta.recommended ? "default" : "outline"}
                  disabled={pid !== "freePreview" || !freeChoiceAllowed}
                  aria-describedby={pid !== "freePreview" ? "paid-plan-hold" : undefined}
                  onClick={(event) => void choosePlan(pid, event.currentTarget)}
                >
                  {pid === "freePreview" ? t("billing.choose") : t("launch.item.paddlePending")}
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
              {money(addOnPrice(market, "assistedSetup"))} {t("billing.oneTime")}
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href="mailto:support@milogrowth.com?subject=Assisted%20Setup">
              {t("billing.contactSupport")}
            </a>
          </Button>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-lg">{t("billing.monthlyCare")}</h3>
            <div className="mt-1 text-sm text-muted-foreground">
              {money(addOnPrice(market, "monthlyCare"))} {t("billing.perMonth")}
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href="mailto:support@milogrowth.com?subject=Monthly%20Care">
              {t("billing.contactSupport")}
            </a>
          </Button>
        </div>
        <div className="rounded-xl border border-[#d9c394] bg-[#faf6ec] p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#b77f1f]/10 text-[#9d6a14]">
              <Link2 className="h-4 w-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-lg">{t("nav.backlinks")}</h3>
                <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {t("billingScreen.separateAddon")}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t("billingScreen.backlinksHelp")}
              </p>
            </div>
          </div>
          <Button asChild className="mt-4 w-full" variant="outline" size="sm">
            <a href="mailto:support@milogrowth.com?subject=Backlinks%20add-on">
              {t("billingScreen.reviewAddon")}
            </a>
          </Button>
        </div>
      </div>

      {/* Owner-only manual activation */}
      {isOwner ? (
        <section className="mt-10 rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
          <h2 className="font-display text-lg">{t("billing.manual.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("billing.manual.desc")}</p>
          {manualAllowed ? null : (
            <p role="status" className="mt-2 text-sm text-amber-700">
              {t("billingScreen.commercial.manualHeld")}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!manualAllowed}
              onClick={() => void applyManualEntitlement("growth", "manualBeta")}
            >
              {t("billing.manual.beta")} (Growth)
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!manualAllowed}
              onClick={() => void applyManualEntitlement("pro", "manualComped")}
            >
              {t("billing.manual.comped")} (Pro)
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!manualAllowed}
              onClick={() => void applyManualEntitlement("freePreview", "freePreview")}
            >
              {t("billing.manual.reset")}
            </Button>
          </div>
        </section>
      ) : null}

      {verifiedPaid ? (
        <section className="mt-10 flex flex-wrap items-center justify-between gap-5 rounded-xl border border-destructive/45 bg-destructive/[.025] p-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-destructive/50 text-destructive">
              <CircleMinus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-xl text-destructive">{t("billingScreen.cancel")}</h2>
              {/* Provider-aware: the legacy portal wording belongs to a
                  verified Paddle agreement only. A Stripe subscription
                  cancels through the confirmation in this app, and anything
                  else says honestly that it cannot be done here. */}
              <p className="mt-1 text-sm text-muted-foreground">
                {t(
                  summary?.provider === "paddle"
                    ? "billingScreen.cancelHelp"
                    : summary?.provider === "stripe"
                      ? "billingScreen.commercial.cancelHelpStripe"
                      : "billingScreen.commercial.manageUnavailable",
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("billingScreen.cancelExport")}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-destructive/50 text-destructive hover:bg-destructive/5 hover:text-destructive"
            onClick={(event) => void requestCancellation(event.currentTarget)}
            disabled={portalBusy !== null || !cancelEntryAllowed}
          >
            {portalBusy === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("billingScreen.cancel")}
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
