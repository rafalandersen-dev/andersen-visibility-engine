import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/LegalPage";
import { LEGAL_IDENTITY } from "@/lib/legal";

export const Route = createFileRoute("/imprint")({
  head: () => ({
    meta: [
      { title: "Company Information — Milo Growth" },
      {
        name: "description",
        content: "Seller and operator information for Milo Growth (e-handelslagen §8).",
      },
    ],
  }),
  component: ImprintPage,
});

function ImprintPage() {
  return (
    <LegalPage
      title="Company Information"
      intro="Who operates Milo Growth — the seller information required under the Swedish E-commerce Act (e-handelslagen, 2002:562) §8."
    >
      <LegalSection heading="Operator">
        <p>
          {LEGAL_IDENTITY.product} is operated by {LEGAL_IDENTITY.legalName}.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Organisation number: {LEGAL_IDENTITY.orgNumber}</li>
          <li>VAT number: {LEGAL_IDENTITY.vatNumber}</li>
          <li>{LEGAL_IDENTITY.fTax}</li>
          <li>Location: {LEGAL_IDENTITY.address}</li>
        </ul>
        <p>
          The registered business address is available on request via{" "}
          <a
            className="underline underline-offset-4"
            href={`mailto:${LEGAL_IDENTITY.supportEmail}`}
          >
            {LEGAL_IDENTITY.supportEmail}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Support and general contact:{" "}
          <a
            className="underline underline-offset-4"
            href={`mailto:${LEGAL_IDENTITY.supportEmail}`}
          >
            {LEGAL_IDENTITY.supportEmail}
          </a>
          <br />
          Security reports:{" "}
          <a
            className="underline underline-offset-4"
            href={`mailto:${LEGAL_IDENTITY.securityEmail}`}
          >
            {LEGAL_IDENTITY.securityEmail}
          </a>
        </p>
      </LegalSection>

      <LegalSection heading="Supervision and applicable law">
        <p>
          Milo Growth is offered from Sweden and Swedish law applies (country-of-origin principle,
          e-handelslagen §3a). The lead supervisory authority for data protection is the Swedish
          Authority for Privacy Protection (IMY).
        </p>
      </LegalSection>
    </LegalPage>
  );
}
