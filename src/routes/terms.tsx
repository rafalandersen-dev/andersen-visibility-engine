import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/LegalPage";
import { LEGAL_IDENTITY } from "@/lib/legal";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Milo Growth" },
      {
        name: "description",
        content:
          "Terms of Service for Milo Growth — plans, billing, cancellation and your responsibilities.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      lastUpdated="12 September 2026"
      intro="These terms govern your use of Milo Growth. By creating an account, starting a free preview or purchasing a plan you agree to them."
    >
      <LegalSection heading="Service description">
        <p>
          Milo Growth ("Milo") is a software product operated by {LEGAL_IDENTITY.operator}. Milo
          helps users plan, create, publish and measure website growth, SEO and AI-search readiness
          for small businesses. Milo helps you plan, create, publish and measure website growth, but
          does not guarantee rankings, traffic, revenue, AI citations or search engine placement.
        </p>
      </LegalSection>

      <LegalSection heading="Account responsibility">
        <p>
          You are responsible for the accuracy of the information in your account, for keeping your
          login credentials secure, and for all activity that occurs under your account. Notify us
          promptly of any unauthorised use.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>You agree not to use Milo to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>break the law or infringe the rights of others;</li>
          <li>generate or publish unlawful, deceptive, harmful or infringing content;</li>
          <li>
            attempt to disrupt, reverse-engineer or gain unauthorised access to the service; or
          </li>
          <li>publish to websites you do not own or are not authorised to manage.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="AI-assisted outputs">
        <p>
          Milo uses AI-assisted generation to produce drafts, opportunities and analyses. AI outputs
          may be incomplete, inaccurate or unsuitable without review. They are suggestions, not
          professional advice.
        </p>
      </LegalSection>

      <LegalSection heading="User responsibility for reviewing content">
        <p>
          You are responsible for reviewing all AI-assisted content before using or publishing it —
          including factual claims, prices, and any medical, legal, financial or regulated
          statements. You remain responsible for the content published to your websites.
        </p>
      </LegalSection>

      <LegalSection heading="Website publishing and auto-publish responsibility">
        <p>
          Milo can send content to a website you connect, and — only if you choose to enable it —
          publish approved content live. Auto-publish is optional and user-controlled. When you
          enable auto-publish you accept responsibility for reviewing content and claims before it
          goes live. You confirm you have the right to connect and publish to any website you
          configure.
        </p>
      </LegalSection>

      <LegalSection heading="No ranking or revenue guarantees">
        <p>
          Milo provides guidance and tooling. It does not guarantee search rankings, website
          traffic, revenue, conversions, AI citations or placement in any search engine or AI tool.
        </p>
      </LegalSection>

      <LegalSection heading="Plans, subscriptions and billing">
        <p>
          Milo offers a free preview plan and paid monthly plans (Starter, Growth, Pro and Agency)
          as shown on the{" "}
          <Link className="underline underline-offset-4" to="/pricing">
            pricing page
          </Link>
          . Paid plans are billed monthly in advance, per project (Agency per workspace), and renew
          automatically until cancelled. Prices are shown in your local currency where available and
          exclude VAT unless stated otherwise; VAT is added at checkout based on your location and
          VAT status.
        </p>
        <p>
          Public paid checkout remains on hold while Stripe setup and billing validation are
          completed. Stripe is the planned payment provider. The seller, payment-provider,
          applicable tax and invoice details will be shown before you pay.
        </p>
        <p>
          We may change prices with at least 30 days' notice by email; changes apply from your next
          renewal after the notice period.
        </p>
        <p>
          Plans include a monthly allowance of AI generations and audits as described on the pricing
          page. Usage beyond fair use may be rate-limited; we will tell you before any extra charge
          applies.
        </p>
      </LegalSection>

      <LegalSection heading="Cancellation and refunds">
        <p>
          You can cancel at any time in the app under Billing or by emailing{" "}
          <a
            className="underline underline-offset-4"
            href={`mailto:${LEGAL_IDENTITY.supportEmail}`}
          >
            {LEGAL_IDENTITY.supportEmail}
          </a>
          . Cancellation takes effect at the end of the billing period you have paid for; you will
          not be charged again. New subscriptions carry a 14-day money-back guarantee on the first
          payment. Renewal payments are not refundable except as required by law or where the
          service was unavailable through our fault. Full details, including consumer withdrawal
          rights in the EU and UK, are in our{" "}
          <Link className="underline underline-offset-4" to="/refunds">
            Refund Policy
          </Link>
          , which forms part of these terms.
        </p>
        <p>
          We may suspend or terminate an account that breaches these terms, with a refund of any
          prepaid unused period only where the breach was not deliberate. You may delete your
          account at any time (see the Privacy Policy).
        </p>
      </LegalSection>

      <LegalSection heading="Intellectual property">
        <p>
          You retain ownership of the business information and content you provide and the content
          Milo generates for you. Milo and {LEGAL_IDENTITY.operator} retain all rights in the
          software, design and underlying systems. You grant us the limited rights needed to operate
          the service for you.
        </p>
      </LegalSection>

      <LegalSection heading="Third-party services">
        <p>
          Milo relies on third-party providers (for example hosting, database, AI generation, email
          and any website you connect). Your use of those integrations may also be subject to the
          relevant provider's terms. See our Subprocessors page for details.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the maximum extent permitted by applicable law, Milo is provided "as is", and{" "}
          {LEGAL_IDENTITY.operator} is not liable for indirect or consequential losses, lost
          profits, lost rankings or lost revenue arising from use of the service. Our total
          liability for any claim relating to the service is limited to the fees you paid for it in
          the 12 months before the claim. Nothing in these terms limits liability that cannot be
          limited by law, including consumers' statutory rights.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to the service">
        <p>
          Milo is under active development. We may add, change or remove features, and we may update
          these terms. Material changes will be reflected by updating the date at the top of this
          page.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about these terms:{" "}
          <a
            className="underline underline-offset-4"
            href={`mailto:${LEGAL_IDENTITY.supportEmail}`}
          >
            {LEGAL_IDENTITY.supportEmail}
          </a>
          . Milo Growth is operated by {LEGAL_IDENTITY.operator}.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
