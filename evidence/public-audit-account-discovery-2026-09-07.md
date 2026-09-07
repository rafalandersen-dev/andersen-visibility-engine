# Public audit infrastructure discovery — read-only

Scope remains issue #43: discovery and concrete staging design, without resource, routing, DNS, secret or production public-audit changes.

| Surface | Verified observation | Limit |
| --- | --- | --- |
| DNS | milogrowth.com uses ns63.domaincontrol.com and ns64.domaincontrol.com; A 185.158.133.1 | GoDaddy nameservers do not prove administrative or registrar ownership |
| Staging hostname | staging.milogrowth.com returns NXDOMAIN | No isolated staging origin established |
| Cloudflare access | Existing OAuth account 0fe72a185502985c75142f4397992504, personal account email rafal.andersen@gmail.com | Ownership exception against company default rafi@anderseninnovations.com; no new company resources created |
| Workers | milo-public-audit and milo-public-audit-staging deployments/secrets-list requests return Worker-not-found (10007) in inspected account | Not proof of absence in all other accounts |
| Turnstile | Default human-readable list returns no widgets | No staging or production widget provisioned; secret-bearing JSON not requested |
| Vercel | Existing CLI session rafalandersen-dev; domain inspection in andersen-hq says domain not found | GitHub preview deployments do exist; domain production is not established by those previews |
| GitHub | Repository secret names: CLAUDE_CODE_OAUTH_TOKEN; variable names list empty | No values retrieved; external settings remain independent |
| Isolated Supabase | Lovable lists Supabase and Stripe integrations as enabled; no isolated database verified | Do not reuse production database/credentials as staging |

Preferred staging design still requires a protected staging origin and separate database, a staging-only Turnstile widget and a bounded AI gateway budget. If that origin cannot be routed independently, evaluate a Worker-hosted test harness under a dedicated staging hostname. Resolve verified company account administration and actual DNS control before presenting exact infrastructure mutations for approval. No account ownership change, resource creation, DNS update, paid provider call or deploy was performed during this discovery.
