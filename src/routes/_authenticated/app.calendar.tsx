import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore, updateCalendarItem } from "@/lib/store";
import { formatDateShort } from "@/lib/format";
import { generateContentCalendar } from "@/lib/mock-ai";
import { CreateContentDialog } from "@/components/CreateContentDialog";
import type { CalendarItem } from "@/lib/types";
import { useMemo, useState } from "react";
import { CalendarDays, FilePlus2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/calendar")({
  head: () => ({
    meta: [
      { title: "Content Calendar — Milo Growth" },
      { name: "description", content: "30-day planning view for AI-generated content." },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const activeProjectId = useStore((s) => s.activeProjectId);
  const items = useStore((s) =>
    s.calendar
      .filter((c) => c.projectId === activeProjectId)
      .slice()
      .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate)),
  );
  const [busy, setBusy] = useState(false);
  const [contentOppId, setContentOppId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    items.forEach((i) => {
      const w = isoWeek(i.plannedDate);
      m.set(w, [...(m.get(w) ?? []), i]);
    });
    return [...m.entries()];
  }, [items]);

  return (
    <AppShell
      title="Content calendar"
      description="A 30-day publishing plan, grouped by week. Reorder by editing dates or status."
      actions={
        <Button
          onClick={async () => {
            setBusy(true);
            try {
              await generateContentCalendar(activeProjectId);
              toast.success("Calendar refreshed");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Generation failed");
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
          Generate calendar
        </Button>
      }
    >
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
          No calendar yet — generate one from your opportunities.
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(([week, list]) => (
            <section key={week}>
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
                Week {week}
              </div>
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/60 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    <tr>
                      <th className="text-left px-5 py-3 font-medium w-32">Date</th>
                      <th className="text-left px-5 py-3 font-medium">Topic</th>
                      <th className="text-left px-5 py-3 font-medium w-28">Lang</th>
                      <th className="text-left px-5 py-3 font-medium w-36">Type</th>
                      <th className="text-left px-5 py-3 font-medium w-32">Intent</th>
                      <th className="text-left px-5 py-3 font-medium w-44">CTA</th>
                      <th className="text-left px-5 py-3 font-medium w-40">Status</th>
                      <th className="text-left px-5 py-3 font-medium w-36">Content</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {list.map((c) => (
                      <tr key={c.id} className="hover:bg-secondary/40">
                        <td className="px-5 py-3 font-mono text-xs">
                          {formatDateShort(c.plannedDate)}
                        </td>
                        <td className="px-5 py-3"><div className="font-medium truncate max-w-md">{c.topicTitle}</div></td>
                        <td className="px-5 py-3 text-muted-foreground">{c.language}</td>
                        <td className="px-5 py-3 text-muted-foreground">{c.contentType}</td>
                        <td className="px-5 py-3 text-muted-foreground">{c.searchIntent}</td>
                        <td className="px-5 py-3 text-muted-foreground truncate">{c.recommendedCta}</td>
                        <td className="px-5 py-3">
                          <Select value={c.status} onValueChange={(v) => updateCalendarItem(c.id, { status: v as CalendarItem["status"] })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Planned">Planned</SelectItem>
                              <SelectItem value="In Progress">In Progress</SelectItem>
                              <SelectItem value="Done">Done</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-5 py-3">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!c.opportunityId}
                            title={c.opportunityId ? "Create content from the source opportunity" : "No linked opportunity"}
                            onClick={() => c.opportunityId && setContentOppId(c.opportunityId)}
                          >
                            <FilePlus2 className="h-3.5 w-3.5" /> Create
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      <CreateContentDialog
        opportunityId={contentOppId}
        open={contentOppId !== null}
        onOpenChange={(o) => { if (!o) setContentOppId(null); }}
      />
    </AppShell>
  );
}

function isoWeek(d: string) {
  const date = new Date(d);
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = (target.getTime() - firstThursday.getTime()) / 86400000;
  return String(1 + Math.round((diff - 3 + ((firstThursday.getDay() + 6) % 7)) / 7));
}
