import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "@/i18n";
import { Button } from "./ui/button";
import {
  getImprovementForInspectionFn,
  saveImprovementInspectionFn,
} from "@/lib/citation-change.functions";
import { changeErrorKey, type InspectionView } from "@/lib/citation-change";

const chip =
  "inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground";
type Check = "shows_approved_content" | "does_not_show" | "inconclusive";
/** One frozen inspection request: built when the inspector first records, re-sent unchanged on retry (the
 * server replays the identical digest), discarded on a result change or a fresh view. */
interface FrozenRequest {
  checkResult: Check | "withdrawn";
  observedAt: string | null;
  expectedSha: string;
  expectedVersion: number;
  expectedHeadId: string | null;
}

/**
 * The assigned INSPECTOR's surface (candidate 20260928120000): a masked read of ONE improvement row — the
 * exact destination reference, the approved version identity, the approved content (publication snapshot or the
 * artifact's enumerated fields), whether the performer/approver identities are known (independence), the bound
 * findings' public summary and the inspector's OWN chain. Recording is a head/replacement chain: every write
 * names the reviewed head; a withdrawal is a new head; an ineffective head (re-granted assignment, changed
 * authority, lost independence) asks for a FRESH inspection. Opening the reference attests nothing.
 */
export function CitationInspectionPanel({
  ownerId,
  projectId,
  improvementRowId,
  actorId,
}: {
  ownerId: string;
  projectId: string;
  improvementRowId: string;
  actorId: string;
}) {
  const t = useT();
  const qc = useQueryClient();
  const target = { ownerId, projectId, improvementRowId };
  const view = useQuery({
    queryKey: ["citation-inspection-view", actorId, ownerId, projectId, improvementRowId],
    queryFn: () => getImprovementForInspectionFn({ data: target }),
    staleTime: 0,
    retry: false,
  });
  const [checkResult, setCheckResult] = useState<Check | "">("");
  const [pending, setPending] = useState<FrozenRequest | null>(null);
  const [note, setNote] = useState<{
    tone: "ok" | "error";
    key: string;
    vars?: Record<string, string | number>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setCheckResult("");
    setPending(null);
    setNote(null);
  }, [improvementRowId, actorId]);

  async function send(request: FrozenRequest) {
    setBusy(true);
    setNote(null);
    try {
      const saved = await saveImprovementInspectionFn({
        data: { ...target, ...request },
      });
      setPending(null);
      setNote(
        saved.checkResult === "withdrawn"
          ? { tone: "ok", key: "citationChange.inspect.withdrawnDone" }
          : {
              tone: "ok",
              key: "citationChange.inspect.recorded",
              vars: { version: saved.version },
            },
      );
      await qc.invalidateQueries({
        queryKey: ["citation-inspection-view", actorId, ownerId, projectId, improvementRowId],
      });
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setNote({ tone: "error", key: changeErrorKey(code) });
      if (code === "citation_inspection_version_conflict" || code === "citation_inspection_stale") {
        setPending(null);
        void qc.invalidateQueries({
          queryKey: ["citation-inspection-view", actorId, ownerId, projectId, improvementRowId],
        });
      }
    } finally {
      setBusy(false);
    }
  }
  function record(v: InspectionView) {
    if (!checkResult || busy) return;
    const request: FrozenRequest = pending ?? {
      checkResult,
      observedAt: new Date().toISOString(),
      expectedSha: v.expectedSha,
      expectedVersion: v.myHead?.version ?? 0,
      expectedHeadId: v.myHead?.id ?? null,
    };
    setPending(request);
    void send(request);
  }
  function withdraw(v: InspectionView) {
    if (!v.myHead || busy) return;
    const request: FrozenRequest = {
      checkResult: "withdrawn",
      observedAt: null,
      expectedSha: v.expectedSha,
      expectedVersion: v.myHead.version,
      expectedHeadId: v.myHead.id,
    };
    setPending(request);
    void send(request);
  }

  const v = view.data;
  const isUrl = !!v?.destinationReference && /^https?:\/\//.test(v.destinationReference);
  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4 text-xs">
      <header className="space-y-1">
        <h3 className="font-display text-lg">{t("citationChange.inspect.title")}</h3>
        <p className="text-muted-foreground max-w-3xl">{t("citationChange.inspect.intro")}</p>
      </header>
      {view.isError ? (
        <div className="rounded-lg border border-dashed border-destructive/40 p-4 text-destructive">
          {t("citationChange.inspect.loadError")}
        </div>
      ) : !v ? (
        <p className="text-muted-foreground">{t("citationForward.common.loading")}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className={chip}>{v.improvementId.slice(0, 8)}</span>
            <span className={chip}>
              {t("citationForward.improvement.version", { version: v.version })}
            </span>
            <span className={chip}>
              {v.kind === "public_url"
                ? t("citationChange.inspect.kindPublic")
                : v.kind
                  ? t(`citationChange.artifact.kind.${v.kind}`)
                  : "—"}
            </span>
          </div>
          <div>
            <span className="font-medium text-foreground/70">
              {t("citationChange.inspect.reference")}:{" "}
            </span>
            {v.destinationReference ?? "—"}{" "}
            {isUrl ? (
              <a
                className="underline"
                href={v.destinationReference!}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("citationChange.inspect.open")}
              </a>
            ) : null}
          </div>
          <div>
            <span className="font-medium text-foreground/70">
              {t("citationChange.inspect.approvedVersion")}:{" "}
            </span>
            {v.approvedVersion ? v.approvedVersion.slice(0, 16) : "—"}
            {v.approval.approvedAt ? ` · ${v.approval.approvedAt.slice(0, 19)}` : null}
          </div>
          <div className="space-y-1">
            <span className="font-medium text-foreground/70">
              {t("citationChange.inspect.approvedContent")}
            </span>
            {!v.approvedContent ? (
              <p className="text-muted-foreground">{t("citationChange.inspect.noContent")}</p>
            ) : "markdown" in v.approvedContent ? (
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border p-2 text-[11px]">
                {v.approvedContent.markdown}
              </pre>
            ) : (
              <table className="w-full max-w-full text-[11px]">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pr-2">{t("citationChange.artifact.fieldKey")}</th>
                    <th className="pr-2">{t("citationChange.artifact.before")}</th>
                    <th>{t("citationChange.artifact.after")}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(v.approvedContent.fields).map(([k, f]) => (
                    <tr key={k}>
                      <td className="pr-2 align-top">{k}</td>
                      <td className="pr-2 align-top break-words">{f.before ?? "—"}</td>
                      <td className="align-top break-words">{f.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="space-y-1">
            <span className="font-medium text-foreground/70">
              {t("citationChange.inspect.boundFindings")}
            </span>
            <ul className="ml-4 list-disc">
              {v.boundFindings.map((f) => (
                <li key={`${f.findingId}:${f.version}`}>
                  {f.findingId.slice(0, 8)} v{f.version} · {f.family} · {f.decision}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <span className="font-medium text-foreground/70">
              {t("citationChange.inspect.identity")}:{" "}
            </span>
            {v.independenceAvailable ? (
              <span data-independence="available">{t("citationChange.assign.effective")}</span>
            ) : (
              <span className="text-destructive" data-independence="unavailable">
                {t("citationChange.inspect.identityUnavailable")}
              </span>
            )}
          </div>
          {v.myHead && !v.myHead.effective && v.myHead.ineffectiveReason ? (
            <p className="text-amber-700" data-fresh-needed={v.myHead.ineffectiveReason}>
              {t("citationChange.inspect.fresh", {
                reason: t(`citationChange.inspect.reason.${v.myHead.ineffectiveReason}`),
              })}
            </p>
          ) : null}
          {v.independenceAvailable ? (
            <fieldset className="space-y-1">
              <legend className="font-medium text-foreground/70">
                {t("citationChange.inspect.result")}
              </legend>
              {(["shows_approved_content", "does_not_show", "inconclusive"] as const).map((r) => (
                <label key={r} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="independent-inspection-result"
                    value={r}
                    checked={checkResult === r}
                    disabled={busy}
                    onChange={() => {
                      setCheckResult(r);
                      setPending(null);
                      setNote(null);
                    }}
                  />
                  <span>{t(`citationChange.inspect.${r}`)}</span>
                </label>
              ))}
            </fieldset>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!checkResult || busy || !v.independenceAvailable}
              onClick={() => record(v)}
            >
              {pending && pending.checkResult !== "withdrawn"
                ? t("citationChange.inspect.retry")
                : t("citationChange.inspect.record")}
            </Button>
            {v.myHead && v.myInspections[0]?.checkResult !== "withdrawn" ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => withdraw(v)}>
                {t("citationChange.inspect.withdraw")}
              </Button>
            ) : null}
          </div>
          <div className="space-y-1">
            <span className="font-medium text-foreground/70">
              {t("citationChange.inspect.history")}
            </span>
            {v.myInspections.length === 0 ? (
              <p className="text-muted-foreground">—</p>
            ) : (
              <ul className="ml-4 list-disc">
                {v.myInspections.map((i) => (
                  <li key={i.id}>
                    v{i.version} · {t(`citationChange.inspect.${i.checkResult}`)}
                    {i.observedAt ? ` · ${i.observedAt.slice(0, 19)}` : ""}{" "}
                    {v.myHead?.id === i.id ? (
                      <span className={chip}>{t("citationChange.inspect.head")}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {note ? (
        <p
          className={note.tone === "error" ? "text-destructive" : "text-emerald-700"}
          role="status"
        >
          {t(note.key, note.vars)}
        </p>
      ) : null}
    </section>
  );
}
