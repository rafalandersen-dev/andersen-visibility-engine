/**
 * Safe, bounded classification of native AI transport/SDK errors.
 *
 * SECURITY CONTRACT — this module NEVER reads, returns or logs any of:
 *   - error `.message`, `.stack` or a stringified error,
 *   - provider response `.responseBody` / `.body`, `.responseHeaders` /
 *     `.headers`, `.url`, `.requestBodyValues` (these can carry prompts,
 *     private URLs and echoed content),
 *   - the API credential value, its prefix or its length.
 *
 * Classification is derived ONLY from a finite allowlist of structured error
 * NAMES and CODES plus a validated HTTP status, collected over a bounded,
 * cycle-protected `cause` chain. The result is a fixed enum, an optional
 * validated HTTP status integer, and a fixed error-name CATEGORY — all safe to
 * log and (via a separately authored message) to surface.
 *
 * ROBUSTNESS: lookups use own-property maps (never plain-object indexing, which
 * would resolve `constructor`/`toString`/`__proto__` to inherited members), and
 * every property read is guarded so a throwing getter or hostile Proxy cannot
 * make diagnosis throw a second error.
 *
 * DELIBERATELY CONSERVATIVE: we do not over-claim a root cause. A `ReferenceError`
 * or an invalid-header runtime code is recorded as evidence (class `unknown`
 * plus a name category) rather than asserted to be an unsupported runtime or a
 * bad saved key. Only our own request-scoped guard, or the SDK's explicit
 * key-load failure, yields `malformed_credential`.
 */

export type AiErrorClass =
  | "rate_limit"
  | "quota_billing"
  | "auth_rejected"
  | "model_unavailable"
  | "bad_request"
  | "response_format"
  | "provider_server_error"
  | "network"
  | "timeout"
  | "malformed_credential"
  | "unknown";

/** Finite, non-sensitive error-name category. We only ever emit one of these
 * fixed tokens — never an arbitrary error name — so nothing leaks. */
export type AiErrorNameCategory =
  | "AI_APICallError"
  | "AiSdkError"
  | "MiloAiError"
  | "TypeError"
  | "ReferenceError"
  | "SyntaxError"
  | "RangeError"
  | "AbortError"
  | "TimeoutError"
  | "other"
  | "none";

export interface AiErrorDiagnosis {
  /** Fixed, non-sensitive class label. Safe to log and to map to a message. */
  errorClass: AiErrorClass;
  /** Validated provider HTTP status (400–599) or null. Safe to log. */
  httpStatus: number | null;
  /** Fixed error-name category for diagnosis of no-status failures. Safe to log. */
  nameCategory: AiErrorNameCategory;
}

/** Deepest cause chain we will walk. Bounds work on hostile/cyclic inputs. */
const MAX_CAUSE_DEPTH = 8;
/** Ignore absurdly long name/code strings rather than storing/scanning them. */
const MAX_TOKEN_LENGTH = 64;

/**
 * Boolean-only check that a saved credential can be placed in an HTTP header
 * value without the fetch runtime throwing. It rejects empty strings and any
 * byte outside the RFC 7230 field-value range (HTAB, SP and visible ASCII
 * 0x21–0x7E). It makes NO assumption about provider token shape — no required
 * prefix, length or alphabet beyond raw header-safety — so future key formats
 * keep working. The value is never logged, returned or otherwise exposed.
 */
export function isHeaderSafeCredential(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 0x09) continue; // HTAB
    if (c < 0x20 || c > 0x7e) return false; // control chars, CR/LF, non-ASCII
  }
  // A value made only of whitespace cannot authenticate anything.
  return value.trim().length > 0;
}

/** Provider error codes that mean "out of money/quota", not "slow down". */
const QUOTA_CODES = new Set<string>([
  "insufficient_quota",
  "billing_hard_limit_reached",
  "billing_not_active",
  "account_deactivated",
]);

/** Structured error NAMES → class. A Map (not a plain object) so a name like
 * `constructor` or `__proto__` cannot resolve to an inherited member. Matched
 * exactly against `error.name`, so a free-text message that merely contains one
 * of these words cannot steer the result. AI SDK names come from
 * @ai-sdk/provider and the `ai` package. */
const NAME_CLASS = new Map<string, AiErrorClass>([
  // Credential loading / shape — only these two definitively implicate the key.
  ["AI_LoadAPIKeyError", "malformed_credential"],
  ["AiMalformedCredentialError", "malformed_credential"],
  // Model selection
  ["AI_NoSuchModelError", "model_unavailable"],
  ["AI_NoSuchProviderError", "model_unavailable"],
  ["AI_NoSuchProviderReferenceError", "model_unavailable"],
  ["AI_UnsupportedModelVersionError", "model_unavailable"],
  // Response shape / content
  ["AI_NoObjectGeneratedError", "response_format"],
  ["AI_NoOutputGeneratedError", "response_format"],
  ["AI_NoContentGeneratedError", "response_format"],
  ["AI_JSONParseError", "response_format"],
  ["AI_TypeValidationError", "response_format"],
  ["AI_InvalidResponseDataError", "response_format"],
  ["AI_EmptyResponseBodyError", "response_format"],
  ["ZodError", "response_format"],
  ["AiResponseFormatError", "response_format"],
  // Cancellation / deadline
  ["AbortError", "timeout"],
  ["TimeoutError", "timeout"],
  // Retry exhaustion in the SDK generally wraps transport failures.
  ["AI_RetryError", "network"],
]);

/** System / undici error CODES → class. Only unambiguous transport codes; a
 * bad-header code is NOT assumed to prove a bad saved key (see module note). */
const CODE_CLASS = new Map<string, AiErrorClass>([
  ["ECONNREFUSED", "network"],
  ["ECONNRESET", "network"],
  ["ENOTFOUND", "network"],
  ["EAI_AGAIN", "network"],
  ["ENETUNREACH", "network"],
  ["EHOSTUNREACH", "network"],
  ["EPIPE", "network"],
  ["UND_ERR_SOCKET", "network"],
  ["ETIMEDOUT", "timeout"],
  ["UND_ERR_CONNECT_TIMEOUT", "timeout"],
  ["UND_ERR_HEADERS_TIMEOUT", "timeout"],
  ["UND_ERR_BODY_TIMEOUT", "timeout"],
]);

/** Read one own/inherited property without letting a throwing getter or a
 * hostile Proxy propagate. Returns undefined on any failure. */
function safeGet(obj: object, key: string): unknown {
  try {
    return (obj as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function validStatus(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 400 && v <= 599 ? v : null;
}

function addToken(set: Set<string>, value: unknown): void {
  if (typeof value === "string" && value.length > 0 && value.length <= MAX_TOKEN_LENGTH) {
    set.add(value);
  } else if (typeof value === "number" && Number.isInteger(value)) {
    set.add(String(value));
  }
}

interface Signals {
  names: Set<string>;
  codes: Set<string>;
  status: number | null;
  retryable: boolean | null;
}

/**
 * Walk the error and its `cause` chain (bounded depth, cycle-protected),
 * collecting ONLY allow-shaped structured fields. Reads exactly: `name`,
 * `code`, `statusCode`/`status`, `isRetryable`, and the single well-known
 * nested provider field `data.error.code`. Never touches message/body/headers,
 * and never throws — a throwing getter/Proxy just yields no signal for that
 * field.
 */
function collect(error: unknown): Signals {
  const names = new Set<string>();
  const codes = new Set<string>();
  let status: number | null = null;
  let retryable: boolean | null = null;
  const seen = new Set<unknown>();

  let node: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (node === null || typeof node !== "object") break;
    if (seen.has(node)) break; // cycle protection
    seen.add(node);

    addToken(names, safeGet(node, "name"));
    addToken(codes, safeGet(node, "code"));

    // One narrow, well-known nested provider field only (e.g. OpenAI
    // "insufficient_quota"). Never the message or the rest of the body.
    const data = safeGet(node, "data");
    if (data !== null && typeof data === "object") {
      const inner = safeGet(data, "error");
      if (inner !== null && typeof inner === "object") {
        addToken(codes, safeGet(inner, "code"));
      }
    }

    if (status === null)
      status = validStatus(safeGet(node, "statusCode")) ?? validStatus(safeGet(node, "status"));
    if (retryable === null) {
      const r = safeGet(node, "isRetryable");
      if (typeof r === "boolean") retryable = r;
    }

    node = safeGet(node, "cause");
  }

  return { names, codes, status, retryable };
}

/** Map a validated HTTP status to a class (429 handled separately for quota). */
function statusClass(status: number): AiErrorClass | null {
  if (status === 402) return "quota_billing";
  if (status === 401 || status === 403) return "auth_rejected";
  if (status === 404) return "model_unavailable";
  if (status === 400 || status === 422) return "bad_request";
  if (status >= 500 && status <= 599) return "provider_server_error";
  return null;
}

/** Explicit, safe error-name categories for diagnosis. Order matters. */
const KNOWN_NAME_CATEGORIES: readonly AiErrorNameCategory[] = [
  "AI_APICallError",
  "TypeError",
  "ReferenceError",
  "SyntaxError",
  "RangeError",
  "AbortError",
  "TimeoutError",
];

/** Reduce the collected names to one fixed, non-sensitive category. Only
 * emits allowlisted tokens — an arbitrary/hostile name becomes "other". */
function nameCategory(names: Set<string>): AiErrorNameCategory {
  for (const known of KNOWN_NAME_CATEGORIES) if (names.has(known)) return known;
  for (const n of names) {
    if (n.startsWith("AI_")) return "AiSdkError";
    if (n.startsWith("Ai")) return "MiloAiError";
  }
  return names.size > 0 ? "other" : "none";
}

/**
 * Classify an unknown thrown value into a fixed, non-sensitive class, a
 * validated HTTP status and an allowlisted name category. Deterministic
 * precedence: explicit malformed credential first, then authoritative HTTP
 * status, then SDK error names, then transport codes, then a retryable hint.
 * Never throws.
 */
export function classifyAiError(error: unknown): AiErrorDiagnosis {
  const { names, codes, status, retryable } = collect(error);
  const category = nameCategory(names);
  const done = (errorClass: AiErrorClass): AiErrorDiagnosis => ({
    errorClass,
    httpStatus: status,
    nameCategory: category,
  });

  // 1) Malformed credential — a saved key that cannot form a valid header, or
  //    the SDK's explicit key-load failure. Highest precedence: a configuration
  //    fault, not a transient state. (Runtime bad-header CODES are intentionally
  //    NOT treated as proof of a bad key.)
  if (names.has("AiMalformedCredentialError") || names.has("AI_LoadAPIKeyError")) {
    return done("malformed_credential");
  }

  // 2) HTTP status — the most authoritative signal for a provider response.
  if (status !== null) {
    if (status === 429) {
      // 429 covers both "slow down" and "out of quota"; only an allowlisted
      // quota/billing code upgrades it away from a retryable rate limit.
      for (const c of codes) if (QUOTA_CODES.has(c)) return done("quota_billing");
      return done("rate_limit");
    }
    const byStatus = statusClass(status);
    if (byStatus) return done(byStatus);
  }

  // 3) SDK error names.
  for (const n of names) {
    const cls = NAME_CLASS.get(n);
    if (cls) return done(cls);
  }

  // 4) System / transport codes (network, timeout).
  for (const c of codes) {
    const cls = CODE_CLASS.get(c);
    if (cls) return done(cls);
  }

  // 5) An SDK APICallError with no usable status but flagged retryable is a
  //    transport-level failure.
  if (retryable === true) return done("network");

  return done("unknown");
}

/** Classes that describe a configuration/model/auth/billing fault: a plain
 * "try again" is misleading for these, so their messages omit retry advice. */
const NO_RETRY_CLASSES: ReadonlySet<AiErrorClass> = new Set<AiErrorClass>([
  "quota_billing",
  "auth_rejected",
  "model_unavailable",
  "malformed_credential",
]);

const USER_MESSAGE = new Map<AiErrorClass, string>([
  ["rate_limit", "AI is busy right now (rate limit). Please retry in a moment."],
  [
    "quota_billing",
    "AI credits or quota are exhausted. The workspace owner needs to review the AI billing balance.",
  ],
  [
    "auth_rejected",
    "The AI service rejected the connected credentials. The workspace owner needs to reconnect the AI key.",
  ],
  [
    "model_unavailable",
    "The configured AI model is unavailable. The workspace owner needs to review the AI model configuration.",
  ],
  [
    "malformed_credential",
    "The saved AI key is not in a usable format. The workspace owner needs to re-enter it.",
  ],
  ["bad_request", "AI could not process this request. Please adjust the content and try again."],
  ["response_format", "The AI service returned an unexpected format. Please try again."],
  [
    "provider_server_error",
    "The AI service had a temporary server error. Please try again shortly.",
  ],
  ["network", "Milo could not reach the AI service (network problem). Please try again shortly."],
  [
    "timeout",
    "AI generation timed out. The provider may still have processed the request; Milo did not retry it.",
  ],
  ["unknown", "AI generation failed unexpectedly. Please try again."],
]);

/** Actionable, non-sensitive message for a class. No secret material is ever
 * interpolated; configuration/model/auth/billing classes omit retry advice. */
export function aiErrorUserMessage(errorClass: AiErrorClass): string {
  return USER_MESSAGE.get(errorClass) ?? USER_MESSAGE.get("unknown")!;
}

/** Whether a class is safe to advise the user to simply retry. Exposed for
 * tests and callers that want to gate retry affordances. */
export function isRetryableClass(errorClass: AiErrorClass): boolean {
  return !NO_RETRY_CLASSES.has(errorClass);
}
