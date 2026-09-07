# Company account ownership

Default owner/admin/billing address for Andersen Innovations: rafi@anderseninnovations.com. Client-owned assets retain client ownership. Never store credentials, recovery links or payment secrets here.

| Service / account | Current evidence | Remaining work |
| --- | --- | --- |
| Milo Growth application owner account | Existing owner's primary email changed to rafi@anderseninnovations.com at the user's explicit request on2026-09-07 through Auth Admin API. Same account,10 projects, owner role and agency/manualComped plan retained. Existing Google login identity preserved. | No fresh login or mailbox-delivery test. New email identity is not marked verified; the existing account-confirmation timestamp was retained by the administrative update. No operational test email sent. |
| Lovable workspace / infrastructure account | Distinct from the Milo application account. This operation made no Lovable account change. | Ownership/admin-address verification remains separate. |
| Cloudflare account inspected for public audit | Earlier read-only discovery found private-email ownership; no new company resources created there. | Resolve the recorded ownership exception without duplicating resources. See evidence/public-audit-account-discovery-2026-09-07.md. |
| Andersen Intelligence Render account | Company owner confirmed rafi@anderseninnovations.com as owner/admin in the standing project instructions. | This ownership fact does not verify individual service variables or downstream integrations. |

The Milo update did not change passwords, MFA, roles, entitlements, customer data or the Google account. Its Auth request succeeded and stored state was re-read after completion. No temporary extension or fixture remains. Delivery configuration and authenticated journeys are separate evidence.
