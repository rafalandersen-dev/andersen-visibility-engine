# Milo Growth — hands-off content generation (Spark / Forge)

> **RECONCILIATION NOTE (2026‑07‑20, product audit).** Spark/Forge is the **generation trigger model**; **Article Studio 2.0** (`ARTICLE-STUDIO-2.0.md`, roadmap epic **P1.1**) is the **assembly + quality + publish‑readiness system** it feeds. Mapping: Spark = the auto‑brief (Article Studio pipeline step 3); Forge = the grounded draft (step 4); Article Studio 2.0 owns steps 5–11 (canonical assembly, structured data, images, author/E‑E‑A‑T, scores, mobile/desktop preview, publishing checklist). The retained AUTOPILOT decisions — threshold 85, governed publishing cap (`PUBLISHING-CAP.md`), and the "What only you know" value gate — become part of Article Studio's publishing checklist. Two audit findings this design did not fully account for, now owned by Article Studio 2.0 / P0: (a) the branding‑by‑classless‑HTML premise is **true and retained**, but the editor's second (weaker) preview converter must be unified with the publish converter (P0.3); (b) the Milo Score is blind to ~36% of what it weighs (P0.2). See `PRODUCT-AUDIT-2026-07.md`, `DECISION-LOG.md` D12, `ROADMAP.md`.

Analiza wieloagentowa (24 agentów: 4 czytające kod, 4 research, 3 niezależne propozycje, 9 ocen, 3 ataki, 1 synteza). 2026-07-19.

Odpowiedź na propozycję właściciela: auto-tworzenie artykułu przy powstaniu szansy, pętla jakości do 90, branding strony, obrazy.


## Wynik panelu

| Propozycja | /30 | jakość treści | bezpieczeństwo kosztów | doświadczenie laika |
|---|---|---|---|---|
| Spark First, Forge on Demand | **23.5** | 8 | 8.5 | 7 |
| Ready Runs — auto-generation with a hard ceiling, a blind judge, and a checklist the score is allowed to fail | **23** | 6.5 | 9 | 7.5 |
| Draft Run — automation you buy on purpose | **22.5** | 7 | 8.5 | 7 |

Zwycięzca: **Spark First, Forge on Demand** · ataki znalazły **7 blokerów**.


## Rekomendacja

Build "Spark First, Forge on Demand" — with the dwell-to-generate trigger deleted, the threshold at 85 not 90, and metering staying exactly where FLOW-REDESIGN already put it (increment 3), not moved ahead of it.

Straight answer: you are right about the friction and wrong about the artifact. The eleven-click gauntlet is indefensible and it goes. But auto-writing a full article for every accepted opportunity is the wrong thing to spend money and domain risk on, for three reasons you'll recognise. (1) Your five bulk converters each mint up to 5 opportunities from one click — five clicks is 25 opportunities, so full auto is 25 unattended article loops from five presses on buttons labelled "convert top fixes", landing on customers' single domains. (2) Nothing meters AI spend today; the eleven clicks ARE your rate limiter, and you accepted that finding. (3) Google's scaled-content policy turns on volume PLUS absence of added value. The artifact that fixes "absence of added value" is a brief that asks you for the things only you know — your real prices, the case last month, why your process differs — before the prose exists, not after, when nobody edits.

So: every accepted opportunity instantly gets a Spark — a real brief (angle, search intent, suggested H1, outline, FAQs, internal-link ideas, CTA, image direction, and a "What only you know" section) from ONE ~$0.003 AI call. Nothing is ever blank, nothing waits for you. The feeling you described is delivered. One visible button — "Write the full article (uses 1 of your 15)" — turns a Spark into a Forged, scored, improved draft. That is one click instead of eleven, and it is the one click worth keeping, because it is the only place the user sees what it costs.

On 90: I'm overruling it, on the record. quality.ts already defines publish-ready as overall >= 85; the evaluator prompt says "be conservative, do not inflate"; and up to ~20% of the rubric weight (internalLinks 8%, part of conversion 12%) is graded against markdown that structurally cannot contain those fields, because generation writes links/CTA/FAQ into separate JSON keys the evaluator never receives. 90 means paying improve calls to win a fight the code makes unwinnable. Fix the evaluator's inputs, ship at 85, and let the score fail honestly at 78 with the weak categories named.

On branding: your premise is mostly already true, and I'd rather tell you that than ship something that feels bigger and is worse. Milo emits bare semantic HTML with no class and no style; WordPress renders it through the customer's theme, Shopify through their article template, the custom endpoint gets raw markdown. Articles already take the site's fonts and colours by inheritance — the strongest available mechanism. What's broken is that you can't SEE it: the editor preview uses a second, weaker markdown converter that drops every link and wraps output in Milo's own Inter/Fraunces. Fix the preview, emit platform-native CTA primitives with zero colour, and inject nothing into anyone's live CMS.

Net effect: the "nothing waits for me" experience at roughly 6% of the cost, on the artifact that is actually safer to put on a small business's domain.

## Co z propozycji właściciela ROBIMY

- Kill the eleven-click gauntlet completely. Delete the status === 'scheduled' gate on 'Create linked draft' (app.plan.tsx:1259) — content no longer requires prioritisation or a due date to exist. Delete the two dead CreateContentDialog mounts on the redirect-only routes so an un-redirect can never resurrect ungated creation.
- Make something real appear the instant an opportunity is accepted, with no click. That is the core of his ask and it is delivered — as a Spark brief, generated automatically at the three store chokepoints (manual create, acceptDiscoverySuggestions, the five single-item module converts).
- Finish the quality loop so the user stops hand-cranking it. improveContentDraft currently only sets qualityScoreStale and nothing re-scores. Add the missing improve-then-rescore primitive, run it automatically on Forged articles, capped.
- Stop the loop from destroying good work. Today improve overwrites markdown in place with no history and can walk an 84 down to a 71 permanently. Keep every scored version, ship the argmax. This is a live data-loss bug fix, not a feature.
- Make the preview show what will actually publish. Unify the editor's second converter onto src/lib/markdown.ts and render the preview in the customer's extracted background/colour tokens instead of Milo's Inter/Fraunces. This is the honest answer to 'take the site branding' and it costs one file.
- Give articles a real CTA. ContentAsset.cta is a plain string that appears in NO publish payload today — the CTA survives only as prose the model happened to write. Emit it as each platform's native primitive: Gutenberg button blocks on WordPress, <a class="button"> on Shopify, an explicit typed cta field on the custom-endpoint JSON. Carry the existing window.miloTrack('cta_click') hook or Milo's own CTAs stay invisible to Milo's own analytics.
- Image generation and regeneration, on explicit click, later. The image DIRECTION ships in the brief immediately — one line, near-zero tokens, actionable whether he generates, shoots, or uploads.
- Enforce the plan limits that are advertised on the pricing page and enforced nowhere. He is paying for this; the limits are already sold to customers.

## Czego NIE robimy i dlaczego


### Auto-generate the full article on every accepted opportunity.

**Dlaczego:** Three compounding problems. Volume: the five bulk converters turn five clicks into 25 opportunities, so this mints 25 publishable pages from five presses — the literal shape of Google's scaled-content pattern, on a customer's single domain, where a deindexing is a business-ending event rather than an agency's cost of doing business. Cost: a full loop is ~$0.0386 versus ~$0.0030 for a brief, so that same burst is $1.29 instead of $0.075. Waste: the expensive artifact is generated for opportunities the user may never open, and the failure modes (8,000-char silent truncation, unwinnable rubric categories, non-deterministic scoring) all fire unattended with no human present.

**Zamiast tego:** Spark everything automatically at ~$0.003; Forge on one explicit click. The user still opens the app to find Milo has been working — that is the feeling he described — but the expensive, riskier artifact only exists where a human asked for it.

### Promote a brief to a full article on dwell (open the brief for 3 seconds and it starts writing).

**Dlaczego:** This was in the winning design and it is the worst idea in it. It spends a scarce metered unit on an act the user experiences as reading. A Free user has 3 article credits; browsing three briefs on a Sunday evening consumes their entire month with no button pressed, no confirmation, no undo. It also contradicts the design's own principle — every other expensive action requires an explicit click — and reintroduces exactly the invisible magic that makes a product feel untrustworthy.

**Zamiast tego:** One visible button on the brief: 'Write the full article — uses 1 of your 15'. The remaining count is on the card before the click. This costs one tap and buys the entire credibility of the cost model.

### Make 'Set date' a generation trigger.

**Dlaczego:** Increment 2 exists to make 'Set date' inert and to give the four verbs non-overlapping meanings. Hanging generation off it breaks that the first time a user plans twenty items on a Sunday and hits a billing wall on item eleven, from a verb that is supposed to mean 'a date'.

**Zamiast tego:** Promote only on the explicit 'Write it' button and on 'Schedule' — and Schedule ENQUEUES a Forge rather than firing inline, so quota is checked when the job runs and the card shows 'queued — writes Tuesday' instead of erroring at the click.

### Guarantee every article reaches 90.

**Dlaczego:** It is unreachable for structural reasons, not quality reasons, and pursuing it makes the output worse. Up to ~20% of the rubric weight is graded against markdown that cannot contain the links/CTA/FAQ the generator put in separate JSON fields; the evaluator is told to be conservative; no temperature/topP/seed is set anywhere, so the same draft genuinely scores 88, 91, 87 and a 1–3 point move is instrument noise. Worse, iterative rewriting erodes the distribution tail first — the specific number, the local detail, the odd concrete example — while average-looking structure improves. A loop that always reaches 90 systematically sands off the exact specifics that keep a page out of the scaled-content bucket, while the number goes up.

**Zamiast tego:** Threshold 85 (the product's own existing definition of ready), cap 2 improve passes, abort on a sub-3-point gain or any decrease, ship the argmax, freeze factual spans, forbid >5% length growth per pass. Deliver a 78 as a 78 with the failing categories named. A score that cannot output a 61 is decoration.

### Inject colours, fonts, or inline styles into customers' live CMSes.

**Dlaczego:** WCAG 1.4.11 requires 3:1 between a button and its ADJACENT background — which lives in the customer's theme, invisible to a publishing API. Every button we colour is one whose accessibility we half-broke by construction, on their site, under their legal exposure. Inline colour cannot respond to prefers-color-scheme. And publishing is upsert-only with no Unpublish by standing decision, so a hardcoded hex persists in someone's database indefinitely. On Shopify specifically, an 'inline fallback' beats the theme's own .button rule on every Dawn store — i.e. it does the exact thing we promised not to do, everywhere, permanently.

**Zamiast tego:** Platform-native primitives with zero colour, plus a truthful preview. If a Shopify theme renders it as a link, tell the user that after the first publish rather than overriding their theme.

### Host generated images on Milo's Supabase Storage and reference them from customer sites.

**Dlaczego:** It is not 'the customer's own domain' — it is Milo's project. Every published article becomes a permanent hotlink: Milo pays egress for every pageview on every customer site forever, churned customers keep billing, and any bucket cleanup 404s images on live sites with no republish path. It also puts a third-party origin in the critical render path of the page whose LCP the product is paid to improve — the exact objection we correctly raise against Unsplash.

**Zamiast tego:** Upload the binary into the customer's own CMS first (WordPress /wp/v2/media, Shopify fileCreate staged upload) and reference their URL. A connector without a media path does not get images.

### Invent a markdown attribute convention like [label](url){.milo-cta} for the custom endpoint.

**Dlaczego:** butelkiwodorowe.pl is live on that connector and renders markdown with marked/react-markdown, neither of which supports Pandoc-style attributes. The published page would show the literal string 'Book now{.milo-cta}' as body text on a live customer site, permanently, with no Unpublish.

**Zamiast tego:** Add an explicit optional typed cta:{label,url} field to the custom-endpoint payload and document it as additive in MILO-WEBSITE-CONNECTOR.md. Do not send it until the receiving site is confirmed to ignore unknown keys.

### Store visual brand tokens inside BrandIntelligence.

**Dlaczego:** brandIntelligenceBlock feeds projectBrief, which feeds all twelve AI handlers including the evaluator, prefixed 'Brand Intelligence (follow strictly)'. Hex codes and font names would be injected into every prompt in the product — including the judge, where brandFit is 14% of the score — telling a model to strictly follow #2166AE while grading markdown that contains no colours. That is noise the Forge loop then pays improve calls to chase.

**Zamiast tego:** Project.visualBrand, separate object, one consumer: the preview renderer. Add a test asserting no hex or font string ever reaches projectBrief output.

### Claim typographic fidelity in the preview.

**Dlaczego:** An extracted font-family name is not a font. The customer's webfont is served from their origin, often CORS-restricted with hashed filenames; Milo's app cannot load it. The preview silently falls back to a system font while the UI asserts it is showing their branding — the identical failure we are fixing, now with a truthfulness claim attached.

**Zamiast tego:** Show colours and layout, label typography 'your theme controls this', or resolve to a small embeddable-font allowlist labelled 'closest match'.

### Move metering ahead of the agreed increments 1 and 2.

**Dlaczego:** The winning proposal asked to reorder. It doesn't need to: FLOW-REDESIGN already puts metering at increment 3, and Spark cannot ship before increment 3 anyway — it depends on the derived-stage vocabulary and on increment 2's verbs meaning what increment 2 makes them mean. Reordering buys nothing and costs replanning time in a repo where Codex is also working.

**Zamiast tego:** Keep the agreed sequence exactly. Metering lands in increment 3 as planned, hardened with the must-fix list; Spark is 3.5 and cannot ship before it.

### Ship 'What only you know' as an unenforced prompt and treat it as the added-value defence.

**Dlaczego:** It is the single best idea in the whole design and it is currently a section the user can scroll past — while the product's entire premise is that users don't do work. An unfilled section produces exactly the generic page it was meant to prevent, while giving us false confidence that a mechanism exists. That matters because the scaled-content argument then reduces to volume caps alone: 'we only let you publish 15 generic articles a month', which is a much weaker position than 'the articles aren't generic'.

**Zamiast tego:** Make an empty 'What only you know' a deterministic FAIL that blocks Forge behind a two-field prompt ('what do you charge?' / 'name one client situation from the last month'), not a soft note. Two fields is a fair ask for the thing that makes the page worth ranking, and it is the only moment in the flow where the user is cheap to ask.

### Give the owner account an unconditional bypass.

**Dlaczego:** canUseFeature's first line is 'if (opts.isOwner) return true'. If metering copies that precedent, the account with five projects and the MCP connector attached has no ceiling, and the person who most needs to feel the wall never hits it. A gateway 402 stops AI for every paying beta customer at once with no attribution.

**Zamiast tego:** Owners get 10x Pro limits and the same hourly burst cap — a raised ceiling, never an absent one, plus a daily aggregate spend alert.

## Wyzwalacz generowania

SPARK (cheap, automatic, ~$0.0030). Fires at exactly three client-side store chokepoints: manual opportunity create (app.plan.tsx:345), acceptDiscoverySuggestions (store.ts:597 — default 3 selected, max 6), and the five single-item module converts (createOpportunityFromFinding/Gap/AuthorityItem/VisibilityGap/BacklinkRecommendation). One Spark = one generateContentFn call, assetType 'brief', maxOutputTokens lowered 8000 → 1800.

DELIBERATELY NOT auto-sparked:
- The five BULK converts (each .slice(0,5); five clicks = 25 opportunities). They land as "5 opportunities ready — Spark these" behind one button that debits 5 units. This is the one place we keep friction on purpose and we say so.
- The two server-side creation paths: MCP connector create (capped at MAX_OPPORTUNITIES=1000) and pending-actions project_setup (up to 10). A scripted caller minting 1000 opportunities must not mint 1000 AI calls.
- Onboarding, except that the first three discovery suggestions arrive pre-Sparked so Home is not empty on day one. Onboarding already fires 3–4 concurrent AI jobs before navigating away; it gets no more.

GATE ON SPARK: an opportunity is only auto-Sparked if the project has answered the regulated-category question OR has brandIntelligence filled. Otherwise it lands unsparked with a one-line "tell Milo what you can and can't claim" prompt. Reason: brandIntelligenceBlock returns empty string when brandIntelligence is undefined, which is the guaranteed state of every new project (onboarding never touches it) — so the claims/caveats rules, including "no medical/legal/financial claims", are structurally absent at exactly the moment auto-generation would fire.

FORGE (expensive, on explicit intent, ~$0.0386). Fires ONLY on:
- the "Write the full article — uses 1 of your 15" button on the brief;
- "Schedule", which ENQUEUES a Forge rather than firing inline (quota checked at run time; card shows "queued — writes Tuesday").

Not on open. Not on dwell. Not on "Set date" — that verb stays inert per increment 2.

NOT auto-generated at any tier: images, metadata regeneration, socialPack/gbpPost/meta/comparison variants.

WHAT THE USER SEES: accept three suggestions → within seconds each card in Up Next stops being a title and becomes a brief: angle, who it's for, search intent, suggested H1, outline, six FAQs worth answering, internal-link ideas, CTA, an image direction line, and "What only you know" listing the two or three things Milo cannot know. Nothing blank. Nothing waiting. The brief card carries the remaining article count, so the price of the next click is visible before it is spent.

UNDO: undoAcceptedDiscoverySuggestions currently filters s.opportunities only and knows nothing about s.content. It must cascade-delete the Spark and cancel in-flight work. Cheap precisely because a Spark is short.

## Pętla jakości

SCOPE: Forged articles only — never Sparks. quality.ts short-circuits any draft under 40 words to a hard-coded overall of 10 with no AI call, and briefs, gbpPost and meta can legitimately land there; an unattended loop on those grinds forever against a constant. Loop runs on article, servicePage, landingPage, comparison only.

THRESHOLD: 85, not 90. quality.ts:87-92 deriveRecommendation already returns "ready" at overall >= 85 — that is the product's own published definition. 90 invents a second, stricter, undocumented bar and, because overall is a weighted mean of 8 conservative-graded categories, requires essentially every category >= 88, including internalLinks (8%) and part of conversion (12%) that are graded against markdown which structurally cannot contain them.

CAP: 2 improve passes, hard max 3.

PLATEAU: abort immediately on a gain under 3 points, or on any decrease. No temperature/topP/seed is set anywhere, so a 1–3 point move is inside the instrument's noise floor and chasing it is pure token burn.

VERSION KEPT: ARGMAX across all scored versions, with {markdown, score} snapshots on the ContentAsset. Today improve overwrites in place with no comparison and no history — a live data-loss bug that can permanently replace an 84 with a 71.

COMPLIANCE CONSTRAINS ARGMAX (the fix the winning design missed). The rubric actively pays for deleting hedges: a confident unqualified answer scores better on aiAnswerReadiness (16%) + conversion (12%) than a caveated one, while trustSafety is only 12%. So the loop is structurally biased toward stripping the caveats a therapy or supplement business is legally required to carry. Therefore: (a) any version that drops a requiredCaveat present in the prior version is rejected outright; (b) any version that introduces a forbiddenClaim is ineligible for argmax at any score; (c) any version scoring below version 1 on trustSafety is ineligible; (d) factual spans — numbers, dates, quotes, named entities — are frozen; (e) no version may exceed the prior by >5% length.

SPLIT RUBRIC (deterministic half, zero AI cost, shipping as a publish precondition BEFORE the loop): word count in band, H2/H3 structure present, metaTitle <= 60, metaDescription <= 160, internalLinks non-empty, cta non-empty, faq non-empty, no forbiddenClaim strings, all requiredCaveats present, "What only you know" answered, no near-duplicate against the project's own assets, every internal link resolving against the project's real URL set, and a TRUNCATION check (markdown length === 8000 means cleanString sliced mid-sentence and the loop would otherwise spend improve calls fighting a defect the product created). Only genuinely subjective categories go to the model.

EVALUATOR FIXES, prerequisite: pass the asset's internalLinks, cta and faq into evaluateContentQualityFn so ~20% of the weight stops grading the wrong artifact. Treat improve returning markdown identical to input (the ai.functions.ts:1946 fallback when the model omits the key) as a FAILED attempt that does not consume a pass — today it is a paid no-op indistinguishable from real work.

CROSS-FAMILY JUDGE: the gateway offers GPT as well as Gemini, so a cross-family judge is a model-string change. Spike it; if the compact JSON payload survives the reasoning-token budget, use it. If not, Gemini judges Gemini and the deterministic half is what keeps the composite honest. Either way modelOverride must be allowlisted first (see must-fix).

WHAT THE USER IS TOLD: the score stays a SIGNAL — a soft block on "Publish now" only, one extra click, never a gate on scheduling, exactly as already agreed. It is allowed to fail. A best version at 78 is delivered at 78 with the specific failing categories named and a plain-language pointer ("thin on internal links; section 3 could use one of your own examples") plus the path ("72 → 86 in 2 passes, kept pass 2"). We never advertise "every article reaches 90".

## Kontrola kosztów

MODEL PRICE ASSUMPTION: google/gemini-3-flash-preview at Google list — $0.50 per 1M input tokens, $3.00 per 1M output tokens (source: ai.google.dev/gemini-api/docs/pricing). This is a FLOOR, not the invoice: Lovable resells the gateway with an undocumented markup. Re-derive against a real Lovable statement before quota numbers are frozen. At a hypothetical 3x markup every figure below triples and the plan percentages stay under 12%.

PER-CALL (typical): Spark brief ~1,150 in / 800 out = $0.0030. Article generate ~1,150 in / 2,500 out = $0.0081. Evaluate ~3,600 in / 950 out = $0.0047. Improve ~3,270 in / 2,200 out = $0.0082.
FULL FORGE at K=2 (generate + 3 evals + 2 improves) = $0.0386. At output caps = $0.1207.
A Spark is ~1/13th of a Forge.

BURST COMPARISON (the five-bulk-convert session, 25 opportunities from 5 clicks, reachable today): auto-full-loop = $1.29, at caps $3.02. Spark-first = $0.075. Seven and a half cents.

MONTHLY: realistic Starter (€79) = 60 Sparks ($0.18) + 12 Forges ($0.46) = $0.64, 0.7% of revenue. Pro at ceiling: $10.29 text plus images on their own counter.

WHERE IT IS ENFORCED — increment 3, as already agreed. Inside generateJsonText, the single chokepoint all 18 AI server functions pass through, downstream of requireSupabaseAuth and upstream of generateText(). Every other candidate fails: UI disable is a button; store.ts is browser memory; mock-ai's once() is a per-tab in-memory Set that dies on reload; a Postgres trigger fires after the money is spent.

BUT generateJsonText's signature is (prompt, maxOutputTokens, modelId) — no userId, no notion of Spark vs Forge. So the signature changes to generateJsonText(prompt, {userId, bucket, units, maxOutputTokens, modelId}), passed explicitly from each handler. Single chokepoint, but it knows what it is charging. And the Forge loop becomes ONE server function running generate + evaluate + improve server-side, bumping the Forge counter exactly once — a client-orchestrated loop cannot honour "a failed loop costs one unit".

KEYING: the userId from requireSupabaseAuth. It is the only unforgeable value on that path — every AI fn takes project/services/opportunity as z.any() and lets the client pick the model via modelOverride.

PLAN RESOLUTION: a service-role-written billing table. NEVER workspaces.data.subscription, which the browser upserts wholesale with the anon key and which no Paddle webhook validates. A quota keyed off the blob is self-service.

STORAGE: a NEW ai_usage table (user_id, bucket, period_start, count) with its own atomic bump RPC — NOT oauth_rate_limits. cleanup_rate_limits is an unscoped `delete where window_start < p_before` at now-24h; a 30-day spend window would be deleted while still open and the counter would silently reset to zero, daily. That bug is invisible today because every OAuth bucket is <= 3600s; metering is the thing that exposes it.

PERIOD: calendar month, UTC, encoded in the bucket string (forge:2026-08), not derived from an epoch-aligned fixed window — no multiple of seconds tracks calendar months, and the billing anniversary isn't knowable server-side while Paddle webhooks are deferred. UI says "resets on the 1st".

COUNTERS: Sparks — Free 30 / Starter 200 / Growth 600 / Pro 1500. Forges — Free 3 / Starter 15 / Growth 50 / Pro 150 (one Forge = the whole loop; a failed loop costs ONE Forge, not four). Images — their own counter, 1 included per Forge plus 2 free regenerations, then 1 image unit; NOT denominated in Forge units, because $0.067 charged against a $0.0386 unit is an inverted exchange rate.
BURST: 60 Sparks/hour and 10 Forges/hour per user regardless of plan. This is the number that matters most — today a single authenticated Free user can drive improve+rescore at $0.0408/iteration = $147/hour, ~$35k/day at 10/sec, and that hole is ALREADY OPEN. Metering is justified on that ground alone, independent of this proposal.

BUCKETS ARE PLAN-TIERED, not flat, and cover all 18 entry points — including generateAuditFn, generateCompetitorGapFn, generateAuthorityFn, generateAiVisibilityFn, generateBacklinksFn and the three that silently default to 16000 output tokens (which also get explicit budgets).

FAIL CLOSED for spend buckets — inverting the deliberate fail-open in the OAuth limiter. Fail-open is right for a login abuse guard, catastrophic for a spend ceiling. Users with no entitlements row get the Free tier, never an implicit generous default.

WHAT HAPPENS AT THE LIMIT (specified, not left open): pre-flight the batch. Read remaining quota before the first call and say so up front — "Sparking 3 of 6; you're out of briefs until 1 August". Never throw out of the worker: catch per item, persist every 2 completions rather than once at the end, and mark the remainder on the OPPORTUNITY (which exists) as quota_blocked rather than on the asset (which doesn't). Under the original design a fail-closed trip on item 4 discarded three fully generated, fully billed briefs.

ALSO: set maxRetries explicitly (0 or 1) on generateText. The AI SDK default is 2 retries, so one metered unit can be three billed completions, below the meter, exactly when 429s are likeliest.

GLOBAL: a founder kill switch as a service-role row, plus an auto-trip when org-wide 24h units exceed 3x the trailing median. Today the only real ceiling is the gateway's 402, which stops AI for every customer at once with no attribution.

## Branding

The honest finding first, and the owner should hear it plainly: "articles take the site branding" is ALREADY TRUE on the published page, by the strongest available mechanism — inheritance. src/lib/markdown.ts emits bare semantic HTML with no class and no style attribute. WordPress renders it through the active theme, Shopify through the Online Store 2.0 article template, and the custom endpoint receives RAW MARKDOWN and lets the customer's own site render it. Anything Milo injects would be Milo overriding a theme that already matches.

The real complaint is that he cannot SEE it. app.editor.tsx defines a SECOND, weaker markdown converter (h1–h3, `-` lists, bold only — no links, no ordered lists, no italics) wrapped in a hardcoded font-family:Inter div with .prose-preview forcing Fraunces on headings — Milo's own app fonts. So the pane that forms his mental model of "my article" is in the wrong typeface, on Milo's background, with every link deleted, while the live page is in the customer's theme with links intact. Export HTML uses the same weak converter, so exported files drop links too.

WHAT WE DO:
1. Unify the converters onto src/lib/markdown.ts. Preview fidelity is unfixable by construction until this happens, and it silently fixes Export HTML.
2. Extract visual brand best-effort from a fetch we already make. fetchHtml keeps 300KB of raw homepage HTML and fetchSiteContext discards every visual signal. Free wins, zero new network cost: meta theme-color, og:image, favicon/apple-touch-icon, logo img src, CSS custom properties. Prefer a page representative of the DESTINATION (blog index or an existing article URL from BrandIntelligence.internalLinks); fall back to the homepage with a visible caveat, because a dark full-bleed homepage hero would otherwise render every preview white-on-dark while the real article template is black-on-white.
3. Store as Project.visualBrand — a SEPARATE object whose only consumer is the preview renderer. NOT inside BrandIntelligence: brandIntelligenceBlock feeds projectBrief, which feeds all twelve AI handlers including the evaluator (brandFit is 14% of the score), and prefixing hex codes with "follow strictly" into a judge grading colourless markdown produces noise the Forge loop then pays to chase.
4. Apply to the PREVIEW ONLY. Extract only a typed allowlist of scalars — bgColor, textColor, headingColor, ctaColor validated as #rrggbb, plus a font-family name matched against an allowlist — applied as inline CSS custom properties on the preview wrapper, consumed by a static Milo-authored stylesheet. NEVER inject harvested CSS text: the preview is a dangerouslySetInnerHTML sink and a customer site's body{}/:root{}/*{} rules would cascade into the Milo app shell and restyle or hide real UI. If a fuller preview is ever wanted, sandboxed iframe, no scripts.
5. Never claim typographic fidelity. An extracted font name is not a font — the customer's webfont is served from their origin, usually CORS-restricted with hashed filenames. Label typography "your theme controls this", or resolve to a small embeddable-font allowlist labelled "closest match".
6. Extraction is a SUGGESTION with one human confirmation click, never authoritative. It fails loudly ("we couldn't read your brand — pick colours") rather than returning greys harvested from a cookie banner. A plain fetch of a CSR SPA returns nothing — the exact synergymassage.se pattern — so a meaningful share of the portfolio gets manual colour picking. Store visualBrandScannedAt and re-prompt after 90 days or on any site-URL change.

CTA, PER CONNECTOR — native primitives, zero colour:
- WordPress: real Gutenberg block markup (<!-- wp:buttons --> / <!-- wp:button -->) so theme.json presets style it and the customer can still edit it in the block editor. Verify PER PUBLISH, not once per site: GET the post after write and assert the delimiter survives in content.raw. unfiltered_html is a per-USER capability and security plugins filter content, so a site that passed once can start stripping the day the customer rotates the application password. On failure, immediately re-update with a plain-anchor fallback and set ctaDegraded so the UI can say "your WordPress install strips block markup — published as a link".
- Shopify: <a class="button milo-cta"> with NO style attribute and NO inline fallback. The fallback cannot be conditional (Admin GraphQL can't inspect theme CSS), so always-on inline styles would override Dawn's own .button on the majority theme — doing precisely the thing we promised not to do, everywhere, permanently, since body_html is stored verbatim and unsanitised. Accept that non-Dawn themes render a text link, and tell the user after the first publish.
- Custom endpoint: an explicit optional typed cta:{label,url} field on the JSON payload, documented as additive in MILO-WEBSITE-CONNECTOR.md, not shipped until butelkiwodorowe.pl's renderer is confirmed to ignore unknown keys. NOT a markdown attribute convention like {.milo-cta} — marked and react-markdown don't support it and the literal string would render as body text on a live customer site.
- Every Milo-emitted CTA carries the existing window.miloTrack('cta_click', {label, location}) hook WITH the destination URL, or Milo's own CTAs are invisible to Milo's own analytics and a 404-ing CTA is counted as a conversion.

WHAT WE DELIBERATELY DO NOT DO: no colour, font-family, fixed px width, background image or !important injected into a customer's live CMS. WCAG 1.4.11's 3:1 is against an adjacent background we cannot see through a publishing API; inline colour can't respond to prefers-color-scheme; and publish is upsert-only with no Unpublish by standing decision, so anything we inject persists indefinitely and can only be removed by republishing every asset.

LINK HEALTH, because it directly undermines the branding work: generation is explicitly prompted to invent relative internal links, and internalLinks is 8% of the score, so the loop is rewarded for adding MORE invented links. Extend fetchSiteContext to fetch /sitemap.xml once per project (cached) and store the real URL set; at publish time strip or flag any internal link not in it, and HEAD-check the CTA URL. Never publish an unresolvable relative link into the pages an SEO product just created.

## Obrazy

Not in the cheap pass, ever, and not before the plumbing exists.

THE SPARK GETS AN IMAGE DIRECTION — one line in the brief ("hero: therapist's hands on a shoulder, warm daylight, 16:9; suggested alt text: ..."). A handful of output tokens inside a call we're already making, actionable whether the user generates, shoots, or uploads.

ACTUAL GENERATION fires only on a Forged article and only on an explicit click. Nothing auto-generates an image.

BLOCKED ON PREREQUISITES, plainly. ContentAsset has no image/hero/featured field of any kind. markdownToHtml renders ![alt](url) as a literal stray "!" followed by a text link — no <img> at all. No connector has a media path. If images shipped before this, every generated image publishes as an exclamation mark on a customer's live site.

SEQUENCING NOTE: in increment 1 we fix the stray "!" by rendering image markdown to NOTHING (or alt text as a caption), NOT by adding <img>. markdown.ts's inline() validates hrefs permissively (^https?://|^/, falling back to #); an equivalent permissive <img> rule would publish model-chosen remote image URLs — hallucinated, hotlinked, or dead — into live WordPress and Shopify posts, permanently, before any review UI exists. <img> arrives only with the image increment, restricted to origins we control the upload path for.

THE TABLE BUG SHIPS IN INCREMENT 1 REGARDLESS. markdownToHtml collapses markdown tables into a mangled paragraph while ai.functions.ts explicitly instructs the comparison asset type to emit one. Milo is corrupting live WordPress and Shopify pages TODAY. That is a publish-safety fix, independent of this proposal, and it is the single most urgent item in this document.

MODEL AND COST: gemini-3.1-flash-image at 1K = $0.067/image (flash-lite $0.0336 as a bulk option). Reached via raw fetch to the Lovable gateway at /v1/chat/completions with modalities:["text","image"] returning base64 — NOT via @ai-sdk/openai-compatible's .imageModel()/generateImage(), which targets /images/generations and is not the gateway's documented route. Chosen on latency: Flash-tier is reported at 1–3s versus ~112s for GPT Image 2, which is the difference between an inline action and a polling subsystem this codebase does not have (there is no polling, no realtime and no setInterval anywhere outside a marketing animation). Time it in a spike before designing any UI.

METERING: images go through a server fn with requireSupabaseAuth and their OWN metered bucket keyed on userId — not an unmetered edge-function fetch, which would leave the most expensive per-call artifact in the product outside the single chokepoint. The "two free regenerations" allowance is DERIVED FROM the meter (count of image bumps for that assetId this period), never from a counter stored on ContentAsset, because the browser upserts workspaces.data wholesale with the anon key — the same self-service problem we correctly refuse for planId. At the Pro ceiling, 150 Forges x 3 images = $30.15, which is why images need their own counter and their own line in the cost model rather than riding inside the Forge allowance.

HOSTING: upload the binary into the CUSTOMER's own CMS before referencing it — WordPress /wp/v2/media (returns a source_url on their domain), Shopify fileCreate staged upload, custom endpoint gets an explicit copyOnIngest contract. Milo's Supabase Storage is a short-lived transfer location, never a serving location. Referencing Milo's bucket from customer sites means Milo pays egress for every pageview on every customer site forever, churned customers keep billing, and any cleanup 404s images on live pages with no republish path. This reorders the increment: a connector without a media path does not get images, so Shopify cannot be "last" if Shopify gets images at all.

POST-PROCESSING: base64 → WebP at 16:9 hero dimensions. Shipping 4K PNGs from an SEO product would tank the LCP it exists to fix.

CONTENT CONSTRAINTS — the risk the licensing analysis misses. A photorealistic hero of "a therapist's hands" on a massage studio's service page reads as a photograph of THAT clinic and THAT therapist. It is neither. For a therapy business that is a misrepresentation of premises and staff to prospective clients; for a bottle shop, a photorealistic hero of a SKU they don't sell is misleading product advertising. So: for service, health and therapy businesses, default image directions to abstract or illustrative (technique diagrams, anatomical illustration, texture) and refuse photorealistic depictions of people, premises, or branded packaging. Require an explicit acknowledgement on first use. Where a hero implies a real place, person or product, the upload path comes first and generation second. Apply the same constraint to the Spark's image-direction line from day one, so briefs never seed a direction the image tier will later have to refuse.

LICENSING: Google does not claim ownership of output; no attribution required; commercial publication is fine. Two guardrails in the UI: images are non-exclusive so never use one as a logo or mark, and all Gemini output carries a SynthID watermark (invisible but detectable) — surfaced so clients with anti-AI brand guidelines are not blindsided.

NO STOCK APIs in v1: Unsplash mandates hotlinking to their CDN (no self-hosting, no WebP, an uncontrolled third party in the client's critical render path) and Pexels mandates a visible credit link on the client's page. Both are at odds with an SEO product.

## Przyrosty


### 1. Increment 1 (unchanged, first) — prove the cron + publish safety, plus three live-bug fixes

*day · ryzyko low*

**Co wchodzi:** The six agreed publish-safety fixes and the end-to-end cron proof, unchanged and still first. ADD: (a) teach src/lib/markdown.ts markdown TABLES — comparison assets are prompted to emit one and the converter mangles it, so we are corrupting live WordPress and Shopify pages today; (b) render image markdown to nothing (or alt-as-caption) so the stray '!' stops publishing — deliberately NOT adding <img> yet, which would publish model-chosen remote URLs into live sites; (c) unify the editor's second, weaker converter onto src/lib/markdown.ts, which also fixes Export HTML silently dropping every link. Coordinate with Codex — markdown.ts is shared.

**Relacja do FLOW-REDESIGN:** Extends the agreed increment 1. Displaces nothing. The converter unification is a prerequisite for every later preview and image step.

### 2. Increment 2 (unchanged) — Approve stops publishing; Schedule ships

*multi-day · ryzyko medium*

**Co wchodzi:** Exactly as agreed. The four verbs get non-overlapping meanings; autoPublishApproved retires.

**Relacja do FLOW-REDESIGN:** Unchanged, and a hard prerequisite: 'Schedule' is one of only two Forge triggers, so it must mean what increment 2 makes it mean before promotion can hang off it. 'Set date' stays inert and is NOT a trigger.

### 3. Increment 3 (agreed slot, hardened + one scope addition) — derived stages, Up Next, and metering

*multi-day · ryzyko medium*

**Co wchodzi:** Metering ships here, where FLOW-REDESIGN already put it — no reordering. New ai_usage table with its own atomic bump RPC (NOT oauth_rate_limits, whose unscoped cleanup would silently reset a 30-day window daily). Calendar-month buckets. Plan-tiered Spark/Forge/Image counters plus per-user hourly burst caps, covering all 18 entry points. generateJsonText's signature gains an explicit meter descriptor {userId, bucket, units}. Fail CLOSED. planId from a service-role billing table. modelOverride allowlisted. Explicit maxOutputTokens for the three functions defaulting to 16000, and maxRetries set explicitly on generateText. IP-keyed bucket + global daily ceiling + Turnstile on the unauthenticated public audit. Owner accounts get 10x Pro, never a bypass. Plus the agreed derived-stage vocabulary and Up Next — with ONE scope addition: pipelineStage derives 'Sparked' (asset exists, assetType 'brief', no qualityScore) as distinct from 'Drafted'. Blob-only, no new status field, no URL change.

**Relacja do FLOW-REDESIGN:** The agreed increment 3, hardened, with one derived stage added. Nothing is displaced or reordered. The metering half independently closes a live $147/hour-per-free-user exposure and is justified even if Spark never ships.

### 4. Increment 3.5 — Spark

*multi-day · ryzyko medium*

**Co wchodzi:** generateContentFn drops to maxOutputTokens 1800 for assetType 'brief'; the brief prompt gains 'What only you know' and a constrained image-direction line. Hooked at the three store chokepoints only. Serial worker, concurrency 2, persisting every 2 completions and never throwing out of the worker (a fail-closed quota trip must not discard fully-billed briefs). Pre-flight quota read so the user is told 'Sparking 3 of 6' up front. Cascade-delete + cancel on Undo. Per-asset run fields on ContentAsset (attempts, last error, terminal state) — fields, not a new collection. Gate: no auto-Spark until the regulated-category question is answered or brandIntelligence exists. Move the claims/caveats rules out of the conditional brandIntelligenceBlock into sharedRules so they ship on every prompt. Server-side refusal to publish assetType 'brief', re-checked at cron claim time. Trigram dedupe at the store chokepoint before Spark. Delete the 'scheduled' gate and the two dead CreateContentDialog mounts.

**Relacja do FLOW-REDESIGN:** New, and it depends on 3. Consumes the derived Sparked stage and lands its output in Up Next.

### 5. Increment 4 — Forge + the deterministic gate

*multi-day · ryzyko medium*

**Co wchodzi:** One server function running generate → evaluate, metered as exactly one Forge unit. Triggered by the explicit 'Write the full article (uses 1 of your 15)' button and by Schedule (enqueued, not inline). No dwell trigger. The full deterministic checklist ships HERE, as a publish precondition, ahead of the improve loop: word/structure/meta checks, forbiddenClaim scan, requiredCaveat presence, 'What only you know' answered, non-empty internalLinks/cta/faq, near-duplicate check, sitemap-validated internal links, and the markdown.length===8000 truncation check. Evaluator fixes (pass internalLinks/cta/faq) land here.

**Relacja do FLOW-REDESIGN:** New. The deterministic gate is deliberately pulled AHEAD of the improve loop — it is useful with or without the loop, and the loop without it is the dangerous half.

### 6. Increment 5 — the improve loop

*multi-day · ryzyko medium*

**Co wchodzi:** The missing improve-then-rescore primitive, inside the Forge fn. Threshold 85, cap 2 passes, abort on <3-point gain or any decrease, argmax retention with version snapshots, factual spans frozen, no >5% length growth, compliance-constrained argmax (caveat-dropping and forbiddenClaim-introducing versions ineligible). Silent no-op improve detected and not counted as a pass. Honest failure surfaced with named categories and the improvement path shown. Cross-family judge if the GPT spike passes.

**Relacja do FLOW-REDESIGN:** New. Preserves the standing decision that Milo Score is a soft block on 'Publish now' only and never gates scheduling — and strengthens it, since only Forged assets are scored, so a real score is always present at the publish moment.

### 7. Increment 6 — preview fidelity + visual brand

*day · ryzyko low*

**Co wchodzi:** Extract a typed allowlist of scalars from the fetch onboarding already makes, preferring a destination-representative page. Project.visualBrand as a separate object with one consumer. Applied to the PREVIEW ONLY, as validated CSS custom properties on a wrapper — never harvested CSS text into the app's innerHTML sink. Typography labelled, not claimed. Suggestion + one confirmation click; loud failure on SPA sites; staleness stamp with 90-day re-prompt.

**Relacja do FLOW-REDESIGN:** New, independent, touches no customer site. This is the honest deliverable on the owner's branding ask.

### 8. Increment 7 — CTA as a platform-native primitive

*multi-day · ryzyko medium*

**Co wchodzi:** WordPress Gutenberg block markup with a per-publish read-back assertion and automatic plain-anchor fallback on strip. Shopify <a class="button milo-cta"> with NO inline fallback and a post-publish note to the user. Custom endpoint gets an explicit optional typed cta field, documented as additive, not shipped until butelkiwodorowe.pl's renderer is confirmed to tolerate unknown keys. No colour anywhere. miloTrack('cta_click') carries the destination URL. Sitemap-validated links and a HEAD check on the CTA URL at publish.

**Relacja do FLOW-REDESIGN:** New. Touches live customer sites, so it sits behind the publish-safety work in increment 1 and behind the read-back verification.

### 9. Increment 8 — images

*multi-day · ryzyko high*

**Co wchodzi:** Spike and TIME the gateway image call first. Then: ContentAsset image fields, <img> in markdown.ts restricted to allowlisted origins, base64 → WebP, upload into the CUSTOMER's CMS media library before referencing (WordPress /wp/v2/media first, then Shopify fileCreate, then the custom-endpoint contract). Own metered bucket via a server fn; regeneration allowance derived from the meter, not from the client-writable blob. Content constraints by business type. SynthID disclosed.

**Relacja do FLOW-REDESIGN:** New, last, and the most likely to slip. A connector without a media path does not get images.

## Musi być naprawione przed wdrożeniem


- **BLOCKER — monthly spend counters stored in oauth_rate_limits are silently wiped. cleanup_rate_limits is an unscoped `delete from oauth_rate_limits where window_start < p_before`, called opportunistically at ~2% of bumps with now-24h. A 30-day window's row is deleted while the window is still open, resetting the used-count to zero, daily, with no error. This makes the entire cost ceiling unenforceable. It is invisible today only because every OAuth bucket is <= 3600s.**
  - *Naprawa:* Do not put monthly counters on that table. New ai_usage(user_id, bucket, period_start, count) with its own atomic bump RPC and no cleanup. Add a test asserting a 30-day window survives a cleanup call.

- **BLOCKER — generateJsonText cannot enforce what the design says it enforces. Its signature is (prompt, maxOutputTokens, modelId): no userId, no caller identity, no Spark/Forge distinction. And 'one Forge = one unit' can only be counted where the loop lives, which today is browser memory. The un-bypassable meter would count 6 calls per Forge while the UI says 1; the user is told '15 articles left' and cut off after 2.**
  - *Naprawa:* Change the signature to generateJsonText(prompt, {userId, bucket, units, maxOutputTokens, modelId}), passed explicitly from each of the 18 handlers. Make the Forge loop ONE server function that runs generate + evaluate + improve server-side and bumps the Forge counter exactly once.

- **BLOCKER — a Spark is publishable, which invalidates the design's central safety claim. publish.functions.ts declares assetType: z.string().default('article') and accepts anything; publish-targets reads it only to pick post-vs-page; the scheduled-publish queue never inspects it. A user who hits the Forge wall and clicks Schedule publishes 'Target audience / Search intent / Suggested H1 / Outline' as a live post on a customer's domain, with no Unpublish. Legacy beta records already contain 'brief' assets.**
  - *Naprawa:* Reject assetType 'brief' (and any asset carrying a terminal Forge-failure flag) server-side in publish.functions.ts and both CMS handlers, and re-check at cron CLAIM time, not enqueue time. 'Schedule' must refuse to arm an unforged asset and say why.

- **BLOCKER — auto-generation fires exactly when the claims guardrails are structurally empty. brandIntelligenceBlock returns '' when project.brandIntelligence is undefined, which is the guaranteed state of every new project (onboarding never writes it). That drops forbiddenClaims, requiredCaveats AND the 'no medical/legal/financial claims' sentence entirely; sharedRules only forbids inventing metrics and rankings. A new therapy or supplement project's first auto-Spark therefore seeds unauthorised health claims into a brief, which seeds the article.**
  - *Naprawa:* Move claims/caveats and the 'no medical, legal or financial claims' rule OUT of the conditional block into sharedRules so they ship on every prompt. Add a regulated-category question to onboarding that writes default forbiddenClaims/requiredCaveats. Gate auto-Spark on that question being answered or brandIntelligence existing.

- **BLOCKER — a fail-closed quota trip mid-batch discards fully-billed work. The design specifies one saveWorkspaceNow at the end of the worker; a throw on item 4 means three generated, billed, quota-consumed briefs are never persisted, with no failure record (the ContentAsset doesn't exist yet) and a generic toast.**
  - *Naprawa:* Pre-flight the quota and tell the user up front ('Sparking 3 of 6'). Persist every 2 completions. Catch per item and mark the remainder quota_blocked on the OPPORTUNITY, which exists, not the asset, which doesn't.

- **BLOCKER — publishing images from Milo's Supabase Storage. The proposal says 'the customer's own domain'; it is Milo's project. Permanent hotlinks mean Milo pays egress on every pageview on every customer site forever, churned customers keep billing, and any cleanup 404s images on live pages with no republish path — plus a third-party origin in the critical render path of the page we're paid to speed up.**
  - *Naprawa:* Upload the binary into the customer's own CMS (WordPress /wp/v2/media, Shopify fileCreate) and reference their URL. Milo storage is a transfer location only. No media path, no images for that connector.

- **BLOCKER — the custom-endpoint CTA convention [label](url){.milo-cta} would publish literal text to a live customer site. butelkiwodorowe.pl renders markdown with marked/react-markdown; neither supports Pandoc attribute syntax, so the page shows 'Book now{.milo-cta}' permanently, with no Unpublish.**
  - *Naprawa:* Add an explicit optional typed cta:{label,url} field to the JSON payload and document it as additive. Do not send it until the live receiver is confirmed to ignore unknown keys.

- **SERIOUS — modelOverride is an unallowlisted z.string() on four AI functions, and modelFor falls through to getGateway()(modelId) for any id. A 'Spark' budgeted at $0.003 can be issued against the most expensive model on the gateway, billed to the founder's key. A counter that meters CALLS bounds nothing.**
  - *Naprawa:* Allowlist at the validator: accept only MODEL or the configured candidate, and only when evaluation routing is enabled. Reject before the meter bumps. Five lines, and it is an open hole today independent of Spark.

- **SERIOUS — runPublicAiVisibilityAuditFn is unauthenticated, unmetered, does a 300KB fetch plus a 4000-token call (~$0.02), and is wired to the public marketing page. A userId-keyed meter structurally cannot cover it: ~$360/hour at 5 req/s, and the resulting gateway 402 stops AI for every paying customer at once.**
  - *Naprawa:* IP-keyed bucket using the existing hashed-key salt pattern (5/hour), plus a global daily ceiling for the endpoint that fails closed with a 'try again tomorrow', plus Turnstile.

- **SERIOUS — generateText is called with no maxRetries. The AI SDK default is 2 retries, below the meter, so one metered unit can be three billed completions — exactly when 429s are likeliest (bursts and loops). The $0.0386 Forge figure is up to 3x optimistic on the runs that drive the tail, and metered spend will never reconcile against a Lovable statement.**
  - *Naprawa:* Set maxRetries explicitly (0 or 1) and retry at the loop level where attempts can be counted and written to the per-asset run fields.

- **SERIOUS — 'monthly' via an epoch-aligned fixed window is not a month. rateWindowStart floors nowMs to a global window, so a customer upgrading mid-period can get a full allowance for two days, or a double allowance inside one billing month. The billing anniversary isn't knowable server-side while Paddle webhooks are deferred.**
  - *Naprawa:* Encode the calendar month in the bucket string (forge:2026-08, UTC). State in the UI that quota resets on the 1st, not on the billing anniversary.

- **SERIOUS — near-duplicate mass production. addOpportunities is a plain spread append with zero dedupe; the only dedupe is an exact-key match inside acceptDiscoverySuggestions. Four single-item converts across audit, competitor gap, authority and AI-visibility modules routinely describe the same topic in different words, producing four near-identical briefs, four near-identical articles, and four ~90%-overlapping pages on a twelve-page domain. A tight Forge counter does not address this at all — 15 Forges is ample budget to publish four versions of the same article.**
  - *Naprawa:* Trigram (or embedding) similarity check at the store chokepoint before Spark, against existing opportunities AND existing ContentAsset titles/H1s; above threshold, merge rather than create. Second check before Forge against already-published assets, offering 'update the existing page' instead.

- **SERIOUS — the improve loop is structurally biased toward stripping legally-required caveats. aiAnswerReadiness (16%) + conversion (12%) reward a confident unqualified direct answer; trustSafety is only 12%. Improve rewrites markdown wholesale driven by the evaluator's own suggestions, and argmax then ships the most confidently-asserted version by construction.**
  - *Naprawa:* Compliance in the deterministic half: a version dropping a requiredCaveat is rejected; a version introducing a forbiddenClaim is ineligible at any score; a version scoring below version 1 on trustSafety is ineligible; argmax is constrained to compliant versions.

- **SERIOUS — model-invented internal links publish as 404s. Generation is explicitly instructed to emit relative paths, and internalLinks is 8% of the score, so the loop is rewarded for adding more of them. Result: live 404s on the customer's own domain, in the pages the SEO product just created, harming the crawl signals it exists to improve — and nobody notices because the score went up.**
  - *Naprawa:* Fetch /sitemap.xml once per project (cached) and store the real URL set. Strip or flag any internal link not in it at publish time. HEAD-check the CTA URL. Never publish an unresolvable relative link.

- **SERIOUS — scaled-content risk is per DOMAIN, not per user, and the metering is keyed to userId. A Pro user with one project can put 150 articles on a twelve-page site in a month, which is the most recognisable scaled-content signature there is. The claim that 'volume caps are sized so no single client can be pushed into the pattern' is false as specified.**
  - *Naprawa:* Add a second, per-PROJECT PUBLISH cap (not generation cap), enforced in publish.functions.ts and re-checked at cron claim: max(4, ~20% of indexed pages) per month, with a slower ramp for the first 90 days on a newly connected domain. Publish velocity is what Google measures.

- **SERIOUS — the Shopify inline CTA fallback cannot be conditional and therefore always overrides the merchant's theme. Admin GraphQL gives no way to inspect theme CSS, so an always-on inline style beats Dawn's own .button rule on the majority theme — violating the design's own no-colour promise, permanently, in an unsanitised stored field with no Unpublish.**
  - *Naprawa:* Drop the inline fallback. Ship <a class="button milo-cta"> with no style attribute, accept a text link on non-Dawn themes, and tell the user after the first publish.

- **SERIOUS — injecting harvested customer CSS into the preview is a self-XSS-shaped hole. The preview is dangerouslySetInnerHTML on an unscoped div into which the converter already injects a <style> element. Harvested body{}/:root{}/*{} rules from an arbitrary customer homepage cascade into the Milo app shell and can hide a warning banner or overlay the Publish button, with the payload arriving from any URL a user types into onboarding.**
  - *Naprawa:* Never inject harvested CSS text. Extract only validated scalars (#rrggbb colours, allowlisted font names), apply as inline custom properties on the preview wrapper consumed by a static Milo stylesheet. Sandboxed iframe if a fuller preview is ever wanted.

- **SERIOUS — putting visual brand inside BrandIntelligence poisons every AI prompt. brandIntelligenceBlock feeds projectBrief, which feeds all twelve handlers including the evaluator where brandFit is 14% of the weighted score. Hex codes and font names prefixed 'follow strictly' produce noise in a category the loop then spends improve calls chasing, and widen every prompt for zero output benefit.**
  - *Naprawa:* Project.visualBrand as a separate object with the preview renderer as its only consumer. Unit test asserting no hex or font string reaches projectBrief output.

- **SERIOUS — the deterministic checks were scheduled AFTER the thing they protect. Under the original plan, Forge ships in one increment and the deterministic gate in the next, leaving a window where articles are generated and publishable with no truncation check, no caveat check, no forbidden-claim scan, no link validation and no duplicate check — on real testers' real domains.**
  - *Naprawa:* Split it: the deterministic checks cost zero AI calls and ship WITH Forge as a publish precondition. Only the improve loop waits.

- **SERIOUS — dwell-to-generate spends a scarce metered unit on reading. A Free user with 3 article credits consumes their entire month browsing three briefs, with no button, no confirmation and no undo, in their first session.**
  - *Naprawa:* Delete the dwell trigger entirely. Explicit 'Write the full article (uses 1 of your 15)' button only, with the remaining count on the brief card before the click.

- **SERIOUS — 'Set date' as a promotion trigger breaks increment 2's whole point. A user dating twenty items in a planning session hits the hourly burst cap on item eleven and gets a billing error from a verb that is defined as inert.**
  - *Naprawa:* Remove it. Promote on the explicit button and on Schedule only, and make Schedule ENQUEUE the Forge so quota is checked at run time and the card shows 'queued — writes Tuesday'.

- **SERIOUS — <img> support in markdown.ts, if added in increment 1 alongside the table fix, would publish model-chosen remote image URLs (hallucinated, hotlinked, or dead) into live customer posts before any review UI or upload path exists. inline()'s href validation is permissive by design.**
  - *Naprawa:* In increment 1, render image markdown to nothing or to alt-as-caption — the goal there is only to kill the stray '!'. Add <img> only with the image increment, restricted to allowlisted origins we control the upload path for.

- **MINOR but worth closing — canUseFeature's first line is 'if (opts.isOwner) return true'. If metering copies that precedent, the account with five projects and the MCP connector attached has no ceiling and discovers the gateway 402 first, which stops AI for every paying beta customer at once.**
  - *Naprawa:* Owners get 10x Pro limits and the same hourly burst cap. Add a daily aggregate spend counter with an alert threshold so the 402 is never the first signal.

- **MINOR — image regeneration allowance stored on ContentAsset is self-service. workspaces.data is upserted wholesale by the browser with the anon key, so a user, a bug, or a rehydrate-after-conflict resets the count. Same class of problem as reading planId from the blob. Also, charging a $0.067 image against a $0.0386 Forge unit is an inverted exchange rate.**
  - *Naprawa:* Route image generation through an authenticated server fn with its own metered bucket; derive the free-regeneration allowance from the meter (image bumps for that assetId this period). Images get their own counter, never Forge units.

## Decyzje dla właściciela


**Does the brief satisfy you, or do you specifically want the finished article to exist before you touch anything?**

- Opcje: (a) Spark-first as designed — a real brief instantly, the article on one click. (b) Full auto-generation on accept, with the bulk converters and server-side paths still excluded and the volume caps tightened hard. (c) Full auto on accept for Pro only, brief-first for everyone else.
- Rekomendacja: (a). This is the central bet and the one place a reasonable person could say I designed around your brief rather than to it. My case: the brief delivers the feeling you described (nothing blank, nothing waiting) at ~6% of the cost, it produces the artifact that actually defends against the scaled-content risk, and the article is one visible click away. But the honest cost: brief-first demos worse. 'It wrote the whole article while you watched' beats 'it wrote a plan' on a beta call, and for a solo founder selling a private beta that matters. If demo impact is what you're optimising for right now, (c) is the defensible compromise — but choose it knowingly rather than have me pretend the tradeoff isn't there.

**85 or 90?**

- Opcje: (a) 85, matching the product's existing deriveRecommendation. (b) 90, after fixing the evaluator's inputs, if measurement shows it's reachable at K=2.
- Rekomendacja: (a), with a measurement escape hatch. 85 is the bar your own code already publishes. But nobody has ever measured the actual score distribution on real drafts — so before increment 5 locks the number, score 20 real production assets through the existing owner-only evaluation route and record run-to-run variance on identical input. If the median plateaus at 84, 85 is generous. If it comes in at 88 after the evaluator fixes, my argument weakens a lot and 90 is cheap. Let the data settle it rather than either of our intuitions.

**Two counters (Sparks and Forges) or one?**

- Opcje: (a) Two, with plain-language names ('briefs' and 'articles'). (b) One 'generation' counter where a Forge costs 13 units. (c) One counter denominated in articles, with briefs enforced silently below a generous ceiling.
- Rekomendacja: (c). 'You have 140 Sparks and 3 articles left' is not a sentence a massage-studio owner parses, and she will feel cheated hitting the article wall with a big brief number on screen. Since a brief is 1/13th the cost, the honest simplification is to count only what's expensive: show one number — articles remaining — and enforce the brief ceiling silently as an abuse guard she'll never reach in normal use. Keep both counters in the database; show one in the UI.

**How much does a Forge failure cost the user?**

- Opcje: (a) One article credit regardless of outcome — Milo eats the $0.0386-to-$0.1207 variance. (b) Refund if the draft lands below threshold. (c) Refund only if no AI call fired.
- Rekomendacja: (a), with (c) as the exception. One predictable unit is worth more than perfect cost recovery — 'what did that cost me' must have exactly one answer. But it will generate a support conversation the first time someone pays a credit for a 78, so the failure copy has to carry real weight: name the weak categories, show the improvement path, and make 'improve this yourself' an obvious next step rather than a dead end.

**Do we cap how many articles a single customer can publish to their own domain per month, even when they ask for more?**

- Opcje: (a) Yes — a per-project publish cap of max(4, ~20% of indexed pages), with a slower ramp on newly connected domains. (b) No — the plan's Forge counter is the only limit. (c) Yes, but overridable with an explicit acknowledgement.
- Rekomendacja: (a). Your customer is a Malmö studio with one domain and nobody reading Search Console; a 2% chance of deindexing is a 2% chance of an ended business, not a portfolio cost. Every competitor priced for this volume is priced for agencies spreading risk across many domains — and the flagship bulk-AI product in this category rebranded away from the volume pitch five months after the March 2024 policy. Your margin (~$0.04/article against €79–299) genuinely permits saying no. It will be a hard, repeated support conversation, and 'we refuse to write more for your site' reads as the tool overruling the person paying. Worth it.

**Do we publish an AI-use disclosure and a named human reviewer on articles?**

- Opcje: (a) Yes, on by default, customer can turn it off. (b) Off by default, opt-in. (c) Not built.
- Rekomendacja: (a). Google publishes the self-assessment questions verbatim and asks whether AI use is self-evident through disclosure and whether you explain how and why automation was used. Being able to answer yes on all three is a defence, not a disclaimer, and no competitor offers it. Default on, one toggle off, so the customer decides but the safe path is the lazy path.

**Before quota numbers are frozen, do we verify the Lovable gateway's markup over Google list price?**

- Opcje: (a) Yes, block the increment-3 quota numbers on reading a real Lovable statement. (b) Ship on the Google list floor and adjust later.
- Rekomendacja: (a), but it's an hour of work, not a blocker on the increment. Every cost figure here uses $0.50/$3.00 per 1M as a FLOOR. At 3x markup Starter goes from 0.7% to ~2.2% of revenue — still fine, so the architecture doesn't change either way. But the quota NUMBERS should be set against the real invoice, and it is the single largest uncertainty in the model.
