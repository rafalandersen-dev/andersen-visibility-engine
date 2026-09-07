# Stripe isolated acceptance harness

Scope R21; owner Rafal Andersen. Implementation and setup packet: docs/billing/STRIPE_SANDBOX_ACCEPTANCE.md.

Combined with main #79: 1,546 tests across118 files, TypeScript and production build pass. Thirty-four added cases cover incomplete/live configuration, owner-role failure, injected checkout fields, fixed account/price/destination, stable retry identity, unsafe provider replies, no automatic retry, signature freshness/tampering/rotation, correctly signed live-event rejection, body size/time bounds, metadata-only persistence, journal duplicates/conflicts/order/cap and SQL grants. Focused standard lint and diff checks pass. Protected owner/browser/mobile acceptance remains open.

Exact migration20260907210000 was also exercised on the connected PostgreSQL database inside a fully rolled-back transaction: record then duplicate returned expected results, anon table reads/authenticated RPC denied. Follow-up fixture table absent=true; entitlement count unchanged1. Migration is not yet installed/registered permanently. No Stripe API, payment, account creation, product/price setup, secret read/write or feature-gate mutation occurred. Real sandbox account/delivery acceptance remains pending owner access/configuration.
