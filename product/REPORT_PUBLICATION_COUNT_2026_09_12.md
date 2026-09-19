# Monthly report publication count correction

Source baseline dc75575. The report previously used lastPublishedAt when publishStatus was sent, provided liveUrl was present. That timestamp records draft delivery, and draft sends retain existing live URLs. It could therefore count a draft-only send (including a failed live attempt) as a monthly live publication.

The shared page/email aggregation now requires livePublishStatus published and livePublishedAt, alongside the existing URL, project and month filters. Removed the draft-send fallback. The current shared live publisher records the published status in publish.server.ts, including custom endpoints. Legacy records without live-publication status are excluded; draft delivery is not sufficient evidence to reconstruct that status. No stored data was changed.

112 tests across report aggregation, four-language presentation and 24-language email rendering pass, including absent/failed/notPublished live status after successful draft delivery. Full types and production build pass; zero changed-file lint. The final test-only refinement uses the actual notPublished enum literal rather than an invalid string. Logs: /tmp/milo-report-count-{tests,types,lint,build}.log.

Follow-up: REPORT_PUBLICATION_CLAIMS_2026_09_12.md corrects the publication wording in all current UI/staged/email locales. The following describes the finding before that correction. Source-claim audit finding: report page and email actively say verified live, but this aggregator reads saved connector outcomes and does not independently fetch the destination. Correct those claims consistently across all runtime, staged and email locales or supply the required verification evidence; do not treat this count correction as completing that requirement. Exact searches found no non-i18n references for analytics.v2.stat.conversion or analytics.stat.visits30; that limited search does not prove all legacy analytics labels are unused.

Unreleased candidate only. No provider/CMS/email call, deployment, migration, review-quota consumption or new task. Overall60%/implementation75% and paid NO-GO unchanged. Italian remains1717messages/15groups and disabled.
