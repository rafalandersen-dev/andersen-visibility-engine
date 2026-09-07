# Lovable console observations — September 7

The owner explicitly provided logged-in Safari access. These are read-only observations except the separately recorded application publish. No AI requests, email, payment, purchase, permission toggle, secret or domain change was triggered here.

## AI activity

More → AI, Last 30 days, inspected around 20:17 UTC: 20 AI requests, 0.20 displayed credits, 100.0% success, average 9,801 ms. The visible 20 rows all use google/gemini-3-flash-preview, generic AI chat labels, and ages from 7 to 29 days. Three expanded metadata samples:

| Input tokens | Output tokens | Displayed credits | Duration |
| --- | --- | --- | --- |
| 8,726 | 1,207 | 0.02 | 9.8 s |
| 8,729 | 945 | 0.01 | 7.5 s |
| 8,440 | 1,593 | 0.02 | 12.9 s |

These rounded historical values are not an article/image/scan benchmark, nor do they identify workload completion or effective cash paid. The panel says No payload; the option to enable request/response visibility was left off. No prompts or responses were collected.

Workspace API confirms Business plan and owner membership. Official [credit documentation](https://docs.lovable.dev/introduction/credits-and-usage) currently lists Business top-ups at USD 0.60 per credit; this is a published replacement-price scenario, not the verified effective price of the owner's grants or subscription. At that scenario, 0.20 displayed credits corresponds to USD 0.12 before any account-specific tax or grant treatment. Do not use a rounded display or this scenario as a precise production reservation rate. Provider adapters, bounded workload measurement and the USD 5 test authorization remain outstanding.

## Email sender

More → Cloud → Emails → App emails shows Notification, sender Milo Growth <noreply@milogrowth.com>, preview subject Your monthly plan is ready. Manage workspace domains marks milogrowth.com as the current Verified email domain. This establishes configured sender-domain status, not delivery or the operational worker's runtime flag. No Send test action was executed and no recurring notification preference was changed.

The application owner's stored address is already rafi@anderseninnovations.com. Fresh mailbox verification and delivery are separate from the completed administrative email change.

## Security scan interpretation

The basic scanner showed eight warnings, including missing confirmed policies for secret/token/internal tables, security-definer execution and a mutable function search path. Read-only catalog inspection found RLS enabled with zero policies on inspected MCP/OAuth/publish-secret/link-network tables (deny-all for ordinary callers). AI expense tables additionally revoke ordinary SELECT access. Do not add permissive owner policies merely to silence those warnings.

The public-executable security-definer identified by catalog inspection is workspace_entities_project_cap(), which returns trigger, rather than a public data-reading RPC. tg_workspace_meta_updated_at() has no configured search_path and returns trigger. Their execute/search-path hygiene remains a scoped follow-up; this is not evidence of an exposed credential. Authenticated RPCs must be reviewed individually because legitimate workspace and preference operations intentionally use them. No warning was ignored and no security control was disabled.
