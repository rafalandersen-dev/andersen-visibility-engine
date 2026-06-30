import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/LegalPage";
import { LEGAL_IDENTITY } from "@/lib/legal";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Milo Growth" },
      { name: "description", content: "Privacy Policy for Milo Growth — what we collect and how we use it." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="This policy explains what data Milo Growth collects, how it is used, and the choices you have. It is written to be privacy-conscious and small-business friendly."
    >
      <LegalSection heading="Who operates Milo">
        <p>
          Milo Growth is operated by {LEGAL_IDENTITY.operator} ({LEGAL_IDENTITY.legalName}). For privacy
          questions, contact <a className="underline underline-offset-4" href={`mailto:${LEGAL_IDENTITY.supportEmail}`}>{LEGAL_IDENTITY.supportEmail}</a>.
        </p>
      </LegalSection>

      <LegalSection heading="What data Milo collects">
        <p>We collect only what we need to run the service:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Account data</strong> — your email and authentication details used to sign in.</li>
          <li><strong>Project / workspace data</strong> — the business profile, services, goals, settings and language preferences you enter.</li>
          <li><strong>Website / content data</strong> — opportunities, calendars, drafts and published content you create with Milo.</li>
          <li><strong>Analytics data</strong> — anonymous website analytics from sites where you install Milo Analytics (see the Cookie &amp; Analytics Policy).</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Analytics data">
        <p>
          Milo Analytics uses anonymous visitor and session IDs. Milo does not store names or emails through
          analytics events unless you intentionally submit them elsewhere, and Milo Analytics does not store full
          IP addresses. See the <Link to="/cookies" className="underline underline-offset-4">Cookie &amp; Analytics Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection heading="AI provider processing">
        <p>
          AI-generated content and the website/business data needed to produce it may be sent to AI / model
          providers depending on the configured provider. We send only what is needed to generate the requested
          output. See our <Link to="/subprocessors" className="underline underline-offset-4">Subprocessors</Link> page.
        </p>
      </LegalSection>

      <LegalSection heading="Publishing connector data">
        <p>
          If you connect a website, Milo stores the connection settings (such as endpoint URLs and a publish
          secret) and sends content you choose to publish to that website. You are responsible for ensuring you
          have permission to connect and publish to your websites.
        </p>
      </LegalSection>

      <LegalSection heading="Cookies and local storage">
        <p>
          The Milo app uses authentication and session storage to keep you signed in. Milo Analytics may use
          localStorage / sessionStorage for anonymous visitor and session IDs. Details are in the
          <Link to="/cookies" className="underline underline-offset-4"> Cookie &amp; Analytics Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection heading="Legal bases">
        <p>
          [Legal bases to be confirmed with legal review.] We process account and project data to provide the
          service you request (contract), and to operate and secure the product (legitimate interests), in line
          with applicable European data protection law.
        </p>
      </LegalSection>

      <LegalSection heading="Data retention">
        <p>
          [Retention periods to be finalised.] We keep your data for as long as your account is active or as
          needed to provide the service, and delete or anonymise it on request as described below.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>
          Subject to applicable law, you may request access to, correction of, or deletion of your personal data,
          and you may object to or restrict certain processing.
        </p>
      </LegalSection>

      <LegalSection heading="Data deletion and export requests">
        <p>During the beta these requests are handled manually. You can request:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>data export</li>
          <li>data deletion</li>
          <li>workspace deletion</li>
          <li>account deletion</li>
        </ul>
        <p>
          Contact support at <a className="underline underline-offset-4" href={`mailto:${LEGAL_IDENTITY.supportEmail}`}>{LEGAL_IDENTITY.supportEmail}</a>{" "}
          (support contact to be confirmed before public launch) and we will action your request.
        </p>
      </LegalSection>

      <LegalSection heading="International transfers">
        <p>
          [International transfer mechanisms to be confirmed.] Some subprocessors may process data outside your
          country. Where this happens we rely on appropriate safeguards as required by applicable law.
        </p>
      </LegalSection>

      <LegalSection heading="Subprocessors">
        <p>
          We use third-party providers to operate Milo. A current list is on our
          <Link to="/subprocessors" className="underline underline-offset-4"> Subprocessors</Link> page.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Privacy questions: <a className="underline underline-offset-4" href={`mailto:${LEGAL_IDENTITY.supportEmail}`}>{LEGAL_IDENTITY.supportEmail}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
