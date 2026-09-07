# Stripe sandbox acceptance packet

This is an owner-only test checkout and a separate metadata receipt journal. It does not implement or activate production subscriptions. Test purchases, renewals and cancellations cannot write entitlements. Existing manual access and legacy Paddle billing remain separate until the production lifecycle and subscriber migration are designed and verified.

## Verified baseline

2026-09-07 production entitlements: one manual/manualComped agency account, zero customer links and zero subscription links. Vendor-account inventory remains unverified; this database count does not establish that there are no external Stripe/Paddle customers.

The connected tool inventory lists Stripe capability but does not expose its account owner, environment or secret configuration. Do not create a duplicate account. Company-owned Stripe administration must use rafi@anderseninnovations.com; any existing personal-account exception must be recorded and resolved without losing resources/history. No account, product, price, key, subscription or webhook endpoint was created during this packet.

## Configuration needed for a real test

Use the existing company-owned Stripe sandbox/test environment. Keep live keys and live price IDs out of this packet. Store secrets in the application's secure server environment, not in chat, source, screenshots or logs. For Lovable API integrations the documented entry is Cloud → Secrets; ensure values reach this TanStack server runtime rather than an unrelated edge function.

| Server variable | Purpose |
| --- | --- |
| `STRIPE_SANDBOX_SECRET_KEY` | Existing sandbox secret key; only `sk_test_` is accepted |
| `STRIPE_SANDBOX_PRICE_ID` | One existing recurring test Price; not a proposed Milo retail price |
| `STRIPE_SANDBOX_WEBHOOK_SECRET` | Signing secret for the dedicated test endpoint below |
| `MILO_STRIPE_SANDBOX_ENABLED` | Explicit `true` enables the owner test panel only after both checkout and webhook config are present |

Dedicated endpoint: `https://milogrowth.com/api/public/webhooks/stripe-sandbox`. Configure **test events only** for checkout completion, customer subscription created/updated/deleted, invoice paid/payment failed and charge refunded. The explicit REST version used to create sessions is `2024-06-20`; receipt parsing stores only stable envelope metadata, without assuming version-specific subscription item shapes.

This is a custom isolated acceptance adapter. Lovable's built-in Payments UI is a different integration path and may manage accounts, product synchronization and live environment changes. Do not enable or replace that integration implicitly while configuring this packet. Inspect the existing setup first.

## Bounded owner test procedure

1. Verify the account is company-owned and the selected key, Price and webhook are from the same test environment. Review the prepared implementation and applied receipt migration before enabling it.
2. Sign in to Milo as a server-verified owner. Billing shows the Stripe test panel only when configuration is ready. The session uses the company email and authenticated account reference, a fixed return URL and server-selected Price. It cannot accept a client-supplied customer, plan, Price, return URL or account ID.
3. Start one test checkout. Use Stripe's documented test payment details. A timeout has an uncertain outcome: use the same panel retry (same request ID) instead of opening repeated attempts. There is no automatic retry. A new page/session creates a new attempt, so inspect Stripe before restarting after navigation.
4. Record Stripe's test session/event IDs and a redacted event-delivery result, never private checkout URLs, key values or full event payloads. Returning to Milo is not payment or subscription proof.
5. Redeliver the same signed event; verify a duplicate receipt. Verify test renewal, cancellation, failed-payment and refund events arrive as metadata. These are receipt checks, not production entitlement lifecycle acceptance.
6. Verify the existing production entitlement remains unchanged, and no live mode object or real charge was created. Disable the test gate when acceptance is finished.

## Controls and limits

- Server authentication and owner-role RPC checks precede configuration/API access. Role errors deny access.
- Test key plus explicit gate is mandatory; signed live events are rejected. Test session responses require livemode=false, a cs_test_ ID and a credential-free HTTPS checkout.stripe.com destination.
- Fixed Stripe origin, redirects rejected, 15-second request/body deadline, 256KiB body cap, no automatic HTTP retry, stable account/request idempotency key. Raw provider errors are replaced with generic failures.
- Raw webhook body is HMAC verified (timestamp tolerance300s, constant-time digest comparison, rotation signatures supported), parsed and discarded. The journal stores event ID/type/time, object ID and SHA256 fingerprint only. Duplicate receipt+same contents succeeds; conflicting same-event contents fails for review. Persistence errors return503.
- Receipt table/function are service-role-only with RLS. A serialized 2,000-event diagnostic cap rejects new receipts without pruning replay history. No production entitlement table or billing-event ledger is touched.
- Production checkout/portal, lifecycle synchronization, out-of-order entitlement handling, refunds/tax/invoices, pricing/legal copy and migration remain R21 work. A sandbox event journal does not satisfy these gates.

## Sources

[Stripe subscription Checkout](https://docs.stripe.com/payments/checkout/build-subscriptions), [webhook signatures, retries and event ordering](https://docs.stripe.com/webhooks), [subscription events](https://docs.stripe.com/billing/subscriptions/webhooks), [Lovable API integration secrets](https://docs.lovable.dev/integrations/introduction), [Lovable built-in Payments behavior](https://docs.lovable.dev/features/payments). The custom receipt journal deliberately makes no subscription state inference from event arrival order.
