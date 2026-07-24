/**
 * Link Growth Network — server functions.
 *
 * Trust model (the 2.0 connector-guard invariant): every listing field except
 * the editable topics/contact is derived server-side from the CALLER's own
 * workspace row; match mutations check `a_user === caller`; `live_verified`
 * is reachable ONLY through the verification fetch — no client can assert it.
 * Tables are service-role-only (RLS deny-all); this module is the boundary.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Project, ServiceItem } from "./types";
import { readWorkspaceRow } from "./workspace.server";
import { safeFetch } from "./safe-fetch";
import { isEmailAddress } from "./outreach-delivery.server";
import {
  deriveTopics,
  scoreListingMatch,
  sameSite,
  canTransition,
  containsLinkToSite,
  isReciprocalSwap,
  introEmail,
  MIN_MATCH_SCORE,
  type MatchStatus,
} from "./link-network";

// Loosely-typed admin handle (tables not in generated client types — same
// pattern as schedule.functions.ts). supabaseAdmin is a Proxy: call methods.
interface Chain extends PromiseLike<{ data: unknown; error: { message: string } | null }> {
  select: (cols: string) => Chain;
  insert: (row: Record<string, unknown>) => Chain;
  update: (row: Record<string, unknown>) => Chain;
  upsert: (row: Record<string, unknown>, opts?: Record<string, unknown>) => Chain;
  eq: (col: string, v: unknown) => Chain;
  neq: (col: string, v: unknown) => Chain;
  maybeSingle: () => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}
async function admin(): Promise<{ from: (t: string) => Chain }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => Chain };
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** The caller's own project + services, straight from their workspace row. */
async function ownedProject(
  userId: string,
  projectId: string,
): Promise<{ project: Project; services: ServiceItem[] }> {
  const row = await readWorkspaceRow(userId);
  if (!row) throw new Error("Workspace not found.");
  const projects = Array.isArray(row.data.projects) ? (row.data.projects as Project[]) : [];
  const project = projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Project not found in your workspace.");
  const services = (
    Array.isArray(row.data.services) ? (row.data.services as ServiceItem[]) : []
  ).filter((s) => (s as { projectId?: string }).projectId === projectId);
  return { project, services };
}

export interface LinkListingView {
  projectId: string;
  siteUrl: string;
  siteName: string;
  topics: string[];
  language: string;
  locale: string;
  contactEmail: string;
  status: "active" | "paused";
}

/**
 * Opt a project into the network (or update its listing). Site identity comes
 * from the server-read project — the client chooses only topics, contact
 * email and active/paused.
 */
export const upsertLinkListingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        projectId: z.string().min(1),
        topics: z.array(z.string().min(2).max(40)).max(12).optional(),
        contactEmail: z.string().max(200).optional(),
        status: z.enum(["active", "paused"]).default("active"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<LinkListingView> => {
    const userId = context.userId as string;
    const { project, services } = await ownedProject(userId, data.projectId);
    const siteUrl = (project.websiteUrl ?? "").trim();
    if (!/^https?:\/\/\S+\.\S+/.test(siteUrl)) {
      throw new Error("This project needs a website URL before joining the network.");
    }
    const contact = (data.contactEmail ?? "").trim();
    if (contact && !isEmailAddress(contact)) throw new Error("Invalid contact email.");
    const topics = (data.topics?.length ? data.topics : deriveTopics(project, services)).map((t) =>
      t.trim().toLowerCase(),
    );
    const listing = {
      user_id: userId,
      project_id: project.id,
      site_url: siteUrl,
      site_name: project.businessName || project.name,
      topics,
      language: project.primaryContentLanguage ?? "en",
      locale: project.mainLocation ?? "",
      contact_email: contact,
      status: data.status,
      updated_at: new Date().toISOString(),
    };
    const db = await admin();
    const { error } = await db
      .from("link_network_listings")
      .upsert(listing, { onConflict: "user_id,project_id" });
    if (error) throw new Error("Could not save the listing. Please try again.");
    return {
      projectId: project.id,
      siteUrl,
      siteName: listing.site_name,
      topics,
      language: listing.language,
      locale: listing.locale,
      contactEmail: contact,
      status: data.status,
    };
  });

export interface LinkMatchView {
  id: string;
  partnerSite: string;
  partnerName: string;
  partnerTopics: string[];
  partnerContact: string;
  score: number;
  sharedTopics: string[];
  status: MatchStatus;
  targetUrl: string;
  linkRel: string | null;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  lastCheckFound: boolean | null;
  reciprocalSwap: boolean;
  intro: { subject: string; body: string };
}

function matchView(r: Row, liveReverseSites: string[]): LinkMatchView {
  const partnerSite = str(r.b_site);
  // A reverse row means MY site already carries a live link to this partner
  // (their tracked placement). Completing mine would finish a plain A↔B swap.
  const reciprocal = isReciprocalSwap(
    liveReverseSites.map((site) => ({
      partnerSite: site,
      direction: "inbound" as const,
      status: "live_verified" as const,
    })),
    partnerSite,
    "outbound",
  );
  return {
    id: str(r.id),
    partnerSite,
    partnerName: str(r.b_name),
    partnerTopics: Array.isArray(r.b_topics) ? (r.b_topics as string[]) : [],
    partnerContact: str(r.b_contact),
    score: Number(r.score ?? 0),
    sharedTopics: Array.isArray(r.shared_topics) ? (r.shared_topics as string[]) : [],
    status: str(r.status) as MatchStatus,
    targetUrl: str(r.target_url),
    linkRel: (r.link_rel as string | null) ?? null,
    verifiedAt: (r.verified_at as string | null) ?? null,
    lastCheckedAt: (r.last_checked_at as string | null) ?? null,
    lastCheckFound: (r.last_check_found as boolean | null) ?? null,
    reciprocalSwap: reciprocal,
    intro: { subject: "", body: "" },
  };
}

/**
 * Scan the directory for this project: score every ACTIVE listing, persist
 * fresh suggestions (never overwriting an engaged match), and return the
 * project's full match list with localized intro drafts.
 */
export const findLinkMatchesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }): Promise<{ matches: LinkMatchView[] }> => {
    const userId = context.userId as string;
    const db = await admin();
    const { data: mineRaw } = await db
      .from("link_network_listings")
      .select("*")
      .eq("user_id", userId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    const mine = mineRaw as Row | null;
    if (!mine) throw new Error("Join the network first.");
    const { data: allRaw } = await db
      .from("link_network_listings")
      .select("*")
      .eq("status", "active");
    const listings = (Array.isArray(allRaw) ? allRaw : []) as Row[];
    const my = {
      siteUrl: str(mine.site_url),
      siteName: str(mine.site_name),
      topics: Array.isArray(mine.topics) ? (mine.topics as string[]) : [],
      language: str(mine.language),
      locale: str(mine.locale),
    };
    for (const cand of listings) {
      const candSite = str(cand.site_url);
      if (sameSite(candSite, my.siteUrl)) continue;
      const s = scoreListingMatch(my, {
        siteUrl: candSite,
        topics: Array.isArray(cand.topics) ? (cand.topics as string[]) : [],
        language: str(cand.language),
        locale: str(cand.locale),
      });
      if (s.score < MIN_MATCH_SCORE) continue;
      // Insert-if-new only: an engaged match must never be reset to suggested.
      await db.from("link_network_matches").upsert(
        {
          a_user: userId,
          a_project: data.projectId,
          a_site: my.siteUrl,
          b_user: cand.user_id,
          b_project: cand.project_id,
          b_site: candSite,
          b_name: str(cand.site_name),
          b_topics: cand.topics,
          b_contact: str(cand.contact_email),
          b_language: str(cand.language),
          score: s.score,
          shared_topics: s.sharedTopics,
        },
        { onConflict: "a_user,a_project,b_user,b_project", ignoreDuplicates: true },
      );
    }
    const { data: rowsRaw } = await db
      .from("link_network_matches")
      .select("*")
      .eq("a_user", userId)
      .eq("a_project", data.projectId);
    const rows = (Array.isArray(rowsRaw) ? rowsRaw : []) as Row[];
    // Reverse rows whose placement is LIVE: my site already links to them.
    const { data: revRaw } = await db
      .from("link_network_matches")
      .select("a_site,status")
      .eq("b_user", userId)
      .eq("b_project", data.projectId)
      .eq("status", "live_verified");
    const liveReverseSites = (Array.isArray(revRaw) ? (revRaw as Row[]) : []).map((m) =>
      str(m.a_site),
    );
    const byId = new Map(rows.map((r) => [str(r.id), r]));
    const views = rows
      .map((r) => matchView(r, liveReverseSites))
      .sort((a, b) => b.score - a.score)
      .map((v) => ({
        ...v,
        intro: introEmail({
          // Write to the PARTNER in their content language, not ours.
          language: str(byId.get(v.id)?.b_language) || my.language,
          fromName: my.siteName,
          fromSite: my.siteUrl,
          toSite: v.partnerSite,
          topics: v.sharedTopics.length ? v.sharedTopics : my.topics,
        }),
      }));
    return { matches: views };
  });

/** Advance a match (never to live_verified — that is the verifier's job). */
export const updateLinkMatchStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        matchId: z.string().uuid(),
        to: z.enum(["contacted", "agreed", "declined"]),
        targetUrl: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ status: MatchStatus }> => {
    const userId = context.userId as string;
    const db = await admin();
    const { data: rowRaw } = await db
      .from("link_network_matches")
      .select("*")
      .eq("id", data.matchId)
      .eq("a_user", userId)
      .maybeSingle();
    const row = rowRaw as Row | null;
    if (!row) throw new Error("Match not found.");
    const from = str(row.status) as MatchStatus;
    if (!canTransition(from, data.to))
      throw new Error(`Cannot move a ${from} match to ${data.to}.`);
    const patch: Record<string, unknown> = {
      status: data.to,
      updated_at: new Date().toISOString(),
    };
    if (data.to === "agreed" && data.targetUrl?.trim()) patch.target_url = data.targetUrl.trim();
    const { error } = await db
      .from("link_network_matches")
      .update(patch)
      .eq("id", data.matchId)
      .eq("a_user", userId);
    if (error) throw new Error("Could not update the match.");
    return { status: data.to };
  });

/**
 * Verify a placement: safe-fetch the agreed partner page and look for a real
 * anchor to OUR site. Found → live_verified (the only path there). Not found
 * → the match stays agreed and the check is recorded honestly.
 */
export const verifyLinkPlacementFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ matchId: z.string().uuid(), pageUrl: z.string().max(500).optional() }).parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ found: boolean; rel: string | null; status: MatchStatus }> => {
      const userId = context.userId as string;
      const db = await admin();
      const { data: rowRaw } = await db
        .from("link_network_matches")
        .select("*")
        .eq("id", data.matchId)
        .eq("a_user", userId)
        .maybeSingle();
      const row = rowRaw as Row | null;
      if (!row) throw new Error("Match not found.");
      const from = str(row.status) as MatchStatus;
      if (from !== "agreed" && from !== "live_verified") {
        throw new Error("Verify after the partner has agreed to place the link.");
      }
      const pageUrl = (data.pageUrl ?? str(row.target_url)).trim();
      if (!pageUrl) throw new Error("No page to check — save the agreed page URL first.");
      const res = await safeFetch(pageUrl, { maxBytes: 1_500_000, timeoutMs: 12_000 });
      if (!res.ok) throw new Error("Could not fetch the partner page to verify.");
      const check = containsLinkToSite(res.body, str(row.a_site));
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = {
        target_url: pageUrl,
        last_checked_at: now,
        last_check_found: check.found,
        updated_at: now,
      };
      if (check.found) {
        patch.status = "live_verified";
        patch.verified_at = now;
        patch.link_rel = check.rel;
      }
      await db
        .from("link_network_matches")
        .update(patch)
        .eq("id", data.matchId)
        .eq("a_user", userId);
      return { found: check.found, rel: check.rel, status: check.found ? "live_verified" : from };
    },
  );

/** The caller's listing (or null) — for the opt-in card. */
export const getLinkListingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ projectId: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }): Promise<{ listing: LinkListingView | null }> => {
    const db = await admin();
    const { data: raw } = await db
      .from("link_network_listings")
      .select("*")
      .eq("user_id", context.userId as string)
      .eq("project_id", data.projectId)
      .maybeSingle();
    const r = raw as Row | null;
    return {
      listing: r
        ? {
            projectId: str(r.project_id),
            siteUrl: str(r.site_url),
            siteName: str(r.site_name),
            topics: Array.isArray(r.topics) ? (r.topics as string[]) : [],
            language: str(r.language),
            locale: str(r.locale),
            contactEmail: str(r.contact_email),
            status: (str(r.status) as "active" | "paused") || "active",
          }
        : null,
    };
  });
