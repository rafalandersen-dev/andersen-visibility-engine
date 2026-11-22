import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateProject, saveWorkspaceNow, getState } from "@/lib/store";
import { useAppLanguage, useT } from "@/i18n";
import {
  EMPTY_CHATGPT_FORM,
  GA4_BOOKING_COMPLETED_EVENT,
  GA4_CHATGPT_SESSION_SOURCES,
  MAX_DISCOVERY_TOPICS,
  applyBusinessHubPaste,
  buildChatGptReport,
  chatGptPeriodStart,
  chatGptReportToForm,
  normalizeChatGptReports,
  parseBusinessHubPaste,
  removeChatGptReport,
  upsertChatGptReport,
  type ChatGptReportError,
  type ChatGptReportForm,
  type HubPasteField,
} from "@/lib/chatgpt-channel";
import type { ChatGptChannelReport, ChatGptCount, Project } from "@/lib/types";
import { Ga4ChannelSync } from "@/components/Ga4ChannelSync";
import { Bot, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const ERROR_KEYS: Record<ChatGptReportError | "capacity", string> = {
  period: "chatGptChannel.errPeriod",
  future: "chatGptChannel.errFuture",
  count: "chatGptChannel.errCount",
  topics: "chatGptChannel.errTopics",
  empty: "chatGptChannel.errEmpty",
  capacity: "chatGptChannel.errCapacity",
};

const labelCls = "text-xs uppercase tracking-[0.16em] text-muted-foreground";

export function ChatGptChannel({ project }: { project: Project }) {
  return <ChatGptChannelContent key={project.id} project={project} />;
}

function ChatGptChannelContent({ project }: { project: Project }) {
  const t = useT();
  const locale = useAppLanguage();
  const reports = useMemo(
    () => normalizeChatGptReports(project.chatGptReports),
    [project.chatGptReports],
  );
  const [form, setForm] = useState<ChatGptReportForm>(EMPTY_CHATGPT_FORM);
  const [editing, setEditing] = useState<ChatGptChannelReport | null>(null);
  const [saving, setSaving] = useState(false);
  const [paste, setPaste] = useState("");
  const [pasteNotes, setPasteNotes] = useState<string[]>([]);
  const latest = reports[0];
  const periodStart = chatGptPeriodStart(form.periodEnd);
  const set = (patch: Partial<ChatGptReportForm>) => setForm((f) => ({ ...f, ...patch }));
  const fmt = (v: ChatGptCount) =>
    v === null ? t("chatGptChannel.unknown") : v.toLocaleString(locale);

  function resetForm() {
    setForm(EMPTY_CHATGPT_FORM);
    setEditing(null);
    setPasteNotes([]);
  }

  // Parsed in the browser only; the pasted text is never saved or sent.
  function onPaste() {
    const res = applyBusinessHubPaste(form, parseBusinessHubPaste(paste));
    const names = (fields: HubPasteField[]) =>
      fields.map((f) => t(f === "mentions" ? "chatGptChannel.mentions" : "chatGptChannel.clicks")).join(", ");
    if (
      res.replaced.length &&
      !window.confirm(t("chatGptChannel.paste.replacePrompt", { fields: names(res.replaced) }))
    )
      return;
    setForm(res.form);
    setPaste("");
    setPasteNotes([
      ...(res.filled.length ? [t("chatGptChannel.paste.filled", { fields: names(res.filled) })] : []),
      ...(res.missing.length ? [t("chatGptChannel.paste.missing", { fields: names(res.missing) })] : []),
      ...(res.unreadable.length
        ? [t("chatGptChannel.paste.unreadable", { fields: names(res.unreadable) })]
        : []),
    ]);
  }

  async function persist(next: ChatGptChannelReport[]) {
    const state = getState();
    if (!state.hydrated || !state.userId || state.activeProjectId !== project.id)
      throw new Error("Workspace changed");
    updateProject(project.id, { chatGptReports: next.length ? next : undefined });
    await saveWorkspaceNow();
  }

  async function onSave() {
    const built = buildChatGptReport(form, new Date());
    if (!built.ok) {
      toast.error(t(ERROR_KEYS[built.error], { max: MAX_DISCOVERY_TOPICS }));
      return;
    }
    // Read the live project so a concurrent edit elsewhere is not overwritten.
    const current = getState().projects.find((p) => p.id === project.id);
    if (!current) return;
    const res = upsertChatGptReport(normalizeChatGptReports(current.chatGptReports), built.report);
    if (!res.ok) {
      toast.error(t(ERROR_KEYS[res.error]));
      return;
    }
    if (res.replaced && !editing && !window.confirm(t("chatGptChannel.replacePrompt"))) return;
    setSaving(true);
    try {
      await persist(res.reports);
      resetForm();
      toast.success(t(res.replaced ? "chatGptChannel.updated" : "chatGptChannel.saved"));
    } catch {
      toast.error(t("chatGptChannel.errSave"));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    const current = getState().projects.find((p) => p.id === project.id);
    if (!current || !window.confirm(t("chatGptChannel.deletePrompt"))) return;
    setSaving(true);
    try {
      await persist(removeChatGptReport(normalizeChatGptReports(current.chatGptReports), id));
      if (editing?.id === id) resetForm();
      toast.success(t("chatGptChannel.deleted"));
    } catch {
      toast.error(t("chatGptChannel.errSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-gold/80" />
        <h2 className="font-display text-lg">{t("chatGptChannel.title")}</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground max-w-3xl">{t("chatGptChannel.subtitle")}</p>
      <p className="mt-1 text-xs text-muted-foreground max-w-3xl">
        {t("chatGptChannel.manualNote")}
      </p>

      <div className="mt-4">
        <Ga4ChannelSync project={project} />
      </div>

      <div className="mt-4 space-y-4 rounded-lg border border-border bg-background/40 p-4">
        {editing ? (
          <p className="text-xs text-amber-600">
            {t("chatGptChannel.editing", {
              start: editing.periodStart,
              end: editing.periodEnd,
            })}
          </p>
        ) : null}
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            {t("chatGptChannel.periodEnd")}
            <Input
              type="date"
              className="mt-1.5 w-48"
              value={form.periodEnd}
              disabled={saving || !!editing}
              onChange={(e) => set({ periodEnd: e.target.value })}
            />
          </label>
          <p className="pb-2 text-xs text-muted-foreground">
            {periodStart
              ? t("chatGptChannel.periodRange", {
                  start: periodStart,
                  end: form.periodEnd,
                })
              : t("chatGptChannel.periodPending")}
          </p>
        </div>

        <fieldset className="space-y-2" disabled={saving}>
          <legend className="text-sm font-medium">
            <a
              className="underline"
              href="https://chatgpt.com/business-hub"
              target="_blank"
              rel="noreferrer"
            >
              {t("chatGptChannel.hubHeading")}
            </a>
          </legend>
          <p className="text-xs text-muted-foreground">{t("chatGptChannel.hubHelp")}</p>
          <details className="rounded-md border border-dashed border-border bg-muted/40 p-3">
            <summary className="cursor-pointer text-xs font-medium">
              {t("chatGptChannel.paste.title")}
            </summary>
            <p className="mt-1 text-xs text-muted-foreground">{t("chatGptChannel.paste.help")}</p>
            <label className="mt-2 block text-xs">
              {t("chatGptChannel.paste.label")}
              <textarea
                rows={4}
                className="mt-1.5 block w-full max-w-xl rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
              />
            </label>
            <p className="mt-2 text-xs text-amber-600">{t("chatGptChannel.paste.verifyPeriod")}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={!paste.trim()}
              onClick={onPaste}
            >
              {t("chatGptChannel.paste.apply")}
            </Button>
            {pasteNotes.length ? (
              <ul className="mt-2 space-y-1 text-xs" aria-live="polite">
                {pasteNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
          </details>
          <div className="flex flex-wrap gap-3">
            <CountField
              label={t("chatGptChannel.mentions")}
              value={form.mentions}
              onChange={(mentions) => set({ mentions })}
            />
            <CountField
              label={t("chatGptChannel.clicks")}
              value={form.clicks}
              onChange={(clicks) => set({ clicks })}
            />
          </div>
          <label className="block text-xs">
            {t("chatGptChannel.topics")}
            <textarea
              rows={3}
              className="mt-1.5 block w-full max-w-xl rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.topics}
              onChange={(e) => set({ topics: e.target.value })}
            />
            <span className="text-muted-foreground">
              {t("chatGptChannel.topicsHelp", { max: MAX_DISCOVERY_TOPICS })}
            </span>
          </label>
        </fieldset>

        <fieldset className="space-y-2" disabled={saving}>
          <legend className="text-sm font-medium">{t("chatGptChannel.ga4Heading")}</legend>
          <details className="rounded-md border border-dashed border-border bg-muted/40 p-3">
            <summary className="cursor-pointer text-xs font-medium">
              {t("chatGptChannel.ga4GuideTitle")}
            </summary>
            <ol className="mt-1 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
              <li>{t("chatGptChannel.ga4Step1")}</li>
              <li>{t("chatGptChannel.ga4Step2")}</li>
              <li>{t("chatGptChannel.ga4Step3")}</li>
              <li>{t("chatGptChannel.ga4Step4")}</li>
            </ol>
            <p className="mt-2 font-mono text-[11px] text-foreground/80">
              {GA4_CHATGPT_SESSION_SOURCES.join(" · ")} · {GA4_BOOKING_COMPLETED_EVENT}
            </p>
          </details>
          <div className="flex flex-wrap gap-3">
            <CountField
              label={t("chatGptChannel.sessions")}
              value={form.sessions}
              onChange={(sessions) => set({ sessions })}
            />
            <CountField
              label={t("chatGptChannel.bookingClicks")}
              value={form.bookingClicks}
              onChange={(bookingClicks) => set({ bookingClicks })}
            />
            <CountField
              label={t("chatGptChannel.bookingCompleted")}
              value={form.bookingCompleted}
              onChange={(bookingCompleted) => set({ bookingCompleted })}
            />
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editing ? t("chatGptChannel.update") : t("chatGptChannel.save")}
          </Button>
          {editing ? (
            <Button variant="ghost" onClick={resetForm} disabled={saving}>
              {t("chatGptChannel.cancelEdit")}
            </Button>
          ) : null}
        </div>
      </div>

      {!latest ? (
        <p className="mt-5 text-sm text-muted-foreground">{t("chatGptChannel.empty")}</p>
      ) : (
        <div className="mt-6 space-y-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              {t("chatGptChannel.latest")}
            </div>
            <p className="mt-1 text-xs">
              {t("chatGptChannel.periodRange", {
                start: latest.periodStart,
                end: latest.periodEnd,
              })}
            </p>
          </div>
          <div>
            <div className="mb-2 text-xs text-muted-foreground">
              {t("chatGptChannel.sourceHub")}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Stat label={t("chatGptChannel.mentions")} value={fmt(latest.businessHub.mentions)} />
              <Stat label={t("chatGptChannel.clicks")} value={fmt(latest.businessHub.clicks)} />
              <Stat
                label={t("chatGptChannel.topics")}
                value={
                  latest.businessHub.discoveryTopics.join(" · ") || t("chatGptChannel.noTopics")
                }
                small
              />
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs text-muted-foreground">
              {t("chatGptChannel.sourceGa4")}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Stat label={t("chatGptChannel.sessions")} value={fmt(latest.ga4.chatgptSessions)} />
              <Stat
                label={t("chatGptChannel.bookingClicks")}
                value={fmt(latest.ga4.bookingClicks)}
              />
              <Stat
                label={t("chatGptChannel.bookingCompleted")}
                value={fmt(latest.ga4.bookingCompleted)}
              />
            </div>
          </div>
          {latest.ga4Api ? (
            <div>
              <div className="mb-2 text-xs text-muted-foreground">
                {t("chatGptChannel.sourceGa4Api", {
                  name: latest.ga4Api.propertyName,
                  start: latest.periodStart,
                  end: latest.periodEnd,
                  tz: latest.ga4Api.timeZone,
                  date: latest.ga4Api.fetchedAt.slice(0, 10),
                })}
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Stat label={t("chatGptChannel.sessions")} value={fmt(latest.ga4Api.chatgptSessions)} />
                <Stat label={t("chatGptChannel.bookingClicks")} value={fmt(latest.ga4Api.bookingClicks)} />
                <Stat
                  label={t("chatGptChannel.bookingCompleted")}
                  value={fmt(latest.ga4Api.bookingCompleted)}
                />
              </div>
              {latest.ga4Api.partial ? (
                <p className="mt-2 text-xs text-amber-600">{t("chatGptChannel.api.partial")}</p>
              ) : null}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">{t("chatGptChannel.separateNote")}</p>

          <div>
            <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              {t("chatGptChannel.history")}
            </div>
            <ul className="space-y-1.5">
              {reports.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-medium">
                      {r.periodStart} → {r.periodEnd}
                    </span>
                    {r.updatedAt ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t("chatGptChannel.updatedOn", { date: r.updatedAt.slice(0, 10) })}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      disabled={saving}
                      aria-label={t("chatGptChannel.edit")}
                      onClick={() => {
                        setForm(chatGptReportToForm(r));
                        setEditing(r);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      disabled={saving}
                      aria-label={t("chatGptChannel.delete")}
                      onClick={() => onDelete(r.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

function CountField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-xs">
      <span className={labelCls}>{label}</span>
      <Input
        inputMode="numeric"
        className="mt-1.5 w-44"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-display text-foreground ${small ? "text-sm" : "text-2xl"}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
