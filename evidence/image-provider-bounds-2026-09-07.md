# Bounded image generation requests — R05/R09/R18

The existing Lovable and OpenAI image transports had neither an explicit request deadline nor a response-body limit. A stalled supplier could leave the operation waiting indefinitely, and JSON/base64 was materialized before the existing 5 MiB storage check.

Both transports now share a 120-second deadline covering headers and streaming body consumption. The caller returns on timeout even if a transport fails to honor abort; the abort signal is sent and a late-arriving body is cancelled. No automatic retry or provider fallback occurs. A timeout explicitly preserves uncertainty about provider processing; it is not a refund, a confirmed supplier cancellation or a monetary budget ceiling.

The response envelope is capped at 8 MiB using actual streamed bytes, including absent or understated Content-Length. Overstated sizes and non-success response bodies are cancelled without reading. Redirects are refused for both credential-bearing fixed endpoints. A fixed byte buffer and a16,384-chunk cap also bound overhead and work for tiny or empty chunks. Base64 is bounded before decoding, canonical and capped at 5 MiB decoded; Lovable URL payloads accept only inline PNG/JPEG/WebP and never cause a secondary fetch. The existing storage signature check and private proposed-image/owner-approval flow remain authoritative and unchanged. No full bitmap decoding/dimension check is claimed.

49 added tests cover both providers: successful bytes and request payloads, stalled headers/body, late responses, byte/size boundaries, false Content-Length, malformed JSON/base64, non-image URLs/MIME, error statuses, cancellation and no retry. All provider calls are mocked. Full suite: 1,736 tests in 129 files; TypeScript, production build, focused lint and diff checks pass. No dependency, model, price, secret, quota, account, migration or live provider request changed.

Review and publication remain pending. Production unit economics, active provider expense adapters, delivered-result allowance accounting and live owner benchmark acceptance remain separate work.
