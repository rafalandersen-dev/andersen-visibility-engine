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
