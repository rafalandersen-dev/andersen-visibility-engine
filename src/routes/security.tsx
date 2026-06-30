import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/LegalPage";
import { LEGAL_IDENTITY } from "@/lib/legal";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "Security — Milo Growth" },
      { name: "description", content: "How Milo Growth protects accounts, data and publishing secrets." },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  return (
    <LegalPage
      title="Security"
      intro="An overview of the security practices behind Milo Growth. We aim to be transparent about what we do today and what is still maturing."
    >
      <LegalSection heading="Security overview">
        <p>
          Milo is built on managed infrastructure with authentication, access control and server-side handling of
          sensitive values. Security is an ongoing process and this page reflects our current practices during the
          beta.
        </p>
      </LegalSection>

      <LegalSection heading="Authentication">
        <p>
          Access to the app requires authentication. Sign-in is handled by our managed auth provider, and requests
          to your data are scoped to your authenticated session.
        </p>
      </LegalSection>

      <LegalSection heading="Workspace and project access">
        <p>
          Data is organised by workspace and project, and is only accessible to the account it belongs to. Users
          see only the projects within their own workspace.
        </p>
      </LegalSection>

      <LegalSection heading="Access control (row-level security)">
        <p>
          Data access is enforced server-side using row-level security so that queries are restricted to the
          authenticated user's own records.
        </p>
      </LegalSection>

      <LegalSection heading="Server-side secrets">
        <p>
          Service credentials and integration secrets are used only on the server. They are not exposed to the
          browser or embedded in client code.
        </p>
      </LegalSection>

      <LegalSection heading="Publishing secrets">
        <p>
          When you connect a website, the publish secret is stored privately and sent only as a request header to
          your configured endpoint. The same secret must be configured on your target website. It is not shown
          publicly or shared with other users.
        </p>
      </LegalSection>

      <LegalSection heading="Analytics privacy">
        <p>
          Milo Analytics is privacy-conscious: it uses anonymous visitor/session IDs, does not store full IP
          addresses, and does not capture names or emails through analytics events. See the
          <Link to="/cookies" className="underline underline-offset-4"> Cookie &amp; Analytics Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection heading="Backups">
        <p>[Backup and recovery details to be confirmed.] Database infrastructure is provided by our managed backend provider.</p>
      </LegalSection>

      <LegalSection heading="Monitoring and error handling">
        <p>
          [Monitoring details to be expanded.] The application includes server-side and client-side error
          reporting to help us detect and resolve issues.
        </p>
      </LegalSection>

      <LegalSection heading="Vulnerability / security contact">
        <p>
          To report a security concern, contact{" "}
          <a className="underline underline-offset-4" href={`mailto:${LEGAL_IDENTITY.securityEmail}`}>{LEGAL_IDENTITY.securityEmail}</a>.
        </p>
      </LegalSection>

      <LegalSection heading="Incident response">
        <p>
          [Incident response process to be formalised.] We aim to investigate reported issues promptly and notify
          affected users where appropriate.
        </p>
      </LegalSection>

      <LegalSection heading="Responsible disclosure">
        <p>
          [Responsible disclosure policy to be formalised.] We welcome good-faith reports from security
          researchers and ask that you give us a reasonable opportunity to address issues before public
          disclosure.
        </p>
      </LegalSection>

      <LegalSection heading="Enterprise certifications">
        <p>
          Milo is not currently ISO 27001 or SOC 2 certified. These may be considered later as the product
          matures. We do not claim certifications or penetration tests that we do not hold.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
