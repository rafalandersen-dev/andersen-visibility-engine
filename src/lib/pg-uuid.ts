/**
 * Canonical PostgreSQL UUID identity for comparison and keying — a leaf module (no imports) so both the
 * citation-protocol layer and the legacy answer-evidence intake can share ONE normalizer without any
 * circular import (importing it from citation-protocol.server.ts would cycle through that module's
 * answer-evidence.server.ts dependency).
 *
 * PostgreSQL normalizes any accepted uuid spelling to lowercase in its uuid COLUMNS, but a uuid persisted
 * inside an IMMUTABLE JSON document/context keeps the client's ORIGINAL spelling — which may be
 * UPPERCASE/mixed-case (`z.string().uuid()` accepts it). Comparing or keying those by raw string treats
 * two spellings of ONE uuid as different: a validly-admitted capture reads unresolved, a correction chain
 * fails to link, or a legacy write-guard is bypassed. Normalizing a uuid-shaped value to its canonical
 * PostgreSQL text (lowercase) makes identity SEMANTIC without rewriting any stored value. A non-uuid
 * string (e.g. a grid questionId or free text) is returned UNCHANGED, so question-id/text case sensitivity
 * is deliberately untouched. Use only at comparison/derived boundaries; never mutate the stored value.
 */
export const PG_UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const canonicalUuid = (v: string): string => (PG_UUID_RE.test(v) ? v.toLowerCase() : v);

export const canonicalRun = (v: string | null): string | null =>
  v === null ? null : canonicalUuid(v);
