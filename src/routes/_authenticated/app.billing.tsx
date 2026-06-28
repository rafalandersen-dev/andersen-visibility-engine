import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { PLANS, EXTRA_PROJECT, formatPrice, MAX_PROJECTS_PER_USER } from "@/lib/pricing";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { ShieldCheck, Crown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/billing")({
  head: () => ({
    meta: [{ title: "Billing — Andersen Visibility Engine" }],
  }),
  component: BillingPage,
});

function BillingPage() {
  const { isOwner, user } = useAuth();
  const projects = useStore((s) => s.projects);

  return (
    <AppShell
      title="Billing & plan"
      description="Manage your workspace plan and project allowance."
    >
      {isOwner ? (
        <div className="mb-8 rounded-xl border border-gold/40 bg-gold/5 p-5 flex items-start gap-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gold/15 text-gold">
            <Crown className="h-4 w-4" />
          </div>
          <div>
            <div className="font-display text-lg">Owner account</div>
            <p className="text-sm text-muted-foreground">
              You have unlimited projects and no billing. This account bypasses plan limits.
            </p>
          </div>
        </div>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Current usage
            </div>
            <div className="mt-1 font-display text-2xl">
              {projects.length} project{projects.length === 1 ? "" : "s"} ·{" "}
              {isOwner ? "unlimited" : `${MAX_PROJECTS_PER_USER} max`}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Plan</div>
            <div className="mt-1 font-display text-xl">Free Preview</div>
          </div>
        </div>
      </section>

      <h2 className="mt-12 font-display text-2xl">Plans</h2>
      <div className="mt-4 grid gap-6 md:grid-cols-3">
        {PLANS.map((p) => (
          <div
            key={p.id}
            className={
              "rounded-xl border p-6 bg-card flex flex-col " +
              (p.recommended ? "border-gold shadow-[0_0_0_1px_hsl(var(--gold)/0.45)]" : "border-border")
            }
          >
            {p.recommended ? (
              <div className="mb-3 inline-block self-start rounded-full bg-gold/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-gold">
                Recommended
              </div>
            ) : null}
            <h3 className="font-display text-xl">{p.name}</h3>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-display text-3xl">{formatPrice(p.pricePerMonth)}</span>
              <span className="text-sm text-muted-foreground">/month</span>
            </div>
            <ul className="mt-5 space-y-2 text-sm flex-1">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <ShieldCheck className="h-4 w-4 mt-0.5 text-gold/80" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button className="mt-6" variant="outline" disabled>
              Coming soon
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-xl">{EXTRA_PROJECT.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{EXTRA_PROJECT.description}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="font-display text-2xl">{formatPrice(EXTRA_PROJECT.pricePerMonth)}</div>
            <div className="text-xs text-muted-foreground">per project / month</div>
          </div>
          <Button variant="outline" disabled>Coming soon</Button>
        </div>
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        See the public <Link to="/pricing" className="underline-offset-4 hover:underline">pricing page</Link> for full details.
      </p>
    </AppShell>
  );
}
