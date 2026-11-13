import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { useAppLanguage, useT } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { getWorkspaceSaveContext, useStore } from "@/lib/store";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { importManualCaptureFn, readCitationProtocolFn } from "@/lib/citation-protocol.functions";
import type { PanelProtocol } from "@/lib/citation-panel";
import {
  canonicalUuid,
  type CitationReport,
  type ErasedSlot,
  type ResolvedCapture,
} from "@/lib/citation-protocol";
import {
  MANUAL_CAPTURE_DEVIATION_CODES,
  MANUAL_CAPTURE_FIELD_LIMITS,
  MANUAL_CAPTURE_FIELD_PLACE,
  MANUAL_CAPTURE_METHOD,
  buildManualCapture,
  emptyManualCaptureForm,
  firstSendIssues,
  issueField,
  issueStep,
  leaveKind,
  manualCaptureChoices,
  manualCaptureFormDirty,
  settleCheck,
  settleSend,
  storedLength,
  type BoundedField,
  type ManualCaptureForm,
  type ManualCaptureIssue,
  type Submission,
} from "@/lib/manual-capture-ui";

// Every new control is at least 44px tall in every viewport.
const field = "mt-1 block min-h-11 w-full rounded border border-border bg-background px-2 text-sm";
const area = "mt-1 block min-h-11 w-full rounded border border-border bg-background p-2 text-sm";
const wrap = "break-words [overflow-wrap:anywhere]";
const action = "min-h-11 whitespace-normal";
const summary = "min-h-11 cursor-pointer py-3 text-sm font-medium leading-5";

type Props = {
  projectId: string;
  ownerId: string;
  /** From the SAME owner+project resolved read the coverage view uses (CG-03B). */
  panels: readonly PanelProtocol[];
  captures: readonly ResolvedCapture[];
  erasedSlots: readonly ErasedSlot[];
  reports: readonly CitationReport[];
  /** Current scoped prompts (answer-evidence read): an approved question needs its exact prompt revision. */
  prompts: readonly { id: string; revision: number }[];
  /** Stored answer records of the scoped protocol read (capacity, and the saved record after a save). */
  answers: readonly { id: string; input: unknown }[] | null;
  /** All three scoped reads (protocol, coverage, prompts) currently succeeded: required for a NEW original. */
  readsCurrent: boolean;
  /** True while the scoped reads after a save could not be loaded. */
  readFailed: boolean;
};

/**
 * CG-03C: one labelled action that opens a modal entry for ONE manually collected, original discovery observation.
 * The entry exists only while open. Nothing is kept in browser storage or a registry.
 */
export function ManualCaptureEntry(props: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant="outline"
        className={`${action} text-left`}
        disabled={!props.readsCurrent || props.answers === null}
        onClick={() => setOpen(true)}
        data-manual-capture-open
      >
        {t("manualCapture.open")}
      </Button>
      <p className="text-xs text-muted-foreground">{t("manualCapture.openHelp")}</p>
      {open ? <ManualCaptureDialog {...props} onClosed={() => setOpen(false)} /> : null}
    </div>
  );
}

const ISSUE_FIELD: Partial<Record<ManualCaptureIssue, string>> = {
  affirmQuestion: "affirm",
  status: "status",
  failureRequired: "failure",
  failureNotAllowed: "failure",
  rawAnswer: "rawAnswer",
  capturedAt: "capturedAt",
  beforeSlot: "capturedAt",
  beforeApproval: "capturedAt",
  inFuture: "capturedAt",
  service: "service",
  interfaceName: "interfaceName",
  mode: "mode",
  freshSession: "freshSession",
  priorMessages: "priorMessages",
  citations: "citations",
  cost: "reportedCostUsd",
  sourceUrl: "sourceUrl",
  deviationNotes: "deviationNotes",
};
/** Label keys for fields whose key differs from `manualCapture.<field>`. */
const LABEL_KEY: Partial<Record<keyof ManualCaptureForm, string>> = {
  affirmQuestion: "manualCapture.affirm",
  webSearchEvidenced: "manualCapture.webSearch",
  reportedCostUsd: "manualCapture.cost",
};
/** Optional context fields (left unknown unless filled in), counted for the review. */
const OPTIONAL: readonly (keyof ManualCaptureForm)[] = [
  "searchMode",
  "modelLabel",
  "webSearchEvidenced",
  "personalisation",
  "signedIn",
  "memory",
  "customInstructions",
  "connectedTools",
  "temporaryChat",
  "accountTier",
  "interfaceLanguage",
  "answerLanguage",
  "collectionCountry",
  "collectionCity",
  "locationInQuestion",
  "devicePermission",
  "vpn",
];
const excerpt = (text: unknown, max = 160) => {
  const s = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

function ManualCaptureDialog({
  projectId,
  ownerId,
  panels,
  captures,
  erasedSlots,
  reports,
  prompts,
  answers,
  readsCurrent,
  readFailed,
  onClosed,
}: Props & { onClosed: () => void }) {
  const t = useT();
  const locale = useAppLanguage();
  const qc = useQueryClient();
  const ids = useId();
  const { user } = useAuth();
  // Re-render on any workspace session change; identity itself is always re-read LIVE below.
  useStore((s) => s.userId);
  useStore((s) => s.hydrated);
  const authId = useRef(user?.id ?? null);
  authId.current = user?.id ?? null;
  // The session this entry belongs to, fixed when it opened.
  const bound = useRef({ actor: ownerId, epoch: getWorkspaceSaveContext().epoch, projectId });
  const sessionCurrent = () => {
    const ctx = getWorkspaceSaveContext();
    return (
      authId.current === bound.current.actor &&
      ctx.userId === bound.current.actor &&
      ctx.epoch === bound.current.epoch &&
      ctx.hydrated &&
      projectId === bound.current.projectId
    );
  };
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  // A new identity per entry: abandoning starts a fresh one, so a late result from the old entry cannot touch it.
  const entryId = useRef(crypto.randomUUID());

  const eligibility = {
    panels,
    captures,
    erasedSlots,
    reports,
    prompts,
    readsCurrent,
  };
  const choices = useMemo(
    () => manualCaptureChoices({ ...eligibility, nowMs: Date.now() }),
    // Re-derive when any scoped read changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panels, captures, erasedSlots, reports, prompts, readsCurrent],
  );
  const [pick, setPick] = useState<{ key: string; questionId: string; round: number } | null>(null);
  const [form, setForm] = useState<ManualCaptureForm>(emptyManualCaptureForm);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submission, setSubmission] = useState<Submission>({ phase: "editing" });
  const [issues, setIssues] = useState<ManualCaptureIssue[]>([]);
  const [leaving, setLeaving] = useState(false);
  const busy = useRef(false);

  const version = choices.find((v) => v.key === pick?.key) ?? null;
  const slot =
    version?.slots.find((s) => s.questionId === pick?.questionId && s.round === pick?.round) ??
    null;
  const dirty = manualCaptureFormDirty(form) || pick !== null;
  const kind = leaveKind(submission, dirty);
  const guard = useRef(false);
  guard.current = kind !== "none";

  function purge() {
    entryId.current = crypto.randomUUID();
    busy.current = false;
    setForm(emptyManualCaptureForm());
    setPick(null);
    setStep(1);
    setIssues([]);
    setSubmission({ phase: "editing" });
    setLeaving(false);
  }
  // Session retired (signed out, another account, re-sign-in or project change): drop everything, never trap.
  const retired = !sessionCurrent();
  useEffect(() => {
    if (retired) {
      purge();
      onClosed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retired]);

  // Router departures (links, programmatic navigation, Back/Forward, search changes) and unload, while the entry
  // holds something it would lose — and only for the still-valid session that owns it.
  const blocker = useBlocker({
    shouldBlockFn: () => guard.current && sessionCurrent(),
    enableBeforeUnload: () => guard.current && sessionCurrent(),
    withResolver: true,
  });

  function requestLeave() {
    if (!sessionCurrent() || !guard.current) {
      purge();
      onClosed();
      return;
    }
    setLeaving(true);
  }
  // Radix also reports Action/Cancel clicks as onOpenChange(false); only an Escape or dismissal means Stay there.
  const acted = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<Element | null>(null);
  function stay() {
    acted.current = true;
    setLeaving(false);
    if (blocker.status === "blocked") blocker.reset();
  }
  function leave() {
    acted.current = true;
    const fromRouter = blocker.status === "blocked";
    purge();
    if (fromRouter) blocker.proceed();
    onClosed();
  }

  const refreshReads = () =>
    Promise.all(
      ["answer-evidence", "citation-protocol", "citation-coverage"].map((k) =>
        qc.invalidateQueries({ queryKey: [k, bound.current.actor, bound.current.projectId] }),
      ),
    );

  /** Full local validation; `upTo` limits the reported issues to the steps so far. */
  function validate(upTo: 1 | 2 | 3) {
    if (!version || !slot) return { ok: false as const, issues: ["slotUnavailable" as const] };
    const out = buildManualCapture({
      version,
      slot,
      form,
      answerCount: answers?.length ?? Infinity,
      nowMs: Date.now(),
    });
    if (out.ok) return out;
    const relevant = out.issues.filter((i) => issueStep(i) <= upTo);
    return relevant.length ? { ok: false as const, issues: relevant } : null;
  }
  function next() {
    if (!sessionCurrent()) return;
    const out = validate(step);
    if (out && !out.ok) {
      setIssues(out.issues);
      return;
    }
    setIssues([]);
    setStep((s) => (s === 1 ? 2 : 3));
  }
  function back() {
    setIssues([]);
    setStep((s) => (s === 3 ? 2 : 1));
  }
  function review() {
    if (!sessionCurrent()) return;
    const out = validate(3);
    if (!out || !out.ok) {
      setIssues(out ? out.issues : ["invalid"]);
      if (out) setStep(Math.min(...out.issues.map(issueStep)) as 1 | 2 | 3);
      return;
    }
    setIssues([]);
    setSubmission({ phase: "review", frozen: out.frozen });
  }

  async function send(attempt: "first" | "resend") {
    if (busy.current || !sessionCurrent()) return;
    if (submission.phase !== "review" && submission.phase !== "unconfirmed") return;
    if (attempt === "first") {
      // A NEW original must still be eligible against the CURRENT scoped reads (a read may have failed, the
      // slot become occupied or the project reached capacity since Review). The reviewed entry is kept. An
      // exact resend of a frozen submission never re-runs this.
      const blocked = pick
        ? firstSendIssues({
            choices: manualCaptureChoices({ ...eligibility, nowMs: Date.now() }),
            pick,
            answerCount: answers?.length ?? null,
          })
        : (["slotUnavailable"] as ManualCaptureIssue[]);
      if (blocked.length) {
        setIssues(blocked);
        return;
      }
    }
    busy.current = true;
    const sending = {
      phase: "sending" as const,
      frozen: submission.frozen,
      attempt,
      uncertain: attempt === "resend",
    };
    const entry = entryId.current;
    setIssues([]);
    setSubmission(sending);
    let outcome: { ok: true; value: unknown } | { ok: false };
    try {
      // The exact frozen object, every time: never rebuilt, never re-timed.
      outcome = {
        ok: true,
        value: await importManualCaptureFn({
          data: {
            projectId: bound.current.projectId,
            expectedOwnerId: bound.current.actor,
            answer: sending.frozen,
          },
        }),
      };
    } catch {
      outcome = { ok: false };
    }
    if (!sessionCurrent()) return; // retired session: no state, no refresh, no message
    void refreshReads(); // a save may have happened either way
    if (!mounted.current || entryId.current !== entry) return; // abandoned: refresh only
    busy.current = false;
    setSubmission(settleSend(sending, outcome));
  }

  async function check() {
    if (busy.current || !sessionCurrent() || submission.phase !== "unconfirmed") return;
    busy.current = true;
    const prior = submission;
    const entry = entryId.current;
    let read: { ok: true; answers: readonly { id: string; input: unknown }[] } | { ok: false };
    try {
      const state = await readCitationProtocolFn({
        data: { projectId: bound.current.projectId, expectedOwnerId: bound.current.actor },
      });
      read = { ok: true, answers: state.answers };
    } catch {
      read = { ok: false };
    }
    if (!sessionCurrent()) return;
    if (!mounted.current || entryId.current !== entry) return;
    busy.current = false;
    const next = settleCheck(prior, read);
    if (next.phase === "confirmed") void refreshReads();
    setSubmission(next);
  }

  // ---- presentation -----------------------------------------------------------------------------------------
  const set = (patch: Partial<ManualCaptureForm>) => setForm((f) => ({ ...f, ...patch }));
  const invalid = (name: string) =>
    issues.some((i) => ISSUE_FIELD[i] === name || issueField(i) === name);
  const groupFlagged = (group: string) =>
    issues.some((i) => {
      const f = issueField(i);
      return f !== null && MANUAL_CAPTURE_FIELD_PLACE[f].group === group;
    });
  const number = (n: number) => new Intl.NumberFormat(locale).format(n);
  const label = (f: keyof ManualCaptureForm) => t(LABEL_KEY[f] ?? `manualCapture.${f}`);
  const where = (f: keyof ManualCaptureForm) => {
    const { step: n, group } = MANUAL_CAPTURE_FIELD_PLACE[f];
    const s = t("manualCapture.stepOf", { n });
    return group ? `${s} · ${t(`manualCapture.optional.${group}`)}` : s;
  };
  /** Field-specific messages name the field, where it is, the accepted limit and the current length. */
  const issueText = (i: ManualCaptureIssue) => {
    const f = issueField(i);
    if (f && i.startsWith("tooLong:")) {
      const b = f as BoundedField;
      return t("manualCapture.issue.tooLong", {
        field: label(f),
        where: where(f),
        count: number(storedLength(b, form[b])),
        max: number(MANUAL_CAPTURE_FIELD_LIMITS[b]),
      });
    }
    if (f && i.startsWith("invalid:"))
      return t("manualCapture.issue.invalidField", { field: label(f), where: where(f) });
    return t(`manualCapture.issue.${i}`);
  };
  /** Live length against the accepted limit; the text is never cut. */
  const counter = (f: BoundedField) => {
    const count = storedLength(f, form[f]);
    const over = count > MANUAL_CAPTURE_FIELD_LIMITS[f];
    return (
      <span
        className={`block ${over ? "font-medium text-destructive" : ""}`}
        data-char-count={f}
        data-over={over || undefined}
      >
        {t("manualCapture.charCount", {
          count: number(count),
          max: number(MANUAL_CAPTURE_FIELD_LIMITS[f]),
        })}
      </span>
    );
  };
  const errId = `${ids}-issues`;
  const aria = (name: string) =>
    invalid(name) ? { "aria-invalid": true as const, "aria-describedby": errId } : {};
  const editing = submission.phase === "editing";
  const opt = (v: string) => t(`manualCapture.opt.${v}`);
  const when = (iso: string) => {
    const ms = Date.parse(iso);
    return Number.isFinite(ms)
      ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(ms)
      : iso;
  };
  const entered = () => `${form.capturedDate} ${form.capturedTime} (UTC${form.utcOffset})`;
  const deviation = (code: string) =>
    MANUAL_CAPTURE_DEVIATION_CODES.has(code)
      ? t(`manualCapture.deviation.${code}`)
      : t("manualCapture.deviation.other", { code });
  const select = (
    name: keyof ManualCaptureForm,
    options: readonly string[],
    label: string,
    help?: string,
  ) => (
    <label className="block text-sm">
      {label}
      <select
        className={field}
        value={String(form[name])}
        onChange={(e) => set({ [name]: e.target.value } as Partial<ManualCaptureForm>)}
        {...aria(String(name))}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o === "" ? t("manualCapture.choose") : opt(o)}
          </option>
        ))}
      </select>
      {help ? <span className="block text-xs text-muted-foreground">{help}</span> : null}
    </label>
  );
  const text = (
    name: keyof ManualCaptureForm,
    label: string,
    help?: ReactNode,
    multiline = false,
  ) => (
    <label className="block text-sm">
      {label}
      {multiline ? (
        <textarea
          className={area}
          rows={name === "rawAnswer" ? 6 : 2}
          value={String(form[name])}
          onChange={(e) => set({ [name]: e.target.value } as Partial<ManualCaptureForm>)}
          {...aria(String(name))}
        />
      ) : (
        <input
          className={field}
          value={String(form[name])}
          onChange={(e) => set({ [name]: e.target.value } as Partial<ManualCaptureForm>)}
          {...aria(String(name))}
        />
      )}
      {help ? <span className="block text-xs text-muted-foreground">{help}</span> : null}
    </label>
  );
  // A group holding a field with an issue is opened so the field is visible.
  const optional = (titleKey: string, children: ReactNode) => (
    <details
      className="rounded border border-border px-3"
      data-optional-group={titleKey}
      open={groupFlagged(titleKey) || undefined}
    >
      <summary className={summary}>{t(`manualCapture.optional.${titleKey}`)}</summary>
      <div className="space-y-2 pb-3">{children}</div>
    </details>
  );
  const expected = version?.panel;
  const unknownCount = OPTIONAL.filter((k) => {
    const v = form[k];
    return v === "" || v === "unknown";
  }).length;
  const saved =
    submission.phase === "confirmed"
      ? (answers?.find((a) => canonicalUuid(a.id) === canonicalUuid(submission.id)) ?? null)
      : null;
  const savedInput = (saved?.input ?? null) as { rawAnswer?: unknown; citations?: unknown } | null;
  const resolved =
    submission.phase === "confirmed"
      ? (captures.find((c) => canonicalUuid(c.answerId) === canonicalUuid(submission.id)) ?? null)
      : null;
  const stepTitle = t(
    `manualCapture.step.${step === 1 ? "choose" : step === 2 ? "answer" : "context"}`,
  );

  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next) requestLeave();
        }}
      >
        <DialogContent
          ref={contentRef}
          // The shared dialog's close (X) is its only direct child button: give it a 44px target here.
          className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto [&>button]:right-2 [&>button]:top-2 [&>button]:grid [&>button]:h-11 [&>button]:w-11 [&>button]:place-items-center"
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            requestLeave();
          }}
          onInteractOutside={(e) => {
            e.preventDefault();
            requestLeave();
          }}
          data-manual-capture-dialog={submission.phase}
          data-manual-capture-step={editing ? step : undefined}
          // What this entry has currently rendered from the scoped reads (read-only; lets a check wait for the
          // committed props rather than the query cache).
          data-reads-current={readsCurrent}
          data-answer-count={answers?.length ?? "unknown"}
          data-selected-slot={slot?.state}
        >
          <DialogTitle className="font-display text-lg pr-10">
            {t("manualCapture.title")}
          </DialogTitle>
          <DialogDescription className={`text-xs text-muted-foreground ${wrap}`}>
            {t("manualCapture.intro")}
          </DialogDescription>

          {editing ? (
            <p className="text-sm font-medium" aria-live="polite" data-step-heading>
              {t("manualCapture.stepOf", { n: step })} · {stepTitle}
            </p>
          ) : null}

          {issues.length ? (
            <div
              id={errId}
              role="alert"
              className="rounded border border-destructive p-2 text-sm text-destructive"
            >
              <p>{t("manualCapture.notSent")}</p>
              <ul className="list-disc pl-5">
                {issues.map((i) => (
                  <li key={i} data-issue={i}>
                    {issueText(i)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {editing && step === 1 ? (
            <div className="space-y-2" data-step="choose">
              {choices.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-manual-capture-none>
                  {t("manualCapture.noVersion")}
                </p>
              ) : (
                <>
                  <label className="block text-sm">
                    {t("manualCapture.version")}
                    <select
                      className={field}
                      value={pick?.key ?? ""}
                      onChange={(e) => {
                        setPick(
                          e.target.value ? { key: e.target.value, questionId: "", round: 0 } : null,
                        );
                        set({ affirmQuestion: false });
                      }}
                    >
                      <option value="">{t("manualCapture.choose")}</option>
                      {choices.map((v) => (
                        <option key={v.key} value={v.key}>
                          {t("manualCapture.versionOption", {
                            version: v.panel.version,
                            client: v.panel.client.name,
                            date: when(v.panel.approval!.approvedAt),
                          })}
                        </option>
                      ))}
                    </select>
                  </label>
                  {version ? (
                    <label className="block text-sm">
                      {t("manualCapture.question")}
                      <select
                        className={field}
                        value={pick?.questionId ?? ""}
                        onChange={(e) => {
                          setPick({ key: version.key, questionId: e.target.value, round: 0 });
                          set({ affirmQuestion: false });
                        }}
                      >
                        <option value="">{t("manualCapture.choose")}</option>
                        {version.panel.questions.map((q, i) => (
                          <option key={q.id} value={q.id}>
                            {t("manualCapture.questionOption", {
                              n: i + 1,
                              text: excerpt(q.text, 90),
                            })}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {version && pick?.questionId ? (
                    <label className="block text-sm">
                      {t("manualCapture.round")}
                      <select
                        className={field}
                        value={pick.round || ""}
                        onChange={(e) =>
                          setPick({
                            key: version.key,
                            questionId: pick.questionId,
                            round: Number(e.target.value),
                          })
                        }
                      >
                        <option value="">{t("manualCapture.choose")}</option>
                        {version.slots
                          .filter((s) => s.questionId === pick.questionId)
                          .map((s) => (
                            <option
                              key={s.round}
                              value={s.round}
                              disabled={s.state !== "available"}
                              data-slot-state={s.state}
                            >
                              {t("manualCapture.roundOption", {
                                round: s.round,
                                date: when(s.intendedSlotAt),
                                state: t(`manualCapture.slot.${s.state}`),
                              })}
                            </option>
                          ))}
                      </select>
                    </label>
                  ) : null}
                  {slot ? (
                    <div
                      className="rounded border border-border p-2 text-sm space-y-1"
                      data-approved-question
                    >
                      <p className="text-xs text-muted-foreground">
                        {t("manualCapture.approvedQuestion")}
                      </p>
                      <p className={`font-medium ${wrap}`}>{slot.questionText}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("manualCapture.intendedSlot", { date: when(slot.intendedSlotAt) })}
                      </p>
                      <label className="flex min-h-11 items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1 h-5 w-5"
                          checked={form.affirmQuestion}
                          onChange={(e) => set({ affirmQuestion: e.target.checked })}
                          {...aria("affirm")}
                        />
                        <span>{t("manualCapture.affirm")}</span>
                      </label>
                      <p className="text-xs text-muted-foreground">
                        {t("manualCapture.affirmHelp")}
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {editing && step === 2 ? (
            <div className="space-y-2" data-step="answer">
              {select("status", ["", "complete", "failed", "truncated"], t("manualCapture.status"))}
              {/* A reason stays visible while it exists, so a status change never hides an invalid value. */}
              {form.status === "failed" || form.status === "truncated" || form.failure.trim() ? (
                <div className="space-y-1" data-failure-field>
                  {text("failure", t("manualCapture.failure"), counter("failure"), true)}
                  {form.status === "complete" ? (
                    <div className="space-y-1" data-failure-not-applicable>
                      <p className={`text-xs text-muted-foreground ${wrap}`}>
                        {t("manualCapture.failureNotApplicable")}
                      </p>
                      <Button
                        variant="outline"
                        className={action}
                        onClick={() => set({ failure: "" })}
                      >
                        {t("manualCapture.removeFailure")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {text(
                "rawAnswer",
                t("manualCapture.rawAnswer"),
                <>
                  {t("manualCapture.rawAnswerHelp")}
                  {counter("rawAnswer")}
                </>,
                true,
              )}
              {text(
                "citations",
                t("manualCapture.citations"),
                t("manualCapture.citationsHelp"),
                true,
              )}
              <label className="flex min-h-11 items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5"
                  checked={form.citationsComplete}
                  onChange={(e) => set({ citationsComplete: e.target.checked })}
                />
                <span>{t("manualCapture.citationsComplete")}</span>
              </label>
            </div>
          ) : null}

          {editing && step === 3 ? (
            <div className="space-y-3" data-step="context">
              <p className={`text-xs text-muted-foreground ${wrap}`}>
                {t("manualCapture.contextHelp")}
              </p>
              <fieldset className="space-y-2" data-required-facts>
                <legend className="text-sm font-medium">{t("manualCapture.requiredFacts")}</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="block text-sm">
                    {t("manualCapture.capturedDate")}
                    <input
                      type="date"
                      className={field}
                      value={form.capturedDate}
                      onChange={(e) => set({ capturedDate: e.target.value })}
                      {...aria("capturedAt")}
                    />
                  </label>
                  <label className="block text-sm">
                    {t("manualCapture.capturedTime")}
                    <input
                      type="time"
                      step={1}
                      className={field}
                      value={form.capturedTime}
                      onChange={(e) => set({ capturedTime: e.target.value })}
                      {...aria("capturedAt")}
                    />
                  </label>
                  <label className="block text-sm">
                    {t("manualCapture.utcOffset")}
                    <input
                      className={field}
                      placeholder="+02:00"
                      value={form.utcOffset}
                      onChange={(e) => set({ utcOffset: e.target.value.trim() })}
                      {...aria("capturedAt")}
                    />
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">{t("manualCapture.timeHelp")}</p>
                {text(
                  "service",
                  t("manualCapture.service"),
                  expected
                    ? t("manualCapture.expected", { value: expected.surface.service })
                    : undefined,
                )}
                {text(
                  "interfaceName",
                  t("manualCapture.interfaceName"),
                  expected
                    ? t("manualCapture.expected", { value: expected.surface.interface })
                    : undefined,
                )}
                {select(
                  "mode",
                  ["", "consumer-web", "search"],
                  t("manualCapture.mode"),
                  t("manualCapture.modeHelp"),
                )}
                {select(
                  "freshSession",
                  ["", "yes", "no"],
                  t("manualCapture.freshSession"),
                  t("manualCapture.requiredFact"),
                )}
                {text(
                  "priorMessages",
                  t("manualCapture.priorMessages"),
                  t("manualCapture.requiredFact"),
                )}
              </fieldset>
              {optional(
                "model",
                <>
                  {text(
                    "modelLabel",
                    t("manualCapture.modelLabel"),
                    t("manualCapture.unknownBlank"),
                  )}
                  {text(
                    "searchMode",
                    t("manualCapture.searchMode"),
                    t("manualCapture.unknownBlank"),
                  )}
                  {select(
                    "webSearchEvidenced",
                    ["unknown", "evidenced", "not_evidenced"],
                    t("manualCapture.webSearch"),
                  )}
                </>,
              )}
              {optional(
                "session",
                <>
                  {select(
                    "personalisation",
                    ["unknown", "non_personalised", "personalised"],
                    t("manualCapture.personalisation"),
                  )}
                  {select(
                    "signedIn",
                    ["unknown", "signed_in", "signed_out"],
                    t("manualCapture.signedIn"),
                  )}
                  {select("memory", ["unknown", "off", "on"], t("manualCapture.memory"))}
                  {select(
                    "customInstructions",
                    ["unknown", "none", "present"],
                    t("manualCapture.customInstructions"),
                  )}
                  {select(
                    "connectedTools",
                    ["unknown", "none", "present"],
                    t("manualCapture.connectedTools"),
                  )}
                  {select(
                    "temporaryChat",
                    ["unknown", "yes", "no"],
                    t("manualCapture.temporaryChat"),
                  )}
                  {text(
                    "accountTier",
                    t("manualCapture.accountTier"),
                    t("manualCapture.unknownBlank"),
                  )}
                </>,
              )}
              {optional(
                "place",
                <>
                  {text(
                    "interfaceLanguage",
                    t("manualCapture.interfaceLanguage"),
                    t("manualCapture.unknownBlank"),
                  )}
                  {text(
                    "answerLanguage",
                    t("manualCapture.answerLanguage"),
                    t("manualCapture.unknownBlank"),
                  )}
                  {text(
                    "collectionCountry",
                    t("manualCapture.collectionCountry"),
                    t("manualCapture.unknownBlank"),
                  )}
                  {text(
                    "collectionCity",
                    t("manualCapture.collectionCity"),
                    t("manualCapture.unknownBlank"),
                  )}
                  {text(
                    "locationInQuestion",
                    t("manualCapture.locationInQuestion"),
                    t("manualCapture.unknownBlank"),
                  )}
                  {select(
                    "devicePermission",
                    ["unknown", "granted", "denied"],
                    t("manualCapture.devicePermission"),
                  )}
                  {select(
                    "vpn",
                    ["", "yes", "no"],
                    t("manualCapture.vpn"),
                    t("manualCapture.unknownBlank"),
                  )}
                </>,
              )}
              {optional(
                "notes",
                <>
                  {text("extraInstruction", t("manualCapture.extraInstruction"), undefined, true)}
                  {text(
                    "screenshotRef",
                    t("manualCapture.screenshotRef"),
                    t("manualCapture.screenshotRefHelp"),
                  )}
                  {text("missingReason", t("manualCapture.missingReason"))}
                  {text("reportedCostUsd", t("manualCapture.cost"), t("manualCapture.costHelp"))}
                  {text("sourceUrl", t("manualCapture.sourceUrl"))}
                  {text(
                    "deviationNotes",
                    t("manualCapture.deviationNotes"),
                    t("manualCapture.deviationNotesHelp"),
                    true,
                  )}
                </>,
              )}
            </div>
          ) : null}

          {/* Review, send and what the response proves */}
          {!editing ? (
            <section
              className="space-y-2 rounded border border-border p-3 text-sm"
              aria-live="polite"
              data-manual-capture-state={submission.phase}
            >
              {slot ? (
                <p className={`font-medium ${wrap}`} data-observation>
                  {t("manualCapture.reviewQuestion", {
                    n: slot.questionNumber,
                    round: slot.round,
                    text: excerpt(slot.questionText, 120),
                  })}
                </p>
              ) : null}
              {submission.phase === "review" ? (
                <>
                  <p className="font-medium">{t("manualCapture.reviewTitle")}</p>
                  <ul className="grid gap-1">
                    {slot ? (
                      <li className={wrap}>
                        {t("manualCapture.reviewPlanned", { date: when(slot.intendedSlotAt) })}
                      </li>
                    ) : null}
                    <li className={wrap}>{t("manualCapture.reviewWhen", { at: entered() })}</li>
                    <li className={wrap}>
                      {t("manualCapture.reviewStatus", { status: opt(submission.frozen.status) })}
                    </li>
                    <li className={wrap}>
                      {t("manualCapture.reviewAnswer", {
                        excerpt: excerpt(submission.frozen.rawAnswer) || "—",
                      })}
                    </li>
                    <li className={wrap}>
                      {t("manualCapture.reviewCitations", {
                        count: submission.frozen.citations.length,
                        complete: opt(submission.frozen.citationsComplete ? "yes" : "no"),
                      })}
                    </li>
                    <li className={wrap}>
                      {t("manualCapture.reviewSurface", {
                        service: form.service.trim(),
                        interface: form.interfaceName.trim(),
                        mode: opt(form.mode),
                      })}
                    </li>
                    <li className={wrap}>
                      {t("manualCapture.reviewSession", {
                        fresh: opt(form.freshSession),
                        prior: form.priorMessages.trim(),
                      })}
                    </li>
                    <li className={wrap}>
                      {t("manualCapture.reviewUnknown", { count: unknownCount })}
                    </li>
                    <li className={`text-xs text-muted-foreground ${wrap}`}>
                      {t("manualCapture.reviewMethod", { method: MANUAL_CAPTURE_METHOD })}
                    </li>
                  </ul>
                  <p className="text-xs text-muted-foreground">{t("manualCapture.reviewHelp")}</p>
                </>
              ) : submission.phase === "sending" ? (
                <p role="status">{t("manualCapture.sending")}</p>
              ) : submission.phase === "unconfirmed" ? (
                <div role="status" className="space-y-1">
                  <p className="font-medium text-amber-700 dark:text-amber-400">
                    {t("manualCapture.unconfirmed")}
                  </p>
                  <p className={wrap}>{t(`manualCapture.unconfirmedNote.${submission.note}`)}</p>
                </div>
              ) : (
                <div role="status" className="space-y-1" data-saved-id={submission.id}>
                  <p className="font-medium text-emerald-700 dark:text-emerald-400">
                    {t(
                      submission.via === "match"
                        ? "manualCapture.confirmedMatch"
                        : "manualCapture.confirmed",
                    )}
                  </p>
                  <p className={wrap}>{t("manualCapture.confirmedWhen", { at: entered() })}</p>
                  {saved ? (
                    <div className="space-y-1" data-saved-record>
                      <p className={wrap}>
                        {t("manualCapture.savedAnswer", {
                          excerpt: excerpt(savedInput?.rawAnswer) || "—",
                        })}
                      </p>
                      <p>
                        {t("manualCapture.savedSources", {
                          count: Array.isArray(savedInput?.citations)
                            ? savedInput.citations.length
                            : 0,
                        })}
                      </p>
                      <p className={`text-xs text-muted-foreground ${wrap}`}>
                        {t("manualCapture.savedRecord", { id: saved.id })}
                      </p>
                    </div>
                  ) : readFailed ? (
                    <p className="text-amber-700 dark:text-amber-400">
                      {t("manualCapture.refreshFailed")}
                    </p>
                  ) : (
                    <p className="text-muted-foreground">{t("manualCapture.refreshing")}</p>
                  )}
                  {resolved ? (
                    <div className="space-y-1" data-resolved-outcome={resolved.outcome}>
                      <p className={wrap}>
                        {t("manualCapture.resolved", { outcome: opt(resolved.outcome) })}
                      </p>
                      {resolved.deviations.length ? (
                        <>
                          <p>{t("manualCapture.deviationsTitle")}</p>
                          <ul className="list-disc pl-5">
                            {resolved.deviations.map((d) => (
                              <li key={d} className={wrap} data-deviation={d}>
                                {deviation(d)}
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <p>{t("manualCapture.noDeviations")}</p>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </section>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {editing && step > 1 ? (
              <Button variant="outline" className={action} onClick={back}>
                {t("manualCapture.back")}
              </Button>
            ) : null}
            {editing && step < 3 ? (
              <Button className={action} onClick={next}>
                {t("manualCapture.continue")}
              </Button>
            ) : null}
            {editing && step === 3 ? (
              <Button className={action} onClick={review}>
                {t("manualCapture.review")}
              </Button>
            ) : null}
            {submission.phase === "review" ? (
              <>
                <Button className={action} onClick={() => void send("first")}>
                  {t("manualCapture.save")}
                </Button>
                <Button
                  variant="outline"
                  className={action}
                  onClick={() => {
                    setIssues([]);
                    setStep(3);
                    setSubmission({ phase: "editing" });
                  }}
                >
                  {t("manualCapture.edit")}
                </Button>
              </>
            ) : null}
            {submission.phase === "unconfirmed" ? (
              <>
                <Button className={action} onClick={() => void check()}>
                  {t("manualCapture.check")}
                </Button>
                <Button variant="outline" className={action} onClick={() => void send("resend")}>
                  {t("manualCapture.resend")}
                </Button>
              </>
            ) : null}
            {submission.phase === "confirmed" && readFailed ? (
              <Button variant="outline" className={action} onClick={() => void refreshReads()}>
                {t("manualCapture.reload")}
              </Button>
            ) : null}
            <Button variant="ghost" className={action} onClick={requestLeave}>
              {submission.phase === "confirmed"
                ? t("manualCapture.close")
                : t("manualCapture.cancel")}
            </Button>
          </div>
          {/* The leave confirmation is nested in the entry's React tree (it still renders in its own portal). Radix
              then treats a pointer press on Stay as inside the entry, so the entry's deferred outside-click
              handling (run at click time, after Stay has already closed the alert) cannot ask to leave again. */}
          <AlertDialog
            open={leaving || blocker.status === "blocked"}
            onOpenChange={(next) => {
              if (!next && !acted.current) stay();
              acted.current = false;
            }}
          >
            <AlertDialogContent
              data-manual-capture-leave={kind}
              // Remember the owned control that had focus, and give focus back to it (or to the first entry control)
              // after Stay, instead of letting it fall outside the entry.
              onOpenAutoFocus={() => {
                returnFocus.current = document.activeElement;
              }}
              onCloseAutoFocus={(e) => {
                const owned = contentRef.current;
                if (!owned) return;
                e.preventDefault();
                const prev = returnFocus.current;
                const target =
                  prev instanceof HTMLElement && prev.isConnected && owned.contains(prev)
                    ? prev
                    : owned.querySelector<HTMLElement>("select, input, textarea, button, summary");
                target?.focus();
              }}
            >
              <AlertDialogTitle>{t("manualCapture.leave.title")}</AlertDialogTitle>
              <AlertDialogDescription className={wrap}>
                {t(`manualCapture.leave.${kind === "none" ? "unsent" : kind}`)}
              </AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-11" autoFocus onClick={stay}>
                  {t("manualCapture.leave.stay")}
                </AlertDialogCancel>
                <AlertDialogAction className="min-h-11" onClick={leave}>
                  {t(
                    kind === "unsent" || kind === "none"
                      ? "manualCapture.leave.discard"
                      : "manualCapture.leave.abandon",
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DialogContent>
      </Dialog>
    </>
  );
}
