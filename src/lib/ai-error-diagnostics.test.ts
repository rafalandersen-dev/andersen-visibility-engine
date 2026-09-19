import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyAiError,
  aiErrorUserMessage,
  isHeaderSafeCredential,
  isRetryableClass,
  type AiErrorClass,
  type AiErrorNameCategory,
} from "./ai-error-diagnostics.server";
import {
  modelFor,
  AiProviderConfigurationError,
  AiMalformedCredentialError,
} from "./ai-provider.server";

// A realistic-looking secret used to prove it never leaks into a class, a
// logged field or a user-facing message. It also appears inside hostile,
// misleading free-text messages that must NOT drive classification.
const SECRET = "sk-proj-LIVE-DO-NOT-LEAK-abcdef0123456789ABCDEFGHIJKLMN";

/** Every class the classifier is allowed to return. */
const ALL_CLASSES: AiErrorClass[] = [
  "rate_limit",
  "quota_billing",
  "auth_rejected",
  "model_unavailable",
  "bad_request",
  "response_format",
  "provider_server_error",
  "network",
  "timeout",
  "malformed_credential",
  "unknown",
];

/** Build an Error whose message is hostile: it embeds the secret and words
 * that would fool a message-regex classifier (rate limit / quota / 401 …). */
function hostile(fields: Record<string, unknown>): Error {
  const e = new Error(
    `429 rate limit exceeded quota billing 401 unauthorized Bearer ${SECRET} ECONNREFUSED schema invalid`,
  );
  Object.assign(e, fields);
  return e;
}

/** Embed a raw control/byte in an otherwise valid-looking key, built here so
 * the test source itself stays ASCII-only and unambiguous. */
const withByte = (code: number) => `sk-abc${String.fromCharCode(code)}123`;

describe("isHeaderSafeCredential — boolean only, no shape assumptions", () => {
  it.each([
    "sk-abc123",
    "sk-proj-abc_DEF-123",
    "opaque token with spaces",
    `AbC${String.fromCharCode(0x09)}123`, // HTAB is permitted in an HTTP field value
    "x".repeat(500), // long but header-safe: no length assumption
    "!#$%&'*+-.^_`|~", // visible ASCII punctuation
  ])("accepts a header-safe credential (%s)", (value) => {
    expect(isHeaderSafeCredential(value)).toBe(true);
  });

  it.each([
    ["empty string", ""],
    ["only whitespace", "   "],
    ["newline", withByte(0x0a)],
    ["carriage return", withByte(0x0d)],
    ["null byte", withByte(0x00)],
    ["vertical tab", withByte(0x0b)],
    ["unit separator 0x1f", withByte(0x1f)],
    ["DEL 0x7f", withByte(0x7f)],
    ["non-ASCII accent", "kéy-1234"],
    ["high byte 0x80", withByte(0x80)],
  ])("rejects an unusable credential: %s", (_label, value) => {
    expect(isHeaderSafeCredential(value)).toBe(false);
  });

  it.each([null, undefined, 123, {}, []])("rejects non-strings (%s)", (value) => {
    expect(isHeaderSafeCredential(value as unknown)).toBe(false);
  });

  it("never derives a boolean from the credential's length or prefix alone", () => {
    // Two keys of very different length/prefix are equally accepted; the check
    // is purely about header-safety, not shape.
    expect(isHeaderSafeCredential("a")).toBe(true);
    expect(isHeaderSafeCredential("totally-different-prefix-and-length-0000000000")).toBe(true);
  });
});

describe("classifyAiError — HTTP status precedence", () => {
  it.each<[number, AiErrorClass]>([
    [401, "auth_rejected"],
    [403, "auth_rejected"],
    [404, "model_unavailable"],
    [400, "bad_request"],
    [422, "bad_request"],
    [402, "quota_billing"],
    [500, "provider_server_error"],
    [502, "provider_server_error"],
    [503, "provider_server_error"],
  ])("status %s → %s", (statusCode, expected) => {
    const { errorClass, httpStatus, nameCategory } = classifyAiError(
      hostile({ name: "AI_APICallError", statusCode }),
    );
    expect(errorClass).toBe(expected);
    expect(httpStatus).toBe(statusCode);
    expect(nameCategory).toBe("AI_APICallError");
  });

  it("429 without a quota code → retryable rate limit", () => {
    const { errorClass } = classifyAiError({
      name: "AI_APICallError",
      statusCode: 429,
      code: "rate_limit_exceeded",
    });
    expect(errorClass).toBe("rate_limit");
  });

  it.each(["insufficient_quota", "billing_hard_limit_reached", "billing_not_active"])(
    "429 with quota/billing code %s → quota_billing (not a rate limit)",
    (code) => {
      const err = { name: "AI_APICallError", statusCode: 429, data: { error: { code } } };
      expect(classifyAiError(err).errorClass).toBe("quota_billing");
    },
  );
});

describe("classifyAiError — status validation", () => {
  it.each([200, 302, 399, 600, 999, 0, -1, NaN, 4.5])(
    "ignores an out-of-range/non-integer status (%s)",
    (statusCode) => {
      const { errorClass, httpStatus } = classifyAiError({ statusCode });
      expect(httpStatus).toBeNull();
      expect(errorClass).toBe("unknown");
    },
  );

  it("ignores a non-numeric status string", () => {
    const { httpStatus } = classifyAiError({ statusCode: "500" });
    expect(httpStatus).toBeNull();
  });
});

describe("classifyAiError — SDK/runtime names", () => {
  it.each<[string, AiErrorClass]>([
    ["AI_LoadAPIKeyError", "malformed_credential"],
    ["AI_NoSuchModelError", "model_unavailable"],
    ["AI_UnsupportedModelVersionError", "model_unavailable"],
    ["AI_JSONParseError", "response_format"],
    ["AI_TypeValidationError", "response_format"],
    ["AI_NoObjectGeneratedError", "response_format"],
    ["ZodError", "response_format"],
    ["AiResponseFormatError", "response_format"],
    ["AI_RetryError", "network"],
    ["AbortError", "timeout"],
    ["TimeoutError", "timeout"],
  ])("name %s → %s", (name, expected) => {
    expect(classifyAiError({ name }).errorClass).toBe(expected);
  });

  it("does NOT over-claim: a bare ReferenceError is unknown, only recorded as evidence", () => {
    const err = new ReferenceError("process is not defined");
    const { errorClass, httpStatus, nameCategory } = classifyAiError(err);
    expect(errorClass).toBe("unknown");
    expect(httpStatus).toBeNull();
    expect(nameCategory).toBe("ReferenceError");
  });

  it("does NOT treat a runtime bad-header code as proof of a bad key", () => {
    // A header-token runtime error could be about any header; the classifier
    // records evidence but must not assert malformed_credential.
    const err = Object.assign(new TypeError("Invalid header value"), {
      code: "ERR_INVALID_HTTP_TOKEN",
    });
    const { errorClass, nameCategory } = classifyAiError(err);
    expect(errorClass).toBe("unknown");
    expect(nameCategory).toBe("TypeError");
  });
});

describe("classifyAiError — transport codes", () => {
  it.each<[string, AiErrorClass]>([
    ["ECONNREFUSED", "network"],
    ["ECONNRESET", "network"],
    ["ENOTFOUND", "network"],
    ["EAI_AGAIN", "network"],
    ["UND_ERR_SOCKET", "network"],
    ["ETIMEDOUT", "timeout"],
    ["UND_ERR_CONNECT_TIMEOUT", "timeout"],
    ["UND_ERR_HEADERS_TIMEOUT", "timeout"],
  ])("code %s → %s", (code, expected) => {
    expect(classifyAiError({ code }).errorClass).toBe(expected);
  });

  it("classifies a fetch TypeError whose cause carries a DNS code", () => {
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
    const err = Object.assign(new TypeError("fetch failed"), { cause });
    const { errorClass, nameCategory } = classifyAiError(err);
    expect(errorClass).toBe("network");
    expect(nameCategory).toBe("TypeError");
  });

  it("treats an APICallError with no status but isRetryable as network", () => {
    expect(classifyAiError({ name: "AI_APICallError", isRetryable: true }).errorClass).toBe(
      "network",
    );
  });
});

describe("classifyAiError — malformed credential precedence", () => {
  it("classifies the typed AiMalformedCredentialError", () => {
    const { errorClass, nameCategory } = classifyAiError(new AiMalformedCredentialError());
    expect(errorClass).toBe("malformed_credential");
    expect(nameCategory).toBe("MiloAiError");
  });

  it("prefers malformed_credential over a co-present retryable status", () => {
    // A confusing error advertising both a header-token fault and a 429.
    const err = { name: "AiMalformedCredentialError", statusCode: 429 };
    expect(classifyAiError(err).errorClass).toBe("malformed_credential");
  });
});

describe("classifyAiError — prototype-pollution-safe lookups (regression)", () => {
  it.each(["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf", "prototype"])(
    "a malicious error name %s never resolves to an inherited member",
    (name) => {
      const { errorClass, nameCategory } = classifyAiError({ name });
      expect(ALL_CLASSES).toContain(errorClass);
      expect(errorClass).toBe("unknown");
      // The category is a fixed token, never the raw hostile name.
      const allowed: AiErrorNameCategory[] = ["other", "none"];
      expect(allowed).toContain(nameCategory);
    },
  );

  it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])(
    "a malicious error code %s never resolves to an inherited member",
    (code) => {
      const { errorClass } = classifyAiError({ code });
      expect(errorClass).toBe("unknown");
    },
  );

  it("passing a malicious value to aiErrorUserMessage falls back to the unknown message", () => {
    // Defensive: even if a caller supplies a non-enum key, no function/object
    // leaks out and the message is the safe unknown default.
    const message = aiErrorUserMessage("__proto__" as unknown as AiErrorClass);
    expect(typeof message).toBe("string");
    expect(message).toBe(aiErrorUserMessage("unknown"));
  });
});

describe("classifyAiError — hostile getters/proxies must not throw", () => {
  it("survives an object whose every property getter throws", () => {
    const boom = new Proxy(
      {},
      {
        get() {
          throw new Error("nope");
        },
      },
    );
    expect(() => classifyAiError(boom)).not.toThrow();
    expect(classifyAiError(boom).errorClass).toBe("unknown");
  });

  it("survives a throwing `cause` getter while still reading a valid status", () => {
    const err: Record<string, unknown> = { name: "AI_APICallError", statusCode: 500 };
    Object.defineProperty(err, "cause", {
      get() {
        throw new Error("cause explodes");
      },
      enumerable: true,
    });
    const { errorClass, httpStatus } = classifyAiError(err);
    expect(errorClass).toBe("provider_server_error");
    expect(httpStatus).toBe(500);
  });

  it("survives a throwing `name` getter", () => {
    const err: Record<string, unknown> = { code: "ECONNREFUSED" };
    Object.defineProperty(err, "name", {
      get() {
        throw new Error("name explodes");
      },
      enumerable: true,
    });
    expect(classifyAiError(err).errorClass).toBe("network");
  });
});

describe("classifyAiError — nested causes and cycles", () => {
  it("finds a network code nested two levels deep", () => {
    const err = { name: "Error", cause: { name: "Error", cause: { code: "ECONNREFUSED" } } };
    expect(classifyAiError(err).errorClass).toBe("network");
  });

  it("uses the shallowest status when causes disagree", () => {
    const err = { name: "AI_APICallError", statusCode: 503, cause: { statusCode: 401 } };
    const { errorClass, httpStatus } = classifyAiError(err);
    expect(httpStatus).toBe(503);
    expect(errorClass).toBe("provider_server_error");
  });

  it("terminates on a direct self-referential cause cycle", () => {
    const a: Record<string, unknown> = { name: "Error" };
    a.cause = a;
    expect(classifyAiError(a).errorClass).toBe("unknown");
  });

  it("terminates on a mutual cause cycle and still reads structured signals", () => {
    const a: Record<string, unknown> = { name: "Error", code: "ECONNREFUSED" };
    const b: Record<string, unknown> = { name: "Error" };
    a.cause = b;
    b.cause = a;
    expect(classifyAiError(a).errorClass).toBe("network");
  });

  it("does not follow an unbounded cause chain", () => {
    // 50 nested causes; a network code past the depth limit is intentionally
    // NOT reached, proving the traversal is bounded.
    let node: Record<string, unknown> = { code: "ECONNREFUSED" };
    for (let i = 0; i < 50; i++) node = { name: "Error", cause: node };
    expect(classifyAiError(node).errorClass).toBe("unknown");
  });
});

describe("classifyAiError — hostile messages never drive classification or leak", () => {
  it("ignores misleading words in the message; uses only the structured status", () => {
    // Message screams 429/quota/401/ECONNREFUSED but the real status is 500.
    const { errorClass, httpStatus } = classifyAiError(hostile({ statusCode: 500 }));
    expect(errorClass).toBe("provider_server_error");
    expect(httpStatus).toBe(500);
  });

  it("returns unknown when only a hostile message is present (no structured fields)", () => {
    expect(classifyAiError(new Error(SECRET)).errorClass).toBe("unknown");
  });

  it("never surfaces the secret via the diagnosis or the user message", () => {
    const err = hostile({ name: "AI_APICallError", statusCode: 401 });
    const diagnosis = classifyAiError(err);
    expect(JSON.stringify(diagnosis)).not.toContain(SECRET);
    const message = aiErrorUserMessage(diagnosis.errorClass);
    expect(message).not.toContain(SECRET);
    expect(message).not.toContain("Bearer");
  });
});

describe("classifyAiError — unknown fallbacks", () => {
  it.each([undefined, null, "a string", 42, {}, [], new Error("plain")])(
    "classifies unrecognised input as unknown (%s)",
    (input) => {
      expect(classifyAiError(input as unknown).errorClass).toBe("unknown");
    },
  );

  it("ignores unrecognised names and codes entirely", () => {
    const { errorClass, nameCategory } = classifyAiError({
      name: "SomeVendorError",
      code: "E_MADE_UP",
    });
    expect(errorClass).toBe("unknown");
    expect(nameCategory).toBe("other");
  });

  it("reports name category 'none' when there is no object/name", () => {
    expect(classifyAiError("just a string").nameCategory).toBe("none");
  });
});

describe("user messages — actionable, no misleading retry advice", () => {
  const NO_RETRY: AiErrorClass[] = [
    "quota_billing",
    "auth_rejected",
    "model_unavailable",
    "malformed_credential",
  ];

  it.each(NO_RETRY)("%s omits retry advice and is flagged non-retryable", (cls) => {
    const message = aiErrorUserMessage(cls).toLowerCase();
    expect(message).not.toContain("retry");
    expect(message).not.toContain("try again");
    expect(isRetryableClass(cls)).toBe(false);
  });

  it.each<AiErrorClass>([
    "rate_limit",
    "network",
    "provider_server_error",
    "response_format",
    "unknown",
  ])("%s is retryable and gives a non-empty message", (cls) => {
    expect(isRetryableClass(cls)).toBe(true);
    expect(aiErrorUserMessage(cls).length).toBeGreaterThan(0);
  });

  it("every class has a distinct, non-empty message", () => {
    const messages = ALL_CLASSES.map(aiErrorUserMessage);
    expect(new Set(messages).size).toBe(ALL_CLASSES.length);
    for (const m of messages) expect(m.trim().length).toBeGreaterThan(0);
  });
});

describe("modelFor — request-scoped credential guard (no value ever read/logged)", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("AI_CANDIDATE_MODEL", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds the default model when the saved key is header-safe", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-proj-well-formed-key");
    expect(() => modelFor()).not.toThrow();
  });

  // NOTE: NUL is intentionally NOT tested here — Node's process.env truncates a
  // value at the first NUL byte, so the fixture would not reach the guard. The
  // NUL case is covered directly against isHeaderSafeCredential above.
  it.each([
    ["newline", withByte(0x0a)],
    ["carriage return", withByte(0x0d)],
    ["non-ASCII", "kéy-nonascii"],
    ["vertical tab", withByte(0x0b)],
  ])(
    "throws AiMalformedCredentialError for an unusable saved key (%s) — no reservation, no transport",
    (_label, key) => {
      vi.stubEnv("OPENAI_API_KEY", key);
      expect(() => modelFor()).toThrow(AiMalformedCredentialError);
    },
  );

  it("still reports an entirely missing key as a configuration error", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(() => modelFor()).toThrow(AiProviderConfigurationError);
  });
});
