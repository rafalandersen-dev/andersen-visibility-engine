# Milo Score — conservative evidence rules (28 September 2026)

Scope: `src/lib/quality.ts` (`normalizeQualityScore`, `parseCategoryScore`) and the authenticated
evaluator `evaluateContentQualityFn` in `src/lib/ai.functions.ts`. Scenario 4 of the accepted
eight-scenario matrix ("weak article": honest sub-threshold score, named failing categories;
failures to catch: inflation, stripped caveats). Offline controls: `src/lib/quality.test.ts`,
`src/lib/quality-caller.test.ts`, `src/lib/quality-matrix.test.ts`.

## Decisions

1. **Unknown or invalid category evidence earns no credit.** A category that is missing, not an
   object, an array, or whose `score` is invalid is stored as `score: 0`, `status: "needsWork"` with
   the explanation "Not assessed: the evaluator returned no valid score for this category
   (insufficient evidence, not a measured problem)". A bounded original explanation is kept as an
   "Evaluator note", and up to three suggestions are kept, as context only. The score shape and the
   weighted overall are unchanged. (Previously such categories silently became 50 / "okay".)
2. **Raw score validation.** Accepted: a finite number in 0–100, or a trimmed plain decimal string
   wholly in range (`"85"`, `"72.5"`). Rejected, never guessed: percent or suffix text (`"85%"`),
   blanks, booleans, objects, arrays, non-finite and out-of-range values (`250`, `-1`). Rounding
   happens after validation; the internally computed weighted total is rounded separately so a
   correct total is never rejected for floating-point residue.
3. **Truthful headline.** Any unassessed category prevents `publishingRecommendation: "ready"` and
   caps a `"strong"` headline at `"okay"`. An assessed trust & safety score below 50 also prevents
   `"ready"` and caps the headline at `"okay"`; the weighted number and the trust caveat are kept.
   Low aggregates remain `needsWork` / `notReady`. `statusFromScore` keeps its numeric meaning for
   other consumers (checklist, analytics, MCP read tools use the numeric overall). This is advisory:
   it is not a publication block and never a claim of verified safety.
4. **Short-draft economy on the server.** After authentication and input validation and before any
   usage claim or provider call, a draft under 40 words (markdown syntax stripped) returns the
   existing conservative `tooShortScore`. The client caller already did this; the owner AI-evaluation
   route calls the server function directly, so this closes an otherwise unnecessary paid path.

## UI consumers checked

`MiloScorePanel` renders `overall`, `t("quality.status.<status>")`, `t("quality.rec.<recommendation>")`
and each category's status; `app.editor` branches only on `publishingRecommendation === "notReady"`;
`checklist` and `analytics` use the numeric `overall`; the MCP read tools return the stored fields.
An "Okay · Review first" headline over a high number with a zero "Not assessed" trust row is a
consistent presentation under these rules.

## Stored results — limitation

Normalization runs at evaluation time only; stored `qualityScore` values are **not** re-normalized
when read (the only call site is the evaluator). Evaluations saved before this change keep their
historical headline (for example an unassessed trust category stored as 50 / "okay") until the owner
re-evaluates that draft, which is a separately authorized paid step. No migration or paid re-scoring
is performed by this change. Offline controls are not owner-rated quality, cost or publication
acceptance.

## Addendum (AJ, 28 September 2026) — a skipped assessment is not a model comparison

`evaluateContentQualityFn` now returns an explicit envelope: `{ outcome: "model", score }` for a
normalized model result, or `{ outcome: "skipped", reason: "tooShort", score }` for the fixed
too-short score returned without any usage claim or provider call. Callers persist `score` only
(`mock-ai.ts`); the outcome is provenance and is never stored on the asset. The owner AI Evaluation
route runs both sides through `src/lib/ai-evaluation.ts` on one frozen input: a skipped existing
side ends the attempt before the candidate is invoked, an unexpectedly skipped candidate also ends it,
and in both cases no run, latency, preview or rating is recorded and the previous run's rating
linkage is cleared. The decision uses the server's outcome, never the numeric score, its copy or
missing metadata; the route's under-40-words hint is an eligibility aid only. Localized keys:
`aiEval.status.skipped`, `aiEval.skipped.tooShort`, `aiEval.shortDraftHint`. Existing history rows are
untouched; rows recorded before this change from short drafts (if any) remain historical.

## Addendum (BB, 28 September 2026) — bounded short-draft admission (finding 4125880002)

`evaluateContentQualityFn` accepted a `markdown` body of any size and ran `draftWordCount` (a rewritten
copy of the whole body, then a token array) before the usage claim. Two bounded steps now precede
everything else. **Input cap:** the body is validated as `z.string().max(CONTENT_BODY_MAX_CHARS)`
(40 000 UTF-16 code units, the same limit the content generator's `generation-result.ts` enforces on
every generated body; zod `.max` compares `String.length`, so an astral character such as an emoji
costs two units and a 4-byte UTF-8 sequence is never counted as one). An oversized body is refused by
input validation — before the word scan, the usage claim and the provider — with zod's `too_big`
error, the repository's existing convention for bounded string inputs. (Corrected by BD below: the
caller sends the CANONICAL assembled document, which is larger than the body; the bound is now the
canonical document bound.)
**Early-exit predicate:** `hasMinimumWords(markdown, MIN_EVALUABLE_WORDS)` (`quality.ts`) answers the
40-word threshold with one forward scan over code units that stops at the 40th word — no rewritten
string, no token array — using exactly the counter's separator set (JavaScript `\s`, including U+00A0,
U+1680, U+2000–U+200A, U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF, plus `# > * _ ` ~ -`). The
threshold, the markdown punctuation behaviour and the skipped envelope are unchanged. `draftWordCount`
is untouched and still used by the UI (`MiloScorePanel` "has body", the AI Evaluation route hint) and
the client caller (`mock-ai.ts`), which display or compare the real number; the server never returns
the threshold as a count.

Tests: `quality.test.ts` (+4) proves the predicate agrees with the counter on samples, on boundaries
39/40/41, and on every one of the 65 536 UTF-16 code units (`a<c>b` has two words iff `<c>` is a
separator), and that a 200 000-unit single token, separator run or dash run gets the counter's answer.
`quality-caller.test.ts` (+7, real server function under the mocked builder with pass-through spies on
the scan) proves: one unit over the cap — plain, whitespace-only, markup-only, an 8 MiB single token and
20 001 astral characters — is refused with no scan, no claim, no provider call; exactly the cap with a
valid long draft is admitted and claims once then calls the provider once; a pathological single token,
whitespace only, markup only and 39 words padded with separators, each at the cap, are scanned once and
skipped with no claim; 40 words separated by unicode whitespace at the cap are evaluated. On the frozen
evaluator those admission tests fail (6 of 7; must-fail verified). Focused suites (quality, matrix,
explanation, caller, AI evaluation, metering coverage, usage claims): 8 files / 191 tests passed; tsc 0;
prettier clean on the conformant files; eslint reports only the three pre-existing `ai.functions.ts`
findings (a `no-control-regex` and two prettier lines on unchanged code; the base file is not
prettier-conformant); `vite build` succeeded. The reviewer's 8 MiB CPU/memory figures were not
reproduced or benchmarked here; no live provider was called.

## Addendum (BD, 28 September 2026) — the bound is the canonical document, not the generated body

Codex reproduced a P2 in the BB correction: the client caller `evaluateContentQuality` sends
`assembleContentAsset(asset, project).markdown`, i.e. the body plus the composed sections (approved
hook, TL;DR, key takeaways, sources block, author block, breadcrumb trail, image lines), so an accepted
40 000-unit body with an approved hook assembled above the body-only cap and was refused. The BB
statement that no legitimate draft is refused was false.

Correction: `content-assembler.ts` now defines `CANONICAL_DOCUMENT_MAX_CHARS` =
`CONTENT_BODY_MAX_CHARS` (40 000) + `CANONICAL_SECTIONS_ALLOWANCE_CHARS` (24 000) = 64 000 UTF-16 code
units, and the evaluator validates `markdown` against that bound. The allowance is a finite POLICY
budget for the assembler's composed sections, not a derived sum: those side fields are user-authored
or generated separately and carry no stored size bound, so a budget of 24 000 units (e.g. hook ≤ 320,
TL;DR and ten takeaways ~3 000, twenty source lines ~6 000, an author block ~1 000, ten image lines
~6 000) is what is supported. Supported input, stated honestly: a generated body is bounded at
40 000 by generation; a MANUAL draft body has no generation bound and is admitted only while its
canonical document fits in 64 000 units; anything larger is refused by input validation before the
scan, the usage claim and the provider, never truncated, and not every arbitrarily large manual draft
is admitted. The model itself reads only the first 12 000 units of the document (the existing prompt
slice, unchanged), so the bound governs admission cost, not model input. Early-exit scanning, the
39/40 boundary, the skipped envelope, normalization and account budgets are unchanged.

Tests (`quality-caller.test.ts`, +2, 24 in the file): through the REAL client → real assembler →
captured transport payload → real validator: a maximum generated body with approved hook, TL;DR,
takeaways, verified sources, author and breadcrumbs assembles above 40 000 and is ADMITTED (one claim,
one provider call, the scan sees the assembled document); a document grown to EXACTLY 64 000 units is
admitted, and one unit more is refused with no scan, no claim and no provider call. The BB oversized
controls (plain, whitespace-only, markup-only, 8 MiB token, astral characters) now run against the
canonical bound; the at-cap pathological/whitespace/markup/39-word skips and the 40-word admission
run at the canonical bound. Codex's reproduction no longer reproduces (its bad-outcome assertion
fails); with the BB body-only cap restored the two BD tests fail (must-fail verified).

## Codex independent BB/BD admission verification

Reviewed the finite 64000 UTF-16 canonical-document admission policy, unchanged 40000 generated-body bound, early-exit word predicate, real client/assembler payload and validator boundary tests. Independent quality/caller/generation suites:105 tests passed; four assembler suites added45 passing tests (150 total across7 suites). Types, Vite build and diff checks passed. The boundary tests exercise an assembled maximum body with approved sections, exactly64000 and64001 code units and refusal before scan/usage/provider. The original body-only cap rejection is corrected.

This does not prove a live provider evaluation or the quality of a complete long article: the existing model prompt uses only the first12000 units, unchanged here. The 24000 section allowance is a policy allowance, not a guarantee covering arbitrary manual input. No model call or production mutation was performed during verification. Exact resulting-head external code/security controls remain required.

## Addendum (BG, 28 September 2026) — the comparison compares the canonical quality input (finding 4126458968)

The owner AI Evaluation route decided contentQualityScore eligibility from the selected asset's RAW body and
froze that raw body for both comparison sides, while production (`evaluateContentQuality`) scores
`assembleContentAsset(asset, project).markdown` — the canonical document with the approved hook, TL;DR,
takeaways, sources, author, breadcrumb and image sections. A raw body under 40 words with an approved hook
was therefore falsely disabled, and any run sent a different artifact than production evaluates.

Correction: `src/lib/ai-evaluation.ts` gains `canonicalQualityMarkdown(asset, project)` (the real assembler),
`qualityInputEligible(asset, project)` (early-exit scan of that document against the 40-word threshold) and
`frozenAssetInput(task, asset, project)` (contentQualityScore freezes the canonical document; contentImprove
keeps the raw body — its contract improves the body, so other task contracts are unchanged). The route
derives the eligibility hint on every render from the current selection, asset and project (no cached
answer can go stale when the selection changes) and freezes the asset through the same helper at click
time, so both sides receive exactly the artifact production scores. Skipped outcomes, no history/rating for
genuine canonical-short inputs, candidate failure/partial outcomes, conservative scores, the 64 000-unit
canonical bound and 40 000 body limit, producer/session fences and budget admission are untouched; nothing
is truncated to pass eligibility.

Tests (`ai-evaluation.test.ts`, +6, real assembler + the real server function under the mocked boundaries):
raw 20-word body + 25-word approved hook → eligible, frozen payload equals the assembled document, a
recorded run with both provider prompts containing the canonical document (two claims); a truly canonical-
short 20-word draft → ineligible and, if sent, skipped with no claim, no provider call, no run; the canonical
boundary is exactly 40 (20 body + 20 hook eligible, 20 + 19 not); both sides receive the identical frozen
input even when the source asset is mutated after freezing (no side sees the change); eligibility follows the
current asset; contentImprove still freezes the raw body. Local UI (harness on 5185, real route component
and real orchestration over inert stubs; fixture drafts added: hooked and canonical-short): with the hooked
draft Run is enabled, both stubbed requests receive the identical 45-word canonical body beginning with the
hook, one run is recorded; with the canonical-short draft Run is disabled with the hint and no call or
history is added; switching back re-enables Run. With the frozen route file temporarily restored the same
harness shows the defect (hooked draft disabled with the hint). No production or provider call.

## Addendum (BI, 28 September 2026) — the comparison declares the selected article's content language

After BG the comparison still declared the PROJECT's primary content language for every quality attempt, while
production's caller declares `languageLabel(asset.language, contentLangToProjectLanguage(project.primaryContentLanguage
?? "en"))` — a Swedish asset inside a Polish-primary project received Polish guidance in the comparison but Swedish in
production (multilingual scope R17/D02). Correction: `frozenContentLanguage(task, asset, project)` in
`src/lib/ai-evaluation.ts` applies production's rule for contentQualityScore — the asset's own language label when it
has one, else the project's primary content language — and the route freezes it once per attempt from the current
selected asset and project at click time, so both model sides receive the same declaration. The app explanation
language stays the project's app language, independently. contentImprove and the other tasks keep the comparison's
existing project-language contract (production's improve caller also prefers the asset label; aligning that is a
separate decision, stated, not made here). Canonical assembled markdown eligibility/payload, the 64 000-unit
canonical bound, short-skip/no-history, producer/save/usage constraints are untouched.

Tests (`ai-evaluation.test.ts`, +5; real input construction through the real server function under the mocked
boundaries): Swedish asset in a Polish-primary project → both provider prompts say "The draft content is written in
Swedish." while explanations are requested in Polish (app language); an asset without a label → the project's
Polish fallback in both prompts; legacy labels (English, Danish, Polish) pass through unchanged and a project without a
primary language falls back to English; selection changes use the current asset/project (Swedish vs Danish asset,
same asset in another project) and a frozen attempt keeps "Swedish" in both prompts even when the asset's label is
changed to Danish mid-comparison; contentImprove (and authority) still declare the project language and both improve
calls receive it. Local UI (harness on 5185, real route and orchestration; fixture project now Polish-primary with an
English app language, the hooked draft labelled Swedish; the stub records the declared languages): running the hooked
draft sends `contentLanguage: "Swedish"` / `explanationLanguage: "English"` to BOTH stubbed requests on the identical
45-word canonical body; running the unlabelled 60-word draft sends `"Polish"` / `"English"` to both. No production or
provider call.

## Addendum (BJ, 28 September 2026) — the improve comparison declares the selected article's language too

BI left contentImprove at the project's primary content language on purpose; production's `improveContentDraft`
resolves `languageLabel(asset.language, contentLangToProjectLanguage(project.primaryContentLanguage ?? "en"))`
exactly like the quality caller, so a Swedish article in a Polish-primary project was asked for a Polish rewrite
in the comparison and a Swedish one in production. Correction (`frozenContentLanguage` in `src/lib/ai-evaluation.ts`,
two lines): contentQualityScore AND contentImprove now freeze the selected asset's label with the same project
fallback, once per attempt from the current asset and project at click time; content generation and authority keep
the project's primary content language. contentImprove still freezes the raw body (no assembled sections), quality
still freezes the canonical document; the app explanation language stays independent; no-history skips, the
64 000-unit canonical bound, model/prompt size limits (the improve prompt still embeds only the first 12 000 units
of the body) and producer/session/save/budget safeguards are untouched. The BI test that pinned the old improve
contract was replaced.

Tests (`ai-evaluation.test.ts`, +4 through the REAL `improveContentDraftFn` under the mocked boundaries; the
pinned BI test replaced by a project-language check for generation/authority): Swedish asset in a Polish-primary
project → both improve prompts say "Keep the same topic, intent and language (Swedish)." on the raw body without the
hook, one usage claim per side, a recorded run; no label → the project's Polish in both prompts, English/Danish pass
through; the current selection decides (Danish asset → Danish) and a frozen attempt keeps Swedish in both prompts
after the label changes to Danish mid-comparison; the 12 000-unit body prefix stays explicit (a longer body is
embedded only up to the prefix, its tail marker absent). Local UI (harness on 5185, real route; the improve stub now
records the declared language): task "Improve draft" + the Swedish-labelled hooked draft → both stubbed requests
received `contentLanguage: "Swedish"` on the identical raw 20-word body without the hook; one run recorded.

## Addendum (BL, 28 September 2026) — whole-input quality and safe whole-body Improve

Base: released `e5657d45` (PR162 merged), isolated worktree `milo-full-document-quality-20260928`. BK (read-only)
established: the evaluator scored only the first 12 000 units of a canonical document it accepts up to 64 000, while
the UI presents a whole-draft readiness score; Improve rewrote the first 12 000 units of a raw body and the client
replaced the WHOLE body with that rewrite (tail lost), its input had no bound, and a missing/empty answer silently
returned the original body. Codex direction: full admitted input, no limit increases (4 000 quality / 8 000 Improve
completion tokens, 65 536-byte prompt, 16 000 global, 256 KiB result, 60 s, no retries, USD 0.50 reserve, USD 50/month,
model unchanged), safe rejection of incomplete output with cost evidence retained.

Supported contract now:
- **Quality**: the WHOLE canonical document is embedded (no prefix); the exact final prompt is admitted against the
  fixed request contract (65 536 UTF-8 bytes, 4 000 completion tokens) BEFORE the usage claim, the reservation and the
  provider; the 64 000-unit schema cap and the 40-word skip (no history) are unchanged. Explicit gap: a canonical
  document whose prompt exceeds 65 536 bytes (≈ 58–60k units of ASCII with this prompt's overhead, far fewer for
  2-byte/3-byte scripts) is refused with the existing "too much source text" message — never sliced.
- **Improve**: the raw body is bounded at 40 000 units (generator limit) by input validation before any scan; the WHOLE
  body is embedded; the exact prompt is admitted (65 536 bytes, 8 000 completion tokens) before the claim; the answer
  must be a positive `stop` termination AND a non-empty `markdown` string within 40 000 units — no alias keys, no fallback
  to the original body; otherwise the task refuses before any client store mutation, the draft (body, title, hook,
  metadata, updatedAt) stays untouched and nothing is saved. Explicit gap: a body whose complete rewrite does not fit
  8 000 completion tokens is refused after one attempt (authored copy: "The AI service did not complete its answer for
  this whole draft. Milo kept the draft unchanged and did not retry it."); the owner edits or shortens it. No chunking,
  no retry, no appended unseen tail.
- **Termination evidence**: `generateBoundedTextResult` carries the SDK's unified finish reason; the new
  `generateBudgetedTextResult` returns `{ text, finishReason }` through the SAME reservation/evidence flow
  (`withReservedAiExpense` reconciles the reserve with the authentic usage counters and provider request id before any
  caller can refuse the text); `generateBudgetedText` keeps its text-only contract for every other caller. Installed
  adapter (`@ai-sdk/openai-compatible` 3, `ai` 7.0.4): `stop→stop`, `length→length`, `content_filter→content-filter`,
  anything else or missing → `other`. Only the two whole-input tasks require `stop`; a positive stop is not proof of
  semantic quality or tail preservation and is not claimed as such.

Tests: `full-document-quality.test.ts` (32; real server functions under the mocked builder/auth/usage/provider
boundaries, and the real client producer over the real store with a fake backend) — tail markers past 12 000 units in
both prompts; exact prompt-byte limits measured through the real prompt builders (largest admissible ASCII body
scored/rewritten, one byte more refused before claim/reserve/provider); UTF-8 overflow and schema caps refused before
any spend; short skip unchanged; `length`/`content-filter`/`error`/`other`/missing termination refused after ONE
reserved attempt even with valid JSON; missing/empty/wrong-shape/non-object/oversized/truncated answers refused with no
fallback; real store: body, updatedAt and approved hook untouched and no batch on every refusal, one complete rewrite
replaces the body once and marks the score stale, `source_changed` and `stale_session` fences intact.
`ai-provider-expense.test.ts` (+6: real SDK adapter + fetch-level fake → unified classification for
stop/length/content_filter/unknown/missing with one attempt and `reconcile_ai_expense` carrying tokens/request id);
`ai-text-bounds.test.ts` (+6); prefix-era assertions in `quality-caller.test.ts`/`ai-evaluation.test.ts` rewritten to the
whole-input contract. Focused: 12 files / 379 tests; tsc 0; eslint 0 on changed lib/test files (`ai.functions.ts` keeps
its 3 pre-existing findings); prettier clean on conformant files; `git diff --check` 0; `vite build` 0.

Local UI (harness `.coordination/full-document-harness/`, port 5192; real AppShell, real store, real Milo Score panel,
REAL Improve producer over a rejectable fake server function; FICTIONAL 22 370-unit draft ending in "## Final heading
(tail) … TAIL-MARKER"): panel Improve → confirm → the fake receives the whole 22 370-unit body → server refusal →
error toast with the authored copy, body 22 370 / tail present / updatedAt / batches 0 unchanged, panel idle; panel
Improve → complete rewrite → body 28 671 with the tail, updatedAt advanced, saved once (server 28 671), success toast;
375×812 keyboard: Enter on Improve opens the dialog (focus on Cancel), Tab → Improve draft, Enter → request; refusal
toast 343 px wide inside the viewport, no horizontal overflow, draft untouched. Not production; no provider.

## Addendum (BM, 28 September 2026) — known quality/Improve refusals explained in the selected UI language

Problem: `MiloScorePanel` `runEvaluate`/`runImprove` localized only producer-session errors (`producerErrorMessage`)
and otherwise showed the raw `Error.message`. The server boundary (`mapGatewayError` in `ai.functions.ts`) flattens
`AiTextBoundaryError` and provider-configuration errors into a plain `Error(message)` before the framework serializes
it, so BL's `incomplete_output`, `input_too_large`, `invalid_response` and `timeout` refusals — and the usage-limit,
budget and provider-class refusals — reached Polish, Swedish and Danish users in English. The AI evaluation view
(`app.ai-evaluation.tsx`, `ResultCard`) rendered the same strings verbatim.

Transport facts (bounded library/source proof, not a full HTTP round-trip): the authored English sentence is the
ONLY property that reliably survives the server → client hop for these classes. `mapGatewayError` keeps no reason
code on the flattened error, and the installed serializer (seroval 1.5.4 with the router's default plugins,
`toCrossJSONAsync` → JSON → `fromCrossJSON`, the path selected by `server-functions-handler` and `serverFnFetcher`)
reconstructs an `Error` with its message but DROPS custom enumerable properties such as `code` — an inert
serialize/deserialize probe by Codex confirmed this (`codex-bm-serialization-review/result.md`): plain Error message
kept, custom `code` absent; only a plain object keeps `code`. So the usage/expense errors that are thrown as-is also
arrive as plain errors carrying only their message. A reason code on the wire would require changing the boundary
contract, which this packet was not allowed to do.

Correction (bounded exact-message map, no framework): `src/lib/ai-refusal-messages.ts` (pure, no imports) holds a
closed `ReadonlyMap` of the 21 exact authored sentences (`AiTextBoundaryError` reasons, `AiExpenseUnavailableError`
reasons, `AiProviderConfigurationError`, `UsageUnavailableError`, the 11 `aiErrorUserMessage` provider classes) → keys
`quality.refusal.*`, plus ONE anchored regex for the two quality usage-limit sentences (`draft improvements`,
`Milo Score runs`) that carries the count and bucket as `{count}`/`{bucket}` variables. Matching is exact (whole string)
or fully anchored; no substring heuristics, no classification of arbitrary text. Unknown messages return `null`, so the
caller falls back to the received message (or `quality.error`) unchanged. `MiloScorePanel.qualityActionFailureMessage`
composes `producerErrorMessage` (session/source/save meanings preserved and first) → `aiRefusalMessage` → raw message →
`quality.error`; `ResultCard` renders `aiRefusalText(result.error, t) ?? result.error`.

Semantics preserved in the copy: `inputTooLarge`/`invalidLimits`/expense-unpriced/manual-budget/usage-limit copy
describes refusal BEFORE any provider spend; `incompleteOutput`/`timeout`/`expenseTimeout` copy says the provider may
have processed (or charged for) the single attempt and that Milo did not retry; `expenseUnconfirmed` copy says only
that the cost budget could not be confirmed and work is paused — it is not evidence that a provider attempt occurred
and does not claim one either way. No sentence claims a free call, a retry or semantic verification. Improve copy states the draft was kept unchanged; evaluation copy never implies
content mutation. No boundary, limit, cost flow, model or API contract changed; BL's whole-input/whole-body paths are
untouched (blob identities of `ai.functions.ts`, `ai-text-bounds.server.ts`, `ai-provider-expense.server.ts`,
`mock-ai.ts` equal to 3ec020d3).

Locale contracts: 24 new keys (`quality.refusal.*` incl. the two bucket labels) in en/pl/sv/da (authored complete
sentences; no fluency or human-acceptance claim) and in the 20 staged catalogs (machine-authored, inactive; nl/fr
reset-day wording chosen to keep the numeric-token parity contract). "workflow" batch fingerprint re-pinned
`a814f6d2… → d09e361f8affe1c2ee3903432c21b1e6453dcd4b99a9996658ec1ec14989ee70` in 19 staged registrations and
`de-source.ts`; staged key counts 4519 → 4543. No language activated.

Tests: `ai-refusal-messages.test.ts` (every reason/class of the four error types and the usage-limit template maps to
a key; prefixes, suffixes, near-misses, provider-looking text and empty strings map to nothing; 24 keys present in all
four active catalogs with matching `{var}` sets; semantic wording assertions), `MiloScorePanel.test.ts` (producer error
first, refusal second, raw message, `quality.error` fallback), `ai-evaluation-ui.test.ts` (ResultCard renders the
localized sentence for a known refusal and the raw text for an unknown one). Locale contracts 30 files / 793 tests;
focused 6 files / 127 tests; tsc 0; eslint 0 on changed conformant files (panel/route keep their pre-existing
findings); prettier clean on conformant files; `git diff --check` 0; `vite build` 0.

Local UI (harnesses `.coordination/quality-refusal-harness/` port 5193 and `.coordination/evaluation-refusal-harness/`
port 5194; real AppShell, store, Milo Score panel and evaluation ResultCard over rejectable fake server functions;
fictional data; no provider): pl/sv/da evaluate refusals (too large) → localized toast, body/score/batches unchanged;
pl Improve → confirm → incomplete refusal → Polish toast, body 22 370 with tail and updatedAt unchanged; pl usage-limit
→ localized toast — the INITIAL BM observation read "Wykorzystano wszystkie 20 uruchomienia Milo Score…" (ungrammatical
for a fixed bucket label, corrected by BN); the FINAL catalog renders "Wykorzystano miesięczny limit Twojego planu.
Uruchomienia Milo Score: 20. Limit odnawia się 1. dnia miesiąca — lub podnieś plan, aby uzyskać więcej." (author-verified
at desktop and Codex-verified at 375 px with body 22 370/tail/updatedAt/score 55/batches 0 unchanged; local fake-boundary
browser proof, not production or provider proof); da Improve invalid-response → Danish; evaluation view pl/sv →
both ResultCards show the localized incomplete sentence with the localized error badge. 375×812 keyboard (pl): Enter on
"Oceń ponownie" → refusal toast 343 px inside the viewport, `scrollWidth === innerWidth`, score 55/batches 0 unchanged;
Tab → "Ulepsz szkic" → Enter → dialog 375 px (focus Cancel) → Tab → Enter → incomplete refusal → Polish toast, body
22 370/tail/updatedAt unchanged.

Remaining limits: the editor's shared `aiAction` catch and other AI surfaces still show the received English message
(explicitly excluded by the 2026-09-12 editor localization record and not audited again here); only the two quality
usage buckets are localized; any refusal whose sentence is outside the map (or whose wording changes server-side) shows
as received — the map must be updated together with the authored sentences, which the parity test enforces for the
four error types it imports. Local fixtures only; no production, provider or cost measurement claim.
