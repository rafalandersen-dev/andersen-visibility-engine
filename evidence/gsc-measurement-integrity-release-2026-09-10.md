# Search Console measurement integrity release — 10 September 2026

PR #116 merged normally at `bfc3111e702056738c9c3346c8bca06c1c9e414e`, 19:13:29 UTC. Final reviewed candidate `9098cf2b77964e7c093a9b5a6fd83e9aeaba2bf8`: Codex no-major-issues comment5624067435, completed19:12:02UTC. Review bodies and every inline thread were inspected. All five findings are fixed and resolved:

- Explicit and background API sync share the established rolling five-import behavior.
- A valid declared property is required for page attribution and new frozen observations.
- Matched pages with no usable metrics are unavailable, rather than green recommendations.
- New frozen observations revalidate numeric invariants at the server boundary; the historical reader schema stays compatible.
- Imports over the shared1,000-row limit are rejected before selecting an observation row.

Linux34518488813 passes **2,858 tests / 210 files** on Bun1.3.3 and1.4.0, TypeScript, production builds and frozen dependency locks. `/tmp/milo-gsc-final-linux-9098cf2.log`. Local full suite on the preceding88a6df candidate passes2,857/210; the final bound fix passes44focusedtests/3files, types/build/focusedlint. `/tmp/milo-gsc-metrics-*` and `/tmp/milo-gsc-bound-*`. Earlier broad focused lint excluded pre-existing MCP Prettier debt; the existing report hook dependency warning remains. Initial security review completed18:51:44UTC on7790a6d; it is not an exact-final security audit.

Final Claude34518488832 completedSUCCESS19:14:20UTC with11permissiondenials and no buffered inline comments; inspected without rerun (`/tmp/milo-gsc-final-claude-9098cf2.log`). Intermediate88a6df Claude34517997898 completedSUCCESS19:03:43UTC with0denials/no buffered comments; intermediate8ff7130 Claude34517302987 completedSUCCESS19:09:19UTC with15denials/no buffered comments; initial7790a6d Claude34516532328 completedSUCCESS18:58:21UTC with4denials/no buffered comments. Logs were inspected. Workflow success alone does not establish substantive review coverage. No review run remains pending from this release.

Lovable synced the exact merged source, then one deployment was started: **`8ad9e56b-9217-4815-bb5a-721d174a9428`**. Production verified at **19:16:18.654UTC**, build `1789067671215`, source revision `bfc3111e702056738c9c3346c8bca06c1c9e414e`, fingerprint **`b1e5541dc493d3287f69a528e4f689c41f240569f0787454bb9cf811780d1f13`**. Every source component equals clean merged source. HomeGET200, MCPGET200/OPTIONS204, anonymousMCPPOST401 and weeklyschedulerPOST401 pass. `/tmp/milo-gsc-runtime-verification.json`. The first rollout check saw the prior build; no second deployment was started.

**No migration, timer activation or sweep was performed.** Read-only post-release19:16:38UTC inspection confirms101review_required/31published/5failed, monthly scheduler active at `0 6 25 * *` and weekly preparation active at `*/5 * * * *`, with unchanged command hashes. `/tmp/milo-gsc-post-release-baseline.json`; pre-release `/tmp/milo-gsc-release-baseline.json`. All previously released SQL, approvals and retained jobs remain unchanged.

Analytics now provides bounded validated CSV preview/save, explicit unknown-versus-zero metrics, one-table subtotals, distinct API aggregates/samples, exact full-URL/property matching, separate onsite statistics and clear legacy/provenance/window labels. Existing OAuth plumbing is retained; API requests normalize responses and use exactly28/90inclusivePacificdays. Proof UI/email, MCP and Launch use the same conservative basis, with four-locale integrity labels. Historical imports/frozen observations are not silently rewritten. [Guide and supported input limits](../docs/GSC-MEASUREMENT-INTEGRITY.md).

This is technical release evidence, not signed-in or live Google acceptance. No live Google/model/provider fetch, paid generation/funding, synthetic production import, extra email/outreach/client publication, account/MFA changes or browser-policy retry occurred. GSC observations do not establish causality, conversions or independent provider verification. FullR13 technical SEO/crawl/CWV/URL-inspection/provider acceptance, fullR06 team/recipient acceptance and R00–R24/D01–D08 remain open. Public paid launch remains NO-GO.

Next read-only code-evidenced proposal: R14 backlink evidence integrity in `/tmp/milo-after-gsc-plan.md`. Missing/malformed provider results can currently become fetched zeros, and failed referring-domain tables can become “none found” in recommendation inputs. No follow-on implementation has started in this task.
