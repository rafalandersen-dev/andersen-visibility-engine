import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";

export const Route = createFileRoute("/subprocessors")({
  head: () => ({
    meta: [
      { title: "Subprocessors — Milo Growth" },
      { name: "description", content: "Third-party subprocessors used by Milo Growth." },
    ],
  }),
  component: SubprocessorsPage,
});

type Row = {
  provider: string;
  purpose: string;
  data: string;
  location: string;
  status: "Active" | "Planned" | "Internal";
};

const ROWS: Row[] = [
  {
    provider: "Supabase",
    purpose: "Database, authentication, storage and backend infrastructure",
    data: "Account data, project/workspace data, content data",
    location: "To be confirmed before public launch",
    status: "Active",
  },
  {
    provider: "Lovable",
    purpose: "Hosting, deployment and application infrastructure",
    data: "Application data in transit; deployment artifacts",
    location: "To be confirmed before public launch",
    status: "Active",
  },
  {
    provider: "AI / model provider (configured provider)",
    purpose: "AI text generation and analysis",
    data: "Business/website context and prompts needed to generate the requested output",
    location: "To be confirmed before public launch",
    status: "Active",
  },
  {
    provider: "Google / Gemini provider",
    purpose: "AI generation and analysis (where the configured provider is used)",
    data: "Prompts and context needed to generate the requested output",
    location: "To be confirmed before public launch",
    status: "Active",
  },
  {
    provider: "Email provider",
    purpose: "Transactional email (e.g. authentication, notifications)",
    data: "Recipient email address and message content",
    location: "To be confirmed before public launch",
    status: "Active",
  },
  {
    provider: "Payment provider",
    purpose: "Billing and payments",
    data: "Not processed — billing is not active yet",
    location: "To be confirmed before public launch",
    status: "Planned",
  },
  {
    provider: "Milo first-party analytics",
    purpose: "Anonymous website analytics (page views, events, AI-related signals)",
    data: "Anonymous visitor/session IDs and events — no full IP addresses",
    location: "Processed within Milo infrastructure",
    status: "Internal",
  },
];

function StatusBadge({ status }: { status: Row["status"] }) {
  const cls =
    status === "Active"
      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-600"
      : status === "Planned"
      ? "bg-amber-500/10 border-amber-500/30 text-amber-600"
      : "bg-muted border-border text-muted-foreground";
  return (
    <span className={`text-[10px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full border ${cls}`}>
      {status}
    </span>
  );
}

function SubprocessorsPage() {
  return (
    <LegalPage
      title="Subprocessors"
      intro="Milo Growth uses the third-party providers below to operate the service. Exact legal entity names, hosting regions and transfer mechanisms are still being confirmed and are marked accordingly."
    >
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-secondary/60 text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Provider</th>
              <th className="text-left px-4 py-3 font-medium">Purpose</th>
              <th className="text-left px-4 py-3 font-medium">Data processed</th>
              <th className="text-left px-4 py-3 font-medium">Location / transfer</th>
              <th className="text-left px-4 py-3 font-medium w-24">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border align-top">
            {ROWS.map((r) => (
              <tr key={r.provider} className="hover:bg-secondary/40">
                <td className="px-4 py-3 font-medium">{r.provider}</td>
                <td className="px-4 py-3 text-foreground/85">{r.purpose}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.data}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.location}</td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Exact legal entity names, registered addresses and data-transfer mechanisms are to be confirmed before
        public launch. We will update this page as the subprocessor list is finalised.
      </p>
    </LegalPage>
  );
}
