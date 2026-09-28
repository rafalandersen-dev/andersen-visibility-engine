import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "@/i18n";
import { Button } from "./ui/button";
import { readOwnerTeamPolicyFn, readProjectTeamRosterFn } from "@/lib/project-team.functions";
import {
  grantInspectionAssignmentFn,
  revokeInspectionAssignmentFn,
} from "@/lib/citation-change.functions";
import { changeErrorKey, inspectionChains } from "@/lib/citation-change";
import { absoluteInspectorLink, grantEligibleReviewers } from "@/lib/citation-review-ui";
import type { CitationImprovementDetail } from "@/lib/citation-forward";

const chip =
  "inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground";

/**
 * Owner view of INDEPENDENT inspection for one improvement row (candidate 20260928120000): the server's
 * independent status + eligibility, live dissent with its provenance (possibly recorded on an earlier row of the
 * same delivered change), every inspector's chain (head first, validity + reason), and assignment grant/revoke
 * with the copyable inspector link. Candidates mirror the finding-review grant rule (team policy), and the
 * server additionally refuses the known performer/approver. Nothing here counts as verification by itself.
 */
export function CitationInspectionAssignments({
  projectId,
  ownerId,
  detail,
  isHead,
}: {
  projectId: string;
  ownerId: string;
  detail: CitationImprovementDetail;
  isHead: boolean;
}) {
  const t = useT();
  const qc = useQueryClient();
  const scope = { projectId, expectedOwnerId: ownerId };
  const roster = useQuery({
    queryKey: ["project-team-roster", ownerId, projectId],
    queryFn: () => readProjectTeamRosterFn({ data: { projectId } }),
    staleTime: 0,
    retry: false,
  });
  const policy = useQuery({
    queryKey: ["owner-team-policy", ownerId, projectId],
    queryFn: () => readOwnerTeamPolicyFn({ data: { projectId } }),
    staleTime: 0,
    retry: false,
  });
  const members = useMemo(() => roster.data?.members ?? [], [roster.data]);
  const candidates = useMemo(
    () => grantEligibleReviewers(members, ownerId, policy.data?.mode ?? null),
    [members, ownerId, policy.data],
  );
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "error"; key: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const emailOf = (id: string) => members.find((m) => m.actorId === id)?.email ?? id.slice(0, 8);
  const link = absoluteInspectorLink(
    { ownerId, projectId, improvementRowId: detail.id },
    typeof window === "undefined" ? null : window.location.origin,
  ).href;
  async function run(op: () => Promise<unknown>, okKey: string) {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      await op();
      setNote({ tone: "ok", key: okKey });
      await qc.invalidateQueries({
        queryKey: ["citation-improvement", ownerId, projectId, detail.id],
      });
      await qc.invalidateQueries({ queryKey: ["citation-improvements", ownerId, projectId] });
    } catch (e) {
      setNote({ tone: "error", key: changeErrorKey(e instanceof Error ? e.message : "") });
    } finally {
      setBusy(false);
    }
  }
  const chains = inspectionChains(detail.inspections ?? []);
  const independent = detail.independentStatus ?? "none";
  const dissent = detail.dissent ?? [];
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <h5 className="font-medium">{t("citationChange.independent.title")}</h5>
      <div className="flex flex-wrap gap-2">
        <span className={chip} data-independent={independent}>
          {t(`citationChange.independent.${independent}`)}
        </span>
        <span className={chip} data-eligible={detail.verifiedEligible ? "yes" : "no"}>
          {detail.verifiedEligible
            ? t("citationChange.eligible.yes")
            : t("citationChange.eligible.no")}
        </span>
      </div>
      <p className="text-muted-foreground">{t("citationChange.independent.note")}</p>
      {dissent.length ? (
        <div className="space-y-1" data-dissent={dissent.length}>
          <span className="font-medium text-destructive">{t("citationChange.dissent.title")}</span>
          <ul className="ml-4 list-disc">
            {dissent.map((d) => (
              <li key={d.receiptId}>
                {t("citationChange.dissent.row", {
                  inspector: emailOf(d.inspectorId),
                  row: d.improvementRowId.slice(0, 8),
                  at: d.observedAt.slice(0, 19),
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="space-y-1">
        <span className="font-medium text-foreground/70">
          {t("citationChange.inspect.history")}
        </span>
        {chains.length === 0 ? (
          <p className="text-muted-foreground">{t("citationChange.independent.none")}</p>
        ) : (
          <ul className="ml-4 list-disc">
            {chains.map((c) => (
              <li key={c.inspectorId}>
                {emailOf(c.inspectorId)} · v{c.head.version} ·{" "}
                {t(`citationChange.inspect.${c.head.checkResult}`)}
                {c.head.observedAt ? ` · ${c.head.observedAt.slice(0, 19)}` : ""}{" "}
                <span className={chip} data-effective={c.head.effective ? "yes" : "no"}>
                  {c.head.effective
                    ? t("citationChange.assign.effective")
                    : `${t("citationChange.assign.ineffective")}${
                        c.head.ineffectiveReason
                          ? ` · ${t(`citationChange.inspect.reason.${c.head.ineffectiveReason}`)}`
                          : ""
                      }`}
                </span>
                {c.history.length ? (
                  <ul className="ml-4 list-[circle] text-muted-foreground">
                    {c.history.map((h) => (
                      <li key={h.id}>
                        v{h.version} · {t(`citationChange.inspect.${h.checkResult}`)}
                        {h.observedAt ? ` · ${h.observedAt.slice(0, 19)}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="space-y-1">
        <span className="font-medium text-foreground/70">{t("citationChange.assign.title")}</span>
        {(detail.assignments ?? []).length === 0 ? (
          <p className="text-muted-foreground">{t("citationChange.assign.none")}</p>
        ) : (
          <ul className="ml-4 list-disc">
            {(detail.assignments ?? []).map((a) => (
              <li key={a.inspectorId} className="flex flex-wrap items-center gap-2">
                <span>{emailOf(a.inspectorId)}</span>
                <span className={chip}>
                  {a.active
                    ? a.effective
                      ? t("citationChange.assign.effective")
                      : t("citationChange.assign.ineffective")
                    : t("citationChange.inspect.withdrawn")}
                </span>
                {a.active ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          revokeInspectionAssignmentFn({
                            data: {
                              ...scope,
                              improvementRowId: detail.id,
                              inspectorId: a.inspectorId,
                            },
                          }),
                        "citationChange.assign.revoked",
                      )
                    }
                  >
                    {t("citationChange.assign.revoke")}
                  </Button>
                ) : null}
                {a.active ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(link);
                        setCopied(a.inspectorId);
                      } catch {
                        setCopied(null);
                      }
                    }}
                  >
                    {copied === a.inspectorId
                      ? t("citationChange.assign.linkCopied")
                      : t("citationChange.assign.link")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {isHead ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 max-w-full space-y-1">
              <span className="block font-medium text-foreground/70">
                {t("citationChange.assign.pick")}
              </span>
              {roster.isError || policy.isError ? (
                <span className="text-destructive">{t("citationChange.error.unavailable")}</span>
              ) : roster.isPending || policy.isPending ? (
                <span className="text-muted-foreground">{t("citationForward.common.loading")}</span>
              ) : candidates.length === 0 ? (
                <span className="text-muted-foreground">
                  {t("citationChange.assign.candidatesNone")}
                </span>
              ) : (
                <select
                  className="block w-full max-w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                  value={pick}
                  onChange={(e) => setPick(e.target.value)}
                >
                  <option value="">{t("citationChange.assign.pick")}</option>
                  {candidates.map((m) => (
                    <option key={m.actorId} value={m.actorId}>
                      {m.email ?? m.actorId.slice(0, 8)} · {m.role}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <Button
              size="sm"
              disabled={busy || !pick}
              onClick={() =>
                void run(
                  () =>
                    grantInspectionAssignmentFn({
                      data: { ...scope, improvementRowId: detail.id, inspectorId: pick },
                    }),
                  "citationChange.assign.granted",
                )
              }
            >
              {t("citationChange.assign.grant")}
            </Button>
          </div>
        ) : null}
      </div>
      {note ? (
        <p
          className={note.tone === "error" ? "text-destructive" : "text-emerald-700"}
          role="status"
        >
          {t(note.key)}
        </p>
      ) : null}
    </div>
  );
}
