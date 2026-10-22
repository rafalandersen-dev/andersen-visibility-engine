# Owner Brand Intelligence save repair — 7 October 2026 (CG + CH + CI corrections)

Status: prepared, independently reviewed and locally verified in `codex/milo-owner-brand-save-20261007` (base `543b24d`). Not deployed. Production behaviour is unchanged until a verified release. Independent review evidence: [owner-brand-save-review-2026-10-07.md](../evidence/owner-brand-save-review-2026-10-07.md).

## Defect

The editor found owner edits with the source-proposal parser (`brandProposalEntries`). When the whole stored profile failed that schema, the parser returned nothing and edits were silently dropped while "Brand Intelligence saved" was shown. Profiles failed it with more than 10 offers (Synergy 15, Butelki 19) or a legacy relative CTA such as `/contact`.

## Repair

### Owner-edit contract (`src/lib/brand-owner-edits.ts`)

- **Separate from proposals.** The contract has a fixed allowlist of 21 canonical leaf fields and never depends on the proposal schema. `brand-proposal.ts` is unchanged: proposals still reject more than 10 offers, relative URLs and unknown keys.
- **Atomic edits.** Only fields that differ from the loaded baseline are validated and merged. They save together, or the whole edit is refused with a typed `OwnerBrandEditError`.
- **Explicit clears.** These are edits and receive owner markers. Empty-to-empty values and `updatedAt` are ignored.
- **Owner bounds** (`OWNER_BRAND_LIMITS`):
  - 50 offers per list, 50 links, 50 rules.
  - 200 list entries of up to 1,000 characters each.
  - Text limits: 2,000 (tone), 4,000 (notes and descriptions), 200 (labels).
  - A list already over its bound can still be edited; only additions beyond the bound are refused.
- **URL policy** for newly entered owner URLs:
  - Accepted: HTTPS without credentials, or a same-site path starting with a single `/`.
  - Rejected: a leading `//`, other schemes, whitespace, control characters and backslashes.
  - URLs are stored as entered; nothing is fetched.

### Lists: parsed once (CH 2)

- **Stored entries are never re-split.** Stored and edited arrays are only trimmed. An entry such as "Professional from £1,490" keeps its identity through every normalization, and repeated normalization is idempotent.
- **Text is parsed once.** The form parses typed text with `parseOwnerListText`:
  - Text with several lines gives one entry per line, and commas inside a line are kept.
  - A single line equal to an entry already stored (in the baseline or current value) stays one entry.
  - Any other single line is split on commas (the documented "one per line or comma-separated" hint).

### Rows: metadata and association (CH 3)

- **Metadata kept.** Offer, link and rule rows keep any unsupported stored key (legacy ids, import metadata) as row metadata.
- **Conflicts include metadata.** Metadata is part of the comparison, so a concurrent metadata-only change is a conflict for the atomic array.
- **Association** of edited rows with stored rows (`reuseStoredRows`), with no guessed domain id:
  1. A row equal to a stored row is that stored object.
  2. An edited row carrying metadata belongs to an unclaimed stored row with exactly that metadata. Its supported keys are validated and applied on top, so the metadata survives.
  3. A row without metadata is new.
- **Refusals instead of guesses.**
  - Metadata that no stored row has is refused as `unknownField` (injected).
  - Metadata claimed by more rows than were stored is refused as `ambiguous`.
- **Order and count.** Order, count and duplicates follow the edit. Unclaimed stored rows are owner deletions.

### Save lifecycle (`src/components/brand-intelligence-form.ts`, CH 1)

- **Nothing written on refusal.** Validation errors, conflicts and an unready workspace write nothing.
- **"Saved" only after confirmation.** It appears only after `saveWorkspaceNow` resolves in the same session (store epoch + user) and the stored profile holds every requested value.
- **A failed attempt is not rolled back.** A lost response may already have committed it, and a later autosave may persist it. It stays in the workspace as an unconfirmed change. The editor remembers it, per session and project, as its own attempt together with the confirmed value it replaced.
- **Next save** (`applyOwnerBrandEdits(…, own)`):
  - An unchanged retry rewrites and flushes it.
  - A correction saves without a self-conflict.
  - An explicit revert writes the confirmed value back instead of returning no-op.
  - A different writer's value for that field is still a conflict.
  - Unrelated concurrent fields are untouched.
- **Remount.** A remounted editor (`ownerBrandBaseline`) shows the attempt as an edit against the confirmed baseline. It never adopts the attempt as already saved.
- **No changes, but unconfirmed workspace changes.** A form with no changes flushes them and confirms, instead of saying "No changes to save".
- **Form handling.** The form is locked while saving. Every failure keeps the entered values.
- **Late results.** A result arriving after the editor closed is prefixed with its project name.

### Restoring after this editor's own failed attempt (CI)

- **The defect.** A failed deletion or clear of a metadata-bearing offer, link or rule, followed by an explicit restore of the confirmed rows, was refused as `unknownField`. The rows were validated only against the emptied attempt still in the workspace.
- **The fix.** For a field proven to still hold exactly this editor's own attempt, the authority is the value actually stored before that attempt. It is recorded from the pre-write store at failure, not taken from the caller's baseline. That authority governs reuse of stored rows, row metadata and the list-size bound.
- **Effects:**
  - Restoring removed rows (with metadata) or an oversized list is accepted.
  - Expanding beyond the confirmed list is still refused.
  - New metadata is still `unknownField`; claiming confirmed metadata twice is still `ambiguous`.
  - A field anyone else changed is not "own": a plain restore of it is not written, and an edited one is a conflict.

## Copy

- **Seven keys** (en/pl/sv/da and the 20 staged catalogs), all under `brand.`: `toast.noChanges`, `error.row`, `error.required`, `error.tooLong`, `error.invalidUrl`, `error.limit` and `error.unsupported`.
- **Clarified wording (CH).** `brand.error.invalidUrl` now reads "use an HTTPS address or a path starting with a single /, such as /contact. Other schemes and spaces are not allowed" in all 24 catalogs. No `https://` or digit tokens were added.
- **Fingerprints.**
  - The staged `configuration` source fingerprint is now `c7a21405…`. Excluding the seven keys still reproduces the original `c60d43…`.
  - The German fingerprint in `de-source.ts` was updated to match.
  - The staged exact size stays at 4553.
  - The staged strings are authored, not fluent-reviewed.

## Verification (local only)

- **CG failing-before.** The reproducer run against `543b24d` gave 9 failed, 2 passed. The CH defects were reproduced independently by the Codex reviewers; the CH regressions encode those reproductions.
- **Targeted run:** 48 files, 1,127 tests passed (`.coordination/owner-brand-save-evidence/ch-targeted-suites.txt`). This covers:
  - the owner contract, form, store and regression suites;
  - knowledge-brand and brand-proposal;
  - MCP profile-fill and all pending-actions suites;
  - workspace-save-status, ProjectKnowledgePanel and all 30 i18n suites.
- **Static checks.** `tsc --noEmit`, ESLint and Prettier are clean on the changed source; `git diff --check` passes.
- **Production build** (`vite build`): passed (`ch-build.txt`). It regenerated a reorder-only `src/routeTree.gen.ts` (814/814 lines, all paired), which was restored.
- **Real-store regressions** (fake entity backend):
  - Failed then corrected retry.
  - Failed then unchanged retry, which reaches persistence.
  - Fail or lost-after-commit, then explicit revert, then unrelated save, then reload.
  - Unrelated concurrent edit through failure and correction.
  - A same-field writer stays a conflict.
  - Remount after failure.
  - No-change flush.
  - Session change mid-save writes nothing into the new session.
  - Deleting down to one "£1,490" entry in claims and proof, and offer metadata, both through reload.
- **Mounted editor** (`.coordination/owner-brand-save-harness`: real editor, real store, in-page fake backend):
  - Rejection kept "Direct" unconfirmed, and "Friendly" then saved.
  - Lost-after-commit showed "not confirmed" although the server had the value. The explicit revert was written, and after an unrelated save and reload the tone was the reverted value and the rename persisted.
  - Rejection then remount showed the attempt as an edit, and it saved.
  - A result after remount was named with its project.
  - The proof list deleted down to "Professional from £1,490", and an offer URL edit kept `legacyId`/`source`, both after reload.
  - A concurrent avoid edit during a rejected save survived the retry; success appeared only after the queued saves confirmed.
  - The clarified invalid-URL message showed with no write.

- **CI verification:**
  - 27 CI regressions (lib, save lifecycle, real store with reload). With only the authority line reverted, 21 fail and 6 pass. The 6 are the injected-metadata and concurrent-value guards, which by design pass before and after.
  - With the fix, all pass: offers, links and rules; rejected and lost-after-commit; explicit restore, then persistence (+1 batch), then reload; remount; concurrent change not overwritten; new and duplicate metadata refused; oversized list restored but not expanded.
  - Targeted run: 48 files, 1,151 tests. `tsc`, ESLint, Prettier, `git diff --check` and `vite build` pass. The routeTree change was reorder-only and was restored.
  - No new mounted run for this lib-level change; the CH mounted evidence stands.

## Limits

- **Not production evidence.** The release stays blocked until the original Lovable Git link is restored. Synergy/Butelki edits must not be reapplied before the fix is live and read back.
- **Concurrency.** Guards cover the hydrated in-memory profile. There is no database compare-and-swap, so a whole project row is still upserted last-writer-wins as before.
- **A failed attempt left in place.** If the owner leaves without retrying or reverting, the attempt stays an unconfirmed workspace change. It can be persisted by a later workspace save, like any other unsaved workspace edit. Remembered attempts live in memory for the session and are forgotten on reload or a new session.
- **Markers after a revert.** An explicit revert keeps the owner marker for that field: it records an owner-saved value.
- **Lists.** A single new line containing commas is split, per the documented hint, even with blank lines around it. Literal comma entries are guaranteed only for stored entries or multi-line input.
- **Stale attempts.** A later successful global autosave can leave a remembered attempt stale until the next Brand Intelligence save. That save then rewrites and confirms it; nothing is reversed.
- **Rows without metadata.** An edited row without metadata is treated as new. If an API caller strips a stored row's metadata, that is a deletion plus an addition.
- **Error messages.** `invalidChoice`, `unknownField`, `ambiguous` and `malformed` share one generic message.
- **Review hint.** `BrandIntelligenceCard.tsx` is re-indented by the fieldset; review it with `git diff -w`.
