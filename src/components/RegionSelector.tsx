import { useNavigate } from "@tanstack/react-router";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DISPLAY_REGIONS, REGION_SELECTOR_LABELS, type DisplayRegion } from "@/lib/markets";

/**
 * Soft region selector for public market pages. Navigates to the chosen
 * market route and remembers the preference — it never changes billing
 * eligibility, only the page shown.
 */
export function RegionSelector({ current, note }: { current?: DisplayRegion; note?: string }) {
  const navigate = useNavigate();

  function pick(region: string) {
    try {
      localStorage.setItem("milo_display_region", region);
    } catch {
      /* ignore */
    }
    navigate({ to: `/${region}` as never });
  }

  return (
    <div className="inline-flex flex-col gap-1.5">
      <Select value={current ?? undefined} onValueChange={pick}>
        <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="Choose region" /></SelectTrigger>
        <SelectContent>
          {DISPLAY_REGIONS.map((r) => (
            <SelectItem key={r} value={r}>{REGION_SELECTOR_LABELS[r]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {note ? <span className="text-[11px] text-muted-foreground max-w-xs">{note}</span> : null}
    </div>
  );
}
