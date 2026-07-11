import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore, reloadWorkspaceForUser } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useT } from "@/i18n";
import type { Opportunity, PendingAction, PendingActionStatus, Project } from "@/lib/types";
import {
  filterPendingActions,
  pendingActionDiff,
  projectSetupView,
  projectSetupCounts,
  proposedFieldNames,
  effectivePendingStatus,
  canResolvePendingAction,
  type PendingActionsUiFilter,
  type ProfileChange,
} from "@/lib/pending-actions.ui";
import { resolvePendingActionFn, type ResolvePendingActionReason } from "@/lib/pending-actions.functions";
import { Bot, Check, ChevronDown, ChevronUp, Inbox, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

// Phase 1B.5 — owner resolution lives HERE and only here: the authenticated
// resolve server fn is the single approve/apply/reject path (Claude/MCP has
// no such tool). Controls render only for effectively-pending items.

export const Route = createFileRoute("/_authenticated/app/actions")({
  head: () => ({
    meta: [
      { title: "Pending Actions — Milo Growth" },
      { name: "description", content: "Review changes Claude has proposed. Nothing is applied until you approve it." },
    ],
  }),
  component: PendingActionsPage,
});

const STATUSES: (PendingActionStatus | "all")[] = ["all", "pending", "approved", "applied", "rejected", "expired"];

const STATUS_TONE: Record<PendingActionStatus, string> = {
  pending: "border-amber-600/40 bg-amber-500/5 text-amber-700",
  approved: "border-emerald-500/40 bg-emerald-500/5 text-emerald-600",
  applied: "border-emerald-500/40 bg-emerald-500/5 text-emerald-600",
  rejected: "border-border bg-secondary/60 text-muted-foreground",
  expired: "border-border bg-secondary/60 text-muted-foreground",
};

function PendingActionsPage() {
  const t = useT();
  const pendingActions = useStore((s) => s.pendingActions);
  const projects = useStore((s) => s.projects);
  const opportunities = useStore((s) => s.opportunities);
  const hydrated = useStore((s) => s.hydrated);

  const [status, setStatus] = useState<PendingActionsUiFilter["status"]>("all");
  const [projectId, setProjectId] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const nowMs = Date.now();
  const visible = useMemo(
    () => filterPendingActions(pendingActions, { status, projectId }, nowMs),
    [pendingActions, status, projectId, nowMs],
  );
  const projectName = (id: string) => projects.find((p) => p.id === id)?.businessName ?? id;

  return (
    <AppShell title={t("actions.title")} description={t("actions.description")}>
      <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-600/30 bg-amber-500/5 p-3 text-sm text-amber-800/90">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <span>{t("actions.safety")}</span>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={status} onValueChange={(v) => setStatus(v as PendingActionsUiFilter["status"])}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t("actions.filter.status")} /></SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s === "all" ? t("actions.filter.allStatuses") : t(`actions.status.${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-48"><SelectValue placeholder={t("actions.filter.project")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("actions.filter.allProjects")}</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.businessName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!hydrated ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center">
          <Inbox className="mx-auto h-8 w-8 text-muted-foreground/50" strokeWidth={1.4} />
          <div className="mt-3 text-sm font-medium">{t("actions.empty.title")}</div>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t("actions.empty.body")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((a) => (
            <PendingActionCard
              key={a.id}
              action={a}
              nowMs={nowMs}
              projectName={projectName(a.projectId)}
              opportunities={opportunities}
              projects={projects}
              expanded={expandedId === a.id}
              onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function PendingActionCard(props: {
  action: PendingAction;
  nowMs: number;
  projectName: string;
  opportunities: Opportunity[];
  projects: Project[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const { user } = useAuth();
  const { action, nowMs, projectName, opportunities, projects, expanded, onToggle } = props;
  const status = effectivePendingStatus(action, nowMs);
  const isSetup = action.type === "project_setup_proposal";
  const fields = proposedFieldNames(action);
  const setupCounts = isSetup ? projectSetupCounts(action) : null;
  const setupSummary = setupCounts
    ? [
        `${t("actions.detail.profile")} (${setupCounts.fields})`,
        `${t("actions.detail.servicesToCreate")} (${setupCounts.services})`,
        `${t("actions.detail.opportunitiesToCreate")} (${setupCounts.opportunities})`,
        ...(setupCounts.competitors ? [`${t("actions.detail.competitors")} (${setupCounts.competitors})`] : []),
      ].join(" · ")
    : "";
  const diff = expanded && !isSetup ? pendingActionDiff(action, opportunities) : null;
  const setup = expanded && isSetup ? projectSetupView(action, projects) : null;
  // The setup target project must exist to apply — block Approve (keep Reject)
  // when it is gone, rather than encourage an apply the server will reject.
  const setupTargetMissing = isSetup && !projects.some((p) => p.id === action.projectId);
  const date = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : "");
  const canResolve = canResolvePendingAction(action, nowMs);
  const [busy, setBusy] = useState<"approve_apply" | "reject" | null>(null);
  const [note, setNote] = useState("");

  async function resolve(resolution: "approve_apply" | "reject") {
    setBusy(resolution);
    try {
      const res = await resolvePendingActionFn({ data: { actionId: action.id, resolution, ...(resolution === "reject" && note.trim() ? { note: note.trim() } : {}) } });
      if (res.ok) {
        toast.success(resolution === "approve_apply" ? t("actions.resolve.appliedToast") : t("actions.resolve.rejectedToast"));
        // Reload server-authored state so the card reflects applied/rejected +
        // the mutated opportunity immediately (hydrateForUser would no-op here
        // because the user is already hydrated — that was the stuck-card bug).
        if (user?.id) await reloadWorkspaceForUser(user.id);
      } else {
        toast.error(t(`actions.resolve.error.${(res.reason ?? "error") as ResolvePendingActionReason}`));
      }
    } catch {
      toast.error(t("actions.resolve.error.error"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Bot className="h-4 w-4 text-gold/80" strokeWidth={1.6} />
        <span className="font-medium">{action.title}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_TONE[status]}`}>{t(`actions.status.${status}`)}</span>
        <span className="rounded-full border border-amber-600/40 bg-amber-500/5 px-2 py-0.5 text-[11px] text-amber-700">
          {t(`actions.risk.${action.riskLevel}`)}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">{action.summary}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{t("actions.card.project")}: <span className="text-foreground/80">{projectName}</span></span>
        <span>{t("actions.card.type")}: <span className="text-foreground/80">{t(`actions.type.${action.type}`)}</span></span>
        {isSetup ? (
          <span className="text-foreground/80">{setupSummary}</span>
        ) : (
          <span>{t("actions.card.fields")}: <span className="font-mono text-foreground/80">{fields.join(", ") || "—"}</span></span>
        )}
        <span>{t("actions.card.created")}: {date(action.createdAt)}</span>
        {action.expiresAt ? <span>{t("actions.card.expires")}: {date(action.expiresAt)}</span> : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex items-center gap-1 text-xs text-gold hover:underline"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? t("actions.card.hideDetail") : t("actions.card.showDetail")}
        </button>

        {canResolve ? (
          <div className="ml-auto flex gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={busy !== null || setupTargetMissing} title={setupTargetMissing ? t("actions.detail.projectMissing") : undefined}>
                  <Check className="h-3.5 w-3.5" /> {t("actions.resolve.approve")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("actions.resolve.approveTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {isSetup ? t("actions.resolve.approveBodySetup") : t("actions.resolve.approveBody")}
                    <span className={`mt-2 block text-xs text-foreground/80 ${isSetup ? "" : "font-mono"}`}>
                      {isSetup ? setupSummary : fields.join(", ") || "—"}
                    </span>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => resolve("approve_apply")}>{t("actions.resolve.approve")}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={busy !== null} className="text-muted-foreground hover:text-destructive">
                  <X className="h-3.5 w-3.5" /> {t("actions.resolve.reject")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("actions.resolve.rejectTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("actions.resolve.rejectBody")}</AlertDialogDescription>
                </AlertDialogHeader>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  placeholder={t("actions.resolve.notePlaceholder")}
                  className="min-h-20"
                />
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => resolve("reject")}>{t("actions.resolve.rejectConfirm")}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : action.resolution ? (
          <span className="ml-auto text-xs text-muted-foreground">
            {t(`actions.status.${status}`)} · {date(action.resolution.resolvedAt)}
            {action.resolution.note ? <> · “{action.resolution.note}”</> : null}
          </span>
        ) : null}
      </div>

      {expanded ? (
        <div className="mt-3 rounded-md border border-border bg-secondary/30 p-3">
          {isSetup && setup ? (
            <div className="space-y-3">
              {!setup.targetExists ? (
                <div role="status" className="flex items-center gap-1.5 text-xs text-amber-700">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0" /> {t("actions.detail.projectMissing")}
                </div>
              ) : null}

              <SetupSection label={`${t("actions.detail.profile")} (${setup.profile.length})`} empty={setup.profile.length === 0} emptyLabel={t("actions.detail.none")}>
                <div className="overflow-x-auto">
                  <table className="mt-1 w-full text-xs">
                    <thead className="text-left uppercase tracking-[0.14em] text-[10px] text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-3 font-medium">{t("actions.detail.field")}</th>
                        <th className="py-1 pr-3 font-medium">{t("actions.detail.current")}</th>
                        <th className="py-1 font-medium">{t("actions.detail.proposed")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {setup.profile.map((r) => (
                        <tr key={r.field} className="border-t border-border/60 align-top">
                          <td className="py-1.5 pr-3 font-mono">
                            {r.field}
                            {setup.targetExists ? <StateMarker change={r.change} t={t} /> : null}
                          </td>
                          <td className="py-1.5 pr-3 text-muted-foreground break-words">{r.current ? r.current : "—"}</td>
                          <td className="py-1.5 text-foreground/90 break-words">{r.proposed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SetupSection>

              <SetupSection label={`${t("actions.detail.servicesToCreate")} (${setup.services.length})`} empty={setup.services.length === 0} emptyLabel={t("actions.detail.none")}>
                <ul className="mt-1 space-y-0.5 text-xs text-foreground/85">
                  {setup.services.map((s, i) => (
                    <li key={i} className="break-words">
                      {s.name}
                      {s.kind || s.priority ? <span className="text-muted-foreground"> ({[s.kind, s.priority].filter(Boolean).join(", ")})</span> : null}
                    </li>
                  ))}
                </ul>
              </SetupSection>

              <SetupSection label={`${t("actions.detail.opportunitiesToCreate")} (${setup.opportunities.length})`} empty={setup.opportunities.length === 0} emptyLabel={t("actions.detail.none")}>
                <ul className="mt-1 space-y-0.5 text-xs text-foreground/85">
                  {setup.opportunities.map((o, i) => (
                    <li key={i} className="break-words">
                      {o.title}
                      {o.contentType || o.priority ? <span className="text-muted-foreground"> ({[o.contentType, o.priority].filter(Boolean).join(", ")})</span> : null}
                    </li>
                  ))}
                </ul>
              </SetupSection>

              {setup.services.length || setup.opportunities.length ? (
                <p className="text-[11px] text-muted-foreground">{t("actions.detail.createDisclaimer")}</p>
              ) : null}

              <SetupSection
                label={`${t("actions.detail.competitors")} (${setup.competitors.urls.length})`}
                empty={setup.competitors.urls.length === 0}
                emptyLabel={t("actions.detail.none")}
                marker={setup.competitors.provided && setup.targetExists ? <StateMarker change={setup.competitors.change} t={t} /> : undefined}
              >
                {/* Plain text — untrusted proposal content is never rendered as a link. */}
                <ul className="mt-1 space-y-0.5 text-xs text-foreground/80">
                  {setup.competitors.urls.map((u, i) => (
                    <li key={i} className="break-all">{u}</li>
                  ))}
                </ul>
              </SetupSection>
            </div>
          ) : diff ? (
            <>
              <div className="text-xs text-muted-foreground">
                {t("actions.detail.target")}: <span className="font-mono text-foreground/80">{diff.opportunityId}</span>
              </div>
              {!diff.targetExists ? (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
                  <TriangleAlert className="h-3.5 w-3.5" /> {t("actions.detail.targetMissing")}
                </div>
              ) : null}
              <table className="mt-2 w-full text-xs">
                <thead className="text-left uppercase tracking-[0.14em] text-[10px] text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">{t("actions.detail.field")}</th>
                    <th className="py-1 pr-3 font-medium">{t("actions.detail.current")}</th>
                    <th className="py-1 font-medium">{t("actions.detail.proposed")}</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.rows.map((r) => (
                    <tr key={r.field} className="border-t border-border/60 align-top">
                      <td className="py-1.5 pr-3 font-mono">{r.field}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{r.current ?? "—"}</td>
                      <td className="py-1.5 text-foreground/90">{r.proposed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}

          {action.preview ? (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{t("actions.detail.preview")}</div>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-2 text-xs text-foreground/85">{action.preview}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** A labelled section in the project-setup detail; shows an empty label when
 * the group has no items (counts stay visible for omitted/empty sections). */
function SetupSection(props: { label: string; empty: boolean; emptyLabel: string; marker?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {props.label}
        {props.marker}
      </div>
      {props.empty ? <div className="mt-1 text-xs text-muted-foreground">{props.emptyLabel}</div> : props.children}
    </div>
  );
}

/** Textual add/overwrite/no-change label (never color-only). Amber = overwrite,
 * emerald = add, muted = no change. */
function StateMarker({ change, t }: { change: ProfileChange; t: (k: string) => string }) {
  const m =
    change === "overwrite"
      ? { label: t("actions.detail.overwrite"), cls: "bg-amber-500/10 text-amber-700" }
      : change === "add"
        ? { label: t("actions.detail.stateAdd"), cls: "bg-emerald-500/10 text-emerald-600" }
        : { label: t("actions.detail.stateNone"), cls: "bg-secondary text-muted-foreground" };
  return <span className={`rounded px-1 py-0.5 font-sans text-[9px] normal-case ${m.cls}`}>{m.label}</span>;
}
