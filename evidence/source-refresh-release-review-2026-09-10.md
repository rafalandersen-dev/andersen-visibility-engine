# P2 source refresh release — 10 September 2026

P2 is technically released. PR [#109](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/109) normally merged reviewed candidate `baf1d83eb65f181391fa6a7c23477bc444c1dee7` into main **`7f5120291ff35eba36b75ae3baa6e4cb900095d0`** at 11:37:41 UTC. No history rewrite or force push. P0/P1 releases were preserved.

## Review and checks

Codex exact-candidate review completed 11:26:52 UTC with no major issues, comment **5617923235**, after all 16 earlier findings were fixed/resolved. Latest request was 5617857706. Linux matrix **34470817134** passed **2,521 tests / 177 files** on both Bun 1.3.3 and 1.4.0, frozen locks, types and builds. Log `/tmp/milo-p2-final-linux-baf1d83.log`.

Claude workflow **34470817129** was still running at merge. It was not a required branch check; release followed the handoff's exact-Codex-review + Linux-green prerequisites. It completed SUCCESS before deployment, with **28 permission denials** and no buffered inline comments. This is not substantive independent review evidence; `/tmp/milo-p2-claude-baf1d83.log`. No new posted findings remained.

Final review corrections preserve source holds across outages/replacement/forgetting, bounded dependency aggregation and impact reads, legacy source-free image compatibility, shared concurrent source deadlines, bounded concurrent publication transport with per-owner serialized outcome writes in this server instance, copied-image evidence and removed-image registry cleanup. Database revision checks protect other writers; the write queue is not a distributed-lock claim. See the WIP evidence for historical corrections and exact focused tests.

## Migration and production verification

Applied **once**, before merge/code deployment: `20260910100000_source_refresh.sql`, exact SHA256 **`4b5f81b01dde27d97a29994b4404f42c327d824ea834b348b8a46c544e651a50`**. The transaction used an advisory lock and refused existing P2 registry/tables or missing P1 registry. Stored statement count is 1 and its hash matches. Do not apply this migration again or edit it after release; subsequent SQL fixes require a new migration.

Verified two tables with RLS and no direct anon/authenticated/service table privileges, nine security-definer functions (five service RPCs, four trigger-only without service execute), and four enabled triggers. Registry verification `/tmp/milo-p2-database-verification.json`; guarded SQL `/tmp/milo-p2-guarded-migration-image-lifecycle.sql`; read-only verification `/tmp/milo-p2-post-migration-verify.sql`.

Lovable project `06b696f6-c02b-468f-b0a0-7ab8af92d6a0` synced the exact merge before one deployment **`f42f3511-4152-4ea1-bdbc-b4d9d00a305e`**. Production [milogrowth.com](https://milogrowth.com) verified **11:40:53 UTC**: build **`1789040357738`**, exact clean revision above, fingerprint **`9b43c0cd05a5d1e3c69971c0807dd0f8c6bf9828ab4c37f84fd362240ee0ba83`**, algorithm and every source component equal the local clean merge, modified:false. Home GET200, MCP GET200/OPTIONS204/anonymous POST401. Full result `/tmp/milo-p2-runtime-verification.json`.

Post-release counts: source/refresh/dependency/archive/receipt/native-budget/permit/request rows **0**; historical usage **10 rows / 226 units**, unchanged. No live provider generation, funding, key setup, source/catalog production fetch, extra email/outreach, client publication or browser-policy retry occurred. HTTP checks do not establish signed-in, browser or provider acceptance.

## Continuing delivery

P3 remains unreleased on `codex/milo-p3-weekly-20260910`, `/tmp/milo-p3-weekly-20260910`. Exact approval handlers/editor/status/withdrawal, all connector gates, four-locale weekly settings/readiness UI and validated weekly recovery/notification periods now integrate the earlier groundwork. Full suite **2,575 tests / 187 files**, types/lint/build passed before this record-only update and merge of the already-tested P2 source. Logs `/tmp/milo-p3-integrated-approval-ui-full-tests.log`, `-build.log`, `/tmp/milo-p3-weekly-ui-final-{types,lint}.log`.

No P3 SQL, PR, cron, active weekly executor or provider call. The executor and shared monthly dispatch/cutover, durable research/pinned choices, budgeted content/required visuals/checks, research uncertainty/cancellation controls, deduplicated in-app summaries and explicit automatic publication approval authority still need completion. P4/P5 and every R00–R24/D01–D08 remain active. No new Codex automation or subagents.
