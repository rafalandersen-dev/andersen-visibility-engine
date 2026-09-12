# Public audit error envelopes — 12 September 2026

Reviewed source 4266831. The HTTP client cast untrusted JSON to an object union and used the in operator without a runtime object check. Truthy primitive responses could therefore throw a TypeError. The unavailable message also inferred unfinished setup from status codes and promised a full audit after project creation.

The client now narrows both the payload and nested error before reading a nonempty string message. Malformed envelopes use controlled fallback text. Unavailable responses describe service unavailability without inferring cause or promising future generation. The route's project-setup CTA uses its existing translated key. Existing valid public Worker messages and single-request behavior are retained; no automatic retry is introduced.

Seven added cases cover primitive/null/malformed nested responses and the unavailable wording. All 17 public-audit client/boundary tests pass, plus full TypeScript (/tmp/milo-public-audit-errors-types.log), scoped lint and whitespace checks. No production build repeated for this bounded client-error change.

Provider error localization, full success-payload validation and browser/live acceptance remain separate work. No audit/provider call or deployment occurred. Release holds remain.
