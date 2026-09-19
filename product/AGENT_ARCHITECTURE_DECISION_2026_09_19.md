# Milo — AI specialist architecture decision (Assignment A)

**Date:** 2026-09-19. **Owner:** Rafal Andersen. **Author:** Claude (research/design, per [WORKING_AGREEMENT_2026_09_19.md](WORKING_AGREEMENT_2026_09_19.md)).
**Status:** final decision memo for owner/Codex integration. Design only — no `src/`, migration, provider, config, credential, deployment or scope change is made or authorized here; does not replace accepted R00–R24 / D01–D08 scope, release gates or the USD50/month + manual-free-budget decision. Citation Intelligence (Assignment B / D03) is a separate parallel memo, not prejudged here.
**Sources:** repo traced in this worktree; external links checked 19 Sep 2026 (caveats in the source table). Per capability I separate *present code / deployed SQL / verified behavior / remaining acceptance*; deployed SQL alone is **not** runtime acceptance. The review/correction history is not repeated here — it lives in the coordination worktree's `product/RESEARCH_REVIEW_2026_09_19.md`.

---

> Integration note (Codex, 19 September): the audit below is the research-start snapshot. PR136 subsequently passed review, its eight migrations were installed and source52261464 deployed; the first live conversation failed before a model reservation, so dispatch is held off pending repair. See AGENTS_AND_CITATION_IMPLEMENTATION_PLAN_2026_09_19.md and the production release evidence for current status. Do not use the historical table as current release proof.

## 1. Audit

Grounded in this worktree, [CURRENT_STATE.md](CURRENT_STATE.md), [DECISIONS.md](DECISIONS.md), [continuation review](../evidence/continuation-integration-review-2026-09-19.md) and `evidence/`. Production is `209c335` (PR140/141). The conversational executor is **prepared on PR136 (head `5e9baf`), not production**; the **8** Sep-13/14 chat/team migrations are absent from the prod journal (continuation review §9).

| Capability | Code | Deployed SQL / prod | Verified behavior | Remaining |
| --- | --- | --- | --- | --- |
| Native **text** gen + readiness **scoring** (separate fn), full-body retention | present (`generateContentCore`, `generateJsonText`) | **LIVE** (`209c335`) | recovered live text+scoring+complete retention (review §1); Sep-19 job `d6747d28…` cited by Codex, not re-verified in-repo | real-use; cost/quality |
| Native **image** gen | **transport only** (`image-gen.server.ts`) — separate path the executor never calls | key/transport; **no fresh Sep-19 image proven** | four Butelki items are **recovered publications**, not a fresh call | one real image gen |
| USD50 cap; manual free grant; fail-closed metering | present (`ai-usage/expense.server`) | **LIVE** (Sep-19 expense migrations) | refusal→`budget_unavailable`; pre-dispatch holds classified (P2) | reconciliation under load |
| **Owner-account payer** for team AI | present (`executor:162`, `payerId=ownerId`) | **PREPARED, NOT LIVE** | DECISIONS 2026-09-14 pooled decision + pattern exist; paid chat unbuilt in prod | migrations + real team turn |
| Coordinator→specialist executor (lead **plans**, ≤2 specialists, ≤2 tools, ≤1 draft, 250 s) | present (`milo-specialist-executor.server.ts`) | **PREPARED, NOT LIVE** | dispatcher inactive | PR136 gates |
| Durable store + dispatch (≤8 global/≤2 actor, 5-min lease, pending-only resume, no-replay) | present (`milo-conversation*`) | **PREPARED, NOT LIVE** | — | migration baseline + runtime |
| Injection/truthfulness guardrail | present (`principles`) | ships with executor | untrusted data; missing=unknown; no cross-client inference; recommendation ≠ done | red-team runtime |
| Client/project isolation, actor authority, consent-gated, viewer-cannot-consent | present + **tested** | consent path in unapplied Sep-14 set | coded owner-gating (`toolAllowed`) | runtime |
| **Project knowledge** store | present + **tested** | **DEPLOYED** `..._project_knowledge` (PR108) | scoped/versioned/reversible, fail-closed reads | signed-in upload/revoke |
| **Weekly preparation** | present + **tested** | `..._weekly_preparation` (+ executor/dispatch) present | planner/stage logic tested (PGlite) | executor wiring + real-use |
| **Brand document** intake | present + **tested** (+ parser) | maps to Brand Intelligence; rides `project_knowledge` | PDF/DOCX extract + mapping | signed-in upload |
| **Backlink monitoring** | present + **tested** | **DEPLOYED** `..._backlink_monitoring_requests` (PR125) + detail/recurring | saved index history + accounting recovery | supplier acceptance |
| **Provenance / self-evidence control** | present + **tested** | **DEPLOYED** `..._output_knowledge_integrity` (PR121) + `_reviews` | **coded** version/fingerprint/expiry/withdrawal/conflict check, hold-on-change — **not runtime-accepted (SQL ≠ acceptance)** | runtime enforcement + owner acceptance |
| **Cost-per-accepted eval harness** | **absent** | — | — | build offline (§8) |
| Real per-accepted cost | — | **UNKNOWN** | old AUTOPILOT figures assumed the retired Gemini gateway | measure after live |
| PR136 security review, runtime CI, migration baseline, deploy, real-use | — | **HELD** | review §Hold | before dispatch |

**Do not claim** the prepared chat/executor or owner-payer is live, any per-accepted cost is measured, the self-evidence control is runtime-accepted, or a **fresh** Sep-19 image gen was proven. **Do not** re-mark the four specialist families "missing" — they are built (two with deployed SQL); what remains is signed-in acceptance and surfacing, not re-implementation.

---

## 2. Three-architecture comparison

| | **A. Single tool-using agent** | **B. Coordinator + specialists** (prepared) | **C. Independent specialists** |
| --- | --- | --- | --- |
| Shape | one model, tool loop | one process: 1 model-generated plan → ≤2 role prompts on the **same** model, shared conversation | separate loops/models, handoffs or fan-out+synthesis |
| Cost | 1× | 1 routing + ≤2 replies + nested tool calls (§3.2) | Anthropic *research* ~15× chat tokens — a workload figure, not a law |
| Fit | matches the LIVE gen path; ideal for ordinary Q&A | matches "route to a specialist in one chat" (D 2026-09-13) with one model + hard caps | overkill for SMB SEO; latency/cost/isolation surface rise |
| Vendors | OpenAI "maximize one agent first" (pp.14–17) | OpenAI **manager**; Anthropic **orchestrator-workers** | OpenAI **decentralized**; only when one agent "fails to follow instructions or select tools" |

**Keep B; collapse to A when the plan selects no specialist** (the executor already instructs "for an ordinary question use lead and empty tools") — both vendors advise starting simplest and adding agents only when needed. **Reject C for Milo**: no demonstrated SMB-SEO benefit, added overhead/latency/isolation surface, no need under USD50 — **not** by treating Anthropic's ~15× research figure as a law. Bounded future hypothesis retained: revisit only if a parallelizable workload shows a *measured* benefit. No vendor-API change is warranted.

---

## 3. Recommended design

Tags: **[new]** genuinely new · **[change]** change · **[ratify]** confirms coded/deployed behavior.

### 3.1 Roles (labels over one model, not separate processes/credentials)

Tools are the actual registry (`toolCatalog`/`toolAllowed`); consent-gated provider tools need the turn's saved consent (`providerCheckTools`); owner-only in `ownerOnlyTools`.

| Role | Input | Tools | Output | Quality | Authority |
| --- | --- | --- | --- | --- | --- |
| Lead | task + brief | `weekly_preparation`(owner) | plan JSON + receipt | correct specialist/tools; ordinary → empty tools | none; handoff grants none |
| Brand | brand context | `project_knowledge`(owner) | brand guidance | only accepted records; missing=unknown | read-only |
| Research | evidence | evidence reads, `saved_audit`,`weekly_preparation`(owner); consent: index/crawl/perf | evidence read | no invented receipts; saved ≠ fresh | consent-gated |
| Content | draft/opportunity | `draft_read/seo_review/metadata_proposal`,`draft_generation`(owner,gated) | **proposal** or one retained draft | proposal ≠ save; ≤1 gen | owner-only gen; save is human |
| Image | asset context | none in executor | visual guidance | image gen is a separate, unproven path | none |
| SEO | draft/evidence | `draft_seo_review/metadata_proposal`,`technical_evidence`,`saved_audit`(owner); consent tools | structural review / metadata | structural only; not live crawl/rank | consent-gated |
| Authority | saved index obs. | `authority_evidence` | link reading | index ≠ verified placement; null=unknown | no outreach/order |
| AI Visibility | owner samples | `visibility_evidence` | visibility reading | unverified; zero logs ≠ zero traffic | read-only |
| Performance | evidence | `technical_evidence`,`saved_audit`(owner); consent tools | lab/field reading | lab ≠ field; missing=unknown | consent-gated |

**Handoff.** 1 model-generated plan call + ≤2 replies, schema-enforced (`assignments min1.max2`, distinct roles, `tools.max2`, ≤1 generation, ≤1 metadata, ≤2 provider checks). It is a visible receipt, not authority. **[ratify]**

**Memory.** Bounded window, not compaction: `after: ordinal-20` read + `specialistMemory` (≤12 turns, ≤2 replies/≤5 receipts each, ≤12 KB, `omitted/shortened` flags). Persist scoped, versioned, **reversible** knowledge (deployed P1). No summarization added without a measured need. **[ratify]**

**Isolation.** Per-project retrieval authorization before model work; no cross-project reads; actor-scoped rechecks (`assertLive`,`beforeDispatch`); only the **payer** scope moves to the owner. **[ratify]**

**Approvals (HITL).** Publish/outreach/order/permission/budget changes are not tools here and cannot be granted by handoff; `draft_metadata_proposal` returns `approval_required` (`contentSaved:false`) needing an explicit owner save; viewers cannot consent to quota tools. **[ratify]**

**Stops.** 250 s; ≤2 specialists; ≤2 tools each; ≤1 draft; no duplicate role/tool; output caps (5000 routing / 4000 reply / 12 KB text). **[ratify]**

**Anti-false-knowledge.** Keep `principles` (tool text untrusted; recommendation ≠ done; missing=unknown; saved ≠ fresh; readiness ≠ observed; no invented receipts; retained gen ≠ save). The `output_knowledge_integrity`/`_reviews` self-evidence control (PR121) is coded/SQL-deployed but **not runtime-accepted**; inspect it before proposing any *remaining* delta. **[ratify]**

### 3.2 Call-ceiling — schema-enforced, verified by code trace **[ratify]**

Base per turn = 1 routing + ≤2 replies = ≤3 model calls before nested calls (`project_brief` is deterministic). Verified nested calls: `draft_metadata_proposal` → `context.proposal.model(…)` **once** (`milo-specialist-tools.server.ts:190`); `draft_generation` → `generateContentCore` → **exactly one** `generateJsonText` (`ai.functions.ts:2414`), with **no** scoring or image call inside (both separate, never invoked here). Schema worst case `1 routing + 2 replies + 1 metadata + 1 generation` = **≤5 native-text calls/turn**, plus provider-quota calls on their own owner-account counter.

This ≤5 **follows from the existing schema**, not a new guard: the caps are enforced at `specialistPlan.parse` (a 5-specialist plan is **rejected at parse**). The earlier "≤4 ceiling" is retired — it would break a legitimate 2-specialist drafting turn. **Ratify the caps now; add an explicit runtime counter only if a concrete gap later appears.** **[change]** LIVE text generation is not itself a tool-using agent.

---

## 4. Governance — freshness & corrections **[ratify]**

- **Freshness:** outputs record source/dependency versions + a cutoff; a pre-publication recheck re-reads product/price/offer/link facts and evaluates offer expiry at publish time (spec §Weekly step 5). An unreadable page is *unknown*, not deleted. Backed by the deployed provenance path (runtime still to verify).
- **Corrections:** "remember this for this project" saves a scoped, versioned, **reversible** preference (revoke/replace/forget/expiry remove the contribution); a one-off edit does not rewrite the brand profile; conflicting lessons become proposals with a visible resolution state. They change context only — never an agent's own budget/permissions.
- **Previous results:** reuse unchanged research; a single price change revises only affected assets, never every article.

---

## 5. Model / task routing & pricing (verified rates; routing inert)

**Verified 19 Sep 2026** (Codex, official docs pricing, per 1M, short-context): **Terra $2/$12**, **Luna $0.20/$1.20**, Sol $4/$20; `gpt-image-*` exist. No date on page; long-context ~doubles input. Milo entitlement/pricing **untested**.

**Routing is doubly inert.** `resolveModelForTask` returns the default (`gpt-5.6-terra`) or one OpenRouter A/B candidate; it **never reads `taskModels`** (`ai-router.ts:88–109`), and the executor/`ai.functions` select via `modelFor()`/`DEFAULT_MODEL_ID`, not this resolver (referenced only by tests). A real delta needs resolver (read `taskModels` + add Luna) + call-site + price/admission code.

**Unit ratio ≠ saving.** Luna's output rate is ~1/10th Terra's, but planning is a small **slice** of a turn (one 5000-token-capped, mostly-input call), so a tenfold unit ratio is **not** a tenfold turn saving. Any downshift is gated by the harness (§8) on measured success, not asserted savings.

---

## 6. Reliability **[ratify; verify under runtime]**

`operationId`/`jobId=turnId` idempotency — a retry never re-charges a completed gen; reservation *uncertainty* stays **unknown**, never re-dispatched as success; P2 classifies definite pre-dispatch failures as holds. Single-attempt transports + explicit `maxRetries`. Logged-out: the server executor runs after the turn is saved, pending-only resume, membership/claim recheck before every paid step. Budget: USD50 + manual grant, fail-closed; owner-payer prepared (PR136), not live; content stays publishable when only gen quota is exhausted. Concurrency: ≤8 global / ≤2 actor, 15-min windows, 5-min lease.

---

## 7. Cost per accepted result — definition, not a number

`cost_per_accepted = (total relevant actual cost, incl. unknowns) ÷ accepted count`, where "total" includes **all** model/provider calls (§3.2) **plus** repeats, failed-call and quota costs. Owner-editing effort is a **separate cash unit (time)**, not folded into model-USD unless the owner gives a loaded rate. An **unknown ledger cost is not zero**; modeled stays separate from measured.

**No turn-cost figure is asserted.** Acceptance rate is **UNMEASURED**, so cost-per-accepted is **UNKNOWN** until the harness runs on real accepted outputs. No numerical saving is claimed without measurement.

---

## 8. Evaluation — three tracks; none run or authorized here

Offline fixtures (`mock-ai`) are real control regressions but **cannot** measure accepted cost or prove Luna-vs-Terra quality without real outputs + human review.

**Track 1 — offline control fixtures (no calls, no budget).** Assert the 8 scenarios below: isolation, authority, missing=unknown, no-replay, approval gating, call-ceiling. **Independent of the 8 migrations.**

**Track 2 — proposed bounded model comparison (PROPOSED; NOT executed or authorized by this memo).** Luna vs Terra on routing/classification only. No new spend is authorized here; standing-authorized tests and existing release authority are **not** re-asked; any spend not already covered is an **owner decision**.
- *Fixtures:* **24 cases = 8 scenarios × 3 variants.**
- *Pass gate (all required; provisional small-sample gate, not a general quality proof):* **(a)** zero authority/isolation/untruthful-action violations; **(b) ≥ 23/24** correct route **and** required tool choices; **(c)** Luna **no less than** the Terra matched baseline. Ties/indeterminate are **classified unknown**, never counted as pass.
- *Envelope:* **≤ 48 calls total (24/model)** under a **conditional hard USD 2 cap INSIDE the existing USD 50** — contingent on priced/available models, an owner grant, and a conservative pre-flight estimate fitting the cap.
- *Stops:* stop before any budget/time/step overrun; **no automatic retry**. If the max reservation doesn't fit, **reduce the batch and report incomplete — do not relax the gate.**

**Track 3 — real owner acceptance (after live).** Measured `cost_per_accepted` + quality from real accepted outputs — **separate from the route/tool fixtures**; passing the small-sample gate is not owner acceptance.

| # | Scenario | Success | Failure to catch |
| --- | --- | --- | --- |
| 1 | Weekly planning | two slots prepared once, checked, held/approved | double ownership; regen all |
| 2 | Changed offer | only affected passage revised; expiry at publish; approval re-bound | stale price; blanket regen |
| 3 | Missing/conflicting | conflict + resolution state; unreadable=unknown | "last fetched wins"; invented fact |
| 4 | Weak article | honest sub-threshold score, named failing categories | inflation; caveat stripped |
| 5 | Failed publication | destination checked before retry; no duplicate; truthful failure | double publish; false "published" |
| 6 | Budget conflict | content still publishable; specific blocker; no double-charge | silent retry/charge; lost work |
| 7 | Logged-out | pending-only resume; recheck membership; late result doesn't overwrite edit | revoked collaborator spends owner budget |
| 8 | Team approval | visible client/project; viewer can't consent; handoff grants nothing | cross-client leak; viewer arms quota |

---

## 9. Recommendations (problem · evidence · delta · benefit · cost · test)

| # | Recommendation | Problem | Evidence | Delta | Benefit | Cost | Acceptance test |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R-1 | Keep manager; collapse to single agent when no specialist selected | route in one chat without runaway cost | OpenAI pp.14–17; Anthropic (19 Dec 2024) | **[ratify]**; reject C | 1 routing + ≤2 replies (D 2026-09-13) | none new | scenarios 1–8 pass before dispatch |
| R-2 | Build the offline control harness (Track 1) | no basis for cost/quality claims | eval practice: cost-per-*success* | **[new]** fixtures; independent of the 8 migrations | repeatable control tests | engineering time | runs offline; reports *modeled* cost with assumptions |
| R-3 | Investigate Luna routing **only if** proven | Terra rate for low-judgment steps | Terra $12 vs Luna $1.20 (19 Sep) | **[change]** resolver + call-site + admission (not just `taskModels{}`) | cheaper routing *slice* | code + budgeted comparison | Track-2 gate met, owner sign-off |
| R-4 | Verify memory/provenance under runtime | context rot; false persistence; leak | window coded; provenance SQL deployed (PR108/121) | **[ratify]**; propose only a *remaining* delta | trustworthy long chats | none if no delta | scenarios 3,4,8 + correction-reversal under runtime |
| R-5 | Ratify the schema ≤5-calls/turn bound; owner-account quota counter | a future tool edit could fan out spend | schema caps + trace (§3.2) | **[ratify]** schema as bound; optional counter on a concrete gap | no 2-specialist break; no duplicate guard | trivial | routing+2 replies+metadata+draft ≤5; 5-specialist plan *rejected* |

---

## 10. Implementation sequence

1. **Repairs → reviewed release (first).** Clear the held PR136 gates: final-head security review, runtime CI, migration baseline for the **8** Sep-13/14 chat/team migrations, controlled deployment, signed-in real-use. Do **not** delay this for research, nor trigger a premature rollout to enable it.
2. **Offline eval (parallel, independent).** R-2 Track 1 and the §3.2 bound run offline now — no migrations or budget.
3. **Real bounded acceptance (after live).** First measured `cost_per_accepted` (§7) from real accepted outputs.
4. **Routing (last, only if proven).** R-3 after a budgeted Track-2 comparison meets its gate + owner sign-off, and only with the §5 resolver/call-site/pricing changes.

Unchanged: weekly preparation, project knowledge, brand upload, backlink monitoring stay their own delivered packets (not "missing"); Stripe/observed-AI/localization/launch unchanged. Do not redo PR136 auth-security or PR137 integrity fixes (separate authors), nor activate migrations/providers/deployment here.

---

## Source & evidence table (checked 19 Sep 2026)

| Source | Supports · verification |
| --- | --- |
| [OpenAI, *A Practical Guide to Building Agents* (PDF)](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf) | single-agent-first (pp.14–17), baseline/eval (p.8), manager vs decentralized, guardrails, HITL. Parsed by Codex; my own fetch couldn't text-extract; no date invented |
| [Anthropic, *Building Effective Agents*](https://www.anthropic.com/research/building-effective-agents) | workflows vs agents; simplest solution; orchestrator-workers; cost/latency warning. Dated **19 Dec 2024** |
| [Anthropic, *Effective context engineering*](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | bounded context, structured notes, context rot. Search snippet (2025) |
| [Anthropic, multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) | ~15× multiplier for **its research workload** (not a law); workload-specific |
| [OpenAI API pricing](https://developers.openai.com/api/docs/pricing) | Terra $2/$12, Luna $0.20/$1.20, Sol $4/$20; image families exist. Verified by Codex; no date on page; Milo entitlement untested |
| Repo (this worktree): `ai-router.ts`, `milo-specialist-executor.server.ts`, `milo-specialist.ts`, `milo-specialist-tools.server.ts`, `ai.functions.ts`, `image-gen.server.ts`; `supabase/migrations/*`; `evidence/*`; CURRENT_STATE, DECISIONS, continuation review | present-code / deployed-SQL / verified-behavior / remaining states; verified call counts |

---

## Closing — final positions & remaining dependencies

**Positions.** Keep **B** (manager over one model, deterministic guards), collapsing to A for ordinary turns; **reject C for Milo** on current need. The four specialist families are **built and tested** (project-knowledge PR108, backlink-monitoring PR125 deployed) — not "missing"; the prepared piece is the executor (PR136, head `5e9baf`, not live) + its owner-account payer. Routing is doubly inert (needs resolver + call-site + pricing code). The schema-enforced **≤5 native-text calls/turn** is ratified from the code trace — no new guard. The genuine gap is **measurement**; safety, provenance, memory, isolation, approval and idempotency rules need **runtime verification, not redesign**.

**Remaining dependencies.** PR136 held gates (security review, baseline for the **8** chat/team migrations, deployment, real-use); runtime acceptance of the self-evidence control (SQL ≠ acceptance); real per-accepted cost (unmeasured; unknown ≠ zero); a **fresh** native image gen (unproven Sep-19; the four Butelki items are recovered publications); the Sep-19 job `d6747d28…` cited from the review, not re-verified in-repo; Milo provider entitlement/pricing. No measured cost, provider result, image proof or production readiness is asserted; no numerical saving without measurement; new spend beyond standing authorization is an owner decision. Citation Intelligence (D03) is a separate parallel memo.
