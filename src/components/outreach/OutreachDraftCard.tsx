import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  recoverOutreachReceiptFn,
  reviewOutreachMessageFn,
  sendOutreachEmailFn,
} from "@/lib/outreach-delivery.functions";
import {
  outreachReceiptDueAt,
  outreachSendErrorKey,
  type OutreachReceipt,
} from "@/lib/outreach-receipts";
import type { OutreachMessage } from "@/lib/outreach-delivery.server";
import {
  reloadWorkspaceForUser,
  saveWorkspaceNow,
  updateOutreachDraft,
  useStore,
} from "@/lib/store";
import type { OutreachDraft, OutreachStatus } from "@/lib/types";
import { Check, Clock3, Copy, Loader2, MailCheck, Pause, Pencil, Reply, Send } from "lucide-react";
import { toast } from "sonner";

type Translate = (key: string, vars?: Record<string, string | number>) => string;
type SendStep = { kind: "initial" } | { kind: "followUp"; followUpIndex: number };

export function OutreachDraftCard({
  draft,
  deliveryReady,
  receipts,
  refreshHistory,
  t,
  locale,
}: {
  draft: OutreachDraft;
  deliveryReady: boolean;
  receipts: OutreachReceipt[];
  refreshHistory: () => Promise<void>;
  t: Translate;
  locale: string;
}) {
  const userId = useStore((state) => state.userId);
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [contactName, setContactName] = useState(draft.contactName);
  const [contactEmail, setContactEmail] = useState(draft.contactEmail);
  const [sendStep, setSendStep] = useState<SendStep | null>(null);
  const [acknowledgedRecipient, setAcknowledgedRecipient] = useState(false);
  const [acknowledgedContent, setAcknowledgedContent] = useState(false);
  const [sending, setSending] = useState(false);

  const [review, setReview] = useState<{ message: OutreachMessage; hash: string } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const selectedMessage = review?.message;
  const initialReceipt = receipts.find((r) => r.draft_id === draft.id && r.step === "initial");
  const initialSent = initialReceipt?.state === "accepted";
  useEffect(() => {
    setSendStep(null);
    setReview(null);
    setAcknowledgedContent(false);
    setAcknowledgedRecipient(false);
  }, [userId, draft.projectId, draft.id]);

  async function recover() {
    if (!userId || sending) return;
    setSending(true);
    try {
      const result = await recoverOutreachReceiptFn({ data: { draftId: draft.id } });
      if (!result.restored) throw new Error();
      await reloadWorkspaceForUser(userId);
      toast.success(t("outreach.integrity.recovered"));
    } catch {
      toast.error(t("outreach.integrity.recoveryError"));
    } finally {
      await refreshHistory();
      setSending(false);
    }
  }
  async function setStatus(status: OutreachStatus) {
    updateOutreachDraft(draft.id, {
      status,
      approvedAt: status === "Approved" ? new Date().toISOString() : draft.approvedAt,
    });
    await saveWorkspaceNow();
    toast.success(t("outreach.toast.status", { status: t(`outreach.status.${status}`) }));
  }

  async function approve() {
    if (!/^\S+@\S+\.\S+$/.test(draft.contactEmail.trim())) {
      toast.error(t("outreach.recipientRequired"));
      return;
    }
    await setStatus("Approved");
  }

  async function saveEdits() {
    if (!subject.trim() || !body.trim()) {
      toast.error(t("outreach.contentRequired"));
      return;
    }
    updateOutreachDraft(draft.id, {
      subject: subject.trim(),
      body: body.trim(),
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim().toLowerCase(),
      status: "Draft",
      approvedAt: undefined,
      lastDeliveryError: undefined,
    });
    await saveWorkspaceNow();
    setEditing(false);
    toast.success(t("outreach.toast.saved"));
  }

  async function copy() {
    await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`);
    toast.success(t("outreach.toast.copied"));
  }

  async function reviewSend(step: SendStep) {
    if (reviewing) return;
    setAcknowledgedRecipient(false);
    setAcknowledgedContent(false);
    setReview(null);
    setReviewing(true);
    try {
      await saveWorkspaceNow();
      const snapshot = await reviewOutreachMessageFn({
        data: {
          draftId: draft.id,
          followUpIndex: step.kind === "followUp" ? step.followUpIndex : undefined,
        },
      });
      setReview(snapshot);
      setSendStep(step);
    } catch {
      toast.error(t("outreach.integrity.reviewError"));
    } finally {
      setReviewing(false);
    }
  }

  async function confirmSend() {
    if (
      !sendStep ||
      !review ||
      !userId ||
      sending ||
      !acknowledgedRecipient ||
      !acknowledgedContent
    )
      return;
    setSending(true);
    try {
      await sendOutreachEmailFn({
        data: {
          draftId: draft.id,
          expectedHash: review.hash,
          followUpIndex: sendStep.kind === "followUp" ? sendStep.followUpIndex : undefined,
          acknowledgedRecipient: true,
          acknowledgedContent: true,
        },
      });
      await reloadWorkspaceForUser(userId);
      setSendStep(null);
      toast.success(t("outreach.integrity.accepted"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast.error(t(outreachSendErrorKey(message)));
    } finally {
      setSendStep(null);
      setReview(null);
      await refreshHistory();
      setSending(false);
    }
  }

  return (
    <article className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{draft.targetDomain}</h3>
            <Badge variant="outline">
              {t(
                initialReceipt
                  ? `outreach.integrity.${initialReceipt.state}`
                  : `outreach.status.${draft.status}`,
              )}
            </Badge>
            <Badge variant="secondary">{t(`outreach.source.${draft.source}`)}</Badge>
          </div>
          {draft.contactEmail ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {draft.contactName ? `${draft.contactName} · ` : ""}
              {draft.contactEmail}
            </p>
          ) : null}
        </div>
        <div className="flex gap-1">
          {draft.status === "Draft" || draft.status === "Approved" ? (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
              {t("common.edit")}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={copy}>
            <Copy className="h-3.5 w-3.5" />
            {t("common.copy")}
          </Button>
        </div>
      </div>

      <div className="mt-4 rounded-md border border-border bg-background/50 p-4">
        <p className="text-sm font-medium">{draft.subject}</p>
        <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{draft.body}</p>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">{t("outreach.integrity.legacy")}</p>

      {draft.followUps.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {t("outreach.followUps")} ({draft.followUps.length})
          </summary>
          <div className="mt-2 space-y-2">
            {draft.followUps.map((followUp, index) => {
              const receipt = receipts.find(
                (r) => r.draft_id === draft.id && r.step === `followup-${index}`,
              );
              const sent = receipt?.state === "accepted";
              const dueAt = outreachReceiptDueAt(
                initialReceipt,
                draft.contactEmail,
                followUp.delayDays,
              );
              const due = !!dueAt && Date.parse(dueAt) <= Date.now();
              return (
                <div
                  key={`${followUp.delayDays}-${followUp.subject}`}
                  className="rounded-md border border-border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium">
                      {t("outreach.afterDays", { count: followUp.delayDays })}: {followUp.subject}
                    </p>
                    {sent ? (
                      <Badge variant="secondary">
                        <MailCheck className="mr-1 h-3 w-3" />
                        {t("outreach.integrity.accepted")}
                      </Badge>
                    ) : receipt ? (
                      <Badge variant="outline">{t(`outreach.integrity.${receipt.state}`)}</Badge>
                    ) : due &&
                      deliveryReady &&
                      (draft.status === "Sent" || (draft.status === "Failed" && initialSent)) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => reviewSend({ kind: "followUp", followUpIndex: index })}
                      >
                        <Send className="h-3.5 w-3.5" />
                        {t("outreach.reviewFollowUp")}
                      </Button>
                    ) : dueAt ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock3 className="h-3 w-3" />
                        {t("outreach.dueAt", { time: new Date(dueAt).toLocaleDateString(locale) })}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{followUp.body}</p>
                </div>
              );
            })}
          </div>
        </details>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {initialSent && (draft.status === "Approved" || draft.status === "Failed") ? (
          <Button size="sm" variant="outline" disabled={sending} onClick={recover}>
            {t("outreach.integrity.recover")}
          </Button>
        ) : null}
        {draft.status === "Draft" ? (
          <Button size="sm" variant="outline" onClick={approve}>
            <Check className="h-3.5 w-3.5" />
            {t("outreach.approve")}
          </Button>
        ) : null}
        {draft.status === "Approved" && !initialReceipt ? (
          <Button
            size="sm"
            onClick={() => reviewSend({ kind: "initial" })}
            disabled={!deliveryReady || reviewing}
          >
            <Send className="h-3.5 w-3.5" />
            {t("outreach.reviewSend")}
          </Button>
        ) : null}
        {draft.status === "Sent" ? (
          <Button size="sm" variant="outline" onClick={() => setStatus("Replied")}>
            <Reply className="h-3.5 w-3.5" />
            {t("outreach.markReplied")}
          </Button>
        ) : null}
        {draft.status !== "Paused" && draft.status !== "Sent" && draft.status !== "Replied" ? (
          <Button size="sm" variant="ghost" onClick={() => setStatus("Paused")}>
            <Pause className="h-3.5 w-3.5" />
            {t("outreach.pause")}
          </Button>
        ) : null}
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("outreach.editTitle")}</DialogTitle>
            <DialogDescription>{draft.targetDomain}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label={t("outreach.contactName")}>
              <Input value={contactName} onChange={(event) => setContactName(event.target.value)} />
            </Field>
            <Field label={t("outreach.contactEmail")}>
              <Input
                type="email"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
              />
            </Field>
            <Field label={t("outreach.subject")}>
              <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
            </Field>
            <Field label={t("outreach.message")}>
              <Textarea rows={10} value={body} onChange={(event) => setBody(event.target.value)} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={saveEdits}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={sendStep !== null}
        onOpenChange={(open) => {
          if (!open && !sending) setSendStep(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {sendStep?.kind === "followUp"
                ? t("outreach.reviewFollowUpTitle")
                : t("outreach.reviewSendTitle")}
            </DialogTitle>
            <DialogDescription>{t("outreach.integrity.reviewHelp")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
              <p>
                <span className="text-muted-foreground">{t("outreach.to")}:</span>{" "}
                {selectedMessage?.recipient}
              </p>
              <p className="mt-2">
                <span className="text-muted-foreground">{t("outreach.subject")}:</span>{" "}
                {selectedMessage?.subject}
              </p>
              <p className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap border-t border-border pt-3 text-muted-foreground">
                {selectedMessage?.body}
              </p>
            </div>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={acknowledgedRecipient}
                onCheckedChange={(checked) => setAcknowledgedRecipient(checked === true)}
              />
              <span>{t("outreach.confirmRecipient")}</span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                checked={acknowledgedContent}
                onCheckedChange={(checked) => setAcknowledgedContent(checked === true)}
              />
              <span>{t("outreach.confirmContent")}</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendStep(null)} disabled={sending}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={confirmSend}
              disabled={
                !deliveryReady ||
                sending ||
                !review ||
                !acknowledgedRecipient ||
                !acknowledgedContent
              }
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {t("outreach.sendNow")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
