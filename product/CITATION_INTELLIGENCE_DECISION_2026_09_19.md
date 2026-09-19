# Citation Intelligence — decision memo (Assignment B)

**Author:** Claude (research/design), under the owner-approved working agreement of 19 September 2026. A Codex primary re-verification pass ran the same day; overstatements from the first draft were retracted. The itemised retraction history is kept as a **separate reviewer record**, not repeated here.
**Owns:** this file only. No code, config, migration, git mutation, production, paid API, consumer collection, benchmark, message, credential or new channel was created.
**Date / sources checked:** 19 September 2026.
**Status:** research and design — **not** production acceptance, provider approval, a launch-scope change, or authority to spend. Accepted **D03 v1** (14 Sep 2026 — spec at [`product/CITATION_INTELLIGENCE_SPEC.md`](https://github.com/rafalandersen-dev/andersen-visibility-engine/blob/37bef2aa917e7bc0688324548c6e5d6d2356da91/product/CITATION_INTELLIGENCE_SPEC.md), commit `37bef2aa917e7bc0688324548c6e5d6d2356da91`) remains the launch boundary; public paid launch stays **NO-GO**. That spec file is **not on this branch or main** — it is held in **PR137** pending integration; every `spec §…` reference below points to that exact held blob, and citing it does **not** copy the spec here nor imply PR137's code is released. The **USD 50/month** global AI-spend ceiling (an AI cap, **not** a total vendor budget) and the manual-budget-for-free-accounts prerequisite are preserved. The existing spec requirement/risk register **R00–R24 remains in force in full**; nothing here supersedes or drops it.

> Integration note (Codex, 19 September): the five original corrections below passed local integration tests but the next independent code review raised five additional edge cases (destination identity, failed/truncated outcomes, location methodology, historical retest timing, GSC timezone). These are assigned to Claude; PR137 remains held. Competitor page silence and unlinked third-party study figures are not accepted as proof of feature absence or market advantage. The combined implementation plan governs decisions.

## 0. Release blockers I must not touch

Five data-integrity corrections owned by the separate Claude in `/tmp/milo-citation-review-20260919` are the PR137 release blockers: **native claimed-value/raw consistency (4053415299)**, **answer prompt-version binding (4053415302)**, **model/search methodology (4053415303)**, **baseline-evidence requirement (4053415305)**, and the **panel/client/substantive-change gate (4053415306)**. I do not fix, replace or duplicate their code; §7 states the invariant each recommendation must not break. Research does not close their gate.

---

## 1. Decisive findings (checked 19 Sep 2026)

**a. Both native reports have launched broadly — a product-launch fact, not verified Synergy-data availability.**
- Google's *Generative AI performance report (Search)* [N1]: **impressions only**; dimensions **page/country/device/date**; **no queries, no clicks**; **Pacific-Time** dating; `~`/`-` cells **export as `0`**; canonical-URL attribution; 1,000-row tables; covers AI Overviews + AI Mode (Discover separate). Zero-export ambiguity is explicit in the primary. Rollout announced in the Search Central blog [N2].
- Bing's *AI Visibility Insights* in Webmaster Tools [N3], published **16 June 2026**, adds **Intents**, **Topics**, **Citation Share**, and **Compare**. **Citation Share** = "the percentage of citations attributed to your site out of all citations shown across all sites for that same grounding query"; it **does not expose competitor domains or represent traffic share** and is observational. Scope spans "Microsoft Copilot, Bing, and select partner AI experiences." It is **rolling out in preview globally**. The announcement **does not describe an export or API** — reinforcing §7 (no real export → no settled import mapping yet). No account-availability claim is made.

**D03's "where available" stands exactly.** A worldwide launch does **not** prove the report is populated for the Synergy property/account/market, nor how often cells return `unavailable`/`preliminary`/`unknown_export_zero`. Those states stay possible and unquantified until a real Synergy export exists. Spec §3/§4.1 semantics still match the primaries; no schema change.

**b. Consumer vs API is a method distinction; the EEA consumer terms are now verified, the account contract is not.**
OpenAI's **EEA consumer** Terms of Use [C2] (openai.com/policies/eu-terms-of-use/, **updated 16 Jan 2026**, Codex primary): lines **24–27** apply these terms to EEA **individual/consumer** services and route **business** use to OpenAI's **Business/Service Terms**; lines **57–69** include a restriction on **automated/programmatic extraction** of the services/Output. Synergy is in **Sweden (EEA)**, so the EEA consumer restriction is now verified as the applicable consumer text (the general terms [C1] carry the same programmatic-extraction restriction). **Synergy's actual account/business contract was not inspected** — so **no blanket cross-account compliance claim** is made. Safe statement: v1 observes consumer answers **manually** and runs **no scripted consumer-UI capture**. That is an honest method description — not a legal opinion, not a compliance certificate, not a claim that any/all API access is "sanctioned," and not a claim that competitors "violate" terms.

**c. Current competitive assessment (official pages; advertised/documented, none tested working).**
Evidence levels: *announced ≠ advertised ≠ documented ≠ demonstrated.* I observed **no** feature actually working.

| Tool (official page) | AI surfaces (advertised) | Monitoring / data-source scope | Factual-accuracy verification | Content **execution** | Evidence |
| --- | --- | --- | --- | --- | --- |
| **Profound** [P1] | Many engines | Citation/competitive monitoring, Brand Records | **Advertised** (AI-claim accuracy) + roadmap "upcoming" | **Documented**: KB + Brand-Kit → LLM → article → CMS-publish; agents | advertised + documented, not tested |
| **Peec AI** [P3] | ChatGPT, Perplexity, Gemini | Visibility/Position/Sentiment; key-source analysis + strategy recommendations; API/Looker export | Not advertised | Recommendations only (no publish) | advertised |
| **Otterly.ai** [P4] | ChatGPT, Google AIO + AI Mode, Perplexity, Copilot, Gemini, Claude API | "Content Intelligence Platform"; prompt research, search analytics, Content Audit, GEO recommendations | Not advertised | Recommendations ("Optimize once. Get cited everywhere"), not publish | advertised; **$29/mo** advertised on homepage |
| **Scrunch AI** [P5] | ChatGPT, Perplexity, Claude, Gemini, Copilot | Prompt/topic/entity tracking, citation analysis, **AI-bot crawl feed**, benchmark by competitor/persona/topic/geo | Not advertised (crawl **error detection**, not fact-check) | Agent Experience Platform (machine-readable pages) + optimization guidance | advertised |

**Read:** several tools advertise citation/share monitoring plus optimization recommendations across many engines; **only Profound** officially advertises factual-claim accuracy verification **and** documents a monitor→produce→**publish** loop, so neither the "closed loop" nor "accuracy" is unique. The honest **remaining** hypotheses (unproven; §5) are narrower and none claims a competitor *cannot* match them: (i) **lower owner effort** to an executed, destination-verified fix; (ii) **affordable local-/Swedish-language quality** at the USD 50 ceiling (conditional on §1d); (iii) **provenance completeness** — never collapsing the five signals of §2. A **matched competitor trial** remains **future/owner-dependent**; the present panel cannot validate a competitive win.

**d. Local/smaller-language weakness is conditional motivating evidence, not a universal law, and not yet observed for Synergy.**
A vendor study [S1] (Temso AI, early 2026: ~7M citations, 350k responses, 4 models, 7 languages) reports smaller-language English-source intrusion — Swedish on Grok cited 47.1% Swedish vs 43.7% English sources, a 34-point local-language spread across models — **yet the same data shows Google AI Overviews at 85.4% local-language**, so the gap is surface-dependent. A third-party US study [S2, S3] (Whitespark, May 2025, 540 queries) found AI Overviews on 68% of local queries, ~60% citations to third-party publishers. These are **vendor/third-party, partly US, partly pre-2026, model/vertical-specific**: they **motivate** a hypothesis; they do **not** establish general weakness, and **nothing may be extrapolated to Malmö/Synergy before a pilot.**

---

## 2. Provenance map — five signals, five meanings (integration requirement)

The core category risk is collapsing distinct signals into one number. This contract every view/export/finding must honour extends spec §4.1 with the API and bot-log rows.

| Signal | What it actually is | Can establish | Must never claim |
| --- | --- | --- | --- |
| **GSC gen-AI report** | Publisher-side impressions of *your* pages in AI Overviews/AI Mode [N1] | Native-reported page appearance for its scope | The question, answer text, a citation, a recommendation, or a visit |
| **Bing AI Visibility / Citation Share** | Provider-reported citation share per grounding query [N3] | Native-reported citation for its stated scope | Competitor identity, traffic share, or the exact user prompt |
| **Consumer-service answer (manual)** | One human-observed answer on one surface (spec §5) | Mention/citation/recommendation *in that captured answer* | Population visibility, ranking, causality; an **API result is not a substitute** |
| **Provider/collector API output** | Programmatic answer/citation estimates (out of v1) | What the API returned | Consumer-app output; EEA consumer terms restrict programmatic extraction and the account contract is uninspected [C2]; not in v1 |
| **Referral traffic (`ai_referrer`)** | First-party sessions with an AI referrer | A labelled, undercounted referral session | Inference from a citation, impression or recommendation |
| **Bot / AI-crawler logs** (competitors' crawl feeds [P5]) | An AI crawler fetched a URL | That a crawler fetched the page | **A bot visit is not a citation and not a recommendation** |

---

## 3. Recommendations

Each: **problem → evidence → delta → benefit → cost/tradeoff → acceptance test.** None relaxes D03 or adds automated collection; anything beyond D03 is a §6/§8 dependency.

**R1 — Describe the manual method honestly as *method*, not as a legal or marketing compliance claim.**
*Problem:* buyers ask "why don't you auto-track ChatGPT like the tools in §1c?" *Evidence:* EEA consumer terms restrict programmatic extraction [C2]; account contract uninspected (§1b); spec §5.2 already forbids automation inside Milo. *Delta:* one labelled report line — "answers are observed manually; Milo runs no scripted consumer-UI capture" — plus a `collection_method_class` field (`manual_consumer`, `native_import`; reserved `api_future`). A label, **not** a collector, **not** a compliance certificate. *Benefit:* honest; protects the owner's accounts. *Cost/tradeoff:* reads as "less coverage" to breadth-buyers; must **not** be marketed as "ToS-compliant" across services/accounts. *Acceptance test:* the report states the method with **no** legal claim and **no** automation control (extends CI11-T40). *Planned, not accepted.*

**R2 — Keep native reports as availability evidence and harden the no-data / preview states.**
*Problem:* owners import native files and expect a number; many cells are `~`/`-`/preliminary/empty. *Evidence:* GSC export-zero + PT dating [N1]; Bing preview + observational metric [N3]. *Delta:* no new schema — `interpretExportCell`, `resolveExportZero`, `nativePresence` already encode this; the delta is **UI/report copy** for `unknown_export_zero`, `preliminary`, "market scope not exposed," plus a display test. *Benefit:* prevents the most likely false claim ("you have zero AI citations"). *Cost/tradeoff:* more "unknown" states on screen — correct. *Acceptance test:* CI11-T04/T05/T09/T10 stay green; a preview/unknown state renders as text, never a zero chart.

**R3 — Position on the whole executed loop + local quality, *tested* — not on "only we can."**
*Problem:* entry-level counting is cheap; counts are not the differentiator. *Evidence:* competitors advertise counts/share and (Profound) document a publishing loop + accuracy [P1, P3–P5] (§1c) — the loop is not unique; the open question is owner effort, local quality, provenance honesty. *Delta:* none to scope — existing gap-family B and CI-3/CI-4 loop; the delta is *emphasis* plus §5 tests. *Benefit:* a story grounded in effort/local-quality/provenance **if the tests support it.** *Cost/tradeoff:* slower to demo than a counts dashboard; a hypothesis, not a proven moat. *Acceptance test:* a proof report shows a family-B finding → approved change → destination-verified receipt → dated re-test, never a blended "authority score" (spec §6.2, §10).

**R4 — *Propose* a review dimension for citation source-language and own-vs-third-party (not yet an accepted D03 must-have).**
*Problem:* Swedish local answers may lean on English/third-party sources [S1, S2] — where an SMB is invisible. *Evidence:* [S1, S2, S3], labelled/conditional (§1d). *Delta (proposed):* extend the human finding record (`citation-finding.ts`) with observed per-citation `source_language` (an **optional** manual field) and reuse the existing own/third-party classification — no fetch, no API. **Optional, not a silent launch requirement; proposed, not accepted into D03.** *Cost/priority:* seconds per captured citation **plus** real record/UI work (§7); priority **below** the PR137 fixes and R2. *Acceptance test (only if accepted):* a finding can record source-language descriptively; counts stay per-panel/per-surface and never blend with native aggregates.

---

## 4. Buy-vs-build note (not a purchase recommendation)

For the USD 50/month AI-spend studio: native GSC + Bing are **free to access where they exist** [N1–N3] — but free access ≠ "usable Synergy data is available" (§1a). v1 makes **no programmatic model calls**, so it incurs **no model-collection API cost** — but that is **not** "external cost = $0." Manual observation consumes **owner labour**, any **existing plan/subscription**, **storage**, and **opportunity cost**; any existing **execution/drafting API spend** counts **inside** the USD 50 cap and is **unknown, not zero**. USD 50 is an **AI cap, not a total vendor budget** — a future data subscription is **not** automatically "within $50." A competitor subscription buys breadth of engines and automation Milo deliberately does not run (§1c); Milo's wedge is the free native layer + a small manual panel + execution. Any purchase is a separate, owner-gated decision. Competitor prices are **unverified** except Otterly's **advertised** $29/mo homepage figure [P4]; Profound's old $99/$399 self-serve tiers are **not currently publicly listed** (absence ≠ discontinued).

---

## 5. Three advantage hypotheses — bounded, in-panel, descriptive tests

These use **only** the existing **40-observation** manual panel + native imports — **no** new data, subscription, or capture authority. Each measures a **legitimately observable outcome of Milo's own output**, with **prespecified success/failure and stated limits**, yielding **descriptive small-panel evidence only** — **not** a market comparison and **not** causal proof (preserving 4053415305). A **matched competitor trial** is a **future, owner-dependent** option; the present panel **cannot** validate a competitive win.

**T1 — Owner usefulness and effort of the closed loop.** *Measures:* per finding, whether it leads to an owner-approved change, and hands-on time to capture + record + review. *Prespecified:* success = ≥ X% judged useful **and** median hands-on time ≤ Y min/finding, X/Y fixed by the owner **before** the round; below either = fail and revise. *Limit:* one owner's judgement on one panel; not generalisable, not a competitor comparison.

**T2 — Provenance completeness of Milo's own findings.** *Measures:* the share of findings whose provenance row (§2) is fully/correctly recorded — no signal collapsed, no bot-visit sold as a citation. *Prespecified:* success = 100% correctly typed; **any** collapse = fail and fix. *Limit:* tests Milo's own discipline, not any competitor's compliance.

**T3 — Factual-error catch and action completion.** *Measures:* family-B factual errors surfaced, and how many reach a **verified in-scope improvement** (Gate A: approved change → destination-verified receipt) and then a **completed proof loop** (Gate B: + dated comparable re-test). *Prespecified:* success = every surfaced error either reaches Gate A **or** carries a recorded reason it did not; none left ambiguous. *Limit:* descriptive, small panel, no causal claim about downstream visibility.

---

## 6. Cost and owner-effort formulas (design facts, not measurements)

Fill variables from the real pilot. Each unit cost is a **measurement design, not a viability verdict**. Track **actual known costs + named unknowns**; **labour is dollarised only at an explicit owner-provided rate**, otherwise recorded as time.

- **v1 model-collection API cost = $0** (no provider/model calls; spec §9) — architectural, **not** total external cost. Labour, existing subscriptions, storage, opportunity cost, and any existing execution/drafting API spend (inside the USD 50 cap, **unknown**) sit outside this line, **including time lost to failed attempts.**
- **Owner effort per weekly round** `≈ Q·(t_capture + t_record) + t_review`, `Q = 10`; native import adds `t_import` at baseline and re-test only (spec §3.3, §5).
- **Cost per useful finding** `= owner_time_cost / useful_finding_count` (from T1).
- **Cost per verified in-scope improvement (Gate A)** `= (owner_time_cost + any_existing_paid_execution_within_$50) / verified_improvement_count`, where a **verified in-scope improvement = scoped finding + baseline identity + approved version + destination receipt.** It is **countable before a re-test**; a re-test is **not** required for Gate A; no causal claim.
- **Cost per completed proof loop (Gate B)** `= (same numerator) / completed_proof_loop_count`, where a **completed proof loop = a verified in-scope improvement + one dated comparable re-test.**
- **No break-even formula** — "value of breadth" is unmeasured, so buy-vs-build stays a **qualitative owner decision** until real pilot value numbers exist.

---

## 7. Integration requirements — delta from current Milo, preserving the five fixes

Reuse `ai_visibility_prompts` / `ai_answer_evidence` (caps 200/100; preflight capacity, spec §8).

**Honest scope note.** The manual + import path is **not** merely "copy/label." A real v1 needs a native-export **parser**, **column mapping**, **storage**, an **import endpoint**, and **review-flow/UI + human workflow** once genuine exports exist, plus **destination verification** and **re-test**. What v1 does **not** add is any automated **collector, adapter or scheduler** or any provider/consumer API. Missing real exports block **concrete column mapping and storage finalization specifically** — they do **not** forbid schema-independent workflow/review-flow design on paper, and they do **not** block all independent implementation. **No new UI is *accepted* into D03 here**; R4 is **proposed and optional**, never a silent launch requirement. **R00–R24 remain in force.**

Invariants the design must hold:

- **4053415299 (native claimed-value/raw):** R4's `source_language` attaches to the *capture/finding*, never a native cell; no interpreted value may be stored inconsistent with its raw/status in `native-ai-report.ts`.
- **4053415302 (prompt-version binding):** every capture and R4 review dimension references the immutable bound prompt version, never free text.
- **4053415303 (model/search methodology):** R1/R4 records keep surface/mode/model-unknown reproducibility fields; unknown backends stay unpooled.
- **4053415305 (baseline evidence):** owner-reported zero is context, not measured zero; §5–§6 make no causal before/after claim.
- **4053415306 (panel/client/substantive-change gate) — two gates, non-circular:** a **verified in-scope improvement** = scoped finding/baseline identity + approved version + destination receipt, **without** a re-test — this is the unit the gate counts toward its requirement of **two verified improvements before a follow-up comparable re-test**. A **completed proof loop** adds one **dated comparable re-test**. Defining the verified improvement **without** a re-test is deliberate: requiring a re-test inside the definition would be circular, since the follow-up re-test itself needs two prior verified improvements. Both gates tie to the **actual approved D03 decision**, not a bare `isVerifiedImprovement` return; **no** native+consumer signal blending.

---

## 8. Current v1 vs future extensions (explicit cost/timing dependencies)

| Item | v1 (accepted D03) | Future — separate owner-gated packet |
| --- | --- | --- |
| Consumer answers | one manual surface, 40 obs | more surfaces / automation → rights + cost + retention decision, **not** v1 |
| Native reports | GSC + Bing file import (parser/mapping/storage/UI), deterministic | GSC/Bing API connectors → OAuth + D8 cost-control |
| Multilingual/local | **proposed, optional** manual review dimension (R4), not yet accepted | automated multilingual monitoring → paid API budget + rights |
| Competitor data | labelled reference only; prices unverified except Otterly $29/mo advertised | any subscription → separate decision; **not** automatically within the USD 50 AI cap; matched trial future |

No future row is silently part of v1; none revives the removed three-surface floor.

---

## 9. Unknowns and next in-scope slice

**Unknowns (stated, not guessed):** Synergy's **OpenAI account/business contract** is uninspected — only the EEA consumer terms [C2] and general terms [C1] are verified (§1b). Genuine Synergy GSC/Bing exports and real owner-run consumer captures **do not exist yet**, so **concrete column mapping/storage are unsettled** (schema-independent workflow design may still be drafted; no universal "no UI" ban — §7); the Bing announcement describes **no export/API** [N3]. Profound's $99/$399 tiers are **not currently publicly listed** (≠ discontinued); Peec/Scrunch homepage prices were not shown. Whether the local-language weakness holds for **Malmö/Synergy is untested.** Competitor behaviour is **advertised/documented, not demonstrated.**

**Next in-scope slice (docs/design only, no execution):** (1) the parallel work lands the five PR137 fixes and the gate clears; (2) owner reviews Appendix A and locks one surface; (3) implement R2 (and, **if accepted**, R4) as **real parser/mapping/storage/import-endpoint/UI/review-flow** over existing records with deterministic tests — **not** copy-only; (4) real acceptance still requires genuine native files, real owner captures, a signed-in workflow, **two verified in-scope improvements** and **one completed proof loop (dated comparable re-test)** — planned tests are not real acceptance (spec §12).

---

## Source register (checked 19 September 2026; primary marked ✅ with verifier/date; third-party/vendor labelled)

| Ref | Source (clickable) | Type / checked | What was actually verified |
| --- | --- | --- | --- |
| N1 | GSC Help — *Generative AI performance report (Search)*, [support.google.com/webmasters/answer/16984139](https://support.google.com/webmasters/answer/16984139) | ✅ Official (Codex primary, 19 Sep 2026) | Impressions-only; page/country/device/date; no queries/clicks; PT; `~`/`-`→0; AIO + AI Mode; 1,000-row; canonical; zero-export ambiguity explicit |
| N2 | Google Search Central Blog (Jun 2026), [developers.google.com/search/blog/2026/06/gen-ai-performance-reports](https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports) | ✅ Official (Codex primary, 19 Sep 2026) | Report exists / rollout announced — a launch fact, **not** proof of Synergy data |
| N3 | Bing Blogs — *New AI Visibility Insights in Bing Webmaster Tools* (**16 Jun 2026**), [blogs.bing.com/search/June-2026/New-AI-Visibility-Insights-in-Bing-Webmaster-Tools-Intents-Topics-Citation-Share-Compare](https://blogs.bing.com/search/June-2026/New-AI-Visibility-Insights-in-Bing-Webmaster-Tools-Intents-Topics-Citation-Share-Compare) | ✅ Official (Claude primary, 19 Sep 2026) | Intents/Topics/Citation Share/Compare; Citation Share = %/grounding-query, no competitor domains, not traffic, observational; scope Copilot + Bing + partners; **preview rolling out globally**; **no export/API described** |
| C1 | OpenAI Terms of Use (general), [openai.com/policies/terms-of-use/](https://openai.com/policies/terms-of-use/) | ✅ Official (Codex primary, 19 Sep 2026) | Automated/programmatic extraction restricted; page routes EEA/CH/UK to Europe terms and business use to Business Terms |
| C2 | OpenAI EEA Terms of Use, [openai.com/policies/eu-terms-of-use/](https://openai.com/policies/eu-terms-of-use/) (**updated 16 Jan 2026**) | ✅ Official EEA **consumer** terms (Codex primary, 19 Sep 2026) — **account/business contract uninspected** | Lines 24–27: apply to EEA individual/consumer services, business use → Business Terms; lines 57–69: automated/programmatic extraction restriction. Applicable **consumer** text for Sweden; no cross-account compliance claim |
| P1 | Profound official — [homepage](https://www.tryprofound.com/), [KB help](https://help.tryprofound.com/articles/6325408893-using-knowledge-bases-with-other-profound-features), [2026 blog](https://www.tryprofound.com/blog/profound-2026) | ✅ Vendor pages (Codex primary, 19 Sep 2026) | **Advertises** accuracy verification, agents, Brand Records; **documents** KB + Brand-Kit → LLM → article → CMS; roadmap "upcoming" accuracy; $99/$399 **not currently listed** (≠ discontinued) |
| P3 | Peec AI official — [peec.ai](https://peec.ai/) | ✅ Vendor page (Claude primary, 19 Sep 2026) | Advertises ChatGPT/Perplexity/Gemini; Visibility/Position/Sentiment; key-source analysis + strategy recommendations; API/Looker export. No accuracy/fact-check; no publish. No price shown |
| P4 | Otterly.ai official — [otterly.ai](https://otterly.ai/) | ✅ Vendor page (Claude primary, 19 Sep 2026) | "Content Intelligence Platform"; ChatGPT/Google AIO+AI Mode/Perplexity/Copilot/Gemini/Claude API; Content Audit + GEO recommendations. **$29/mo advertised**. No accuracy/fact-check; no publish |
| P5 | Scrunch AI official — [scrunch.com](https://scrunch.com/) (from scrunchai.com 301) | ✅ Vendor page (Claude primary, 19 Sep 2026) | ChatGPT/Perplexity/Claude/Gemini/Copilot; prompt/topic/entity + citation analysis; AI-bot crawl feed; benchmark by competitor/persona/topic/geo; Agent Experience Platform. Crawl **error detection**, not fact-check. No price shown |
| S1 | Temso AI — *Lost in Translation* (early 2026) | **Vendor study — labelled, conditional** | Smaller-language English-source intrusion (Swedish 47.1% local vs 43.7% English on Grok); **also 85.4% local-language on Google AIO** → surface-dependent, not universal |
| S2 | Whitespark — AI Overviews in local search (May 2025, US) | Third-party — **US, pre-2026** | AIO on 68% of local queries; ~60% citations to third-party publishers |
| S3 | Local Falcon / Rankability | Third-party | Smaller businesses cited less (fewer third-party mentions) |

*Marketing/review claims are labelled, not treated as verified working behaviour or proof of uniqueness. Official terms are cited as summary, not legal advice; this memo proposes no circumvention and certifies no cross-service ToS compliance. The itemised correction/retraction history from the 19 Sep 2026 Codex pass is kept as a separate reviewer record.*
