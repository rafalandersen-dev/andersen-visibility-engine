# Beta demo — preparation, recording and acceptance checklist

Updated 12 September 2026. Use with the owner playbook at
`/app/beta-validation` and the public `/demo-script`. This checklist describes
work to perform; unchecked items and the presence of a route are not acceptance
evidence. Paid launch remains on hold.

The full requirements are [R22/R23 and D01–D08](../product/PLAN_REVIEW_2026_09_07.md)
and [launch readiness](../product/LAUNCH_READINESS.md). A walkthrough using saved
records can explain the product while live acceptance remains incomplete. It
does not replace recorded solo/team flows or the required assisted testers.

## Before a walkthrough

- [ ] Choose a suitable owner-approved project and approved viewing audience.
      Use existing permitted records. Do not create synthetic production
      customers, evidence, subscriptions or results to make the demo look ready.
- [ ] Record the environment, exact build/revision, date, operator, project
      reference and intended scenario without storing secrets or private links.
- [ ] Review a saved audit, its date/source and actual recorded findings. If
      none is available, show the entry point and explain that evidence is
      missing. Running a new audit is a separate operation, not a prerequisite
      implied by this checklist.
- [ ] Identify saved Brand Intelligence, accepted facts, claims to avoid and
      any unresolved source or setup gaps. Do not present inferred facts as
      business-owner confirmation.
- [ ] Identify an existing content draft and any saved Milo Score result. A
      missing score is unknown, not a zero score. Generating, improving or
      evaluating content requires the applicable authorization and cost checks.
- [ ] Establish connector status separately for configuration, accepted
      destination, actual publication and verified output. A configured
      connector does not establish any of the later stages.
- [ ] Identify existing Analytics/Search Console evidence, its source and time
      period, and its limitations. Do not infer OAuth readiness from a CSV or
      treat sample data as observed growth.
- [ ] Review current launch gates and blockers in `/app/launch-checklist` and
      the dated delivery records. Local tests or green screen indicators alone
      cannot establish paid-launch approval.
- [ ] Prepare the recording view: mask private account details, client data,
      credentials, recovery links and irrelevant notifications. Review the
      resulting recording before sharing it with an approved audience.

The [June integration log](LIVE-E2E-TEST-LOG.md) is historical evidence. Its
configuration assumptions, migration steps and “architecture-ready” language
must not be reused as proof of the current environment or instructions to repeat
an operation. Use current exact-build and destination-specific evidence.

## Walkthrough using saved evidence

1. Introduce the business and distinguish its interface language, content
   language and target market.
2. Show the saved audit, with its source/date, or explicitly identify the
   missing evidence. Explain readiness rather than promising search rankings.
3. Show the beta or market page and its current payment/acceptance limitations.
4. Open the permitted workspace and explain the existing project setup.
5. Show accepted Brand Intelligence and unresolved facts.
6. Open **Plan** and explain the saved priorities and their evidence.
7. Review an existing draft and distinguish saved content from scheduled work.
8. Show a saved Milo Score and its limitations. Explain the improvement path
   without invoking a new operation unless it is separately authorized.
9. Show the publishing setup and approval state. Label publication and
   destination verification as incomplete unless the evidence proves otherwise.
10. Show available Analytics, Search Console and Authority evidence with dates,
    source, sample size where available and missing-data disclosure. Separate
    crawler requests, AI answers/citations, referrals and conversions.
11. Explain the proposed assisted-beta scope, recorded blockers and the next
    authorized step. An offer or target is not an observed customer result.

Suggested talk track: “Milo connects visibility evidence with planning, drafts,
publication workflows and measurement. Here is what this project has recorded,
and here is what still needs verification.”

## Actual recordings and beta acceptance — still required

- [ ] Record the setup tutorial and real end-to-end solo and team flows using
      suitable owner-approved projects. A sequence of screenshots or a saved
      walkthrough is not proof that the full workflow ran successfully.
- [ ] Cover solo autopilot and team review/mixed operation as separate
      scenarios; account/team structure and autonomy mode are separate choices.
      D07's final role/approval matrix and autopilot review exceptions remain
      unresolved until the owner decides them. Do not invent that authority.
- [ ] Observe logged-out/unattended operation, including overnight behavior,
      approval/version changes, quota conflicts, failure/recovery, revocation,
      notification delivery and uncertain publication outcomes. Verify the
      destination before retrying uncertain work.
- [ ] Complete the required 3–5 assisted testers and record actual task success,
      first value, quality, editing effort, support load, incidents, recovery,
      costs and proof coverage. Do not manufacture participants or feedback.
- [ ] For every scenario, record expected and observed behavior, sanitized
      evidence location, actual spend if incurred, and pass/fail/blocked status.
      Separate a local or sandbox result from production/provider acceptance.
- [ ] Preserve failed and blocked scenarios with the concrete next action and
      responsible owner. Obtain the missing evidence before marking them passed.

None of these unchecked scenarios has been executed by this document update.
Actual provider/model/audit/generation/CMS/Google/DNS operations, invitations,
outreach/email, payments, account or credential changes require the applicable
existing authorization and gates. This checklist grants no new permission and
does not bypass a denied setup path or a release/security-review hold.

## After an authorized session

- [ ] Record observed feedback, confusing screens and unresolved questions in
      the approved tracker; distinguish a proposed improvement from a result.
- [ ] Prepare any follow-up message for review. Send it only when the recipient
      and communication are explicitly authorized; a template is not permission.
- [ ] Store the sanitized recording/evidence in the approved location and link
      the specific acceptance scenario. Review audience permissions before
      sharing, and never put secrets or private recovery URLs in project records.
- [ ] Update the readiness record using verified evidence. Do not increment the
      overall percentage for a script, recording plan or checklist alone.

## Claims and payment wording

Describe Milo as supporting readiness, planning, drafting and measurement.
State what the specific project actually demonstrates. Do not promise rankings,
traffic, revenue, AI citations, publication success or risk reduction that has
not been measured. AI-assisted content remains a draft until appropriately
reviewed; a saved draft is not a live publication. Do not claim vendor
certification or partnerships without evidence.

Stripe is the accepted payment direction; owner setup and payment acceptance
remain incomplete. New paid subscriptions, add-on activation and marketplace
purchases are on hold. Manual invoicing is planned, not an established payment
workaround or authorization to collect money. Existing linked subscriptions use
the existing Billing/support path; do not claim a working Stripe portal without
verification. Preserve the published 14-day first-payment guarantee and other
existing customer commitments while commercial/policy reconciliation proceeds.

Suggested wording: “Paid launch remains on hold while Stripe setup, testing and
commercial acceptance are completed. We can review the proposed beta scope and
what has been verified; this walkthrough does not activate a paid service.”
