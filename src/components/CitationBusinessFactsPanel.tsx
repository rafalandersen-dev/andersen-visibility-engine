import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "@/i18n";
import { Button } from "./ui/button";
import {
  readCitationBusinessFactsFn,
  removeCitationBusinessFactFn,
  saveCitationBusinessFactFn,
} from "@/lib/citation-business-fact.functions";
import {
  FACT_KINDS,
  correctionDraftFrom,
  factChains,
  factDraftToRecord,
  factErrorKey,
  newFactDraft,
  type FactDraft,
  type FactIssue,
} from "@/lib/citation-business-fact-ui";

const field = "mt-1 h-9 w-full rounded border border-border bg-background px-2 text-sm";
const chip =
  "text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border border-border text-muted-foreground";

/** Owner list / create / correct (new version) / delete of dated business facts over the released P3 fact
 * functions with the additive expected-head guard (inspected version + immutable head row id). The server stamps
 * confirmer and time; the owner declares the validity interval. A failed save keeps the form exactly as typed.
 * The draft is bound to the owner+project identity it was started in: after a project switch it is neither
 * displayed nor submitted under the new project. */
export function CitationBusinessFactsPanel({
  projectId,
  ownerId,
}: {
  projectId: string;
  ownerId: string;
}) {
  const t = useT();
  const qc = useQueryClient();
  const scope = { projectId, expectedOwnerId: ownerId };
  const identity = `${ownerId.toLowerCase()}:${projectId}`;
  const facts = useQuery({
    queryKey: ["citation-business-facts", ownerId, projectId],
    queryFn: () => readCitationBusinessFactsFn({ data: scope }),
    staleTime: 0,
    retry: false,
  });
  const chains = useMemo(() => factChains(facts.data?.facts ?? []), [facts.data]);
  const [draftState, setDraftState] = useState<{ identity: string; draft: FactDraft | null }>({
    identity,
    draft: null,
  });
  const draft = draftState.identity === identity ? draftState.draft : null;
  const setDraft = (next: FactDraft | null) => setDraftState({ identity, draft: next });
  // LIVE identity for async continuations (the route-level key remount is the production guard; this is the
  // in-instance fallback the save closure compares against, not its own captured props).
  const liveIdentity = useRef(identity);
  liveIdentity.current = identity;
  const [issues, setIssues] = useState<FactIssue[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{
    tone: "ok" | "error";
    key: string;
    vars?: Record<string, string | number>;
  } | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["citation-business-facts", ownerId, projectId] });

  async function save() {
    if (!draft || busy) return;
    const built = factDraftToRecord(draft, ownerId, new Date().toISOString());
    if (!built.ok) {
      setIssues(built.issues);
      return;
    }
    setBusy(true);
    setIssues([]);
    setMsg(null);
    const startedFor = identity;
    try {
      const saved = await saveCitationBusinessFactFn({
        data: {
          ...scope,
          fact: built.fact,
          expectedVersion: draft.expectedVersion,
          expectedHeadId: draft.expectedHeadId,
        },
      });
      if (liveIdentity.current !== startedFor) return; // late result from a previous scope
      setMsg({
        tone: "ok",
        key: "citationAuthoring.facts.saved",
        vars: { version: saved.version },
      });
      setDraft(null);
      await refresh();
    } catch (e) {
      if (liveIdentity.current !== startedFor) return;
      // The draft stays as typed; the server outcome is worded, never the raw code.
      setMsg({
        tone: "error",
        key: `citationAuthoring.factError.${factErrorKey(e instanceof Error ? e.message : "")}`,
      });
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await removeCitationBusinessFactFn({ data: { ...scope, id } });
      await refresh();
    } catch {
      setMsg({ tone: "error", key: "citationAuthoring.factError.unavailable" });
    } finally {
      setBusy(false);
    }
  }
  const upd = (patch: Partial<FactDraft>) =>
    setDraftState((s) =>
      s.identity === identity && s.draft ? { identity, draft: { ...s.draft, ...patch } } : s,
    );

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <header className="space-y-1">
        <h3 className="font-display text-lg">{t("citationAuthoring.facts.title")}</h3>
        <p className="text-xs text-muted-foreground max-w-3xl">
          {t("citationAuthoring.facts.intro")}
        </p>
      </header>
      {facts.isError ? (
        <p className="text-sm text-destructive">{t("citationAuthoring.facts.error")}</p>
      ) : facts.isPending ? (
        <p className="text-sm text-muted-foreground">{t("citationAuthoring.common.loading")}</p>
      ) : chains.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("citationAuthoring.facts.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {chains.map((c) => (
            <li key={c.factId} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={chip}>{t(`citationAuthoring.kind.${c.head.record.kind}`)}</span>
                <span className="font-medium">{c.head.record.value}</span>
                <span className={chip}>
                  {t("citationAuthoring.facts.version", { version: c.head.version })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {c.head.record.validFrom.slice(0, 10)} →{" "}
                  {c.head.record.validUntil?.slice(0, 10) ?? t("citationAuthoring.facts.openEnded")}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {t("citationAuthoring.facts.confirmed", {
                    date: c.head.record.confirmedAt.slice(0, 10),
                  })}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setIssues([]);
                    setMsg(null);
                    setDraft(correctionDraftFrom(c.head));
                  }}
                >
                  {t("citationAuthoring.facts.correct")}
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => remove(c.head.id)}>
                  {t("citationAuthoring.facts.removeVersion")}
                </Button>
                {c.versions.length > 1 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-expanded={openHistory === c.factId}
                    onClick={() => setOpenHistory((o) => (o === c.factId ? null : c.factId))}
                  >
                    {t("citationAuthoring.facts.history")} ({c.versions.length - 1})
                  </Button>
                ) : null}
              </div>
              {openHistory === c.factId ? (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {c.versions.slice(1).map((v) => (
                    <li key={v.id}>
                      {t("citationAuthoring.facts.version", { version: v.version })} ·{" "}
                      {v.record.value} · {v.record.validFrom.slice(0, 10)} →{" "}
                      {v.record.validUntil?.slice(0, 10) ?? t("citationAuthoring.facts.openEnded")}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {!draft ? (
        <Button
          size="sm"
          variant="outline"
          disabled={busy || facts.isPending}
          onClick={() => {
            setIssues([]);
            setMsg(null);
            setDraft(newFactDraft(crypto.randomUUID()));
          }}
        >
          {t("citationAuthoring.facts.new")}
        </Button>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset className="grid gap-3 sm:grid-cols-4" disabled={busy}>
            <label className="text-sm">
              {t("citationAuthoring.facts.kind")}
              <select
                className={field}
                value={draft.kind}
                disabled={draft.expectedVersion > 0}
                onChange={(e) => upd({ kind: e.target.value as FactDraft["kind"] })}
              >
                {FACT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`citationAuthoring.kind.${k}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm sm:col-span-3">
              {t("citationAuthoring.facts.value")}
              <input
                className={field}
                maxLength={1000}
                required
                value={draft.value}
                onChange={(e) => upd({ value: e.target.value })}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              {t("citationAuthoring.facts.validFrom")}
              <input
                className={field}
                type="datetime-local"
                required
                value={draft.validFrom}
                onChange={(e) => upd({ validFrom: e.target.value })}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              {t("citationAuthoring.facts.validUntil")}
              <input
                className={field}
                type="datetime-local"
                value={draft.validUntil}
                onChange={(e) => upd({ validUntil: e.target.value })}
              />
            </label>
          </fieldset>
          {issues.length ? (
            <ul className="text-xs text-destructive list-disc pl-4">
              {issues.map((i) => (
                <li key={i}>{t(`citationAuthoring.factIssue.${i}`)}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="submit" disabled={busy}>
              {draft.expectedVersion > 0
                ? t("citationAuthoring.facts.saveCorrection", {
                    version: draft.expectedVersion + 1,
                  })
                : t("citationAuthoring.facts.save")}
            </Button>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setDraft(null)}
            >
              {t("citationAuthoring.common.cancel")}
            </Button>
          </div>
        </form>
      )}
      {msg ? (
        <p className={`text-xs ${msg.tone === "ok" ? "text-emerald-600" : "text-destructive"}`}>
          {t(msg.key, msg.vars)}
        </p>
      ) : null}
    </section>
  );
}
