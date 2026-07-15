import type { OutreachDeliveryEvent, OutreachDraft } from "./types";
import { mutateWorkspace, readWorkspaceRow, type WorkspaceData } from "./workspace.server";

const RESEND_SEND_URL = "https://api.resend.com/emails";
const DEFAULT_DAILY_LIMIT = 5;
const MAX_DAILY_LIMIT = 20;
const RECIPIENT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

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

interface ResendResponse {
  id?: string;
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

function acceptedEvents(draft: OutreachDraft): OutreachDeliveryEvent[] {
  return (draft.deliveryEvents ?? []).filter((event) => event.status === "accepted");
}

function eventMatchesStep(event: OutreachDeliveryEvent, step: OutreachSendStep): boolean {
  return step.kind === "initial"
    ? event.kind === "initial"
    : event.kind === "followUp" && event.followUpIndex === step.followUpIndex;
}

export function resolveOutreachMessage(
  draft: OutreachDraft,
  step: OutreachSendStep,
  now = Date.now(),
): OutreachMessage {
  const recipient = draft.contactEmail.trim().toLowerCase();
  if (!isEmailAddress(recipient)) throw new Error("outreach_recipient_required");
  if (!draft.subject.trim() || !draft.body.trim()) throw new Error("outreach_content_required");

  if (acceptedEvents(draft).some((event) => eventMatchesStep(event, step))) {
    throw new Error("outreach_step_already_sent");
  }

  if (step.kind === "initial") {
    if (draft.status !== "Approved" && draft.status !== "Failed") {
      throw new Error("outreach_approval_required");
    }
    return {
      recipient,
      subject: draft.subject.trim(),
      body: draft.body.trim(),
      step,
    };
  }

  const followUp = draft.followUps[step.followUpIndex];
  if (!followUp) throw new Error("outreach_followup_not_found");
  const initialSentAt =
    acceptedEvents(draft).find((event) => event.kind === "initial")?.at ?? draft.sentAt;
  if (!initialSentAt) throw new Error("outreach_initial_not_sent");
  const dueAt = Date.parse(initialSentAt) + Math.max(2, followUp.delayDays) * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(dueAt) || now < dueAt) {
    throw new Error("outreach_followup_not_due");
  }
  return {
    recipient,
    subject: followUp.subject.trim(),
    body: followUp.body.trim(),
    step,
  };
}

export function enforceOutreachRateLimits(
  drafts: OutreachDraft[],
  draft: OutreachDraft,
  message: OutreachMessage,
  dailyLimit: number,
  now = Date.now(),
): void {
  const allAccepted = drafts.flatMap((item) =>
    acceptedEvents(item).map((event) => ({ draft: item, event })),
  );
  const last24Hours = now - 24 * 60 * 60 * 1000;
  const sentToday = allAccepted.filter(({ event }) => Date.parse(event.at) >= last24Hours).length;
  if (sentToday >= dailyLimit) throw new Error("outreach_daily_limit_reached");

  if (message.step.kind !== "initial") return;
  const cooldownStart = now - RECIPIENT_COOLDOWN_MS;
  const duplicate = allAccepted.some(
    ({ draft: existingDraft, event }) =>
      existingDraft.id !== draft.id &&
      existingDraft.contactEmail.trim().toLowerCase() === message.recipient &&
      event.kind === "initial" &&
      Date.parse(event.at) >= cooldownStart,
  );
  if (duplicate) throw new Error("outreach_recipient_cooldown");
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

async function sendWithResend(args: {
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
    const payload = (await response.json().catch(() => ({}))) as ResendResponse;
    if (!response.ok || !payload.id) {
      throw new Error(`outreach_provider_failed_${response.status}`);
    }
    return payload.id;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("outreach_provider_timeout");
    }
    throw error;
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
  const existing = (draft.deliveryEvents ?? []).some(
    (item) =>
      item.status === "accepted" &&
      item.kind === event.kind &&
      item.followUpIndex === event.followUpIndex,
  );
  if (existing) return data;
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
    deliveryEvents: [...(draft.deliveryEvents ?? []), event],
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
  acknowledgedRecipient: true;
  acknowledgedContent: true;
}): Promise<{ status: "Sent"; providerMessageId: string; sentAt: string }> {
  if (!args.acknowledgedRecipient || !args.acknowledgedContent) {
    throw new Error("outreach_confirmation_required");
  }
  const config = deliveryConfig();
  const status = getOutreachDeliveryStatus();
  if (!status.ready) throw new Error("outreach_delivery_not_configured");

  const row = await readWorkspaceRow(args.userId);
  if (!row) throw new Error("workspace_not_found");
  const draft = findOutreachDraft(row.data, args.draftId);
  const message = resolveOutreachMessage(draft, args.step);
  enforceOutreachRateLimits(outreachDrafts(row.data), draft, message, config.dailyLimit);

  let token: string;
  try {
    token = await getUnsubscribeToken(message.recipient);
  } catch (error) {
    const note = error instanceof Error ? error.message : "outreach_suppression_check_failed";
    if (note === "outreach_recipient_suppressed") {
      const suppressedAt = new Date().toISOString();
      const metadata = {
        user_id: args.userId,
        draft_id: args.draftId,
        step: stepKey(args.step),
      };
      await logDelivery({
        recipient: message.recipient,
        status: "suppressed",
        error: note,
        metadata,
      });
      await mutateWorkspace(args.userId, (data) => ({
        data: appendDeliveryEvent(data, args.draftId, {
          kind: args.step.kind,
          followUpIndex: args.step.kind === "followUp" ? args.step.followUpIndex : undefined,
          status: "suppressed",
          at: suppressedAt,
          provider: "resend",
          note,
        }),
        result: null,
      }));
    }
    throw new Error(note);
  }
  const unsubscribeUrls = buildOutreachUnsubscribeUrls(config.siteUrl, token);
  const idempotencyKey = `outreach-${args.userId}-${args.draftId}-${stepKey(args.step)}`;
  const metadata = {
    user_id: args.userId,
    draft_id: args.draftId,
    step: stepKey(args.step),
  };

  let providerMessageId: string;
  try {
    providerMessageId = await sendWithResend({
      config,
      message,
      unsubscribePageUrl: unsubscribeUrls.pageUrl,
      oneClickUnsubscribeUrl: unsubscribeUrls.oneClickUrl,
      idempotencyKey,
      draftId: args.draftId,
    });
  } catch (error) {
    const note = error instanceof Error ? error.message : "outreach_provider_failed";
    const failedAt = new Date().toISOString();
    await logDelivery({
      recipient: message.recipient,
      status: "failed",
      error: note,
      metadata,
    });
    await mutateWorkspace(args.userId, (data) => ({
      data: appendDeliveryEvent(data, args.draftId, {
        kind: args.step.kind,
        followUpIndex: args.step.kind === "followUp" ? args.step.followUpIndex : undefined,
        status: "failed",
        at: failedAt,
        provider: "resend",
        note,
      }),
      result: null,
    }));
    throw new Error(note.startsWith("outreach_provider_") ? note : "outreach_provider_failed");
  }

  const sentAt = new Date().toISOString();
  await logDelivery({
    messageId: providerMessageId,
    recipient: message.recipient,
    status: "sent",
    metadata,
  });
  await mutateWorkspace(args.userId, (data) => ({
    data: appendDeliveryEvent(data, args.draftId, {
      kind: args.step.kind,
      followUpIndex: args.step.kind === "followUp" ? args.step.followUpIndex : undefined,
      status: "accepted",
      at: sentAt,
      provider: "resend",
      providerMessageId,
      note:
        args.step.kind === "initial"
          ? "Initial outreach accepted by Resend."
          : `Follow-up ${args.step.followUpIndex + 1} accepted by Resend.`,
    }),
    result: null,
  }));
  return { status: "Sent", providerMessageId, sentAt };
}
