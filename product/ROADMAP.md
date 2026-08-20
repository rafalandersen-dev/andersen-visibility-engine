# Milo Growth — Roadmap

**Status:** Canonical outcome roadmap  
**Last updated:** 2026-08-20  
**Product Lead:** Rafal Andersen

This roadmap is not a delivery promise. Active work must have an Outcome Owner, acceptance criteria and evidence.

Strategic rationale and the first 12 months after public launch are defined in [`STRATEGY_2026_2027.md`](./STRATEGY_2026_2027.md). Technical truth remains in [`CURRENT_STATE.md`](./CURRENT_STATE.md).

## Now

### 1. Close the active public-audit / staging / release gate

- [x] Complete issue #37 Gate 0 compatibility discovery.
- [x] Select the production trust-boundary architecture in ADR-0001.
- [x] Implement the dedicated Cloudflare Worker boundary.
- [x] Complete reviewed code-only staging harness work.
- [ ] Finish the current account-level staging/release gate in issue #43 or its verified successor.
- [ ] Run live abuse/privacy/provider-failure verification in the isolated environment before any production decision.
- [ ] Record an exact GO / NO-GO release decision and canonical writeback.

### 2. Establish unattended paid-launch authority

- [ ] Billing and plan entitlements are server-authoritative.
- [ ] Paddle lifecycle is verified end-to-end.
- [ ] Client state cannot elevate paid authority.
- [ ] Authenticated AI usage has hard per-plan limits and a global budget ceiling.
- [ ] Provider/crawl/AI unit cost is observable and positive-margin at expected usage.

### 3. Open the Live AI Visibility v1 outcome

Live AI Visibility is now **P0 market table stakes**, but Milo must not treat a dashboard as differentiation.

The first bounded outcome must:

- define three trustworthy initial AI/search surfaces;
- define prompt/engine/market/language/run/citation/mention history;
- expose methodology and variability honestly;
- include a unit-cost model before product promises are made;
- create the first path from live evidence → Action Card.

Do not expand to many engines before the first three are trustworthy.

### 4. Make the product action-first

- [ ] Direct GSC OAuth/API sync is the primary search-performance path.
- [ ] Dashboard opens on **Next Best Action**, not module navigation.
- [ ] Claude/MCP can safely read evidence and create/update non-live work.
- [ ] At least one action type completes `SEE → DECIDE → DO → PROVE` end-to-end.

## Next — first three months after public launch

### Month 1 — trustworthy live visibility

- citation/source gaps;
- competitor movers and share-of-voice;
- confidence/variability;
- weekly change digest.

### Month 2 — action-to-proof

- Proof Loop v1;
- WordPress draft-first hardening;
- action-level measurement history.

### Month 3 — automatic prompt discovery

- derive prompts from site, Brand Intelligence and GSC;
- conversational-query clustering;
- competitor prompt-gap suggestions;
- Shopify hardening only if customer demand supports it.

## Later — months 4–12 after public launch

- **M4:** activation/retention automation and monthly proof reporting.
- **M5:** local-service playbooks and GBP foundation.
- **M6:** authority/source opportunities without a proprietary backlink exchange.
- **M7:** agency expansion only if a demand/PMF gate passes.
- **M8:** recommendation learning and unit-economics optimisation.
- **M9:** case-study / experiment engine.
- **M10:** partner distribution and only the API/export surfaces real partners need.
- **M11:** internationalisation and selective AI-engine expansion.
- **M12:** pricing, moat and year-two strategy review.

## North Star

**Monthly Verified Growth Actions per Active Project (MVGA).**

An action counts only when it came from evidence, was accepted/executed, is linked to a measurable object and has a later measurement window. A positive result is not required; neutral/failing actions are still learning.

## Explicitly not committed

- Unattended public SaaS launch before security, billing, cost and release gates pass.
- Ranking, citation, traffic or revenue guarantees.
- Building a global keyword/backlink index to compete with Ahrefs/Semrush.
- A proprietary backlink exchange/network.
- Content-volume goals such as 30–90 AI articles per month.
- Uncontrolled autopublishing.
- Seven-plus AI engines before the initial surfaces are verified.
- A classic global rank tracker before GSC data is fully exploited.
- Agency complexity before SMB PMF or clear demand evidence.
- One opaque score that mixes readiness, Google performance and AI visibility.

## Pickup rule for Claude / Codex

Before starting work:

1. read `CURRENT_STATE.md`;
2. read `DECISIONS.md`;
3. read `STRATEGY_2026_2027.md`;
4. inspect the active issue/PR and live evidence;
5. execute **one bounded outcome** with explicit exclusions, metrics, cost ceiling, rollout/rollback and required canonical writeback.

Do not convert this roadmap into a broad feature sprint. The smallest complete `SEE → DECIDE → DO → PROVE` slice wins.
