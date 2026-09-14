import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/LegalPage";
import { LEGAL_IDENTITY } from "@/lib/legal";

export const Route = createFileRoute("/refunds")({
  head: () => ({
    meta: [
      { title: "Refund Policy — Milo Growth" },
      {
        name: "description",
        content:
          "Refund and cancellation policy for Milo Growth subscriptions and optional services.",
      },
    ],
  }),
  component: RefundsPage,
});

function RefundsPage() {
  return (
    <LegalPage
      title="Refund Policy"
      lastUpdated="12 September 2026"
      intro="This page explains when Milo Growth payments are refundable, how to cancel, and how to ask for a refund. It forms part of our Terms of Service."
    >
      <LegalSection heading="Summary">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Paid plans are monthly subscriptions with no minimum term. You can cancel at any time.
          </li>
          <li>
            New subscriptions come with a 14-day money-back guarantee on the first payment — no
            questions asked.
          </li>
          <li>
            Renewal payments are not refunded, except where the law requires it or the service was
            unavailable.
          </li>
          <li>
            Refunds go back to the original payment method, usually within 5–10 business days.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Who you buy from">
        <p>
          Milo Growth is operated by {LEGAL_IDENTITY.operator}. Public paid checkout remains on hold
          while Stripe setup and billing validation are completed. Stripe is the planned payment
          provider. The seller, payment-provider, applicable tax and invoice details will be shown
          before you pay.
        </p>
      </LegalSection>

      <LegalSection heading="Monthly subscriptions">
        <p>
          Starter, Growth, Pro and Agency plans are billed monthly in advance, per project (or per
          workspace for Agency). The free preview plan is not billed. A subscription renews
          automatically each month until you cancel.
        </p>
      </LegalSection>

      <LegalSection heading="14-day money-back guarantee">
        <p>
          If Milo is not right for you, tell us within 14 days of your first payment for a new
          subscription and we will refund that payment in full. This applies once per customer and
          plan, and does not apply if your account has breached the Terms of Service (for example,
          abusive AI usage or publishing unlawful content).
        </p>
      </LegalSection>

      <LegalSection heading="Renewals and unused time">
        <p>
          After the 14-day period, payments for the current or previous billing months are not
          refundable and we do not pro-rate unused time. When you cancel, your plan stays active
          until the end of the period you have paid for and then stops — you will not be charged
          again.
        </p>
        <p>
          If a Milo outage or defect on our side prevents you from using the service for a material
          part of a billing month, contact us — we will offer a credit or a refund for that month.
        </p>
      </LegalSection>

      <LegalSection heading="Optional services and add-ons">
        <p>
          One-off services listed on the pricing page (for example done-for-you setup or content
          work) are refundable in full until the work has started. Once work has started, any refund
          is proportionate to the work not yet delivered.
        </p>
      </LegalSection>

      <LegalSection heading="How to cancel">
        <p>
          Cancel at any time in the app under Billing, or email{" "}
          <a
            className="underline underline-offset-4"
            href={`mailto:${LEGAL_IDENTITY.supportEmail}`}
          >
            {LEGAL_IDENTITY.supportEmail}
          </a>
          . Cancelling takes effect at the end of the current billing period. Deleting your account
          also ends any subscription.
        </p>
      </LegalSection>

      <LegalSection heading="How to request a refund">
        <p>
          Email{" "}
          <a
            className="underline underline-offset-4"
            href={`mailto:${LEGAL_IDENTITY.supportEmail}`}
          >
            {LEGAL_IDENTITY.supportEmail}
          </a>{" "}
          from the address on your account, with your invoice or transaction number from your
          payment receipt. We reply within 2 business days. Approved refunds are returned to the
          original payment method; banks typically post them within 5–10 business days.
        </p>
      </LegalSection>

      <LegalSection heading="Consumers in the EU and UK">
        <p>
          If you buy as a consumer, you have a statutory 14-day right of withdrawal. Because Milo is
          a digital service that starts immediately, you agree at checkout that the service begins
          during the withdrawal period. Our 14-day money-back guarantee above meets or exceeds that
          right, and nothing in this policy limits your statutory rights.
        </p>
      </LegalSection>

      <LegalSection heading="Chargebacks">
        <p>
          Please contact us before opening a dispute with your bank — we resolve almost every case
          faster. Accounts with an unresolved chargeback may be suspended until the matter is
          settled.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about refunds:{" "}
          <a
            className="underline underline-offset-4"
            href={`mailto:${LEGAL_IDENTITY.supportEmail}`}
          >
            {LEGAL_IDENTITY.supportEmail}
          </a>
          . See also the{" "}
          <Link className="underline underline-offset-4" to="/terms">
            Terms of Service
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
