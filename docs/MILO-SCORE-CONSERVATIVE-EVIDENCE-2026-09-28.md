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
