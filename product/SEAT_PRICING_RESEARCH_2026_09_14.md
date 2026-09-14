# Team seat pricing — research and proposed numbers, 14 September 2026

**Status:** model and numbers approved by the owner on 14 September 2026 (see `DECISIONS.md`). Seat bundles and enforcement are implemented locally in `src/lib/billing.ts` (`PLAN_SEATS`) and candidate migration `20260914150000_project_team_seats.sql`; extra-seat sales, Stripe seat items and pricing-page copy are not built. Competitor figures were verified against official pricing pages on 14 September 2026 (see section 2).

**Owner direction (14 September):** the owning business account pays for team access, and the price should scale with the number of people who have access.

## 1. What Milo charges today (from code)

`src/lib/billing.ts` `PLAN_PRICING` is monthly per billing market. There is no seat concept.

| Market | Starter | Growth | Pro | Agency |
| --- | --- | --- | --- | --- |
| EU / Other (EUR) | 79 | 149 | 299 | 449 |
| Poland (PLN) | 249 | 599 | 1,199 | 1,999 |
| Sweden (SEK) | 799 | 1,499 | 2,999 | 4,499 |
| Denmark (DKK) | 549 | 999 | 1,999 | 2,999 |
| UK (GBP) | 69 | 129 | 249 | 379 |

- **Plan limits:** projects are 1 / 3 / 5 / 15, and AI credits 300 / 1,200 / 4,000 / 9,000 per month.
- **Add-ons:** Assisted Setup €349 one-time; Monthly Care €149/month.
- **Legacy:** `src/lib/pricing.ts` still has older PLN values (Starter 149, Growth 249, Extra Project 99). Reconcile or delete it before any pricing change.

**Team access in code:**
- **Roles:** viewer, editor and reviewer.
- **Technical member ceiling:** 1,000 active members per project. This is a safety bound, not a commercial limit.
- **Chat usage:** any member can chat. Per actor there are 60 messages/hour, 10/minute and 200 conversations; each message runs up to one routing plus two specialist model calls. Replies are charged to the initiating actor's account allowance. Consented Google checks use the owner's connection and quotas.

**What seats cost Milo:**
- **Near zero per seat:** storage, notification delivery and auth.
- **Real variable cost:** AI usage per active person (chat replies, generation, checks), which scales with activity rather than seat count.
- **Not measured:** no chat cost per message has been measured yet. The USD 5 benchmark is still unused.

## 2. How comparable products price seats

**Verified 14 September 2026** by fetching each vendor's official pricing page (list prices as displayed; several pages show annual-billing prices, noted below). Prices change often, so re-check before a final decision. Peec AI could not be verified: its page shows plan names without amounts.

| Product (source) | Plans and list prices | Seats included | Extra seat | Pattern |
| --- | --- | --- | --- | --- |
| Semrush (semrush.com/prices) | SEO $139, Starter $199, Pro+ $299, Advanced $549 per month; annual billing shown as $117.33 / $165.17 / $248.17 / $455.67 | Not stated on the pricing page | "Starting at $45/mo" per additional user | Base plan + paid extra seats |
| Ahrefs (ahrefs.com/pricing) | Lite $129, Standard $249, Advanced $449, Enterprise $1,499 (annual commitment) per month | 1 user in every plan | Lite up to 2 more at $40; Standard up to 5 more at $60; Advanced up to 10 more at $80 per user per month | Base + paid seats, pricier and larger caps on higher tiers |
| SE Ranking (seranking.com/pricing) | Core $129, Growth $279 per month ($103.20 / $223.20 on annual billing, 20% off); Enterprise custom | Core 1 manager seat, Growth 3 manager seats | "From $16" per extra manager seat per month | Seats bundled by tier + cheap add-on |
| Surfer (surferseo.com/pricing, EUR, annual billing) | Discovery €49, Standard €99, Pro €182, Peace of Mind €299, Enterprise €999; AI Search Analytics €82 | 1 / 3 / 5 / 10 / custom; AI Search Analytics 5 | Not shown on the page | Seats bundled by tier |
| AgencyAnalytics (agencyanalytics.com/pricing) | $20 per client per month on annual billing (20% off monthly); enterprise from 25+ clients | Unlimited staff and client users | None | Price by clients, not people; client logins free |
| Otterly AI (otterly.ai/pricing) | Lite $29 (15 prompts), Standard $189 (100), Premium $489 (400) per month; 15% off annually; +$99 per 100 prompts | Unlimited team members | None | Price by monitored prompts, not people |
| Peec AI (peec.ai/pricing) | Starter / Pro / Advanced / Enterprise; amounts not shown on the fetched page. Third-party reviews dated 2026 report Starter $95, Pro $245, Advanced $495 per month (15% off annually), priced by tracked prompts (50 / 150 / 350) | Unlimited users, per those reviews | None | Price by monitored prompts; secondary sources only |
| Nimt (recorded 7 Sept in `NOTIFICATIONS_AND_PACKAGING.md`) | Credit packs (e.g. 10,000 credits for €79/month) | — | — | Price by usage units |

**Pattern (unchanged by verification):** SEO suites bundle one to a few seats per tier and sell extra editing seats, from about $16 (SE Ranking) up to $40–$80 (Ahrefs) and $45+ (Semrush). Content and reporting tools bundle more seats by tier (Surfer 1/3/5/10). Agency and AI-visibility tools price by clients or monitored scope with unlimited people. Read-only client viewers are free where they exist. The expensive part (usage) is capped per account, not multiplied by seats.

## 3. Proposed seat model for Milo

1. **Bundle seats per plan** so a small team never sees a seat charge on day one.
2. **Charge for extra "working" seats:** editors and reviewers, the people who chat, edit, review or trigger checks.
3. **Make viewer seats free**, but still bounded. Agencies can invite clients to read reports and approve without extra cost.
4. **Keep AI usage pooled per business account.** Seats do not add AI allowance; heavier use is sold as usage add-ons ("more articles / images / monitoring"). This matches the recorded packaging rule and stops seats from multiplying provider cost.
5. **Add per-seat fair-use limits**, which already exist for chat (60/hour), so one seat cannot drain the pooled allowance unnoticed.

### Proposed numbers (EUR list prices; other markets scaled like today's table)

| Plan | Included working seats (owner counts) | Free viewer seats | Extra working seat / month |
| --- | --- | --- | --- |
| Starter €79 | 2 | 2 | €15 |
| Growth €149 | 3 | 5 | €15 |
| Pro €299 | 5 | 10 | €12 |
| Agency €449 | 10 | 50 | €10 |

**Rationale:**
- Today's plans already imply roughly €30–€50 of value per included working person at mid tiers.
- An extra seat at €10–€15 sits at SE Ranking's level (from $16) and well below Ahrefs ($40–$80) and Semrush ($45+). That is deliberate for SMBs, while still charging meaningfully as teams grow.
- The bundled 2 / 3 / 5 / 10 seats compare with Surfer's 1 / 3 / 5 / 10 at €49 / €99 / €182 / €299, so Milo's Starter bundle is slightly more generous and the higher tiers match a known market pattern.
- The seat price falls on higher tiers to reward agencies.

**Suggested market scaling** (same ratios as the current Growth/Pro prices): PLN ≈ ×4 (e.g. €15 → 59 PLN, €10 → 39 PLN), SEK ≈ ×10 (149 / 99 SEK), DKK ≈ ×6.7 (99 / 69 DKK), GBP ≈ ×0.86 (£13 / £9). Round to local price points.

**Example bills:**
- Growth business with 5 working people: €149 + 2 × €15 = **€179/month**.
- Agency with 14 staff and 30 client viewers: €449 + 4 × €10 = **€489/month**.

## 4. Margin check before setting final numbers

The recorded rule in `NOTIFICATIONS_AND_PACKAGING.md` is: minimum price = C / (1 − M), where C is full variable cost and M the target margin.

- Seats barely change C; pooled usage does.
- Before launch, measure C for a typical, a high-use and a maximum-use active seat: chat messages, generations, checks and the payment fee. Confirm that the included seats plus the pooled allowance stay profitable at the plan's maximum allowed usage.
- **If the maximum-use cost per working seat exceeds about €10:** either lower the included chat fair-use limit, or raise the extra-seat price on Starter/Growth.

## 5. Decisions needed from the owner

1. Approve the model: bundled seats, paid working seats, free bounded viewers, pooled usage.
2. Confirm or change the included seats and the €15 / €12 / €10 extra-seat prices.
3. Decide whether reviewers count as working seats. This proposal says yes.
4. Decide what happens at the limit: block new invitations, or allow and bill pro-rata. Recommendation: block, and show the upgrade or add-seat option.
5. After approval, still required:
   - re-check of competitor prices at decision time (verified once on 14 September 2026, except Peec AI);
   - measured cost per active seat;
   - seat metering and enforcement in membership invites;
   - Stripe quantity-based seat items;
   - pricing page and terms copy in all active languages.
