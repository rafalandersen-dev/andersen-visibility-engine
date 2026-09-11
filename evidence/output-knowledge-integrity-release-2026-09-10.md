# Output knowledge integrity release — 10 September 2026

Released and verified at 22:24:39 UTC (11 September in Stockholm) through [PR #121](https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/121).

## Delivered behavior

Manual and scheduled publication now check the exact knowledge records used to generate an output, including version, fingerprint, expiry, withdrawal, conflict, project ownership and medium. Durable private provenance survives browser omissions and image reuse. Changed or forgotten evidence holds publication without rewriting owner text or granting approval. Project Setup shows affected drafts and knowledge review counts in English, Polish, Swedish and Danish. Discarded unattached results release registry capacity and cannot be attached later; saved outputs retain provenance.

## Review and validation

Final reviewed commit: `9deab39db3b87262b7181efd01d97ab3446cdbe0`. Final code review completed at 22:19:33.768589 UTC with no major issues (comment node `IC_kwDOTCO8kM8AAAABT1kCcA`). All four findings were fixed and resolved: owner override parity, orphan registry cleanup, discard after workspace removal, and duplicate present/future impact counts.

Linux workflow `34536518749` passed 3,026 tests across 222 files on Bun 1.3.3 and 1.4.0, TypeScript, production build and frozen locks. Final local focused validation passed 81 tests across five files, types, lint and build. Initial security review covered only the initial commit and is not a final security audit. Completed Claude runs `34534831822` and `34535048655` had 14 and 24 permission denials respectively and no buffered inline comments; this is limited coverage. Run `34535742578` completed at 22:24:57 UTC with 31 permission denials and no buffered inline comments. Final run `34536518722` completed at 22:27:22 UTC with ten permission denials and no buffered inline comments; its logs were inspected on 11 September. This remains limited review coverage. No review was rerun.

## Database and runtime

Migration `20260911000000_output_knowledge_integrity.sql` was applied exactly once with SHA-256 `da0f768edd041bc034a79f430167f47019f9c51290c517c8a95050f736dfb75a`. The guarded transaction checked ten prior migration hashes, empty prior archives and no in-flight publication. Installed migration cardinality and exact source hash were verified. Do not edit or reapply released SQL.

Verified existing registry RLS and no direct anonymous, authenticated or service-role table privileges; one service-only reader and six trigger-only functions; seven enabled related triggers; two registry columns and the archive discarded-identity column. No new table or timer. Read-only verification after rollout confirmed these permissions and objects again.

Normal merge: `1ded31e929b3e18019aaa317a3c388bd55e753a8` at 22:21:21 UTC. Lovable sync matched this exact merge before the single deployment `a1c1df18-e183-4713-91a6-bdf88dcaeac4`. Runtime build `1789078939690` matched the merge revision, clean Git state, fingerprint `8981c777941685595deb27f254d9620215ae7481ef82aba09e1486ce4a7eca04`, algorithm and every source component. The first check observed the prior rollout and was preserved; no second deployment was started.

Home and MCP GET returned 200, MCP OPTIONS 204, anonymous MCP POST and weekly executor POST 401. The complete premerge/postrelease baseline matched: private/native records and knowledge registry/discarded identities zero; usage 10 rows / 226 units; queue 101 review-required, 31 published, five failed. Existing approval/queue triggers unchanged. Monthly timer remains `0 6 25 * *`, command hash `344d3bf5d41ccf75456660906fee446cd263790cff89d9ca4c216cbefe6f26ca`; weekly timer remains `*/5 * * * *`, hash `b0044f76411f69cc92b9ef3e8fdab0e5f99cd8966ff3be0fe3357b3fb13f9664`; both active.

## Limits and remaining work

These are code, database, runtime and public boundary checks, not signed-in or live-provider acceptance. Legacy outputs without provenance remain unverified. Explicit owner revalidation against changed knowledge remains a candidate; old approval cannot waive stale or forgotten references.

R18 actual product-reference generation remains open. The fixed image model supports edits, but official documentation did not establish the input-image token ceiling needed for the existing strict reserve guarantee. No reserve was guessed and no transport, model, credential or funding change was made.

No live provider, source, CMS or Google fetch, generation, funding, outreach/email/client publication, synthetic production records, browser retry, account or credential change, subagent or new automation. Full R00–R24/D01–D08 and separate PR2/58/62 and Worker35/43 boundaries remain. Public paid launch remains NO-GO.
