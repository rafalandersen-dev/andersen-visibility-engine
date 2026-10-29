# Stripe commercial operations — isolated sandbox matrix and runbook (28 October 2026, extended 29 October, review corrections included)

**Nothing in this document has been executed.** It is the precise, ordered runbook for the first real isolated-sandbox pass, written so that the pass itself needs no further design. Every row is blocked on a company-owned Stripe **test** environment that does not exist in the authorized scope today.

Root verified independently that the company account `acct_1UG25BR3iZxco14q` has **0 managed sandboxes**, and no sandbox credential was created or configured by this packet. **A client's sandbox must not be reused.** Creating the sandbox, its keys, its products/prices and its webhook endpoint is an owner decision and an account operation that this packet does not perform.

## Why a synthetic pass is not acceptance

The local suites prove the **decision logic**, the **SQL contract** and — since the server completion stage — the **server↔SQL interaction**: **677** passing assertions across the four acceptance files (234 pure/mocked-server, 37 caller boundary, **147** server↔SQL integration, 259 foundation adapter), of which the 147 drive the exported server functions — and, for the projection gate, the exported webhook reconciler — against the actual frozen migrations in disposable in-process PGlite through the production RPC/read adapter. They do not prove Stripe's behaviour, and three distinctions matter for this stage specifically:

- **A test event is not application enforcement.** Sending a `customer.subscription.updated` test event and seeing a 200 proves the endpoint parses and reconciles. It proves nothing about whether the _feature and seat checks_ then read the new allowance.
- **A synthetic expected plan is not an effective allowance.** Every fixture in `stripe-commercial-fixtures.ts` was written from documentation. A schema detail could be wrong in a way that makes the path fail closed (a hold) rather than visibly break.
- **A deterministic interleaving is not real concurrency.** PGlite is single-connection, so the integration races are awaited-step interleavings. Real multi-connection PostgreSQL behaviour and the ACL/privacy surface were accepted separately; genuine provider-side concurrency and latency are still only testable here.

So the pass below must verify, at isolated-staging level, both the **projection** (what `stripe_subscriptions` / `entitlements` hold) and the **actual consumers** of it: `resolveEntitledPlan` → `PLAN_LIMITS` feature gates, `readTeamSeats` / `readTeamSeatAllowance` working and viewer allowances, `stripe_purchased_working_seats`, and the invitation refusal at capacity (`assert_project_team_seat`). A row is only "passed" when the allowance a user _experiences_ changed, not when a webhook returned 200.

## Prerequisites (all of them, before row 1)

| #   | Prerequisite                                                                                                                                                                                                                                                     | Owner |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | A company-owned Stripe **sandbox/test environment** with its own `acct_…` id. It is its own account; the live and test ids are never assumed equal                                                                                                               | Owner |
| 2   | A **restricted key** `rk_test_…` able to read `GET /v1/account`, and to read/write subscriptions, subscription schedules, subscription items, invoices, invoice payments, payment intents, prices, refunds and billing portal sessions                           | Owner |
| 3   | A webhook endpoint at `https://<staging-host>/api/public/webhooks/stripe`, pinned to **`2026-09-30.endive`**, with its signing secret in `STRIPE_WEBHOOK_SECRET_TEST`                                                                                            | Owner |
| 4   | Products and **prices matching the approved catalogue exactly**: Growth EUR 149, Pro EUR 299 monthly base; extra working seat EUR 15 (Growth) / EUR 12 (Pro), monthly, EUR. A mismatched amount is refused by `validateBaseTerms`/`validateSeatTerms`, by design | Owner |
| 5   | **Both** migrations applied to the isolated staging database: `20261028183000` and `20261028223000`. Applying only the first leaves the webhook unable to project                                                                                                | Codex |
| 6   | The test caller's UUID in `MILO_STRIPE_LIFECYCLE_SANDBOX_OWNERS`, and a persisted `workspace_meta.billing_profile.billingCountry` in an EUR market (e.g. `DE`)                                                                                                   | Codex |
| 7   | Isolated staging only. No production database, no production entitlement row, no live key, and no live-mode object at any point                                                                                                                                  | Codex |
| 8   | The dormant holds **stay in code** for this pass: it exercises test mode only. Removing `liveModeAllowed()` / `liveCommercialMutationsAllowed()` is a separate release decision                                                                                  | Owner |

## Part A — foundation rows carried forward (unchanged, still unexecuted)

These are the accepted foundation's own matrix rows. They remain blocked and are restated here only so one pass covers the whole lifecycle in order.

| #   | Scenario                                  | What it verifies                                                                                                                        |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Initial paid subscription                 | Mapping created before redirect; one projection; the request settled by the webhook, not the return URL                                 |
| A2  | Card decline (`4000000000000002`)         | No grant; no second customer or session; the request not released by age                                                                |
| A3  | SCA / 3DS (`4000002500003155`)            | `incomplete` → `active` ordering; no premature grant; `incomplete` blocks a second checkout                                             |
| A4  | Abandoned checkout                        | `checkout.session.expired` settles exactly that request; a completed session never does                                                 |
| A5  | Creation timeout, then re-entry           | Same `requestId` reuses the idempotency key and creates no second session; past 24h it fences, then recovers from the real session list |
| A6  | Delayed / asynchronous payment            | A paid-proof-less `active` subscription does not grant until the invoice is genuinely paid                                              |
| A7  | Renewal                                   | Period advances from the item period; the minimum across base and seat items is used                                                    |
| A8  | Failed renewal, then recovery             | `past_due` → non-granting; a later `invoice.paid` restores the grant through the same path                                              |
| A9  | Billing portal isolation                  | Own mapped customer only; exactly `billing.stripe.com`; changes arrive as webhooks, not as portal return state                          |
| A10 | Crash, lost ack, redelivery, out-of-order | Receipt retry semantics and the per-receipt replay against real deliveries                                                              |
| A11 | Two workers, lease expiry mid-read        | Lease fencing, wall-clock liveness and bounded renewal under real concurrency and latency                                               |

## Part B — this stage's rows

Each row names the **decisive assertion** and the **enforcement check** that must also pass. "Enforcement" always means: re-read the owner's effective plan and seat allowance through the application's own reads, and confirm what a user can actually do.

### B1 — Plan upgrade, immediate, paid

Growth → Pro, no seats. Prepare, confirm with the displayed amount.

- **Two separate preview POSTs, in this order.** The immediate one carries `subscription_details[items][0][id]` = the **existing** `si_…` id, `[quantity]=1`, `proration_behavior=always_invoice` and a stable `proration_date`, and **no** `preview_mode`. The second carries `preview_mode=recurring` and **no** `proration_date` and no proration parameter at all. Confirm Stripe accepts both shapes and that the recurring one really is a long-term recurring estimate — this is the row that settles whether `preview_mode=recurring` behaves as documented, which local fixtures cannot establish.
- Confirm `amount_due`, `subtotal` and `total` on the immediate preview are the three distinct figures the Invoice object documents, and that the quote stored `amount_due` (charged now) and the recurring preview's `total` (the estimate) separately.
- The update POST carries `payment_behavior=pending_if_incomplete`, the same `proration_date`, and `Idempotency-Key: milo-chg:<account>:test:<operation>`.
- **The invoice provenance sequence, observed in the real trace:** the operation moves `prepared → dispatching` before the POST; the invoice id is taken from the **update response** (confirm Stripe returns it, expanded or as an id); the operation then moves `dispatching → awaiting_payment` recording that id **before** any success is declared.
- **The exact invoice proof.** Confirm the invoice Stripe actually raises carries `billing_reason=subscription_update` (a documented assumption until this row runs), is not the recorded `baseline_invoice_id`, reads `paid` with a real `paid_at`, has `amount_remaining` 0, and has `amount_paid` **exactly** equal to the quoted `amountMinor` to the cent. If Stripe's real figure differs from its own preview the path HOLDS rather than settling — record that as a finding, not a defect to paper over.
- **Enforcement:** the entitlement reads `pro`, `PLAN_LIMITS.pro` gates (image generation, AI evaluation) open, and `readTeamSeats` reports 5 working / 10 viewer.

### B2 — Plan upgrade where payment requires SCA

Same as B1 with `4000002500003155`.

- The update returns with `pending_update` set and the items **unchanged**.
- `confirmSubscriptionChange` returns a held reason and the operation stays non-terminal: `change_invoice_unpaid` while the payment is outstanding, or `change_requires_payment` when `pending_update` is present and the payment has since settled. Confirm the real sequence and that a resumed attempt in `awaiting_payment` issues **no** same-state transition and never regresses `awaiting_apply`.
- **Decisive:** while that operation is open, deliver a `customer.subscription.updated` and an `invoice.paid` for the **previous period's** invoice. The projection must return `operation_pending_hold`, write nothing, and leave the receipt `uncertain`.
- **Enforcement:** the owner still experiences **Growth** — `PLAN_LIMITS.growth` gates, 3 working / 5 viewer seats — throughout.
- Then complete the 3DS challenge and re-confirm: the operation reaches `applied` and only then does the allowance widen.

### B3 — Plan upgrade declined

Same as B1 with `4000000000000002`.

- The items are unchanged; the operation stays non-terminal; `change_not_applied` or `change_requires_payment` is returned.
- **Enforcement:** the Growth allowance is unchanged. Repeat the stale-webhook delivery from B2 and confirm `operation_pending_hold`.

### B4 — Seat purchase (increase)

Pro, 0 → 3 extra working seats.

- Exactly **one** seat item is added, with the plan-specific seat price and `quantity=3`; the base item keeps `quantity=1` and only one base item exists afterwards.
- The configured seat price must equal EUR 12 for Pro, or preparation refuses (`terms_provider_amount_unapproved`).
- **Enforcement:** `stripe_purchased_working_seats` returns 3 and `readTeamSeats` reports **8** working seats (5 bundled + 3 purchased), viewers still 10. Invite an 8th working member: allowed. Invite a 9th: **refused** by `assert_project_team_seat`, with no automatic billing.

### B5 — Seat reduction at period end

Pro with 3 seats → Pro with 0 seats, team currently within the reduced allowance.

- **Two** provider calls: `POST /v1/subscription_schedules` with **only** `from_subscription`, then `POST /v1/subscription_schedules/<id>` with the phases — separate idempotency keys (`:adopt`, `:phases`).
- **Only ONE preview POST happens**, in `preview_mode=recurring`. There is no immediate preview, because nothing is charged now. Confirm the recurring estimate is positive and that the reduction is **not** refused for it — a positive upcoming renewal is not an immediate charge.
- **The adoption reply must match the supported source profile.** This is the decisive new row for the durable payload: capture the raw `from_subscription` response and confirm, field for field, that `default_settings` carries the ten documented terms with `billing_cycle_anchor="automatic"` and `invoice_settings.issuer.type="self"`, that `automatic_tax` is `{enabled:false, liability:null}`, that the single phase carries the thirteen non-body terms with a **null** `collection_method` (inherited) and a null phase `billing_cycle_anchor`, and that each item carries `price`, `quantity`, empty `metadata`, empty `tax_rates` and a legacy `plan` mirror equal to `price`. **If the real reply carries anything else — an inert `discounts: []`, a `billing_thresholds: null`, an extra key — the server HOLDS by design and v1 must be extended.** Record the exact raw reply; that decision is the owner's, not a silent normalisation.
- **The payload is captured before the phases POST.** Confirm in the database that `reduction_dispatch_payload` and `schedule_id` were written together under `dispatching → awaiting_apply` **before** the `:phases` request appears in the provider trace, and that the canonical document is within the 4096-byte bound.
- The resulting schedule has `end_behavior=release`, exactly two phases, the boundary exactly at the current period end, `proration_behavior=none` at the request level **and** on both phases, the **paid phase preserved item-for-item** (price, quantity and order) with its material settings unchanged, and the next phase carrying only the base item with **no** `end_date` or `duration`.
- **No invoice is created and nothing is charged now.** No credit note either.
- Confirm `release` really does hand the subscription back **still running** after the final phase. Finite phases must not end a subscription nobody cancelled; this is a documented assumption until this row runs.
- **Enforcement now:** the allowance is still 8 working seats until the period end, and no member was removed or deactivated.
- **Enforcement at the boundary** (requires either a sandbox clock advance or a short test interval): after the period end the schedule **releases**, the subscription keeps running on the reduced items, and `readTeamSeats` reports 5 working seats. **This row is the renewal-time enforcement gate** named in `STRIPE_COMMERCIAL_OPERATIONS.md` limitation 6 — if the over-limit case cannot be handled here, that gate stays open.

### B6 — Capacity conflict on a reduction (all three bundles)

Pro with 3 seats and **8** active working members → Growth.

- Preparation returns `capacity_conflict_working`; **no quote is issued** and no provider mutation occurs.
- Then prepare a reduction the team does fit, grow the team past the target between preparation and confirmation, and confirm: the **confirmation** must refuse with `capacity_conflict_working`, settle the operation `refused` under an expected state of `prepared`, and dispatch nothing.
- **The project bundle, separately.** With the seats comfortably inside the target, give the owner more projects than the target plan allows (Growth caps at 3) and confirm `capacity_conflict_projects` with no quote issued. Then remove the owner's `workspace_meta` row and confirm the project count reads **unknown**, not zero, and the reduction is held.
- Confirm the released counter's semantics survive on real data: one person holding a working role on several projects is **one** seat, and a pending working invitation still costs a seat.
- **Enforcement:** no member, invitation or project was removed, deactivated, expired or deleted by any refusal.

### B7 — Plan downgrade at period end

Pro (0 seats) → Growth.

- As B5, with the next phase carrying the Growth base price.
- **Enforcement at the boundary:** `PLAN_LIMITS.growth` gates close (image generation, AI evaluation), project cap drops to 3, and seats drop to 3/5. Confirm an over-cap account is held for review rather than silently losing a project.

### B8 — Quote integrity

Against a prepared quote, attempt each of: a different plan; a different seat count; a different amount; a different currency; a second use by another operation id; use after the 15-minute expiry; and use after the subscription's items were changed by an unrelated path.

- Each must be refused with its own code (`quote_tampered`, `quote_consumed`, `quote_expired`, `quote_state_changed`) and **zero** provider mutations.

### B9 — Duplicate, concurrent and replayed confirmations

- Two simultaneous confirmations of the same quote with different operation ids: exactly one proceeds, the other gets `operation_unavailable`.
- Re-send an identical confirmation after a successful one: no second provider mutation, the same result reported from the durable row.
- **Hold one update POST open while a second execution recovers the same operation past 24h**, then let the first response arrive. The second execution must send nothing and fence; the late response must settle that same operation from its own invoice identity; and Stripe's own records must show exactly ONE update and ONE invoice for the key. This is the row that confirms, against the real provider, what the local shared-clock fixture asserts.
- **Kill the process between the update POST and its acknowledgment**, then retry the identical operation. The replay must reuse the same endpoint, the same idempotency key and the **same encoded parameter multiset** rebuilt from the durable selection — then recover the **same** invoice id. Confirm Stripe's retained replay really does return the original response (documented as "at least 24 hours"; this row is what establishes it), and that **no second invoice or item change** occurs.
- Repeat that kill after the registry's configured price for the target plan has been changed and after the subscription's item ids have moved: the replay must still name the ORIGINAL price and item id, and the outcome must be held rather than settled against today's configuration.
- **Kill the process after the capture compare-and-set commits but before its acknowledgment:** the retry must re-read and find the same invoice in the state actually reached, and must not repeat a prohibited same-state write.
- Hold the retry past 24h: the operation fences (slot held, zero dispatches) and only an authoritative read may settle it. An unchanged subscription at that point is **unknown**, not proof of a non-dispatch — confirm nothing is settled `failed` and the projection gate stays held.
- **Two workers resuming the same dispatched state** must both report pending without either claiming success and without either issuing a transition.
- **A stale worker** that read `prepared`, paused, and then fails a capacity, price or quote check while another worker has moved the operation to `dispatching` must be refused by the compare-and-set and must not close the dispatched operation.
- **Kill the connection during `consume_quote`,** so the single-use write may or may not have committed. The retry must not report a refusal: a quote this operation provably consumed continues, an unreadable or absent readback is `quote_consumption_uncertain` with the operation still `prepared` and nothing dispatched, and only a provably expired or other-consumer quote refuses. Confirm the subsequent clean retry completes exactly one change, and that the deadline is re-taken after that readback — crossing 24h there must fence with zero POSTs rather than dispatch.
- **A valid persisted operation that is not this caller's.** Attempt a confirmation for an operation row belonging to another owner, account or mode, and for one whose kind, subscription or quote differs. Each must be refused with the row unchanged and zero provider mutations; the scoped read supplies the operation, owner, account and mode filters and finds nothing.

### B9a — Reduction recovery, read-only

The durable-payload half of B9, and the row that justifies the extra column.

- Kill the process **after the `:adopt` POST and before the schedule/payload capture**. The retry must recover the ORIGINAL reply by an identical retained `:adopt` replay. **This is the row that settles what the local fixture can only model:** locally the fake provider records the adoption effect and its reply before dropping the response, and the retry is served from that record — a deliberate local model, not a claim about Stripe's retention. Confirm Stripe returns the same schedule for the same key, and that recovery never substitutes a `GET /v1/subscription_schedules/<id>` for the original phase content. Repeat with the schedule already visible on the subscription: recovery must still proceed (it is this operation's own adoption), while a schedule id that disagrees with one the operation itself recorded is refused as a conflict.
- Kill the process **after the capture commits and before its acknowledgment**: the retry must resolve it by an exact scoped readback of schedule **and** payload before any `:phases` POST.
- Kill the process **after the `:phases` POST and before its acknowledgment**, then restart, let the billing period roll over, change the configured prices, and come back past 24h. The operation must complete **read-only, with zero POSTs of any kind**, from the stored payload. Then repeat with an altered read-back (a changed paid-phase price or quantity, a moved boundary, a changed payment method or issuer) and confirm it stays held with the payload byte-identical and the boundary unmoved.
- Let the original effective boundary pass while an attempt is in flight: zero POST, no shifted date and no late reduction.

### B10 — Cancellation, reversal and expiry

- Cancel: `cancel_at_period_end=true`, verified by re-read; `cancel_at` equals the current period end; **access continues** for the paid period and no entitlement is written by the cancel path. Confirm the operation reaches `applied` — the slot must be released, not left holding the projection gate.
- Re-cancel with the **same** operation id: the durable `applied` row is reported and no provider call is made. Re-cancel with a **new** operation id while the flag is already set: refused `cancellation_preexisting`, that operation resolved, nothing dispatched.
- **Kill the process after the cancel POST and before its acknowledgment**, then retry the same operation: the flag is this operation's own evidence, it settles with zero new provider calls, and no second intent is created. Repeat with the **finish** acknowledgment lost: the retry reports the same durable result.
- Reverse before expiry: bound to the applied cancel operation; `cancel_at_period_end=false`; renewal proceeds. Attempt a second reversal of the same cancellation: refused. Attempt a reversal naming an operation id that is not an applied cancellation of this owner's exact subscription: `reversal_unavailable`, with nothing created.
- Kill the process after the reversal POST: the retry must settle the same operation rather than reporting a false `cancellation_absent`. With nothing dispatched and no cancellation present, `cancellation_absent` is correct and must resolve **this** operation instead of stranding it.
- Let a cancellation actually expire: `customer.subscription.deleted` arrives, the projection revokes via the **exact mapped subscription**, and the allowance drops to `freePreview`. Then attempt a reversal: refused as `subscription_canceled_irreversible` with **no** subscription recreated.
- Deliver the cancel and delete webhooks **out of order** and duplicated; confirm the monotonicity guard and the receipt semantics hold.

### B11 — Refund lifecycle (operator-approved)

Record an approval with a trusted operator actor, then execute.

- **Full first payment within 14 days:** succeeds; returns to the original payment method; `stripe_refund_policy_uses` now blocks a second case for the same customer and plan.
- **Partial under the guarantee:** refused (`policy_guarantee_requires_full_refund`).
- **Renewal invoice with no exception basis:** refused (`policy_not_first_payment`).
- **Approved outage exception, partial:** succeeds for the approved amount only.
- **Cumulative over-refund:** a second approved case for the same payment beyond the remaining funds is refused by `stripe_commercial_refund_over_reserved`.
- **Pending / requires_action refund:** the operation stays non-terminal and the funds stay reserved; a second case cannot spend them. Only an authoritative **matching** `failed`/`canceled` releases them.
- **Lost acknowledgment:** kill the process after dispatch, retry: the refund is found by its `metadata[milo_refund_case]` from a complete list and **no second refund is created**. Confirm Stripe's `GET /v1/refunds?payment_intent=…` really does list it and carries the metadata back (a documented assumption until this row runs).
- **The empty-list window — the decisive new row.** Hold the refund POST open (or kill it mid-flight) and run a second execution of the **same** operation against a complete, genuinely empty refund list. The second execution must return `refund_outcome_unknown`: the reservation stays `reserved`, the operation stays open, **no** `settle_refund` is called, no status is invented and no second refund is dispatched. Then let the first POST complete and confirm the eventual success reconciles **exactly once**. Repeat the empty-list read past 24h: still unknown, still reserved, still zero dispatch. This is the case that previously released real funds and closed the operation `failed`.
- **Wrong amount, both ways.** Force a create response and separately a recovered list entry whose amount is not the approved one (and separately a wrong currency or PaymentIntent): no settle call, no release, the reservation held, and the refund's identity still recorded so a later recovery cannot be repointed.
- **Settlement state text.** Confirm `settle_refund` returns `reserved`/`settled`/`released` and that an unexpected value or a transport error is treated as uncertainty. Kill the acknowledgment after a successful settle: the identical settlement is repeated, the recorded `refund_id` and amount are unchanged, and no second refund is created. Kill the `finish` acknowledgment: the durable result is reported.
- **Consumed-case replay.** After a successful refund, re-run the same operation id: it must report the durable success with **zero** refund POSTs and no new reservation — never `refund_case_consumed` as a fresh failure. A consumed case with no reservation for the operation is still refused.
- **An ambiguous reservation error must not refuse a healthy approval.** With a healthy approved case, make the `reserve_refund` call fail **before** it can write (kill the connection mid-call), so the scoped re-read legitimately finds no reservation row. The operation must stay `prepared` and recoverable, the case must stay `approved`, no refund POST may happen, and the clean retry must reserve and refund exactly once. Then produce a genuine SQL rejection (a second case over-reserving the same payment) and confirm it still refuses deterministically under the `prepared` compare-and-set. Beyond `prepared` neither variant may close the operation.
- **A released reservation whose operation was never closed.** Force an authoritative `failed` refund so `settle_refund` releases the funds, then lose the `finish` acknowledgment (kill the process between the two writes). Restart against a complete empty refund list: the same operation must be resolved from the durable release with **no** new refund and **no** new reservation, and the reported reason must be the refund's own `refund_failed` — not `refund_case_refused` and never a success. Repeat with the `finish` failing twice and confirm the result is reported as `refund_release_completion_uncertain` with the operation left open, rather than as a finished operation.
- **The creation response must name the approved case.** If Stripe can be made to answer with a refund whose `metadata[milo_refund_case]` is another case's id or absent (for instance by racing two cases on one payment), the execution must stop before any settlement with the funds still reserved and the case still `approved`. This row also confirms that Stripe really echoes the metadata on the create response, which is a documented assumption today.
- **Held dispositions:** a case recorded with `cancelImmediatelyHeld` or `revokeOnRefundHeld` is refused at execution.
- **Enforcement:** after every refund outcome, the entitlement and the seat allowance are **unchanged** by the refund itself. A cancellation, if the case calls for one, is a separate explicit operation.

### B12 — Ambiguous payment allocation (must be refused)

Create one PaymentIntent that settles **two** invoices, then approve a refund for one of them.

- `resolveRefundableAllocation` must return `payment_allocation_ambiguous`, nothing is reserved and no refund is created. This is the row that proves the InvoicePayment allocation is read as an allocation rather than as the payment's total.

### B13 — Invoice failure, mode isolation and the account barrier

- Force an invoice to `uncollectible` / `void`: the projection treats it as authoritatively unpaid, the revoke goes through the exact mapped subscription only.
- Confirm throughout that **no production entitlement row was read or written** by any test-mode activity (the `IF p_mode='live'` block), and that a manual `manualBeta`/`manualComped` row and a legacy `paddle` granting row are both preserved.
- Call `readBillingDeletionBarrier` with a live subscription, an unresolved operation and a reserved refund: each returns `blocked: true`. **Note the gap:** nothing calls it on a deletion path, because no deletion handler exists.

### B14 — Webhook duplication, overlap and ordering under real delivery

Replay Stripe's own deliveries and force overlaps: duplicate `invoice.paid`, an `invoice.paid` for a previous period arriving _after_ a plan change, a `customer.subscription.updated` arriving before its invoice, and two workers processing concurrently.

- Decisive: **no delivery, in any order, widens an allowance while a commercial operation is unresolved**, and none of them revokes an allowance the evidence does not support.
- **The frozen baseline, end to end.** With an open operation, deliver a legitimate **non-granting** observation of a LARGER plan (an observed `past_due` pro/4, invoice unpaid) and confirm it is applied and rewrites the observed row. Then deliver a **granting** pro/4 that now looks equal to that row: it must return `operation_pending_hold`, write nothing and leave the entitlement untouched. Finally deliver the baseline allowance itself (growth/0, granting): it must apply. Repeat the whole sequence with an operation whose baseline could not be proved and confirm **every** granting projection is held while non-granting ones still take effect.
- Confirm no delivery ever reaches the projection with an `active`/`trialing` + paid + future snapshot carried as `p_grants: false`, and that a snapshot whose exact evidence cannot be read produces **zero** projection calls and a retryable receipt.
- **What is already local, and what this row still adds.** The whole sequence above now runs locally through the **exported** `receiveStripeWebhook` against the frozen SQL in synthetic live mode, with the arguments the production reconciler itself computes: unreadable evidence makes zero projection calls, the non-granting `past_due` pro/4 applies and narrows the entitlement, the subsequent paid granting pro/4 is held with the baseline and entitlement unchanged and the receipt left `uncertain`, an unprovable baseline holds every grant, and a test-mode delivery touches no live row. What is still missing is Stripe's own delivery behaviour — real ordering, duplication, latency, redelivery windows and two live workers — plus the allowance a user actually experiences afterwards. This row is about those, not about the gate's logic.

### B15 — Recurring-preview semantics (the one row that settles the estimate wording)

Against a real subscription, take a `preview_mode=recurring` preview and compare it with what the next invoice actually turns out to be.

- Confirm the mode is accepted without a `proration_date`, that prorations/cancellations/trials/pauses are genuinely unsupported there, and that `total` differs from `subtotal` when an invoice-level discount or exclusive tax applies.
- Then add a one-time invoice item or a one-month coupon and confirm the estimate and the actual next debit **differ** — which is exactly why the backend calls it a long-term estimate and never a promised charge. If a real sandbox shows them always equal, the wording may be revisited; until then the honest label stands.
- Confirm a mixed, incomplete or wrong-identity preview is held rather than reported as a number.

### B16 — Which proration marker a real preview line actually carries

The reader accepts the legacy `line.proration` boolean and the current `line.parent.subscription_item_details.proration`, requires them to **agree** when both are present, and holds a line whose marker is present but not a boolean. Every part of that is a documented assumption about field presence, so one row settles it.

- Capture the raw lines of both previews from B1 and B5 and record, per line, which of the two markers is present and its exact JSON type.
- If real lines carry **only** the current form, the legacy branch is dead code kept for compatibility — record that rather than removing it on the strength of one account.
- Record explicitly whether either marker ever arrives as `null` on a real line. A present null is **held** here, exactly like any other non-boolean, so if real previews do use null as "not applicable" that is a matrix finding to take to the owner — not something the reader may quietly read as absence.
- If any real line carries both and they **disagree**, or carries a non-boolean marker, that is a provider shape this packet deliberately **holds**, with no quote issued: it is a matrix finding for the owner, not a bug to paper over by believing one of the two. Record the exact code the caller receives, which is **not** the pure reader's own: the reader returns `preview_line_proration_conflict` / `_unreadable` / `_unknown` and `preview_renewal_lines_present`, and preparation prefixes `preview_` again, so a caller sees `preview_preview_line_proration_conflict`, `preview_preview_line_proration_unreadable`, `preview_preview_line_proration_unknown` or `preview_preview_renewal_lines_present`. Those doubled strings are the contract to log against during the pass.
- Confirm the hold is in fact reachable and visible: a held preparation must create no quote and no operation, so a retry after the shape is understood costs nothing.

## What a passed pass does and does not establish

A complete pass establishes **sandbox acceptance** of the decision logic against real Stripe behaviour in an isolated test account. It does **not** establish:

- production acceptance (the migrations are unapplied in production; the strict installation wrapper's post-apply ACL verification is still required);
- any UI behaviour — there is no billing UI, and the public policy/pricing copy parity gap is open;
- deletion orchestration — there is still no handler;
- renewal-time capacity enforcement — B5's boundary half is the gate, and it stays open until that half actually runs;
- dispute / early-fraud / risk-event handling — not implemented, recorded as a release gap;
- tax, invoice presentation, credit notes or dunning copy;
- any cost figure. No actual Milo or provider cost is known beyond existing evidence, and the OpenAI cost dashboard remains deferred.

**And in the other direction:** the 677 local assertions establish none of the rows above. They are a fake provider and an in-process database. Where a row says "a documented assumption until this row runs", that is literal — no local test, however thorough, can turn Stripe's documentation into Stripe's behaviour.

Public live Checkout and every live financial mutation stay held unconditionally until the owner makes a separate release decision. The sandbox owner allowlist is empty by default, so even a configured test environment has no reachable caller until an owner UUID is added.

**Status of the server stage itself:** the implementation and its local evidence are complete and frozen for review, and **server acceptance is pending independent root review**. Nothing in this document claims provider, sandbox or production acceptance, and no row below has been executed.
