# Milo Growth — Operations

**Status:** Canonical operating baseline  
**Last updated:** 2026-07-28  
**Product Lead / incident owner:** Rafal Andersen

Do not store secret values in this file.

## Environments and hosting

| Item | Current state |
|---|---|
| Public domain | `https://milogrowth.com` |
| Hosting / publishing | Lovable Cloud |
| Platform hostname | `milo-growth.lovable.app`, redirected to the custom domain |
| Public edge | Cloudflare termination confirmed; security capabilities still partly unproven |
| Source repository | `rafalandersen-dev/andersen-visibility-engine` |
| Current repository implementation | PR #36 merged at `0d163dd32cd807463fc40e6c41fafd1176b94e5f` |
| Custom-domain production | Older pre-PR-#36 deployment confirmed during issue #37 Gate 0 |
| Database | Lovable Cloud / Supabase-backed project |
| Isolated staging data plane | Not confirmed |
| Preview | Protected authenticated preview confirmed |

## Public-audit release dependencies

The following are required but must not be configured until issue #37 advances beyond Gate 0:

- `MILO_OUTBOUND_FETCH_MODE`;
- `PUBLIC_AUDIT_IP_SALT`;
- `PUBLIC_AUDIT_EDGE_SECRET`;
- `TURNSTILE_SECRET_KEY`;
- `PUBLIC_AUDIT_ALLOWED_HOSTNAME`;
- `VITE_TURNSTILE_SITE_KEY`;
- migrations `20260727220000_public_audit_safety.sql` and `20260727223000_public_audit_fetch_budget.sql`;
- trusted edge header stripping/injection;
- direct-origin blocking or a revised architecture that removes the assumption.

## Ownership

| Responsibility | Owner |
|---|---|
| Product and release decision | Rafal Andersen |
| Production publishing | Rafal Andersen |
| Incident decision and rollback | Rafal Andersen |
| Security review | Named independent reviewer under the Delegation/Release Packet |
| Database migration execution | Must be explicitly assigned in the approved production release |
| Secret ownership and rotation | Must be explicitly assigned before configuration |

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

- exact Lovable runtime/egress guarantee is unproven;
- edge header ownership and origin blocking are unproven;
- isolated staging is unconfirmed;
- production configuration presence matrix is not established;
- final legal operator and support/security mailboxes remain incomplete;
- production billing authority and authenticated hard AI limits remain incomplete.
