import type { OutreachDeliveryEvent, OutreachDraft } from "./types";
import { mutateWorkspace, readWorkspaceRow, type WorkspaceData } from "./workspace.server";

const RESEND_SEND_URL = "https://api.resend.com/emails";
const DEFAULT_DAILY_LIMIT = 5;
const MAX_DAILY_LIMIT = 20;
import { outreachRpc, readOutreachDeliveries } from "./outreach-receipts.server";
import type { OutreachReceipt } from "./outreach-receipts";

export interface OutreachDeliveryStatus {
  provider: "resend";
  credentialsPresent: boolean;
  senderConfigured: boolean;
  replyToConfigured: boolean;
  sendingEnabled: boolean;
  ready: boolean;
  dailyLimit: number;
}

export type OutreachSendStep = { kind: "initial" } | { kind: "followUp"; followUpIndex: number };

export interface OutreachMessage {
  recipient: string;
  subject: string;
  body: string;
  step: OutreachSendStep;
}

interface DeliveryConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  sendingEnabled: boolean;
  siteUrl: string;
  dailyLimit: number;
}

function cleanEnv(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function buildOutreachUnsubscribeUrls(siteUrl: string, token: string) {
  const encodedToken = encodeURIComponent(token);
  return {
    pageUrl: `${siteUrl}/unsubscribe?token=${encodedToken}`,
    oneClickUrl: `${siteUrl}/email/unsubscribe?token=${encodedToken}`,
  };
}

export function getOutreachDailyLimit(raw = process.env.OUTREACH_DAILY_SEND_LIMIT): number {
  const parsed = Number.parseInt(cleanEnv(raw), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_DAILY_LIMIT;
  return Math.min(MAX_DAILY_LIMIT, Math.max(1, parsed));
}

function deliveryConfig(): DeliveryConfig {
  return {
    apiKey: cleanEnv(process.env.RESEND_API_KEY),
    fromEmail: cleanEnv(process.env.OUTREACH_FROM_EMAIL).toLowerCase(),
    fromName: cleanEnv(process.env.OUTREACH_FROM_NAME) || "Milo Growth Outreach",
    replyToEmail: cleanEnv(process.env.OUTREACH_REPLY_TO_EMAIL).toLowerCase(),
    sendingEnabled: cleanEnv(process.env.OUTREACH_EMAIL_SENDING_ENABLED).toLowerCase() === "true",
    siteUrl: (cleanEnv(process.env.SITE_URL) || "https://milogrowth.com").replace(/\/$/, ""),
    dailyLimit: getOutreachDailyLimit(),
  };
}

export function getOutreachDeliveryStatus(): OutreachDeliveryStatus {
  const config = deliveryConfig();
  const credentialsPresent = config.apiKey.length > 0;
  const senderConfigured = isEmailAddress(config.fromEmail);
  const replyToConfigured = isEmailAddress(config.replyToEmail);
  const siteUrlConfigured = isHttpsUrl(config.siteUrl);
  return {
    provider: "resend",
    credentialsPresent,
    senderConfigured,
    replyToConfigured,
    sendingEnabled: config.sendingEnabled,
    ready:
      credentialsPresent &&
      senderConfigured &&
      replyToConfigured &&
      siteUrlConfigured &&
      config.sendingEnabled,
    dailyLimit: config.dailyLimit,
  };
}

function outreachDrafts(data: WorkspaceData): OutreachDraft[] {
  return Array.isArray(data.outreachDrafts) ? (data.outreachDrafts as OutreachDraft[]) : [];
}

export function findOutreachDraft(data: WorkspaceData, draftId: string): OutreachDraft {
  const draft = outreachDrafts(data).find((item) => item?.id === draftId);
  if (!draft) throw new Error("outreach_draft_not_found");
  return draft;
}

export function resolveOutreachMessage(
  draft: OutreachDraft,
  step: OutreachSendStep,
  now = Date.now(),
  receipts: OutreachReceipt[] = [],
): OutreachMessage {
  const recipient = draft.contactEmail.trim().toLowerCase();
  if (!isEmailAddress(recipient) || recipient.length > 254)
    throw new Error("outreach_recipient_required");
  if (receipts.some((r) => r.draft_id === draft.id && r.step === stepKey(step)))
    throw new Error("outreach_step_reserved");
  let subject: string, body: string;
  if (step.kind === "initial") {
    if (draft.status !== "Approved") throw new Error("outreach_approval_required");
    // Old editable labels can only hold work; they can never authorize sending.
    if (draft.sentAt || draft.providerMessageId || draft.deliveryEvents?.length)
      throw new Error("outreach_legacy_attempt_held");
    subject = draft.subject.trim();
    body = draft.body.trim();
  } else {
    if (draft.status !== "Sent" && draft.status !== "Failed")
      throw new Error("outreach_approval_required");
    const followUp = draft.followUps[step.followUpIndex];
    if (
      !followUp ||
      !Number.isInteger(followUp.delayDays) ||
      followUp.delayDays < 2 ||
      followUp.delayDays > 365
    )
      throw new Error("outreach_followup_not_found");
    const initial = receipts.find(
      (r) =>
        r.draft_id === draft.id &&
        r.project_id === draft.projectId &&
        r.step === "initial" &&
        r.state === "accepted" &&
        r.recipient === recipient,
    );
    if (!initial) throw new Error("outreach_initial_not_sent");
    const dueAt = Date.parse(initial.updated_at) + followUp.delayDays * 86400000;
    if (!Number.isFinite(dueAt) || now < dueAt) throw new Error("outreach_followup_not_due");
    subject = followUp.subject.trim();
    body = followUp.body.trim();
  }
  if (!subject || subject.length > 500 || /[\r\n]/.test(subject) || !body || body.length > 30000)
    throw new Error("outreach_content_required");
  return { recipient, subject, body, step };
}

export async function outreachVersion(
  draft: OutreachDraft,
  message: OutreachMessage,
): Promise<string> {
  const canonical = outreachCanonical(draft, message);
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical))),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
function outreachCanonical(draft: OutreachDraft, message: OutreachMessage) {
  return JSON.stringify([
    "milo-outreach-v1",
    draft.projectId,
    draft.id,
    message.recipient,
    message.subject,
    message.body,
    stepKey(message.step),
    message.step.kind === "followUp" ? draft.followUps[message.step.followUpIndex].delayDays : null,
  ]);
}
export async function reviewOutreachMessage(
  userId: string,
  draftId: string,
  step: OutreachSendStep,
) {
  const row = await readWorkspaceRow(userId);
  if (!row) throw new Error("workspace_not_found");
  const draft = findOutreachDraft(row.data, draftId);
  const receipts = await readOutreachDeliveries(userId, draft.projectId);
  const message = resolveOutreachMessage(draft, step, Date.now(), receipts);
  return { message, hash: await outreachVersion(draft, message) };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildOutreachEmailContent(
  body: string,
  unsubscribeUrl: string,
): { text: string; html: string } {
  const footer = `You can opt out of future outreach from Milo Growth: ${unsubscribeUrl}`;
  const text = `${body.trim()}\n\n---\n${footer}`;
  const paragraphs = body
    .trim()
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`,
    )
    .join("");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#222;max-width:620px">${paragraphs}<hr style="border:0;border-top:1px solid #e5e5e5;margin:24px 0"><p style="font-size:12px;color:#777">You can opt out of future outreach from Milo Growth: <a href="${escapeHtml(unsubscribeUrl)}">unsubscribe</a>.</p></div>`;
  return { text, html };
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function getUnsubscribeToken(email: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: suppressed, error: suppressionError } = await supabaseAdmin
    .from("suppressed_emails")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (suppressionError) throw new Error("outreach_suppression_check_failed");
  if (suppressed) throw new Error("outreach_recipient_suppressed");

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("email_unsubscribe_tokens")
    .select("token,used_at")
    .eq("email", email)
    .maybeSingle();
  if (lookupError) throw new Error("outreach_suppression_check_failed");
  if (existing?.used_at) throw new Error("outreach_recipient_suppressed");
  if (existing?.token) return existing.token;

  const token = generateToken();
  const { error: insertError } = await supabaseAdmin
    .from("email_unsubscribe_tokens")
    .upsert({ email, token }, { onConflict: "email", ignoreDuplicates: true });
  if (insertError) throw new Error("outreach_suppression_check_failed");
  const { data: stored, error: rereadError } = await supabaseAdmin
    .from("email_unsubscribe_tokens")
    .select("token,used_at")
    .eq("email", email)
    .maybeSingle();
  if (rereadError || !stored?.token || stored.used_at) {
    throw new Error("outreach_suppression_check_failed");
  }
  return stored.token;
}

async function logDelivery(args: {
  messageId?: string;
  recipient: string;
  status: string;
  error?: string;
  metadata: Record<string, string | number>;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("email_send_log").insert({
    message_id: args.messageId ?? null,
    template_name: "outreach",
    recipient_email: args.recipient,
    status: args.status,
    error_message: args.error?.slice(0, 1000) ?? null,
    metadata: args.metadata,
  });
  if (error) console.warn("[outreach] delivery log failed", { status: args.status });
}

function stepKey(step: OutreachSendStep): string {
  return step.kind === "initial" ? "initial" : `followup-${step.followUpIndex}`;
}

export async function sendWithResend(args: {
  config: DeliveryConfig;
  message: OutreachMessage;
  unsubscribePageUrl: string;
  oneClickUnsubscribeUrl: string;
  idempotencyKey: string;
  draftId: string;
}): Promise<string> {
  const content = buildOutreachEmailContent(args.message.body, args.unsubscribePageUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(RESEND_SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": args.idempotencyKey,
      },
      body: JSON.stringify({
        from: `${args.config.fromName} <${args.config.fromEmail}>`,
        to: [args.message.recipient],
        reply_to: args.config.replyToEmail,
        subject: args.message.subject,
        html: content.html,
        text: content.text,
        headers: {
          "List-Unsubscribe": `<${args.oneClickUnsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        tags: [
          { name: "source", value: "milo-outreach" },
          { name: "draft_id", value: args.draftId },
        ],
      }),
      signal: controller.signal,
    });
    const payload = await readOutreachResponse(response, controller.signal);
    if (
      !response.ok ||
      !payload ||
      typeof payload !== "object" ||
      !("id" in payload) ||
      typeof payload.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,200}$/.test(payload.id)
    )
      throw new Error("outreach_provider_unknown");
    return payload.id;
  } catch {
    // Any result without a bounded valid acceptance receipt is uncertain.
    throw new Error("outreach_provider_unknown");
  } finally {
    clearTimeout(timeout);
  }
}

function appendDeliveryEvent(
  data: WorkspaceData,
  draftId: string,
  event: OutreachDeliveryEvent,
): WorkspaceData {
  const drafts = outreachDrafts(data);
  const index = drafts.findIndex((item) => item.id === draftId);
  if (index < 0) throw new Error("outreach_draft_not_found");
  const draft = drafts[index];
  const nextDraft: OutreachDraft = {
    ...draft,
    status:
      event.status === "accepted"
        ? "Sent"
        : event.status === "suppressed"
          ? "Suppressed"
          : "Failed",
    sentAt: event.kind === "initial" && event.status === "accepted" ? event.at : draft.sentAt,
    provider: "resend",
    providerMessageId:
      event.kind === "initial" && event.status === "accepted"
        ? event.providerMessageId
        : draft.providerMessageId,
    deliveryEvents: [
      ...(draft.deliveryEvents ?? [])
        .filter((item) => item.kind !== event.kind || item.followUpIndex !== event.followUpIndex)
        .slice(-99),
      event,
    ],
    lastDeliveryError: event.status === "accepted" ? undefined : event.note,
    updatedAt: event.at,
  };
  const nextDrafts = drafts.slice();
  nextDrafts[index] = nextDraft;
  return { ...data, outreachDrafts: nextDrafts };
}

export async function sendOutreachEmail(args: {
  userId: string;
  draftId: string;
  step: OutreachSendStep;
  expectedHash: string;
  acknowledgedRecipient: true;
  acknowledgedContent: true;
}): Promise<{ status: "Sent"; providerMessageId: string; sentAt: string }> {
  if (!args.acknowledgedRecipient || !args.acknowledgedContent)
    throw new Error("outreach_confirmation_required");
  const config = deliveryConfig();
  if (!getOutreachDeliveryStatus().ready) throw new Error("outreach_delivery_not_configured");
  const row = await readWorkspaceRow(args.userId);
  if (!row) throw new Error("workspace_not_found");
  const draft = findOutreachDraft(row.data, args.draftId);
  const history = await readOutreachDeliveries(args.userId, draft.projectId);
  const message = resolveOutreachMessage(draft, args.step, Date.now(), history);
  const hash = await outreachVersion(draft, message);
  if (hash !== args.expectedHash) throw new Error("outreach_version_changed");
  const token = await getUnsubscribeToken(message.recipient);
  const keys = {
    p_user: args.userId,
    p_draft: args.draftId,
    p_step: stepKey(args.step),
    p_hash: hash,
  };
  if (
    (await outreachRpc("reserve_outreach_delivery", {
      ...keys,
      p_project: draft.projectId,
      p_expected: row.rev,
      p_recipient: message.recipient,
      p_limit: config.dailyLimit,
      p_delay:
        args.step.kind === "initial" ? 2 : draft.followUps[args.step.followUpIndex].delayDays,
    })) !== true
  )
    throw new Error("outreach_storage_unavailable");
  // No retries of admission/dispatch, including timeouts whose transaction may
  // have committed. The exact reviewed snapshot is the only outgoing message.
  if (!getOutreachDeliveryStatus().ready) throw new Error("outreach_delivery_not_configured");
  if ((await outreachRpc("dispatch_outreach_delivery", { ...keys, p_expected: row.rev })) !== true)
    throw new Error("outreach_dispatch_blocked");
  const urls = buildOutreachUnsubscribeUrls(config.siteUrl, token);
  let providerMessageId: string;
  try {
    providerMessageId = await sendWithResend({
      config,
      message,
      unsubscribePageUrl: urls.pageUrl,
      oneClickUnsubscribeUrl: urls.oneClickUrl,
      idempotencyKey: `outreach-${args.userId}-${args.draftId}-${stepKey(args.step)}`,
      draftId: args.draftId,
    });
  } catch {
    await outreachRpc("finish_outreach_delivery", {
      ...keys,
      p_state: "unknown",
      p_message: null,
    }).catch(() => {});
    throw new Error("outreach_provider_unknown");
  }
  // Receipt persistence precedes optional workspace/log mirrors. A failed ack
  // leaves dispatching held forever; it must never return replay permission.
  if (
    (await outreachRpc("finish_outreach_delivery", {
      ...keys,
      p_state: "accepted",
      p_message: providerMessageId,
    })) !== true
  )
    throw new Error("outreach_receipt_unknown");
  const sentAt = new Date().toISOString();
  await logDelivery({
    messageId: providerMessageId,
    recipient: message.recipient,
    status: "sent",
    metadata: { user_id: args.userId, draft_id: args.draftId, step: stepKey(args.step) },
  }).catch(() => {});
  await mutateWorkspace(args.userId, (data) => ({
    data: mirrorAccepted(data, draft, message, {
      kind: args.step.kind,
      followUpIndex: args.step.kind === "followUp" ? args.step.followUpIndex : undefined,
      status: "accepted",
      at: sentAt,
      provider: "resend",
      providerMessageId,
      note: "Provider accepted; delivery is not verified.",
    }),
    result: null,
  })).catch(() => {});
  return { status: "Sent", providerMessageId, sentAt };
}

function mirrorAccepted(
  data: WorkspaceData,
  draft: OutreachDraft,
  message: OutreachMessage,
  event: OutreachDeliveryEvent,
): WorkspaceData {
  const current = outreachDrafts(data).find((d) => d.id === draft.id);
  if (!current || !["Approved", "Sent", "Failed"].includes(current.status)) return data;
  const selected =
    message.step.kind === "initial" ? current : current.followUps[message.step.followUpIndex];
  if (
    !selected ||
    outreachCanonical(current, {
      ...message,
      recipient: current.contactEmail.trim().toLowerCase(),
      subject: selected.subject.trim(),
      body: selected.body.trim(),
    }) !== outreachCanonical(draft, message)
  )
    return data;
  return appendDeliveryEvent(data, draft.id, event);
}
export async function recoverOutreachReceipt(
  userId: string,
  draftId: string,
  step: OutreachSendStep,
) {
  const row = await readWorkspaceRow(userId);
  if (!row) throw new Error("workspace_not_found");
  const draft = findOutreachDraft(row.data, draftId);
  const history = await readOutreachDeliveries(userId, draft.projectId);
  const receipt = history.find(
    (r) => r.draft_id === draftId && r.step === stepKey(step) && r.state === "accepted",
  );
  const selected = step.kind === "initial" ? draft : draft.followUps[step.followUpIndex];
  if (!receipt || !selected || !receipt.provider_message_id)
    throw new Error("outreach_receipt_unavailable");
  const message = {
    recipient: draft.contactEmail.trim().toLowerCase(),
    subject: selected.subject.trim(),
    body: selected.body.trim(),
    step,
  };
  if ((await outreachVersion(draft, message)) !== receipt.version_hash)
    throw new Error("outreach_version_changed");
  const result = await mutateWorkspace(userId, (data) => {
    const next = mirrorAccepted(data, draft, message, {
      kind: step.kind,
      followUpIndex: step.kind === "followUp" ? step.followUpIndex : undefined,
      status: "accepted",
      at: receipt.updated_at,
      provider: "resend",
      providerMessageId: receipt.provider_message_id!,
      note: "Provider accepted; delivery is not verified.",
    });
    return { data: next, result: next !== data };
  });
  return { restored: result.result };
}

export async function readOutreachResponse(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("outreach_provider_unknown");
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      if (signal.aborted) throw new Error();
      const { done, value } = await reader.read();
      if (signal.aborted) throw new Error();
      if (done) break;
      size += value.byteLength;
      if (size > 16384) {
        void reader.cancel().catch(() => {});
        throw new Error();
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("outreach_provider_unknown");
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
