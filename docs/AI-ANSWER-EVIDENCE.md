# Owner-supplied AI answer evidence

This independent R10/R11/R16 delivery adds a usable prompt library and evidence intake to **AI Visibility**, above the existing readiness advice. It does not select monitoring providers (D03), collect answers, call models, schedule probes, or establish three-surface acceptance. Existing readiness actions are preserved. Public paid launch remains NO-GO.

## Use

1. Select a project and open AI Visibility. Save a prompt, its source/intent, market/language, exact brand name, declared website and optional competitor URLs. Editing creates a new immutable version; earlier evidence keeps its original version. Active is a library flag only, not permission to collect answers.
2. Add an answer against its exact prompt version. Declare the surface/service, consumer-web/API/search mode, collection method/tool version, available model version and actual capture time with timezone. Paste the original raw answer and separately supply its citation URLs. Mark whether the citation list is complete. Preserve failed and truncated attempts with details; leave unknown costs/model versions blank.
3. Inspect the saved text and deterministic classifications. All provenance remains **owner-supplied and unverified**. A literal, case-insensitive Unicode-normalized brand match can miss spelling variants or aliases. Only supplied citation metadata is classified: a URL in prose is not necessarily a citation. Website/competitor ownership is declared, not independently verified. There is no sentiment, accuracy, ranking, causality or referral inference.
4. Use **Add a correction** for incorrect evidence. The original is immutable; the correction supersedes it in counts. Corrections must refer to the same project and prompt version, and competing replacements are refused. Later corrections can correct a prior correction. A correction outside the selected time window still excludes its original from counts.
5. Export all prompt versions and raw evidence to JSON. Removal is explicit and permanent: removing an answer removes dependent correction chains; removing a prompt removes all its versions and answers; deleting the owning project removes all its evidence. Export first if needed. No private records are shared between clients.

## Denominators and scope

The date window is UTC, start inclusive and end exclusive. Each cohort has exactly the same prompt identity/version, market, language, surface, mode, collection method and declared model version. Unknown model versions are labelled unknown and remain individual, unpooled samples; they do not establish version equivalence. A supplied sample is not a representative survey; this UI does not claim a longitudinal trend or benchmark.

Mention denominators include only nonempty complete answers. Citation denominators additionally require the owner to declare a complete citation list. A complete answer with an explicitly complete empty citation list may yield zero citations; missing lists, failed answers and truncated answers remain unknown and do not yield measured zero. Counts show their numerators, eligible denominators and total supplied samples separately. Superseded records remain reviewable/exportable but do not inflate denominators. Referral traffic remains a separate existing analytics signal.

Two real private tables hold history, never the workspace blob: `ai_visibility_prompts` and `ai_answer_evidence`. Four service-only RPCs assert saved project ownership. Account locking serializes revision checks, capacity checks and normal dedupe writers; unique constraints additionally guard identical imports and competing corrections. The digest covers the canonical JSON input within owner/project scope. Different inputs can be distinct supplied records; this is not proof of independent real-world samples. Caps: 200 prompt versions and 100 answers per project, including history. An answer document is at most 100,000 PostgreSQL JSON bytes; the server preflights at 90,000 UTF-8 JSON bytes, raw text at 50,000 characters, 100 citation URLs, each at most 2,048 characters. Export/removal releases capacity. Reads return the complete bounded project history; no partial-page aggregate is presented as complete.

No URL is fetched on intake or display. URLs require HTTP(S), a public-looking DNS name, no credentials/ports, no IP literals or common private/reserved suffixes. DNS is not resolved or verified. Evidence URLs are displayed as plain text. Raw answers render as React text, never HTML or Markdown. Imported content is evidence data, never executable instructions. Failed writes are not automatically retried; refresh to reconcile ambiguous outcomes first. Imported owner identity, verification flags and metrics are refused by strict schemas; analysis is derived on the authenticated server from the saved prompt snapshot.

## JSON intake

Download the blank template from the form; it includes the selected real prompt ID/revision and contains no fabricated answer or capture time. Fill it with actual owner-supplied evidence and import one record (file limit 90 kB). The comprehensive export is an archive, not the single-answer import format.

The following example is **synthetic documentation only**, never a production record. Replace the synthetic fields with actual evidence and a saved project prompt before importing. Nullable values explicitly mean unknown or absent.

```json
{
  "promptId": "00000000-0000-4000-8000-000000000003",
  "promptRevision": 1,
  "surface": "SYNTHETIC documentation surface",
  "mode": "consumer-web",
  "method": "SYNTHETIC manual copy v1",
  "modelVersion": null,
  "capturedAt": "2026-08-10T12:00:00Z",
  "status": "complete",
  "rawAnswer": "SYNTHETIC example answer, not an observed result.",
  "citations": [],
  "citationsComplete": false,
  "failure": null,
  "reportedCostUsd": null,
  "sourceUrl": null,
  "supersedesId": null
}
```

For failed/truncated attempts, set the appropriate status and supply `failure` details. For a correction, set `supersedesId` to the original saved answer ID. The UI supplies this automatically. Times before 2020 or in the future are rejected. Costs are owner-reported context and never billed, funded or reconciled against the native expense ledger here.

## Still open

Automated/scheduled collection, accepted providers and methods, real observations on at least three trustworthy surfaces, representative longitudinal coverage, richer competitor/sentiment/accuracy analysis, alerts, and authenticated browser acceptance remain open. This release does not close full R10/R11/R16 or R00–R24/D01–D08. Existing provider, browser administrator-policy, spending, email/publication and deferred Stripe boundaries remain in force.
