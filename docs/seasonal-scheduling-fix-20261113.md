# Seasonal scheduling fix — 2026-11-13

## 1. Manual opportunities in the wrong language

- `app.plan.tsx` `createManual` (and the opportunity creators in `mock-ai.ts`, plus
  the metadata/FAQ/CTA regeneration and custom-endpoint payload fallbacks) read the
  legacy `project.primaryLanguage`, which is still `English` for projects whose
  canonical `primaryContentLanguage` is `sv`. They now use `projectContentLanguage`.
- Editor → Metadata has a normal language `Select` (existing registry, label in the
  app language). It persists through the existing form/save (`language` is now an
  editor form field). Changing it moves an Approved/Exported article back to In
  Review, and because the language is part of the publication version the exact
  approval no longer matches until the owner approves again. No translation, no
  project-wide language change.

## 2. Scheduled update of an already-live article

- The runner still treats every already-live asset as a safe no-op. A scheduled
  update is recognised only when the asset carries `scheduledPublishedUpdate`
  `{ queueId, versionHash, identity }` **and** `queueId` equals the queue row that
  is firing.
- Arming (`scheduleApprovedPublication`) derives the intent from the same workspace
  snapshot the `schedule_approved_publication` RPC verifies by exact revision and
  version hash; `writeScheduleMirror` stores it with the pending date. Nothing is
  sent at arming and the current page stays live.
- At fire (`publishAssetServerSide`) the existing checks all still run (status
  consent, checklist blockers, exact-version approval, source freshness, evidence,
  claim/in-flight/retry rules). The update is additionally refused permanently if the
  current publication version differs from the approved one or the live identity
  (platform, URL, CMS ids, slug, destination type) moved. The CMS call reuses the
  existing id, so WordPress/Shopify update the same article.
- Success clears the schedule mirror and intent and does not re-stamp the
  opportunity as freshly published. Terminal failure clears the intent and keeps the
  live page/status; a failed row is not retried silently.
- Safe no-ops unchanged: first-publication rows whose asset was published manually,
  replayed or already-spent rows (intent is cleared), legacy rows, other queue ids.
- The editor's `canSchedule` no longer excludes `livePublishStatus === "published"`;
  the existing pending panel shows the date.
- WordPress updates require the existing post id and Shopify updates require the
  existing article GID at both arming and firing. A URL alone cannot authorize a
  connector CREATE. Losing all live identifiers after arming also refuses the update.
- Plan keeps a published article in its live stage while showing its pending update
  date in the list, inspector and calendar. Calendar readiness uses the same target
  guard. An overdue update is not presented as an upcoming publication.
- Blank and generated drafts preserve an opportunity's explicit language, otherwise
  using the shared canonical/legacy project language resolver.

## Deployment

No SQL: the binding lives on the workspace asset, the queue row id is the existing
`scheduled_publishes.id`. No migration, candidate-chain manifest or grant change.

## Limitations

- If the mirror write fails after the queue insert, the row exists without an
  intent and fires as a safe no-op (the owner can re-arm).
- The intent lives in the owner-writable workspace blob; it is only honoured with a
  matching live queue row id, and the exact approval is re-derived at fire.
- Concurrent claim exclusion remains in Postgres (`FOR UPDATE SKIP LOCKED`). Existing
  database tests cover repeat claiming, in-flight replacement refusal and approval
  withdrawal; this change adds no database locking or grant changes.

## Authorship and review

Claude authored the implementation and one consolidated correction packet. Its
existing access then returned `budget_exhausted`; Codex continued under the explicit
owner-approved usage-limit fallback in AGENTS.md. Codex completed the lost-identity
guard, strengthened the custom-endpoint test with the actual payload builder,
formatted the tests, updated this record and performed independent validation.
No additional paid channel, dependency, generation or production content send was
used for implementation. Future scheduled sends require production acceptance.
