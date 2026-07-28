# Milo Growth — Operations

**Status:** Canonical operating baseline  
**Last updated:** 2026-07-28  
**Product Lead / incident owner:** Rafal Andersen

Do not store secret values in this file.

## Environments and hosting

| Item                              | Current state                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Public domain                     | `https://milogrowth.com`                                                                                        |
| Hosting / publishing              | Lovable Cloud                                                                                                   |
| Platform hostname                 | `milo-growth.lovable.app`, redirected to the custom domain                                                      |
| Public edge                       | Dedicated Worker code current at `8037524` (Gemini boundary + disabled staging harness); not deployed or routed |
| Source repository                 | `rafalandersen-dev/andersen-visibility-engine`                                                                  |
| Current repository implementation | PR #46 merged at `80375249dfcf9e371d82ebf7c28f2983fc4ab047`                                                     |
| Custom-domain production          | Older pre-PR-#36 deployment confirmed during issue #37 Gate 0                                                   |
| Database                          | Lovable Cloud / Supabase-backed project                                                                         |
| Isolated staging data plane       | Not confirmed                                                                                                   |
| Preview                           | Protected authenticated preview confirmed                                                                       |

## Public-audit release dependencies

ADR-0001 replaces the edge-to-Lovable shared-header design with a dedicated Worker. The following remain unconfigured until a bounded mutation package under issue #43 authorises the relevant environment stage:

- Worker-only `PUBLIC_AUDIT_IP_SALT`;
- Worker-only `TURNSTILE_SECRET_KEY`;
- Worker-only `GEMINI_API_KEY` from a dedicated paid Google Cloud project with
  quota and budget controls (PR #45 removed the Lovable AI-gateway dependency);
- Worker-only Supabase URL and service-role credential;
- exact production/staging hostname allowlists;
- staging harness names `PUBLIC_AUDIT_STAGING_HARNESS_HOST` and
  `PUBLIC_AUDIT_STAGING_TURNSTILE_SITE_KEY`, committed empty; the full
  presence matrix is in `docs/PUBLIC-AUDIT-STAGING-HARNESS.md`;
- public `VITE_PUBLIC_AUDIT_API_URL` and `VITE_TURNSTILE_SITE_KEY`;
- migrations `20260727220000_public_audit_safety.sql` and `20260727223000_public_audit_fetch_budget.sql`;
- Cloudflare Worker route/custom domain, with `workers.dev` and public preview URLs disabled;
- isolated staging data plane and rollback routing.

`PUBLIC_AUDIT_EDGE_SECRET` and `X-Milo-Edge-Auth` are not part of the selected architecture. Do not configure public-audit service credentials in Lovable, and do not reintroduce `LOVABLE_API_KEY` or Lovable AI-gateway endpoints into the external Worker.

## Ownership

| Responsibility                 | Owner                                                          |
| ------------------------------ | -------------------------------------------------------------- |
| Product and release decision   | Rafal Andersen                                                 |
| Production publishing          | Rafal Andersen                                                 |
| Incident decision and rollback | Rafal Andersen                                                 |
| Security review                | Named independent reviewer under the Delegation/Release Packet |
| Database migration execution   | Must be explicitly assigned in the approved production release |
| Secret ownership and rotation  | Must be explicitly assigned before configuration               |

## Incident and rollback baseline

For a public-audit trust-boundary or cost-control failure:

1. disable the AI audit or route it to deterministic no-AI fallback;
2. remove public routing to the vulnerable path if necessary;
3. restore the prior known deployment;
4. preserve evidence without secret values or personal data;
5. rotate the edge secret and IP salt only through the designated owner if exposure is suspected;
6. do not drop additive tables/functions during incident response;
7. record the incident, decision, evidence and next action.

## Known operating gaps

- dedicated Worker boundary (including the Gemini provider and the disabled
  staging harness) is implemented, verified and merged but not staged;
- Worker outbound-fetch residual risk needs staging security verification;
- account-level Cloudflare, Supabase and Google Cloud state is unverified; the
  read-only SET / NOT SET discovery under issue #43 has not been authorised;
- isolated staging is unconfirmed; no staging environment, credential, widget,
  Gemini key or data plane exists;
- production configuration presence matrix is not established;
- final legal operator and support/security mailboxes remain incomplete;
- production billing authority and authenticated hard AI limits remain incomplete.
