import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DISPLAY_REGIONS, REGION_SELECTOR_LABELS } from "@/lib/markets";

/**
 * Shared public (no-auth) chrome for marketing/sales pages: /beta,
 * /case-studies, /demo-script. Mirrors the pricing/legal page header & footer.
 */
export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
          <Link to="/" className="flex flex-col">
            <span className="font-display text-lg leading-tight">Milo Growth</span>
            <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Monthly AI growth planner
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/free-ai-visibility-audit"><Button variant="ghost" size="sm">Free audit</Button></Link>
            <Link to="/auth"><Button size="sm">Get started</Button></Link>
          </div>
        </div>
      </header>

      {children}

      <footer className="border-t border-border bg-card/40">
        <div className="mx-auto max-w-6xl px-6 py-8 space-y-3 text-sm text-muted-foreground">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>Milo Growth — built by Andersen Innovations</span>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link to="/free-ai-visibility-audit" className="hover:text-foreground">Free audit</Link>
              <Link to="/beta" className="hover:text-foreground">Beta</Link>
              <Link to="/case-studies" className="hover:text-foreground">Case studies</Link>
              <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
              <Link to="/terms" className="hover:text-foreground">Terms</Link>
              <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
              <Link to="/ai-disclaimer" className="hover:text-foreground">AI disclaimer</Link>
              <Link to="/" className="hover:text-foreground">Home</Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="uppercase tracking-[0.18em]">Markets:</span>
            {DISPLAY_REGIONS.map((r) => (
              <Link key={r} to={`/${r}` as never} className="hover:text-foreground">{REGION_SELECTOR_LABELS[r]}</Link>
            ))}
          </div>
        </div>
      </footer>
    </main>
  );
}
