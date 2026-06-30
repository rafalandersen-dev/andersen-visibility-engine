import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  LEGAL_PAGES,
  LEGAL_LAST_UPDATED,
  LEGAL_REVIEW_NOTE,
  LEGAL_LOCALIZATION_NOTE,
} from "@/lib/legal";
import { Info } from "lucide-react";

/**
 * Shared public layout for legal / trust pages. No authentication required.
 * Renders its own header + footer + cross-links so each page is reachable
 * directly by URL and consistent with the Milo design system.
 */
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
          <Link to="/" className="flex flex-col">
            <span className="font-display text-lg leading-tight">Milo Growth</span>
            <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Monthly AI growth planner
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/"><Button variant="ghost" size="sm">Home</Button></Link>
            <Link to="/auth"><Button size="sm">Get started</Button></Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10 grid gap-10 lg:grid-cols-[200px,1fr]">
        {/* Legal nav */}
        <aside className="lg:sticky lg:top-8 h-fit">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
            Legal &amp; Trust
          </div>
          <nav className="space-y-0.5">
            {LEGAL_PAGES.map((p) => (
              <Link
                key={p.to}
                to={p.to as never}
                className="block rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors [&.active]:bg-accent/25 [&.active]:text-foreground"
                activeProps={{ className: "active" }}
              >
                {p.title}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <article className="min-w-0">
          <h1 className="font-display text-3xl md:text-4xl">{title}</h1>
          <div className="mt-2 text-xs text-muted-foreground">Last updated: {LEGAL_LAST_UPDATED}</div>

          <div className="mt-4 flex items-start gap-2 rounded-md border border-gold/30 bg-gold/5 px-4 py-3 text-xs text-foreground/80">
            <Info className="h-4 w-4 shrink-0 text-gold/80 mt-0.5" />
            <span>{LEGAL_REVIEW_NOTE}</span>
          </div>

          {intro ? <p className="mt-6 text-sm text-muted-foreground max-w-2xl">{intro}</p> : null}

          <div className="legal-body mt-6 space-y-7 text-sm leading-relaxed text-foreground/90">
            {children}
          </div>

          <div className="mt-10 rounded-md border border-border bg-card/50 px-4 py-3 text-xs text-muted-foreground">
            {LEGAL_LOCALIZATION_NOTE}
          </div>
        </article>
      </div>

      <footer className="border-t border-border bg-card/40">
        <div className="mx-auto max-w-5xl px-6 py-8 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>Milo Growth — built by Andersen Innovations</span>
          <Link to="/" className="hover:text-foreground">Back to home</Link>
        </div>
      </footer>
    </main>
  );
}

/** A titled section within a legal page. */
export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg text-foreground">{heading}</h2>
      <div className="space-y-2 text-foreground/85">{children}</div>
    </section>
  );
}
