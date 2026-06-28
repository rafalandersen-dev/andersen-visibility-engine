import * as React from "react";
import { render } from "react-email";
import { sendLovableEmail } from "@lovable.dev/email-js";
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { SignupEmail } from "./email-templates/signup";
import { RecoveryEmail } from "./email-templates/recovery";

const SITE_NAME = "Milo Growth";
const SITE_URL = "https://milogrowth.com";
const SENDER_DOMAIN = "notify.milogrowth.com";
const FROM = "Milo Growth <noreply@milogrowth.com>";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().max(120).optional(),
  redirectTo: z.string().url(),
});

const resetSchema = z.object({
  email: z.string().email(),
  redirectTo: z.string().url(),
});

function getAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Auth email service is not configured.");
  }
  return {
    supabaseUrl,
    supabase: createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

function getEmailApiKey() {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Email service is not configured.");
  return apiKey;
}

function absoluteActionLink(actionLink: string, supabaseUrl: string) {
  return new URL(actionLink, supabaseUrl).toString();
}

async function logEmail(
  supabase: any,
  messageId: string,
  templateName: string,
  recipientEmail: string,
  status: "pending" | "sent" | "failed",
  errorMessage?: string,
) {
  await supabase.from("email_send_log").insert({
    message_id: messageId,
    template_name: templateName,
    recipient_email: recipientEmail,
    status,
    error_message: errorMessage,
  } as never);
}

async function sendDirectAuthEmail(args: {
  templateName: "signup" | "recovery";
  to: string;
  subject: string;
  html: string;
  text: string;
  supabase: ReturnType<typeof createClient>;
  supabase: any;
}) {
  const apiKey = getEmailApiKey();
  const messageId = crypto.randomUUID();
  await logEmail(args.supabase, messageId, args.templateName, args.to, "pending");
  try {
    await sendLovableEmail(
      {
        to: args.to,
        from: FROM,
        sender_domain: SENDER_DOMAIN,
        subject: args.subject,
        html: args.html,
        text: args.text,
        purpose: "transactional",
        label: args.templateName,
        message_id: messageId,
        idempotency_key: `${args.templateName}:${args.to}:${messageId}`,
      },
      { apiKey, sendUrl: process.env.LOVABLE_SEND_URL },
    );
    await logEmail(args.supabase, messageId, args.templateName, args.to, "sent");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await logEmail(args.supabase, messageId, args.templateName, args.to, "failed", message.slice(0, 1000));
    throw new Error("We could not send the email right now. Please try again in a moment.");
  }
}

export const signupWithBrandedEmailFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => signupSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabase, supabaseUrl } = getAdminClient();
    const email = data.email.trim().toLowerCase();
    const { data: linkData, error } = await supabase.auth.admin.generateLink({
      type: "signup",
      email,
      password: data.password,
      options: {
        redirectTo: data.redirectTo,
        data: { display_name: data.displayName || email.split("@")[0] },
      },
    });
    if (error) throw new Error(error.message);

    const confirmationUrl = absoluteActionLink(linkData.properties.action_link, supabaseUrl);
    const element = React.createElement(SignupEmail, {
      siteName: SITE_NAME,
      siteUrl: SITE_URL,
      recipient: email,
      confirmationUrl,
    });
    await sendDirectAuthEmail({
      templateName: "signup",
      to: email,
      subject: "Confirm your email",
      html: await render(element),
      text: await render(element, { plainText: true }),
      supabase,
    });
    return { ok: true };
  });

export const requestPasswordResetWithBrandedEmailFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => resetSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabase, supabaseUrl } = getAdminClient();
    const email = data.email.trim().toLowerCase();
    const { data: linkData, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: data.redirectTo },
    });

    // Keep account enumeration behavior friendly while still using the branded
    // sender whenever Supabase can produce a recovery link.
    if (error) return { ok: true };

    const confirmationUrl = absoluteActionLink(linkData.properties.action_link, supabaseUrl);
    const element = React.createElement(RecoveryEmail, {
      siteName: SITE_NAME,
      confirmationUrl,
    });
    await sendDirectAuthEmail({
      templateName: "recovery",
      to: email,
      subject: "Reset your password",
      html: await render(element),
      text: await render(element, { plainText: true }),
      supabase,
    });
    return { ok: true };
  });