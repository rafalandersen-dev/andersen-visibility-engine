# Milo release direction: manual review for oversized PR151

Codex product/release decision, 27 September 2026. This changes sequencing, not the agreed R00–R24/D01–D08 scope or the evidence needed for completion.

## Evidence and distinction

The owner-approved working agreement requires independent correctness/security checks and production verification, economical review of coherent changes, and continued repairs without unbounded research. The accepted security decision I explicitly makes the Claude workflow advisory: model self-report is never merge authorization. The infrastructure receipt and bootstrap plan already require an independent manual-review path for oversized PR151. Its known 819617-byte diff exceeds the supported 100000-byte input limit irrespective of whether the separate Claude credential works.

PR152, PR154 and PR155 were released after exact-head independent code/security review and local checks. The first diagnostic run with the final workflow, 36341978669 on PR153 head222d11c48e6dd4928e27f9cc6ae6d51aa778746a, failed: one SDK turn, zero tool denials, sdk_error_category:other, manual_review_required. It is not a completed review, provider-authentication proof, or infrastructure live acceptance. The run has zero artifacts. The pinned action omits result text from public logs; the runner-local file is unavailable after completion. Do not repeat or expand diagnostic provider executions without materially new evidence. No credential replacement is justified by other.

The earlier Codex bootstrap sequence put CI live acceptance before application integration. That ordering is superseded: an unresolved auxiliary review provider must remain an open infrastructure acceptance item, while the application's separately accepted manual path proceeds. There is no removal of an enforced GitHub protection: the active main ruleset retains deletion and non-fast-forward protections, without a required model-only check. Failed/oversized advisory results remain negative and visible. No bypass, changed success condition, or new permission is authorized.

## Required application release evidence

1. Normally merge the reviewed main infrastructure into PR151; preserve its application/SQL bytes and pushed history. Review the resulting exact head, not the older commits alone.
2. Require complete independent correctness and security assessment on that head; close actual findings. Retain prior unchanged-code/browser/SQL evidence only where identity proves it applies, and run appropriate integration/critical tests, types and production build. No automatic acceptance from test counts.
3. Record the real new advisory CI outcome. The expected oversized outcome is manual_review_required, not green; stale plugin-era SDK success with 32 denials is excluded from review evidence. Manual review must cover the application change, including data integrity, ownership/isolation, approval/version binding and migration safety.
4. Require all non-advisory dependency/build checks. Any new app/security/test defect still blocks release. This decision does not approve the current PR by itself.
5. Reverify exact migration hash and fresh database guard conditions, apply the new migration once before application deployment, then verify deployed revision/fingerprint and actual owner journeys. Preserve no-replay boundaries for old migrations, provider turns and the four Butelki articles.
6. Keep the unresolved advisory provider failure explicit in release evidence and the full-goal acceptance register. Do not claim the full objective complete until this and all genuine product/pilot acceptance obligations are resolved or explicitly decided by the owner.

No owner credential action is requested now. USD50 monthly Milo cap, manual free-account budgets, no purchases/new paid channel, no synthetic production evidence and no automatic pilot approval remain unchanged.

## Source scope correction

Claude M's statement that the canonical continuation and remaining-acceptance files do not exist is incorrect: both exist in /Users/rafi/.codex/worktrees/1733/milo-growth-generation-result-recovery-20260909/evidence and were read independently by Codex. Their full-scope, user-only and no-replay requirements remain authoritative. M is a recommendation; this Codex decision also uses those records, the owner-approved agreement, current workflow contract and independently checked GitHub metadata.
