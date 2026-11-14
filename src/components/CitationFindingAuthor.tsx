import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { getWorkspaceSaveContext, useStore } from "@/lib/store";
import { Button } from "./ui/button";
import { FindingRecordView } from "./CitationReviewPanel";
import { ReportView } from "./NativeGoogleIntakePanel";
import { readAnswerEvidenceFn } from "@/lib/answer-evidence.functions";
import { readCitationProtocolFn } from "@/lib/citation-protocol.functions";
import { readProjectKnowledgeFn } from "@/lib/project-knowledge.functions";
import { readCitationBusinessFactsFn } from "@/lib/citation-business-fact.functions";
import {
  getCitationFindingFn,
  readCitationFindingsFn,
  saveCitationFindingFn,
} from "@/lib/citation-record.functions";
import { lockedScopes } from "@/lib/citation-panel-ui";
import { factChains } from "@/lib/citation-business-fact-ui";
import { scopeBinding, type CitationPanelScope } from "@/lib/citation-record";
import type { Finding } from "@/lib/citation-finding";
import { isNativeIntakeSource } from "@/lib/native-google-intake-ui";
import { readNativeArtifactsFn } from "@/lib/native-ai-artifact.functions";
import {
  readNativeReportBindingFn,
  readNativeReportParsedFn,
} from "@/lib/native-google-intake.functions";
import type { NativeReportParsedRecord } from "@/lib/native-google-intake";
import {
  authoringIdentity,
  authoringReducer,
  canContinueOnHead,
  draftFromRecord,
  emptyAccuracy,
  emptySupport,
  headRows,
  initialAuthoringState,
  instantDisplayDiffers,
  instantFromUtcInput,
  instantToUtcInput,
  newFindingDraft,
  retargetSource,
  reviewedBindingCurrent,
  staleSelections,
  type AuthoringState,
  type FindingDraft,
  type NativeDraftRef,
} from "@/lib/citation-authoring";

// Required journey selects/inputs share this class; `min-h-11` holds the 44px minimum target (the h-9
// base keeps the visual height) without a global control redesign.
const field = "mt-1 h-9 min-h-11 w-full rounded border border-border bg-background px-2 text-sm";
const area = "mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm";
const chip =
  "text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border border-border text-muted-foreground";

/**
 * Owner finding authoring for BOTH gap families over the released P3 save/read functions (+ the additive
 * expected-head guard and locked-scope enforcement). Evidence, source records and dated facts are chosen by
 * exact stored id/revision from fresh reads; the exact record is shown before saving and FROZEN for the save and
 * every retry (a lost response is retried byte-identically, so the server's idempotency returns the stored row);
 * a failed save keeps the draft; an edit is anchored to the head ROW the owner opened (version + immutable id);
 * a version conflict shows the current stored head for comparison and lets the owner continue on top of it only
 * when that head could be shown. All state lives in the pure `authoringReducer` (regression-tested without a
 * DOM) and is bound to the owner+project identity. Review handoff is the existing P4 grant flow below.
 */
export function CitationFindingAuthor({
  projectId,
  ownerId,
  onSaved,
  initialState,
}: {
  projectId: string;
  ownerId: string;
  onSaved?: () => void;
  /** Test/harness seam only: start from a given reducer state (e.g. a loaded conflict) for static assertions. */
  initialState?: AuthoringState;
}) {
  const t = useT();
  const qc = useQueryClient();
  const scope = { projectId, expectedOwnerId: ownerId };
  const identity = authoringIdentity(ownerId, projectId);
  // Re-render on any workspace session change so the live gate and the epoch-scoped keys below reflect it.
  useStore((s) => s.userId);
  useStore((s) => s.hydrated);
  const { user } = useAuth();
  const authIdRef = useRef(user?.id ?? null);
  authIdRef.current = user?.id ?? null;
  // The session this form belongs to, fixed at mount (same pattern as NativeGoogleIntakePanel). Every
  // transport and every post-await continuation re-checks the LIVE session against it, so a sign-out,
  // actor replacement, hydration pause, same-actor epoch change or project switch retires pending
  // reads/writes/consent instead of exposing material or dispatching dependent calls under a new identity.
  const boundSession = useRef({
    actor: ownerId,
    epoch: getWorkspaceSaveContext().epoch,
    projectId,
  });
  const epoch = boundSession.current.epoch;
  const sessionCurrent = () => {
    const ctx = getWorkspaceSaveContext();
    return (
      authIdRef.current === boundSession.current.actor &&
      ctx.userId === boundSession.current.actor &&
      ctx.epoch === boundSession.current.epoch &&
      ctx.hydrated &&
      projectId === boundSession.current.projectId
    );
  };
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);
  // Native-cite token: bumped at the start of each cite AND whenever the active draft/selection changes, so a
  // late binding/material read from a superseded cite or a different draft can never patch state. It is
  // DISTINCT from the save/startEdit mutex (`busyRef`): a successful save resets the draft (bumping this
  // token) but that must not strand the save's own `busy` cleanup, so the mutations below own `busyRef`
  // directly and recheck the live session (not this token) after each await.
  const citeOp = useRef(0);
  const busyRef = useRef(false);
  // Every read re-checks the live session BEFORE the request AND after it resolves (a session retired
  // mid-read never caches owner material); every key carries the epoch so a new same-actor session never
  // reuses the previous session's cache before its own fresh read.
  const guarded =
    <T,>(fn: () => Promise<T>) =>
    async (): Promise<T> => {
      if (!sessionCurrent()) throw Error("citation_author_retired");
      const d = await fn();
      if (!sessionCurrent()) throw Error("citation_author_retired");
      return d;
    };
  const protocol = useQuery({
    queryKey: ["citation-protocol", ownerId, projectId, epoch],
    queryFn: guarded(() => readCitationProtocolFn({ data: scope })),
    staleTime: 0,
    retry: false,
  });
  const evidence = useQuery({
    queryKey: ["answer-evidence", ownerId, projectId, epoch],
    queryFn: guarded(() => readAnswerEvidenceFn({ data: scope })),
    staleTime: 0,
    retry: false,
  });
  const knowledge = useQuery({
    queryKey: ["project-knowledge", ownerId, projectId, epoch],
    queryFn: guarded(() => readProjectKnowledgeFn({ data: { projectId } })),
    staleTime: 0,
    retry: false,
  });
  const facts = useQuery({
    queryKey: ["citation-business-facts", ownerId, projectId, epoch],
    queryFn: guarded(() => readCitationBusinessFactsFn({ data: scope })),
    staleTime: 0,
    retry: false,
  });
  const findings = useQuery({
    queryKey: ["citation-findings", ownerId, projectId, epoch],
    queryFn: guarded(() => readCitationFindingsFn({ data: scope })),
    staleTime: 0,
    retry: false,
  });
  // Saved native reports this owner/project can cite. The query key is IDENTICAL to the intake panel's
  // (NativeGoogleIntakePanel), so the two share one session-scoped cache: an import or delete in the intake
  // panel above updates this list without navigation. Only a CURRENT successful read qualifies freshness
  // (`nativeListReady` below); the per-artifact authoritative binding + full parsed material come from the
  // narrow owner reads when the owner explicitly cites a report (never a browser digest or a cached success).
  const nativeArtifacts = useQuery({
    queryKey: ["native-artifacts", ownerId, projectId, epoch],
    queryFn: guarded(() => readNativeArtifactsFn({ data: scope })),
    staleTime: 0,
    retry: false,
  });
  const natives = useMemo(
    () =>
      (nativeArtifacts.data?.artifacts ?? []).filter((a) =>
        isNativeIntakeSource(a.metadata.source),
      ),
    [nativeArtifacts.data],
  );
  const scopes = useMemo(() => lockedScopes(protocol.data?.panels ?? []), [protocol.data]);
  const answers = useMemo(() => evidence.data?.answers ?? [], [evidence.data]);
  const sources = useMemo(
    () => (knowledge.data?.sources ?? []).filter((s) => s.status === "active"),
    [knowledge.data],
  );
  const records = useMemo(() => knowledge.data?.records ?? [], [knowledge.data]);
  const factHeads = useMemo(() => factChains(facts.data?.facts ?? []), [facts.data]);
  const list = useMemo(() => findings.data?.findings ?? [], [findings.data]);

  const [stored, dispatch] = useReducer(
    authoringReducer,
    initialState ?? initialAuthoringState(identity),
  );
  // A draft never renders — and is never submitted — under another owner/project than it was started in: the
  // AppShell project picker swaps the active project in place, so until the reset effect below has run, the
  // stored state of the previous identity is treated as absent.
  const view = stored.identity === identity ? stored : initialAuthoringState(identity);
  useEffect(() => {
    dispatch({ type: "scopeChanged", identity });
  }, [identity]);
  const { draft, stage, issues, errorKey, conflict, saved, reviewed } = view;
  const [busy, setBusy] = useState(false);
  const [editPick, setEditPick] = useState("");
  const [nativeBusy, setNativeBusy] = useState(false);
  const [nativeError, setNativeError] = useState<string | null>(null);
  const [addNativeId, setAddNativeId] = useState("");
  // The CURRENT full parsed material of each cited bound native (keyed by artifact id), read from the
  // authoritative owner read so the owner inspects the exact selected set (all rows/unknowns/withheld/
  // limitations) via ReportView BEFORE Review/Save. `failedMaterial` records an id whose current read
  // failed so it is not silently treated as inspectable. Both are retired with the draft/op below.
  const [material, setMaterial] = useState<Record<string, NativeReportParsedRecord>>({});
  const [failedMaterial, setFailedMaterial] = useState<Record<string, true>>({});
  const heads = useMemo(() => headRows(list), [list]);

  const answerRow = draft?.answerId
    ? answers.find((a) => a.id.toLowerCase() === draft.answerId!.toLowerCase())
    : undefined;
  // Null while the evidence read is pending/failed or the answer is gone: review is refused and a frozen payload
  // no longer matches (`bindingCurrent` false) — the capture instant is never invented.
  const answerCapturedAt = answerRow?.input.capturedAt ?? null;
  const bindingCurrent = reviewedBindingCurrent(view, answerCapturedAt);
  const fresh = {
    answers,
    sources,
    records,
    facts: facts.data?.facts ?? [],
    lockedScopes: scopes,
    natives,
  };
  const stale = draft ? staleSelections(draft, fresh) : [];
  // A native-only finding cites saved native reports and NO captured answer; it asserts none of the
  // answer-at-capture facts (decision #3). The form omits those controls and explains the absence.
  const nativeOnly = !!draft && !draft.answerId && draft.natives.length > 0;
  // LIVE session for this render (same predicate the async handlers/reads use). A surviving mount whose
  // session has retired (hydration pause / epoch change before the route remounts) must expose NO private
  // draft/material/preview/list and admit NO action — the owner/project reducer identity alone is not enough.
  const sessionLive = sessionCurrent();
  // Native readiness gate shared by the form AND Review/Save (one predicate, so a click can never outrun it):
  //  - the current native list must be read by a CURRENT successful session read — NOT merely cached success:
  //    a background refetch (`isFetching`) or any error/pending does not qualify;
  //  - no cited native may be stale (the fresh list confirmed its deletion);
  //  - no native read may be in flight;
  //  - every cited BOUND, non-stale native must have its CURRENT parsed material loaded (bare refs need none).
  const nativeListReady =
    nativeArtifacts.isSuccess && !nativeArtifacts.isError && !nativeArtifacts.isFetching;
  const citesNative = (draft?.natives.length ?? 0) > 0;
  const staleNatives = stale.filter((s) => s.startsWith("native."));
  const boundNatives = draft ? draft.natives.filter((n) => n.binding) : [];
  const materialReady =
    !citesNative ||
    (nativeListReady && staleNatives.length === 0 && boundNatives.every((n) => material[n.id]));
  // Readiness also requires the live session: a retired mount admits no Review even with cached material.
  const nativeReady = sessionLive && !nativeBusy && materialReady;

  // Changing the active draft/selection (New/Edit/Cancel/scope) bumps the cite token so any native read still
  // in flight for the PREVIOUS draft is discarded on arrival (it can never patch the new draft), and drops
  // the previous draft's loaded/failed material. Called synchronously with the dispatch, so there is no
  // window in which a late response could see the stale token. It deliberately does NOT touch `busyRef`: the
  // save/startEdit mutex is owned by those operations and is not a native-cite concern.
  const retireNative = () => {
    citeOp.current += 1;
    setNativeBusy(false);
    setNativeError(null);
    setAddNativeId("");
    setMaterial({});
    setFailedMaterial({});
  };
  // Defence in depth: if the active draft identity changes for any other reason, retire the native cite/material.
  const activeDraftId = draft?.findingId ?? null;
  useEffect(() => {
    citeOp.current += 1;
    setNativeBusy(false);
    setNativeError(null);
    setMaterial({});
    setFailedMaterial({});
  }, [activeDraftId]);

  function startNew(family: Finding["family"]) {
    if (busyRef.current || !sessionCurrent()) return;
    retireNative();
    const d = newFindingDraft(crypto.randomUUID(), family);
    d.scope = scopes[0]
      ? {
          panelId: scopes[0].panelId,
          panelVersion: scopes[0].panelVersion,
          client: scopes[0].client,
        }
      : null;
    dispatch({ type: "startNew", draft: d });
  }
  async function startEdit(rowId: string) {
    if (!rowId || busyRef.current || !sessionCurrent()) return;
    retireNative();
    busyRef.current = true;
    setBusy(true);
    try {
      const detail = await getCitationFindingFn({ data: { ...scope, id: rowId } });
      // Guard on the LIVE session (not a token the draft-reset could bump): a retired/replaced session drops it.
      if (!mounted.current || !sessionCurrent()) return;
      if (!detail.recordValid) {
        dispatch({ type: "unavailable" });
        return;
      }
      // Anchored to the ROW actually opened (its id + version), never to the list's head: if the list was stale
      // the server conflicts and the owner compares the real head before continuing.
      dispatch({
        type: "startEdit",
        draft: draftFromRecord(
          detail.record,
          { panelId: detail.panelId, panelVersion: detail.panelVersion, client: detail.client },
          { id: detail.id, version: detail.version },
        ),
      });
    } catch {
      if (!mounted.current || !sessionCurrent()) return;
      dispatch({ type: "unavailable" });
    } finally {
      // This operation OWNS the mutex: always release it (recovering the controls), only touching React state
      // while still mounted. Retirement unmounts via the route key, so a stranded busy cannot occur.
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function review() {
    // Same readiness predicate as the Review button (which includes the live session), plus an explicit
    // live-session re-check so a retained handler can never dispatch Review under a retired session.
    if (!draft || busy || !nativeReady || !sessionCurrent()) return;
    dispatch({ type: "review", ownerId, nowIso: new Date().toISOString(), answerCapturedAt });
  }
  async function save() {
    // Exactly the FROZEN reviewed payload is sent (never rebuilt at click time); the token is the inspected head.
    // The native readiness predicate is re-checked here (not only in the disabled state), so a save can never
    // outrun a pending/failed native list or a bound native whose current material was not inspected.
    if (
      !draft ||
      !reviewed ||
      busyRef.current ||
      stale.length ||
      !bindingCurrent ||
      !nativeReady ||
      !sessionCurrent()
    )
      return;
    busyRef.current = true;
    setBusy(true);
    dispatch({ type: "saveStarted" });
    try {
      const result = await saveCitationFindingFn({
        data: {
          ...scope,
          scope: reviewed.scope,
          finding: reviewed.finding,
          expectedVersion: draft.expectedVersion,
          expectedHeadId: draft.expectedHeadId,
        },
      });
      // After the awaited write: never dispatch, invalidate or call onSaved under a retired/replaced session.
      if (!mounted.current || !sessionCurrent()) return;
      dispatch({ type: "saved", version: result.version });
      await qc.invalidateQueries({ queryKey: ["citation-findings", ownerId, projectId] });
      // Re-check the LIVE session AFTER the awaited invalidation, BEFORE the dependent onSaved callback.
      if (!mounted.current || !sessionCurrent()) return;
      onSaved?.();
    } catch (e) {
      if (!mounted.current || !sessionCurrent()) return;
      const code = e instanceof Error ? e.message : "";
      dispatch({ type: "saveFailed", code });
      if (code === "citation_finding_version_conflict") {
        // Show the CURRENT stored head for comparison; the draft is kept untouched. Continuation is offered only
        // when the head could be read AND validated (`recordValid`); otherwise the owner is told it is unavailable.
        try {
          const current = await readCitationFindingsFn({ data: scope });
          if (!mounted.current || !sessionCurrent()) return;
          const head = headRows(current.findings).find(
            (f) => f.findingId.toLowerCase() === draft.findingId.toLowerCase(),
          );
          if (head) {
            const detail = await getCitationFindingFn({ data: { ...scope, id: head.id } });
            if (!mounted.current || !sessionCurrent()) return;
            dispatch({
              type: "conflictLoaded",
              head: {
                id: detail.id,
                version: detail.version,
                record: detail.recordValid ? detail.record : null,
              },
            });
          }
        } catch {
          /* the conflict message alone is still honest: no continuation without a shown head */
        }
      }
    } finally {
      // The save OWNS the mutex: release it so the next action (New/Edit) recovers after a successful reset
      // (which bumps the cite token) and after any retirement. Touch React state only while still mounted.
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  // The single choke point for every draft field edit (scope/support/accuracy/native/etc.): a retained
  // handler can never mutate the draft under a retired session (the form is also masked at render below).
  const upd = (patch: Partial<FindingDraft>) => {
    if (!sessionCurrent()) return;
    dispatch({ type: "edit", patch });
  };
  // Read a saved native's AUTHORITATIVE current binding AND full parsed material (narrow owner reads, never a
  // browser digest), verify they name THIS artifact and are parsed/available, then expose the exact material
  // via ReportView. Two distinct modes:
  //  - rebind=true  (bare→bound, or adding a new native): WRITE the current binding onto the ref.
  //  - rebind=false (View an existing bound ref): READ-ONLY — confirm the returned binding equals the STORED
  //    pin and only expose material; a mismatch is left stale/unavailable (never silently rewrites the pin),
  //    so an existing bound version is only changed by deliberate re-authoring.
  // Bound to the exact draft via `citeOp`: a late response after Cancel/New/Edit is discarded (never patches
  // another draft). A pending/failed/unavailable/mismatched read never attaches or qualifies a cached success.
  async function citeNative(id: string, rebind: boolean) {
    if (!draft || busyRef.current || nativeBusy || !id || !sessionCurrent()) return;
    const op = ++citeOp.current;
    const natives0 = draft.natives;
    const existingRef = natives0.find((n) => n.id.toLowerCase() === id.toLowerCase()) ?? null;
    setNativeBusy(true);
    setNativeError(null);
    try {
      const [binding, parsed] = await Promise.all([
        readNativeReportBindingFn({ data: { ...scope, id } }),
        readNativeReportParsedFn({ data: { ...scope, id } }),
      ]);
      // Discard unless the SAME draft is still open under the live session and this cite was not superseded.
      if (!mounted.current || citeOp.current !== op || !sessionCurrent()) return;
      // Cross-response coherence (not just per-response validity): BOTH responses must name the requested
      // artifact, be parsed/available, and the material's artifactId + raw-sha/source/parser must agree with
      // the authoritative binding — otherwise an individually-valid but mismatched pair is refused.
      const ok =
        binding.id === id &&
        binding.available &&
        binding.binding !== null &&
        parsed.id === id &&
        parsed.parseState === "parsed" &&
        parsed.parsed !== null &&
        parsed.parsed.artifactId === id &&
        parsed.parsed.artifactSha256 === binding.binding.rawSha256 &&
        parsed.parsed.input.source === binding.binding.source &&
        parsed.parsed.parserVersion === binding.binding.parserVersion;
      if (!ok) {
        setFailedMaterial((m) => ({ ...m, [id]: true }));
        setNativeError("unbindable");
        return;
      }
      const current = binding.binding!;
      // VIEW of an existing bound ref: preserve the exact stored pin; a differing current binding is stale/
      // unavailable until the owner deliberately re-authors (remove + Bind current writes a new version).
      if (existingRef?.binding && !rebind) {
        const pin = existingRef.binding;
        const same =
          current.rawSha256 === pin.rawSha256 &&
          current.source === pin.source &&
          current.parserVersion === pin.parserVersion &&
          current.parsedSha256 === pin.parsedSha256;
        if (!same) {
          setFailedMaterial((m) => ({ ...m, [id]: true }));
          setNativeError("unbindable");
          return;
        }
        setMaterial((m) => ({ ...m, [id]: parsed.parsed! }));
        setFailedMaterial((m) => {
          const { [id]: _drop, ...rest } = m;
          return rest;
        });
        return;
      }
      // BIND/REBIND (bare→bound or add): write the current binding. Patch ONLY the natives array (computed from
      // the captured pre-read natives, which native serialisation keeps unchanged); the reducer merges it onto
      // the CURRENT draft, so unrelated field edits are preserved.
      const ref: NativeDraftRef = { id, binding: current };
      const existing = natives0.findIndex((n) => n.id.toLowerCase() === id.toLowerCase());
      dispatch({
        type: "edit",
        patch: {
          natives:
            existing >= 0 ? natives0.map((n, i) => (i === existing ? ref : n)) : [...natives0, ref],
        },
      });
      setMaterial((m) => ({ ...m, [id]: parsed.parsed! }));
      setFailedMaterial((m) => {
        const { [id]: _drop, ...rest } = m;
        return rest;
      });
      setAddNativeId("");
    } catch {
      if (!mounted.current || citeOp.current !== op || !sessionCurrent()) return;
      setFailedMaterial((m) => ({ ...m, [id]: true }));
      setNativeError("failed");
    } finally {
      if (citeOp.current === op) setNativeBusy(false);
    }
  }
  const removeNative = (id: string) => {
    if (!draft || nativeBusy) return;
    upd({ natives: draft.natives.filter((n) => n.id.toLowerCase() !== id.toLowerCase()) });
    setMaterial((m) => {
      const { [id]: _drop, ...rest } = m;
      return rest;
    });
    setFailedMaterial((m) => {
      const { [id]: _drop, ...rest } = m;
      return rest;
    });
  };
  const nativeLabel = (id: string) => {
    const a = natives.find((x) => x.id.toLowerCase() === id.toLowerCase());
    if (!a) return id;
    return `${t("nativeIntake.source." + a.metadata.source)} · ${a.metadata.declaredProperty} · ${a.metadata.period.start} → ${a.metadata.period.end}`;
  };
  const selectScope = (key: string) => {
    const s = scopes.find((x) => `${x.panelId}:${x.panelVersion}` === key);
    retireNative();
    upd({
      scope: s ? { panelId: s.panelId, panelVersion: s.panelVersion, client: s.client } : null,
    });
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <header className="space-y-1">
        <h3 className="font-display text-lg">{t("citationAuthoring.author.title")}</h3>
        <p className="text-xs text-muted-foreground max-w-3xl">
          {t("citationAuthoring.author.intro")}
        </p>
      </header>
      {/* A retired session (hydration pause / epoch change before the route remounts) masks the ENTIRE
          private surface — draft, cited-native list, loaded material/preview and the findings binding note —
          and admits no action, until the live session is current again. The draft/material data survive in
          state for the authorized lifetime; only their exposure is gated here. */}
      {!sessionLive ? (
        <p className="text-sm text-muted-foreground">{t("citationAuthoring.common.loading")}</p>
      ) : (
        <>
          {saved ? (
            <p className="text-xs text-emerald-600">
              {t("citationAuthoring.author.saved", { version: saved.version })}
            </p>
          ) : null}
          {!draft ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="min-h-11"
                disabled={busy || scopes.length === 0}
                onClick={() => startNew("citation_source")}
              >
                {t("citationAuthoring.author.new")} · {t("citationReview.family.citation_source")}
              </Button>
              <Button
                size="sm"
                className="min-h-11"
                disabled={busy || scopes.length === 0}
                onClick={() => startNew("recommendation_accuracy")}
              >
                {t("citationAuthoring.author.new")} ·{" "}
                {t("citationReview.family.recommendation_accuracy")}
              </Button>
              {scopes.length === 0 && !protocol.isPending ? (
                <span className="text-xs text-amber-600">
                  {t("citationAuthoring.author.scopeNone")}
                </span>
              ) : null}
              {heads.length ? (
                <label className="text-sm flex items-center gap-2">
                  <span>{t("citationAuthoring.author.editExisting")}</span>
                  <select
                    className={`${field} mt-0 w-72 min-h-11`}
                    value={editPick}
                    onChange={(e) => setEditPick(e.target.value)}
                    disabled={busy}
                  >
                    <option value="">{t("citationAuthoring.author.editPick")}</option>
                    {heads.map((f) => (
                      <option key={f.id} value={f.id}>
                        {t(`citationReview.family.${f.family}`)} · v{f.version} ·{" "}
                        {f.createdAt.slice(0, 10)}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    disabled={busy || !editPick}
                    onClick={() => startEdit(editPick)}
                  >
                    {t("citationAuthoring.author.editExisting")}
                  </Button>
                </label>
              ) : null}
              {errorKey ? (
                <p className="text-xs text-destructive">
                  {t(`citationAuthoring.saveError.${errorKey}`)}
                </p>
              ) : null}
            </div>
          ) : stage === "review" && reviewed ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">
                  {t("citationAuthoring.author.review")}
                </span>
                <span className={chip}>{t(`citationReview.family.${draft.family}`)}</span>
                <span className={chip}>{t(`citationReview.decision.${draft.decision}`)}</span>
                <span>
                  {reviewed.scope.client.name} · {reviewed.scope.client.market} · v
                  {reviewed.scope.panelVersion}
                </span>
              </div>
              {/* The FROZEN payload: what is shown here is byte-for-byte what Save (and any retry) sends. */}
              <FindingRecordView record={reviewed.finding} />
              {stale.length || !bindingCurrent ? (
                // A reference that vanished, or an evidence binding (the answer's capture instant) that no longer
                // matches the frozen payload: Save is refused until the owner reviews again; nothing is rebuilt.
                <p
                  className="text-xs text-amber-600"
                  data-binding-stale={!bindingCurrent || undefined}
                >
                  {t("citationAuthoring.author.stale", {
                    fields: [...stale, ...(bindingCurrent ? [] : ["evidence"])].join(", "),
                  })}
                </p>
              ) : null}
              {errorKey ? (
                <div className="space-y-2">
                  <p className="text-xs text-destructive">
                    {t("citationAuthoring.author.error")}:{" "}
                    {t(`citationAuthoring.saveError.${errorKey}`)}
                  </p>
                  {conflict ? (
                    <div className="rounded-lg border border-amber-500/40 p-3 space-y-2">
                      <div className="text-xs font-medium">
                        {t("citationAuthoring.author.conflictTitle")} · v{conflict.version}
                      </div>
                      {conflict.record ? (
                        <>
                          <FindingRecordView record={conflict.record} />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || !canContinueOnHead(view)}
                            onClick={() => dispatch({ type: "continueOnHead" })}
                          >
                            {t("citationAuthoring.author.conflictContinue", {
                              version: conflict.version,
                            })}
                          </Button>
                        </>
                      ) : (
                        // The current head could not be shown/validated: no consent token is offered; the draft stays.
                        <p className="text-xs text-amber-700">
                          {t("citationAuthoring.author.conflictUnavailable")}
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="min-h-11"
                  disabled={busy || stale.length > 0 || !bindingCurrent || !nativeReady}
                  onClick={save}
                >
                  {t("citationAuthoring.author.save", { version: draft.expectedVersion + 1 })}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => dispatch({ type: "back" })}
                >
                  {t("citationAuthoring.author.back")}
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                review();
              }}
            >
              <fieldset className="grid gap-3 sm:grid-cols-2" disabled={busy}>
                <div className="text-sm">
                  {t("citationAuthoring.author.family")}
                  <div className="mt-1">
                    <span className={chip}>{t(`citationReview.family.${draft.family}`)}</span>
                  </div>
                </div>
                <label className="text-sm">
                  {t("citationAuthoring.author.scope")}
                  <select
                    className={field}
                    value={draft.scope ? `${draft.scope.panelId}:${draft.scope.panelVersion}` : ""}
                    onChange={(e) => selectScope(e.target.value)}
                  >
                    <option value="">—</option>
                    {scopes.map((s) => (
                      <option
                        key={`${s.panelId}:${s.panelVersion}`}
                        value={`${s.panelId}:${s.panelVersion}`}
                      >
                        {t(`citationAuthoring.panels.kind.${s.kind}`)} · {s.client.name} ·{" "}
                        {s.client.market} · v{s.panelVersion}
                      </option>
                    ))}
                  </select>
                  {draft.expectedVersion > 0 ? (
                    <span className="text-[11px] text-muted-foreground">
                      {t("citationAuthoring.author.scopeNote")}
                    </span>
                  ) : null}
                </label>
                <label className="text-sm">
                  {t("citationAuthoring.author.answer")}
                  <select
                    className={field}
                    value={draft.answerId ?? ""}
                    onChange={(e) => upd({ answerId: e.target.value || null })}
                  >
                    <option value="">
                      {answers.length ? "—" : t("citationAuthoring.author.answerNone")}
                    </option>
                    {answers.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.input.capturedAt.slice(0, 10)} · {a.input.surface} ·{" "}
                        {a.prompt.data.prompt.slice(0, 60)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  {t("citationAuthoring.author.source")}
                  <select
                    className={field}
                    value={draft.sourceId ?? ""}
                    onChange={(e) => upd(retargetSource(draft, e.target.value || null))}
                  >
                    <option value="">
                      {sources.length ? "—" : t("citationAuthoring.author.sourceNone")}
                    </option>
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label} · r{s.revision}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  {t("citationAuthoring.author.entityMatch")}
                  <select
                    className={field}
                    value={draft.entityMatch}
                    onChange={(e) =>
                      upd({ entityMatch: e.target.value as FindingDraft["entityMatch"] })
                    }
                  >
                    {(["confirmed", "ambiguous", "not_this_business"] as const).map((v) => (
                      <option key={v} value={v}>
                        {t(`citationAuthoring.entity.${v}`)}
                      </option>
                    ))}
                  </select>
                </label>
                {!nativeOnly ? (
                  <div className="text-sm space-y-1">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.answerComplete}
                        onChange={(e) => upd({ answerComplete: e.target.checked })}
                      />
                      {t("citationAuthoring.author.answerComplete")}
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.citationsComplete}
                        onChange={(e) => upd({ citationsComplete: e.target.checked })}
                      />
                      {t("citationAuthoring.author.citationsComplete")}
                    </label>
                  </div>
                ) : null}
              </fieldset>
              {/* Cited native reports (0..n). Every reference is preserved on edit (bound or legacy/bare);
              citing CURRENT material reads the authoritative binding, and a native-only finding omits the
              answer-derived controls below. */}
              <fieldset className="space-y-2 rounded border border-border p-3" disabled={busy}>
                <div className="text-xs font-medium text-foreground/70">
                  {t("nativeIntake.bind.heading")}
                </div>
                <p className="text-[11px] text-muted-foreground">{t("nativeIntake.bind.intro")}</p>
                {draft.natives.length ? (
                  <ul className="space-y-1">
                    {draft.natives.map((n, i) => {
                      const refStale = stale.includes(`native.${i}`);
                      // Material is shown ONLY while the current list read confirms the ref is still live (a
                      // deleted/stale ref or a pending/failed/background list read masks the report, so a
                      // "deleted" badge can never coexist with a full report).
                      const mat = nativeListReady && !refStale ? material[n.id] : undefined;
                      const needsMaterial = !!n.binding && !refStale && !mat;
                      return (
                        <li
                          key={n.id}
                          className="rounded border border-border p-2 text-xs space-y-1"
                          data-native-ref={n.id}
                          data-native-bound={n.binding ? "true" : "false"}
                          data-native-material={mat ? "true" : undefined}
                        >
                          <div className="break-words [overflow-wrap:anywhere]">
                            {nativeLabel(n.id)}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={chip}>
                              {refStale
                                ? t("nativeIntake.bind.missing")
                                : n.binding
                                  ? t("nativeIntake.bind.bound")
                                  : t("nativeIntake.bind.bare")}
                            </span>
                            {/* Bare → deliberate Bind current (writes a new binding); bound-but-not-inspected →
                            read-only View current material (preserves the stored pin). */}
                            {!refStale && (!n.binding || needsMaterial) ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="min-h-11"
                                disabled={busy || nativeBusy || !nativeListReady}
                                onClick={() => citeNative(n.id, !n.binding)}
                              >
                                {t(
                                  n.binding ? "nativeIntake.view" : "nativeIntake.bind.bindCurrent",
                                )}
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="min-h-11"
                              disabled={busy || nativeBusy}
                              onClick={() => removeNative(n.id)}
                            >
                              {t("citationAuthoring.common.remove")}
                            </Button>
                          </div>
                          {/* The EXACT current parsed material of a bound, inspected, still-live native — all
                          retained rows/unknowns/withheld/limitations — shown before Review/Save. */}
                          {mat ? (
                            <div className="rounded bg-muted/40 p-2" data-native-report={n.id}>
                              <ReportView
                                view={{
                                  input: mat.input,
                                  withheldPageRows: mat.withheldPageRows,
                                  partial: mat.partial,
                                }}
                                note={mat.limitationNote}
                                label={(k) => t("nativeIntake." + k)}
                                t={t}
                              />
                            </div>
                          ) : !refStale && failedMaterial[n.id] ? (
                            <p className="text-[11px] text-destructive">
                              {t("nativeIntake.bind.failed")}
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {/* The cited set cannot be confirmed while the current list read is pending/failed: Save is
                blocked (nativeReady false) and a cached success never qualifies recovery. */}
                {citesNative && !nativeListReady ? (
                  <p
                    className="text-[11px] text-amber-700 dark:text-amber-400"
                    data-native-unconfirmed
                  >
                    {t("nativeIntake.loadError")}
                  </p>
                ) : null}
                {natives.length ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className={`${field} w-72 min-h-11`}
                      value={addNativeId}
                      onChange={(e) => setAddNativeId(e.target.value)}
                      aria-label={t("nativeIntake.bind.addLabel")}
                      disabled={!nativeListReady}
                    >
                      <option value="">{t("nativeIntake.bind.addLabel")}</option>
                      {natives
                        .filter(
                          (a) =>
                            !draft.natives.some((n) => n.id.toLowerCase() === a.id.toLowerCase()),
                        )
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {nativeLabel(a.id)}
                          </option>
                        ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      disabled={busy || nativeBusy || !addNativeId || !nativeListReady}
                      onClick={() => citeNative(addNativeId, true)}
                    >
                      {t("nativeIntake.bind.cite")}
                    </Button>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">{t("nativeIntake.bind.none")}</p>
                )}
                {nativeError ? (
                  <p className="text-xs text-destructive">
                    {t("nativeIntake.bind." + nativeError)}
                  </p>
                ) : null}
                {nativeOnly ? (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400" data-native-only>
                    {t("nativeIntake.bind.nativeOnly")}
                  </p>
                ) : null}
              </fieldset>
              <fieldset className="space-y-3" disabled={busy}>
                <label className="text-sm block">
                  {t("citationAuthoring.author.observation")}
                  <textarea
                    className={area}
                    rows={3}
                    maxLength={4000}
                    required
                    value={draft.observation}
                    onChange={(e) => upd({ observation: e.target.value })}
                  />
                </label>
                <label className="text-sm block">
                  {t("citationAuthoring.author.hypothesis")}
                  <textarea
                    className={area}
                    rows={2}
                    maxLength={2000}
                    value={draft.hypothesis}
                    onChange={(e) => upd({ hypothesis: e.target.value })}
                  />
                </label>
                {!nativeOnly ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(["competitorCited", "ownCited"] as const).map((k) => (
                      <label key={k} className="text-sm">
                        {t(`citationAuthoring.author.${k}`)}
                        <select
                          className={field}
                          value={draft[k]}
                          onChange={(e) => upd({ [k]: e.target.value } as Partial<FindingDraft>)}
                        >
                          {(["unknown", "yes", "no"] as const).map((v) => (
                            <option key={v} value={v}>
                              {t(`citationAuthoring.option.${v}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                ) : null}
              </fieldset>
              {/* Recommendation (family B) — distinct from observation and support. Omitted for native-only. */}
              {!nativeOnly ? (
                <fieldset className="space-y-2" disabled={busy}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.recommendation.enabled}
                      onChange={(e) =>
                        upd({
                          recommendation: { ...draft.recommendation, enabled: e.target.checked },
                        })
                      }
                    />
                    {t("citationAuthoring.author.recommendation")}
                  </label>
                  {draft.recommendation.enabled ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm">
                        {t("citationAuthoring.author.recommendation")}
                        <select
                          className={field}
                          value={draft.recommendation.status}
                          onChange={(e) =>
                            upd({
                              recommendation: {
                                ...draft.recommendation,
                                status: e.target.value as FindingDraft["recommendation"]["status"],
                              },
                            })
                          }
                        >
                          {(
                            [
                              "recommended",
                              "mentioned_only",
                              "explicitly_not_recommended",
                              "not_present",
                              "unclear",
                            ] as const
                          ).map((v) => (
                            <option key={v} value={v}>
                              {t(`citationAuthoring.recommendation.${v}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm">
                        {t("citationAuthoring.author.suitability")}
                        <select
                          className={field}
                          value={draft.recommendation.suitability}
                          onChange={(e) =>
                            upd({
                              recommendation: {
                                ...draft.recommendation,
                                suitability: e.target.value as "fits" | "does_not_fit" | "unknown",
                              },
                            })
                          }
                        >
                          {(["fits", "does_not_fit", "unknown"] as const).map((v) => (
                            <option key={v} value={v}>
                              {t(`citationAuthoring.suitability.${v}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm sm:col-span-2">
                        {t("citationAuthoring.author.recommendationPassage")}
                        <textarea
                          className={area}
                          rows={2}
                          maxLength={4000}
                          value={draft.recommendation.passage}
                          onChange={(e) =>
                            upd({
                              recommendation: { ...draft.recommendation, passage: e.target.value },
                            })
                          }
                        />
                      </label>
                      <label className="text-sm sm:col-span-2">
                        {t("citationAuthoring.author.recommendationTarget")}
                        <input
                          className={field}
                          maxLength={300}
                          value={draft.recommendation.target}
                          onChange={(e) =>
                            upd({
                              recommendation: { ...draft.recommendation, target: e.target.value },
                            })
                          }
                        />
                      </label>
                    </div>
                  ) : null}
                </fieldset>
              ) : null}
              {/* Source support & factual accuracy — answer-anchored; omitted for a native-only finding. */}
              {!nativeOnly ? (
                <>
                  <fieldset className="space-y-2" disabled={busy}>
                    <div className="text-xs font-medium text-foreground/70">
                      {t("citationAuthoring.author.support")}
                    </div>
                    {draft.support.map((s, i) => (
                      <div
                        key={i}
                        className="rounded border border-border p-3 grid gap-2 sm:grid-cols-2"
                      >
                        <label className="text-sm sm:col-span-2">
                          {t("citationAuthoring.author.claimSpan")}
                          <input
                            className={field}
                            maxLength={4000}
                            value={s.claimSpan}
                            onChange={(e) =>
                              upd({
                                support: draft.support.map((x, j) =>
                                  j === i ? { ...x, claimSpan: e.target.value } : x,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="text-sm">
                          {t("citationAuthoring.author.citedUrl")}
                          <input
                            className={field}
                            maxLength={2048}
                            value={s.citedUrl}
                            onChange={(e) =>
                              upd({
                                support: draft.support.map((x, j) =>
                                  j === i ? { ...x, citedUrl: e.target.value } : x,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="text-sm">
                          {t("citationAuthoring.author.supportStatus")}
                          <select
                            className={field}
                            value={s.status}
                            onChange={(e) =>
                              upd({
                                support: draft.support.map((x, j) =>
                                  j === i ? { ...x, status: e.target.value as typeof s.status } : x,
                                ),
                              })
                            }
                          >
                            {(
                              [
                                "supports",
                                "partly_supports",
                                "contradicts",
                                "unclear",
                                "not_checked",
                              ] as const
                            ).map((v) => (
                              <option key={v} value={v}>
                                {t(`citationAuthoring.support.${v}`)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {s.status !== "not_checked" ? (
                          <>
                            <label className="text-sm sm:col-span-2">
                              {t("citationAuthoring.author.sourcePassage")}
                              <textarea
                                className={area}
                                rows={2}
                                maxLength={4000}
                                value={s.sourcePassage}
                                onChange={(e) =>
                                  upd({
                                    support: draft.support.map((x, j) =>
                                      j === i ? { ...x, sourcePassage: e.target.value } : x,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label className="text-sm">
                              {t("citationAuthoring.author.sourceCapturedAt")}
                              {/* UTC wall-clock view of the stored instant; the stored string is kept verbatim until edited. */}
                              <input
                                className={field}
                                type="datetime-local"
                                step={1}
                                value={instantToUtcInput(s.sourceCapturedAt)}
                                onChange={(e) =>
                                  upd({
                                    support: draft.support.map((x, j) =>
                                      j === i
                                        ? {
                                            ...x,
                                            sourceCapturedAt: instantFromUtcInput(
                                              e.target.value,
                                              x.sourceCapturedAt,
                                            ),
                                          }
                                        : x,
                                    ),
                                  })
                                }
                              />
                              <span className="block text-[11px] text-muted-foreground">
                                {t("citationAuthoring.author.utcInstant")}
                                {instantDisplayDiffers(s.sourceCapturedAt)
                                  ? ` · ${t("citationAuthoring.author.storedInstant", { value: s.sourceCapturedAt })}`
                                  : null}
                              </span>
                            </label>
                            <label className="text-sm">
                              {t("citationAuthoring.author.selectedRecord")}
                              <select
                                className={field}
                                value={
                                  s.selectedRecord
                                    ? `${s.selectedRecord.recordId}:${s.selectedRecord.recordRevision}`
                                    : ""
                                }
                                onChange={(e) => {
                                  const r = records.find(
                                    (x) => `${x.id}:${x.revision}` === e.target.value,
                                  );
                                  upd({
                                    support: draft.support.map((x, j) =>
                                      j === i
                                        ? {
                                            ...x,
                                            selectedRecord: r
                                              ? {
                                                  sourceId: r.sourceId,
                                                  recordId: r.id,
                                                  sourceRevision: r.sourceRevision,
                                                  recordRevision: r.revision,
                                                }
                                              : null,
                                          }
                                        : x,
                                    ),
                                  });
                                }}
                              >
                                <option value="">
                                  {t("citationAuthoring.author.selectedRecordNone")}
                                </option>
                                {/* Only the CITED source's records can be pinned; with no cited source there is nothing to pin. */}
                                {records
                                  .filter(
                                    (r) =>
                                      draft.sourceId !== null &&
                                      r.sourceId.toLowerCase() === draft.sourceId.toLowerCase(),
                                  )
                                  .map((r) => (
                                    <option
                                      key={`${r.id}:${r.revision}`}
                                      value={`${r.id}:${r.revision}`}
                                    >
                                      {r.value.slice(0, 60)} · {r.locator} · r{r.revision}/s
                                      {r.sourceRevision}
                                    </option>
                                  ))}
                              </select>
                            </label>
                          </>
                        ) : null}
                        <label className="text-sm sm:col-span-2">
                          {t("citationAuthoring.author.reason")}
                          <input
                            className={field}
                            maxLength={500}
                            value={s.reason}
                            onChange={(e) =>
                              upd({
                                support: draft.support.map((x, j) =>
                                  j === i ? { ...x, reason: e.target.value } : x,
                                ),
                              })
                            }
                          />
                        </label>
                        <div>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              upd({ support: draft.support.filter((_, j) => j !== i) })
                            }
                          >
                            {t("citationAuthoring.common.remove")}
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={draft.support.length >= 20}
                      onClick={() => upd({ support: [...draft.support, emptySupport()] })}
                    >
                      {t("citationAuthoring.author.addSupport")}
                    </Button>
                  </fieldset>
                  {/* Factual accuracy claims — pinned to an exact dated fact version. */}
                  <fieldset className="space-y-2" disabled={busy}>
                    <div className="text-xs font-medium text-foreground/70">
                      {t("citationAuthoring.author.accuracy")}
                    </div>
                    {draft.accuracy.map((a, i) => (
                      <div
                        key={i}
                        className="rounded border border-border p-3 grid gap-2 sm:grid-cols-3"
                      >
                        <label className="text-sm sm:col-span-3">
                          {t("citationAuthoring.author.claimSpan")}
                          <input
                            className={field}
                            maxLength={4000}
                            value={a.claimSpan}
                            onChange={(e) =>
                              upd({
                                accuracy: draft.accuracy.map((x, j) =>
                                  j === i ? { ...x, claimSpan: e.target.value } : x,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="text-sm">
                          {t("citationAuthoring.author.accuracy")}
                          <select
                            className={field}
                            value={a.status}
                            onChange={(e) =>
                              upd({
                                accuracy: draft.accuracy.map((x, j) =>
                                  j === i ? { ...x, status: e.target.value as typeof a.status } : x,
                                ),
                              })
                            }
                          >
                            {(
                              [
                                "accurate_at_capture",
                                "incorrect_at_capture",
                                "outdated_now",
                                "unclear",
                                "not_checked",
                              ] as const
                            ).map((v) => (
                              <option key={v} value={v}>
                                {t(`citationAuthoring.accuracy.${v}`)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-sm sm:col-span-2">
                          {t("citationAuthoring.author.fact")}
                          <select
                            className={field}
                            value={a.fact ? a.fact.factRowId : ""}
                            onChange={(e) => {
                              const row = (facts.data?.facts ?? []).find(
                                (f) => f.id === e.target.value,
                              );
                              upd({
                                accuracy: draft.accuracy.map((x, j) =>
                                  j === i
                                    ? {
                                        ...x,
                                        fact: row
                                          ? {
                                              factRowId: row.id,
                                              factId: row.record.factId,
                                              factVersion: row.version,
                                              factKind: row.record.kind,
                                            }
                                          : null,
                                      }
                                    : x,
                                ),
                              });
                            }}
                          >
                            <option value="">{t("citationAuthoring.author.factNone")}</option>
                            {factHeads.flatMap((c) =>
                              c.versions.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {t(`citationAuthoring.kind.${v.record.kind}`)} ·{" "}
                                  {v.record.value.slice(0, 50)} · v{v.version} ·{" "}
                                  {v.record.validFrom.slice(0, 10)}
                                </option>
                              )),
                            )}
                          </select>
                        </label>
                        <div>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              upd({ accuracy: draft.accuracy.filter((_, j) => j !== i) })
                            }
                          >
                            {t("citationAuthoring.common.remove")}
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={draft.accuracy.length >= 20}
                      onClick={() => upd({ accuracy: [...draft.accuracy, emptyAccuracy()] })}
                    >
                      {t("citationAuthoring.author.addAccuracy")}
                    </Button>
                  </fieldset>
                </>
              ) : null}
              <fieldset className="grid gap-3 sm:grid-cols-4" disabled={busy}>
                {(["harm", "relevance", "fixability"] as const).map((k) => (
                  <label key={k} className="text-sm">
                    {t(`citationAuthoring.priority.${k}`)}
                    <select
                      className={field}
                      value={draft.priority[k]}
                      onChange={(e) =>
                        upd({
                          priority: {
                            ...draft.priority,
                            [k]: e.target.value as "low" | "medium" | "high",
                          },
                        })
                      }
                    >
                      {(["low", "medium", "high"] as const).map((v) => (
                        <option key={v} value={v}>
                          {t(`citationAuthoring.level.${v}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <label className="text-sm">
                  {t("citationAuthoring.author.decision")}
                  <select
                    className={field}
                    value={draft.decision}
                    onChange={(e) => upd({ decision: e.target.value as Finding["decision"] })}
                  >
                    {(["needs_second_review", "accepted", "dismissed"] as const).map((v) => (
                      <option key={v} value={v}>
                        {t(`citationReview.decision.${v}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
              {stale.length ? (
                <p className="text-xs text-amber-600">
                  {t("citationAuthoring.author.stale", { fields: stale.join(", ") })}
                </p>
              ) : null}
              {issues.length ? (
                <div className="text-xs text-destructive">
                  {t("citationAuthoring.author.issues")}
                  <ul className="list-disc pl-4">
                    {issues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {errorKey ? (
                <p className="text-xs text-destructive">
                  {t(`citationAuthoring.saveError.${errorKey}`)}
                </p>
              ) : null}
              {/* Native readiness blocks Review until the cited set is confirmed and every bound report's
              CURRENT material has been inspected — the SAME predicate the handler enforces. */}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="min-h-11"
                  type="submit"
                  disabled={busy || !nativeReady}
                >
                  {t("citationAuthoring.author.review")}
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => {
                    retireNative();
                    dispatch({ type: "cancel" });
                  }}
                >
                  {t("citationAuthoring.common.cancel")}
                </Button>
              </div>
            </form>
          )}
          {list.length ? (
            <p className="text-[11px] text-muted-foreground">
              {list.filter((f) => scopeBinding(f.scopeEnforcedAt) === "legacy").length > 0
                ? t("citationAuthoring.binding.legacy")
                : t("citationAuthoring.binding.enforced")}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
