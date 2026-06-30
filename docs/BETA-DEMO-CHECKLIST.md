# Beta Demo — Technical & Readiness Checklist

Internal checklist for running an assisted-beta demo of Milo Growth. Pair this
with the in-app owner playbook at `/app/beta-validation` and the public
`/demo-script`.

## Before the demo
- [ ] **Free audit** works — run `/free-ai-visibility-audit` on the prospect's
      site (or a known good site) and confirm a score + issues render.
- [ ] **Example project ready** — a demo project exists with realistic data.
- [ ] **Brand Intelligence filled** — voice, claims and at least one offer set.
- [ ] **One content draft ready** — a generated asset with a clear title.
- [ ] **Milo Score ready** — that draft has at least one Milo Score evaluation.
- [ ] **Connector status known** — know which connector is configured and
      whether it's been live-tested (see `docs/LIVE-E2E-TEST-LOG.md`).
- [ ] **Analytics / GSC status known** — know if events/CSV/OAuth data exist for
      the demo project; if not, say data is pending, don't improvise.
- [ ] **Launch checklist** reviewed (`/app/launch-checklist`) — essentials green.
- [ ] **Billing/payment wording** ready (see below).
- [ ] **Follow-up message** drafted (outreach templates in `/app/beta-validation`).

## During the demo (12–13 steps)
1. Start with the prospect's website (or a known demo site).
2. Run the **Free AI Visibility Audit** live.
3. Explain the score: **readiness, not rankings**.
4. Show the public beta/market page briefly.
5. Open the Milo app.
6. Show onboarding / project setup.
7. Show Brand Intelligence.
8. Show Opportunities.
9. Generate or show a content draft.
10. Show Milo Score and Improve Draft.
11. Show the publishing connector path.
12. Show Analytics v2 + GSC Lite + Authority Builder.
13. Close with the 30-day beta offer and the next step.

Talk track: *"Milo does not just write content. It connects planning, content,
publishing and measurement."*

## After the demo
- [ ] Capture feedback (scores + open questions — template in `/app/beta-validation`).
- [ ] Record objections and any confusing screens.
- [ ] Send the follow-up message with 3–5 concrete improvements.
- [ ] Update the prospect tracker status.

## Safe claims (say these)
- Milo improves **readiness, clarity, content quality, publishing consistency
  and measurement.**
- AI output is a **draft**; Brand Intelligence + Milo Score + review reduce risk;
  the business reviews before publishing.

## What to avoid saying
- ❌ Guaranteed rankings, traffic, revenue or AI citations.
- ❌ "We're certified/partnered with Google/Shopify/WordPress."
- ❌ Claiming a connector or live payment is fully live if it hasn't been
      live-tested for that customer — say it's architecture-ready and confirmed
      during assisted setup.

## Current pending limitations (state honestly if asked)
- Live card payments are pending company/Paddle setup (manual for beta).
- WordPress / Shopify connectors need a live end-to-end test per site.
- Google Search Console OAuth sync needs the OAuth env configured; CSV import
  works regardless.
- Analytics/GSC proof depends on data availability for the demo project.

## How to explain payments pending
> **Live card payments are pending company/Paddle setup. For first assisted beta
> customers, activation and payment are handled manually.**
