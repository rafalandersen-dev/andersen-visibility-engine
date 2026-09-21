# R09 actual-invoice reconciliation — bounded accounting gap review (20 September 2026, Claude)

Read-only audit; revised after independent Codex review. No application/test/migration
edits (this file only). No network/provider/new keys/deploy. Builds on
`evidence/native-provider-expense-2026-09-08.md` (rates/limits, not re-derived) and the
preserved `evidence/conversation-checkpoint-wait-release-2026-09-20.md` (unchanged).
PR148 released `bd0…`. Owner authorization unchanged: USD50/month global + owner cap;
free accounts native AI only by manual grant. **R09 remains OPEN in full — including
customer result allowances and package prices — and is NOT narrowed here.** It cannot be
declared done from reservations, nor from cost estimates.

## What the ledger records today (grounded in code/schema)

Per provider call, `reserve_ai_expense` inserts an `ai_expense_requests` row
(`state='reserved'`, `actual_microusd` NULL) and adds the ceiling to `reserved_microusd`
on the global + account budgets
(`supabase/migrations/20260907140000_ai_expense_reservations.sql:74-78`; the live 9/10-arg
overloads in `20260919120000`/`20260919130000` add auto-provisioning/permit/manual-budget,
same reserve accounting). On completion `withReservedAiExpense`
(`src/lib/ai-expense.server.ts:236`) calls `reconcile_ai_expense` with evidence built by
`ai-provider-expense.server.ts:205-221`, which **hardcodes `actualMicrousd: null`** (L214).
So reconcile always takes the NULL branch → `state='unknown'`, reservation RETAINED,
`spent_microusd` unchanged, tokens + `provider_request_id` recorded
(`20260907140000_…:117-124`). The settle branch (`…:125-134`) moves reserve→spent and
pauses on overrun, but **no application caller supplies a real actual**, so on the native
provider path no attempt is settled from live code.

**Scope correction (Codex):** that "no settlement" statement is scoped to the audited
native provider path plus the two fresh budget rows below (spent 0). Historical or
operator/manual settlements on other rows/paths were NOT inspected — no platform-wide
"nothing ever settled / spent is zero everywhere" claim is made.

Worked example (fresh read-only production, turn `f304d5ad…`, 13:07:08Z): two rows —
`0dab8455…` op `miloConversationRoute`, `0042c6c3…` op `miloSpecialistReply`
(`src/lib/milo-specialist-executor.server.ts:323`), each `gpt-5.6-terra`/`openai`,
reserved 500000 µUSD, actual NULL, state `unknown` (the plan/route call + the specialist
reply call — two provider invocations, not double-counting). Global+owner reserved
4500000 µUSD, spent 0. This matches the documented "retain the full reservation with
`actualMicrousd: null`" design — NOT a claim of zero provider cost, NOT a bug.

## Four cost classes, kept structurally distinct

- **Settled actual cost:** none on the audited native path (see scope correction).
- **Conservative reserves:** USD0.50/text, USD0.10/image ceilings held in full even on
  success (`ai-provider-expense.server.ts:14-26`); they bound ATTEMPTS, not spend.
- **Model-based estimates:** not computed anywhere; must stay advisory (below).
- **Unknown cost:** every completed attempt (`state='unknown'`), covering both a succeeded
  call (cost unverified) and a genuinely uncertain one (`outcome='uncertain'`, from
  timeout/exception, `ai-expense.server.ts:226`). The distinguishing signal is `outcome`,
  never `state`.

## Authoritative source — OpenAI Cost API (opened by Codex, 20 Sep 2026)

GET `/organization/costs`: returns billed cost in **1-day buckets only**; filters
`api_key_ids`, `project_ids`, `line_items`; `group_by` `project_id`, `line_item`,
`api_key_id`. Each result carries `amount` (value + currency), `project_id`, `api_key_id`,
`line_item`, `quantity`, `unit`; the example authenticates with an `admin_api_key`. There
is **no `request_id` dimension** — billed cost cannot be grouped or split to a single
provider request/attempt. Consequence: this endpoint supports **aggregate** reconciliation
(per day / project / key / line item) but **cannot** yield exact per-attempt actuals.
Authenticated admin access is **not verified** and no admin key is created; no invoice or
export availability is claimed.

https://developers.openai.com/api/reference/python/resources/admin/subresources/organization/subresources/usage/methods/costs

## Rejected: settling token estimates into `actual_microusd` (Codex)

My prior draft proposed reconciling with a token-based estimate as `p_actual` under a
provenance-labeled `cost_source`. **Reject it:**
1. **Terminal + conflict-locked.** Once `state='settled'`, a later reconcile with a
   different actual raises `expense_reconciliation_conflict`
   (`20260907140000_…:108-116`). An estimate settled now would BLOCK the later authoritative
   invoice correction.
2. **Releases the reserve.** Settling moves reserved→spent (`…:125-129`), discarding the
   conservative hold on an unverified number.
3. **Provenance string is not separation.** A `cost_source` label does not structurally
   separate classes: `spent_microusd` would then blend estimates with measured cost, and
   the cap/pause math cannot tell them apart.
4. **"Exact" token computation is not exact.** Cached input tokens, cache-write pricing and
   service tier change the effective rate, so plain input/output counts are insufficient
   even with a correct tariff; and `provider_request_id` cannot be matched to the Cost API
   (no request_id dimension). There is therefore **no** safe route to a per-attempt actual
   today.

→ Estimates MUST stay OUT of `actual_microusd`/`settled` and MUST NOT release reserves.

## Corrected findings (reported, NOT changed)

1. **Reconciler query contract:** safe handling keys off `outcome`, not `state`
   (`20260907140000_…:117-124`). Only `state='unknown' AND outcome='succeeded'` with tokens
   + `provider_request_id` present is even a candidate for aggregate attribution;
   `uncertain`/`failed`/token-less rows retain `unknown` — no estimate, no refund, no
   replay.
2. **Machinery is unit-tested; the gap is a DEPLOYED caller.** The settle path AND
   overrun-pause are already exercised as SQL unit tests — `src/lib/ai-expense-migration.test.ts:82-101`
   (measured cost moves to spent, releases unused reserve once) and `:103-107` (overrun ⇒
   `paused=true`). So this is NOT "absent tests"; it is "no deployed application path that
   supplies an authoritative actual." Distinguish the two.
3. **No expiry refund / unknown retention preserved** (`20260907140000_…:118`). Retained
   `unknown` reserves accrue against the USD50 caps and can refuse work below real spend;
   only an authoritative per-attempt settlement would release them — and none is available.

## Bounded architecture — exact vs aggregate (no code now)

- **Exact per-attempt settlement (`reconcile_ai_expense` with `p_actual`)**: permissible
  ONLY from an authoritative per-request cost. The Cost API does not provide one, so exact
  settlement stays BLOCKED — per-attempt rows remain `unknown`, reserves retained. Do not
  fabricate a per-attempt actual.
- **Aggregate reconciliation (separate, additive, advisory)**: a NEW record distinct from
  `ai_expense_requests` — e.g. a per-(day, project, line_item) table storing the Cost API
  `amount` — compared against the SUM of that day's reserves/attempts to surface drift and
  inform cap/pause decisions. It NEVER writes `ai_expense_requests.actual_microusd`/`state`
  and NEVER changes `reserved_microusd`/`spent_microusd`. This keeps estimates and aggregate
  billed cost entirely outside the per-attempt money gate and reserve release.
- **Optional advisory estimate**: if operators want a token projection, store it in the
  aggregate/advisory record only, clearly labeled, never in the gate math.

### Test acceptance (when built)
- Aggregate reconciler records billed-vs-reserved for a day WITHOUT mutating any
  `ai_expense_requests` row or budget balance; `uncertain`/`failed`/token-less attempts stay
  `unknown`; the existing settle/overrun unit tests remain unchanged and green.
- A regression asserting NO code path settles from an estimate (no `p_actual` derived from
  tokens).

### Prerequisites (bounded — two facts, not an open loop)
1. Verify authenticated admin access to the Cost API (an admin key must exist; none is
   created here). If unavailable, aggregate reconciliation cannot run and per-attempt rows
   stay `unknown` — documented, not researched further.
2. Re-validate the `gpt-5.6-terra` tariff incl. cached/cache-write/service-tier before any
   advisory estimate. If either prerequisite fails, R09 stays open with unknown retention;
   stop, do not loop.

## Next actionable step

A read-only confirmation of the two prerequisites above (admin Cost API access; current
tariff) — no spend/keys/network/deploy. Until an authoritative per-attempt cost source
exists (the Cost API is aggregate-only), the two `unknown` rows for turn `f304d5ad…` and
all prior reserves remain correctly unsettled and reserves are not released. R09 is NOT
done — reservations and estimates do not close it, and result allowances + package prices
remain open. All owner restrictions and existing release evidence preserved: no purchases,
subscriptions, spend, key/secret changes, network calls, or launch expansion.

## Codex independent disposition — 20 September 2026
Accepted distinction between estimates, retained reservations and aggregate supplier evidence. No authorization to settle estimates or allocate aggregate bills arbitrarily to attempts. Existing SQL settlement is terminal and conflicting corrections are refused. The available connector/tool catalog exposes no authenticated OpenAI Costs endpoint; current process has no OPENAI_ADMIN_KEY (presence-only check; no secret read or output). This does not establish absence of an admin credential in other environments. Account-level access remains unverified; no new key or permission requested or created. Tariff was not re-researched because no estimate execution is authorized by this document. A separate aggregate report can be prepared without claiming actual per-result reconciliation. R09 remains incomplete, including allowances and package prices. Documentation-only review; no additional tests warranted.
