/**
 * The Stripe commercial surface of the billing screen.
 *
 * Everything shown here comes from the caller-owned read adapter
 * (`getStripeCommercialSummaryFn`) and the accepted commercial API. Nothing is
 * reconstructed from the catalogue, the editable billing country or the
 * client store — those live in the separate "choose a plan" section of the
 * route and are deliberately not mixed in.
 *
 * Three rules the markup enforces rather than merely documents:
 *
 *  - UNKNOWN IS RENDERED AS UNKNOWN. A missing amount, date or seat count is
 *    the unknown label, never zero, never Free and never a success.
 *  - NO EFFECT MUTATES. Every call that can reach the provider is wired to an
 *    explicit click. The confirmation body is a separate component precisely so
 *    that mounting the panel cannot reach a confirm handler.
 *  - NO OPTIMISTIC ACCESS. A dispatched operation shows "waiting for
 *    verification"; the plan, seats and access shown stay whatever the last
 *    VERIFIED summary said until a new verified read replaces it.
 *
 * The server's English `effectiveNote` / `recurringEstimateNote` strings are
 * intentionally not rendered: localized equivalents are used so PL/SV/DA
 * readers are not shown untranslated copy.
 */
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PLAN_META } from "@/lib/billing";
import {
  formatBillingCount,
  formatBillingDate,
  formatBillingDateTime,
  formatBillingMinorMoney,
  type PresentedValue,
} from "@/lib/billing-presentation";
import {
  SELLABLE_PLAN_IDS,
  accessClaim,
  canConfirmQuote,
  canOpenPaddlePortal,
  canPrepareQuote,
  canResumeIntent,
  canStartCancellation,
  canStartReversal,
  commercialReasonKey,
  intentVerified,
  quoteExpired,
  quoteMatchesSelection,
  type BillingSummary,
  type CommercialIntent,
  type CommercialIntentKind,
  type CommercialUiState,
  type SellablePlanId,
} from "@/lib/stripe-commercial-ui";
import type { OnboardingLanguage } from "@/lib/types";

type Translate = (key: string, values?: Record<string, string | number>) => string;

const show = (value: PresentedValue, t: Translate) =>
  value.known ? value.text : t("billingScreen.unknownValue");

function planLabel(planId: string | null, t: Translate): string {
  if (!planId) return t("billingScreen.unknownValue");
  if (planId === "freePreview") return t("billingScreen.freePreview");
  const meta = (PLAN_META as Record<string, { name: string } | undefined>)[planId];
  return meta ? meta.name : t("billingScreen.unknownValue");
}

/** A finite, exhaustive map from a settled outcome to its copy. A ternary
 * chain let an unknown state fall through to "the cancellation was
 * withdrawn", which is the most dangerous sentence on this screen. */
const SETTLED_NOTICE: Readonly<Record<string, string>> = {
  applied: "billingScreen.commercial.operation.applied",
  awaiting_payment: "billingScreen.commercial.operation.awaitingPayment",
  scheduled: "billingScreen.commercial.operation.scheduled",
  cancelled: "billingScreen.commercial.operation.cancelled",
  reversed: "billingScreen.commercial.operation.reversed",
};

/** The same outcomes once a later authoritative read has confirmed them. */
const VERIFIED_NOTICE: Readonly<Record<string, string>> = {
  applied: "billingScreen.commercial.operation.verifiedApplied",
  cancelled: "billingScreen.commercial.operation.verifiedCancelled",
  reversed: "billingScreen.commercial.operation.verifiedReversed",
};

/**
 * The management sentence, chosen by VERIFIED provider and what is actually
 * offered. Saying "self-service management is not available for this account"
 * directly above an enabled Cancel button is simply false — and so is saying
 * "no change is available" beside an enabled withdrawal.
 */
function managementCopyKey(summary: BillingSummary): string {
  if (summary.actions.paddlePortal) return "billingScreen.commercial.manageHelpPaddle";
  if (summary.provider === "stripe") {
    if (summary.actions.prepareChange || summary.actions.cancel)
      return "billingScreen.commercial.manageHelpStripe";
    // Reversal-only is a real supported state: the subscription is already
    // cancelling and the one thing on offer is withdrawing that.
    if (summary.actions.reverseCancellation)
      return "billingScreen.commercial.manageHelpStripeReversal";
    return "billingScreen.commercial.manageHelpStripeHeld";
  }
  if (summary.provider === "manual") return "billingScreen.commercial.manageHelpManual";
  if (summary.provider === "none") return "billingScreen.commercial.manageHelpNone";
  return "billingScreen.commercial.manageUnavailable";
}

function operationNoticeKey(intent: CommercialIntent): string {
  if (intent.status === "pending") return "billingScreen.commercial.operation.pending";
  if (intent.status === "refused") return "billingScreen.commercial.operation.refused";
  if (intent.status === "verified" && intent.applied) {
    const known = VERIFIED_NOTICE[intent.applied.state];
    return known ?? "billingScreen.commercial.operation.uncertain";
  }
  if (intent.status === "settled" && intent.applied) {
    const known = SETTLED_NOTICE[intent.applied.state];
    // An unrecognised success is an unverified outcome, not a cancellation.
    return known ?? "billingScreen.commercial.operation.uncertain";
  }
  return "billingScreen.commercial.operation.uncertain";
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The confirmation body                                                      */
/* -------------------------------------------------------------------------- */

export interface CommercialConfirmationProps {
  kind: CommercialIntentKind;
  state: CommercialUiState;
  nowMs: number;
  locale: OnboardingLanguage;
  t: Translate;
  /** The ONE deliberate dispatch. Never called from an effect or a close. */
  onConfirm: () => void;
  /** Close, Escape, Back and the overlay all arrive here. No mutation. */
  onClose: () => void;
}

/**
 * Exported separately from the dialog shell so it can be rendered and asserted
 * without a browser: Radix portals render nothing on the server, and a
 * confirmation nobody can test is a confirmation nobody has checked.
 */
export function CommercialConfirmation({
  kind,
  state,
  nowMs,
  locale,
  t,
  onConfirm,
  onClose,
}: CommercialConfirmationProps) {
  const { quote, quotePhase, quoteReason, intent, summary } = state;
  const busy = intent?.inFlight === true;
  const expired = kind === "change" && quotePhase === "ready" && quoteExpired(quote, nowMs);
  const stale = kind === "change" && quotePhase === "ready" && !quoteMatchesSelection(state);
  const confirmable =
    kind === "change"
      ? canConfirmQuote(state, nowMs)
      : kind === "cancel"
        ? canStartCancellation(state)
        : canStartReversal(state);

  return (
    <div data-commercial-confirmation={kind}>
      {kind === "change" ? (
        <div className="space-y-3">
          {quotePhase === "loading" ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t("billingScreen.commercial.quote.loading")}
            </p>
          ) : null}
          {quotePhase === "failed" ? (
            <p role="alert" className="text-sm text-destructive">
              {t(commercialReasonKey(quoteReason))}
            </p>
          ) : null}
          {quotePhase === "ready" && quote ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              <Fact label={t("billingScreen.commercial.quote.dueNow")}>
                {show(formatBillingMinorMoney(quote.amountMinor, quote.currency, locale), t)}
              </Fact>
              <Fact label={t("billingScreen.commercial.quote.recurring")}>
                {show(
                  formatBillingMinorMoney(quote.recurringEstimateMinor, quote.currency, locale),
                  t,
                )}
              </Fact>
              <Fact label={t("billingScreen.commercial.quote.effective")}>
                {quote.immediate
                  ? t("billingScreen.commercial.quote.effectiveImmediate")
                  : show(formatBillingDate(quote.effectiveAt, locale), t)}
              </Fact>
              {/* A quote can expire in two minutes, so a bare day is not a
                  deadline. The exact instant is shown with its zone. */}
              <Fact label={t("billingScreen.commercial.quote.expires")}>
                {show(formatBillingDateTime(quote.expiresAt, locale), t)}
              </Fact>
            </dl>
          ) : null}
          {quotePhase === "ready" && quote ? (
            <>
              <p className="text-xs text-muted-foreground">
                {t("billingScreen.commercial.quote.recurringNote")}
              </p>
              {quote.recurringEstimateIncludesAdjustments ? (
                <p className="text-xs text-muted-foreground">
                  {t("billingScreen.commercial.quote.recurringAdjusted")}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {t("billingScreen.commercial.quote.limits", {
                  working: quote.workingSeatAllowance,
                  viewer: quote.viewerSeatAllowance,
                  projects: quote.projectAllowance,
                })}
              </p>
            </>
          ) : null}
          {expired ? (
            <p role="alert" className="text-sm text-destructive">
              {t("billingScreen.commercial.quote.expired")}
            </p>
          ) : null}
          {stale ? (
            <p role="alert" className="text-sm text-destructive">
              {t("billingScreen.commercial.quote.stale")}
            </p>
          ) : null}
        </div>
      ) : null}

      {kind === "cancel" ? (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>{t("billingScreen.commercial.cancel.body")}</p>
          <p>
            {summary?.periodEnd
              ? t("billingScreen.commercial.cancel.until", {
                  date: show(formatBillingDate(summary.periodEnd, locale), t),
                })
              : t("billingScreen.commercial.cancel.untilUnknown")}
          </p>
        </div>
      ) : null}

      {kind === "reverse" ? (
        <p className="text-sm text-muted-foreground">
          {t("billingScreen.commercial.reverse.body")}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          {t("sharedUi.close")}
        </Button>
        <Button
          type="button"
          onClick={onConfirm}
          disabled={!confirmable || busy}
          aria-busy={busy || undefined}
        >
          {busy
            ? t("billingScreen.commercial.working")
            : kind === "cancel"
              ? t("billingScreen.commercial.cancel.confirm")
              : kind === "reverse"
                ? t("billingScreen.commercial.reverse.confirm")
                : t("billingScreen.commercial.confirm")}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The panel                                                                  */
/* -------------------------------------------------------------------------- */

export interface StripeCommercialPanelProps {
  state: CommercialUiState;
  nowMs: number;
  locale: OnboardingLanguage;
  t: Translate;
  onRefresh: () => void;
  onSelectionChange: (planId: SellablePlanId, seatQuantity: number) => void;
  onPrepareQuote: (opener?: HTMLElement | null) => void;
  onConfirmChange: () => void;
  onConfirmCancellation: () => void;
  onConfirmReversal: () => void;
  /** The opening control travels with the intent so focus can return to it. */
  onOpenDialog: (kind: CommercialIntentKind, opener?: HTMLElement | null) => void;
  onCloseDialog: () => void;
  /** Return focus to the control that opened the dialog. Returns false when
   * there is nothing safe to focus, leaving Radix's own behaviour in place. */
  onRestoreFocus?: () => boolean;
  onResumeOperation: () => void;
  onDismissOperation: () => void;
  onOpenPortal: () => void;
  portalBusy?: boolean;
}

export function StripeCommercialPanel({
  state,
  nowMs,
  locale,
  t,
  onRefresh,
  onSelectionChange,
  onPrepareQuote,
  onConfirmChange,
  onConfirmCancellation,
  onConfirmReversal,
  onOpenDialog,
  onCloseDialog,
  onRestoreFocus,
  onResumeOperation,
  onDismissOperation,
  onOpenPortal,
  portalBusy = false,
}: StripeCommercialPanelProps) {
  const planFieldId = useId();
  const seatFieldId = useId();
  const { summary, summaryPhase, summaryReason, selection, intent } = state;
  const selectedPlan = selection?.planId ?? null;
  const selectedSeats = selection?.seatQuantity ?? 0;

  return (
    <section
      className="mt-8 rounded-xl border border-border bg-card p-6"
      data-commercial-panel
      aria-labelledby={`${planFieldId}-heading`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id={`${planFieldId}-heading`} className="font-display text-xl">
          {t("billingScreen.commercial.title")}
        </h2>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRefresh}
          disabled={summaryPhase === "loading"}
          aria-busy={summaryPhase === "loading" || undefined}
        >
          {t("billingScreen.commercial.refresh")}
        </Button>
      </div>

      {/* "idle" is the first render before the read effect runs; it is a read
          in progress, not an account without billing. */}
      {summaryPhase === "loading" || summaryPhase === "idle" ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {t("billingScreen.commercial.loading")}
        </p>
      ) : null}

      {summaryPhase === "unavailable" && !summary ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {t("billingScreen.commercial.unavailable")}
        </p>
      ) : null}

      {/* A transient failure keeps the last verified facts visible, honestly
          labelled, instead of dropping the account to Free or to zero. */}
      {summary && summaryReason ? (
        <p role="alert" className="mt-3 text-sm text-amber-600">
          {t("billingScreen.commercial.refreshFailed")}
        </p>
      ) : null}

      {summary ? (
        <>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-commercial-facts>
            <Fact label={t("billingScreen.commercial.provider")}>
              {t(`billingScreen.commercial.provider.${summary.provider}`)}
            </Fact>
            <Fact label={t("billingScreen.commercial.mode")}>
              {summary.mode
                ? t(`billingScreen.commercial.mode.${summary.mode}`)
                : t("billingScreen.unknownValue")}
            </Fact>
            <Fact label={t("billingScreen.commercial.plan")}>{planLabel(summary.planId, t)}</Fact>
            {/* One condition, shared with the selector: an operation that a
                later authoritative read has confirmed is no longer waiting. */}
            <Fact label={t("billingScreen.commercial.access")}>
              {t(`billingScreen.commercial.access.${accessClaim(state)}`)}
            </Fact>
            <Fact label={t("billingScreen.commercial.seats")}>
              {show(formatBillingCount(summary.purchasedSeats), t)}
            </Fact>
            <Fact label={t("billingScreen.commercial.periodEnd")}>
              {show(formatBillingDate(summary.periodEnd, locale), t)}
            </Fact>
            <Fact label={t("billingScreen.commercial.currentAmount")}>
              {summary.currentAmountMinor === null
                ? t("billingScreen.commercial.amountUnknown")
                : show(
                    formatBillingMinorMoney(
                      summary.currentAmountMinor,
                      summary.currentCurrency,
                      locale,
                    ),
                    t,
                  )}
            </Fact>
          </dl>

          {summary.currentAmountEvidence === "fixture" ? (
            <p className="mt-2 text-xs text-amber-600">
              {t("billingScreen.commercial.amountFixture")}
            </p>
          ) : null}

          <p className="mt-2 text-xs text-muted-foreground">
            {t("billingScreen.commercial.catalogNote")}
          </p>

          {summary.cancelAtPeriodEnd ? (
            <p className="mt-2 text-sm text-amber-600">
              {t("billingScreen.commercial.cancelScheduled")}
            </p>
          ) : null}

          {summary.heldReason ? (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              {t(commercialReasonKey(summary.heldReason))}
            </p>
          ) : null}

          {summary.operationEvidence === "ambiguous" ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {t("billingScreen.commercial.operation.ambiguous")}
            </p>
          ) : null}
        </>
      ) : null}

      {/* The durable operation. Reentry resumes THIS one; it never creates a
          replacement, and nothing here grants access. */}
      {intent ? (
        <div
          className="mt-5 rounded-lg border border-border bg-secondary/30 p-4"
          data-commercial-operation={intent.status}
        >
          <h3 className="text-sm font-medium">{t("billingScreen.commercial.operation.title")}</h3>
          <p role="status" className="mt-1 text-sm text-muted-foreground">
            {t(operationNoticeKey(intent))}
          </p>
          {/* Discovery did not report this operation. That is not an outcome,
              and the copy must not imply one. */}
          {intent.discoveryMissing &&
          intent.status !== "settled" &&
          intent.status !== "refused" &&
          intent.status !== "verified" ? (
            <p role="alert" className="mt-1 text-sm text-amber-600">
              {t("billingScreen.commercial.operation.notDiscovered")}
            </p>
          ) : null}
          {intent.reason ? (
            <p role="alert" className="mt-1 text-sm text-destructive">
              {t(commercialReasonKey(intent.reason))}
            </p>
          ) : null}
          {intent.terms && intent.terms.planId ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("billingScreen.commercial.operation.terms", {
                plan: planLabel(intent.terms.planId, t),
                seats: intent.terms.seatQuantity ?? t("billingScreen.unknownValue"),
              })}
            </p>
          ) : null}
          {/* The waiting sentence belongs to a request whose projection is
              still unverified. Repeating it after a read has confirmed the
              change would be a notice that never ends. */}
          {intentVerified(state) ? null : (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("billingScreen.commercial.pendingProjection")}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onResumeOperation}
              disabled={!canResumeIntent(state)}
              aria-busy={intent.inFlight || undefined}
            >
              {intent.inFlight
                ? t("billingScreen.commercial.working")
                : t("billingScreen.commercial.resume")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onDismissOperation}
              disabled={
                intent.status !== "settled" &&
                intent.status !== "refused" &&
                intent.status !== "verified"
              }
            >
              {t("billingScreen.commercial.operation.dismiss")}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Provider routing. Paddle keeps its existing caller-owned portal; a
          Stripe or manual account is never sent there. */}
      {summary ? (
        <div className="mt-5 border-t border-border pt-4">
          {/* What this account can actually do, stated for ITS provider. The
              generic "self-service is not available" line is reserved for the
              case where that is true — not shown next to enabled controls. */}
          <p role="status" className="text-sm text-muted-foreground">
            {t(managementCopyKey(summary))}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {summary.actions.paddlePortal ? (
              <Button
                type="button"
                variant="outline"
                onClick={onOpenPortal}
                // The same current-evidence gate as every other action. A
                // portal session is a provider call: a Paddle flag read before
                // a refresh that has since failed is not permission to make
                // one, and `portalBusy` alone never said anything about that.
                disabled={portalBusy || !canOpenPaddlePortal(state)}
                aria-busy={portalBusy || undefined}
              >
                {t("billingScreen.manage")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="border-destructive/35 text-destructive hover:bg-destructive/5 hover:text-destructive"
              onClick={(event) => onOpenDialog("cancel", event.currentTarget)}
              disabled={!canStartCancellation(state)}
            >
              {t("billingScreen.cancel")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={(event) => onOpenDialog("reverse", event.currentTarget)}
              disabled={!canStartReversal(state)}
            >
              {t("billingScreen.commercial.reverse")}
            </Button>
          </div>
        </div>
      ) : null}

      {/* The change form. Its state is the panel's own target selection and is
          separate from both the verified summary and the catalogue. */}
      {summary ? (
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="text-sm font-medium">{t("billingScreen.commercial.changePlan")}</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor={planFieldId} className="text-xs text-muted-foreground">
                {t("billingScreen.commercial.planInput")}
              </Label>
              <div className="mt-1.5">
                {/* Controlled for the whole mounted lifetime. Radix decides
                    controlled vs uncontrolled from `value !== undefined`, so
                    going from `undefined` to a plan string mid-life flips the
                    control mode and warns. The empty string is Radix's
                    supported "no selection" value, and no empty SelectItem is
                    added for it. */}
                <Select
                  value={selectedPlan ?? ""}
                  onValueChange={(value) =>
                    onSelectionChange(value as SellablePlanId, selectedSeats)
                  }
                >
                  <SelectTrigger id={planFieldId}>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {SELLABLE_PLAN_IDS.map((pid) => (
                      <SelectItem key={pid} value={pid}>
                        {planLabel(pid, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor={seatFieldId} className="text-xs text-muted-foreground">
                {t("billingScreen.commercial.seatInput")}
              </Label>
              <div className="mt-1.5">
                <Input
                  id={seatFieldId}
                  type="number"
                  min={0}
                  max={1000}
                  step={1}
                  value={String(selectedSeats)}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10);
                    if (!selectedPlan) return;
                    onSelectionChange(
                      selectedPlan,
                      Number.isInteger(parsed) && parsed >= 0 ? parsed : 0,
                    );
                  }}
                />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Button
              type="button"
              onClick={(event) => onPrepareQuote(event.currentTarget)}
              disabled={!canPrepareQuote(state)}
              aria-busy={state.quotePhase === "loading" || undefined}
            >
              {t("billingScreen.commercial.prepare")}
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog
        open={state.dialog !== null}
        onOpenChange={(open) => {
          if (!open) onCloseDialog();
        }}
      >
        <DialogContent
          // Ordinary close and Escape both land here. Returning focus to the
          // control that opened the dialog keeps the keyboard where the user
          // left it; dropping to the body loses their place entirely.
          onCloseAutoFocus={(event) => {
            if (onRestoreFocus?.()) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {state.dialog === "cancel"
                ? t("billingScreen.commercial.cancel.title")
                : state.dialog === "reverse"
                  ? t("billingScreen.commercial.reverse.title")
                  : t("billingScreen.commercial.quote.title")}
            </DialogTitle>
            <DialogDescription>{t("billingScreen.commercial.pendingProjection")}</DialogDescription>
          </DialogHeader>
          {state.dialog ? (
            <CommercialConfirmation
              kind={state.dialog}
              state={state}
              nowMs={nowMs}
              locale={locale}
              t={t}
              onConfirm={
                state.dialog === "cancel"
                  ? onConfirmCancellation
                  : state.dialog === "reverse"
                    ? onConfirmReversal
                    : onConfirmChange
              }
              onClose={onCloseDialog}
            />
          ) : null}
          <DialogFooter />
        </DialogContent>
      </Dialog>
    </section>
  );
}
