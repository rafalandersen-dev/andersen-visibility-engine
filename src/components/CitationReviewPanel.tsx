import { useEffect, useMemo, useReducer, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useT } from "@/i18n";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { getCitationFindingFn, readCitationFindingsFn } from "@/lib/citation-record.functions";
import {
  getCitationFindingForReviewFn,
  readCitationFindingReviewsFn,
  saveCitationFindingReviewFn,
  removeCitationFindingReviewFn,
  grantCitationReviewAssignmentFn,
  revokeCitationReviewAssignmentFn,
} from "@/lib/citation-finding-review.functions";
import { readProjectTeamRosterFn, readOwnerTeamPolicyFn } from "@/lib/project-team.functions";
import type { CitationFindingForReview } from "@/lib/citation-finding-review";
import type { Finding } from "@/lib/citation-finding";
import type { CitationAccuracyResolution } from "@/lib/citation-business-fact";
import {
  absoluteReviewerLink,
  accuracyEntryDisplay,
  canSubmitReview,
  grantEligibleReviewers,
  initialReviewerForm,
  newReviewerMountToken,
  ownActiveReceipt,
  reviewerFormReducer,
  reviewerMaterialExposed,
  reviewerQueryKeys,
  reviewerSurfaceHidden,
  reviewErrorAction,
  reviewRecordMasked,
  reviewSubmitGuard,
  revokeTargets,
  REVIEW_SHARE_SCOPE,
  type CitationReviewDecision,
  type ReviewerCandidate,
  type ReviewerFormState,
  type ReviewPolicyMode,
} from "@/lib/citation-review-ui";

function errorCode(e: unknown): string {
  return e instanceof Error ? e.message : "citation_review_unavailable";
}
const chip =
  "text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border border-border text-muted-foreground";
const NOTE_MAX = 2000;

export function CitationReviewPanel({
  projectId,
  reviewerContext,
  initialReviewerForm: initialForm,
}: {
  projectId: string;
  reviewerContext?: { ownerId: string; findingRowId: string };
  /** Test seam ONLY: the reviewer form's initial reducer state (a state reached by replaying
   * `reviewerFormReducer` events), so a DOM-less static render can assert the surface for that state.
   * It cannot bypass any safety gate: exposure still requires THIS mount's successful scoped read, hiding
   * still follows the live error/denied state, and a seeded decision still passes the submit guards. It can
   * only make the surface MORE restrictive (e.g. `denied: true`). Production routes never set it; the
   * default is `initialReviewerForm`. */
  initialReviewerForm?: ReviewerFormState;
}) {
  const { user } = useAuth();
  if (!user) return null;
  return reviewerContext ? (
    <ReviewerFinding
      key={`rev:${user.id}:${reviewerContext.ownerId}:${projectId}:${reviewerContext.findingRowId}`}
      projectId={projectId}
      ownerId={reviewerContext.ownerId}
      actorId={user.id}
      findingRowId={reviewerContext.findingRowId}
      initialForm={initialForm}
    />
  ) : (
    <OwnerReview key={`own:${user.id}:${projectId}`} projectId={projectId} ownerId={user.id} />
  );
}

/* --------------------------------------------------------------------- shared */

function Notice({
  tone,
  children,
}: {
  tone: "error" | "empty" | "info";
  children: React.ReactNode;
}) {
  const cls =
    tone === "error"
      ? "border-destructive/40 text-destructive"
      : tone === "info"
        ? "border-border text-foreground/70"
        : "border-border text-muted-foreground";
  return (
    <div className={`rounded-lg border border-dashed p-6 text-center text-sm ${cls}`}>
      {children}
    </div>
  );
}
function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-xs">
      <span className="font-medium text-foreground/70">{label}: </span>
      <span className="text-muted-foreground">{children}</span>
    </div>
  );
}
function RawAudit({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="mt-1 text-xs">
      <summary className="cursor-pointer text-muted-foreground">{label}</summary>
      <pre className="mt-1 max-h-64 overflow-auto rounded border border-border bg-background p-2">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

/**
 * ONE readable presentation of a valid finding record (the accepted `findingSchema`), shared by the owner
 * detail and the assigned reviewer so a person sees observation, hypothesis, recommendation and every support
 * claim (claim, status, cited URL, reason, the copied source passage when present) and the recorded accuracy
 * judgements BEFORE deciding — raw JSON is a secondary collapsed audit, never the primary surface. It renders
 * only what the server returned for THIS caller (a reviewer's withheld passages arrive blanked by the server).
 */
export function FindingRecordView({ record }: { record: Finding }) {
  const t = useT();
  return (
    <div className="space-y-2">
      <Labelled label={t("citationReview.record.observation")}>{record.observation}</Labelled>
      {record.hypothesis ? (
        <Labelled label={t("citationReview.record.hypothesis")}>{record.hypothesis}</Labelled>
      ) : null}
      {record.recommendation ? (
        <div className="text-xs">
          <div className="font-medium text-foreground/70">
            {t("citationReview.record.recommendation")}
          </div>
          <div className="mt-1 rounded border border-border p-2 text-muted-foreground space-y-1">
            <div>
              <span className="text-foreground/80">{record.recommendation.status}</span>
              {record.recommendation.target ? ` · ${record.recommendation.target}` : ""}
              {" · "}
              {t("citationReview.record.suitability")}: {record.recommendation.suitability}
            </div>
            {record.recommendation.passage ? (
              <Labelled label={t("citationReview.record.passage")}>
                {record.recommendation.passage}
              </Labelled>
            ) : null}
          </div>
        </div>
      ) : null}
      {record.support.length ? (
        <div className="text-xs">
          <div className="font-medium text-foreground/70">{t("citationReview.record.support")}</div>
          <ul className="mt-1 space-y-1">
            {record.support.map((s, i) => (
              <li
                key={i}
                className="rounded border border-border p-2 text-muted-foreground space-y-1"
              >
                <div>
                  <span className="text-foreground/80">{s.claimSpan}</span> — {s.status}
                  {s.reason ? ` · ${s.reason}` : ""}
                </div>
                <Labelled label={t("citationReview.record.citedUrl")}>{s.citedUrl}</Labelled>
                {s.sourcePassage ? (
                  <Labelled label={t("citationReview.record.sourcePassage")}>
                    {s.sourcePassage}
                  </Labelled>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {record.accuracy.length ? (
        <div className="text-xs">
          <div className="font-medium text-foreground/70">
            {t("citationReview.record.accuracy")}
          </div>
          <ul className="mt-1 space-y-1">
            {record.accuracy.map((a, i) => (
              <li key={i} className="rounded border border-border p-2 text-muted-foreground">
                <span className="text-foreground/80">{a.claimSpan}</span> — {a.status}
                {" · "}
                {t("citationReview.record.factKind")}: {a.factKind}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** The owner-only LIVE accuracy resolution (server-recomputed on every read against the dated facts), rendered
 * from the real contract fields: the recorded human judgement and the live resolution are distinct. */
export function AccuracyResolutionList({
  entries,
}: {
  entries: readonly CitationAccuracyResolution[];
}) {
  const t = useT();
  if (!entries.length) return null;
  return (
    <div className="text-xs">
      <div className="font-medium text-foreground/70">{t("citationReview.record.resolution")}</div>
      <ul className="mt-1 space-y-1">
        {entries.map((entry, i) => {
          const a = accuracyEntryDisplay(entry);
          return (
            <li key={i} className="rounded border border-border p-2 text-muted-foreground">
              <span className="text-foreground/80">{a.claim}</span>
              {" · "}
              {t("citationReview.record.humanStatus")}: {a.humanStatus}
              {" · "}
              {t("citationReview.record.resolution")}:{" "}
              {t(`citationReview.resolution.${a.resolution}`)}
              {a.capturedOn ? ` · ${t("citationReview.record.capturedOn")} ${a.capturedOn}` : ""}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- owner side */

function OwnerReview({ projectId, ownerId }: { projectId: string; ownerId: string }) {
  const t = useT();
  const scope = { projectId, expectedOwnerId: ownerId };
  const [selected, setSelected] = useState<string | null>(null);
  const findings = useQuery({
    queryKey: ["citation-findings", ownerId, projectId],
    queryFn: () => readCitationFindingsFn({ data: scope }),
    staleTime: 0,
    retry: false,
  });
  const rows = findings.data?.findings ?? [];
  if (findings.isError)
    return <Notice tone="error">{t("citationReview.error.loadFindings")}</Notice>;
  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground max-w-3xl">{t("citationReview.owner.intro")}</p>
      {findings.isPending ? (
        <Notice tone="info">{t("citationReview.loading")}</Notice>
      ) : rows.length === 0 ? (
        <Notice tone="empty">{t("citationReview.owner.empty")}</Notice>
      ) : (
        <ul className="space-y-2">
          {rows.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => setSelected((s) => (s === f.id ? null : f.id))}
                aria-expanded={selected === f.id}
                aria-label={t("citationReview.owner.openFinding", {
                  family: t(`citationReview.family.${f.family}`),
                })}
                className={`block w-full rounded-lg border bg-card p-4 text-left transition-colors ${
                  selected === f.id
                    ? "border-foreground/40"
                    : "border-border hover:border-foreground/20"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t(`citationReview.family.${f.family}`)}</span>
                  <span className={chip}>{t(`citationReview.decision.${f.decision}`)}</span>
                  <span className={chip}>{t(`citationReview.reviewStatus.${f.reviewStatus}`)}</span>
                  <span className={chip}>{t(`citationReview.accuracy.${f.accuracyStatus}`)}</span>
                  {!f.sourceAvailable ? (
                    <span className={chip}>{t("citationReview.chip.sourceUnavailable")}</span>
                  ) : null}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {t("citationReview.owner.version", { version: f.version })}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected ? (
        <OwnerFindingDetail
          key={selected}
          projectId={projectId}
          ownerId={ownerId}
          findingRowId={selected}
        />
      ) : null}
    </div>
  );
}

function OwnerFindingDetail({
  projectId,
  ownerId,
  findingRowId,
}: {
  projectId: string;
  ownerId: string;
  findingRowId: string;
}) {
  const t = useT();
  const detail = useQuery({
    queryKey: ["citation-finding", ownerId, projectId, findingRowId],
    queryFn: () =>
      getCitationFindingFn({ data: { projectId, expectedOwnerId: ownerId, id: findingRowId } }),
    staleTime: 0,
    retry: false,
  });
  const d = detail.data;
  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      {detail.isError ? (
        <Notice tone="error">{t("citationReview.error.loadDetail")}</Notice>
      ) : !d ? (
        <p className="text-sm text-muted-foreground">{t("citationReview.loading")}</p>
      ) : (
        <>
          <header className="space-y-1">
            <h3 className="font-display text-lg">{t("citationReview.detail.title")}</h3>
            <p className="text-xs text-muted-foreground">
              {t("citationReview.detail.current")}:{" "}
              {t(`citationReview.reviewStatus.${d.reviewStatus}`)}
              {" · "}
              {t(`citationReview.accuracy.${d.accuracyStatus}`)}
              {" · "}
              {t("citationReview.owner.recorded", { date: d.createdAt.slice(0, 10) })}
              {d.evidenceErased ? " · " + t("citationReview.detail.evidenceErased") : ""}
            </p>
          </header>
          {d.recordValid ? (
            <div className="space-y-2">
              <FindingRecordView record={d.record} />
              <AccuracyResolutionList entries={d.accuracy} />
              <RawAudit label={t("citationReview.record.rawAudit")} value={d.record} />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-amber-600">{t("citationReview.detail.legacyRecord")}</p>
              <RawAudit label={t("citationReview.record.rawAudit")} value={d.record} />
            </div>
          )}
          <GrantControls projectId={projectId} ownerId={ownerId} findingRowId={findingRowId} />
        </>
      )}
    </section>
  );
}

/** Explicit, owner-only, finding-scoped grant/revoke. Grant candidates mirror the LIVE approval policy
 * (`readOwnerTeamPolicyFn`); revoke targets are the full current roster so a departed/expired member can still
 * be revoked. No auto-assignment. On a successful grant the owner gets a copyable in-app review link to share
 * (no external send). There is no assignment-list endpoint yet, so current-assignment state is not claimed. */
function GrantControls({
  projectId,
  ownerId,
  findingRowId,
}: {
  projectId: string;
  ownerId: string;
  findingRowId: string;
}) {
  const t = useT();
  const roster = useQuery({
    queryKey: ["project-team-roster", ownerId, projectId],
    queryFn: () => readProjectTeamRosterFn({ data: { projectId } }),
    staleTime: 30000,
    retry: false,
  });
  const policy = useQuery({
    queryKey: ["owner-team-policy", ownerId, projectId],
    queryFn: () => readOwnerTeamPolicyFn({ data: { projectId } }),
    staleTime: 30000,
    retry: false,
  });
  // Memoised so the derived lists below do not recompute (and their deps do not change) on every render.
  const members = useMemo(() => (roster.data?.members ?? []) as ReviewerCandidate[], [roster.data]);
  const mode = (policy.data?.mode ?? null) as ReviewPolicyMode | null;
  const grantable = useMemo(
    () => grantEligibleReviewers(members, ownerId, mode),
    [members, ownerId, mode],
  );
  const revocable = useMemo(() => revokeTargets(members, ownerId), [members, ownerId]);

  const [grantId, setGrantId] = useState("");
  const [revokeId, setRevokeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; key: string } | null>(null);
  const [copied, setCopied] = useState(false);
  // The FULL shareable URL is built from the current application origin at the browser boundary (the link is
  // only shown after a client-side grant, so `window` exists; a server render honestly falls back to the path).
  const link = absoluteReviewerLink(
    { ownerId, projectId, findingRowId },
    typeof window === "undefined" ? null : window.location.origin,
  ).href;

  const loading = roster.isPending || policy.isPending;
  const rosterError = roster.isError || policy.isError;

  async function run(op: () => Promise<unknown>, okKey: string, showLink: boolean) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    setCopied(false);
    try {
      await op();
      setMsg({ tone: "ok", key: okKey });
      if (!showLink) setCopied(false);
    } catch {
      setMsg({ tone: "error", key: "citationReview.grant.failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <h4 className="text-sm font-medium">{t("citationReview.grant.title")}</h4>
      <div className="grid gap-3 sm:grid-cols-2 text-xs">
        <div>
          <div className="font-medium text-foreground/80">
            {t("citationReview.share.sharedTitle")}
          </div>
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
            {REVIEW_SHARE_SCOPE.shared.map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="font-medium text-foreground/80">
            {t("citationReview.share.withheldTitle")}
          </div>
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
            {REVIEW_SHARE_SCOPE.withheld.map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ul>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">{t("citationReview.loading")}</p>
      ) : rosterError ? (
        <Notice tone="error">{t("citationReview.grant.rosterError")}</Notice>
      ) : (
        <>
          {/* Grant — eligibility follows the live approval policy. */}
          {grantable.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("citationReview.grant.noEligible")}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={grantId} onValueChange={setGrantId}>
                <SelectTrigger
                  className="h-9 w-64 text-xs"
                  aria-label={t("citationReview.grant.selectReviewer")}
                >
                  <SelectValue placeholder={t("citationReview.grant.selectReviewer")} />
                </SelectTrigger>
                <SelectContent>
                  {grantable.map((c) => (
                    <SelectItem key={c.actorId} value={c.actorId}>
                      {c.email ?? c.actorId} · {t(`citationReview.role.${c.role}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!grantId || busy}
                onClick={() =>
                  run(
                    () =>
                      grantCitationReviewAssignmentFn({
                        data: { projectId, findingRowId, reviewerId: grantId },
                      }),
                    "citationReview.grant.granted",
                    true,
                  )
                }
              >
                {t("citationReview.grant.grant")}
              </Button>
            </div>
          )}
          {/* Revoke — the full roster (a departed/expired member can still be revoked). */}
          {revocable.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={revokeId} onValueChange={setRevokeId}>
                <SelectTrigger
                  className="h-9 w-64 text-xs"
                  aria-label={t("citationReview.grant.selectRevoke")}
                >
                  <SelectValue placeholder={t("citationReview.grant.selectRevoke")} />
                </SelectTrigger>
                <SelectContent>
                  {revocable.map((c) => (
                    <SelectItem key={c.actorId} value={c.actorId}>
                      {c.email ?? c.actorId}
                      {c.active ? "" : ` · ${t("citationReview.grant.departed")}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="ghost"
                disabled={!revokeId || busy}
                onClick={() =>
                  run(
                    () =>
                      revokeCitationReviewAssignmentFn({
                        data: { projectId, findingRowId, reviewerId: revokeId },
                      }),
                    "citationReview.grant.revoked",
                    false,
                  )
                }
              >
                {t("citationReview.grant.revoke")}
              </Button>
            </div>
          ) : null}
        </>
      )}

      {msg ? (
        <p className={`text-xs ${msg.tone === "ok" ? "text-emerald-600" : "text-destructive"}`}>
          {t(msg.key)}
        </p>
      ) : null}
      {msg?.tone === "ok" && msg.key === "citationReview.grant.granted" ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("citationReview.grant.linkHelp")}</p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={link}
              aria-label={t("citationReview.grant.link")}
              className="h-8 flex-1 min-w-0 rounded border border-border bg-background px-2 text-xs"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? t("citationReview.grant.copied") : t("citationReview.grant.copy")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- reviewer side */

function ReviewerFinding({
  projectId,
  ownerId,
  actorId,
  findingRowId,
  initialForm,
}: {
  projectId: string;
  ownerId: string;
  actorId: string;
  findingRowId: string;
  initialForm?: ReviewerFormState;
}) {
  const t = useT();
  const target = { projectId, ownerId, findingRowId };
  // The decision form's state machine is the pure, unit-tested `reviewerFormReducer` (hash-bound pending
  // decision, explicit clear on stale/conflict, sticky denial, remembered local withdrawals) — the JSX only
  // dispatches.
  const [form, dispatch] = useReducer(reviewerFormReducer, initialForm ?? initialReviewerForm);
  const { busy, decision, note, action } = form;

  // EVERY mount of this surface performs its OWN scoped authorized read before anything is exposed: the query
  // keys carry a per-mount token (a remount — "re-open the link" — can never observe a previous mount's cached
  // finding/receipts, even while its fresh read is still in flight or fails), and `gcTime: 0` drops this
  // mount's entries as soon as it unmounts. In-flight reads within ONE mount are still deduplicated normally.
  const [mountToken] = useState(newReviewerMountToken);
  const keys = reviewerQueryKeys(actorId, target, mountToken);
  const view = useQuery({
    queryKey: keys.view,
    queryFn: () => getCitationFindingForReviewFn({ data: target }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const reviews = useQuery({
    queryKey: keys.reviews,
    queryFn: () => readCitationFindingReviewsFn({ data: target }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  // Material is exposed ONLY after this mount's read has SUCCEEDED (never on mere data presence), and never
  // on error (access revoked/expired — React Query keeps the last successful data, which must not be shown)
  // or after the server REFUSED this actor's decision (`form.denied`, sticky for the mount).
  const hidden = reviewerSurfaceHidden({ viewIsError: view.isError, form });
  const exposed = reviewerMaterialExposed({
    viewIsSuccess: view.isSuccess,
    viewIsError: view.isError,
    form,
  });
  const v: CitationFindingForReview | undefined = exposed ? view.data : undefined;
  const currentSha = v?.recordSha256 ?? null;
  // Bind the pending decision to the EXACT inspected version: any hash change (new/edited version) or a mask
  // (currentSha null) resets the decision + note, so a refetch can never silently re-pin an unseen payload.
  // A same-hash re-read is a no-op in the reducer; the stale/conflict clear below does not depend on it.
  useEffect(() => {
    dispatch({ type: "view", currentSha });
  }, [currentSha]);

  const masked = v ? reviewRecordMasked(v) : true;
  const guard = v
    ? reviewSubmitGuard({
        record: v.record,
        recordSha256: v.recordSha256,
        inspectionComplete: v.inspectionComplete,
        decision,
        busy,
      })
    : { allowed: false as const, reason: "withheld" as const };
  // One predicate for the button AND the handler: a click racing a refetch is refused, not just greyed out.
  const canSubmit = canSubmitReview({ guard, fetching: view.isFetching || reviews.isFetching });

  async function submit() {
    if (!canSubmit || !v || !v.recordSha256 || decision === "") return;
    dispatch({ type: "submit_start" });
    try {
      await saveCitationFindingReviewFn({
        data: { ...target, expectedSha: v.recordSha256, decision, note: note.trim() || null },
      });
      dispatch({ type: "submit_ok" });
      await Promise.all([view.refetch(), reviews.refetch()]);
    } catch (e) {
      const code = errorCode(e);
      // Stale/conflict: the reducer clears the pending decision + note EXPLICITLY (a conflict can occur at the
      // same hash), then the finding + receipts are re-read; the reviewer must inspect and choose again.
      dispatch({ type: "submit_failed", code });
      if (reviewErrorAction(code) === "refresh")
        await Promise.all([view.refetch(), reviews.refetch()]);
    }
  }
  async function withdraw(id: string) {
    if (busy) return;
    dispatch({ type: "withdraw_start" });
    try {
      await removeCitationFindingReviewFn({ data: { projectId, ownerId, id } });
      dispatch({ type: "withdraw_ok", id });
      // Refresh the receipt list and (only while the surface is not hidden) the finding's current review
      // status. While hidden the finding is NOT re-read: a withdrawal never un-hides a refusal, and there is
      // no reason to pull the material into the cache. After a revocation these reads fail closed again
      // (assignment required) — the local withdrawn id keeps the control honest, and the errors are
      // surfaced below, never shown as "no reviews".
      await Promise.all([reviews.refetch(), hidden ? Promise.resolve() : view.refetch()]);
    } catch {
      dispatch({ type: "withdraw_failed" });
    }
  }

  // The caller's own active receipt. It is read from the LAST receipt page React Query still holds even when
  // the receipt read now errors (assignment revoked/expired): the released withdrawal RPC permits withdrawing
  // one's OWN receipt without a current assignment, and a receipt's decision is the reviewer's own — not the
  // owner's finding material.
  const mine = ownActiveReceipt(reviews.data?.reviews, form.withdrawnIds);
  const withdrawalNotice =
    form.withdraw === "ok" ? (
      <p className="text-xs text-emerald-600">{t("citationReview.reviewer.withdrawn")}</p>
    ) : form.withdraw === "failed" ? (
      <p className="text-xs text-destructive">{t("citationReview.reviewer.withdrawFailed")}</p>
    ) : null;
  const ownReceiptControls = mine ? (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">
        {t("citationReview.reviewer.recorded", {
          decision: t(`citationReview.reviewDecision.${mine.decision}`),
        })}
      </span>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => withdraw(mine.id)}>
        {t("citationReview.reviewer.withdraw")}
      </Button>
    </div>
  ) : null;

  if (hidden)
    // Access denied/revoked or decision refused: NO cached finding material is rendered (v is undefined) and
    // the state is sticky through any withdrawal start/failure/success. Only the reviewer's own receipt (if
    // this session already read it) stays withdrawable, because the server allows own withdrawal without an
    // assignment. A fresh open after revocation has no receipt page and offers nothing — the receipt list
    // read requires an assignment, so the UI cannot learn the receipt id (documented limitation).
    return (
      <div className="space-y-3">
        <Notice tone="error">{t("citationReview.reviewer.unavailable")}</Notice>
        {ownReceiptControls ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {t("citationReview.reviewer.revokedOwnReceipt")}
            </p>
            {ownReceiptControls}
          </div>
        ) : null}
        {withdrawalNotice}
      </div>
    );
  if (!v) return <p className="text-sm text-muted-foreground">{t("citationReview.loading")}</p>;

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <header className="space-y-1">
        <h3 className="font-display text-lg">{t("citationReview.reviewer.title")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("citationReview.detail.current")}: {t(`citationReview.reviewStatus.${v.reviewStatus}`)}
          {" · "}
          {v.inspectionComplete
            ? t("citationReview.reviewer.inspectable")
            : t("citationReview.reviewer.notInspectable")}
        </p>
      </header>

      {masked || v.record === null ? (
        <Notice tone="empty">{t("citationReview.reviewer.withheld")}</Notice>
      ) : (
        <div className="space-y-3">
          {/* The finding record itself, readable (same presentation as the owner sees) — then the cited
              evidence and dated facts — then the raw JSON as a collapsed audit only. */}
          <FindingRecordView record={v.record} />
          {v.sourcePassagesWithheld ? (
            <p className="text-xs text-amber-600">
              {t("citationReview.reviewer.passagesWithheld")}
            </p>
          ) : null}
          <ReviewerEvidence view={v} />
          <RawAudit label={t("citationReview.record.rawAudit")} value={v.record} />
        </div>
      )}

      {/* Decision — no default; approve only a fully-inspected, visible finding; opinions/dissent otherwise. */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={decision}
          onValueChange={(x) =>
            dispatch({ type: "decision", decision: x as CitationReviewDecision })
          }
        >
          <SelectTrigger
            className="h-9 w-52 text-xs"
            aria-label={t("citationReview.reviewer.decisionLabel")}
          >
            <SelectValue placeholder={t("citationReview.reviewer.chooseDecision")} />
          </SelectTrigger>
          <SelectContent>
            {(["approved", "rejected", "needs_changes"] as const).map((dv) => (
              <SelectItem key={dv} value={dv}>
                {t(`citationReview.reviewDecision.${dv}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          className="h-9 flex-1 min-w-40 rounded border border-border bg-background px-2 text-sm"
          value={note}
          maxLength={NOTE_MAX}
          aria-label={t("citationReview.reviewer.noteLabel")}
          onChange={(e) => dispatch({ type: "note", note: e.target.value })}
          placeholder={t("citationReview.reviewer.notePlaceholder")}
        />
        <Button size="sm" disabled={!canSubmit} onClick={submit}>
          {t("citationReview.reviewer.submit")}
        </Button>
      </div>
      {!guard.allowed && guard.reason && guard.reason !== "busy" ? (
        <p className="text-xs text-amber-600">{t(`citationReview.guard.${guard.reason}`)}</p>
      ) : null}
      {action === "refresh" ? (
        <p className="text-xs text-amber-600">{t("citationReview.reviewer.staleRefreshed")}</p>
      ) : null}

      {/* Existing receipts — an error here is surfaced, never shown as "no reviews"; the own receipt from the
          last successful page stays withdrawable. */}
      {reviews.isError ? (
        <p className="text-xs text-destructive">{t("citationReview.reviewer.reviewsError")}</p>
      ) : null}
      {ownReceiptControls}
      {withdrawalNotice}
      {reviews.data && reviews.data.reviewsTruncated ? (
        <p className="text-[11px] text-muted-foreground">
          {t("citationReview.reviewer.truncated", { total: reviews.data.reviewTotal })}
        </p>
      ) : null}
    </section>
  );
}

/** Readable render of the reviewer's cited evidence + dated facts — the genuine material the reviewer must
 * inspect before deciding, never the raw record JSON as the primary surface. */
function ReviewerEvidence({ view }: { view: CitationFindingForReview }) {
  const t = useT();
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-medium text-foreground/70">
          {t("citationReview.reviewer.evidence")}
        </div>
        {view.evidence.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("citationReview.reviewer.noEvidence")}</p>
        ) : (
          <ul className="mt-1 space-y-2">
            {view.evidence.map((e, i) => (
              <li key={i} className="rounded border border-border p-3 text-xs">
                {e.kind === "answer" ? (
                  <div className="space-y-1">
                    <div className="flex flex-wrap gap-2">
                      <span className="font-medium">{t("citationReview.evidence.answer")}</span>
                      <span className={chip}>
                        {e.available
                          ? t("citationReview.evidence.available")
                          : t("citationReview.evidence.deleted")}
                      </span>
                      {e.capturedAt ? (
                        <span className={chip}>{e.capturedAt.slice(0, 10)}</span>
                      ) : null}
                      {e.surface ? <span className={chip}>{e.surface}</span> : null}
                    </div>
                    {e.content !== null ? (
                      <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-foreground/80">
                        {e.content}
                      </pre>
                    ) : null}
                    {e.contentTruncated ? (
                      <p className="text-amber-600">{t("citationReview.evidence.truncated")}</p>
                    ) : null}
                    {e.citations.length ? (
                      <Labelled label={t("citationReview.evidence.citations")}>
                        {e.citations.join(", ")}
                      </Labelled>
                    ) : null}
                  </div>
                ) : e.kind === "source" ? (
                  <div className="space-y-1">
                    <div className="flex flex-wrap gap-2">
                      <span className="font-medium">{t("citationReview.evidence.source")}</span>
                      <span className={chip}>
                        {e.status ?? t("citationReview.evidence.unknownStatus")}
                      </span>
                      {e.available ? null : (
                        <span className={chip}>{t("citationReview.evidence.deleted")}</span>
                      )}
                    </div>
                    {e.label ? (
                      <Labelled label={t("citationReview.evidence.label")}>{e.label}</Labelled>
                    ) : null}
                    {e.url ? (
                      <Labelled label={t("citationReview.evidence.url")}>{e.url}</Labelled>
                    ) : null}
                    <Labelled label={t("citationReview.evidence.selectedRecords")}>
                      {e.materialCount}
                    </Labelled>
                    {e.material.length ? (
                      <ul className="mt-1 space-y-1">
                        {e.material.map((m) => (
                          <li
                            key={m.recordId}
                            className="rounded bg-background p-2 text-muted-foreground"
                          >
                            <span className="text-foreground/80">{m.value}</span>
                            {m.locator ? ` · ${m.locator}` : ""} · {m.status}
                            {m.validUntil
                              ? ` · ${t("citationReview.evidence.validUntil")} ${m.validUntil.slice(0, 10)}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <span className="font-medium">{t("citationReview.evidence.native")}</span>
                    <span className={chip}>{t("citationReview.evidence.notInspectable")}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {view.facts.length ? (
        <div>
          <div className="text-xs font-medium text-foreground/70">
            {t("citationReview.reviewer.facts")}
          </div>
          <ul className="mt-1 space-y-1 text-xs">
            {view.facts.map((f) => (
              <li key={f.factRowId} className="text-muted-foreground">
                {f.available ? (
                  <>
                    <span className="text-foreground/80">
                      {f.kind ? `${f.kind}: ` : ""}
                      {f.value}
                    </span>
                    {f.validFrom ? ` · ${f.validFrom.slice(0, 10)}` : ""}
                    {f.validUntil ? `–${f.validUntil.slice(0, 10)}` : ""}
                  </>
                ) : (
                  t("citationReview.evidence.factUnavailable")
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
