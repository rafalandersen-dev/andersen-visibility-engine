import { useEffect, useReducer, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useT } from "@/i18n";
import { Button } from "./ui/button";
import {
  removeChangeArtifactFn,
  removeChangeReceiptFn,
  saveChangeArtifactFn,
  saveChangeReceiptFn,
  setChangeApprovalFn,
} from "@/lib/citation-change.functions";
import {
  CITATION_CHANGE_FIELDS,
  CITATION_CHANGE_KINDS,
  changeErrorKey,
  type CitationChangeKind,
} from "@/lib/citation-change";
import {
  addFieldRow,
  approvalOutcomeKey,
  approvalRequestFor,
  blockingWrite,
  deletionBlocked,
  duplicateRowIndexes,
  fieldRowsValid,
  firstFieldRow,
  frozenWritesReducer,
  nextUnusedKey,
  noFrozenWrites,
  recallFrozenWrites,
  rememberFrozenWrites,
  removeFieldRow,
  serializeFieldRows,
  setFieldRowKey,
  setFieldRowValue,
  type FieldRow,
  type FrozenWrites,
} from "@/lib/citation-change-ui";
import type { ChangeArtifact } from "@/lib/citation-forward";

const chip =
  "inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground";

/**
 * Owner management of listing/configuration change ARTIFACTS (candidate 20260928120000): the intended change as
 * enumerated non-secret fields → version-bound owner approval (the approval's own revision + a request identity
 * frozen per click, so a retry replays and a moved decision is refused) → performed declarations (a person says
 * the change was made; never destination proof) → the binding choice for an improvement. Every list value is
 * the server's; the approver is never typed. Credentials, tokens and private settings have no field here.
 */
export function CitationChangeArtifacts({
  projectId,
  ownerId,
  artifacts,
  isError,
  isPending,
  selectedArtifactId,
  selectedReceiptId,
  onSelect,
  initialFieldRows,
  initialFrozen,
}: {
  projectId: string;
  ownerId: string;
  artifacts: ChangeArtifact[] | undefined;
  isError: boolean;
  isPending: boolean;
  selectedArtifactId: string | null;
  selectedReceiptId: string | null;
  onSelect: (artifactId: string | null, receiptId: string | null) => void;
  /** Test seams only: a pre-filled draft and pre-frozen writes (the static markup tests; never set by callers). */
  initialFieldRows?: FieldRow[];
  initialFrozen?: FrozenWrites;
}) {
  const t = useT();
  const qc = useQueryClient();
  const scope = { projectId, expectedOwnerId: ownerId };
  const [kind, setKind] = useState<CitationChangeKind>("listing");
  const [reference, setReference] = useState("");
  const [fields, setFields] = useState<FieldRow[]>(
    () => initialFieldRows ?? [firstFieldRow("listing")],
  );
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{
    tone: "ok" | "error";
    key: string;
    vars?: Record<string, string | number>;
  } | null>(null);
  // Codex R3: the COMPLETE failed write (scope, artifact, digest, decision, reviewed head, request id — or the
  // declared instant) is frozen; a retry re-sends exactly it whatever the current read shows. A fresh decision or
  // a new performance is a separate explicit action; terminal outcomes drop the frozen request.
  const frozenKey = `${ownerId}:${projectId}`;
  const [frozen, dispatch] = useReducer(
    frozenWritesReducer,
    initialFrozen ?? recallFrozenWrites(frozenKey),
  );
  // Codex R4: an unresolved request outlives this form's unmount within the session (draft closed/reopened);
  // it is only ever settled/discarded by its own subject's controls.
  useEffect(() => {
    rememberFrozenWrites(frozenKey, frozen);
  }, [frozenKey, frozen]);
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["citation-change-artifacts", ownerId, projectId] });

  /** Run one write; returns the outcome code ("" on success) after refetching the live state. */
  async function run<T>(
    op: () => Promise<T>,
    onOk: (result: T) => { key: string; vars?: Record<string, string | number> },
  ): Promise<string> {
    if (busy) return "busy";
    setBusy(true);
    setNote(null);
    try {
      const result = await op();
      setNote({ tone: "ok", ...onOk(result) });
      await invalidate();
      return "";
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setNote({ tone: "error", key: changeErrorKey(code) });
      // A lost response leaves the server state unknown: refetch so the owner sees the live decision.
      void invalidate();
      return code || "error";
    } finally {
      setBusy(false);
    }
  }
  const duplicates = duplicateRowIndexes(fields);
  const formValid = reference.trim().length > 0 && fieldRowsValid(kind, fields);
  const nextKey = nextUnusedKey(kind, fields);
  async function sendApproval(request: NonNullable<FrozenWrites["approval"]>) {
    const code = await run(
      () =>
        setChangeApprovalFn({
          data: {
            expectedOwnerId: ownerId,
            projectId: request.projectId,
            artifactId: request.artifactId,
            expectedSha: request.expectedSha,
            approved: request.approved,
            expectedRevision: request.expectedRevision,
            requestId: request.requestId,
          },
        }),
      (r) => ({ key: approvalOutcomeKey(r) }),
    );
    if (code === "") dispatch({ type: "approvalSettled" });
    else if (code !== "busy") dispatch({ type: "approvalFailed", code });
  }
  async function sendReceipt(request: NonNullable<FrozenWrites["receipt"]>) {
    const code = await run(
      () =>
        saveChangeReceiptFn({
          data: {
            expectedOwnerId: ownerId,
            projectId: request.projectId,
            artifactId: request.artifactId,
            performedAt: request.performedAt,
          },
        }),
      () => ({ key: "citationChange.receipt.recorded" }),
    );
    if (code === "") dispatch({ type: "receiptSettled" });
    else if (code !== "busy") dispatch({ type: "receiptFailed", code });
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3 text-xs">
      <h5 className="font-medium">{t("citationChange.title")}</h5>
      <p className="text-muted-foreground">{t("citationChange.intro")}</p>
      {isError ? (
        <p className="text-destructive">{t("citationChange.error.unavailable")}</p>
      ) : isPending ? (
        <p className="text-muted-foreground">{t("citationForward.common.loading")}</p>
      ) : !artifacts || artifacts.length === 0 ? (
        <p className="text-muted-foreground">{t("citationChange.artifact.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {artifacts.map((a) => {
            const approval = a.approval;
            const current = !!approval?.current;
            const revision = approval?.revision ?? 0;
            const pendingApproval = frozen.approval?.artifactId === a.id ? frozen.approval : null;
            const pendingReceipt = frozen.receipt?.artifactId === a.id ? frozen.receipt : null;
            // Codex R4: another artifact's unresolved request blocks this artifact's same-kind write (labelled),
            // so no operation is sent that the state machine refused to register.
            const approvalBlockedBy = blockingWrite(frozen, "approval", a.id);
            const receiptBlockedBy = blockingWrite(frozen, "receipt", a.id);
            const blockedRef = (id: string) =>
              artifacts.find((x) => x.id === id)?.reference ?? id.slice(0, 8);
            const deleteBlocked = deletionBlocked(frozen, a.id);
            return (
              <li key={a.id} className="space-y-2 rounded-md border border-border p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="change-artifact"
                      checked={selectedArtifactId === a.id}
                      disabled={!current}
                      onChange={() => onSelect(a.id, null)}
                    />
                    <span className="font-medium">
                      {t(`citationChange.artifact.kind.${a.kind}`)} · {a.reference}
                    </span>
                  </label>
                  <span className={chip}>{a.artifactSha256.slice(0, 12)}</span>
                  <span className={chip} data-approval={current ? "current" : "none"}>
                    {current && approval
                      ? approval.approverKind === "owner"
                        ? t("citationChange.approval.owner")
                        : t("citationChange.approval.delegate", { email: approval.approverId })
                      : t("citationChange.approval.none")}
                  </span>
                  {revision > 0 ? (
                    <span className={chip}>
                      {t("citationChange.artifact.approvalRevision", { revision })}
                    </span>
                  ) : null}
                </div>
                <table className="w-full max-w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="pr-2">{t("citationChange.artifact.fieldKey")}</th>
                      <th className="pr-2">{t("citationChange.artifact.before")}</th>
                      <th>{t("citationChange.artifact.after")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(a.fields).map(([k, v]) => (
                      <tr key={k}>
                        <td className="pr-2 align-top">{k}</td>
                        <td className="pr-2 align-top break-words">{v.before ?? "—"}</td>
                        <td className="align-top break-words">{v.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pendingApproval ? (
                  <p className="text-amber-700" role="status" data-pending="approval">
                    {t("citationChange.approval.pendingNote", {
                      sha: pendingApproval.expectedSha.slice(0, 12),
                      decision: pendingApproval.approved
                        ? t("citationChange.approval.approve")
                        : t("citationChange.approval.revoke"),
                      revision: pendingApproval.expectedRevision,
                    })}
                  </p>
                ) : null}
                {approvalBlockedBy ? (
                  <p className="text-muted-foreground" data-blocked="approval">
                    {t("citationChange.approval.blockedBy", {
                      reference: blockedRef(approvalBlockedBy),
                    })}
                  </p>
                ) : null}
                {receiptBlockedBy ? (
                  <p className="text-muted-foreground" data-blocked="receipt">
                    {t("citationChange.receipt.blockedBy", {
                      reference: blockedRef(receiptBlockedBy),
                    })}
                  </p>
                ) : null}
                {pendingReceipt ? (
                  <p className="text-amber-700" role="status" data-pending="receipt">
                    {t("citationChange.receipt.pendingNote", {
                      at: pendingReceipt.performedAt.slice(0, 19),
                    })}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {pendingApproval ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        data-action="approval-retry"
                        onClick={() => void sendApproval(pendingApproval)}
                      >
                        {t("citationChange.approval.retry")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        data-action="approval-discard"
                        onClick={() => {
                          dispatch({ type: "approvalDiscarded" });
                          setNote(null);
                        }}
                      >
                        {t("citationChange.approval.newDecision")}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || approvalBlockedBy !== null}
                      data-action={current ? "approval-revoke" : "approval-approve"}
                      onClick={() => {
                        if (frozen.approval) return; // never send what the state machine will not register
                        const request = approvalRequestFor(
                          projectId,
                          {
                            id: a.id,
                            artifactSha256: a.artifactSha256,
                            approval: approval
                              ? { current: approval.current, revision: approval.revision }
                              : null,
                          },
                          crypto.randomUUID(),
                        );
                        dispatch({ type: "approvalDecided", request });
                        void sendApproval(request);
                      }}
                    >
                      {current
                        ? t("citationChange.approval.revoke")
                        : t("citationChange.approval.approve")}
                    </Button>
                  )}
                  {pendingReceipt ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        data-action="receipt-retry"
                        onClick={() => void sendReceipt(pendingReceipt)}
                      >
                        {t("citationChange.receipt.retry")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        data-action="receipt-discard"
                        onClick={() => {
                          dispatch({ type: "receiptDiscarded" });
                          setNote(null);
                        }}
                      >
                        {t("citationChange.receipt.newPerformance")}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !current || receiptBlockedBy !== null}
                      data-action="receipt-declare"
                      onClick={() => {
                        if (frozen.receipt) return;
                        const request = {
                          projectId,
                          artifactId: a.id,
                          performedAt: new Date().toISOString(),
                        };
                        dispatch({ type: "receiptDeclared", request });
                        void sendReceipt(request);
                      }}
                    >
                      {t("citationChange.receipt.record")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy || deleteBlocked}
                    data-action="artifact-delete"
                    onClick={() => {
                      if (deleteBlocked) return;
                      if (selectedArtifactId === a.id) onSelect(null, null);
                      void run(
                        () => removeChangeArtifactFn({ data: { ...scope, artifactId: a.id } }),
                        () => ({ key: "citationChange.artifact.removed" }),
                      );
                    }}
                  >
                    {t("citationChange.artifact.remove")}
                  </Button>
                </div>
                <div className="space-y-1">
                  <span className="font-medium text-foreground/70">
                    {t("citationChange.receipt.title")}
                  </span>
                  {a.receipts.length === 0 ? (
                    <p className="text-muted-foreground">{t("citationChange.receipt.none")}</p>
                  ) : (
                    a.receipts.map((r) => (
                      <label key={r.id} className="flex flex-wrap items-center gap-2">
                        <input
                          type="radio"
                          name="change-receipt"
                          checked={selectedReceiptId === r.id}
                          disabled={selectedArtifactId !== a.id}
                          onChange={() => onSelect(a.id, r.id)}
                        />
                        <span>
                          {r.performedAt.slice(0, 19)} ·{" "}
                          {r.performerKind === "owner"
                            ? t("citationChange.approval.owner")
                            : t("citationChange.approval.delegate", { email: r.performedBy })}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            if (selectedReceiptId === r.id) onSelect(a.id, null);
                            void run(
                              () => removeChangeReceiptFn({ data: { ...scope, receiptId: r.id } }),
                              () => ({ key: "citationChange.receipt.removed" }),
                            );
                          }}
                        >
                          {t("citationChange.receipt.remove")}
                        </Button>
                      </label>
                    ))
                  )}
                  <p className="text-muted-foreground">{t("citationChange.receipt.note")}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {/* Not a <form>: this block renders INSIDE the improvement author form, and a nested form would hand the
          submit to the browser (a native GET navigation). The save is an explicit button action. */}
      <div className="space-y-2 rounded-md border border-dashed border-border p-2">
        <h6 className="font-medium">{t("citationChange.artifact.new")}</h6>
        <label className="block space-y-1">
          <span className="font-medium text-foreground/70">
            {t("citationChange.artifact.kind")}
          </span>
          <select
            className="block w-full max-w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
            value={kind}
            onChange={(e) => {
              const next = e.target.value as CitationChangeKind;
              setKind(next);
              setFields([firstFieldRow(next)]);
            }}
          >
            {CITATION_CHANGE_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`citationChange.artifact.kind.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="font-medium text-foreground/70">
            {t("citationChange.artifact.reference")}
          </span>
          <input
            className="block w-full max-w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
            maxLength={1500}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <span className="text-muted-foreground">
            {t("citationChange.artifact.referenceHint")}
          </span>
        </label>
        <fieldset className="space-y-1">
          <legend className="font-medium text-foreground/70">
            {t("citationChange.artifact.fields")}
          </legend>
          {fields.map((f, i) => {
            const duplicate = duplicates.has(i);
            return (
              <div key={i} className="space-y-1">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-0 space-y-1">
                    <span className="block text-muted-foreground">
                      {t("citationChange.artifact.fieldKey")}
                    </span>
                    <select
                      className="block max-w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                      value={f.key}
                      aria-invalid={duplicate || undefined}
                      aria-describedby={duplicate ? `change-field-dup-${i}` : undefined}
                      onChange={(e) => setFields(setFieldRowKey(fields, i, e.target.value))}
                    >
                      {CITATION_CHANGE_FIELDS[kind].map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="min-w-0 flex-1 basis-40 space-y-1">
                    <span className="block text-muted-foreground">
                      {t("citationChange.artifact.before")}
                    </span>
                    <input
                      className="block w-full max-w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                      maxLength={500}
                      value={f.before}
                      onChange={(e) =>
                        setFields(setFieldRowValue(fields, i, "before", e.target.value))
                      }
                    />
                  </label>
                  <label className="min-w-0 flex-1 basis-40 space-y-1">
                    <span className="block text-muted-foreground">
                      {t("citationChange.artifact.after")}
                    </span>
                    <input
                      className="block w-full max-w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                      maxLength={500}
                      value={f.after}
                      onChange={(e) =>
                        setFields(setFieldRowValue(fields, i, "after", e.target.value))
                      }
                    />
                  </label>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    disabled={fields.length <= 1}
                    onClick={() => setFields(removeFieldRow(fields, i))}
                  >
                    {t("citationChange.artifact.removeField")}
                  </Button>
                </div>
                {duplicate ? (
                  <p
                    id={`change-field-dup-${i}`}
                    role="alert"
                    className="text-destructive"
                    data-duplicate-field={f.key}
                  >
                    {t("citationChange.artifact.duplicateField")}
                  </p>
                ) : null}
              </div>
            );
          })}
          <Button
            size="sm"
            variant="outline"
            type="button"
            disabled={fields.length >= 12 || nextKey === null}
            onClick={() => setFields(addFieldRow(kind, fields))}
          >
            {t("citationChange.artifact.addField")}
          </Button>
          {nextKey === null ? (
            <p className="text-muted-foreground">{t("citationChange.artifact.fieldsExhausted")}</p>
          ) : null}
          <p className="text-muted-foreground">{t("citationChange.artifact.fieldsHint")}</p>
        </fieldset>
        <Button
          size="sm"
          type="button"
          disabled={busy || !formValid}
          onClick={() => {
            const serialized = serializeFieldRows(fields);
            if (!formValid || serialized === null) {
              setNote({
                tone: "error",
                key:
                  serialized === null
                    ? "citationChange.artifact.duplicateField"
                    : "citationChange.artifact.unsupported",
              });
              return;
            }
            void run(
              () =>
                saveChangeArtifactFn({
                  data: { ...scope, kind, reference: reference.trim(), fields: serialized },
                }),
              () => ({ key: "citationChange.artifact.saved" }),
            );
          }}
        >
          {t("citationChange.artifact.save")}
        </Button>
      </div>
      {note ? (
        <p
          className={note.tone === "error" ? "text-destructive" : "text-emerald-700"}
          role="status"
        >
          {t(note.key, note.vars)}
        </p>
      ) : null}
    </div>
  );
}
