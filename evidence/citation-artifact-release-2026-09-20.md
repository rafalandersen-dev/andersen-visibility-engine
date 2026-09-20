# Private artifact staging release — 20 September 2026

PR144 head d0500d2bcd176c9dcd9d9b7825672139d043d295 passed exact code review5746166531 and security5746179566, all CI including Claude review35476579010 (16m36s), both lock checks and preview. Normal merge faaa195f4f377d2ea24eee61283e52e62bc20e45 has identical tree. Integrated6182 tests/381 files, types/build passed (prior recorded logs).

Lovable latest_commit_sha matched faaa before release. Applied migration20260919165000 atomically with journal; stored SHA25623c820eda8f957b86bfa3c9ae19a0e169241837a933be6ce175abe8b767633e7 matches reviewed source. Never reapply the prepared guarded script. Production grants: anon/authenticated cannot call four artifact RPCs; service_role can; none of these roles can directly select table or execute internal UTF16 helper.

Single deployment ab9791a9-1730-40e5-aecc-1463f2144a2f completed. https://milogrowth.com/api/app-version reports build1789862143041, revisionfaaa195f4f377d2ea24eee61283e52e62bc20e45, modified=false; fingerprint and every component match reviewed source. Expected/live JSON retained at /tmp/milo-artifact-{expected-identity,live-version}-20260920.json.

This proves release and access boundaries only. No genuine report was uploaded, no parser exists in this packet, no native metrics or end-user workflow acceptance is claimed. Conversation repair remains separate and unaccepted; dispatch stays disabled. No provider call or AI budget change in this release.
