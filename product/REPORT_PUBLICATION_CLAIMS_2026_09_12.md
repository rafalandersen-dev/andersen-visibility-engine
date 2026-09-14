# Report publication wording correction

After1953cfb, the report counts saved successful live-publication outcomes with URLs. It does not fetch destinations at report time. The previous verified-live claim was therefore stronger than the evidence used by the report.

Five existing UI keys now describe recorded publications, no records for an empty month, and saved outcomes without a fresh check of current availability. All four runtime languages and staged French/German/Spanish/Italian use the corrected meaning. Four matching email keys are corrected in all24email languages (four inherit runtime copy). Both ordinary and agency footers include the limit; sender identity, logo behavior, recipients, dispatch and publication controls are unchanged. No keys added or removed.

199 tests across seven report/rendering/catalog/staged suites pass, as do full TypeScript and the production build. Scoped lint on email/staged catalogs and adjusted tests passes; existing runtime dictionary formatting was preserved instead of reformatting unrelated lines. Literal interpolation and agency escaping tests now expect the accurate text. Logs /tmp/milo-report-claims-{tests,types,build,lint}.log.

Only the reviewed measurements fingerprint changed for German, Spanish and Italian, following translation review of all five English changes. Other source fingerprints remain untouched. French retains its existing parity checks. Historical source revisions identify authoring baselines; this record documents the subsequent source reconciliation.

This closes the report verified-live wording item in REPORT_PUBLICATION_COUNT_2026_09_12.md, not independent live acceptance. Remaining analytics/onboarding source claims and fluent/rendered language acceptance stay open. Italian remains1717/3768messages15/28groups, disabled. No actual email/provider/CMS calls, new task, PR review, deployment or migration. Overall60%/implementation75%, paid NO-GO unchanged.
