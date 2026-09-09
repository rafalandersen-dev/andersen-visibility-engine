# Homepage reader and controlled benchmark prerequisites — 9 September 2026

Status: implementation and local verification complete; review and deployment pending. This packet does not complete the controlled benchmark or authorize additional spending. Base: main `743ce55ef00864a5d6e24d2113f7598249ee4136` (documentation PR #99); production remains the recorded #98 fingerprint until a verified release.

## Problem and behavior

The existing scan followed redirects with global fetch, buffered the complete response, and only then sliced it. A URL/DNS redirect could cross a private-network boundary. The new server reader resolves every hop, rejects any private/special DNS answer, and connects only to one vetted public address. It allows HTTP/HTTPS default ports, at most three redirects, no HTTPS downgrade, eight seconds including DNS/body, and a 300,000-byte streamed prefix with a chunk bound. Compressed or non-text replies are refused. Response failures return the existing empty-page result without logging URLs, bodies, DNS or transport errors. Inherited proxy environments are refused rather than changing routing policy. This conservative IPv6 policy does not promise support for every global special-purpose range.

Node uses native HTTP(S) with custom lookup and original Host/TLS identity. Bun uses a literal-IP native fetch with manual redirects, no decompression/connection reuse, original Host, certificate-chain validation and an explicit check of the original certificate hostname. The response is refused if that check was skipped or failed. This is an implemented connection boundary, not an environment flag asserting that arbitrary fetch is safe. Node additionally requests a 16 KiB header limit; that option is not claimed for Bun's native fetch.

The first Node-compatible implementation worked in Bun 1.4 but failed in 1.3.3. Inspection of the official 1.3.3 HTTP client showed its fetch bridge and limited TLS-option forwarding. The final adapter explicitly enforces certificate identity and was retested with the hosting version. No TLS validation was disabled.

The scan, article and image cores accept optional preallocated attempts only as trusted server arguments. Browser/MCP/scheduler validators do not forward these. The controlled scan can require a real AI extraction, rejects an empty business profile, and cannot pass by silently using homepage metadata. Ordinary onboarding retains its manual fallback. The scan reports `aiGenerated` explicitly.

## Verification

- Full suite after transport/core wiring: 2,031 tests / 140 files passed. After adding the empty-profile guard, the affected suites passed 55/55. TypeScript, production build, focused lint and whitespace checks passed. Existing unrelated lint debt in ai.functions.ts is not claimed fixed.
- Read-only request to the public Milo homepage through the final reader: Bun 1.3.3, Bun 1.4.0 and Node 26.5.0 each returned 46,404 bytes containing HTML and a title. The Node probe copied the same source to a temporary file solely to resolve its TypeScript import extension.
- Synthetic checks cover private/encoded literal addresses, mixed DNS answers, IPv6, pinned lookup, inherited proxy refusal, redirect boundaries, stream bounds/cancellation, incomplete replies, hanging DNS/connection, Bun certificate-check absence/mismatch, no AI before a refused homepage, and no provider retry for malformed/empty extraction.
- No authenticated browser workflow or visual QA is implied. Browser automation remains unavailable because its administrator policy could not be verified.
- No migration, budget, permit, paid AI request, email, or content publication in this packet. Owner's USD5 benchmark authority remains at zero calls / USD0 recorded spending.

## Remaining next action

Implement the durable owner-only three-stage runner with immutable permit bindings and replay-safe stage claims; configure the approved OpenAI key once reconnection succeeds; recheck the monetary/model contract before provisioning exactly the approved three attempts. Keep drafts private, retain uncertain costs and do not retry paid attempts automatically. Public paid launch remains NO-GO and the full R00–R24 / D01–D08 scope remains open where recorded.

## Primary references

- [Node HTTP custom lookup and options](https://nodejs.org/api/http.html)
- [Bun 1.3.3 HTTP client source](https://github.com/oven-sh/bun/blob/bun-v1.3.3/src/js/node/_http_client.ts)
- [Bun native fetch TLS and streaming](https://bun.com/docs/runtime/networking/fetch)
- [IANA IPv4 special registry](https://www.iana.org/assignments/iana-ipv4-special-registry)
- [IANA IPv6 special registry](https://www.iana.org/assignments/iana-ipv6-special-registry)
