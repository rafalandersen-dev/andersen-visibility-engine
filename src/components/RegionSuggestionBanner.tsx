import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { REGION_SELECTOR_LABELS, suggestRegionFromLanguage, type DisplayRegion } from "@/lib/markets";
import { X } from "lucide-react";

/**
 * Soft, dismissible region suggestion shown on the public landing. Never
 * redirects — only offers a link. Respects a stored/dismissed preference.
 */
export function RegionSuggestionBanner() {
  const [region, setRegion] = useState<DisplayRegion | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("milo_display_region");
      const dismissed = localStorage.getItem("milo_region_suggest_dismissed");
      if (stored || dismissed) return;
      const suggested = suggestRegionFromLanguage(navigator.language);
      setRegion(suggested);
    } catch {
      /* ignore */
    }
  }, []);

  if (!region) return null;

  function dismiss() {
    try { localStorage.setItem("milo_region_suggest_dismissed", "1"); } catch { /* ignore */ }
    setRegion(null);
  }

  return (
    <div className="border-b border-border bg-card/60">
      <div className="mx-auto max-w-6xl px-6 py-2.5 flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          Looks like you may be in {REGION_SELECTOR_LABELS[region]}.{" "}
          <Link to={`/${region}` as never} className="text-foreground underline underline-offset-4" onClick={() => { try { localStorage.setItem("milo_display_region", region!); } catch { /* ignore */ } }}>
            View the {REGION_SELECTOR_LABELS[region]} version
          </Link>
        </span>
        <button onClick={dismiss} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
