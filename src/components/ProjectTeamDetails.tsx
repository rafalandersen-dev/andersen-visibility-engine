import { useState, type ReactNode } from "react";
/** Closed roster rows must not mount children that issue settings/history RPCs. */
export function ProjectTeamDetails({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="w-full rounded-md border p-3"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-medium">{label}</summary>
      {open && <div className="mt-3">{children}</div>}
    </details>
  );
}
