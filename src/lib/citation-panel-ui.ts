import { z } from "zod";
import {
  DISCOVERY_ROUNDS,
  MAX_PANEL_QUESTIONS,
  discoveryScheduleValid,
  panelProtocolSchema,
  type PanelProtocol,
} from "./citation-panel";
import {
  V1_DISCOVERY_QUESTIONS,
  V1_DISCOVERY_ROUNDS,
  panelDraftSchema,
  v1DiscoveryQuestionsDistinct,
} from "./citation-protocol";

/**
 * Pure helpers for the owner's panel draft/lock UI (Citation Intelligence P2 contracts, owner authoring stage).
 * They only shape and pre-check a draft; the released `save_citation_panel_draft` / `lock_citation_panel` RPCs
 * remain authoritative (prompt binding, the 10×4 discovery grid, the prospective Stockholm schedule, the single
 * discovery baseline, owner-minted approval). Nothing here schedules, collects, locks or approves by itself.
 */
export const STOCKHOLM = "Europe/Stockholm" as const;

/** Two A–Z letters derived from the client name for the panel-local question ids (`XX-D01`/`XX-B01`). */
export function questionIdPrefix(clientName: string): string {
  const letters = clientName
    .normalize("NFKD")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  return letters.length >= 2 ? letters.slice(0, 2) : "MG";
}
export function questionIdFor(prefix: string, kind: PanelProtocol["kind"], index: number): string {
  return `${prefix}-${kind === "discovery" ? "D" : "B"}${String(index + 1).padStart(2, "0")}`;
}

/** A saved prompt revision the owner can bind as a panel question (from `readAnswerEvidenceFn.prompts`). */
export interface PromptChoice {
  id: string;
  revision: number;
  text: string;
  language: string;
}

/** The owner's editable draft form model (no ids/approval — those are derived/minted). */
export interface PanelDraftForm {
  kind: PanelProtocol["kind"];
  client: { name: string; market: string };
  questionLanguage: string;
  interfaceLanguage: string;
  surface: {
    service: string;
    interface: string;
    mode: "consumer-web" | "search";
    searchMode: string;
    modelLabel: string;
    webSearchEvidenced: PanelProtocol["surface"]["webSearchEvidenced"];
  };
  session: {
    personalisation: PanelProtocol["session"]["personalisation"];
    signedIn: PanelProtocol["session"]["signedIn"];
    memory: PanelProtocol["session"]["memory"];
    customInstructions: PanelProtocol["session"]["customInstructions"];
    connectedTools: PanelProtocol["session"]["connectedTools"];
    accountTier: string;
  };
  collection: {
    country: string;
    city: string;
    devicePermission: PanelProtocol["collection"]["devicePermission"];
    vpn: "unknown" | "yes" | "no";
  };
  /** Prompt keys `${id}:${revision}` in panel order. */
  questionKeys: string[];
  /** Discovery only: the first intended weekly slot in Stockholm local wall-clock time. */
  firstSlot: { date: string; time: string };
}

export function emptyPanelDraftForm(seed: {
  clientName: string;
  market: string;
  language: string;
}): PanelDraftForm {
  return {
    kind: "discovery",
    client: { name: seed.clientName, market: seed.market },
    questionLanguage: seed.language,
    interfaceLanguage: seed.language,
    surface: {
      service: "",
      interface: "",
      mode: "consumer-web",
      searchMode: "",
      modelLabel: "",
      webSearchEvidenced: "unknown",
    },
    session: {
      personalisation: "non_personalised",
      signedIn: "signed_out",
      memory: "off",
      customInstructions: "none",
      connectedTools: "none",
      accountTier: "",
    },
    collection: { country: "", city: "", devicePermission: "unknown", vpn: "unknown" },
    questionKeys: [],
    firstSlot: { date: "", time: "10:00" },
  };
}

/** Minutes east of UTC for the instant `ms` in `timeZone` (via Intl; no library). */
export function tzOffsetMinutes(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") === 24 ? 0 : get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - ms) / 60000);
}

/** The UTC instant (ISO, millisecond precision) of a Stockholm wall-clock date + time. */
export function stockholmLocalToIso(date: string, time: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m || !t) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [hh, mm] = [Number(t[1]), Number(t[2])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return null;
  const guess = Date.UTC(y, mo - 1, d, hh, mm, 0, 0);
  let utc = guess - tzOffsetMinutes(guess, STOCKHOLM) * 60000;
  // Re-check across a DST transition: the offset at the corrected instant must reproduce the wall clock.
  const offset2 = tzOffsetMinutes(utc, STOCKHOLM);
  utc = guess - offset2 * 60000;
  if (!Number.isFinite(utc)) return null;
  return new Date(utc).toISOString();
}

/** Weekly Stockholm slots: the same local wall-clock time, seven local days apart, one per round (DST-safe by
 * construction — each slot is converted from its own local date). */
export function weeklyStockholmSlots(
  first: { date: string; time: string },
  rounds: number,
): Array<{ round: number; intendedAt: string }> | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(first.date);
  if (!m || rounds < 1) return null;
  const slots: Array<{ round: number; intendedAt: string }> = [];
  for (let i = 0; i < rounds; i += 1) {
    const local = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 7 * i));
    const date = local.toISOString().slice(0, 10);
    const iso = stockholmLocalToIso(date, first.time);
    if (!iso) return null;
    slots.push({ round: i + 1, intendedAt: iso });
  }
  return slots;
}

/** Build the exact `panelDraftSchema` document for the next version (`expected + 1`). Returns the parsed draft or
 * the schema issues (paths → i18n-able messages); never invents a prompt text: every question copies the bound
 * prompt revision's text verbatim (the RPC refuses a drift). */
export function buildPanelDraft(
  form: PanelDraftForm,
  panelId: string,
  expectedVersion: number,
  prompts: readonly PromptChoice[],
): { ok: true; draft: z.infer<typeof panelDraftSchema> } | { ok: false; issues: string[] } {
  const prefix = questionIdPrefix(form.client.name);
  const byKey = new Map(prompts.map((p) => [`${p.id}:${p.revision}`, p]));
  const questions = form.questionKeys
    .map((key, index) => {
      const p = byKey.get(key);
      return p
        ? {
            id: questionIdFor(prefix, form.kind, index),
            promptId: p.id,
            promptRevision: p.revision,
            text: p.text,
            language: form.questionLanguage.trim(),
          }
        : null;
    })
    .filter((q): q is NonNullable<typeof q> => q !== null);
  const rounds = form.kind === "discovery" ? DISCOVERY_ROUNDS : 0;
  const schedule =
    form.kind === "discovery" && form.firstSlot.date
      ? (() => {
          const slots = weeklyStockholmSlots(form.firstSlot, rounds);
          return slots ? { timezone: STOCKHOLM, slots } : null;
        })()
      : null;
  const candidate = {
    panelId,
    version: expectedVersion + 1,
    kind: form.kind,
    client: { name: form.client.name.trim(), market: form.client.market.trim() },
    questionLanguage: form.questionLanguage.trim(),
    interfaceLanguage: form.interfaceLanguage.trim(),
    surface: {
      service: form.surface.service.trim(),
      interface: form.surface.interface.trim(),
      mode: form.surface.mode,
      searchMode: form.surface.searchMode.trim() || null,
      modelLabel: form.surface.modelLabel.trim() || null,
      webSearchEvidenced: form.surface.webSearchEvidenced,
    },
    session: {
      freshSession: true as const,
      personalisation: form.session.personalisation,
      signedIn: form.session.signedIn,
      memory: form.session.memory,
      customInstructions: form.session.customInstructions,
      connectedTools: form.session.connectedTools,
      ...(form.session.accountTier.trim() ? { accountTier: form.session.accountTier.trim() } : {}),
      extraInstruction: null,
      priorMessages: 0 as const,
    },
    collection: {
      country: form.collection.country.trim() || null,
      city: form.collection.city.trim() || null,
      devicePermission: form.collection.devicePermission,
      vpn: form.collection.vpn === "unknown" ? null : form.collection.vpn === "yes",
    },
    questions,
    rounds,
    ...(form.kind === "discovery" ? { schedule } : {}),
    status: "draft" as const,
    approval: null,
  };
  const parsed = panelDraftSchema.safeParse(candidate);
  if (!parsed.success)
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => `${i.path.join(".") || "panel"}: ${i.message}`),
    };
  return { ok: true, draft: parsed.data };
}

/** Why a stored DRAFT cannot lock yet (i18n keys under `citationAuthoring.lockIssue.*`), mirroring the lock RPC
 * so the owner sees the reasons before pressing "Approve and lock". Empty = ready as far as the client can tell. */
export function lockIssues(panel: PanelProtocol, nowMs: number): string[] {
  const issues: string[] = [];
  if (panel.status !== "draft") issues.push("notDraft");
  if (panel.surface.mode === "api") issues.push("apiSurface");
  if (panel.kind === "discovery") {
    if (panel.questions.length !== V1_DISCOVERY_QUESTIONS) issues.push("tenQuestions");
    if (panel.rounds !== V1_DISCOVERY_ROUNDS) issues.push("fourRounds");
    if (!v1DiscoveryQuestionsDistinct(panel)) issues.push("distinctQuestions");
    if (!discoveryScheduleValid(panel)) issues.push("schedule");
    else if (panel.schedule && panel.schedule.slots.some((s) => Date.parse(s.intendedAt) < nowMs))
      issues.push("scheduleProspective");
  } else if (panel.schedule != null) issues.push("brandUnscheduled");
  return issues;
}

/** Latest stored version per panel id (the head the owner edits/locks), newest first. */
export function panelHeads(panels: readonly PanelProtocol[]): PanelProtocol[] {
  const heads = new Map<string, PanelProtocol>();
  for (const p of panels) {
    const cur = heads.get(p.panelId.toLowerCase());
    if (!cur || p.version > cur.version) heads.set(p.panelId.toLowerCase(), p);
  }
  return [...heads.values()].sort((a, b) => b.version - a.version);
}

/** Current stored version number of a panel id (0 when none) — the `expected` a draft save / lock must pass. */
export function currentPanelVersion(panels: readonly PanelProtocol[], panelId: string): number {
  return panels
    .filter((p) => p.panelId.toLowerCase() === panelId.toLowerCase())
    .reduce((m, p) => Math.max(m, p.version), 0);
}

/** The LOCKED panel versions a finding/improvement may declare as scope (the trigger accepts nothing else). */
export function lockedScopes(panels: readonly PanelProtocol[]) {
  return panels
    .filter((p) => p.status === "locked" && p.approval)
    .map((p) => ({
      panelId: p.panelId,
      panelVersion: p.version,
      client: p.client,
      kind: p.kind,
      approvedAt: p.approval!.approvedAt,
    }))
    .sort((a, b) => Date.parse(b.approvedAt) - Date.parse(a.approvedAt));
}

/** Edit form from a stored draft (the owner revises the head draft into version head+1). */
export function formFromPanel(panel: PanelProtocol): PanelDraftForm {
  const first = panel.schedule?.slots.find((s) => s.round === 1)?.intendedAt;
  let firstSlot = { date: "", time: "10:00" };
  if (first) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: STOCKHOLM,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(first));
    const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    firstSlot = {
      date: `${g("year")}-${g("month")}-${g("day")}`,
      time: `${g("hour")}:${g("minute")}`,
    };
  }
  return {
    kind: panel.kind,
    client: { ...panel.client },
    questionLanguage: panel.questionLanguage,
    interfaceLanguage: panel.interfaceLanguage,
    surface: {
      service: panel.surface.service,
      interface: panel.surface.interface,
      mode: panel.surface.mode === "api" ? "consumer-web" : panel.surface.mode,
      searchMode: panel.surface.searchMode ?? "",
      modelLabel: panel.surface.modelLabel ?? "",
      webSearchEvidenced: panel.surface.webSearchEvidenced,
    },
    session: {
      personalisation: panel.session.personalisation,
      signedIn: panel.session.signedIn,
      memory: panel.session.memory,
      customInstructions: panel.session.customInstructions,
      connectedTools: panel.session.connectedTools,
      accountTier: panel.session.accountTier ?? "",
    },
    collection: {
      country: panel.collection.country ?? "",
      city: panel.collection.city ?? "",
      devicePermission: panel.collection.devicePermission,
      vpn: panel.collection.vpn === null ? "unknown" : panel.collection.vpn ? "yes" : "no",
    },
    questionKeys: panel.questions.map((q) => `${q.promptId}:${q.promptRevision}`),
    firstSlot,
  };
}

export const MAX_QUESTIONS = MAX_PANEL_QUESTIONS;
export const panelSchemaForDisplay = panelProtocolSchema;

/** A stored schedule instant rendered as Stockholm wall-clock (`YYYY-MM-DD HH:MM`) for the read-only detail
 * view; the exact stored UTC instant is shown beside it, never replaced. */
export function stockholmLocalLabel(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: STOCKHOLM,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}
