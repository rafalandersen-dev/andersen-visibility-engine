import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useT } from "@/i18n";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { ReportView } from "./NativeGoogleIntakePanel";
import { getCitationFindingFn, readCitationFindingsFn } from "@/lib/citation-record.functions";
import {
  getCitationFindingForReviewFn,
  readCitationFindingReviewsFn,
  saveCitationFindingReviewFn,
  removeCitationFindingReviewFn,
  grantCitationReviewAssignmentFn,
  grantCitationReviewNativeAssignmentFn,
  revokeCitationReviewAssignmentFn,
} from "@/lib/citation-finding-review.functions";
import { readProjectTeamRosterFn, readOwnerTeamPolicyFn } from "@/lib/project-team.functions";
import {
  readNativeReportBindingFn,
  readNativeReportParsedFn,
} from "@/lib/native-google-intake.functions";
import { readNativeArtifactsFn } from "@/lib/native-ai-artifact.functions";
import { getWorkspaceSaveContext, useStore } from "@/lib/store";
import type { CitationFindingForReview } from "@/lib/citation-finding-review";
import type { Finding } from "@/lib/citation-finding";
import type { CitationAccuracyResolution } from "@/lib/citation-business-fact";
import { scopeBinding } from "@/lib/citation-record";
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
  nativeConsentSetString,
  nativeConsentSetDigest,
  nativeConsentIdentity,
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

/**
 * The live-session guard every owner/reviewer transport boundary in this file shares (same pattern as
 * NativeGoogleIntakePanel/CitationFindingAuthor — a bounded local helper, not a new framework). `epoch` is
 * fixed at mount for the query keys; `current()` re-checks the LIVE auth actor + workspace userId + epoch +
 * hydration against `actorId` before every transport and after every await, so a sign-out / actor
 * replacement / epoch change / hydration pause retires the work even before the route remounts. Re-renders
 * on any workspace session change via the store subscriptions.
 */
function useLiveSession(actorId: string, projectId: string) {
  useStore((s) => s.userId);
  useStore((s) => s.hydrated);
  const { user } = useAuth();
  const authId = useRef<string | null>(user?.id ?? null);
  authId.current = user?.id ?? null;
  const bound = useRef({ epoch: getWorkspaceSaveContext().epoch, projectId });
  const current = () => {
    const ctx = getWorkspaceSaveContext();
    return (
      authId.current === actorId &&
      ctx.userId === actorId &&
      ctx.epoch === bound.current.epoch &&
      ctx.hydrated &&
      projectId === bound.current.projectId
    );
  };
  return { epoch: bound.current.epoch, current };
}

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
  const { epoch, current } = useLiveSession(ownerId, projectId);
  const [selected, setSelected] = useState<string | null>(null);
  const findings = useQuery({
    // Epoch-scoped so a new same-actor session cannot reuse the previous session's cached list before its
    // own fresh read; the queryFn re-checks the live session right before issuing the request.
    queryKey: ["citation-findings", ownerId, projectId, epoch],
    // Live session re-checked BEFORE the request AND after it resolves, so a session retired mid-read never
    // caches owner material under this mount.
    queryFn: async () => {
      if (!current()) throw Error("citation_review_retired");
      const d = await readCitationFindingsFn({ data: scope });
      if (!current()) throw Error("citation_review_retired");
      return d;
    },
    staleTime: 0,
    retry: false,
  });
  // A surviving mount whose session has retired (hydration pause / epoch / actor change before the route
  // remounts) exposes NO cached rows/detail until the live session is current again.
  const sessionLive = current();
  const rows = sessionLive ? (findings.data?.findings ?? []) : [];
  if (findings.isError)
    return <Notice tone="error">{t("citationReview.error.loadFindings")}</Notice>;
  return (
    <div className="space-y-5">
      {/* The displayed owner intro is the truthful native-review-binding copy; the legacy
          citationReview.owner.intro literal is kept at its b802 baseline (now unused here). */}
      <p className="text-xs text-muted-foreground max-w-3xl">
        {t("nativeIntake.review.ownerIntro")}
      </p>
      {!sessionLive || findings.isPending ? (
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
                  {/* Server-derived scope-binding provenance (persisted stamp), never inferred from panels. */}
                  <span className={chip}>
                    {t(`citationAuthoring.binding.${scopeBinding(f.scopeEnforcedAt)}`)}
                  </span>
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
      {selected && sessionLive ? (
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
  const { epoch, current } = useLiveSession(ownerId, projectId);
  const detail = useQuery({
    queryKey: ["citation-finding", ownerId, projectId, findingRowId, epoch],
    queryFn: async () => {
      if (!current()) throw Error("citation_review_retired");
      const d = await getCitationFindingFn({
        data: { projectId, expectedOwnerId: ownerId, id: findingRowId },
      });
      if (!current()) throw Error("citation_review_retired");
      return d;
    },
    staleTime: 0,
    retry: false,
  });
  // A retired session (hydration pause / epoch / actor change) exposes NO cached record/material/grant.
  const d = current() ? detail.data : undefined;
  // The finding's cited native set, taken from its OWN immutable record binding (never a browser digest):
  // each item's `parsedSha256`/`source` is the authoritative per-artifact binding (null for a bare/legacy
  // native). The grant discloses this set and binds the owner's explicit full-set consent to it.
  const nativeItems =
    d && d.recordValid
      ? d.record.evidence
          .filter((e) => e.kind === "native")
          .map((e) => ({
            id: e.id,
            parsedSha256: e.nativeBinding?.parsedSha256 ?? null,
            source: e.nativeBinding?.source ?? null,
          }))
      : [];
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
              {" · "}
              {t(`citationAuthoring.binding.${scopeBinding(d.scopeEnforcedAt)}`)}
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
          <GrantControls
            projectId={projectId}
            ownerId={ownerId}
            findingRowId={findingRowId}
            nativeItems={nativeItems}
          />
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
  nativeItems,
}: {
  projectId: string;
  ownerId: string;
  findingRowId: string;
  /** The finding's cited native set from its own record binding (parsedSha256/source null = bare/legacy). */
  nativeItems: readonly { id: string; parsedSha256: string | null; source: string | null }[];
}) {
  const t = useT();
  // Live owner session (auth actor + workspace userId + epoch + hydration) shared by every transport here.
  const { epoch, current } = useLiveSession(ownerId, projectId);
  const scope = { projectId, expectedOwnerId: ownerId };
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);
  const busyRef = useRef(false);
  const grantOp = useRef(0);

  const roster = useQuery({
    queryKey: ["project-team-roster", ownerId, projectId, epoch],
    queryFn: async () => {
      if (!current()) throw Error("citation_review_retired");
      const d = await readProjectTeamRosterFn({ data: { projectId } });
      if (!current()) throw Error("citation_review_retired");
      return d;
    },
    staleTime: 30000,
    retry: false,
  });
  const policy = useQuery({
    queryKey: ["owner-team-policy", ownerId, projectId, epoch],
    queryFn: async () => {
      if (!current()) throw Error("citation_review_retired");
      const d = await readOwnerTeamPolicyFn({ data: { projectId } });
      if (!current()) throw Error("citation_review_retired");
      return d;
    },
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

  const [grantId, rawSetGrantId] = useState("");
  const [revokeId, setRevokeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; key: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [consentFor, setConsentFor] = useState<string | null>(null);
  // Choosing a reviewer SYNCHRONOUSLY retires any in-flight grant (bumps `grantOp`) and clears the accepted
  // consent + shown success link, so a late grant for the previous reviewer can never restore a stale success.
  const setGrantId = (id: string) => {
    grantOp.current += 1;
    rawSetGrantId(id);
    setConsentFor(null);
    setMsg(null);
    setCopied(false);
  };

  // Native-material consent (finding native-review binding). A native-bearing finding is shared ONLY with
  // the explicit full-set grant below; a non-native finding keeps the existing generic grant untouched.
  const hasNative = nativeItems.length > 0;
  // The consent digest is composed from the finding's OWN immutable per-artifact bindings (the server
  // recomputes it live and refuses a mismatch). `setString` is the identity those bindings compose to.
  const setString = nativeConsentSetString(nativeItems); // null = empty/unbound: cannot be consented
  // Observe the SHARED artifact list (IDENTICAL key to the intake panel), so an import/delete there retires
  // this disclosure/consent without navigation: a cited native missing from the current live list — or a
  // pending/failed/background list read — disables consent and masks material.
  const artifacts = useQuery({
    queryKey: ["native-artifacts", ownerId, projectId, epoch],
    enabled: hasNative,
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      if (!current()) throw Error("citation_grant_retired");
      const d = await readNativeArtifactsFn({ data: scope });
      if (!current()) throw Error("citation_grant_retired");
      return d;
    },
  });
  const artifactsReady = artifacts.isSuccess && !artifacts.isError && !artifacts.isFetching;
  const liveIds = useMemo(
    () => new Set((artifacts.data?.artifacts ?? []).map((a) => a.id.toLowerCase())),
    [artifacts.data],
  );
  // DISCLOSURE: read each cited native's CURRENT authoritative binding AND full parsed material so the owner
  // inspects the exact full set (distinguishable metadata + ReportView) before consenting.
  const nativeCurrent = useQuery({
    queryKey: ["citation-native-consent", ownerId, projectId, findingRowId, epoch],
    enabled: hasNative,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      if (!current()) throw Error("citation_grant_retired");
      const items = await Promise.all(
        nativeItems.map(async (it) => {
          const [b, p] = await Promise.all([
            readNativeReportBindingFn({ data: { ...scope, id: it.id } }),
            readNativeReportParsedFn({ data: { ...scope, id: it.id } }),
          ]);
          // Keep BOTH responses' identity/parse-state so cross-response coherence can be verified (never
          // reduced away before matching).
          return {
            id: it.id,
            bId: b.id,
            bParseState: b.parseState,
            available: b.available,
            binding: b.binding,
            pId: p.id,
            pParseState: p.parseState,
            parsed: p.parsed,
          };
        }),
      );
      // Post-await liveness: a session retired mid-read must not return stale material as a fresh result.
      if (!current()) throw Error("citation_grant_retired");
      return items;
    },
  });
  const currentItems = useMemo(() => nativeCurrent.data ?? [], [nativeCurrent.data]);
  // One coherence predicate for BOTH readiness and disclosure: the finding item is bound (stored digest), its
  // PAIRED current responses both name the requested artifact and are parsed/available, the material's own
  // artifactId AND raw-sha/source/parser agree with the authoritative binding, and the binding's server
  // parsed-set digest equals the finding's stored digest. (No invented client hash; schemas only prove each
  // response internally coherent — this proves coherence BETWEEN them.)
  const itemResolved = (
    it: { id: string; parsedSha256: string | null },
    c: (typeof currentItems)[number] | undefined,
  ): boolean =>
    it.parsedSha256 !== null &&
    !!c &&
    c.available &&
    c.binding !== null &&
    c.parsed !== null &&
    c.bId.toLowerCase() === it.id.toLowerCase() &&
    c.pId.toLowerCase() === it.id.toLowerCase() &&
    c.bParseState === "parsed" &&
    c.pParseState === "parsed" &&
    c.parsed.artifactId.toLowerCase() === it.id.toLowerCase() &&
    c.parsed.artifactSha256 === c.binding.rawSha256 &&
    c.parsed.input.source === c.binding.source &&
    c.parsed.parserVersion === c.binding.parserVersion &&
    c.binding.parsedSha256 === it.parsedSha256;
  // Consent requires: every cited native BOUND in the finding (non-null stored digest), still PRESENT in the
  // live list, and its CURRENT read resolving to the EXACT stored binding (matching id, parse-state, the
  // material's own artifactId, and the server parsed-set digest). One missing/failed/pending/unbound/
  // mismatched/deleted member → no consent, and the material is masked while any of these reads is in flight.
  const findingBound = hasNative && nativeItems.every((it) => it.parsedSha256 !== null);
  const allPresent = artifactsReady && nativeItems.every((it) => liveIds.has(it.id.toLowerCase()));
  const materialFresh =
    nativeCurrent.isSuccess && !nativeCurrent.isError && !nativeCurrent.isFetching;
  const currentResolved = findingBound && allPresent && materialFresh;
  const currentMatches =
    currentResolved &&
    nativeItems.every((it) =>
      itemResolved(
        it,
        currentItems.find((x) => x.id.toLowerCase() === it.id.toLowerCase()),
      ),
    );
  const consentable = findingBound && currentMatches;
  // The owner's consent is bound to the exact reviewer + finding row + full native set + session epoch.
  const consentIdentity = nativeConsentIdentity({
    findingRowId,
    reviewerId: grantId,
    setString,
    epoch,
  });
  const consentChecked = grantId !== "" && consentFor === consentIdentity;
  // The reviewer choice is retired synchronously in `setGrantId`; this covers a set/session/epoch change
  // (finding's native set changed, or a new session) by retiring any in-flight grant and clearing success.
  useEffect(() => {
    grantOp.current += 1;
    setConsentFor(null);
    setMsg(null);
    setCopied(false);
  }, [consentIdentity]);
  // Losing full-set eligibility (a cited artifact deleted, or a pending/failed/background list/material
  // read) retires any in-flight grant and clears the accepted consent + success link; recovery requires an
  // explicit re-consent (the checkbox stays unchecked after a refetch recovers).
  useEffect(() => {
    if (!consentable) {
      grantOp.current += 1;
      setConsentFor(null);
      setMsg(null);
      setCopied(false);
    }
  }, [consentable]);
  // The FULL shareable URL is built from the current application origin at the browser boundary (the link is
  // only shown after a client-side grant, so `window` exists; a server render honestly falls back to the path).
  const link = absoluteReviewerLink(
    { ownerId, projectId, findingRowId },
    typeof window === "undefined" ? null : window.location.origin,
  ).href;

  const loading = roster.isPending || policy.isPending;
  const rosterError = roster.isError || policy.isError;

  async function run(op: () => Promise<unknown>, okKey: string, showLink: boolean) {
    if (busyRef.current || !current()) return;
    const token = ++grantOp.current;
    busyRef.current = true;
    setBusy(true);
    setMsg(null);
    setCopied(false);
    try {
      await op();
      // The SUCCESS/error message is gated by the token + live session so a retired/replaced identity never
      // restores a stale success; the mutex release in `finally` is unconditional so controls recover.
      if (mounted.current && grantOp.current === token && current()) {
        setMsg({ tone: "ok", key: okKey });
        if (!showLink) setCopied(false);
      }
    } catch {
      if (mounted.current && grantOp.current === token && current())
        setMsg({ tone: "error", key: "citationReview.grant.failed" });
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  // Native-bearing grant: the DB recomputes the set digest live and refuses a mismatch/unbound/legacy set.
  // The digest is derived from the finding's authoritative per-artifact bindings only. Success is gated by the
  // grant token + live session (a reviewer/set/session change bumps the token) so a deferred digest/grant that
  // settles after the choice changed cannot write a granted message/link; the mutex is always released.
  async function grantNative() {
    if (!grantId || !consentChecked || !consentable || busyRef.current || !current()) return;
    const token = ++grantOp.current;
    busyRef.current = true;
    setBusy(true);
    setMsg(null);
    setCopied(false);
    try {
      const digest = await nativeConsentSetDigest(nativeItems);
      if (!mounted.current || grantOp.current !== token || !current()) return;
      if (!digest) {
        setMsg({ tone: "error", key: "citationReview.grant.failed" });
        return;
      }
      await grantCitationReviewNativeAssignmentFn({
        data: { projectId, findingRowId, reviewerId: grantId, nativeSetSha256: digest },
      });
      if (!mounted.current || grantOp.current !== token || !current()) return;
      setMsg({ tone: "ok", key: "citationReview.grant.granted" });
    } catch {
      if (mounted.current && grantOp.current === token && current())
        setMsg({ tone: "error", key: "citationReview.grant.failed" });
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
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
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Select value={grantId} onValueChange={setGrantId}>
                  <SelectTrigger
                    className="h-11 w-64 text-xs"
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
                {/* A native-bearing finding is granted ONLY through the explicit full-set consent below. */}
                {!hasNative ? (
                  <Button
                    size="sm"
                    className="min-h-11"
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
                ) : null}
              </div>
              {hasNative && grantId ? (
                <div
                  className="rounded border border-border p-3 space-y-2 text-xs"
                  data-native-consent
                >
                  <div className="font-medium text-foreground/80">
                    {t("nativeIntake.consent.title")}
                  </div>
                  <p className="text-muted-foreground">
                    {t("nativeIntake.consent.scope", { count: nativeItems.length })}
                  </p>
                  {/* The EXACT current full cited set, each report distinguished by source + declared property
                      + period and its entire parsed material (ReportView). A same-source pair is told apart by
                      its property/period/material, never a bare source name. Material is MASKED (shown as
                      loading) while either the shared artifact list or the per-report read is pending/fetching,
                      and an error disables it — a cached report never survives an actual intake delete/refetch. */}
                  {!artifactsReady || !materialFresh ? (
                    artifacts.isError || nativeCurrent.isError ? (
                      <p className="text-amber-700 dark:text-amber-400">
                        {t("nativeIntake.consent.unbindable")}
                      </p>
                    ) : (
                      <p className="text-muted-foreground">{t("citationReview.loading")}</p>
                    )
                  ) : (
                    <ul className="space-y-2">
                      {nativeItems.map((it) => {
                        const c = currentItems.find(
                          (x) => x.id.toLowerCase() === it.id.toLowerCase(),
                        );
                        const resolved = liveIds.has(it.id.toLowerCase()) && itemResolved(it, c);
                        return (
                          <li
                            key={it.id}
                            className="rounded border border-border p-2 space-y-1"
                            data-native-consent-item={it.id}
                            data-native-consent-resolved={resolved ? "true" : "false"}
                          >
                            <div className="font-medium text-foreground/80 break-words [overflow-wrap:anywhere]">
                              {c?.parsed
                                ? `${t("nativeIntake.source." + c.parsed.input.source)} · ${c.parsed.input.declaredProperty} · ${c.parsed.input.period.start} → ${c.parsed.input.period.end}`
                                : it.source
                                  ? t("nativeIntake.source." + it.source)
                                  : it.id}
                            </div>
                            {resolved && c?.parsed ? (
                              <div className="rounded bg-muted/40 p-2">
                                <ReportView
                                  view={{
                                    input: c.parsed.input,
                                    withheldPageRows: c.parsed.withheldPageRows,
                                    partial: c.parsed.partial,
                                  }}
                                  note={c.parsed.limitationNote}
                                  label={(k) => t("nativeIntake." + k)}
                                  t={t}
                                />
                              </div>
                            ) : (
                              <p className="text-amber-700 dark:text-amber-400">
                                {t("nativeIntake.consent.itemUnbound")}
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {consentable ? (
                    <>
                      <label className="flex items-start gap-2 min-h-11 py-1">
                        <input
                          type="checkbox"
                          className="mt-1 h-5 w-5"
                          disabled={busy}
                          checked={consentChecked}
                          onChange={(e) => {
                            // Unchecking (or re-checking) SYNCHRONOUSLY retires any in-flight grant so a
                            // continuation past a pending digest cannot still issue the RPC, and clears any
                            // shown success/link.
                            grantOp.current += 1;
                            setConsentFor(e.target.checked ? consentIdentity : null);
                            setMsg(null);
                            setCopied(false);
                          }}
                        />
                        <span>{t("nativeIntake.consent.checkbox")}</span>
                      </label>
                      <Button
                        size="sm"
                        className="min-h-11"
                        disabled={!grantId || busy || !consentChecked}
                        onClick={grantNative}
                      >
                        {t("nativeIntake.consent.grant")}
                      </Button>
                    </>
                  ) : nativeCurrent.isSuccess ? (
                    <p className="text-amber-700 dark:text-amber-400">
                      {t("nativeIntake.consent.unbindable")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
          {/* Revoke — the full roster (a departed/expired member can still be revoked). */}
          {revocable.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={revokeId} onValueChange={setRevokeId}>
                <SelectTrigger
                  className="h-11 w-64 text-xs"
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
                className="min-h-11"
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
              className="h-11 flex-1 min-w-0 rounded border border-border bg-background px-2 text-xs"
            />
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11"
              onClick={async () => {
                // Bind the copied state to the SAME grant operation + live session: a reviewer/consent/
                // session change (which bumps grantOp and clears the link) during the clipboard await must
                // not light up "copied" for a link that is no longer shown.
                const token = grantOp.current;
                try {
                  await navigator.clipboard.writeText(link);
                  if (mounted.current && grantOp.current === token && current()) setCopied(true);
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
  // Retire on unmount, and an immediate in-flight guard so a double activation yields ONE mutation and a late
  // submit/withdraw result never dispatches or refetches after this mount was replaced (new session/epoch).
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);
  const inFlight = useRef(false);
  // Live reviewer session: beyond the per-mount token and unmount flag, the queryFns and post-mutation
  // continuations re-check the LIVE auth actor + workspace userId + epoch + hydration, so a live session
  // change while the mount has not yet retired cannot issue the read or dispatch a dependent refetch.
  const { current } = useLiveSession(actorId, projectId);
  const keys = reviewerQueryKeys(actorId, target, mountToken);
  const view = useQuery({
    queryKey: keys.view,
    queryFn: async () => {
      if (!current()) throw Error("citation_review_retired");
      const d = await getCitationFindingForReviewFn({ data: target });
      if (!current()) throw Error("citation_review_retired");
      return d;
    },
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const reviews = useQuery({
    queryKey: keys.reviews,
    queryFn: async () => {
      if (!current()) throw Error("citation_review_retired");
      const d = await readCitationFindingReviewsFn({ data: target });
      if (!current()) throw Error("citation_review_retired");
      return d;
    },
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  // Material is exposed ONLY after this mount's read has SUCCEEDED (never on mere data presence), and never
  // on error (access revoked/expired — React Query keeps the last successful data, which must not be shown)
  // or after the server REFUSED this actor's decision (`form.denied`, sticky for the mount).
  // A surviving mount whose session has retired (hydration pause / epoch / actor change before the route
  // remounts) exposes NOTHING — material, notes, hash, cached own receipt and actions all gate on this.
  const live = current();
  const hidden = reviewerSurfaceHidden({ viewIsError: view.isError, form });
  const exposed =
    live &&
    reviewerMaterialExposed({
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
    // Admission requires the LIVE session + mount, not only cached `canSubmit`: a hydration/epoch/actor
    // boundary while still mounted refuses the old action.
    if (
      !canSubmit ||
      !v ||
      !v.recordSha256 ||
      decision === "" ||
      inFlight.current ||
      !mounted.current ||
      !current()
    )
      return;
    inFlight.current = true;
    dispatch({ type: "submit_start" });
    try {
      await saveCitationFindingReviewFn({
        data: { ...target, expectedSha: v.recordSha256, decision, note: note.trim() || null },
      });
      // A late result under a retired/replaced identity (unmounted OR a live session change) neither
      // dispatches nor refetches.
      if (!mounted.current || !current()) return;
      dispatch({ type: "submit_ok" });
      await Promise.all([view.refetch(), reviews.refetch()]);
    } catch (e) {
      if (!mounted.current || !current()) return;
      const code = errorCode(e);
      // Stale/conflict: the reducer clears the pending decision + note EXPLICITLY (a conflict can occur at the
      // same hash), then the finding + receipts are re-read; the reviewer must inspect and choose again.
      dispatch({ type: "submit_failed", code });
      if (reviewErrorAction(code) === "refresh")
        await Promise.all([view.refetch(), reviews.refetch()]);
    } finally {
      inFlight.current = false;
    }
  }
  async function withdraw(id: string) {
    // Own withdrawal stays available after assignment revocation, but only within the still-current session.
    if (busy || inFlight.current || !mounted.current || !current()) return;
    inFlight.current = true;
    dispatch({ type: "withdraw_start" });
    try {
      await removeCitationFindingReviewFn({ data: { projectId, ownerId, id } });
      // A live session change (actor replacement) retires the dependent dispatch/refetch; the withdrawal
      // transport itself (own receipt) has already completed under the prior authorized session.
      if (!mounted.current || !current()) return;
      dispatch({ type: "withdraw_ok", id });
      // Refresh the receipt list and (only while the surface is not hidden) the finding's current review
      // status. While hidden the finding is NOT re-read: a withdrawal never un-hides a refusal, and there is
      // no reason to pull the material into the cache. After a revocation these reads fail closed again
      // (assignment required) — the local withdrawn id keeps the control honest, and the errors are
      // surfaced below, never shown as "no reviews".
      await Promise.all([reviews.refetch(), hidden ? Promise.resolve() : view.refetch()]);
    } catch {
      // No late failure dispatch under a retired/replaced session.
      if (!mounted.current || !current()) return;
      dispatch({ type: "withdraw_failed" });
    } finally {
      inFlight.current = false;
    }
  }

  // The caller's own active receipt. It is read from the LAST receipt page React Query still holds even when
  // the receipt read now errors (assignment revoked/expired): the released withdrawal RPC permits withdrawing
  // one's OWN receipt without a current assignment, and a receipt's decision is the reviewer's own — not the
  // owner's finding material.
  // The cached own receipt and its withdrawal action are available only within the still-current authenticated
  // session (own withdrawal survives assignment revocation, but NOT a retired/replaced session).
  const mine = live ? ownActiveReceipt(reviews.data?.reviews, form.withdrawnIds) : null;
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
      <Button
        size="sm"
        variant="ghost"
        className="min-h-11"
        disabled={busy}
        onClick={() => withdraw(mine.id)}
      >
        {t("citationReview.reviewer.withdraw")}
      </Button>
    </div>
  ) : null;

  // Retired/replaced session: show nothing (not even own-receipt controls) until it is current again; the
  // route normally remounts, but a surviving mount during a hydration/epoch/actor transition masks here.
  if (!live) return <p className="text-sm text-muted-foreground">{t("citationReview.loading")}</p>;
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
          {" · "}
          {t(`citationAuthoring.binding.${scopeBinding(v.scopeEnforcedAt)}`)}
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
            className="h-11 w-52 text-xs"
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
          className="h-11 flex-1 min-w-40 rounded border border-border bg-background px-2 text-sm"
          value={note}
          maxLength={NOTE_MAX}
          aria-label={t("citationReview.reviewer.noteLabel")}
          onChange={(e) => dispatch({ type: "note", note: e.target.value })}
          placeholder={t("citationReview.reviewer.notePlaceholder")}
        />
        <Button size="sm" className="min-h-11" disabled={!canSubmit} onClick={submit}>
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
                  <div className="space-y-1">
                    <div className="flex flex-wrap gap-2">
                      <span className="font-medium">{t("citationReview.evidence.native")}</span>
                      <span className={chip}>
                        {e.available
                          ? t("citationReview.evidence.available")
                          : t("citationReview.evidence.deleted")}
                      </span>
                    </div>
                    {/* An authorized+consented, live-resolving BOUND native carries its exact parsed
                        interpretation; render it with the SAME source-specific projection the owner
                        intake uses (all rows/statuses, period/timezone/market unknowns, withheld counts,
                        limitation note). A bare/legacy or unconsented native carries none and stays
                        non-inspectable. This lives inside the reviewer exposure mask (v only exists after
                        a successful scoped read); it never reads an owner intake endpoint. */}
                    {e.nativeMaterial ? (
                      <ReportView
                        view={{
                          input: e.nativeMaterial.input,
                          withheldPageRows: e.nativeMaterial.withheldPageRows,
                          partial: e.nativeMaterial.partial,
                        }}
                        note={e.nativeMaterial.limitationNote}
                        label={(k) => t("nativeIntake." + k)}
                        t={t}
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {t("nativeIntake.review.nativeBare")}
                      </p>
                    )}
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
