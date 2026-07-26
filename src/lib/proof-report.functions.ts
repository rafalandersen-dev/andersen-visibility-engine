/**
 * Monthly Proof Report — server functions.
 *
 * Trust model: the email fn re-reads the CALLER's workspace row and rebuilds
 * the report server-side — no client-supplied HTML or numbers ever reach the
 * email. The recipient is ALWAYS the authenticated user's own JWT email
 * (never a request field), so this cannot be used to spam third parties.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { CalendarItem, ContentAsset, Project } from "./types";
import { readWorkspaceRow } from "./workspace.server";
import { isEmailAddress } from "./outreach-delivery.server";
import { buildMonthlyProofReport, type MonthlyProofReport } from "./proof-report";
import { isAgencyPlan, type AgencyBranding } from "./billing";

const RESEND_SEND_URL = "https://api.resend.com/emails";
const MONTH_KEY = /^\d{4}-\d{2}$/;

const clean = (v: string | undefined) => (v ?? "").trim();

async function liveLinkCount(userId: string, projectId: string): Promise<number | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (
          cols: string,
          opts: { count: "exact"; head: true },
        ) => {
          eq: (
            c: string,
            v: unknown,
          ) => {
            eq: (
              c: string,
              v: unknown,
            ) => {
              eq: (
                c: string,
                v: unknown,
              ) => PromiseLike<{ count: number | null; error: { message: string } | null }>;
            };
          };
        };
      };
    };
    const { count, error } = await db
      .from("link_network_matches")
      .select("id", { count: "exact", head: true })
      .eq("a_user", userId)
      .eq("a_project", projectId)
      .eq("status", "live_verified");
    if (error) return null;
    return count ?? 0;
  } catch {
    return null; // unknown, never fabricated as 0
  }
}

async function reportForCaller(
  userId: string,
  projectId: string,
  monthKey: string,
): Promise<{ report: MonthlyProofReport; project: Project; branding: AgencyBranding | null }> {
  const row = await readWorkspaceRow(userId);
  if (!row) throw new Error("Workspace not found.");
  const projects = Array.isArray(row.data.projects) ? (row.data.projects as Project[]) : [];
  const project = projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Project not found in your workspace.");
  const content = Array.isArray(row.data.content) ? (row.data.content as ContentAsset[]) : [];
  const calendar = Array.isArray(row.data.calendar) ? (row.data.calendar as CalendarItem[]) : [];
  const linksLive = await liveLinkCount(userId, projectId);
  // White-label only for a genuinely active agency plan (the same gate the
  // client UI and the DB cap trigger apply — subscription is client-writable).
  const sub = row.data.subscription as Parameters<typeof isAgencyPlan>[0];
  const rawBranding = row.data.agencyBranding as AgencyBranding | undefined;
  const branding = isAgencyPlan(sub) && rawBranding ? rawBranding : null;
  return {
    report: buildMonthlyProofReport({ project, content, calendar, monthKey, linksLive }),
    project,
    branding,
  };
}

/** Live ✓ partner-link count for the report page (client store can't read the
 * service-role-only tables). */
export const getProofLinksLiveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }): Promise<{ linksLive: number | null }> => {
    return { linksLive: await liveLinkCount(context.userId, data.projectId) };
  });

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain, client-safe HTML — inline styles only, no external assets. */
export function renderProofReportEmailHtml(
  report: MonthlyProofReport,
  projectName: string,
  branding: AgencyBranding | null = null,
): string {
  const e = escapeHtml;
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#666;">${label}</td><td style="padding:6px 0;font-weight:600;">${value}</td></tr>`;
  const publishedList = report.published.length
    ? `<ul>${report.published
        .map(
          (p) =>
            `<li style="margin:4px 0;">${
              // Scheme allowlist: a liveUrl echoed by a custom publish endpoint
              // is user-influenced — only http(s) becomes a clickable href.
              p.liveUrl && /^https?:\/\//i.test(p.liveUrl)
                ? `<a href="${e(p.liveUrl)}">${e(p.title)}</a>`
                : e(p.title)
            }</li>`,
        )
        .join("")}</ul>`
    : `<p style="color:#666;">No pieces went live this month.</p>`;
  const planList = report.nextMonthPlan.length
    ? `<ul>${report.nextMonthPlan
        .map((p) => `<li style="margin:4px 0;">${e(p.plannedDate)} — ${e(p.title)}</li>`)
        .join("")}</ul>`
    : `<p style="color:#666;">Nothing planned yet — open the Plan page to schedule next month.</p>`;
  const gsc = report.gsc
    ? `<table style="border-collapse:collapse;">${row("Clicks", String(report.gsc.totalClicks))}${row(
        "Impressions",
        String(report.gsc.totalImpressions),
      )}${row("Avg. position", report.gsc.averagePosition.toFixed(1))}</table><p style="color:#999;font-size:12px;">Google Search Console${
        report.gsc.rangeLabel ? ` · ${e(report.gsc.rangeLabel)}` : ""
      }</p>`
    : `<p style="color:#666;">Connect Google Search Console in Milo to include search metrics.</p>`;
  // https only: http logos are mixed content on the app page and blocked by
  // most mail clients — better no logo than a broken box in a client report.
  const logoOk = branding?.logoUrl && /^https:\/\//i.test(branding.logoUrl);
  const brandHeader = branding
    ? `${logoOk ? `<img src="${e(branding.logoUrl as string)}" alt="" style="height:40px;max-width:220px;object-fit:contain;margin-bottom:8px;" />` : ""}${
        branding.agencyName
          ? `<div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#666;">${e(branding.agencyName)}</div>`
          : ""
      }`
    : "";
  return `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1c1917;">
  ${brandHeader}
  <h1 style="font-size:22px;">Monthly proof — ${e(projectName)} · ${e(report.monthKey)}</h1>
  <h2 style="font-size:16px;">Published &amp; live (${report.published.length})</h2>
  ${publishedList}
  <table style="border-collapse:collapse;margin:12px 0;">
    ${row("Drafts written", String(report.draftedCount))}
    ${row("Scheduled to publish", String(report.scheduledCount))}
    ${report.linksLive === null ? "" : row("Partner links Live ✓", String(report.linksLive))}
  </table>
  <h2 style="font-size:16px;">Search snapshot</h2>
  ${gsc}
  <h2 style="font-size:16px;">Next month's plan (${report.nextMonthPlan.length})</h2>
  ${planList}
  <p style="color:#999;font-size:12px;margin-top:24px;">${
    branding?.agencyName
      ? `Prepared by ${e(branding.agencyName)}. Sent on your request — this is not a marketing email.`
      : "Sent by Milo Growth on your request — this is not a marketing email."
  }</p>
</div>`;
}

/** Email the report to the CALLER (recipient comes from the JWT, never the request). */
export const emailProofReportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ projectId: z.string().min(1), monthKey: z.string().regex(MONTH_KEY) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ sent: boolean }> => {
    const recipient = clean(
      (context.claims as { email?: string } | undefined)?.email,
    ).toLowerCase();
    if (!isEmailAddress(recipient)) throw new Error("Your account has no email address.");
    const apiKey = clean(process.env.RESEND_API_KEY);
    const fromEmail = clean(process.env.OUTREACH_FROM_EMAIL).toLowerCase();
    if (!apiKey || !isEmailAddress(fromEmail)) {
      throw new Error("Email sending is not configured yet.");
    }
    const { report, project, branding } = await reportForCaller(
      context.userId,
      data.projectId,
      data.monthKey,
    );
    const html = renderProofReportEmailHtml(report, project.name, branding);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(RESEND_SEND_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `Milo Growth <${fromEmail}>`,
          to: [recipient],
          subject: `Monthly proof — ${project.name} · ${report.monthKey}`,
          html,
          tags: [{ name: "source", value: "milo-proof-report" }],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`report_email_failed_${response.status}`);
      return { sent: true };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("report_email_timeout");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  });
