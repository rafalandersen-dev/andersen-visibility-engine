# Policy payment-provider alignment — 12 September 2026

Status: prepared candidate; not released. Overall completion remains approximately 60%; paid launch remains NO-GO. This copy update does not complete legal review, configured Stripe acceptance, or commercial rollout.

## Scope and basis

The Terms and Refund Policy still described Paddle as the active merchant of record. The recorded owner decision in `product/DECISIONS.md` is that Stripe replaces Paddle; `product/CURRENT_STATE.md` still records owner-deferred Stripe setup and outstanding configured sandbox, lifecycle and commercial acceptance.

Both pages now describe Stripe as the planned payment provider and state that public paid checkout remains on hold pending setup and billing validation. Seller, payment-provider, tax and invoice details must be shown before payment. The copy does not assign Stripe a merchant-of-record role: [Stripe's official Managed Payments documentation](https://docs.stripe.com/payments/managed-payments) distinguishes its Managed Payments merchant-of-record offering from other Stripe products. No account or integration evidence establishes that offering for Milo.

Refund instructions now refer to a payment receipt and refunds returned to the original payment method, removing Paddle-specific processing assumptions. Operator identity and contact details are unchanged. All guarantee periods, eligibility, renewal exceptions, cancellation terms, response times and refund posting times are preserved. The existing 30-day price-change notice is unchanged. Existing subscriptions and manual payments still require D08 verification before migration; this change makes no assertion about their absence.

Only these two pages show 12 September 2026 as their update date. `LegalPage` accepts an optional date while retaining the existing shared default for untouched pages.

## Verification

- Rendered before/after comparison against parent `934e134d7dd0ee3d2490f7680137118d5c3b1f2e`: 25 sections inspected; 22 unchanged. Only Terms “Plans, subscriptions and billing” and Refund Policy “Who you buy from” / “How to request a refund” changed.
- Section inventory, page titles and introductions unchanged. The refund-request section matches exactly after the two intended provider-neutral substitutions; the 30-day notice matches the original. Both per-page update dates verified.
- TypeScript check, focused ESLint, production build and whitespace check passed. No new tests added for this bounded copy change.
- Local evidence: `/tmp/milo-policy-provider-comparison.json`, `/tmp/milo-policy-provider-types.log`, `/tmp/milo-policy-provider-lint.log`, `/tmp/milo-policy-provider-build.log`.

No checkout, payment, refund, email, migration, provider configuration or deployment was executed. Legal/commercial acceptance and the existing release-review hold remain outstanding. This branch is a coordinated independent copy stream for integration into the active prepared delivery candidate; it must not bypass the release gates.
