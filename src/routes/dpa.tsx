import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/LegalPage";
import { LEGAL_IDENTITY } from "@/lib/legal";

export const Route = createFileRoute("/dpa")({
  head: () => ({
    meta: [
      { title: "Data Processing Agreement — Milo Growth" },
      { name: "description", content: "Beta Data Processing Agreement for Milo Growth." },
    ],
  }),
  component: DpaPage,
});

function DpaPage() {
  return (
    <LegalPage
      title="Data Processing Agreement"
      intro="This beta Data Processing Agreement (DPA) describes how Milo Growth processes personal data on your behalf when you use the service. It is a readable beta template, not final legal text."
    >
      <LegalSection heading="Parties">
        <p>
          This DPA is between you (the "Controller") and {LEGAL_IDENTITY.operator} ({LEGAL_IDENTITY.legalName}),
          operator of Milo Growth (the "Processor").
        </p>
      </LegalSection>

      <LegalSection heading="Subject matter">
        <p>
          The processing of personal data by the Processor on behalf of the Controller as necessary to provide
          the Milo Growth service.
        </p>
      </LegalSection>

      <LegalSection heading="Duration">
        <p>
          Processing lasts for as long as the Controller uses the service, and until data is deleted or returned
          as described below.
        </p>
      </LegalSection>

      <LegalSection heading="Nature and purpose of processing">
        <p>
          To provide planning, content generation, publishing and analytics features — including hosting account
          and project data, generating AI-assisted content, sending content to connected websites, and reporting
          anonymous website analytics.
        </p>
      </LegalSection>

      <LegalSection heading="Categories of data">
        <ul className="list-disc pl-5 space-y-1">
          <li>Account data (email, authentication identifiers)</li>
          <li>Project / workspace and business profile data</li>
          <li>Content and website data created in Milo</li>
          <li>Anonymous website analytics (visitor/session IDs, events) — no full IP addresses</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Categories of data subjects">
        <ul className="list-disc pl-5 space-y-1">
          <li>The Controller's authorised users</li>
          <li>Visitors to the Controller's websites that use Milo Analytics (anonymous)</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Processor obligations">
        <p>The Processor will:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>process personal data only on documented instructions from the Controller;</li>
          <li>ensure persons authorised to process data are bound by confidentiality;</li>
          <li>implement appropriate technical and organisational security measures;</li>
          <li>assist the Controller with data subject requests and security obligations where reasonable.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Controller obligations">
        <p>
          The Controller is responsible for the lawfulness of the data it provides, for having an appropriate
          legal basis, and for ensuring it is permitted to connect and publish to any website it configures.
        </p>
      </LegalSection>

      <LegalSection heading="Subprocessors">
        <p>
          The Controller authorises the Processor to use the subprocessors listed on the
          <Link to="/subprocessors" className="underline underline-offset-4"> Subprocessors</Link> page. We will
          maintain that list and take reasonable steps to ensure subprocessors apply suitable safeguards.
        </p>
      </LegalSection>

      <LegalSection heading="Security measures">
        <p>
          Security measures are summarised on the <Link to="/security" className="underline underline-offset-4">Security</Link> page,
          including authentication, row-level access control, server-side handling of secrets and privacy-conscious
          analytics.
        </p>
      </LegalSection>

      <LegalSection heading="Assistance with data subject rights">
        <p>
          The Processor will assist the Controller, by appropriate technical and organisational measures, in
          responding to requests from data subjects to exercise their rights.
        </p>
      </LegalSection>

      <LegalSection heading="Breach notification">
        <p>
          [Breach notification timelines to be finalised.] The Processor will notify the Controller without undue
          delay after becoming aware of a personal data breach affecting the Controller's data.
        </p>
      </LegalSection>

      <LegalSection heading="Deletion or return of data">
        <p>
          On termination, or on request, the Processor will delete or return the Controller's personal data,
          subject to any legal retention requirements. See the
          <Link to="/privacy" className="underline underline-offset-4"> Privacy Policy</Link> for how to make a request.
        </p>
      </LegalSection>

      <LegalSection heading="International transfers">
        <p>
          [International transfer mechanisms to be confirmed.] Where data is processed outside your country, the
          parties rely on appropriate safeguards as required by applicable law.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Data protection contact: <a className="underline underline-offset-4" href={`mailto:${LEGAL_IDENTITY.supportEmail}`}>{LEGAL_IDENTITY.supportEmail}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
