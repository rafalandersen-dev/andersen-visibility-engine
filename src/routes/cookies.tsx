import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/LegalPage";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Cookie & Analytics Policy — Milo Growth" },
      { name: "description", content: "How Milo uses storage and privacy-conscious analytics." },
    ],
  }),
  component: CookiesPage,
});

const CLIENT_SNIPPET =
  "This website uses Milo Analytics, a privacy-conscious analytics tool that helps us understand anonymous page views and button clicks. It does not store names, emails or full IP addresses.";

function CookiesPage() {
  return (
    <LegalPage
      title="Cookie & Analytics Policy"
      intro="Milo aims to be light on cookies and privacy-conscious by default. This page explains the storage the app uses and what Milo Analytics tracks."
    >
      <LegalSection heading="App authentication and session storage">
        <p>
          The Milo app may use authentication and session storage to keep you signed in while you use the product.
        </p>
      </LegalSection>

      <LegalSection heading="Milo Analytics">
        <p>
          Milo Analytics can track anonymous page views and events on websites where you install it. It may use
          localStorage / sessionStorage to hold anonymous visitor and session IDs. It does not store full IP
          addresses.
        </p>
      </LegalSection>

      <LegalSection heading="What Milo Analytics tracks">
        <ul className="list-disc pl-5 space-y-1">
          <li>page views</li>
          <li>CTA clicks</li>
          <li>booking clicks</li>
          <li>referrer / source</li>
          <li>AI-related signals where detectable</li>
        </ul>
      </LegalSection>

      <LegalSection heading="About AI-related signals">
        <p>
          AI-related signals are inferred from referrer and user-agent information. They do not mean your business
          ranks or is cited in AI tools — they simply indicate traffic or crawler activity that appears
          AI-related.
        </p>
      </LegalSection>

      <LegalSection heading="Disclosure on client websites">
        <p>
          Client websites using Milo Analytics may need to disclose it in their own privacy or cookie notice,
          depending on their jurisdiction and setup. You can adapt the recommended snippet below:
        </p>
        <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs text-foreground/85">
          {CLIENT_SNIPPET}
        </div>
      </LegalSection>

      <LegalSection heading="More information">
        <p>
          For how analytics data fits into our wider data practices, see the
          <Link to="/privacy" className="underline underline-offset-4"> Privacy Policy</Link>. This sprint does not
          include a full cookie consent platform.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
