# Public audit retry readiness — 12 September 2026

Reviewed candidate ec26739. Every completed audit request clears the bot token and resets the widget. The primary button required a fresh production token, but Retry remained enabled and could replace the service error with a bot-check error. The handler already rejected tokenless production requests; this was a control-state inconsistency, not a verified bot-protection bypass.

The primary button, Retry and keyboard submission now share the same readiness condition. A synchronous pending-request ref also prevents a second submission before React renders disabled controls, and is released in finally. Validation resets the unavailable flag so a new input error does not inherit the preceding service-unavailable setup CTA.

Full TypeScript, production build, scoped ESLint and whitespace checks passed. Logs: /tmp/milo-audit-retry-types.log and /tmp/milo-audit-retry-build.log. No implementation-mirroring unit test was added for this bounded UI change; interactive repeated-submission, bot-token expiry/reset and keyboard/browser acceptance are still open.

No provider request, deployment, security-review retry or task handoff occurred. Existing release holds remain. Candidate progress does not establish full R00–R24/D01–D08 acceptance.
