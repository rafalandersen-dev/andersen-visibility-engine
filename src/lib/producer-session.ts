/**
 * Producer session ownership (AY).
 *
 * Every asynchronous client producer (AI regenerations, analyses, content generation, publishing
 * projections) captures the hydrated workspace session — user + epoch — BEFORE its first
 * asynchronous step, re-checks it before later paid/external steps and immediately before every
 * store mutation, and never writes a result from a prior session into a signed-out or replacement
 * session (same user with a new epoch included). Reuses the store's real session context; no store
 * rewrite, no archive, no schema, no provider call.
 *
 * Pending work is tracked per (user, epoch, operation) so a late `finally` of an old session can
 * never clear a new session's entry, a new user is never blocked by an old key, and the shell can
 * show a truthful count for the CURRENT session only. Work is classified honestly:
 * - "unretained": the result exists only in the browser until saved (metadata, FAQ, CTA, quality,
 *   analyses, outreach, sitemap inventory, source validation, improved drafts).
 * - "retained": the server keeps a private recoverable artifact for the original user (long-form
 *   content generation) — the client import is fenced, recovery is the existing Recent generations path.
 * - "external": a publishing/connector effect that may already have happened on the destination;
 *   only its late local projection is fenced, never re-sent.
 */
import { useSyncExternalStore } from "react";
import { getWorkspaceSaveContext } from "./store";

export type ProducerWorkKind = "unretained" | "retained" | "external";

export type ProducerSessionErrorCode =
  "not_ready" | "stale_session" | "source_changed" | "signing_out";

/** Typed, non-technical producer outcome; call sites translate `key`. */
export class ProducerSessionError extends Error {
  readonly code: ProducerSessionErrorCode;
  readonly key: string;
  constructor(code: ProducerSessionErrorCode) {
    super(PRODUCER_MESSAGES[code]);
    this.name = "ProducerSessionError";
    this.code = code;
    this.key = `shell.producer.${PRODUCER_KEYS[code]}`;
  }
}
const PRODUCER_KEYS: Record<ProducerSessionErrorCode, string> = {
  not_ready: "notReady",
  stale_session: "staleSession",
  source_changed: "sourceChanged",
  signing_out: "signingOut",
};
const PRODUCER_MESSAGES: Record<ProducerSessionErrorCode, string> = {
  not_ready: "The workspace is not ready yet. Try again once it has loaded.",
  stale_session: "The workspace session changed. The result was not applied.",
  source_changed: "The content changed while this was running. Run it again.",
  signing_out: "Sign-out is in progress. This action was not started.",
};

export const producerSourceChanged = () => new ProducerSessionError("source_changed");
/** Translate a producer outcome for the user; `null` for any other error (existing handling). */
export const producerErrorMessage = (error: unknown, t: (key: string) => string): string | null =>
  error instanceof ProducerSessionError ? t(error.key) : null;

export interface ProducerSession {
  readonly userId: string;
  readonly epoch: number;
  readonly operation: string;
  readonly kind: ProducerWorkKind;
  /** Throws `ProducerSessionError("stale_session")` when the workspace session is no longer this one. */
  check(): void;
  /** Whether this session is still the current one (no throw). */
  isCurrent(): boolean;
}

interface Entry {
  userId: string;
  epoch: number;
  operation: string;
  kind: ProducerWorkKind;
}

const pending = new Map<string, Entry>();
/** Active closing leases, one per sign-out attempt, each bound to its session. Several attempts
 * of the SAME session may overlap (a remounted shell); each protects admission until ITS owner
 * releases it, so a later attempt's Stay can never cancel an earlier issued request's barrier. */
const closingLeases = new Map<number, { userId: string; epoch: number; issued: boolean }>();
let leaseSeq = 0;
let version = 0;
const listeners = new Set<() => void>();
const bump = () => {
  version += 1;
  listeners.forEach((l) => l());
};
const keyOf = (userId: string, epoch: number, operation: string) =>
  `${userId}|${epoch}|${operation}`;

const sameSession = (
  a: { userId: string; epoch: number },
  ctx: ReturnType<typeof getWorkspaceSaveContext>,
) => ctx.userId === a.userId && ctx.epoch === a.epoch;

/** Capture the current session for one operation. Throws when not hydrated, when the session is
 * being signed out, or when the same operation is already pending in THIS session. */
export function beginProducerWork(
  operation: string,
  kind: ProducerWorkKind,
): ProducerSession & { release(): void } {
  const ctx = getWorkspaceSaveContext();
  if (!ctx.hydrated || !ctx.userId) throw new ProducerSessionError("not_ready");
  if (isSessionClosing()) throw new ProducerSessionError("signing_out");
  const key = keyOf(ctx.userId, ctx.epoch, operation);
  if (pending.has(key)) throw new Error("Already generating — please wait.");
  const entry: Entry = { userId: ctx.userId, epoch: ctx.epoch, operation, kind };
  pending.set(key, entry);
  bump();
  const isCurrent = () => sameSession(entry, getWorkspaceSaveContext());
  return {
    userId: entry.userId,
    epoch: entry.epoch,
    operation,
    kind,
    isCurrent,
    check() {
      if (!isCurrent()) throw new ProducerSessionError("stale_session");
    },
    release() {
      if (pending.get(key) === entry) {
        pending.delete(key); // only this entry — never a newer session's work under the same operation
        bump();
      }
    },
  };
}

/** Run one producer under session ownership; `session.check()` is the fence inside `fn`. */
export async function runOwnedProducer<T>(
  operation: string,
  kind: ProducerWorkKind,
  fn: (session: ProducerSession) => Promise<T>,
): Promise<T> {
  const session = beginProducerWork(operation, kind);
  try {
    return await fn(session);
  } finally {
    session.release();
  }
}

/** Nested helpers may swallow errors for fallbacks; a session retirement must still propagate. */
export const rethrowSessionError = (error: unknown): null => {
  if (error instanceof ProducerSessionError) throw error;
  return null;
};

/** A closing lease: while active, the session it was acquired in admits no new producer work.
 * Only its owner can release it, so an old flow's cleanup can never clear a newer session's lease. */
export interface ClosingLease {
  release(): void;
  isActive(): boolean;
  /** The attempt has issued its supplier sign-out request (cannot be cancelled from here). */
  markIssued(): void;
  /** That request settled (success or refusal); the lease itself stays until released. */
  markSettled(): void;
}
/** Acquire a closing lease for the CURRENT session. Earlier leases of the same session stay active. */
export function acquireClosingLease(): ClosingLease {
  const ctx = getWorkspaceSaveContext();
  const id = ++leaseSeq;
  if (ctx.userId) closingLeases.set(id, { userId: ctx.userId, epoch: ctx.epoch, issued: false });
  bump();
  return {
    release() {
      if (closingLeases.delete(id)) bump(); // only this attempt's own lease
    },
    isActive: () => closingLeases.has(id),
    markIssued() {
      const entry = closingLeases.get(id);
      if (entry && !entry.issued) {
        entry.issued = true;
        bump();
      }
    },
    markSettled() {
      const entry = closingLeases.get(id);
      if (entry?.issued) {
        entry.issued = false;
        bump();
      }
    },
  };
}
const currentLeases = () => {
  const ctx = getWorkspaceSaveContext();
  return [...closingLeases.values()].filter((l) => sameSession(l, ctx));
};
/** True while any sign-out attempt of the CURRENT session holds a lease (no new work admitted). */
export const isSessionClosing = (): boolean => currentLeases().length > 0;
/** True while a supplier sign-out request of the CURRENT session is issued and unsettled. */
export const isSessionAuthPending = (): boolean => currentLeases().some((l) => l.issued);
export function useSessionAuthPending(): boolean {
  return useSyncExternalStore(subscribePendingProducerWork, isSessionAuthPending, () => false);
}

export interface PendingProducerWork {
  unretained: number;
  retained: number;
  external: number;
  operations: string[];
}
const EMPTY: PendingProducerWork = Object.freeze({
  unretained: 0,
  retained: 0,
  external: 0,
  operations: [],
});
let snapshotCache: {
  version: number;
  userId: string | null;
  epoch: number;
  value: PendingProducerWork;
} | null = null;

/** Pending work of the CURRENT session only (other sessions' late entries are invisible). */
export function getPendingProducerWork(): PendingProducerWork {
  const ctx = getWorkspaceSaveContext();
  if (
    snapshotCache &&
    snapshotCache.version === version &&
    snapshotCache.userId === ctx.userId &&
    snapshotCache.epoch === ctx.epoch
  ) {
    return snapshotCache.value;
  }
  let value: PendingProducerWork = EMPTY;
  if (ctx.userId) {
    const mine = [...pending.values()].filter(
      (e) => e.userId === ctx.userId && e.epoch === ctx.epoch,
    );
    if (mine.length) {
      value = {
        unretained: mine.filter((e) => e.kind === "unretained").length,
        retained: mine.filter((e) => e.kind === "retained").length,
        external: mine.filter((e) => e.kind === "external").length,
        operations: mine.map((e) => e.operation),
      };
    }
  }
  snapshotCache = { version, userId: ctx.userId, epoch: ctx.epoch, value };
  return value;
}
export const subscribePendingProducerWork = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function usePendingProducerWork(): PendingProducerWork {
  return useSyncExternalStore(subscribePendingProducerWork, getPendingProducerWork, () => EMPTY);
}

/** Test-only: forget every entry and the closing mark. */
export function resetProducerSessionsForTests(): void {
  pending.clear();
  closingLeases.clear();
  bump();
}
