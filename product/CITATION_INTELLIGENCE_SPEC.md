# Milo Growth — Citation Intelligence
## v1.1 — Native evidence, manual observations and verified improvements

**Specification:** CI-01, version 1.1  
**Prepared:** 14 September 2026  
**Product owner:** Rafal Andersen  
**Pilot:** Synergy Massage, Malmö, Sweden; Swedish-language manual panel  
**Canonical repository location:** `product/CITATION_INTELLIGENCE_SPEC.md`  
**Integration:** R10 / R11 / R16; reuse existing GSC, Plan, Studio, knowledge, permissions and reporting capabilities where applicable.  
**Repository:** `rafalandersen-dev/andersen-visibility-engine`  
**Reference main HEAD:** `27417bc8f4e8a7be7d3edb7371221a5d9e906da4`, commit dated 12 September 2026; confirmed through the repository connection during preparation. Reconcile with newer local work; never reset to this reference. [R1]  
**Status:** Owner-accepted scope reduction, prepared for implementation reconciliation. Not evidence of implementation, deployment, completed pilot, provider approval or public-launch readiness.

**Supersession:** This file replaces both v1.0 specification attachments and the scope/order of both earlier handoff messages in this conversation. The accompanying single v1.1 handoff is the only current handoff. The former three-provider acceptance floor and adapter-first delivery order are deliberately removed from the v1 milestone, not preserved as hidden dependencies. Broader capabilities remain separately sequenced work, not v1 acceptance conditions.

---

## 0. Execution, authority and change control

Finish or safely checkpoint the bounded task already in progress before switching. Preserve uncommitted work, worktrees, other agents' work, existing approvals and release gates. Read actual HEAD, current local work, repository instructions, the current-state record, active handoff, canonical roadmap, decision register and relevant implementation/tests. This reference commit is context, not permission to reset, overwrite, merge or rewrite published Git history.

First return a file-level reconciliation: already implemented, partially implemented, missing delta, reused component, concrete dependency and required acceptance evidence. Separate code presence, test results, deployment and real signed-in use. Do not treat a previous planning document as proof of current implementation.

Integrate this document at the canonical location above. Update D03 and affected R10/R11/R16 acceptance language in the roadmap, scope register, AI Visibility documentation, traceability and active handoff. Preserve unrelated requirements. Mark dated historical three-surface statements as superseded by this owner decision rather than rewriting their historical meaning. Search active plans for all variants of that old gate so it cannot survive indirectly. Existing MCP connections operate Milo; they are not observation providers. Keep Milo separate from Wombat Ops.

This document does **not** authorize new supplier spending, account/credential changes, production configuration or migrations, merging, deployment, external messages, purchased placements, collection automation, publication or permission expansion. Continue only within existing authorization. Preserve Manual / Review / Autopilot boundaries. A citation or accuracy task does not acquire publication, outreach or spending authority. Missing mandatory review is a blocker, not permission to bypass it.

Already-authorized read-only work, documentation and non-conflicting offline implementation/tests may proceed without repeatedly requesting approval. If a real export or live acceptance is unavailable, continue independent work and name the exact missing evidence. Never simulate production success to close a gate.

## 1. D03 replacement and the v1 milestone

### D03 — Accepted narrow-v1 collection and evidence decision

**The v1 milestone is: native Google and Bing evidence for the client's market, one manually observed consumer surface, human-reviewed findings, two verified improvements, one comparable re-test.**

For this pilot, the client is Synergy Massage and the intended market is Sweden, specifically Malmö/Limhamn for the manual questions. Native evidence retains only the geographic detail actually provided by its source. GSC country evidence is not Malmö-level evidence. An unsegmented Bing export is not Swedish- or Malmö-specific merely because the business is located there; label its market scope as not exposed/unsegmented. This limitation is part of acceptance, not a reason to invent geographic attribution.

**There is no minimum-three-provider or minimum-three-surface gate for v1.** Google and Bing native reports are publisher evidence streams, not two additional manually probed consumer surfaces. v1 has exactly one manual consumer surface.

Additional consumer surfaces, suppliers, collection APIs, automated collection or Google Search Grounding may be considered only in later, separate packets. Each later packet needs its own permitted-use/rights, cost, retention, attribution/display, method and real-acceptance decisions. No adapter or adapter scaffold is required or authorized by this v1 specification. Broader platform ambition remains a backlog, not a launch blocker for this feature.

### Completion conditions

| Gate | Required evidence |
| --- | --- |
| Native Google and Bing | Genuine owner-authorized report material for the correct property, with date windows, source semantics, availability and actual geographic scope preserved. Baseline and follow-up imports use comparable settings where available. |
| One consumer surface | The owner-approved fixed discovery panel is attempted by hand once weekly on one surface for four weeks, with inspectable captures and session records. |
| Human-reviewed findings | Every finding used in the customer report or converted into work has a named reviewer, evidence references and a recorded decision. Both gap families in §4 are usable. |
| Two verified improvements | Two substantive, evidence-backed changes are approved under existing permissions and checked at their actual destinations. Two drafts or two task checkboxes are insufficient. |
| One comparable re-test | The fourth weekly discovery round reuses the first round's approved questions and method, after both verified changes, with matched observations and limitations shown. It is already included in the 40 planned observations. |

No positive citation, recommendation, impression count or increase is required to finish the work: these outcomes are not controlled by Milo. A no-data view is evidence of availability status, **not** numeric zero. If a required native report cannot be obtained, record that part of the pilot as blocked/partial; do not silently waive it, invent values or add substitute providers. Independent implementation and the other pilot work can continue. Any later scope waiver must be explicit.

Feature implementation acceptance, pilot completion and the wider Milo/public paid-launch decision remain separate. Completing this milestone does not declare all future R10/R11/R16 scope complete.

## 2. Product outcome and hard scope boundary

**Customer-facing purpose:** Help the owner understand whether the business appears, is recommended accurately, or is used as a source; identify a useful correction; implement it safely; and inspect later evidence.

The core loop has two equal-priority paths:

`native report or manual answer → citation/source finding OR recommendation/business-fact finding → human review → existing Plan task → authorized change → destination verification → comparable re-test`

Native reports cannot generate a prompt-specific competitor or recommendation claim by themselves. Manual observations supply that context. First-party page/profile review may support an improvement proposal, but it must not be relabelled as an observed AI failure or an explanation of hidden source-selection logic.

### Included

- Owner-uploaded native GSC Generative AI performance report (Search) and Bing AI Performance data, with original units and limitations.
- Existing manual answer intake, extended only as needed for the fixed protocol, separate panels and human reviews.
- Evidence views and deterministic validation/counting over those two native streams and the manual stream.
- Citation/source gaps and recommendation/business-fact accuracy gaps, without default priority bias toward citations.
- Two existing-workflow improvements, a manually conducted re-test and a small owner-readable proof report.

### Excluded from v1 — do not scaffold

- Automated consumer-UI collection, browser bots, unattended probes, scraping, account/cookie automation or automated capture extensions.
- Provider/search API adapters, API collection, paid search/model calls for observation or classification, and Google Search Grounding, including importing its outputs as a supposed consumer-session substitute.
- New GSC/Bing API connectors or OAuth flows for these reports. Native **file import parsers** are not collection API adapters. Existing unrelated GSC integrations stay intact.
- Multi-surface monitoring, a provider-abstraction framework, a scheduler for consumer observations, automatic catch-up runs, or automated citation-change alerts.
- Automatic LLM recommendation/support/accuracy grading; a human reviews v1 findings.
- Statistical significance gates, power calculations, confidence-interval dashboards, inferred traffic/conversions, or a combined Authority/Trust/Visibility score.
- Purchased mentions, link exchanges, automated outreach and unsupported claims of citation or recommendation guarantees.

The automated-collection rights assessment and metered search-API budget are **not dependencies of this milestone** because neither form of collection is used. Ordinary authorized account access, privacy, ownership and permitted handling of supplied material still apply; manual entry is not a licence to import restricted material from a different method. Human time, existing account subscriptions, storage and authorized content work are not assumed free.

## 3. Native evidence first — CI-1

### 3.1 GSC Generative AI performance report (Search)

Preserve the following source contract. The metric is **impressions**: links to the site shown in Google Search generative-AI features, including AI Overviews and AI Mode. The report's dimensions are **page, country, device and date**. There are **no queries and no clicks in this report**. It can establish page/link appearance, not the question, answer text, recommendation or visit. Dates use Pacific Time; property totals and page totals have different aggregation. The report warns that unavailable `~` / `-` cells become `0` in exports. [G1]

Engineering rules derived from that contract:

- Identify the report positively. Reject or quarantine a generic GSC Web performance export offered as AI-only data. Do not repurpose ordinary query/click records or invent an AI filter/API endpoint.
- Keep the uploaded artifact, declared property, actual filters, report period, grouping, chart-versus-table identity, unit, source timezone, capture/import timestamps and preliminary/completeness status.
- Preserve separate dimension tables. Do not join independent page/country/device/date totals into a fabricated multidimensional dataset or infer the question behind a page impression.
- Show the original source label. Do not rename impressions to citations or combine them with manual citation counts.
- Do not sum page totals to reconstruct property totals or add overlapping snapshots together. Same-scope reimports are versioned snapshots, not new events.
- The intended GSC pilot country filter is Sweden where the real report supports and contains it. Record the actual filter; do not infer language or city from it.
- Import only the fields and shape confirmed in genuine report exports. Keep unsupported fields unavailable, not populated from an AI guess. A screenshot or hand-entered number can record a separately labelled availability/verification receipt; it is not a fabricated CSV or a verified automated connection.

**Export-zero rule:** Store a raw cell separately from its interpreted value and `value_status`. A source `~` or `-` means `unknown`, even when the export says `0`. If the export alone cannot distinguish that substitution from a real zero, use `unknown_export_zero`, not `known_zero`. A known zero needs evidence that the original report showed numeric zero for the exact scope/cell, with the owner's review record. Do not mark all zeros verified through an ungrounded bulk checkbox. Missing rows are not zero rows.

Suggested statuses are `known_value`, `known_zero`, `unknown_source`, `unknown_export_zero`, `unavailable`, `preliminary` and `invalid`. Preserve source completeness separately from cell status.

### 3.2 Bing AI Performance

Preserve Bing's native citation measures, page activity and grounding-query associations. **Citation Share is a percentage for one specific grounding query**, not Milo's manual citation frequency or a global visibility score. Grounding queries are not exact user prompts. The remaining share does not identify competitor domains. Native data is aggregated/sampled and may be sparse; missing detail does not prove no citation. Preserve source coverage and actual geographic filters only where exposed. [B1]

Implementation rules:

- Retain the source field name, unit, grounding-query label, period, page/filter context and native aggregation. A displayed Citation Share value is imported as a provider-reported value; do not reconstruct an unpublished denominator.
- Never average Citation Share across queries as a portfolio score, substitute a manual-observation denominator or deduce competitor identities from the remaining share.
- Do not invent raw answers, consumer prompts, recommendation labels or support judgements from these aggregates.
- Retain the report's supported-surface aggregation. Do not label an unsegmented result as consumer Copilot-only, Sweden-only or Swedish-language.
- Respect filtering and snapshot overlap. Different report views are not necessarily additive and must not be joined as individual events.
- Missing Citation Share or another preview field is `unavailable`; ingest the fields actually present. Lack of a preview field is not a blocker for the basic native importer.

### 3.3 Native import workflow and provenance

The owner opens each publisher tool directly, selects the correct property and available period/market scope, downloads its report, and supplies it to Milo. Start with genuine CSV export shapes; do not implement speculative column schemas or workbook support without an actual sample and need. Local/deterministic parsing is allowed; no collection API call is involved.

Extend existing authenticated upload/storage facilities where suitable. A file import is owner-supplied material, even when its claimed origin is a native report. Record `owner_supplied_native_export`, source claim, parser version, reviewer, artifact hash and any review receipt. Parsing does not authenticate the publisher's signature or turn provenance into universally verified data.

Import both sources at baseline and around the final re-test. Intermediate native refreshes are optional, not a second weekly workload requirement. Store their real data-through dates; report lag or preliminary data rather than assigning a manual observation's date to the aggregate.

Use explicit byte/row limits, strict validation, upload preview and bounded project storage. Set limits from the existing safe-upload contract and genuine exports before release, and test overflow failures. Do not silently truncate rows. An unsupported report shape blocks that import with a useful reason; synthetic fixtures may test it but cannot establish real acceptance.

Never evaluate spreadsheet formulas or fetch URLs during import. Escape formula-like cells on exports intended for spreadsheet software. Native report data belongs in a typed native-report record, not a fake AI answer in `ai_answer_evidence`.

## 4. Definitions, attribution/support and the two gap families

### 4.1 Operational vocabulary

| Term | v1 meaning and boundary |
| --- | --- |
| Mention | A human confirms that answer text identifies the intended business. It may be negative or irrelevant to purchase. |
| Citation | A visible answer reference is captured and linked to its source through the interface evidence. A Sources-panel entry that is only related/retrieved content is not automatically a citation. |
| Grounding | External information informing an answer. v1 records only publicly observable evidence; it does not claim access to internal retrieval or selection decisions. |
| Attribution | The answer attributes a particular statement/passage to a source. This is distinct from whether the source supports that statement and from marketing-channel attribution. |
| Recommendation | The answer presents the correct business as a suitable option for the stated need. A mention, source link, positive adjective or directory entry alone is insufficient. |
| Business-fact accuracy | Human comparison of a specific answer claim with dated owner-confirmed facts and supporting source material. Unknown truth stays unknown. |
| Own-site citation | A cited URL matches the project's declared/verified website scope. Scope verification is recorded separately from citation occurrence. |
| Third-party source | An external page. It may be about this business, another business, or neither. A directory's domain is not owned by the listed business. |
| Referral / conversion | Separate existing analytics evidence. Neither is inferred from a citation, impression or recommendation. |

Mentions, citations and recommendations are independent observations. A business can be recommended through a booking listing without an own-site citation. A page can be cited while the answer recommends somebody else.

### 4.2 Attribution is not support — replacement for the former §4 overclaim

Use **“The answer attributed this statement to this source.”** until a human has inspected the source passage. Do not say **“The source supported the statement”** based only on a citation mapping and a brand match.

Each assessed claim/source relationship stores the exact answer claim/span, cited URL, answer capture time, source passage, source capture date/time, reviewer, review time and one status:

| Support status | Meaning |
| --- | --- |
| `supports` | The inspected source passage supports the specific claim without a material omitted qualification. |
| `partly supports` | The passage supports only part of the claim or includes an important qualification the answer missed. |
| `contradicts` | The inspected passage conflicts with the claim. |
| `unclear` | A passage was inspected, but its meaning or relationship is insufficient to decide. |
| `not checked` | No source-support assessment was completed; includes unavailable/inaccessible sources. |

The four assessed states require the source passage and its capture date, not just a URL. `not checked` does not require an invented passage; retain the reason and any access-attempt note. Keep excerpts limited to the material needed for review. Source capture after answer capture may reflect a changed page: show both dates and do not claim the later passage proves what the page said earlier.

Support and factual truth remain distinct. An outdated page can support an outdated answer claim. Also compare relevant claims against the dated owner-confirmed business-facts record. Record `accurate_at_capture`, `incorrect_at_capture`, `outdated_now`, `unclear` or `not_checked` as appropriate; do not retroactively mark an old answer false because the owner later changed a price.

### 4.3 Gap family A — citation and source visibility

Examples: an actual competitor citation with no own-site citation in the same fully captured answer; a cited own page that contains outdated information; or a relevant source opportunity evidenced by a specific captured page.

A competitor-only citation gap requires a complete answer and complete citation list, confirmed source identity, competitor present and own-site citation absent. Partial data may support a positive observed occurrence but not a confident negative comparison. An unrelated external citation and a brand mentioned elsewhere in the answer are not brand attribution.

### 4.4 Gap family B — recommendation and business-fact accuracy

Examples: a competitor is recommended for a relevant need while the client is not; the client is recommended with a wrong price, location or booking link; the wrong entity is presented; or hours, services, qualifications or cancellation terms conflict with dated verified facts.

Human recommendation states are `recommended`, `mentioned_only`, `explicitly_not_recommended`, `not_present` and `unclear`. Record the exact passage and recommendation target. `not_present` needs a complete answer; an incomplete capture cannot prove omission. Do not treat every omission as an unjustified rejection: record whether the business actually fits the question, or mark suitability unknown.

This family has **equal product priority, UI visibility, review support and task-conversion support** to family A. It is not “later sentiment analysis.” Priority is based on customer harm, relevance and fixability, not whether the issue produces a citation count. No rule requires one improvement from each family when the evidence does not justify it; do not invent errors to balance the task list.

### 4.5 Human review and owner facts

Rafal reviews pilot findings; a second studio reviewer checks ambiguous or high-impact claims when available. Store reviewer identity and decision, not an uncalibrated AI confidence score. A collector may also be reviewer, but that is not independent verification.

Before accepting factual-error findings, confirm the current public business identity, exact service names/durations, prices/currency, offers/validity dates, premises/service area, hours, booking/cancellation conditions and credentials through owner-approved knowledge and dated evidence. Do not seed these from old conversation memory, a competitor, or this panel's questions. In particular, this document does not declare a permanent studio address, a current offer, or payment-benefit eligibility for Synergy.

The existing literal matcher may help locate text but cannot approve an entity, recommendation or support judgement. Human review is the v1 classifier. Keep observations, hypotheses and proposed work visibly separate.

## 5. Pilot collection: 40 manual discovery observations, not 240

### 5.1 Fixed pilot configuration

| Setting | v1 pilot |
| --- | --- |
| Client | Synergy Massage |
| Target market | Sweden; Malmö/Limhamn in the exact question text |
| Question language | Swedish (`sv-SE`) |
| Consumer surface | Starting choice for owner review: **ChatGPT Search, consumer web app**; one surface only |
| Discovery panel | Ten owner-reviewed, version-locked unbranded questions in Appendix A |
| Frequency | Once per week, four weeks |
| Planned observations | **10 questions × 1 surface × 1 round/week × 4 weeks = 40** |
| Brand-accuracy panel | Five draft questions in Appendix B; separate, unscheduled and excluded from discovery counts |
| Classification | Human review, without model/API calls |

The owner can choose another single consumer surface **before** the first capture. Lock its exact interface/mode and protocol at that point. Changing it mid-pilot creates a methodology break, not a comparable replacement. Native Google/Bing streams do not change the one-surface manual count.

**These 40 observations detect presence and recurring patterns. They do not establish small percentage changes, representative market visibility or statistically significant uplift.** There are four scheduled discovery observations per question, not forty independent observations for every question.

The five brand questions are delivered as a starting draft, not an added weekly schedule. Running them requires an explicit, separately counted owner decision; one full brand round adds five observations and a baseline plus re-test adds ten. Never run fifteen questions weekly and label the workload forty. Equal priority for accuracy findings does not mean a hidden collection quota: review business facts present in discovery answers, and use optional brand diagnostics separately when approved.

### 5.2 Manual session protocol

The owner operates the consumer interface directly, not through Milo, Claude, an API, browser automation or an extension. Each question starts a fresh session with no preceding business discussion. Copy the exact answer and actual citations into Milo's existing intake. Inspect the original answer/interface to map citations; never ask a second model to reconstruct them.

Record the following with each observation or a linked immutable session-protocol snapshot, with per-observation deviations:

| Category | Required context |
| --- | --- |
| Session | Fresh thread confirmed; logged-in/out state; account tier if known; memory, custom instructions, plugins/connected tools and temporary-chat personalisation state. No passwords, cookies, account email or session tokens. |
| Location | Explicit location in the question, actual collection country/city where known, browser/device location permission, VPN/proxy state if used. No claim of precise local targeting from IP or a country label alone. |
| Language | Exact prompt language, interface language and observed answer language separately. |
| Surface | Consumer service, exact interface, selected search mode, displayed model label or unknown, and whether web search is visibly evidenced, not evidenced or unknown. |
| Time | Capture instant with timezone, intended weekly slot, actual run time and any delay. Store instants consistently; display Stockholm time without rewriting native report day boundaries. |
| Instructions | Exact question/prompt version; any extra instruction or filter; previous messages must be none. No custom system prompt, seed sources, forced Synergy mention or follow-up asking the model to add the client. |
| Capture | Complete / failed / truncated; raw answer, actual citation URLs/mappings, complete-list declaration, optional safe screenshot reference, and missing-data reason. |

For the proposed ChatGPT surface, use a fresh **non-personalised** session and verify the visible settings rather than trusting the word “temporary.” The current Temporary Chat documentation distinguishes personalised and non-personalised modes. Search can also use location context. This is a reproducibility control, not a claim of perfect absence of personalisation. [O1, O2]

The proposed protocol uses the consumer Search mode consistently but adds no extra “cite sources” instruction to the Swedish panel. Record the mode; a search-selected answer with no actual visible search must not be labelled proven grounding. Do not mix Search-on observations with an automatic-search-mode experiment.

A failed or truncated attempt stays recorded. Do not regenerate until a favourable result appears or retry automatically. Corrections fix a captured record; they are not new independent observations. A genuine repeat must have its own capture evidence and be explicitly identified as extra work, outside the fixed schedule unless an approved replacement rule was recorded in advance.

### 5.3 Four-week execution and comparable re-test

- **Week 1:** Native baseline imports and the first ten-question manual round before any pilot improvement. Record the owner's starting facts and existing zero-report statement separately from measured data.
- **Week 2:** Repeat the same ten questions. Review findings and select two useful changes. Do not hide baseline captures that make the proposed intervention look unnecessary.
- **By the Week 3 checkpoint:** Complete and destination-verify both authorized changes where feasible; run the third ten-question round and record whether each capture was before or after each change.
- **Week 4:** Run the final same ten-question round after both changes and refresh native evidence using comparable available periods/settings. This is the **one comparable re-test**, not ten extra observations beyond the forty.

Use Week 1 versus Week 4 for the primary descriptive paired comparison, with Weeks 2/3 visible as context. Preserve actual elapsed time and concurrent changes; this schedule makes no indexing-speed promise. If both changes are not verified before Week 4, the pilot is not complete. Do not backdate their receipts; any extra re-test needs an explicitly recorded workload extension.

A round has ten planned slots. Show complete, failed, truncated, missed and protocol-deviant slots. Compare only genuinely comparable eligible pairs and show the missing pairs alongside them. No eligible baseline/follow-up pair means no completed comparable re-test. Do not fabricate a full panel from a partial history view.

## 6. Metrics and interpretation at a zero baseline

**Owner-reported baseline:** The owner says every market/surface measured so far is at zero. This is context, not a newly verified observation in Milo. Do not prefill customer records with synthetic zeros. Link actual historical evidence if supplied; otherwise label it owner-reported, evidence not attached.

### 6.1 First metric: observed presence

“Observed presence” means at least one inspectable observation establishing the specific outcome. Preserve separate outcomes:

- Native Google: a known positive impression value for the source's stated scope establishes native-reported page/link appearance, not a citation or recommendation.
- Native Bing: a known positive citation value establishes native-reported citation activity for its stated scope, not a recommendation or visit.
- Manual: a human-reviewed mention, actual citation or recommendation establishes that outcome in that captured answer. It does not establish population visibility.

One valid positive capture can establish presence. A partial capture may contain inspectable positive evidence, but it cannot establish absence or supply a complete-answer comparison. Show its partial status and keep it out of complete-pair summaries.

### 6.2 Display contract

Use plain counts and evidence links: presence observed / not observed in eligible captures / not measured; first observed date; number of complete reviewed captures; planned and missing slots; and reviewed recurring issues. Keep native values in their original units. Do not add Google impressions, Bing citations and manual answers together.

For manual observations, show the numerator and eligible count where useful, for example `own-site citation present: x reviewed captures out of n eligible captures`, with panel, question, surface, period and method. These are descriptive counts, not an estimated market citation rate. Do not make percentage-change arrows, a blended score or a significance badge the v1 headline.

A citation absence requires a complete answer and a declared complete citation list. A complete explicitly empty list may establish no citation in that answer; a missing list, truncated answer, failed attempt or unresolved mapping is unknown. Recommendation/mention absence also needs a complete human-reviewed answer. An unreviewed classification remains unreviewed, not zero.

Keep discovery and brand diagnostics separate in every count, view, export and comparison. Their results must never share a denominator. Also keep source-specific native aggregates separate from manual observations.

### 6.3 Unknown consumer model versions

Preserve existing manual-intake unknown-model cohort protections and historical classifications. Do not mutate `evidenceCohorts` to pretend two unknown backend versions are the same pinned model. [R3]

v1 may show chronological human-reviewed **consumer-surface observations** under the same panel/session protocol and their descriptive presence counts. Label the backend as unknown when it is unknown; do not call this a controlled same-model experiment. A known mode/model/interface change flags a break. This descriptive review layer is not permission to merge legacy unknown-model cohorts into an inferential metric.

### 6.4 What a result can and cannot claim

Permitted: “The business was correctly recommended in this captured answer.” “These two public changes are verified.” “No own-site citation was observed in the eligible re-test captures.” “The native report is unavailable; we cannot establish zero.”

Not permitted: “Milo increased AI trust,” “Your AI rank improved,” “The update caused the citation,” “You now reach this percentage of Malmö buyers,” or “The booking was caused by this sampled answer.” Recommendations, citations, referrals and conversions remain separate.

Keep “observed at least once” as a presence marker, not a performance score: more observation opportunities alone make presence easier to observe. A recurring pattern is a described repetition on named capture dates, not a significance claim.

Statistical sample sizing and change detection are deferred to Appendix C. They do not block v1.

## 7. Turning findings into two verified improvements

Reuse the existing Plan opportunity/task model and its owner decisions. Every accepted finding has its family, evidence IDs, raw observation, optional hypothesis, business relevance, proposed action, target, expected owner benefit, approval boundary and re-test link. Do not claim to know why an engine chose a competitor.

For recurring findings, append evidence to the existing task rather than creating weekly duplicates. Preserve dismissals, owner edits and review state. Human-review a changed conclusion before converting it into new work.

Suitable actions may include correcting a wrong public address or price, clarifying a service/booking page, resolving a demonstrated access issue, or updating a relevant existing listing. Choose from actual evidence and owner priorities. Do not automatically generate more articles, mass city pages, keyword-stuffed FAQs or unsupported “GEO schema.” Do not invent credentials, studies, reviews, testimonials or source quotations.

A verified improvement needs a baseline capture, the approved change/version, knowledge/fact references, the actual public destination or authorized configuration receipt, verification time and reviewer. A saved draft, successful request acknowledgement or task status alone does not prove the change is live. Use existing destination-verification facilities or an explicitly recorded owner inspection; do not invent a new crawler to verify two pages.

Human factual approval is not publication approval. Content/SEO/Authority/Performance specialists may reuse their existing roles and tools only within existing project authority. Manual/Review/Autopilot settings, version-bound approvals, revocation, knowledge changes and destination safety rules remain in force. Supplier spending and outreach remain out of this milestone.

Two useful verified changes count as delivered work even if the later AI observations remain at zero. The proof report must distinguish work completed from outcome observed. If no two worthwhile improvements are supported, do not manufacture them to satisfy a quota; report the unmet condition.

## 8. Minimal data design and existing invariants

Extend existing models before adding new ones. The reference intake uses `ai_visibility_prompts` and `ai_answer_evidence`, immutable prompt revisions, correction chains and server-derived classification. It is network-free and owner-supplied/unverified. Existing caps are 200 prompt versions and 100 answer records per project, including history. [R2, R3]

Forty planned discovery records fit only if that project's existing usage leaves capacity. Preflight actual remaining capacity and allow for corrections. Do not auto-delete evidence, silently raise caps, discard failed attempts or promise infinite history. Optional brand runs consume separately recorded capacity. Native aggregate snapshots are not answer records and need a bounded, typed storage path.

| Logical extension | Required information |
| --- | --- |
| Native report snapshot | Owner/project, source report identity, raw artifact/hash, capture and import times, period/timezone, actual filters/market scope, dimensions/units/aggregation, raw cells, interpreted values/statuses, completeness, parser version, human review and supersession. |
| Panel/session protocol | Discovery or brand type, immutable version, approved prompt versions, client market/languages, one actual surface/mode, session controls, planned slots and owner approval. |
| Manual capture context | Existing answer ID plus panel/slot/protocol reference, settings/deviations, capture provenance/completeness and original citation mappings. |
| Human finding/review | Answer or native/source evidence references, entity identity, gap family, exact claim/recommendation, dated business-fact baseline, support state, source passage/date, reviewer/decision/time and linked task. |
| Improvement/proof linkage | Existing task/change/publication receipts, two verified destinations, baseline/re-test records, matching/exclusions, native reporting windows and stated limitations. |

These are logical requirements, not instructions to create five new tables or a framework. Native imports need deterministic parsers, not provider adapters. Reuse existing storage, corrections, permission checks and task relationships wherever those semantics fit.

Preserve tenant/project-scoped references and existing evidence access; team features elsewhere do not automatically authorize access to private evidence. Derive owner identity, permissions and review identities from the authenticated server, not an imported claim. Imports cannot set execution authority, authenticated verification or a metric as trusted.

Preserve original records and append corrections/derivations. A superseding correction outside the selected date window must still exclude its original. Reimporting the same artifact cannot inflate counts. Separate genuine captures with identical text can remain separate only when their actual capture/slot provenance establishes that they are separate, not duplicates or reused cached answers.

Retain full URL identity and safe source matching. Similar names, suffix domains and unrelated pages on a shared directory are not the client's entity. Do not silently collapse meaningful query/path differences. Keep declaration versus verified ownership explicit.

Export, deletion and retention must cover native artifacts, answer evidence, reviews, findings and derived reports consistently. If evidence is removed, dependent claims lose inspectable-proof status. Retention rules and explicit deletion take precedence over historical immutability. Do not retain derivative material to evade a source restriction.

## 9. Security, operating cost and safe rendering

Keep manual intake, native parsing and evidence viewing network-free. No imported URL triggers a fetch, no source content triggers a tool, and no screenshot or answer is executable instructions. Human source inspection is done in the owner's browser; retain permitted passage evidence without adding an automated retrieval job.

Render answers/source passages as safe text through existing controls. Do not execute HTML, Markdown payloads, formulas, scripts or remote images from evidence. Keep URL validation and existing safe-fetch/redirect/DNS/private-address protections for other already-authorized Milo workflows unchanged; this specification does not create a new fetch path.

Never collect passwords, cookies, session tokens, customer records or unrelated private conversations in the pilot. Use neutral public buyer questions and owner-approved public business facts. Keep storage/export/deletion scoped to the correct client. Do not build a shared cross-client citation corpus or transfer project knowledge into another workspace.

Collection and classification in v1 make **no provider API calls** and have no per-query API expense. Do not create fake API ledger entries or scaffold reservations for a nonexistent collector. Track actual human collection/review/import/implementation time and ordinary storage/subscription context to assess affordability.

Any existing paid drafting or other execution used for improvements still obeys the established fail-closed budget/entitlement controls. Unknown costs stay unknown; no unapproved overages, retries, hidden upgrades, generation allowances or Stripe changes. Reading, manual edits and exports remain available when existing paid work is paused.

Do not add an unattended observation scheduler. The four weekly rounds are the owner's manual work plan. Any reminder or existing-task notification must reuse already authorized preferences and delivery gates; this document sends or schedules nothing. Do not add new performance emails that call a single absent citation a lost ranking.

## 10. User experience and owner report

Extend the existing AI area, Plan and Reports rather than introducing a new top-level “Authority” product. Retain AI Readiness as labelled advice. Use three distinct evidence tabs/sections: Google native, Bing native and manual observations. Show citation/source and recommendation/accuracy findings as peers, not primary versus later functionality.

Primary actions: import native report, add manual answer, review evidence, create/review existing improvement task, inspect verified change and review re-test. Do not display buttons for connecting collection APIs, enabling autoprobing or activating extra providers in v1.

Required states: not configured, native report unavailable, unknown export zero, partial/preliminary report, owner-supplied/unreviewed, reviewed, no presence in eligible captures, missed/failed/truncated slot, protocol change, incomparable pair, capacity reached, superseded and evidence deleted. Empty data is never a decorative zero-score chart. Synthetic demo data stays clearly labelled and outside customer counts.

Preserve current supported-language and accessibility contracts; separate app language, panel language and source-report language. The Swedish prompt drafts below are not permission to switch the whole UI or enable unfinished translations.

The final pilot report states: source coverage and limits; first/recurring presence with links to actual evidence; reviewed issues in either family; the two changes and destination checks; the comparable re-test with missing pairs and elapsed time; and whether outcomes remained absent, appeared, or could not be measured. Existing referral/conversion evidence can be shown separately when actually available, never inferred.

## 11. Reconciled packet order

| Packet | Required scope | Acceptance evidence |
| --- | --- | --- |
| **CI-0 — Reconcile and write back** | Preserve current task; audit actual implementation/local work; integrate v1.1; replace D03 and the old R10 three-surface floor; update R11/R16, traceability and active handoff. | File-level reuse/delta map and no contradictory active v1 gate/order; no claim of completed implementation. |
| **CI-1 — Native evidence first** | GSC Generative AI performance report (Search) and Bing AI Performance import, exact semantics, unknown export zeros, snapshot handling and provenance. Keep/extend deterministic metric/evidence views reading native data plus the existing manual intake. **No automated collection.** | Genuine export/schema mapping, deterministic tests, source-specific views and signed-in import/read/export acceptance; missing real artifacts explicitly block corresponding real acceptance. |
| **CI-2 — Manual protocol and both human-reviewed gap types** | Lock the Synergy draft panel after owner review; add session context and review/support records; keep discovery and optional brand panels separate; enable both gap families equally. | Genuine manually captured baseline and human-reviewed examples, explicit completeness/unknown states, faithful source passages and no API/classifier call. |
| **CI-3 — Two verified improvements** | Convert accepted findings into existing Plan/Studio workflows; execute only authorized changes; verify both actual destinations. | Two substantive improvement receipts tied to reviewed evidence, exact approval/version and destination checks. |
| **CI-4 — Comparable manual re-test and proof** | Fourth weekly discovery round, within forty planned observations, after both verified changes; refresh native reports; assemble a qualified descriptive report. | Comparable baseline/follow-up pairs with exclusions, honest native coverage, all forty planned slot outcomes accounted for, and no uplift/causality claim. |

The weekly pilot is real owner work, not something Claude should claim to have run while coding. CI-2 baseline capture precedes the actual improvements; CI-3 must finish before the final comparable re-test. Earlier rounds can inform ongoing human review. There is no CI-2 provider-adapter packet.

Offline tests and independent work may continue when an external artifact or human capture is pending. Do not promote the pilot to complete until the required real evidence exists. Later providers require separate named packets outside CI-0–CI-4; they cannot hold this narrowed feature hostage.

## 12. Acceptance tests and real-use checks

All examples below are test fixtures unless backed by actual evidence. Never insert fixture observations into the client project as live results. Preserve existing regression coverage; new fixtures must not weaken current denominators, access or corrections.

| ID | Case | Expected result |
| --- | --- | --- |
| CI11-T01 | Active roadmap or handoff retains the old minimum-three-surface condition | Reconciliation fails until active v1 wording is replaced/marked superseded. |
| CI11-T02 | Ordinary GSC Web query/click export supplied as generative-AI report | Reject/quarantine the report identity; no fabricated AI measurements. |
| CI11-T03 | Valid GSC native dimensions/metric | Preserve impressions, original scope and available page/country/device/date grouping; expose no invented questions or clicks. |
| CI11-T04 | Source `~` / `-` exported as `0` | Unknown, not known zero; raw and interpreted cells both retained. |
| CI11-T05 | Bare exported zero without original-cell evidence | `unknown_export_zero`; later owner evidence may resolve it without rewriting the raw file. |
| CI11-T06 | Original report demonstrably shows numeric zero in the exact cell/scope | Known zero with review receipt; do not generalize to missing rows. |
| CI11-T07 | GSC property chart differs from page totals; source dates use PT | Preserve each aggregation/timezone; no summation repair or Stockholm-date relabelling. |
| CI11-T08 | Bing Citation Share tied to a grounding query | Retain provider-reported query-specific percentage; no manual-rate denominator, competitor inference or averaging into a score. |
| CI11-T09 | Bing report lacks country, language or a preview field | Mark those scopes/fields unavailable; do not label the report Malmö/Swedish or invent values. |
| CI11-T10 | Source missing, no-data screen, partial export or preliminary period | Show availability/completeness; never invent zero or pass real-import acceptance with a fixture. |
| CI11-T11 | Overlapping/repeated native exports | Version/dedupe snapshots; do not add overlapping aggregate counts as events. |
| CI11-T12 | Native CSV contains formula, HTML, URL or oversized data | No execution/network calls; bounded validation and safe export/rendering. |
| CI11-T13 | Ten questions once weekly, one surface, four weeks | Exactly forty planned discovery slots; Week 4 re-test is included. |
| CI11-T14 | Five draft brand questions exist | Unscheduled; never included in discovery numerator/denominator or silently added weekly. |
| CI11-T15 | Same question in an existing personalised business conversation | Mark protocol deviation; do not treat as the neutral baseline session. |
| CI11-T16 | Known session/mode/language/location protocol changes | Show deviation/break; no silent comparable-pair claim. |
| CI11-T17 | Unknown consumer backend model | Preserve legacy unknown-model cohort behavior; allow labelled descriptive session review, not pinned-model inference. |
| CI11-T18 | Own-site URL in prose/related sources but no actual citation mapping | No citation credit from the URL alone. |
| CI11-T19 | Complete answer and explicitly empty complete citation list | Eligible observed citation absence; mention/recommendation reviewed separately. |
| CI11-T20 | Citation list missing, failed/truncated answer or unreviewed classification | Unknown/unreviewed; not zero, not a confident negative competitor gap. |
| CI11-T21 | Partial answer visibly contains an own citation | Preserve the positive partial evidence; exclude from complete-pair metrics. |
| CI11-T22 | Brand cited but competitor recommended | Independent own citation and competitor-recommendation finding; no inferred client endorsement. |
| CI11-T23 | Client correctly recommended via a booking listing, own site not cited | Positive recommendation; own-site citation remains absent/unknown as supported. |
| CI11-T24 | Wrong price/location/entity versus dated owner-confirmed evidence | Human-reviewed accuracy finding, with equal task/UI support to citation gaps. |
| CI11-T25 | Citation and entity match, source passage not inspected | Attribution only; support is `not checked`. |
| CI11-T26 | Human support judgement | One of the five support states; assessed states retain exact source passage, capture date and reviewer. |
| CI11-T27 | Source supports an outdated claim; owner facts differ | Support and accuracy recorded separately; neither overwrites the other. |
| CI11-T28 | Facts changed after answer capture | Preserve capture-time truth versus now-outdated status; no retrospective false-error claim. |
| CI11-T29 | Deceptive domain, ambiguous brand or unrelated directory page | No false entity/ownership attribution; ambiguity visible. |
| CI11-T30 | Duplicate import/correction outside displayed window | No inflated counts; superseded original excluded even across windows. |
| CI11-T31 | Identical text from genuinely separate documented manual captures | Distinct slots allowed; copied/cached evidence cannot masquerade as a fresh capture. |
| CI11-T32 | Forty new records exceed remaining legacy answer capacity | Block additional intake safely; no auto-deletion, cap bypass or silent truncation. |
| CI11-T33 | Imported content requests publication or secrets | Treated as data; no tool execution, knowledge leak or authority expansion. |
| CI11-T34 | Cross-project user/collaborator accesses evidence or export | Existing evidence authorization enforced; no implicit sharing. |
| CI11-T35 | Review claims authenticity from successful parsing or an imported `verified=true` | Reject trusted-flag input; retain owner-supplied provenance and server-attributed review. |
| CI11-T36 | Draft saved or destination request acknowledged, not checked live | Not a verified improvement; two such drafts do not pass CI-3. |
| CI11-T37 | Same finding repeats; owner dismissed/edited its task | Append evidence without duplicate tasks or overriding owner decisions. |
| CI11-T38 | Re-test has no eligible comparable pair or happened before both changes | CI-4 remains incomplete; no backdated receipts or extra hidden observations. |
| CI11-T39 | Re-test remains at zero/unknown after two verified changes | Report work completed and actual outcomes honestly; no fabricated success or forced extra provider. |
| CI11-T40 | Collector scaffolding, API call, cron, Google Grounding or browser automation added | Out-of-scope regression; remove from this v1 packet. |
| CI11-T41 | Existing content work faces exhausted budget or revoked approval | Existing fail-closed controls apply; findings cannot override them. |
| CI11-T42 | Evidence is deleted/expired | Update dependent reviews/proof and exports; no claim of inspectable evidence after removal. |
| CI11-T43 | UI/mobile/keyboard/localisation and existing Plan/Studio flows | No regression in supported interfaces, accessibility, locale parity or authorization. |

Real acceptance must include genuine authorized native files, real owner-run consumer captures, a signed-in import/review/task workflow, actual destination checks for two changes, and actual later observations. Mocks, static UI, parser unit tests and this specification do not establish that real acceptance.

## 13. Claude writeback and reporting contract

At reconciliation, report actual branch/HEAD and active milestone; existing versus missing functionality with file/test references; reused components; changed canonical spec/plan files; the revised D03 and R10/R11/R16 text; genuine missing artifacts/permissions; and the next bounded non-conflicting packet.

At each packet's end, record changed files, requirement/test IDs, passed/failed/not-run checks, signed-in versus mocked acceptance, review/release status, migration and rollback implications, actual costs only if incurred under existing authority, and the continuation point. Keep one active handoff. Do not reply merely “added to the roadmap,” use invented completion percentages, or claim the pilot was collected by the implementation agent.

A request for later provider selection, rights analysis or API budget must be labelled future scope, not a prerequisite that revives the removed v1 gate. Preserve all other existing safety, review, release and public-launch decisions.

---

## Appendix A — Draft discovery panel for owner review

**Status: DRAFT — owner review required before use. Not an approved or already collected panel.**

Only the Swedish text is the executable question. Polish translations are reading aids and must not be appended to a prompt, stored as a second question, or used to claim Polish-market testing. Confirm that each question represents a genuinely relevant need for Synergy; the wording does not assert that any particular service, benefit, appointment time or offer is currently available. These are related buyer questions, not ten statistically independent market segments.

Once reviewed, save one immutable discovery-panel version. Keep exact text, order and surface protocol across the four rounds. No Synergy name, domain, supplied source or competitor seed is included.

| ID | Swedish question — exact starting draft | Polish translation — not sent to the surface |
| --- | --- | --- |
| SY-D01 | Var kan jag boka avslappnande massage i Limhamn? | Gdzie mogę zarezerwować relaksujący masaż w Limhamn? |
| SY-D02 | Vilka massörer i Malmö erbjuder klassisk svensk massage? | Którzy masażyści w Malmö oferują klasyczny masaż szwedzki? |
| SY-D03 | Var i Malmö kan jag boka massage för spända axlar och nacke efter mycket kontorsarbete? | Gdzie w Malmö mogę zarezerwować masaż napiętych ramion i karku po długiej pracy biurowej? |
| SY-D04 | Var kan jag boka 60 minuters massage i Limhamn? | Gdzie mogę zarezerwować 60-minutowy masaż w Limhamn? |
| SY-D05 | Vilka ställen i Malmö erbjuder 90 minuters avslappningsmassage? | Które miejsca w Malmö oferują 90-minutowy masaż relaksacyjny? |
| SY-D06 | Vilka massörer i Limhamn har tider på vardagskvällar? | Którzy masażyści w Limhamn mają terminy w wieczory w dni powszednie? |
| SY-D07 | Var kan jag boka massage på en lördag i Limhamn? | Gdzie mogę zarezerwować masaż w sobotę w Limhamn? |
| SY-D08 | Var i Malmö kan jag använda friskvårdsbidrag till massage? | Gdzie w Malmö mogę wykorzystać pracowniczy dodatek na aktywność i dobrostan na masaż? |
| SY-D09 | Vilka massörer i Limhamn har tydliga priser och bokning online? | Którzy masażyści w Limhamn mają jasno podane ceny i rezerwację online? |
| SY-D10 | Jag ska boka massage för första gången i Malmö. Vilka ställen är värda att jämföra? | Po raz pierwszy planuję zarezerwować masaż w Malmö. Które miejsca warto porównać? |

Owner review must confirm relevance, Swedish wording, final surface/mode and the proposed session controls. Do not prepopulate answers, results or current prices. Do not rewrite questions after seeing where the business succeeds.

## Appendix B — Draft brand-accuracy panel for owner review

**Status: DRAFT — separate optional diagnostic panel; not scheduled in the forty-observation discovery pilot. Never pool with discovery.**

Only Swedish text is executable; Polish is a reading aid. Review against dated owner-confirmed facts rather than values embedded in the prompt. These prompts test information about a named business; they cannot establish unprompted discovery.

| ID | Swedish question — exact starting draft | Polish translation — not sent to the surface |
| --- | --- | --- |
| SY-B01 | Vad är Synergy Massage i Malmö, och vem utför behandlingarna? | Czym jest Synergy Massage w Malmö i kto wykonuje zabiegi? |
| SY-B02 | Var finns Synergy Massage i Malmö, och hur tar jag mig dit? | Gdzie znajduje się Synergy Massage w Malmö i jak tam dotrzeć? |
| SY-B03 | Vilka massagebehandlingar och behandlingstider erbjuder Synergy Massage i Malmö? | Jakie rodzaje i długości masażu oferuje Synergy Massage w Malmö? |
| SY-B04 | Vad kostar massage hos Synergy Massage i Malmö, och finns det några aktuella erbjudanden? | Ile kosztuje masaż w Synergy Massage w Malmö i czy są obecnie jakieś promocje? |
| SY-B05 | Hur bokar jag hos Synergy Massage i Malmö, och vilka öppettider och avbokningsvillkor gäller? | Jak zarezerwować wizytę w Synergy Massage w Malmö oraz jakie obowiązują godziny otwarcia i zasady odwoływania wizyt? |

Any approved diagnostic execution gets its own panel version, scope, observation budget, dates and report section. It is not automatically a weekly task, a second consumer surface or an acceptance requirement added to the pilot.

## Appendix C — Later statistics and additional collection; not v1 requirements

No sample-size/power implementation, percentage-uplift target or significance acceptance criterion belongs to v1. The present task is observed presence and repeated qualitative patterns under a fixed small protocol.

If later decisions require detecting changes in an established rate, write a separate methodology packet **before** making those claims. Define the population/estimand, baseline with evidence, decision-relevant effect, question/day clustering, model/method drift, missingness, repetition, comparison windows, multiple testing and permissible uncertainty display. Do not prescribe a universal samples-per-query number here. A mathematical power calculation does not make a convenience sample representative.

Likewise, each additional provider/surface or automated method needs a later bounded packet: exact product/method, rights to collection/analysis/retention/export/display, supported markets, bounded price/cost model, failure/retry controls and real acceptance evidence. Retain API-versus-consumer separation and do not launder Google Grounding or other restricted outputs through a manual-import label. No future packet is silently part of this v1 release.

## Appendix D — Competitive reference table retained from the review

**Context only.** The table preserves the earlier review's vendor-listing summary. Prices have not been independently verified by the studio or revalidated as purchasable offers for this specification; features and measurement quality have not been independently tested. Every price is labelled **“vendor-listed, unverified, September 2026.”** These are not recommendations, supplier approvals, Milo pricing decisions or an agreed budget.

| Tool | Price carried forward from the review | Offering described in the review — not independently tested | Implication retained for Milo |
| --- | --- | --- | --- |
| OtterlyAI Lite | **$29/month — vendor-listed, unverified, September 2026** | 15 prompts; daily tracking across four named engines; additional engines as add-ons; citation analysis/recommendations. | Monitoring is already sold cheaply; broadening markets/services consumes a small panel quickly. |
| Ahrefs custom AI prompt tracking | **From $50/month — vendor-listed, unverified, September 2026** | 2,500 checks; a prompt/platform/location combination consumes a check. | A future buy-versus-build comparison, not a v1 collection dependency. |
| Semrush AI Visibility | **$99/month per domain, billed annually — vendor-listed, unverified, September 2026** | 25 custom prompts; competitor analysis and readiness auditing. | Domain-based economics need checking for a multi-client studio; do not claim untested local-language accuracy. |
| Profound Starter / Growth | **Starter $99/month — vendor-listed, unverified, September 2026. Growth $399/month — vendor-listed, unverified, September 2026.** | Review described ChatGPT coverage for Starter, three-engine coverage for Growth and agent/content functions. | Not a limited-budget purchase recommendation; execution-oriented positioning is not unique by itself. |

Vendor reference locations carried forward, not evidence of independently verified prices: OtterlyAI `https://otterly.ai/pricing`; Ahrefs `https://ahrefs.com/pricing/`; Semrush `https://www.semrush.com/pricing/ai/`; Profound `https://www.tryprofound.com/pricing`.

Do not configure a retail package from this table. Evaluate the pilot's actual owner effort, correction quality and useful verified changes before setting Milo pricing or buying monitoring capacity.

## Appendix E — v1.0 → v1.1 conflict-resolution changelog

| Conflict | v1.1 change | Reason |
| --- | --- | --- |
| Three-provider gate | D03 and active R10 v1 acceptance replaced by native Google/Bing + one manual consumer surface + human findings + two changes + one re-test. | Provider count is not customer value; no hidden breadth gate. |
| Evidence-first/adapter-first packets | CI-1 is native-report ingestion; CI-2 is manual protocol and human review; CI-3/4 are changes and re-test. | Start with available publisher evidence and reuse intake. |
| Citation-only loop | Recommendation/business-fact accuracy becomes an equal-priority gap family. | Correct customer choice and information can matter more than an own-domain citation. |
| Attribution treated as support | Five-state human support review with passage/date, separate from truth checks. | A linked source does not prove it supports a claim. |
| Automated collection and suppliers | Removed from v1, including scaffolding; later packets individually gated. | No collection API expense or automated-collection rights work in the initial milestone. |
| Pilot burden | Forty discovery observations; brand drafts optional/unscheduled; final re-test included. | Fit a two-person studio without silently adding work. |
| Statistics at zero | Observed presence first; quantitative change-detection design moves to a later appendix. | Four observations per question cannot support small-change claims. |
| GSC semantics and export zeros | Impressions only; page/country/device/date; no queries/clicks; ambiguous exported zeros stay unknown. | Preserve what the report does and does not expose. |
| Unnamed/abstract pilot | Synergy Massage, Malmö, Swedish, one proposed consumer surface; ten discovery and five separate brand drafts. | A concrete starting workflow with no fabricated business facts. |
| Competing handoffs and pricing confidence | One v1.1 handoff; fixed commit/path/R10-R11-R16 references; previous safety gates retained; every competitor price marked vendor-listed/unverified/September 2026. | Remove contradictory instructions and unsupported commercial certainty. |

## Appendix F — Source and evidence register

The scope, protocol, product rules, data design and test cases are owner-directed engineering decisions, not claims of vendor endorsement. Public documentation below was checked during preparation on 14 September 2026. Account-level availability and genuine client exports still require real acceptance. No client native report or consumer panel was collected while writing this specification.

- **[G1] Official documentation:** Google Search Console Help, “Generative AI performance report (Search).” Metric/dimension scope, aggregation, time zone and export-zero limitation. `https://support.google.com/webmasters/answer/16984139`
- **[B1] Official documentation:** Bing Webmaster Tools, “AI Performance,” including its Intents, Topics and Citation Share FAQ. Native metrics, grounding-query meaning, exports and limitations. `https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c`
- **[O1] Official documentation:** OpenAI Help Center, “Temporary Chat FAQ.” Personalised/non-personalised temporary sessions. `https://help.openai.com/en/articles/8914046-temp`
- **[O2] Official documentation:** OpenAI Help Center, “ChatGPT search.” Consumer search sources and location context. `https://help.openai.com/en/articles/9237897-chatgpt-search`
- **[R1] Connected repository evidence:** `main` branch response confirmed reference commit `27417bc8f4e8a7be7d3edb7371221a5d9e906da4`, dated 12 September 2026. `https://api.github.com/repos/rafalandersen-dev/andersen-visibility-engine/branches/main`
- **[R2] Connected repository evidence:** `docs/AI-ANSWER-EVIDENCE.md` at the reference commit; intake, caps, corrections, unknowns and network-free handling. `https://github.com/rafalandersen-dev/andersen-visibility-engine/blob/27417bc8f4e8a7be7d3edb7371221a5d9e906da4/docs/AI-ANSWER-EVIDENCE.md`
- **[R3] Implementation reference:** `src/lib/answer-evidence.ts` at the reference commit, read in the preceding review; revalidate current implementation before editing. `https://github.com/rafalandersen-dev/andersen-visibility-engine/blob/27417bc8f4e8a7be7d3edb7371221a5d9e906da4/src/lib/answer-evidence.ts`
- **[R4] Connected repository evidence:** `product/PLAN_REVIEW_2026_09_07.md` at the reference commit; contains the old R10 floor, D03 and related scope IDs explicitly superseded for this v1 milestone. `https://github.com/rafalandersen-dev/andersen-visibility-engine/blob/27417bc8f4e8a7be7d3edb7371221a5d9e906da4/product/PLAN_REVIEW_2026_09_07.md`

**End of specification. No code, repository plans, production configuration, client publication or Claude conversation was changed by preparing this file.**
