# Checkpoint wait release — 20 September 2026

PR148 head56618e3c967943b88111cfd0d605052422bb569b code clean5749943454/security clean5749956051. All CI passed including Claude35511971329 and both frozen-lock jobs. Normal mergebd0afee8aca8acf1bc0edab94b1c21f22181d643 has identical tree; Lovable sync confirmed before release.

Migration20260920180000 applied once atomically with journal SHA25675b0da4494c5c6a1468f726d518ffed714bd3daa455499b95437e36aa57314bc. Guards required latest165000, no helper/journal, disabled dispatch/cron and no pending/unexpired running turns. Livepg_proc confirms allfourfunctions lock_timeout1500ms and emptysearch_path; anon/authenticated no execution, service_role only3RPCs, internalhelper ungranted. No prior migration changed.

Deployment66fb48b4-7b00-4b12-ae37-2a5ba9162bdc triggered once. Live https://milogrowth.com/api/app-version now build1789909401506, revisionbd0afee8aca8acf1bc0edab94b1c21f22181d643, modifiedfalse, fingerprint/allcomponents match reviewed source. JSON/tmp/milo-checkpoint-wait-{expected-identity,live-version}-20260920.json.

This verifies release, not real conversation acceptance. No new paid question issued during release; dispatch/cron keptOFF. Next: preflight budget and noactive turns, one bounded new ownerUIquestion, inspect persisted final state/reload/accounting and restore controls; never replay oldunknown turns. Unapplied P2 protocol migration must be renumbered after this applied version before release. P3 remains separate. Full R00–R24/D01–D08 acceptance incomplete.


## Bounded live acceptance — 2026-09-20
One owner UI request in conversation `52496ffa-1ebd-4506-af58-19754fb9cad7`, turn `f304d5ad-9d80-40f7-a5f5-4cff5b6fc7a7`, completed 13:07:01–13:07:08 UTC. Both draft and website-check permissions off. Correct Polish answer distinguished saved draft from public publication and required destination verification. Safari displayed saved answer before and after a full page reload. No replay or publication. Dispatch temporarily enabled only for the bounded test, then restored OFF. Budget cap remains USD50 global and owner; reserved rose USD3.50 to USD4.50, recorded spent remains zero (not proof of zero provider charges). This proves one simple reply persistence path, not full tool, team, logout or publication acceptance.
