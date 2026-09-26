# Citation findings backend release — 21 September 2026

Status: backend release verified on production at 17:36 UTC. Migration applied, PR merged and public application identity matches the approved source.

Approved PR149 head ac9eec96af193e698eb52b8caf359cb0bdefb8ac passed code review5764508220 and security review5764567540 plus CI. Local48 targeted panel tests/full6642 tests391files/types/scopedlint/build passed; earlier focused results and limitations in citation-findings-improvements evidence.

Migration20260920200000 applied once in guarded transaction; journal SHA256 b59fbafa4dc218156b08b69d9f8f2a4c6e8b3041d164921175cdcf5e4a649e5c matches source. NEVER replay /tmp/milo-p3-guarded-apply-20260921.sql. PR149 merged normally at17:27:07UTC as bab861c872e4ade3a4563d279b1a68ac674d24b7; reviewed tree and merge tree identical. Lovable sync matched merge at17:27:29. Deployment8f3919f2-6229-4f6b-80f3-acf4f30bc492 requested once; initial responses pending.

Production DB: all10 ai_citation tables RLS enabled, directSELECT denied anon/authenticated/service_role. All19 ai_citation RPCs deny anon/authenticated and allow service_role;15 explicitly queried internal authorization/erasure helpers deny all three roles. Other pure status helpers are not included in this claim. Owner-scoped reads for actual synergy project return empty findings/improvements/facts successfully. No findings/assignments/pilot data fabricated.

Initial polls returned P2 while deployment was pending. At 17:36 UTC public app-version returned build1790011727514, revisionbab861c872e4ade3a4563d279b1a68ac674d24b7 and the expected fingerprint; every source component matches the approved identity. Expected fingerprint595da1bee5e1972994ef7118c4e3c92c79fe4ccb469e4157a3217e5e5a6cde81 and merged revisionbab861c8. Approved identity /tmp/milo-p3-approved-identity-20260921.json. Last public response /tmp/milo-p3-live-version-20260921.json. Unauthenticated POST/api/milo/run returned401 again after confirming the new public identity.

Release identity, DB grants/owner reads and unauthenticated runtime rejection are verified. This is backend release evidence, not a complete end-to-end reviewer workflow acceptance. No UI/pilot/concurrency/destination verification claim. Assignment UI, panel binding, review UI, native parsing and full acceptance remain open. USD50/month and manual AI grants for free accounts unchanged.
