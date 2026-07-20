# AI Visibility Monitor — Specification

**Status:** proposal for approval. Planning only. **Roadmap:** epic **P3.1** (Advanced Differentiation), gated by **P2.0** (External‑API Cost‑Control Framework — real AI‑engine probing is paid). **Last revised:** 2026‑07‑20.
Cross‑refs: `TARGET-ARCHITECTURE.md` (M6), `PRODUCT-AUDIT-2026-07.md` §Domain D, `AGENCY-BENCHMARK-SEMPIRE.md`, `DECISION-LOG.md`.

---

## 1. Current state (verified) and the rename

- The `app.ai-visibility` module **never queries any AI engine** (`ai.functions.ts` generateAiVisibilityFn ~1240; prompt at ~1285: "You have NOT checked any live AI engine"). It is an LLM planner that emits prompt lists, "likely gaps", and self‑assigned 0–100 readiness scores. Its copy is honest ("readiness/likely gap"), but the module **name** promises measurement it never performs.
- The only genuinely‑measured AI signal today is **`ai_referrer`** — a human clicking from an AI tool, caught by the first‑party JS beacon (`analytics.ts`). Real but thin (referrer stripping under‑counts).
- `ai_crawler`/`ai_search_bot` UA detection is **architecturally near‑dead**: the endpoint is only reached by the client‑side JS snippet, and GPTBot/ClaudeBot/PerplexityBot do not run JS — so those bots never hit it.

**P0.1 rename:** the current planner becomes **"AI Readiness"** (labelled ADVICE). The **AI Visibility Monitor** (this spec, MEASUREMENT) is a distinct, later module (P3.1).

---

## 2. Three separate metrics (never combined)

A single "AI visibility" number is misleading. Milo measures three distinct things and always shows them separately, each with a confidence level:

1. **Mention visibility** — does the brand/product appear in an AI answer to a relevant prompt? *(Measured by probing engines and scanning the answer text.)*
2. **Citation visibility** — is the customer's website used/cited as a **source** (a URL) in the answer? *(Measured by extracting cited URLs from the answer.)*
3. **Referral visibility** — does a real user click from an AI platform to the site? *(Measured today via `ai_referrer` first‑party analytics — the one metric that already partly exists; surfaced honestly in P0.6.)*

These are reported as three metrics, never averaged into one score.

---

## 3. Design

- **Prompt library** (`ai_visibility_prompts`) — per project + locale, a curated set of realistic buyer/informational prompts (built from GSC queries, services, and conversational phrasings). Human‑reviewable and editable.
- **Scheduled probing** (`ai_visibility_probes`) — a job runs the prompt library against ≥2 engines (start with API‑accessible ones, e.g. an OpenAI model and Perplexity; add Gemini / AI‑Overview surrogates as feasible). Cadence by plan. **Every probe routes through the Cost‑Control Framework (P2.0): metered, capped, cached, rate‑limited, fail‑closed.**
- **Response storage** — the raw answer is stored per probe (engine, prompt, timestamp, locale) so a claim is always backed by the actual text, not a summary.
- **Citation / source extraction** — parse cited URLs/domains from the stored answer; classify each as *our domain* / *competitor* / *third‑party*.
- **Mention + sentiment classification** — detect brand/product mention; classify sentiment (positive/neutral/negative) with a confidence score.
- **Answer‑accuracy check** — does the answer state the business correctly (name, category, key facts)? Flag hallucinations/errors as a *content/entity* opportunity (feeds M7).
- **Competitor comparison** — for the same prompt set, who is mentioned/cited more.
- **Trend history** — because probes are stored per run, show change over time (a probe is a sample, not a rank).
- **Geo / language** — probe per locale; report differences.
- **Alerts** — meaningful change (newly mentioned, lost citation, negative sentiment) → owner alert.

---

## 4. Honesty rules (non‑negotiable — this is where Milo out‑honests the benchmark)

- **Every result carries a confidence level and an explicit limitations note.** LLM outputs are **non‑deterministic** (the same prompt varies by run/session/region); a probe is a **sample**, not a guaranteed ranking. Referral attribution is **sparse/under‑counted** due to referrer stripping.
- **Never present a probe as "your AI rank".** No guaranteed‑visibility claims. No implication that adding schema *causes* a mention or citation (correlation, not promise — see `DECISION-LOG.md` §Schema).
- **Show the evidence.** Every mention/citation claim links to the stored raw answer. This is the direct contrast with the benchmark, which *claims* "AI mention + sentiment monitoring" and "AI Overview reporting" without a shown method.
- **Cost transparency.** Because probing is paid and non‑deterministic, the module shows probe cost/quota and lets the owner control cadence.

---

## 5. Data model

- `ai_visibility_prompts` (real table): id, project_id, locale, prompt, intent, source (gsc/service/manual), active.
- `ai_visibility_probes` (real table): id, project_id, prompt_id, engine, ran_at, raw_answer, mention(bool), sentiment, confidence, cited_urls[], accuracy_flag, cost.
(Time‑series → real tables, not the blob, per `TARGET-ARCHITECTURE.md` §1.)

---

## 6. Success metrics, failure states, plan limits

- **Success:** a scheduled prompt returns stored raw answers from ≥2 engines with extracted citations, per‑metric values + confidence; re‑running shows a trend, not a single snapshot; every claim links to evidence.
- **Failure states:** cost cap reached → probing pauses with an honest "paused to stay within budget"; engine unavailable → last‑known + staleness label; ambiguous parse → low‑confidence, not a fabricated result. All fail **closed** (no unmetered spend).
- **Plan limits:** number of prompts, engines, and probe cadence scale by subscription tier (entitlements enforced by P2.0).

---

## 7. MVP → Later

- **MVP (P3.1):** prompt library + scheduled probing of 2 engines + mention/citation extraction + confidence + trend, all behind P2.0. Referral metric surfaced from existing analytics in P0.6 (earlier).
- **Later:** sentiment nuance, AI‑Overview surrogate probing, more engines/locales, competitor benchmarking dashboards, entity‑accuracy loop into M7.
