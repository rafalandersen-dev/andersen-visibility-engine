# Milo Growth — Operations

**Status:** Canonical operating baseline  
**Last updated:** 2026-07-28  
**Product Lead / incident owner:** Rafal Andersen

Do not store secret values in this file.

## Environments and hosting

| Item                              | Current state                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Public domain                     | `https://milogrowth.com`                                                                                |
| Hosting / publishing              | Lovable Cloud                                                                                           |
| Platform hostname                 | `milo-growth.lovable.app`, redirected to the custom domain                                              |
| Public edge                       | Dedicated Worker code merged at `cfeff9f`; not deployed or routed                                         |
| Source repository                 | `rafalandersen-dev/andersen-visibility-engine`                                                          |
| Current repository implementation | PR #41 merged at `cfeff9fcdc0ece06824a8c980061672e27a27282`                                             |
| Custom-domain production          | Older pre-PR-#36 deployment confirmed during issue #37 Gate 0                                           |
| Database                          | Lovable Cloud / Supabase-backed project                                                                 |
| Isolated staging data plane       | Not confirmed                                                                                           |
| Preview                           | Protected authenticated preview confirmed                                                               |

## Public-audit release dependencies

ADR-0001 replaces the edge-to-Lovable shared-header design with a dedicated Worker. The following remain unconfigured until issue #37 authorises the relevant environment stage:

- Worker-only `PUBLIC_AUDIT_IP_SALT`;
- Worker-only `TURNSTILE_SECRET_KEY`;
- Worker-only AI gateway credential;
- Worker-only Supabase URL and service-role credential;
- exact production/staging hostname allowlists;
- public `VITE_PUBLIC_AUDIT_API_URL` and `VITE_TURNSTILE_SITE_KEY`;
- migrations `20260727220000_public_audit_safety.sql` and `20260727223000_public_audit_fetch_budget.sql`;
- Cloudflare Worker route/custom domain, with `workers.dev` and public preview URLs disabled;
- isolated staging data plane and rollback routing.

`PUBLIC_AUDIT_EDGE_SECRET` and `X-Milo-Edge-Auth` are not part of the selected architecture. Do not configure public-audit service credentials in Lovable.

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

- dedicated Worker boundary is implemented, independently verified and merged but not staged;
- Worker outbound-fetch residual risk needs staging security verification;
- isolated staging is unconfirmed;
- production configuration presence matrix is not established;
- final legal operator and support/security mailboxes remain incomplete;
- production billing authority and authenticated hard AI limits remain incomplete.
