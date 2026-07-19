# Milo Growth — limit publikacji na domenę

Analiza 7-agentowa (4 kąty researchu + 2 adwokatów po przeciwnych stronach + decyzja). 2026-07-19.

Pytanie właściciela: ile artykułów miesięcznie na jedną domenę — sensownie, bez spamu i ryzyka.


## Odpowiedź

Cap publishing at 12 new URLs per domain per month on Growth and Pro, 8 on Starter, 0 on Free Preview — deliberately flat at the top, because the risk attaches to the customer's domain, not to their plan. Forge (articles written) stays exactly as advertised at 3 / 10 / 40 / 120 account-wide; the gap between written and published is intentional and is the thing to explain, not hide. Pair the monthly number with a rolling 7-day sub-cap of 4 per domain, an uncapped separate lane for refreshes to already-published URLs (metered at 20/month purely for abuse control), and a single cheap ramp rule: half rate for the first 30 days after a domain is connected.

## Per plan

| Plan | Cena | Artykuły PISANE (Forge, konto) | PUBLIKOWANE / domenę / mies. | Marża |
|---|---|---|---|---|
| Free Preview (freePreview) | 0 PLN / 0 SEK / 0 DKK / £0 / €0 | 3 Forge / month (unchanged, monthlyContentGenerations: 3) | **0 — publishing stays off (publishingEnabled: false, billing.ts)** | n/a — ~$0.60 of tokens per free account per month at worst; acceptable acquisition cost |
| Starter | 249 PLN / 799 SEK / 549 DKK / £69 / €79 per month | 10 Forge / month (unchanged, as advertised) | **8 new URLs per domain per month (1 website). Plus up to 20 refreshes/upserts to already-published URLs, which do not consume the publish cap.** | ~96-97%. Worst-case publish chain ~$0.18/article (generate 8000 tok + score + improve + rescore x2, gemini-3-flash), 10 articles = $1.80, plus ~$0.03 briefs and ~$0.30 generator sweeps = ~$2.15 against ~$63 (Poland) to ~$85 (EU) net revenue. |
| Growth | 599 PLN / 1499 SEK / 999 DKK / £129 / €149 per month | 40 Forge / month account-wide (unchanged, as advertised) | **12 new URLs per domain per month, up to 3 domains (36 account maximum, but never poolable onto one domain). Plus 20 refreshes per domain, uncapped against the publish counter.** | ~94-95%. 40 articles x $0.18 = $7.20 plus ~$1.50 briefs/audits/sweeps = ~$8.70 against ~$150 (Poland) to ~$160 (EU). |
| Pro | 1199 PLN / 2999 SEK / 1999 DKK / £249 / €299 per month | 120 Forge / month account-wide (unchanged, as advertised) | **12 new URLs per domain per month — the SAME number as Growth — up to 5 domains (60 account maximum). Plus 20 refreshes per domain.** | ~91-92%. 120 articles x $0.18 = $21.60 plus ~$4 overhead = ~$25.60 against ~$290 (Poland) to ~$320 (EU). |

### Uzasadnienia


**Free Preview (freePreview)** — Already correct and needs no change. Free Preview is evaluation: audit, opportunities, briefs, one or two Forged drafts to prove quality, export only. Nothing machine-written reaches a live domain until someone is paying and has agreed to the terms. This is also the only tier where the cap is a hard product boundary rather than a judgement call.

**Starter** — 8 is one publish roughly every 3-4 days, which is exactly the cadence Milo's own calendar planner already prescribes to customers (ai.functions.ts:1509 — 'every 3-5 days, no clustering on one date'). Shipping a Starter cap the planner contradicts is the fastest way to make the product look incoherent. 8 also sits at or above every current primary source for a single-location small business: HubSpot's live guidance is 6-8/month for a new blog and 2-4 for complex niches (the old '11+ posts = 3x traffic' stat has been retired by HubSpot itself), and practitioner consensus is 2-4. Synergy Massage will realistically publish 2-4 and never feel this. Deliberately set 2 below the written allowance rather than 4: a Starter customer who writes 10 and can publish only 4 feels cheated; 10 written / 8 published reads as honest headroom for drafts that miss the 85 threshold.

**Growth** — 12 is the top of the band Milo's own planner calls sensible, and it is the knee of the frequency curve in every dataset that still exists. It gives Butelki Wodorowe — an ecommerce shop with a genuinely larger topic well (100-200 topics across product lines x buying guide / comparison / problem / maintenance) — real room without ever approaching a risk envelope. The 40 written credits then do what they should: cover rejected drafts, multi-site allocation across 3 domains, and rewrites. Growth's upgrade value over Starter is 3 domains and 4x the writing, not 4x the pressure on one site.

**Pro** — This is the one number I expect to be argued with, and it is the most important one. Pro is bought by freelancers and small agencies. Their value is breadth — 5 client domains, AI Evaluation, higher audit and GSC limits, priority support — not permission to push harder on any single client's site. A per-domain publish rate is the one limit in this product that must not ladder with price, because raising it does not sell the customer more capability, it sells them more risk, and on Pro that risk lands on a third party (the agency's client) who never saw the pricing page. Holding Pro flat at 12 also removes the incentive for an agency to buy Pro and point all 5 project slots at one domain. Note Pro still gets 120 written credits: an agency legitimately writes far more than it publishes, across 5 sites, with rejects.

## Rampa dla nowych domen

Yes, ramp — but only the cheapest possible version, and only one rule.

THE RULE: for the first 30 days after a domain is connected, the cap is half the tier number, rounded down. Starter 4, Growth 6, Pro 6. Full rate from day 31. One timestamp (domain_connected_at), one boolean comparison, no ongoing state.

WHAT I REJECTED AND WHY. The research floats a relative ramp — month 1 cap = max(4, 25% of indexed pages), rising 50%/month to the tier ceiling. The reasoning behind it is the best-evidenced thing in the whole pack: the variable every documented enforcement case shares is the RATIO of scaled content to genuine first-party content, not the monthly count. Synergy Massage has ~12 real pages; 12 articles in month one doubles the site. I take that seriously and I am still not building it, for three reasons. (1) It requires a reliable indexed-page count per domain, which means a GSC dependency Milo cannot guarantee — GSC Lite exists but connection is optional, and a cap that silently fails open when GSC is missing is worse than no cap. (2) A percentage rule punishes exactly the customer who most needs the product: a 6-page site gets a cap of 4 forever while a 300-page site gets 12 immediately, which inverts the intuition every customer will have about fairness. (3) A cap whose number changes every month cannot be explained in one sentence to a massage therapist, and an unexplainable cap generates the support load that kills a solo-founder product.

The flat 30-day half-rate captures most of the ratio benefit at a fraction of the complexity: it prevents an 80-100% overnight content expansion on a brand-new or freshly-rebuilt site, it costs the customer literally nothing in speed-of-learning (Ahrefs: 1.74% of new URLs reach top 10 within a year, and those that rank mostly take 61-182 days, so nothing is measurable inside the ramp window anyway), and it is one line of copy.

BE HONEST INTERNALLY ABOUT WHAT THIS IS. Google has never documented a spike detector, John Mueller has said publishing frequency alone does not make something spam, and Google denies a new-domain sandbox. The 'ramp slowly on a new site' advice is community folklore. I am shipping it because it is nearly free, because the failure mode is unrecoverable (publishing is upsert-only, there is no unpublish), and because a new site's first 30 days are when an enthusiastic owner is most likely to dump their whole allowance. Do not write 'Google requires this' anywhere in the codebase or the UI.

A five-year-old 300-page site and a two-week-old 8-page site do end up at the same steady-state number after 30 days. That is a deliberate accepted imprecision, and it is the right trade at four customers.

## Co się dzieje przy limicie

Three distinct states, three distinct screens. None of them is an upgrade prompt. The primary action in every case is the genuinely better SEO action.

--- STATE 1: MONTHLY CAP REACHED ---

Heading: You've published 12 articles to synergymassage.se this month

Body: That's this site's monthly limit. It resets on 1 August.

This isn't a billing limit. You still have 28 writing credits, and you can keep researching, writing, editing and scheduling — this only stops new articles going live on this site.

Why we cap it: Google doesn't rank a site higher for publishing more. It ranks pages that say something new. Twelve genuinely useful articles a month is already more than most businesses have genuinely new things to say — past that, articles start repeating each other and competing with your own pages for the same searches. That competition is real and it costs you rankings you already have.

There's also nothing to learn yet. New pages usually take two to six months to settle in Google. Your last twelve haven't been judged. Right now the highest-value thing you can do is improve what's already live — and that doesn't count against this limit.

[ Improve a published article ]  (primary)
[ Schedule for 1 August ]  (secondary)
Something wrong here? Tell us about your site →  (text link)

--- STATE 2: 7-DAY VELOCITY SUB-CAP REACHED (4 in a rolling week) ---

Heading: Four articles went live on this site in the last 7 days

Body: The next one can publish on Tuesday 22 July. You've still got 6 of this month's 12 left.

Milo spaces publishing out on purpose. A site that posts four articles on a Tuesday and then nothing for three weeks reads as automated — because it is. Spread over the month, the same twelve articles read as a business that writes.

Your queue is safe; we'll publish the next one automatically on the 22nd unless you change it.

[ Keep the schedule ]  (primary)
[ Change publish dates ]  (secondary)

--- STATE 3: NEW-DOMAIN RAMP ACTIVE ---

Heading: synergymassage.se is new to Milo — we're starting at half speed

Body: 6 articles this month instead of 12. Full rate from 12 August.

Your site has 11 pages right now. Adding twelve in one month would make most of it brand new content that Google has never seen from you — a shape that invites a closer look you don't need. Six is a growth curve; twelve on an eleven-page site is a relaunch.

You'd also learn nothing faster. Nothing you publish this month will show its true position in search before roughly October.

[ Got it ]  (primary)
Why does this matter? →  (text link)

--- COPY RULES FOR WHOEVER WRITES THE REST ---
1. Never say 'Google's limit', 'Google requires', or 'to stay compliant'. No such published limit exists. If a customer later discovers we invented policy, every other number in the product becomes suspect.
2. Never show 'Upgrade' as the primary button on a publish-cap screen. The publish cap is not an upsell — see overrideStory. An upgrade button here teaches the customer that the limit is about money, which makes the safety framing a lie.
3. Always name the site and always name the reset date. 'Limit reached' with no date is the single most infuriating pattern in SaaS.
4. Always show what they CAN still do in the same breath. Refreshes, writing, scheduling, exporting are all still open.
5. Surface the count before it bites: a quiet line on the publish button from article 9 onward — '9 of 12 published to this site this month' — so the wall is never a surprise. But do not make it a progress bar. A progress bar reads as a target to fill.

## Ścieżka odstępstwa

Yes, there is a real override, and it is deliberately not self-serve.

MECHANISM: a per-domain override field on the workspace record — publish_cap_override: { domain, monthlyLimit, expiresAt, grantedBy, reason } — settable only by an owner-role account (the role already exists per pricing.ts comments). Ceiling of 20/month, expiry of 90 days, then it lapses back to the tier number rather than renewing silently.

TRIGGER: the 'Something wrong here? Tell us about your site' link on the cap screen opens a short form — how many pages the site has today, what they want to publish that they can't, and a link to the last three published articles. That routes to the founder, not to a queue. Two legitimate cases will come through it and both deserve a yes: (a) an established ecommerce site (Butelki Wodorowe's shape — 100+ existing pages, a genuinely large topic well, buying guides and category pages rather than blog filler), and (b) a Pro agency doing a one-time foundation build on a client site that was just rebuilt.

WHY NOT SELF-SERVE, AND WHY NOT AN ADD-ON: every other limit in this product can be an upsell. This one cannot, because raising it transfers unrecoverable risk (there is no unpublish) onto a customer who cannot detect the damage — they can't read Search Console, that's why they bought Milo. The moment the higher number is purchasable, the product's answer to 'is 12 safe?' becomes 'depends what you paid', and the safety framing on the cap screen becomes marketing copy. That's the thing I'd most regret shipping.

THE HIDDEN BENEFIT: the override request is a founder-to-customer conversation with the single customer most likely to hurt themselves, at the exact moment they're motivated to talk. At four beta customers that's not a support cost, it's the best research channel in the product. Revisit the no-self-serve rule when the request volume exceeds roughly two per week — at that point the manual path is a real tax and the data to automate it exists.

WHAT AN OVERRIDE DOES NOT LIFT: the 7-day velocity sub-cap stays at 4, and the 30-day new-domain ramp stays. Those are cheap and the arguments for them don't weaken with site size.

## Dlaczego nie więcej

The strongest case for going higher — 12/20/30, the position I rejected — is genuinely strong and I want it recorded accurately rather than strawmanned.

Its best point: every documented casualty is two to four orders of magnitude away from anything we're discussing. Causal at ~1,800 AI articles, TailRide at 22,000, ZacJohnson.com at ~60,000. At 12/month a customer needs twelve and a half years to reach the smallest of those. Google's scaled content abuse policy contains no volume threshold at all — the operative test is purpose plus absence of value, 'many' is never quantified anywhere, and Google is on record that the policy applies equally to human-produced content. On that evidence the distance between 12 and 30 is invisible; both are noise. And the design already ships the actual risk control: an enforced 'What only you know' gate requiring a real price and a real client situation, an 85 quality threshold, two improve passes. The sharpest version of the argument is self-referential and it lands: if a cap never binds on an honest customer it protects nobody, and if it does bind it is blocking content that already cleared a first-party-knowledge gate and an 85 score.

Three reasons I still stopped at 12.

1. The cap is not a tripwire for abusers, it is the product's loudest statement about what good looks like. A non-marketer reads '30 remaining this month' as a target they paid for, not a ceiling. The failure I'm guarding against isn't the abuser — it's the earnest owner who decides to get their money's worth, fills the value gate with two throwaway sentences by article eleven, and finds out in month four that their service pages got demoted alongside the filler. The gate degrades under volume precisely because the credits are already paid for and the box is the last thing between the owner and the button. A gate that accepts filler is worse than no gate: it launders near-duplicates as differentiated and gives everyone downstream false confidence.

2. Cannibalisation, not deindexing, is the realistic harm — and it arrives long before any Google enforcement. A Malmö massage studio has maybe 6-10 service intents and ~30-60 genuinely distinct topics. Milo's own generators produce ~36 raw candidates per sweep, but audit, competitor-gap and AI-visibility are three readings of the same ten-page site and converge fast; three of them already de-dup against existing titles (ai.functions.ts:1147, :1261, :1996) because overlap is the expected failure, not the exception. At 30/month the well is dry in six weeks and what ships after that is four pages all chasing 'massage Malmö', splitting internal links and impressions between themselves. That is a slow, invisible, self-inflicted ranking loss with no Google penalty involved at all.

3. Milo's own planner already answered this. ai.functions.ts:1509 tells the calendar to space items every 3-5 days with no clustering — 6-10 a month. Selling 30 slots while the planner advises 8 makes the product contradict itself in writing, and that contradiction is the first support question we'd get.

What I concede to the high side: I dropped Pro from any premium at all rather than compromising upward, and I kept every advertised Forge number intact. Nothing anyone bought gets smaller.

## Dlaczego nie mniej

The strongest case for 4/6/8 is the human bottleneck, and it's the argument I found hardest to dismiss: a solo studio owner has maybe 4-6 genuinely distinct recent client stories in a month, so past roughly 6-8 articles the 'What only you know' gate stops being a gate and starts being a formality. Orbit Media 2025 (n=808) points the same way from the other end — effort per post predicts results, 6+ hours per post roughly doubles the odds of strong results, and the professional market is trending toward bi-weekly, not weekly. Combine that with the fact that no numeric limit in PLAN_LIMITS is enforced anywhere today (canUseFeature at billing.ts:332 has zero call sites), and the asymmetry is real: raising a cap later is a press release, lowering one is a broken promise and a churn event. Start low is the structurally correct instinct.

Why I landed above it anyway.

First, Starter at 4 creates a visible contradiction with a number we already advertise. Starter sells 10 written articles. Telling that customer they may publish 4 of 10 to their only website is a 60% haircut on the thing they think they bought, and 'nothing advertised was technically reduced' is a lawyer's answer, not a customer's. 8 published against 10 written is explainable in one sentence — some drafts won't clear 85. 4 against 10 is not.

Second, 4/6/8 is calibrated entirely to the single-location service business and there is more than one shape of customer here. Butelki Wodorowe is ecommerce with a 100-200 topic well across product lines, comparisons, buying guides and category pages. Capping that shop at 6 is a multi-year content plan and it would be the correct trigger for churn. The cap has to be the same shape for both customers or it becomes a support conversation every month.

Third, the gate-degradation claim — the load-bearing argument for 4/6/8 — is currently an inference, not a measurement. Grep for 'What only you know' across src/lib returns nothing; the gate isn't built yet. Setting the cap at the low end on the strength of an untested hypothesis about a feature that doesn't exist is not caution, it's guessing with extra confidence. 12 with instrumentation on the gate beats 6 without it, because 12 generates the data that would justify 6.

Fourth, the two modifiers I did adopt from the low side — the 7-day sub-cap of 4 and the 30-day half-rate ramp — kill the specific harm the low position actually cares about. The nightmare in that argument is a burst: publish-cron.server.ts:76 batches 20 due publishes per tick and autoPublishApproved has no human beat, so a monthly cap alone genuinely does permit the whole allowance landing on one Tuesday. 12/month delivered as max 4 per rolling week over four weeks is a materially different object from 12 in an afternoon, and it is not the object the low position is worried about.

Where I think the low side may simply be right and I'll find out: Starter at 8. If beta usage shows Starter customers routinely at 8 with visibly thinning 'What only you know' inputs, 6 is the correct number and I'd move it before touching Growth or Pro.

## Kiedy i jak to zrewidować

Four triggers, each with the evidence that fires it, in the order they'll realistically arrive. Ship the instrumentation with the cap — without it this decision can only ever be re-argued, never re-decided.

1. GATE QUALITY AT VOLUME — look at 60 days. This is the measurement that adjudicates the whole 6-vs-12 argument. For every brief, log: character count of the 'What only you know' fields, whether a numeric price is present, and cosine/near-duplicate similarity of the client-situation text against that user's previous 20 submissions. Then compare articles 1-6 in a month against articles 7-12 on those three measures. If duplicate-or-filler rate on articles 7-12 exceeds ~25%, the gate is not the rate limiter I'm assuming it is and the cap should drop to 6 on Growth/Pro and 6 on Starter. If there's no meaningful decay, the case for 16-20 on Growth opens up. Set the cap at whichever article number the duplicate rate crosses 25%.

2. OPPORTUNITY SUPPLY — look monthly, testable today. Run the full generator sweep for Synergy Massage and Butelki Wodorowe in months 1, 2 and 3 and count distinct non-overlapping publishable opportunities surviving the existing de-dup (ai.functions.ts:1147, :1261, :1996). If a service site still yields 12+ genuinely distinct on-site topics at month 3, my cannibalisation argument is weaker than I think and the number can rise. If it collapses to 4-5 by month 3 — which I expect for a ten-page studio — that is the honest signal to make the cap track measured supply per domain rather than a flat tier number. A supply-driven dynamic cap is a strictly better instrument than any fixed number, mine included, and it is the version of this I'd want in a year.

3. A PRE-PUBLISH OVERLAP CHECK SHIPPING — this makes the cap partly redundant, so raise it. If Milo starts comparing a candidate article's target query and content against every already-published URL on that domain and blocks or merges on overlap, then volume stops being a proxy for the risk I actually care about. At that point Growth/Pro can go to 16-20 with a clear conscience. Note these are substitutes, not complements: build the check and you can afford the higher number, which makes the check a better investment than any further argument about the cap.

4. GOOGLE CHANGES THE RULES — watch the Search Central blog RSS and the ranking-updates dashboard. Nothing has changed since March 2024; the March and June 2026 spam updates shipped with no companion post and no new categories. If Google ever quantifies 'many pages', or ships velocity guidance, reset to whatever it says immediately and say so publicly in the changelog. Equally: if a named enforcement case ever surfaces at under ~30 AI-assisted on-topic articles/month on a first-party domain, the whole 'orders of magnitude away' framing collapses and everything should tighten. None exists today; I looked.

WHAT SHOULD NOT MOVE THIS NUMBER: more SEO-blog consensus, a competitor allowing more (Byword's 300 and Koala's effectively-unlimited are portfolio-operator tools that externalise domain risk onto the buyer — they're the anti-benchmark), a tier needing a differentiator, or margin permitting it. At 91-97% gross across every tier there is zero economic pressure in either direction, which is exactly why this number must be argued on the customer's domain and nothing else.

DIARY ENTRY: revisit at 60 days post-launch with the gate data, then quarterly.

## Uwagi wdrożeniowe

WHERE THE NUMBER LIVES. New field monthlyPublishesPerDomain on the PlanLimits interface (src/lib/billing.ts:25-42), values 0 / 8 / 12 / 12 in PLAN_LIMITS (billing.ts:165-238). Plus monthlyRefreshesPerDomain 0 / 20 / 20 / 20 and weeklyPublishesPerDomain 0 / 4 / 4 / 4. Critically, monthlyContentGenerations (3/10/40/120) is untouched — it becomes the Forge/written allowance exactly as already advertised on the pricing page and billing page. No advertised number goes down, which is the whole reason this is shippable to customers already in private beta.

WHAT IDENTIFIES A DOMAIN — this is the part that's easy to get wrong. Key the counter on a NORMALIZED HOSTNAME, never on projectId. addProject (src/lib/store.ts:515-521) checks only the project count and has no uniqueness check on websiteUrl or on any connector domain, so a Pro user points all 5 project slots at one WordPress site and multiplies any per-project cap 5x. Derive the key server-side from the connector config per project.connectorType (src/lib/types.ts:217): host of wordpress.siteUrl (types.ts:128), shopify.shopDomain (types.ts:152), or host of livePublishEndpoint. Normalize: lowercase, strip www., strip port, punycode. Sum across every project in the workspace. Consider also blocking two projects resolving to the same normalized host at creation time — cheaper than reconciling counters later.

SECURITY FIX THAT MUST SHIP FIRST OR THE CAP IS THEATRE. publishLiveFn (src/lib/publish.functions.ts:259-262) takes the target endpoint straight off the client payload — PublishLiveInputSchema (:150-158) accepts endpoint and secret as plain strings and publishLiveDirect (:167-174) POSTs to whatever it is handed, without ever re-reading the project. If the domain key comes from the request, a user rotates the endpoint string and the counter never trips. Change the handler to load the project from the workspace blob and derive the domain there, the way publish.server.ts:144 already does via findAssetAndProject. Fix this regardless of the cap: today a user can make Milo POST their own publish secret to any host they name.

COUNTER MECHANICS. Increment inside the SAME rev-guarded mutateWorkspace transaction that records applyPublishSuccess (src/lib/publish.server.ts:172-184). That makes the count exactly as reliable as the publish record and immune to double-counting on retry. Store per domain: { yyyymm, newUrls, refreshes, recentPublishTimestamps[], connectedAt }. Distinguish new-URL publishes from upserts by whether the asset already has a recorded live URL on that domain — refreshes must NOT consume the publish cap, or the product actively pushes customers toward net-new filler instead of the highest-ROI action available to a small site.

ENFORCEMENT POINTS — all four, or scheduled publishing walks straight past it: publishLiveFn (publish.functions.ts:259), publishWordPressContentFn (wordpress.functions.ts:228), publishShopifyContentFn (shopify.functions.ts:233), and the cron path publishAssetServerSide (publish.server.ts:134). The client orchestration in mock-ai.ts:1674-1727 is cosmetic — enforce there too for UX, but it is not the gate. Note publish-cron.server.ts:76 runs runScheduledPublishes(batchSize = 20): the weekly sub-cap must be evaluated per item inside the batch loop, not once per tick, and an item blocked by the sub-cap should be rescheduled forward rather than failed.

INTERACTION WITH THE AGREED METERING FROM INCREMENT 3. The publish cap is a second, independent counter downstream of Forge metering, and the ordering matters: Forge decrements on write, publish decrements on live. A customer can therefore have Forge credits and no publish headroom (the Starter 10/8 case, by design) — the UI must never conflate the two, because 'you have 28 credits left but can't publish' is only a coherent message if both numbers are visible in the same place. Put both on the project header: 'Written 14 of 40 · Published 12 of 12 to this site'. canUseFeature (billing.ts:332) currently passes any numeric limit for being > 0 and has zero call sites; the publish check should not go through it — write a dedicated checkPublishAllowance(userId, domain) that returns a discriminated result ({ ok } | { blocked: 'monthly' | 'weekly' | 'ramp' | 'plan', resetsOn, current, limit }) so the three UI states in whatHappensAtTheLimit can be rendered from the server's answer rather than re-derived client-side.

RAMP: single field domainConnectedAt on the counter record; if now - connectedAt < 30 days, effective cap = floor(tierCap / 2). No other state.

HOUSEKEEPING: delete src/lib/pricing.ts. It is unimported dead code (grep 'lib/pricing' across src returns nothing; src/routes/pricing.tsx imports from lib/billing) carrying a contradictory 3-tier price list at 149/249 PLN against the real 249/599/1199, plus a stale MAX_PROJECTS_PER_USER. Anyone sizing the next limit against it will be wrong by 2.5x.

ALSO WORTH FLAGGING TO THE OWNER, OUTSIDE THIS DECISION: the named human reviewer on the AI disclosure must be a real, consenting person with a real bio page. A fabricated reviewer byline is a larger reputational and possibly legal risk than the entire volume question, and Google's own guidance explicitly warns against giving AI an author byline.

## Stanowiska adwokatów (dla zapisu)


**The per-domain publish cap should be set at the top of the honestly defensible range — 12 / 20 / 30 new URLs per domain per month for Starter / Growth / Pro, with refreshes uncapped and no monthly ramp. The opposing proposals (4/8/12, or 8/12/16) are not risk management; they are a product downgrade dressed as safety, and they will be experienced by paying customers as Milo refusing to let them publish their own content on their own site.** — proponowane liczby: NEW URLs PUBLISHED PER NORMALIZED DOMAIN PER CALENDAR MONTH (new field `monthlyPublishesPerDomain` in PLAN_LIMITS, src/lib/billing.ts):

- freePreview: 0 (unchanged — `publishingEnabled: false`)
- starter (249 PLN / 799 SEK / 549 DKK / £69 / €79): 12
- growth (599 PLN / 1499 SEK / 999 DKK / £129 / €149): 20 per domain, up to 3 domains
- pro (1199 PLN / 2999 SEK / 1999 DKK / £249 / €299): 30 per domain, up to 5 domains

UNCAPPED / SEPARATE: upserts to an already-published URL (refreshes and improvements). These add no indexable page. If a number is required for abuse-control, set it at 40/month all paid tiers — high enough never to bind.

VELOCITY GUARD (all tiers, conceded and supported): max 3 new URLs per domain per calendar day. This is the only limit with genuine evidence behind it and it neutralises the `publish-cron.server.ts:76` batchSize=20 burst vector.

NO monthly ramp. NO 14-day soak. NO relative percentage-of-indexed-pages cap. These are folklore by the research's own grading, and a percentage-of-existing-pages rule punishes precisely the customer who needs Milo most — the one with a 10-page site.

FORGE (articles written) stays exactly as advertised: 3 / 10 / 40 / 120. Do not cut it. The research's own margin analysis is ~96.6% gross at Poland Starter and ~92.5% at Poland Pro even on the worst-case 6-call publish chain, so there is zero economic reason to reduce it, and reducing an advertised number is the one change that guarantees churn.

Rationale for 12 / 20 / 30 specifically:
- 12 sits at the knee of the HubSpot frequency curve (0→11 posts/month ≈ 2.5x traffic), i.e. the last point where a marginal article still buys meaningful outcome. Starter should reach the knee, not stop short of it.
- 20 gives Growth's ecommerce customers room against a 100–200 topic well without ever approaching the risk envelope.
- 30 matches what Pro already advertises (120 generations ÷ 5 websites = 24/domain average) and gives agencies a per-client cadence they can sell.
- All three are 60x to 2000x below the smallest documented enforcement casualty.

**The per-domain publish cap is being set too high. Every number on the table (8/12/16, or even 4/8/12) is anchored to what abusers do rather than to what an honest single-domain small business can actually sustain. The cap should be 0 / 4 / 6 / 8 new URLs per domain per month (freePreview / starter / growth / pro), with a rolling 7-day sub-cap of 2 and a 60-day new-domain ramp at half. Refreshes to already-published URLs are metered separately and generously.** — proponowane liczby: NEW FIELD `monthlyPublishesPerDomain` in PlanLimits (src/lib/billing.ts), keyed on NORMALIZED CONNECTOR HOSTNAME, summed across all projects in the workspace — not projectId, because addProject() (store.ts:515-521) checks only count and never domain uniqueness, so a Pro user points 5 projects at one WordPress site and multiplies any per-project cap 5x.

NEW URLs PUBLISHED PER DOMAIN PER CALENDAR MONTH:
- freePreview (0): 0 — already correct, publishingEnabled:false at billing.ts:176
- starter (249 PLN / 799 SEK / £69 / €79): 4
- growth (599 PLN / 1499 SEK / £129 / €149): 6 per domain, up to 3 domains (18 account total)
- pro (1199 PLN / 2999 SEK / £249 / €299): 8 per domain, up to 5 domains (40 account total)

Justification of each: 4 is the practitioner consensus for a single-location local business AND HubSpot's own current advice (2-4 for complex niches, 6-8 for a brand-new blog). 8 is the top of the band Milo's own planner already prescribes (3-5 day cadence = 6-10/month, ai.functions.ts:1509). 6 sits between. Nothing here is invented — every number is inside a band the research or the codebase already states.

MANDATORY MODIFIERS (the monthly number alone does not deliver safety):
- Rolling 7-day sub-cap: 2 per domain, all tiers. publish-cron.server.ts:76 batches 20 due publishes per tick and autoPublishApproved has no human beat — a monthly cap alone permits the entire allowance landing on one Tuesday, which is the visual fingerprint of every documented disaster. Lily Ray's 2026 analysis is explicit that velocity is its own footprint.
- New-domain ramp: first 60 days after a domain is connected, half the tier cap (Starter 2, Growth 3, Pro 4). synergymassage.se has ~10 pages; 8 new pages in month one is an 80% overnight content expansion. Ahrefs says nothing is measurable before 60-180 days anyway, so the ramp costs the customer zero speed-of-learning.
- Topical-coherence gate: refuse to Forge opportunities outside the project's Brand Intelligence profile. Google's own warning signs name "lots of content on many different topics" and "extensive automation to produce content on many topics" — this is better-evidenced than any number, and it is the only real mitigation for the agency use case under site-reputation-abuse.

NOT COUNTED AGAINST THE CAP:
- Upserts to an already-published URL (refreshes). Meter separately at 15/month, all paid tiers. Refreshing is the highest-ROI action for a small site (Orbit Media 2025; HubSpot's current guidance leads with it), adds no indexable page, and carries no cannibalisation risk. If refreshes consumed the cap we would actively push customers toward net-new filler — the exact opposite of the intent.

FORGE (articles written), account-wide: leave monthlyContentGenerations at 3/10/40/120 exactly as advertised. Nothing sold gets cut; the gap is honest headroom for drafts that miss 85, improve passes, and rejected pieces. Frame it in the UI as "you write more than you publish — that's the point."

MUST SHIP WITH THE CAP OR IT IS THEATRE:
- publishLiveFn (publish.functions.ts:259) must stop trusting the client-supplied `endpoint` and re-read the project server-side the way publish.server.ts:144 does via findAssetAndProject. Otherwise the domain key is spoofable and the counter never trips. Worth fixing regardless — today a user can make Milo POST their publish secret to any host they name.
- Increment the counter inside the same rev-guarded mutateWorkspace transaction as applyPublishSuccess (publish.server.ts:173-184), so it cannot drift on retry.
- Enforce in all four chokepoints including the cron runner (publish.functions.ts:259, wordpress.functions.ts:228, shopify.functions.ts:233, publish.server.ts:134). The client path in mock-ai.ts:1674 is cosmetic.
- Delete src/lib/pricing.ts. It is unimported dead code with a contradictory price list (149/249 PLN vs the real 249/599/1199) and will mislead whoever sizes the next limit.
