import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/LegalPage";
import { LEGAL_IDENTITY } from "@/lib/legal";

export const Route = createFileRoute("/trust")({
  head: () => ({
    meta: [
      { title: "EU Trust Centre — Milo Growth" },
      {
        name: "description",
        content:
          "How Milo Growth handles GDPR, AI transparency, human review and honest publishing for European small businesses.",
      },
    ],
  }),
  component: TrustPage,
});

function TrustPage() {
  return (
    <LegalPage
      title="EU Trust Centre"
      intro="Milo is built in Europe, for European small businesses. This page explains — in plain language — how we approach data protection, AI transparency and honest reporting. Where something is still maturing during the beta, we say so."
    >
      <LegalSection heading="GDPR first">
        <p>
          Milo is operated by {LEGAL_IDENTITY.operator} and designed around GDPR principles: your
          workspace data belongs to you, it is used to provide the service — not to train models or
          to be sold — and access is enforced server-side with row-level security so queries are
          restricted to your own records. See our <Link to="/privacy">Privacy Policy</Link> and{" "}
          <Link to="/subprocessors">subprocessors list</Link> for the specifics.
        </p>
      </LegalSection>

      <LegalSection heading="AI transparency (EU AI Act readiness)">
        <p>
          Milo uses AI to draft content, suggest opportunities and analyse your site. We are
          explicit about that: drafts are labelled as AI-assisted, and our{" "}
          <Link to="/ai-disclaimer">AI disclaimer</Link> describes the limits. Nothing Milo writes
          is presented as human-authored when it is not, and you stay the author of record for what
          you approve and publish.
        </p>
      </LegalSection>

      <LegalSection heading="A human approves before anything ships">
        <p>
          By default, Milo never publishes on its own. Content moves through an explicit approval
          step, and even the monthly autopilot can be set to &quot;approve first&quot;, where drafts
          wait for your go-ahead. Quality and safety checks (readiness scoring, health-claim and
          sensitive-topic warnings) surface issues before you press publish.
        </p>
      </LegalSection>

      <LegalSection heading="Honest reporting — verified, not claimed">
        <p>
          Milo only reports a piece as &quot;live&quot; after it verifies the page on your site, and
          partner links in the Link Growth Network only earn a &quot;Live&quot; badge after Milo
          fetches the partner page and finds the actual link — and the badge is removed if the link
          later disappears. Your monthly proof report counts only verified results. No vanity
          metrics.
        </p>
      </LegalSection>

      <LegalSection heading="No link farms">
        <p>
          The Link Growth Network is opt-in and relevance-first: partners are only suggested when
          your topics genuinely overlap, nothing is ever auto-placed on anyone&apos;s site, and
          contact details are retracted from partner suggestions if you pause your listing.
        </p>
      </LegalSection>

      <LegalSection heading="Where your data lives">
        <p>
          Workspace data is stored with our managed cloud provider (see{" "}
          <Link to="/subprocessors">subprocessors</Link>). Publishing secrets stay server-side and
          are never exposed to the browser. Details of our current practices are on the{" "}
          <Link to="/security">Security</Link> page.
        </p>
      </LegalSection>

      <LegalSection heading="Multilingual by design">
        <p>
          Milo works natively in English, Polish, Swedish and Danish — interface and generated
          content — because European small businesses do not operate in one language.
        </p>
      </LegalSection>

      <LegalSection heading="Questions">
        <p>
          Data protection or trust questions:{" "}
          <a href={`mailto:${LEGAL_IDENTITY.supportEmail}`}>{LEGAL_IDENTITY.supportEmail}</a>.
          Security reports:{" "}
          <a href={`mailto:${LEGAL_IDENTITY.securityEmail}`}>{LEGAL_IDENTITY.securityEmail}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
