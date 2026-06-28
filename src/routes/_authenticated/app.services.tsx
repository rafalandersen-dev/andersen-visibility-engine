import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore, addService, updateService, deleteService } from "@/lib/store";
import type { Priority, ServiceItem } from "@/lib/types";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/services")({
  head: () => ({
    meta: [
      { title: "Services & Products — Andersen Visibility Engine" },
      { name: "description", content: "Catalog of services and products the AI uses to ground content." },
    ],
  }),
  component: ServicesPage,
});

const empty = (projectId: string): Omit<ServiceItem, "id"> => ({
  projectId,
  name: "",
  kind: "Service",
  description: "",
  targetAudience: "",
  locationRelevance: "",
  priority: "Medium",
});

function ServicesPage() {
  const activeProjectId = useStore((s) => s.activeProjectId);
  const items = useStore((s) => s.services.filter((x) => x.projectId === activeProjectId));
  const [editing, setEditing] = useState<ServiceItem | null>(null);
  const [creating, setCreating] = useState<Omit<ServiceItem, "id"> | null>(null);

  const startCreate = () => setCreating(empty(activeProjectId));

  return (
    <AppShell
      title="Services & products"
      description="Anchor your visibility programme in what you actually sell."
      actions={
        <Button onClick={startCreate}>
          <Plus className="h-4 w-4" /> Add item
        </Button>
      }
    >
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th className="text-left px-5 py-3 font-medium">Name</th>
              <th className="text-left px-5 py-3 font-medium">Type</th>
              <th className="text-left px-5 py-3 font-medium">Audience</th>
              <th className="text-left px-5 py-3 font-medium">Location</th>
              <th className="text-left px-5 py-3 font-medium">Priority</th>
              <th className="w-32" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-12">
                <div className="text-center">
                  <div className="font-display text-lg mb-1">No services or products yet</div>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Add what this business actually sells. The AI uses this catalog to ground every brief, draft and CTA it generates for this project.
                  </p>
                  <Button className="mt-4" onClick={startCreate}><Plus className="h-4 w-4" /> Add first item</Button>
                </div>
              </td></tr>
            ) : items.map((s) => (
              <tr key={s.id} className="hover:bg-secondary/40">
                <td className="px-5 py-3">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground truncate max-w-md">{s.description}</div>
                </td>
                <td className="px-5 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-secondary border border-border">{s.kind}</span>
                </td>
                <td className="px-5 py-3 text-muted-foreground">{s.targetAudience}</td>
                <td className="px-5 py-3 text-muted-foreground">{s.locationRelevance}</td>
                <td className="px-5 py-3"><PriorityPill p={s.priority} /></td>
                <td className="px-5 py-3 text-right">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => { deleteService(s.id); toast.success("Removed"); }}><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(editing || creating) && (
        <Editor
          value={(editing ?? creating) as ServiceItem | Omit<ServiceItem, "id">}
          onClose={() => { setEditing(null); setCreating(null); }}
          onSave={(v) => {
            if (editing) {
              updateService(editing.id, v);
              toast.success("Saved");
            } else {
              addService(v as Omit<ServiceItem, "id">);
              toast.success("Added");
            }
            setEditing(null);
            setCreating(null);
          }}
        />
      )}
    </AppShell>
  );
}

function PriorityPill({ p }: { p: Priority }) {
  const map = {
    High: "bg-accent/30 text-accent-foreground border-accent/40",
    Medium: "bg-secondary text-secondary-foreground border-border",
    Low: "bg-muted text-muted-foreground border-border",
  } as const;
  return <span className={`text-xs px-2 py-0.5 rounded-full border ${map[p]}`}>{p}</span>;
}

function Editor({
  value,
  onClose,
  onSave,
}: {
  value: ServiceItem | Omit<ServiceItem, "id">;
  onClose: () => void;
  onSave: (v: ServiceItem | Omit<ServiceItem, "id">) => void;
}) {
  const [f, setF] = useState(value);
  const upd = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg w-full max-w-xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-xl">{"id" in f && f.id ? "Edit item" : "Add item"}</div>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label className="text-xs">Name</Label>
            <Input value={f.name} onChange={(e) => upd("name", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={f.kind} onValueChange={(v) => upd("kind", v as "Service" | "Product")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Service">Service</SelectItem>
                <SelectItem value="Product">Product</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Priority</Label>
            <Select value={f.priority} onValueChange={(v) => upd("priority", v as Priority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["High","Medium","Low"] as Priority[]).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Description</Label>
            <Textarea rows={2} value={f.description} onChange={(e) => upd("description", e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Target audience</Label>
            <Input value={f.targetAudience} onChange={(e) => upd("targetAudience", e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Location relevance</Label>
            <Input value={f.locationRelevance} onChange={(e) => upd("locationRelevance", e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(f)}>Save</Button>
        </div>
      </div>
    </div>
  );
}
