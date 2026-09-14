# Claude continuation progress — 13 September 2026

## Acknowledgement

- Handoff read: `product/HANDOFF_CLAUDE_2026_09_13.md`.
- Worktree: `/Users/rafi/.codex/worktrees/milo-claude-continuation-20260913`.
- Branch: `codex/milo-claude-continuation-20260913`, HEAD `ff9b085a3829254a4c60da554e09b65bc64722a3` (verified with `git rev-parse`).
- Working tree at start: only the untracked handoff file.
- Queue accepted in order: (1) account-level private conversation discovery/management, then (2) inactive EU catalogs ga, lv, lt, mt, ro one locale/batch at a time.
- Boundaries accepted: no commit/push/merge/PR, no migration application, deployment, remote database, provider or paid calls, no dependency changes, no edits to released migrations, credentials, environment, CI or Git metadata. All changes stay local and uncommitted for Codex review.

## Milestone 1 — account-level private conversation management (implemented; browser/build unverified)

### What exists now

- **Candidate migration** `supabase/migrations/20260914090000_milo_account_conversations.sql` (new, later than `20260913200000`; no released migration edited; not applied anywhere). Adds index `milo_conversations_actor_recent` and service-only `list_my_milo_conversations(p_actor, p_before_created, p_before_conversation)`:
  - Reads only `actor_id = p_actor` rows. A project owner never discovers a member's conversations.
  - Rejects suspended/removed actors (`assert_project_team_account`) and half cursors.
  - Keyset pages of 25, ordered `created_at DESC, conversation_id DESC`, with `hasMore` from a 26th row. Pages stay stable across identical timestamps and erasures between pages.
  - Each entry has `conversationId`, `ownerId`, `projectId`, `createdAt`, `access` and `title`. The title is returned only while the non-locking checks of `assert_milo_conversation_access` pass: owner account active, owner workspace present, project present, and actor is the owner or has an active, unexpired membership. Otherwise `access="unavailable"` and `title=null`. No project name, message, turn count or project data is ever returned.
  - Deleted projects are absent because the existing cascade/retirement trigger already removed them; nothing is recreated.
  - `EXECUTE` is granted to `service_role` only.
- **Server helper** `src/lib/milo-conversation-account.server.ts`. Uses actor-only request admission (`acquireTeamPreview(actor, actor, null)`) with a 10 s deadline and always releases the lease. It grants no project read.
- **Schema/response checks** `src/lib/milo-conversation-account.ts`:
  - Strict input `{ before?: { createdAt, conversationId } }`.
  - Strict discriminated entries (an `unavailable` entry must have a null title, an `available` entry must have a non-empty title of at most 800 bytes).
  - Rejects: wrong actor, a short page claiming more, duplicates, entries not strictly older than the cursor, and order violations (microsecond- and offset-exact comparison).
- **Endpoint** `src/lib/milo-conversation-account.functions.ts` exposes only `listMyMiloConversationsFn` (POST, `requireSupabaseAuth`, actor taken from the session). There is no account-level delete endpoint: erasure reuses the existing `eraseMiloConversationFn` → `erase_milo_conversation`, including its revoked-access path, idempotent replay and retained-ID/rate-limit behavior.
- **Shared erasure cache purge** `src/lib/milo-conversation-erasure.ui.ts`, extracted from `MiloConversationActions.tsx` without changing that component's behavior. It additionally:
  - invalidates the account directory;
  - forgets the tab's remembered bookmark only when it points at the erased conversation.
- **UI** `src/components/MiloAccountConversations.tsx` at new route `/app/conversations` (`src/routes/_authenticated/app.conversations.tsx`):
  - **Entry points:** the Settings navigation item "Your conversations" and a "Manage all conversations" button on the chat home. The route is onboarding-exempt, so users with only shared projects can reach it.
  - **Listing:** accessible entries show their escaped title as a link to the exact `/app?owner&project&conversation`. Access-ended entries show only an explanation, the creation time and Delete. "Show more" uses the last-entry cursor. Polling every 30 s reflects revocation.
  - **Failure handling:** any failed read hides every title until an explicit successful check.
  - **Deletion:** requires an AlertDialog whose text is the existing retained-records explanation plus "does not restore or change your access".
    - Duplicate clicks are suppressed.
    - A lost response stays unconfirmed with the title hidden; retry is explicit and uses the same identity.
    - The entry is marked erased before the purge, so a directory reply that started earlier cannot restore it.
    - Queued work is dropped on unmount.
- **Route tree** `src/routeTree.gen.ts` was hand-edited (no route generator CLI is available). Codex should let the Vite/TanStack plugin regenerate it and compare.
- **Copy:** 10 new `chat.account.*` keys, authored in EN/PL/SV/DA and all 15 complete staged catalogs (FR/DE/ES/IT/PT/NL/FI/CS/SK/SL/HR/BG/ET/EL/HU).
  - New conversation source fingerprint: `37dd02d19eebd2b592fa29a6bb077c648e6bea5a53b2f354e64fdf09b54f1b85`. All 15 staged indexes and the German source ledger are updated.
  - Explicit catalog-size assertions changed from 3,840 to **3,850**. No locale was activated.
  - The five unauthored catalogs now need 3,850 × 5 = **19,250** messages.
  - Staged translations follow each catalog's existing register and terms (e.g. PT/HU/DE/ES/IT/NL/ET informal). They have not had fluent review.
- **Browser fixture** `scripts/milo-conversation-browser/account-entry.jsx` + `account-mock.js`, with mode `account` registered in `build.cjs` and documented in the README (10 groups).

### Validation actually run (this session)

| Check                                                                                                  | Result                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused new suites (`milo-account-conversations-migration`, `milo-conversation-account`, `.functions`) | First run: 24/25. A test passed a whole directory entry to strict erasure input and was correctly rejected; the test was fixed to pass identifiers only. Rerun: **25/25** (9 actual-SQL PGlite cases using all five candidate conversation migrations plus the new one) |
| `vitest run src/i18n`                                                                                  | Before hash update: 15 expected source-hash failures (fingerprint guard working). After: **538/538, 24 files**                                                                                                                                                          |
| Focused regression (account + lifecycle + conversation migration/ui/location + i18n)                   | **643/643, 33 files**                                                                                                                                                                                                                                                   |
| `tsc --noEmit`                                                                                         | **Pass**                                                                                                                                                                                                                                                                |
| `eslint` on the 14 changed/new TS/TSX files                                                            | 15 Prettier-rule findings in my new files → `prettier --write` on those 6 files → **pass**                                                                                                                                                                              |
| `prettier --check` on all changed code/fixture/catalog files                                           | **Pass**                                                                                                                                                                                                                                                                |
| `git diff --check`                                                                                     | **Pass**                                                                                                                                                                                                                                                                |
| Full suite `vitest run --maxWorkers=2`                                                                 | **5,510 tests / 359 files pass**, 73.98 s (baseline 5,485/356). Output was saved only to the Claude tool-result store; no `/tmp` log was written, because redirecting output was denied                                                                                 |
| Production build (`npm run build`)                                                                     | **Not run.** The command was denied by this session's permission mode. It must run before release                                                                                                                                                                       |
| Browser fixture (`build.cjs en account` + browser)                                                     | **Not run.** The bundle command was denied and no browser control is available. All four active locales × desktop/mobile remain outstanding, as do full-route/shell checks of `/app/conversations` and the home link                                                    |

SQL cases covered:

- own conversations across two clients with the same project ID;
- owner cannot see a member's conversations;
- revoked and expired memberships return identifiers only; read/export/new turn are refused; erasure works and replays idempotently;
- a suspended client owner hides titles, which return after reinstatement;
- deleted projects are not listed or recreated;
- 60-entry keyset pagination with tied timestamps, with erasure between pages (read and unread entries);
- forged input and half cursors are rejected, as are wrong-actor, reordered, relabelled, `hasMore`-inflated and extra-field responses;
- actor-only admission reports busy (`TeamAdmissionBusyError`) at two held leases, the minute budget counts, and leases are released;
- suspended/removed actors are rejected;
- anon/authenticated cannot execute the RPC; service_role can.

### Remaining concerns for Codex review

1. Run the production build and the `account` browser fixture (EN/PL/SV/DA, 1280×900 and 390×844). Add a full-route/bookmark-style check for the `/app/conversations` route, the Settings child and the home link, including a shared-only user (the shared-project shell filter hides Settings, so the home link is their entry point).
2. Confirm that returning titles for currently accessible entries is within the intended "minimal" scope. The alternative is identifier-and-date only for every entry.
3. The directory access check is a non-locking snapshot. A revocation that commits just after the read can still show a title once; the next 30 s poll, or any failed read, removes it. Conversation reads still re-authorize under locks.
4. Security review of the new SQL/endpoint is required before release. Older reviews do not cover it. The migration is now the sixth unapplied candidate: `20260912040000`, `20260913120000`, `20260913160000`, `20260913180000`, `20260913200000`, `20260914090000`.
5. Regenerate `routeTree.gen.ts` with the router plugin and diff it against the hand edit.

Next exact action: queue item 2 — inspect the current catalog/key ownership for GA/LV/LT/MT/RO and start one locale's first coherent batch.

## Milestone 2 — Romanian staged authoring, batch 1 (authentication + shared controls)

Inspection before starting: no `ga`/`lv`/`lt`/`mt`/`ro` staged interface files existed. No test asserts that those languages are unauthored. The EU coverage matrix lists all five as "not authored". The only existing Romanian copy is in the email catalogs (`email-copy-eu.ts`, `auth-email-copy.ts`, `proof-report-email-copy.ts`).

Locale choice: Romanian first. The handoff sets no order among the five, and Romanian is the language I can author most reliably, which fits the handoff's preference for completed, verified batches over broad unverified edits. GA/LV/LT/MT stay untouched.

Changed/new files (all new):

- `src/i18n/staged/ro-auth-screen.ts` — 42 `authScreen.*` messages.
- `src/i18n/staged/ro-shared-ui.ts` — 30 `sharedUi.*` messages.
- `src/i18n/staged/ro.ts` — `RO_STAGED_BATCHES` with namespaces, `sourceRevision: "ff9b085"`, and the current English fingerprints (`f0d4cd1c…29dc8` authentication, `678278d0…9d6e5` shared controls). These match the hashes already verified by the complete Hungarian/Croatian batches. It exports a frozen `RO_STAGED_CATALOG`.
- `src/i18n/staged/romanian.test.ts`. It follows the Hungarian harness (exact keys per namespace, source fingerprint, non-empty values, preserved placeholders/numbers/URLs/emails, unique key ownership, `ro` outside `UI_CATALOGS` and `isUiLanguage`). It adds one check that no authored value is identical to English. The complete-key-set test is intentionally absent until Romanian is fully authored; the count assertion is 72.

Authoring notes for reviewers:

- **Register:** formal "dvs." imperatives. This matches the Romanian operational/invitation emails (`Deschideți`, roles `Cititor/Editor/Revizor`). The Romanian authentication emails (`auth-email-copy.ts`) use the informal register (`Confirmă`, `ai`). Reconcile before activation.
- **Gender neutrality:** wordings that would force a gendered past participle were avoided. For example, "Password updated. You are signed in." → "Parola a fost actualizată, iar sesiunea este activă."
- **Invariants:** the digit `8` and `{plan}`, `{provider}`, `{count}` are preserved exactly. Brand names are unchanged ("Andersen Innovations", "AI").
- **Acceptance:** not fluent-reviewed. There has been no rendered page or mobile check, and Romanian is not activated.

Validation run:

| Check                                         | Result                                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `vitest run src/i18n/staged/romanian.test.ts` | **4/4 pass** (2 batch source/parameter checks, runtime exclusion + unique ownership + count 72, no English copy) |
| `tsc --noEmit`                                | **Pass**                                                                                                         |
| `eslint` on the 4 new files                   | **Pass**                                                                                                         |
| `prettier --check` on the 4 new files         | **Pass**                                                                                                         |

Counts:

- Romanian: 72 / 3,850 authored; 3,778 remaining.
- All five unauthored languages: 19,250 − 72 = **19,178** messages outstanding.

Next exact action: Romanian "core" batch (`common`, `nav`, `appShell`, `shell`, `onboarding`, `setup`, `lang`, `market`, `goal`, `pipeline`; 202 keys at the current fingerprint `845b2b1a…1c7ff2`). Then setup/services/audit screens, following the batch order used for Croatian/Hungarian.

## Milestone 3 — Romanian staged authoring, core batch

Changed files:

- `src/i18n/staged/ro-core.ts` (new) — 202 messages across `common`, `nav`, `appShell`, `shell`, `onboarding`, `setup`, `lang`, `market`, `goal` and `pipeline`.
- `src/i18n/staged/ro.ts` — `core` batch added: `sourceRevision: "ff9b085"`, fingerprint `845b2b1ade4a0935ab924dcc4bdc27d72a7a120388740354bd69a697aa1c7ff2`. This is the same current fingerprint the complete Hungarian core batch passes with.
- `src/i18n/staged/romanian.test.ts` — authored-key count 72 → 274.

Authoring notes:

- **Workflow states kept distinct:**
  - target date: "dată țintă";
  - scheduled: "Programat";
  - sent to site: "Trimis pe site";
  - confirmed live: "Publicat" / "Confirmați că este publicat".
  - The live-with-missing-draft state stays separate: "Publicat · ciornă lipsă".
- **Partial setup and load failure:** partial setup keeps unfinished AI steps explicit. The workspace-load failure still says saving stays disabled.
- **Preserved tokens:** `{step}`, `{currency}`, and the digits "7" (seven steps) and "3" (competitor limit).
- **No English-identical values:** where the Romanian word would be spelled the same as English, a distinct term was used ("Plan" → "Planificare" for navigation) so the no-copied-English guard stays meaningful.
- **Terminology for reviewers:** draft = "ciornă", workspace = "spațiu de lucru", backlinks = "backlinkuri", outreach = "contactare", project setup = "configurarea proiectului".
- **Terminology gap:** the English home FAQ stage "Captured" versus the pipeline "Idea" label (already recorded for Hungarian) is unresolved here too. Romanian uses "Idee" for the pipeline stage.

Validation run:

| Check                                         | Result                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| `vitest run src/i18n/staged/romanian.test.ts` | **5/5 pass** (3 batch source/parameter checks, count 274, no English copy) |
| `tsc --noEmit`                                | **Pass**                                                                   |
| `eslint` on the 5 Romanian files              | **Pass**                                                                   |
| `prettier --check` on the 5 Romanian files    | **Pass**                                                                   |

Counts:

- Romanian: 274 / 3,850 authored; 3,576 remaining.
- All five languages: **18,976** messages outstanding.

Next exact action: Romanian setup, services and audit screens (`setupScreen`, `servicesScreen`, `auditScreen`; 71 keys).

## Milestone 4 — Romanian setup, services and audit screens

Changed files:

- New batch files:
  - `src/i18n/staged/ro-setup-screen.ts` — 24 messages.
  - `src/i18n/staged/ro-services-screen.ts` — 18 messages.
  - `src/i18n/staged/ro-audit-screen.ts` — 29 messages.
- `src/i18n/staged/ro.ts` — rewritten whole to register three batches, each with `sourceRevision: "ff9b085"` and the current fingerprints already passing for Hungarian:
  - setup screen: `565b0bcd…d732a5ca`;
  - services screen: `c769d10a…e9122313d`;
  - audit screen: `2c15a706…ab154f1aed`.
- `src/i18n/staged/romanian.test.ts` — authored-key count 274 → 345.

Authoring notes:

- **Approval versus publication:** approval stays distinct from publication, including the retired automatic-publish-on-approval explanation: approval marks an article ready, and publication still needs a separate action or schedule.
- **Audit evidence:**
  - text actually read from the homepage is distinct from the supplied-context fallback ("Orientativ · pagina nu a fost citită");
  - both are distinct from the separate technical crawl;
  - scores are called assessments, not measured metrics or rankings, and "higher score = stronger assessment" is kept.
- **Preserved:** `{field}`, `{fields}`, `{mode}`, `{count}`, `{business}{location}`, `{name}`, the literal `http://` / `https://`, and the digit "5".
- **Wording:** "est." → "estim." (a Romanian abbreviation that also avoids an English-identical value). "Plan" is rendered as "Planificare" to match the core navigation label.
- **Composition to check:** `{business}{location}` composition was not inspected in the page source for Romanian word order; do this in the rendered-page review.

Validation run:

| Check                                         | Result                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| `vitest run src/i18n/staged/romanian.test.ts` | **8/8 pass** (6 batch source/parameter checks, count 345, no English copy) |
| `tsc --noEmit`                                | **Pass**                                                                   |
| `eslint` on the 8 Romanian files              | **Pass**                                                                   |
| `prettier --check` on the 8 Romanian files    | **Pass**                                                                   |

Counts:

- Romanian: 345 / 3,850 authored; 3,505 remaining.
- All five languages: **18,905** messages outstanding.

Next exact action: Romanian analytics and billing screens (`analyticsScreen` 36, `billingScreen` 54; fingerprints `d86d1510…` and `d0e701ba…`).

## Milestone 5 — Romanian analytics and billing screens

Changed files:

- New batch files:
  - `src/i18n/staged/ro-analytics-screen.ts` — 36 messages.
  - `src/i18n/staged/ro-billing-screen.ts` — 54 messages.
- `src/i18n/staged/ro.ts` — rewritten to register them with `sourceRevision: "ff9b085"`:
  - analytics screen: `d86d1510…de5b02c5`;
  - billing screen: `d0e701ba…b2307194`.
- `src/i18n/staged/romanian.test.ts` — count 345 → 435.

Authoring notes:

- **Analytics:**
  - recorded page views are distinct from unique visitors;
  - tracked CTA/booking clicks are distinct from completed sales or bookings;
  - AI referral signals are kept; UTC daily grouping is kept;
  - bounded history is kept: "50,000" is written "50 000" (so the number tokens stay identical and Romanian "50.000" is not read as a decimal), plus 60 days, and published-page metrics may not cover the whole period.
- **Billing:**
  - legacy-Paddle portal linkage and active/manual-plan eligibility are kept;
  - publisher placements need separate review and purchase approval;
  - export before access changes is kept, and backlink purchases are reviewed separately;
  - `billing@milogrowth.com`, the digits 1/3/5/15 and "v2" are preserved.
- **Product names:** "Brand Intelligence", "Milo Score", "Analytics v2", "GSC Lite", "WordPress" and "white-label" are kept as names.

Validation run:

| Check                                                   | Result                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `vitest run src/i18n/staged/romanian.test.ts`           | **10/10 pass** (8 batch source/parameter checks, count 435, no English copy) |
| `tsc --noEmit`                                          | **Pass**                                                                     |
| `eslint` / `prettier --check` on changed Romanian files | **Pass**                                                                     |
| `vitest run src/i18n` (regression across all catalogs)  | **548/548, 25 files**                                                        |

Counts:

- Romanian: 435 / 3,850 authored across 8 batches; 3,415 remaining.
- All five languages: **18,815** messages outstanding.
- GA/LV/LT/MT: still 0 / 3,850 each.

## Continuation after Codex credits ran out (user instruction, 13 September)

The user asked to continue here; whether to keep working in this worktree or combine with Codex will be reviewed on 20 September. The same boundaries still apply: no commits, pushes, deployment, migration application or paid calls.

## Milestone 6 — Romanian evidence screen

- `src/i18n/staged/ro-evidence-screen.ts` (new), 89 messages. Registered in `ro.ts` with fingerprint `2c7e9ccb…d156c136`. Test count 435 → 524.
- **Score directions:**
  - competitor gap scores: higher = larger estimated gap;
  - AI-readiness scores: higher = better.
- **Estimates versus measurements:** readiness estimates stay separate from measured mentions, citations or rankings. AI referral traffic measures visits only.
- **Evidence and cadence:** failed competitor fetches provide no evidence, and the analysis is a snapshot, not monitoring.
- **Preserved:** `{number}`, `{business}{location}`, `{count}`, `{level}`, and the digits 1/3/5.
- Validation: Romanian tests **11/11**, `tsc` pass.

## Milestone 7 — Romanian plan screen

- `src/i18n/staged/ro-plan-screen.ts` (new), 113 messages. Registered with fingerprint `288f529e…63174bb7`. Test count 524 → 637.
- **Kept distinct:**
  - a work target ("termen de lucru") versus a publication time chosen separately;
  - accepting a discovery suggestion creates no content and schedules nothing;
  - drafts with no linked opportunity keep any armed publication schedule;
  - sample-data provenance and skipped batch items stay visible.
- **Test change:** `romanian.test.ts` now has an explicit allowlist for values that are correctly identical to English ("Claude", "Search Console"). The test also asserts those allowlisted values really equal English. Anything else identical to English still fails.
- Validation: Romanian tests **12/12**, `tsc` pass, `eslint` pass on the changed Romanian files.

## Milestone 8 — Romanian editor screen

- `src/i18n/staged/ro-editor-screen.ts` (new), 148 messages. Registered with fingerprint `1e827d27…1375fdddd9ec9f`. Test count 637 → 785.
- **Kept distinct:**
  - sending a draft to the website versus publishing live;
  - uploads stay private until alt text and approval; only controlled image origins can be published;
  - unresolved links block sending and publishing through every connector;
  - only sources marked verified by validation are cited, and that status cannot be chosen manually;
  - a byline must be a real, consenting person;
  - the author recommendation does not block publishing;
  - structured data does not guarantee rich results, and custom endpoints do not receive it.
- **Preserved:** "5 MB", "{count}/60", "{count}/160", every placeholder, and "schema.org JSON-LD" / "E-E-A-T" / "sameAs".
- **Allowlist:** "H1", "Slug" and "Desktop" were added to the explicit identical-to-English list, as correct technical terms.
- Validation: Romanian tests **13/13**, `tsc`, `eslint` and `prettier --check` pass.
- Counts: Romanian **785 / 3,850**; all five languages **18,465** outstanding.

## Session status and handoff back to Codex

Queue item 1 is implemented, with the verification gaps listed under Milestone 1. Queue item 2 is in progress: Romanian only, 13 batches (855 keys). Next Romanian batch: public home (100).

## Milestone 9 — Romanian public pricing and case studies

- New batch files, registered in `ro.ts` with `sourceRevision: "ff9b085"`:
  - `src/i18n/staged/ro-public-pricing.ts` — 40 messages, fingerprint `8e7cecc9…0de60`.
  - `src/i18n/staged/ro-public-studies.ts` — 30 messages, fingerprint `ace563fb…e8de`.
- Test count 785 → 855.
- **Pricing:**
  - the displayed region is distinct from billing-country eligibility;
  - new subscriptions, add-on activation and marketplace purchases stay on hold pending payment setup and supplier acceptance;
  - placements are billed individually;
  - no rankings, traffic, revenue or AI citations are guaranteed;
  - `{count}`, "1" and the "Agency" plan name are preserved.
- **Case studies:**
  - setup, internal and demo examples only;
  - live connector, publication and measurement acceptance is still incomplete;
  - no observed growth or traffic/ranking/revenue figures are claimed;
  - names are kept (Synergy, Limhamn / Malmö, Andersen).
- **Terminology to confirm:** the pricing add-on name is rendered "Backlinkuri" to match core navigation. Confirm against the commercial product name before activation.
- Validation: Romanian tests **15/15**, `tsc` and `eslint` pass; Prettier applied to both new files.
- Counts: Romanian **855 / 3,850**; all five languages **18,395** outstanding.

## Milestone 10 — Romanian public home

- `src/i18n/staged/ro-public-home.ts` (new), 100 messages. Registered with fingerprint `2855ce0e…5ccae141`. Test count 855 → 955.
- **Hero fragments:** checked against `src/routes/index.tsx`, which joins before/emphasis/after with single spaces. The Romanian rendering is "Sistemul dvs. lunar de **creștere** cu AI". It is grammatical, but the emphasis falls on "creștere" instead of the English "AI growth"; confirm visually.
- **Kept distinct:**
  - missing data is not zero activity;
  - nothing enters Plan until accepted;
  - publishing needs a supported connection, a verified destination and content approval, and saved settings alone do not confirm success;
  - Milo Score is version-specific and never ranks opportunities;
  - Backlinks stays a separate paid add-on, with activation, purchases and new subscriptions on hold;
  - cancellation is available in Settings → Billing for linked subscriptions, using the same labels as the billing batch.
- **Allowlist:** "Beta" was added to the explicit identical-to-English list.
- **Terminology gaps:**
  - The FAQ stage "Captured" is rendered „Capturate”, while the pipeline stage label is "Idee". This is the same English source mismatch already recorded for Hungarian; reconcile before activation.
  - The source notice that the beta page supports only EN/PL/SV/DA is not in this batch; check it in the public-beta batch.
- Validation: Romanian tests **16/16**, `tsc`, `eslint` and `prettier --check` pass.
- Counts: Romanian **955 / 3,850**; all five languages **18,295** outstanding.

## Milestone 11 — Romanian beta validation screen

- `src/i18n/staged/ro-beta-screen.ts` (new), 88 messages. Registered with fingerprint `c4dcf482…a08119`. Test count 955 → 1,043.
- **Preserved from source:**
  - owner-only internal playbook;
  - outreach templates use their own language choice and need review before use;
  - CSV exports keep their original English field names and values (source construction not re-inspected for Romanian);
  - the digits "12–13", "20" and "1–5".
- **Wording to avoid English-identical values:** "Feedback" → "Opinii", "Segment" (field) → "Segment de piață", "EU" → "UE". The product name "Milo Growth Assisted Beta" is kept inside the offer title.
- Validation: Romanian tests **17/17**, `tsc` and `eslint` pass; Prettier applied.
- Regression before this batch: `vitest run src/i18n` **554/554, 25 files**.
- Counts: Romanian **1,043 / 3,850**; all five languages **18,207** outstanding.

## Milestone 12 — Romanian public beta page

- `src/i18n/staged/ro-public-beta.ts` (new), 100 messages. Registered with fingerprint `e670953b…fb59e`. Test count 1,043 → 1,143.
- **Preserved exactly:** every price range and currency ("699–1499 PLN", "2500–5000 SEK", "€249–€499", monthly ranges), week numbers 1–4, "8–10" minutes, and the 30-minute call and 30-day durations.
- **Kept distinct:**
  - the proposed pilot scope is agreed individually;
  - one-time price versus optional monthly support;
  - paid launch, payments and Stripe setup stay on hold;
  - WordPress/Shopify connectors need live end-to-end testing per site;
  - demo data is not proof of growth, and missing data is not zero clicks or impressions;
  - case examples are setup/demo provenance only;
  - no guaranteed rankings, traffic, revenue or AI citations.
- **Source language claim (reconcile before activation):** the page states it "supports English, Polish, Swedish and Danish". It is translated faithfully, not altered, as in the other staged catalogs.
- **Allowlist:** "Beta" and the product name "Milo Growth Assisted Beta" were added to the explicit identical-to-English list.
- Validation: Romanian tests **18/18**, `tsc` and `eslint` pass; Prettier applied.
- Counts: Romanian **1,143 / 3,850**; all five languages **18,107** outstanding.

## Milestone 13 — Romanian beta guidance playbook

- `src/i18n/staged/ro-beta-guide.ts` (new), 125 messages. Registered with fingerprint `8c815e10…faf33520d`. Test count 1,143 → 1,268.
- **Limits kept:**
  - the playbook is proposed validation, not evidence that validation happened;
  - outreach, demos, new live audits and new generation each need separate authorization and cost checks;
  - payment only after paid-launch approval; Stripe replaces Paddle, with owner setup and lifecycle acceptance still open;
  - a manual Billing status does not confirm payment;
  - what was shown stays distinct from what was verified in real use;
  - no guaranteed rankings, traffic, revenue or AI citations;
  - AI output is a draft, and review aids do not prove correctness.
- **Preserved:** all ranges and target counts (20–30, 3–5, 1–2, 20/10/10/5/3/2/1/2/5/5/5), "30 de zile", and `{name}`, `{referrer}`, `{points}`, which stay literal editing instructions.
- **Names:** "Google Business Profile" uses Google's Romanian product name "Profil de companie Google". Other names are kept (Synergy Massage, Stripe, Paddle, WooCommerce, ChatGPT, Google Ads, Authority Builder).
- Validation: Romanian tests **19/19**, `tsc` and `eslint` pass; Prettier applied.
- Counts: Romanian **1,268 / 3,850**; all five languages **17,982** outstanding.

## Milestone 14 — Romanian collaboration, team, notifications and email settings

- **New files, one per English source file:**
  - `ro-collaboration.ts` — 98 messages;
  - `ro-team.ts` — 58 messages;
  - `ro-notifications.ts` — 86 messages (`notifications` and `awareness`);
  - `ro-email-settings.ts` — 6 messages.
- **Registration:** `ro.ts` merges the four files into one `collaboration` batch, so the combined reviewed fingerprint `429e59f1…f77ed0` is reused unchanged. Test count 1,268 → 1,516.
- **New test:** Romanian `collaboration.viewer`, `.editor` and `.reviewer` must equal the existing Romanian invitation-email roles in `email-copy-eu.ts` (Cititor / Editor / Revizor), the same check the Spanish/French tests use. "Editor" is on the explicit identical-to-English allowlist because Romanian correctly uses the same word.
- **Consistency with existing Romanian emails:** alert titles reuse their wording where it exists (approval due, publication check, overdue manual task, next-week gap, recovery review, capacity low/unavailable).
- **Kept distinct:**
  - creating an invitation sends no email, opening an email link grants no access, and invitations expire after seven days;
  - notifications need both owner assignment and recipient consent;
  - recording a review publishes nothing and resumes no held schedule;
  - a policy change withdraws collaborator approvals but not independent owner approvals;
  - saving an edit returns the draft to review;
  - saved advice and reports are dated evidence, not proof of active work or improved results;
  - missing data is unknown, and a before/after change is not causation;
  - shared preparation capacity is not a promise of completed articles;
  - historical failure and recovery records do not check the destination or restart work;
  - "accepted by email provider" is not delivery confirmation;
  - saving the email language does not enable or send email.
- **Gender neutrality:** "I inspected this rendered draft…" → "Am verificat această ciornă randată…", which avoids a gendered participle.
- Validation: Romanian tests **21/21**, `tsc` and `eslint` pass; Prettier applied.
- Counts: Romanian **1,516 / 3,850**; all five languages **17,734** outstanding.

## Milestone 15 — Romanian knowledge, weekly preparation, approval and source refresh

- `src/i18n/staged/ro-knowledge.ts` (new), 242 messages (`knowledge`, `weekly`, `approval`, `refresh`). Registered with fingerprint `a3a32970…49915816`. Test count 1,516 → 1,758.
- **Kept distinct:**
  - a knowledge review is separate from publication approval;
  - inspection neither approves nor clears a hold;
  - forgotten evidence cannot be reconstructed;
  - accepting a source fact does not independently verify it; public pages cover only the captured page;
  - "Not observed — removal unconfirmed" versus "Removed from complete catalog";
  - owner settings take precedence over source proposals;
  - a saved or approved draft is not queued; only an actual queue entry counts;
  - cancellation preserves work and never retries uncertain research;
  - a status label alone does not grant approval;
  - Shopify catalog prices, discounts and channel availability are not verified.
- **Preserved:** 100, 20, "5 MiB", 40 PDF pages, 500 characters, and "2,000" (written "2 000" with a regular space so number tokens match), plus `{count}`, `{when}`, `{date}`.
- **Composition to check:** `knowledge.ui.irreversible` keeps its leading "?", because the page composes it after "Uitați definitiv" plus the forget target (`forgetAll` / `forgetRecord`, written as Romanian object phrases). Confirm this reads correctly in the rendered confirmation.
- **Gender neutrality:** "I checked / I reviewed…" → "Am verificat / Am analizat…", which avoids gendered participles.
- Validation: Romanian tests **22/22**, `tsc` and `eslint` pass; Prettier applied. The earlier `vitest run src/i18n` regression, after the collaboration batch, passed **559/559**.
- Counts: Romanian **1,758 / 3,850**; all five languages **17,492** outstanding.

## Milestone 16 — Romanian technical crawl, Google index and performance

- **New files, one per English source:**
  - `ro-crawl.ts` — 106 messages;
  - `ro-google-index.ts` — 69 messages;
  - `ro-performance.ts` — 63 messages.
- **Registration:** merged into one `technical` batch with fingerprint `106a19b8…29c135e6`. Test count 1,758 → 1,996.
- **Guard caught a typo:** the first run failed because I transcribed the fingerprint as `106b…`. Every other staged catalog and the German ledger use `106a…`, so the English source was unchanged and only my registration was corrected. No assertion was changed.
- **Kept distinct:**
  - crawling requires DNS ownership verification, which expires after 24 hours;
  - a sitemap listing is a declaration, not proof of existence or indexing;
  - a completed crawl does not prove full-site coverage, Google indexing or Core Web Vitals;
  - saved original evidence is not changed by editing an opportunity;
  - Google index inspection is Google's saved evidence, not a live test or an indexing request, and missing reported entries do not prove absence;
  - lab (PageSpeed) versus real-user CrUX data, and page versus origin scope;
  - uncertain outcomes are never retried automatically, and "check the same request" does not repeat the call.
- **Preserved:** 24, 10, "2 000" (regular space), 100, 20, 0–100, "4xx", and all placeholders.
- **Allowlist:** `perf.desktop` ("Desktop") was added to the explicit identical-to-English list.
- Validation: Romanian tests **23/23** after the fingerprint correction; `tsc` and `eslint` pass; Prettier applied.
- Counts: Romanian **1,996 / 3,850**; all five languages **17,254** outstanding.

## Milestone 17 — Romanian analytics, Search Console and reports

- `src/i18n/staged/ro-measurements.ts` (new), 204 messages (`analytics`, `gsc`, `report`): 190 from `en.ts` plus 14 `gsc.integrity.*` keys.
- **Override:** `catalogs.ts` applies `gscIntegrity` after the base catalog. Four overlapping keys (`gsc.sourceApi`, `gsc.sourceCsv`, `gsc.rec.waitOrPromote`, `gsc.helper`) therefore translate the integrity wording ("declared API source", "owner-supplied CSV", "Measurement unavailable", strict CSV limits), not the older `en.ts` text. A comment in the file records this.
- Registered with fingerprint `216126da…da3088395`. Test count 1,996 → 2,200.
- **Kept distinct:**
  - AI referral visits versus mentions/citations, which also under-count;
  - declared source/property versus independent verification;
  - "—" means unavailable, never zero;
  - table subtotals versus property totals; query/page tables are not added together;
  - search observations do not establish causality or conversions;
  - a report accepted for sending is not confirmed delivery, and the report does not recheck live pages;
  - Search Console data does not guarantee future rankings or traffic.
- **Preserved:** "30 z" for 30d (token 30), 28/90 days, "1000" rows, "mai 2026", "1 000" rows / "2 MB" (regular space), 0–1 and %, and `{agency}`, `{count}`, `{clicks}`, `{impressions}`, `{position}`, `{date}`, `{rows}`, `{days}`.
- **Left in English on purpose (review before activation):** "Query, Page sau Date" (Search Console export table names the parser likely expects), "Settings → Secrets" in the external Lovable Cloud path, and `docs/GSC-OAUTH-SETUP.md`.
- **Allowlist:** "CTA", "CTR", "Milo Score" (column) and "Search Console Lite" were added to the explicit identical-to-English list.
- Validation: Romanian tests **24/24**, `tsc` and `eslint` pass; Prettier applied.
- Counts: Romanian **2,200 / 3,850**; all five languages **17,050** outstanding.

## Milestone 18 — Romanian outreach, opening hooks, image placement and delivery integrity

- **New files:**
  - `ro-outreach.ts` — 131 messages (`outreach`, `hook`, `anchor` from `en.ts`);
  - `ro-outreach-integrity.ts` — 27 messages (`outreach.integrity.*`).
- **Source layout:** `outreach-integrity.ts` generates its keys programmatically (`outreach.integrity.${key}` from 24 base strings plus a `cancel` / `cancelled` / `cancelError` recovery array). A plain key search misses them; the Hungarian batch's key list confirmed the 158-key set. None of these keys overrides an `en.ts` key.
- **Registration:** merged `outreach` batch with fingerprint `c2bfe98e…3d1161b4`. Test count 2,200 → 2,358.
- **Kept distinct:**
  - Milo never sends automatically; each initial message and follow-up needs exact recipient and content confirmation;
  - "accepted for delivery" / provider acceptance does not verify inbox delivery, opens, replies or link placement;
  - interrupted or uncertain attempts stay held, and refresh never sends or retries;
  - draft deletion does not clear a reservation;
  - cancellation before dispatch sent nothing, and started or unknown attempts cannot be cancelled or retried;
  - no bought or reciprocal links, invented personalization or ranking promises;
  - hook findings: health/finance/legal sourcing is recommended but "no longer required to publish".
- **Terminology:** hook = "frază de deschidere"; image placement = "plasare"; anchor = "ancoră".
- **Gender neutrality:** "…reason to contact them" → "…să contactez această persoană".
- **Preserved:** "Article Studio 3.0", 24 hours, "3 000" (regular space), and `{count}`, `{status}`, `{time}`.
- Validation: Romanian tests **25/25**, `tsc` and `eslint` pass; Prettier applied.
- Counts: Romanian **2,358 / 3,850**; all five languages **16,892** outstanding.

## Milestone 19 — Romanian authority, pending actions and public audit

- `src/i18n/staged/ro-growth.ts` (new), 201 messages (`authority`, `actions`, `publicAudit`), all from `en.ts`. Registered with fingerprint `79460ac6…88f136`. Test count 2,358 → 2,559.
- **Kept distinct:**
  - authority opportunities are suggestions, with no guaranteed backlinks, rankings, traffic or revenue;
  - the public audit is a readiness audit, not a live ranking check, and reads only public content;
  - Claude can only propose: nothing applies until the user approves, and Claude cannot approve or apply;
  - on approval, duplicates and over-limit items are skipped and the shown counts are not guaranteed;
  - rejected proposals stay in history;
  - a missing target or project means the proposal can no longer be applied.
- **Gender neutrality:** "You are responsible for…" → "Responsabilitatea … vă aparține".
- **Terminology to reconcile:** `authority.title` "Authority Builder" is rendered "Constructor de autoritate", while the beta playbook kept "Authority Builder" as a name and core navigation uses "Autoritate". Choose one before activation.
- **Example domain:** "yourbusiness.com" is kept as-is in `publicAudit.invalidUrl`; a localized example domain is optional.
- **Allowlist:** "H1" (`publicAudit.signal.h1`) was added to the explicit identical-to-English list.
- Validation: Romanian tests **26/26**, `tsc` and `eslint` pass; Prettier applied.
- Counts: Romanian **2,559 / 3,850**; all five languages **16,691** outstanding.

## Milestone 20 — Romanian billing, launch checklist and beta notes

- `src/i18n/staged/ro-commerce.ts` (new), 192 messages (`billing`, `launch`, `beta`). Registered with fingerprint `6cd0596e…7058ff2`. Test count 2,559 → 2,751.
- **Override order checked in `catalogs.ts`:**
  - `launchReadinessCopy` (applied after `gscIntegrity`) replaces nine keys: `billing.paddleNote`, `launch.item.paddlePending`(+`.desc`), `launch.qa.paddle`, `beta.intro`, `beta.reassure`, `beta.limit.paddle`, `beta.limit.images`, `beta.demo.payments`;
  - `gscIntegrity` replaces `launch.conn.gsc.synced` and `.csvOnly`;
  - Romanian translates these current override texts (Stripe as selected replacement for Paddle, live payment verification pending, verified demo flows only, declared API source and owner-supplied CSV) rather than the stale `en.ts` wording. A file comment records this.
- **Kept distinct:**
  - an owner-only Stripe test checkout makes no real charge and does not change the plan;
  - a plan activates only after payment confirmation;
  - billing market comes from business/billing country, not website language or region;
  - a successful connection test does not verify publishing permissions or guarantee a later publication;
  - checklist completion alone does not establish paid self-service launch readiness;
  - payments must not be presented as live;
  - no guaranteed rankings, traffic, revenue or AI citations.
- **Terms:** business/consumer → "Persoană juridică / Persoană fizică"; comped → "gratuit manual"; QA "Plan" → "Plan tarifar" (avoids an English-identical value).
- **Allowlist:** "Brand Intelligence" and "GSC Lite" (connection status labels) were added to the explicit identical-to-English list.
- Validation: Romanian tests **27/27**, `tsc` and `eslint` pass; Prettier applied.
- Counts: Romanian **2,751 / 3,850**; all five languages **16,499** outstanding.

## Milestone 21 — Romanian link network, backlinks, marketplace and backlink monitoring

- **New files:**
  - `ro-links.ts` — 157 messages: `linknet`, `backlinks`, `marketplace` from `en.ts`, plus 9 `backlinks.integrity.*`;
  - `ro-backlink-monitoring.ts` — 43;
  - `ro-backlink-recurring.ts` — 31;
  - `ro-backlink-details.ts` — 24.
- **Registration:** merged `links` batch with fingerprint `7b8c4cfd…4bd40d7` (256 keys, matching the Hungarian set). Test count 2,751 → 3,007.
- **Overrides translated:** `backlinks.gapNote` (from `backlink-integrity.ts`: the provider sample excludes your domain and is not independent verification), and `linknet.policyNote` / `linknet.reciprocalWarn` (from `link-network-copy.ts`: no promise of search-engine-policy compliance). File comments record these.
- **Slip caught by the checks:** the first run failed because `roLinks` was used in the batch but not imported (`ReferenceError`, and TS2304 plus two follow-on `unknown` type errors). Adding the missing import fixed all three; no test was changed.
- **Kept distinct:**
  - backlink metrics are index estimates, not complete inventories or live destination checks; "—" is unavailable, never zero;
  - scores are AI estimates;
  - a marketplace request is not a purchase; demo mode creates no provider order or payment;
  - a live order needs explicit authorization of the exact total (`€{total}`), and an unconfirmed provider outcome must not be retried;
  - recurring monitoring needs supplier funding: a saved cap adds no funds, pausing does not cancel an admitted collection, and missed runs are skipped;
  - "uncertain" does not mean the supplier charged nothing;
  - first-seen/last-seen dates describe the index, not actual placement or removal.
- **Preserved:** `rel="sponsored"`, `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`, `{count}%`, 1–92, 0–100, 100, "0–20 000" and "10 000" (regular spaces), and all placeholders.
- **Decimal format to review:** the USD amounts "0.024" and "0.000036" keep dot decimals to match the source and the likely entry format; Romanian normally writes decimal commas.
- **Allowlist:** "nofollow" and "Demo" were added to the explicit identical-to-English list.
- Validation: Romanian tests **28/28** after the import fix; `tsc` and `eslint` pass; Prettier applied.
- Counts: Romanian **3,007 / 3,850**; all five languages **16,243** outstanding.

## Milestone 22 — Romanian publication proof, AI answers, logs, evaluation and benchmark

- `src/i18n/staged/ro-evidence.ts` (new), 196 messages:
  - `benchmark` (17) and `aiEval` (33) from `en.ts`;
  - `proof` (32) from `proof-evidence.ts` (its `workflow.*` keys belong to the workflow batch);
  - `answer` (69), generated from key/value arrays in `answer-evidence.ts`;
  - `logs` (45), generated as `"logs." + key` in `log-evidence.ts`.
- Registered with fingerprint `2911f87d…ffdee211d`. Test count 3,007 → 3,203.
- **Kept distinct:**
  - answer and log evidence is owner-supplied and unverified; saving makes no provider call and no vendor is connected;
  - literal brand matching can miss variants, prose links are not citations, and a sample is not a representative survey;
  - zero supplied log rows is not zero crawler traffic, and deduplicated rows are not verified visit counts;
  - a connector response is not independent confirmation of live content or ranking;
  - before/after windows are tentative and establish no causation;
  - evaluation never switches models automatically;
  - the owner generation test stays within the approved "$5" total.
- **Preserved:** "$5", 50, 90 kB, 200/100, 500/31/500/180 kB, "UTC, inclusive/exclusive", and all placeholders.
- **Term choice:** "Prompt" → "Întrebare", matching the AI-readiness screen and avoiding an English-identical value.
- **Allowlist:** "API" and "Milo Score" (evaluation task type) were added to the explicit identical-to-English list.
- Validation: Romanian tests **29/29**, `tsc` and `eslint` pass; Prettier applied.
- Counts: Romanian **3,203 / 3,850**; all five languages **16,047** outstanding.
- Remaining Romanian batches: workflow (345), configuration (220), conversation (82).

### Correction to Milestone 3 (core): three navigation labels followed stale English

- **Found while reading `premium.ts` for the workflow batch:** it is applied after the base catalog and overrides three core labels:
  - `shell.nav.home` "Home" → "Today";
  - `shell.nav.backlinks` "Backlinks" → "Links";
  - `shell.nav.insights` "Insights" → "Visibility".
- **Error:** Romanian had translated the superseded `en.ts` text ("Acasă", "Backlinkuri", "Analize").
- **Fix:** `ro-core.ts` now uses "Astăzi", "Linkuri", "Vizibilitate". This matches the override meaning and the Hungarian batch ("Ma", "Hivatkozások", "Láthatóság"). `pipeline.stage.live` "Published" already matched "Publicat".
- **Why the guard missed it:** the fingerprint check proves the English source is unchanged, not that each translation tracks the current override. A future hardening could assert per-key semantics only through human review.

## Milestone 23 — Romanian workflow: editor, scheduling, quality, presentation, Today/Plan and generation results

- **New files, merged into one `workflow` batch** (345 keys, 17 namespaces, fingerprint `649e9d72…2b6615`). Test count 3,203 → 3,548.
  - `ro-workflow-editor.ts`: `autoSched`, `prev`, `imgGen`, `arrange`, `visual`, `editor`, `status`, `quality`, `calsched`, `pres`, `featured`.
  - `ro-workflow-plan.ts`: `dashboard`, plus `today`/`plan` (including `plan.detail.*` and `plan.source.manual`) from `premium.ts`, plus `workflow.*` comparisons from `proof-evidence.ts`.
  - `ro-workflow-results.ts`: `generationResults` and `publishingFidelity`.
- **Kept distinct:**
  - approving never publishes;
  - a saved schedule is subject to checks and destination availability, and an overdue schedule is unconfirmed;
  - an in-flight publication cannot be stopped;
  - source-held dates queue nothing;
  - presentation is applied in the Milo preview only, not verified on the destination;
  - recovery approves, schedules and publishes nothing, and removing a saved copy returns no allowance;
  - local content checks and planned payloads do not confirm delivery or rich results;
  - imported workflow comparisons run no models and prove no improvement by themselves.
- **Preserved:** "Article Studio 3.0" / "3.0", the aspect ratios (1:1), (4:5), (4:3), "7 zile", and `{when}`, `{title}`, `{date}`, `{count}`, `{concept}`, `{connector}`.
- **Allowlist:** "Slug", "Milo Score" (`quality.title`) and "Calendar" (plan view) were added to the explicit identical-to-English list.
- Validation: Romanian tests **30/30** on the first run; `tsc` and `eslint` pass; Prettier applied.
- Counts: Romanian **3,548 / 3,850**; all five languages **15,702** outstanding.
- Remaining Romanian batches: configuration (220) and conversation (82).

## Milestone 24 — Romanian configuration: brand, connectors, Claude MCP and location coverage

- **New files, merged into one `configuration` batch** (220 keys; namespaces `brand`, `wp`, `shopify`, `claude`, `connect`, `connections`, `coverage`; fingerprint `0e11ebfc…aa60`).
  - `ro-configuration.ts`: brand intelligence, WordPress and Shopify connectors, the Claude MCP connector (including `claude.apps.*`), connection setup, and `connections.*` following `premium.ts`.
  - `ro-coverage.ts`: 45 `coverage.*` keys from `location-coverage.ts`. This completes the override audit item for `locationCoverage`.
- **Kept distinct:**
  - an application password or token is never shown again after saving;
  - Shopify approval never publishes on its own;
  - the Claude token is account-wide and read-only;
  - coverage details are claims that are not verified (listings, NAP, hreflang, rankings);
  - an exact page-URL match does not verify production coverage.
- **Preserved:** Shopify admin menu paths stay in English, as do "Application Password", `mystore.myshopify.com`, `claude_desktop_config.json` and "2 000" (regular space).
- **Allowlist:** "Brand Intelligence", "URL", "WordPress", "Shopify", "Claude Code (CLI)" and "Claude Desktop (claude_desktop_config.json)" were added.

## Milestone 25 — Romanian conversation batch; Romanian complete

- `ro-conversation.ts` (82 `chat.*` keys, typed as `ConversationCopy`), including the 10 new `chat.account.*` keys from Milestone 1. Fingerprint `37dd02d1…1b85`, the same as the other 15 staged locales.
- `romanian.test.ts` now asserts **3,850** keys and adds the complete-English-key-set test (as in Hungarian). `conversation.test.ts` includes `ro` in its staged map.
- **Kept distinct:**
  - deletion does not restore access;
  - titles stay hidden after a failed check;
  - work already sent may finish and use the allowance;
  - an unconfirmed send must be recovered before resending.
- Validation: Romanian + conversation tests **53/53**; `vitest run src/i18n` **572/572, 25 files**; `tsc --noEmit` and `eslint` pass; Prettier applied.
- Counts: Romanian **3,850 / 3,850** (staged only, `isUiLanguage("ro")` still false); remaining languages ga, lv, lt, mt: **15,400** outstanding.
- **Fluent review still needed.** Open Romanian review items are the ones recorded in earlier milestones.
- Next: Latvian, starting with authentication and shared controls. Register: formal "Jūs", matching `euEmailCopy.lv`.

## Milestone 26 — Latvian staged authoring, batch 1 (authentication + shared controls)

- **New files:**
  - `src/i18n/staged/lv-auth-screen.ts` (48 `authScreen.*` keys);
  - `lv-shared-ui.ts` (24 `sharedUi.*` keys);
  - index `lv.ts` (`LV_STAGED_BATCHES` / frozen `LV_STAGED_CATALOG`);
  - `latvian.test.ts`, which follows `romanian.test.ts`: fingerprint and token checks per batch, runtime exclusion (`isUiLanguage("lv")` false), unique ownership, and a 72-key count. Its no-English-copy allowlist is empty for now.
- **Fingerprints** are identical to the Romanian batches from `ff9b085`: `f0d4cd1c…29dc8` and `678278d0…d9de5`.
- **Style:** formal plural imperative/"Jūs" for instructions, infinitive for button labels ("Pieteikties", "Izveidot kontu"), and "8" preserved. The roles consistency test will be added with the collaboration batch (`euEmailCopy.lv` roles: Lasītājs / Redaktors / Pārskatītājs).
- **Review item:** `authScreen.passwordUpdated` uses masculine "Jūs esat pieteicies". A gender-neutral rephrasing ("Pieteikšanās ir aktīva") may be preferred by a fluent reviewer.
- Validation: Latvian tests **4/4**; `tsc --noEmit` and `eslint` pass; Prettier reported no changes.
- Counts: Latvian **72 / 3,850**; remaining languages ga, lv, lt, mt: **15,328** outstanding.

## Milestone 27 — Latvian core batch

- **New file** `src/i18n/staged/lv-core.ts` (202 keys; namespaces `common`, `nav`, `appShell`, `shell`, `onboarding`, `setup`, `lang`, `market`, `goal`, `pipeline`; fingerprint `845b2b1a…7ff2`, the same as the Romanian core). Test count 72 → 274.
- **Overrides applied from the start:** `shell.nav.home`, `shell.nav.backlinks`, `shell.nav.insights` and `pipeline.stage.live` follow `premium.ts` ("Šodien", "Saites", "Redzamība", "Publicēts"), not the superseded `en.ts` text. The Romanian correction to Milestone 3 does not recur.
- **Terms:**
  - "melnraksts" for draft;
  - "darbvieta" for workspace;
  - "uzrunāšana" for outreach;
  - "atpakaļsaites" for the `nav.backlinks` Backlinks label (distinct from "Saites" for the Links shell label);
  - "Premium analītika" keeps the plan name.
- **Preserved:** `{step}` with "7" ("{step}. solis no 7"), "līdz 3", `{currency}`, and "Milo Growth — izstrādājis Andersen Innovations".
- Validation: Latvian tests **5/5**; `tsc --noEmit` and `eslint` pass; Prettier reported no changes.
- Counts: Latvian **274 / 3,850**; remaining languages ga, lv, lt, mt: **15,126** outstanding.

## Milestone 28 — Latvian setup, services and audit screens

- **New files** (71 keys; fingerprints identical to the Romanian batches from `ff9b085`). Test count 274 → 345.
  - `lv-setup-screen.ts`: 24 `setupScreen.*` keys, fingerprint `565b0bcd…a5ca`.
  - `lv-services-screen.ts`: 18 `servicesScreen.*` keys, fingerprint `c769d10a…313d`.
  - `lv-audit-screen.ts`: 29 `auditScreen.*` keys, fingerprint `2c15a706…1aed`.
- **Kept distinct:**
  - approval marks an article ready and never publishes; publishing is a separate action or schedule;
  - previously approved articles may still be drafts;
  - on-page review scores are assessments, not measured metrics or a full-site crawl;
  - an unread page falls back to supplied business details only;
  - the on-page review never runs the separate technical crawl.
- **Preserved:**
  - `{field}`, `{fields}`, `{mode}`, `{count}`, `{name}` and "līdz 5";
  - the `http://` / `https://` literals;
  - the `{business}{location}` composition, which is the same open review item as in Romanian.
- **Terms:**
  - "galapunkts" for endpoint, "noslēpums" for secret, "BUJ" for FAQ;
  - "Lapas pārbaude" for On-page review, matching `shell.nav.onpage`;
  - "pārmeklēšana" for crawl;
  - "aptuv." for est.
- Validation: Latvian tests **8/8**; `tsc --noEmit` and `eslint` pass; Prettier reported no changes.
- Counts: Latvian **345 / 3,850**; remaining languages ga, lv, lt, mt: **15,055** outstanding.

## Milestone 29 — Latvian analytics and billing screens

- **New files** (90 keys; fingerprints identical to the Romanian batches from `ff9b085`). Test count 345 → 435.
  - `lv-analytics-screen.ts`: 36 `analyticsScreen.*` keys, fingerprint `d86d1510…02c5`.
  - `lv-billing-screen.ts`: 54 `billingScreen.*` keys, fingerprint `d0e701ba…7194`.
- **Kept distinct:**
  - views are recorded events, not unique visitors;
  - click rate does not measure completed sales or bookings;
  - the report is limited to up to 50 000 retrieved events from 60 days and may not cover the full period since publication;
  - publisher placements need separate review and purchase approval;
  - backlink purchases are reviewed independently of cancellation.
- **Preserved:**
  - "50 000" (regular space), "30", "60", "1", "3", "5", "15";
  - `{n}`, `{views}`, `{clicks}`, `{title}`, `{date}`;
  - `billing@milogrowth.com`;
  - product names "Milo Analytics", "Milo Score", "GSC Lite", "Brand Intelligence", "Paddle", "WordPress", "Search Console" and "v2" inside translated phrases. No values are identical to English, so the allowlist stays empty.
- **Review items:**
  - `billingScreen.freePreview` translates the plan name ("Bezmaksas priekšskatījums"). Confirm whether plan names should stay in English.
  - `billingScreen.feature.reports` renders "White-label" as "ar jūsu zīmolu".
- Validation: Latvian tests **10/10**; `tsc --noEmit` and `eslint` pass; Prettier reported no changes.
- Counts: Latvian **435 / 3,850**; remaining languages ga, lv, lt, mt: **14,965** outstanding.

## Milestone 30 — Latvian evidence screen (competitors + AI readiness)

- **New file** `lv-evidence-screen.ts` (89 `evidenceScreen.*` keys, fingerprint `2c7e9ccb…c136`). Test count 435 → 524.
- **Kept distinct:**
  - competitor analysis is a snapshot, not ongoing monitoring;
  - failed fetches supply no competitor evidence;
  - gap scores are estimates, not measured rankings;
  - readiness analysis does not check live answers in ChatGPT, Perplexity, Gemini or Google AI Overviews;
  - AI referral traffic measures visits only, not mentions or citations.
- **Preserved:** `{business}{location}`, `{number}`, `{count}`, `{level}`, "līdz 3", "1–3", "līdz 5", and the "→" arrow.
- **Terms:** "nepilnība" for gap, "vaicājums" for prompt (the score label), "jautājumi" for the displayed question categories, "momentuzņēmums" for snapshot.
- Validation: Latvian tests **11/11**; `tsc --noEmit` and `eslint` pass; Prettier reported no changes.
- Counts: Latvian **524 / 3,850**; remaining languages ga, lv, lt, mt: **14,876** outstanding.

## Milestone 31 — Latvian plan screen

- **New file** `lv-plan-screen.ts` (113 `planScreen.*` keys, fingerprint `288f529e…4bb7`). Test count 524 → 637.
- **Kept distinct:**
  - a work target date ("darba mērķa datums") is not a publication time;
  - accepting a discovery suggestion creates no content and schedules nothing;
  - an armed schedule on an orphaned draft stays active;
  - the target is shared across board, list and calendar.
- **Preserved:** `{date}`, `{count}`, `{skipped}`, `{title}`, `{from}`, `{to}`, `{label}`, `{source}`, `{stage}`, and the "→" arrows.
- **Allowlist:** "Claude" and "Search Console" source labels were added to the explicit identical-to-English list (the same keys as Romanian).
- **Review item:** "Plan" is rendered as the locative "plānā" inside sentences and "Plāns → {stage}" in the manual-help text. A fluent reviewer should confirm that this matches the "Plāns" navigation label.
- Validation: Latvian tests **12/12**; `tsc --noEmit` and `eslint` pass. Prettier rewrapped one long line.
- Counts: Latvian **637 / 3,850**; remaining languages ga, lv, lt, mt: **14,763** outstanding.

## Milestone 32 — Latvian editor screen

- **New file** `lv-editor-screen.ts` (148 `editorScreen.*` keys, fingerprint `1e827d27…ec9f`). Test count 637 → 785.
- **Kept distinct:**
  - structured data is included for managed platforms but not sent to custom endpoints;
  - the search engine decides rich results, and Milo guarantees nothing;
  - uploads stay private until alt text and approval, and approval makes the URL public;
  - pasted third-party image URLs cannot be published;
  - unresolved links block sending and publishing through every connector;
  - only validation-verified sources are cited, and that status cannot be set manually;
  - Milo never invents an author name or credential;
  - the E-E-A-T recommendation does not block publishing.
- **Preserved:** "5 MB", "{count}/60", "{count}/160", `{platform}`, `{path}`, `{anchor}`, `{section}`, `{claim}`, `{language}`, `{type}`, `{source}`, "schema.org JSON-LD", "Google Rich Results Test", "E-E-A-T", "sameAs", "Markdown", "HTML", "JPEG, PNG, WebP", "PT, MSc".
- **Allowlist:** "H1" was added. "Slug" and "Desktop" are translated ("URL identifikators", "Dators") rather than allowlisted.
- Validation: Latvian tests **13/13**; `tsc --noEmit` and `eslint` pass. Prettier rewrapped one line.
- Counts: Latvian **785 / 3,850**; remaining languages ga, lv, lt, mt: **14,615** outstanding.

## Milestone 33 — Latvian public pricing and case studies

- **New files** (70 keys; fingerprints identical to the Romanian batches). Test count 785 → 855.
  - `lv-public-pricing.ts`: 40 `publicPricing.*` keys, fingerprint `8e7cecc9…de60`.
  - `lv-public-studies.ts`: 30 `publicStudies.*` keys, fingerprint `ace563fb…e8de`.
- **Kept distinct:**
  - new paid subscriptions, add-on activation and marketplace purchases are on hold pending payment and supplier acceptance;
  - billing country, not site language or region, determines price eligibility;
  - no rankings, traffic, revenue or AI citations are guaranteed;
  - case studies describe setup and planning only, claiming no observed growth outcome or verified customer result.
- **Preserved:** `{count}`, "1 projekts", and the product names "Agency", "Milo Score", "Brand Intelligence", "Synergy", "Search Console". The place names are declined ("Limhamnā / Malmē").
- **Review items:**
  - The service names "Assisted Setup" and "Monthly Care" are translated ("Asistēta iestatīšana", "Ikmēneša aprūpe"). Confirm whether they are brand names that should stay in English.
  - The "Agency" plan name is kept in English.
- Validation: Latvian tests **15/15**; `tsc --noEmit` and `eslint` pass. Prettier rewrapped one line.
- Counts: Latvian **855 / 3,850**; remaining languages ga, lv, lt, mt: **14,545** outstanding.

## Milestone 34 — Latvian public home

- **New file** `lv-public-home.ts` (100 `publicHome.*` keys, fingerprint `2855ce0e…c141`). Test count 855 → 955.
- **Kept distinct:**
  - nothing enters Plan until accepted;
  - human review happens before publication;
  - saved connection settings alone do not confirm publication will succeed;
  - missing data is not zero activity;
  - Milo Score evaluates a content version and never ranks opportunities;
  - Backlinks activation and purchases are on hold pending payment and supplier acceptance;
  - cancellation is via Settings → Billing ("Iestatījumi → Norēķini") for linked subscriptions only.
- **Preserved:** `{count}`, `{number}`, `{region}`, "Milo Growth", "Milo Score", "Search Console", "Agency", "Premium".
- **Allowlist:** "Beta" was added (the same key as Romanian).
- **Review items (the same as Romanian):**
  - the hero fragments are "Jūsu ikmēneša" + emphasised "AI izaugsmes" + "sistēma", and the composed emphasis needs visual review;
  - "Captured" is rendered as the stage label "Ideja" to match `pipeline.stage.idea`;
  - `publicHome.regionSuggestion` and `regionLink` avoid declining `{region}` by using a colon.
- Validation: Latvian tests **16/16**; `tsc --noEmit` and `eslint` pass. Prettier rewrapped a few lines.
- Counts: Latvian **955 / 3,850**; remaining languages ga, lv, lt, mt: **14,445** outstanding.

## Milestone 35 — Latvian beta validation screen

- **New file** `lv-beta-screen.ts` (88 `betaScreen.*` keys, fingerprint `c4dcf482…8119`). Test count 955 → 1,043.
- **Kept distinct:**
  - the page is an internal owner-only playbook;
  - outreach templates use their own language choice and need review before use;
  - CSV exports keep the original field names and values;
  - tracker statuses are separate labels ("Uzrunāts", "Atbildēja", "Demonstrācija rezervēta", "Demonstrācija notikusi", "Pieņēma beta versiju", "Atteica", "Sazināties vēlāk").
- **Preserved:** "12–13", "20", "1–5", "PL / EN / SV", "CSV", "Milo Growth".
- **Terms:** "Monthly Care" is "Ikmēneša aprūpe", consistent with public pricing (the same review item); "UK" / "EU" become "Apvienotā Karaliste" / "ES". No allowlist additions.
- Validation: Latvian tests **17/17**; `tsc --noEmit` and `eslint` pass; Prettier reported no changes.
- Counts: Latvian **1,043 / 3,850**; remaining languages ga, lv, lt, mt: **14,357** outstanding.

## Milestone 36 — Latvian public beta page

- **New file** `lv-public-beta.ts` (100 `publicBeta.*` keys, fingerprint `e670953b…fb59e`). Test count 1,043 → 1,143.
- **Kept distinct:**
  - paid launch and payments are on hold (Stripe setup, commercial approval);
  - connectors need live end-to-end testing per site;
  - demo data is not proof of growth, and missing Search Console data is not zero clicks;
  - brand rules support review but do not prove claims;
  - case examples are not performance guarantees;
  - the founding-beta price is for the first pilot businesses only.
- **Preserved:**
  - price ranges exactly as in the source, with no thousands separators: "699–1499 PLN", "299–599 PLN", "2500–5000 SEK", "799–1499 SEK", "€249–€499", "€79–€149";
  - "8–10", "30", "1.–4. nedēļa", the quoted talk track and the "→" arrow;
  - Stripe, WordPress, Shopify, GSC Lite, Search Console, Milo Score, Brand Intelligence, Authority Builder.
- **Allowlist:** "Beta" and "Milo Growth Assisted Beta" were added (the same keys as Romanian).
- **Review items (the same as Romanian):**
  - the page-language claim (EN/PL/SV/DA) is translated as stated;
  - "Authority Builder" is kept as a product name.
- Validation: Latvian tests **18/18**; `tsc --noEmit` and `eslint` pass; Prettier reported no changes.
- Counts: Latvian **1,143 / 3,850**; remaining languages ga, lv, lt, mt: **14,257** outstanding.

## Milestone 37 — Latvian beta guidance playbook

- **New file** `lv-beta-guide.ts` (125 `betaGuide.*` keys, fingerprint `8c815e10…520d`). Test count 1,143 → 1,268.
- **Kept distinct:**
  - the playbook is not evidence that validation happened;
  - outreach, demos, live audits and generation each need separate authorization;
  - no payment is collected while paid launch is on hold;
  - a manual Billing status does not confirm payment;
  - what was shown differs from what was verified;
  - copying a template does not send a message;
  - prospect data is not stored on the page;
  - rankings, revenue, traffic and AI citations are never promised.
- **Preserved:** "20–30", "3–5", "1–2", "30", the target counts "20", "10", "10", "5", "3", "2", "1", "2", "5", "5", "5", `{name}`, `{referrer}`, `{points}`, and the "→" arrows. Brand and product names (Synergy Massage, Stripe, Paddle, Shopify, WooCommerce, WordPress, Search Console, ChatGPT, Google Ads, Authority Builder) stay inside translated sentences.
- **Terms:** "Assisted Setup" / "Monthly Care" are lowercased descriptive translations ("asistētā iestatīšana", "ikmēneša aprūpe"), consistent with earlier batches and the same review item.
- Validation: Latvian tests **19/19**; `tsc --noEmit` and `eslint` pass; Prettier reported no changes.
- Counts: Latvian **1,268 / 3,850**; remaining languages ga, lv, lt, mt: **14,132** outstanding.

## Milestone 38 — Latvian collaboration, team, notifications and email settings

- **New files, merged into one `collaboration` batch** (248 keys; namespaces `collaboration`, `team`, `notifications`, `awareness`, `emailSettings`; fingerprint `429e59f1…77ed0`, identical to Romanian). Test count 1,268 → 1,516.
  - `lv-collaboration.ts`: 98 `collaboration.*` keys from `project-teams.ts`.
  - `lv-team.ts`: 58 `team.*` keys from `specialist-team.ts`.
  - `lv-notifications.ts`: 15 `awareness.*` + 71 `notifications.*` keys from `notifications.ts`.
  - `lv-email-settings.ts`: 6 `emailSettings.*` keys.
- **New test:** `latvian.test.ts` now checks that `collaboration.viewer`, `collaboration.editor` and `collaboration.reviewer` equal `euEmailCopy.lv.invitation.roles` ("Lasītājs", "Redaktors", "Pārskatītājs").
- **Kept distinct:**
  - opening an invitation email link grants no access, and creating an in-app invitation sends no email;
  - notifications need both owner assignment and recipient consent;
  - recording a review never publishes or resumes a held schedule;
  - changing the approval policy withdraws collaborator approvals but keeps independent owner approvals;
  - saved advice and reports are dated evidence, not proof of active work or improved results;
  - a before/after change alone does not prove causation;
  - in-app checks send no email;
  - failure and recovery records do not verify the destination or restart work;
  - capacity is a shared allowance, not a promise of completed articles;
  - saving the email language neither enables nor sends email.
- **Preserved:** every placeholder (`{count}`, `{page}`, `{pages}`, `{at}`, `{attempts}`, `{status}`, `{period}`, `{saved}`, `{pending}`, `{publishing}`, `{published}`, `{failed}`, `{cancelled}`, `{shown}`, `{total}`, `{missing}`, `{remaining}`, `{usagePeriod}`), plus "HTTP", "PNG, JPEG, WebP", "GSC" and "Markdown". "Seven days" stays a word ("septiņām dienām") because the source has no digit.
- **Style:** consent and recipient states use gender-neutral nominal phrasing ("Saņēmēja piekrišana ir dota"). The review acknowledgement uses the gender-neutral first-person past ("Es pārbaudīju").
- **Review item:** `notifications.recoveryCounts` uses "label — {value}" pairs to avoid plural agreement with the numeric placeholders.
- Validation: Latvian tests **21/21**; `tsc --noEmit` and `eslint` pass. Prettier rewrapped a few lines.
- Counts: Latvian **1,516 / 3,850**; remaining languages ga, lv, lt, mt: **13,884** outstanding.

## Milestone 39 — Latvian knowledge, weekly preparation, approval and source refresh

- **New file** `lv-knowledge.ts` (242 keys; namespaces `knowledge`, `weekly`, `approval`, `refresh`; fingerprint `a3a32970…5816`, identical to Romanian). Test count 1,516 → 1,758.
- **Kept distinct:**
  - a knowledge review is separate from publication approval and may lapse when evidence changes;
  - inspection neither approves publication nor clears a hold;
  - a saved or approved draft is not queued, and only an actual queue entry shows as queued;
  - a status label alone does not grant approval;
  - cancellation keeps drafts and never retries uncertain research;
  - accepting a source fact does not independently verify it;
  - an unobserved catalog item is not a confirmed removal;
  - website capture neither verifies claims nor scans the full site;
  - owner settings take precedence over source proposals.
- **Preserved:**
  - "100", "20", "5 MiB", "40 PDF", "2 000" (regular space), "500", `{count}`, `{when}`, `{date}`;
  - "five" and "ten-minute" stay words ("pieciem", "desmit minūšu");
  - Shopify, PDF, DOCX, Brand Intelligence.
- **Composition:** `knowledge.ui.forgetAll` / `forgetRecord` are accusative objects for "Neatgriezeniski aizmirst". `knowledge.ui.irreversible` keeps the leading "? " (the same open review item as Romanian).
- **Correction during validation:** `approval.failed` first read "Apstiprinājums netika apstiprināts" ("approval was not approved"). It now reads "Apstiprinājuma saglabāšanu neizdevās pārbaudīt". Keys and tokens are unchanged.
- Validation: Latvian tests **22/22**; `tsc --noEmit` and `eslint` pass. Prettier rewrapped a few lines. The wording fix is re-tested with the next batch.
- Counts: Latvian **1,758 / 3,850**; remaining languages ga, lv, lt, mt: **13,642** outstanding.

## Milestone 40 — Latvian technical crawl, Google index and performance

- **New files, merged into one `technical` batch** (238 keys; namespaces `crawl`, `gindex`, `perf`; fingerprint `106a19b8…35e6`, identical to Romanian). Test count 1,758 → 1,996.
  - `lv-crawl.ts`: 106 `crawl.*` keys from `technical-crawl.ts`.
  - `lv-google-index.ts`: 69 `gindex.*` keys from `google-index.ts`.
  - `lv-performance.ts`: 63 `perf.*` keys from `technical-performance.ts`.
- **Kept distinct:**
  - DNS ownership verification expires after 24 hours;
  - a listed sitemap URL is a declaration, not proof that a page exists or is indexed;
  - crawl completion does not prove full-site coverage, Google indexing or Core Web Vitals;
  - editing an opportunity neither changes the saved observation nor proves a fix;
  - Google index inspection neither tests the live page nor requests indexing;
  - refreshing history never calls Google or the measurement service;
  - missing reported entries do not prove absence;
  - a lab test does not establish real-user Core Web Vitals;
  - uncertain requests are never retried automatically.
- **Preserved:**
  - "24", "10", "2 000" (regular space), "100", "20", "(0–100)", "(ms)", "HTTP 4xx", "robots.txt";
  - TXT, DNS, XML, JSON, HTML, CrUX, PageSpeed, LCP, CLS, Core Web Vitals, Search Console;
  - `{files}`, `{queued}`, `{urls}`, `{locs}`, `{rejected}`, `{done}`;
  - "four" / "three" stay words ("četriem", "trīs").
- **Terms:**
  - "pārmeklēšana" (crawl), "rāpuļprogramma" (crawler), "vietnes karte" (sitemap), "rekvizīts" (Search Console property);
  - "avots" for origin, a review item because "avots" also means source elsewhere;
  - "Dators" / "Mobilais" for device labels, consistent with the editor preview.
- **Review item:** count strings (`crawl.sitemapCounts`, `crawl.counts`, `crawl.sitemapEntries`) use "label: {value}" pairs to avoid plural agreement with placeholders.
- Validation: Latvian tests **23/23** (this includes the Milestone 39 wording fix); `tsc --noEmit` and `eslint` pass. Prettier rewrapped a few lines.
- Counts: Latvian **1,996 / 3,850**; remaining languages ga, lv, lt, mt: **13,404** outstanding.

## Milestone 41 — Latvian analytics, Search Console and reports

- **New file** `lv-measurements.ts` (204 keys; namespaces `analytics`, `gsc`, `report`; fingerprint `216126da…8395`, identical to Romanian). Test count 1,996 → 2,200.
- **Key set:** taken from `ro-measurements.ts`, which is override-aware, and cross-checked against `en.ts` and `gsc-integrity.ts`. `gsc.sourceApi`, `gsc.sourceCsv`, `gsc.rec.waitOrPromote` and `gsc.helper` follow the `gsc-integrity` override ("Declared API source", "Owner-supplied CSV", "Measurement unavailable", "One table per CSV…"), not the superseded `en.ts` text.
- **Kept distinct:**
  - reports are based on saved publication results and do not recheck live pages;
  - "accepted for sending" is not confirmed delivery;
  - AI referral traffic is under-counted and is not mentions, citations or rankings, and crawler rows are not visits;
  - Search Console data does not guarantee future rankings;
  - declared source and property are not independent verification;
  - "—" means unavailable, never zero;
  - query and page tables are separate samples that are not added together;
  - search observations do not establish causality.
- **Preserved:**
  - "30 d.", "28", "90", "1000" (truncation notice, as in the source), "1 000" (regular space, where the source has "1,000"), "2 MB", "0–1", "2026", "✓";
  - `{agency}`, `{count}`, `{clicks}`, `{impressions}`, `{position}`, `{date}`, `{days}`, `{rows}`;
  - "Settings → Secrets", `docs/GSC-OAUTH-SETUP.md`, and the CSV table names Query / Page / Date;
  - Lovable Cloud, OAuth, PDF, GSC, CTA, CTR.
- **Allowlist:** "CTA", "Milo Score", "Search Console Lite" and "CTR" were added (the same keys as Romanian).
- **Review items:**
  - count strings use "label: {value}" to avoid plural agreement;
  - "Pacific calendar days" is rendered as "Klusā okeāna laika kalendārās dienas";
  - "Agency" in `report.branding.title` is kept as the plan name.
- Validation: Latvian tests **24/24**; `tsc --noEmit` and `eslint` pass. Prettier rewrapped a few lines.
- Counts: Latvian **2,200 / 3,850**; remaining languages ga, lv, lt, mt: **13,200** outstanding.

## Milestone 42 — Latvian outreach, opening hooks, image placement and delivery integrity

- **New files, merged into one `outreach` batch** (158 keys; namespaces `outreach`, `hook`, `anchor`; fingerprint `c2bfe98e…61b4`, identical to Romanian). Test count 2,200 → 2,358.
  - `lv-outreach.ts`: `outreach.*`, `hook.*` and `anchor.*` from `en.ts`.
  - `lv-outreach-integrity.ts`: 27 `outreach.integrity.*` keys. These are generated in `outreach-integrity.ts`, including the three `recoveryCopy` cancel strings appended at the end of that file.
- **Kept distinct:**
  - Milo never sends email automatically, and every initial message and follow-up needs exact recipient and content confirmation;
  - provider acceptance does not verify inbox delivery, opens, replies or link placement;
  - refreshing never sends or retries;
  - deleting a draft does not clear a reservation;
  - unknown or started attempts cannot be cancelled or retried;
  - editable draft statuses are not a recorded attempt;
  - the YMYL hook finding is recommended but no longer required to publish.
- **Preserved:** "24", "3.0" (Article Studio 3.0), "3 000" (regular space), `{count}`, `{status}`, `{time}`, "→", Resend, CTA, FAQ ("BUJ").
- **Terms:** "ievadfrāze" (opening hook), "enkurs" (anchor), "atkārtotais ziņojums" (follow-up), "apliecinājums" (provider receipt, distinct from "apstiprinājums" = confirmation/approval), "avārijas slēdzis" (kill switch).
- **Correction during authoring:** `hook.finding.excessive-clickbait` first had the invalid imperative "Mazinie". It now reads "Maziniet", and the fix was made before validation.
- **Style:** the confirmation checkboxes use the gender-neutral first-person past ("Es pārbaudīju", "Es pārskatīju") and "ar šo personu" for the recipient.
- Validation: Latvian tests **25/25**; `tsc --noEmit` and `eslint` pass. Prettier rewrapped a few lines.
- Counts: Latvian **2,358 / 3,850**; remaining languages ga, lv, lt, mt: **13,042** outstanding.

## Milestone 43 — Latvian authority, pending actions and public audit

- **New file** `lv-growth.ts` (201 keys; namespaces `authority`, `actions`, `publicAudit`; fingerprint `79460ac6…f136`, identical to Romanian). Test count 2,358 → 2,559. There are no override files: the key count is 201 in `en.ts`, `pl.ts`, `sv.ts` and `da.ts`.
- **Kept distinct:**
  - authority opportunities are suggestions and guarantee no backlinks, rankings, traffic or revenue;
  - the public audit is a readiness audit, not a live ranking check;
  - Claude can only propose, and nothing applies until the user approves;
  - on approval, duplicates and anything over the workspace limit are skipped, and displayed counts are not guaranteed;
  - approval does not change setup-complete status.
- **Preserved:** `{count}`, "Citation / NAP", "GSC Lite", "PR", "yourbusiness.com" (example domain kept), and the trailing colon in `actions.resolve.approveBody` (a field list follows).
- **Allowlist:** "H1" (`publicAudit.signal.h1`, as in Romanian) and "Authority Builder" (`authority.title`) were added.
- **Review item:** Romanian translated the tool name ("Constructor de autoritate"), while Latvian keeps "Authority Builder", consistent with the Latvian beta pages. A cross-locale naming decision is needed.
- **Correction during validation:** `authority.disclaimer` first used the masculine "Jūs esat atbildīgs". It now reads "Atbildība … ir jūsu" (gender-neutral). Keys and tokens are unchanged.
- Validation: Latvian tests **26/26**; `tsc --noEmit` and `eslint` pass. Prettier rewrapped a few lines.
- Counts: Latvian **2,559 / 3,850**; remaining languages ga, lv, lt, mt: **12,841** outstanding.

## Milestone 44 — Latvian billing, launch checklist and beta notes

- **New file** `lv-commerce.ts` (192 keys; namespaces `billing`, `launch`, `beta`; fingerprint `6cd0596e…58ff2`, identical to Romanian). Test count 2,559 → 2,751.
- **Overrides applied from the start:**
  - nine keys follow `launch-readiness.ts`: `billing.paddleNote`, `launch.item.paddlePending(.desc)`, `launch.qa.paddle`, `beta.intro`, `beta.reassure`, `beta.limit.paddle`, `beta.limit.images`, `beta.demo.payments`. These carry the Stripe-replaces-Paddle wording, not the superseded `en.ts` text;
  - `launch.conn.gsc.csvOnly` / `synced` follow `gsc-integrity.ts`.
- **Kept distinct:**
  - the Stripe test checkout makes no real charge and changes no plan;
  - live payment setup and verification are incomplete, so payments must not be presented as live;
  - checklist completion alone does not establish paid self-service readiness;
  - a successful connection test does not verify publishing permissions;
  - billing country, not site language or region, sets pricing eligibility;
  - a saved API-source import does not verify the current connection.
- **Preserved:** `{n}`, "30 d.", Stripe, Paddle, WordPress, Shopify, OAuth, GSC, Milo Score, Brand Intelligence.
- **Allowlist:** "Brand Intelligence" and "GSC Lite" (`launch.conn.*`, the same keys as Romanian) were added.
- **Terms:** "Free Preview" is rendered as "Bezmaksas priekšskatījums" and "Assisted Setup" / "Monthly Care" as "Asistēta iestatīšana" / "Ikmēneša aprūpe", consistent with earlier batches (the same open plan-name review item); "smilškaste" means sandbox.
- **Correction during authoring:** the missing macron in `beta.reassure` ("Neparbaudītās" → "Nepārbaudītās") was fixed before validation.
- Validation: Latvian tests **27/27**; `tsc --noEmit` and `eslint` pass. Prettier rewrapped a few lines.
- Counts: Latvian **2,751 / 3,850**; remaining languages ga, lv, lt, mt: **12,649** outstanding.

## Milestone 45 — Latvian link network, backlinks, marketplace and backlink monitoring

- **New files, merged into one `links` batch** (256 keys; namespaces `linknet`, `backlinks`, `marketplace`, `backlinkMonitor`, `backlinkDetails`, `backlinkRecurring`; fingerprint `7b8c4cfd…40d7`, identical to Romanian). Test count 2,751 → 3,007.
  - `lv-links.ts`: `linknet.*`, `backlinks.*` and `marketplace.*`. Key set taken from `ro-links.ts` (override-aware).
  - `lv-backlink-monitoring.ts`: 43 `backlinkMonitor.*` keys.
  - `lv-backlink-details.ts`: 24 `backlinkDetails.*` keys.
  - `lv-backlink-recurring.ts`: 31 `backlinkRecurring.*` keys.
- **Overrides applied from the start:**
  - `backlinks.gapNote` and the nine `backlinks.integrity.*` keys follow `backlink-integrity.ts` (provider sample with your domain excluded; not independent verification);
  - `linknet.policyNote` and `linknet.reciprocalWarn` follow `link-network-copy.ts` (no promise of search-policy compliance), replacing the superseded "keeps your link profile safe with Google" text.
- **Kept distinct:**
  - backlink metrics are index estimates;
  - "—" means unavailable, never zero;
  - omitted domains do not prove lost links;
  - a marketplace request is not a purchase;
  - demo mode creates no provider order or payment;
  - a paid order needs exact-total confirmation;
  - an unconfirmed provider outcome is saved as "In review" and must not be retried;
  - daily counts do not verify individual placements;
  - first-seen and last-seen dates describe the index, not actual placement;
  - the monitor cap adds no funds;
  - an admitted collection can still finish and incur its reserved cost after pausing.
- **Preserved:**
  - `{balance}`, `{list}`, `{date}`, `{count}`, `{count}%`, `{time}`, `€{total}`, `{retained}`, `{returned}`, `{total}`, `{page}`, `{month}`, `{used}`, `{cap}`;
  - `rel="sponsored"`, DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD;
  - "1–92", "100", "0–20 000" and "10 000" (regular spaces), "0–100 USD", and "0.024" / "0.000036 USD" (dot decimals kept as in the source; the same review item as Romanian);
  - DataForSEO, Linkhouse, Backlinks API.
- **Allowlist:** "nofollow" and "Demo" (the same keys as Romanian) were added.
- **Style:** "white-hat" is rendered as "godprātīgi (white-hat)". The purchase confirmations use the gender-neutral first-person present ("Es pieprasu", "Es skaidri atļauju", "Es apstiprinu").
- Validation: Latvian tests **28/28**; `tsc --noEmit` and `eslint` pass. Prettier rewrapped a few lines.
- Counts: Latvian **3,007 / 3,850**; remaining languages ga, lv, lt, mt: **12,393** outstanding.

## Milestone 46 — Latvian publication proof, AI answers, logs, evaluation and benchmark

- **New file** `lv-evidence.ts` (196 keys; namespaces `answer`, `logs`, `proof`, `aiEval`, `benchmark`; fingerprint `2911f87d…211d`, identical to Romanian). Test count 3,007 → 3,203.
- **Sources:**
  - `benchmark.*` and `aiEval.*` from `en.ts`;
  - `proof.*` from `proof-evidence.ts` (its `workflow.*` keys belong to the workflow batch);
  - `answer.*` (69) generated from the key/value arrays in `answer-evidence.ts`;
  - `logs.*` (45) from the `en` object in `log-evidence.ts`.
- **Kept distinct:**
  - a connector response is not independent confirmation of the live page;
  - saved GSC imports are owner-controlled evidence;
  - tentative observations do not establish causation;
  - all answer and log provenance is owner-supplied and unverified, and saving makes no provider call;
  - a sample is not a representative survey;
  - prompt versions, markets and models are never pooled;
  - zero supplied log rows do not prove zero crawler traffic;
  - evaluation results do not change production routing, and Milo never auto-switches models.
- **Preserved:** `$5`, "50", "90 kB", "200", "100", "31", "500", "500 kB", "180 kB", `{count}`, `{sources}`, `{knowledge}`, `{stages}`, `{clicks}`, `{impressions}`, OpenAI, GSC, JSON, ISO, user-agent, HTTP.
- **Allowlist:** "Milo Score" (`aiEval.taskType.contentQualityScore`) and "API" (`answer.api`) were added (the same keys as Romanian).
- **Terms:** "vaicājums" (prompt, consistent with the evidence screen), "virsma" (surface), "malas žurnāls" (edge log), "izcelsmes servera žurnāls" (origin log).
- Validation: Latvian tests **29/29**; `tsc --noEmit` and `eslint` pass. Prettier rewrapped a few lines.
- Counts: Latvian **3,203 / 3,850**; remaining languages ga, lv, lt, mt: **12,197** outstanding.

## Milestone 47 — Latvian workflow: editor, scheduling, quality, presentation, Today/Plan and generation results

- **New files, merged into one `workflow` batch** (345 keys, 17 namespaces, fingerprint `649e9d72…6615`, identical to Romanian). Test count 3,203 → 3,548.
  - `lv-workflow-editor.ts`: `autoSched`, `prev`, `imgGen`, `arrange`, `visual`, `editor`, `status`, `quality`, `calsched`, `pres`, `featured` from `en.ts`.
  - `lv-workflow-plan.ts`: `dashboard` (from `en.ts`), `today` / `plan` (from `premium.ts`, including the `plan.detail.*` and `plan.source.manual` strings appended by its `inspector` loop), and `workflow.*` (from `proof-evidence.ts`).
  - `lv-workflow-results.ts`: `generationResults` and `publishingFidelity`.
- **Kept distinct:**
  - approving never publishes, and nothing goes live until scheduled or published now;
  - a saved schedule is subject to checks and destination availability, and an overdue schedule is unconfirmed;
  - an in-flight publication cannot be stopped;
  - source-held dates queue nothing;
  - presentation is applied in the Milo preview only, not verified on the destination;
  - recovery approves, schedules and publishes nothing, and removing a saved copy returns no allowance;
  - local content checks and planned payloads do not confirm delivery or rich results;
  - imported workflow comparisons run no models and prove no improvement by themselves.
- **Preserved:** "Article Studio 3.0" / "3.0", "(1:1)", "(4:5)", "(4:3)", "7", `{when}`, `{title}`, `{date}`, `{count}`, `{concept}`, `{connector}`, SEO/GEO, JSON-LD, Markdown.
- **Terms:**
  - weekday abbreviations "P O T C Pk S Sv";
  - "go-live" is rendered as "publicēšana";
  - "Slug" as "URL identifikators" and "Calendar" as "Kalendārs", consistent with the Latvian editor screen, so only `quality.title` ("Milo Score") was allowlisted;
  - "FAIL" is emphasised as "NEIZDOSIES".
- **Correction during authoring:** `featured.none` first read "apstipriniet attēlu attēlu panelī" (a stutter). It now reads "apstipriniet kādu attēlu panelī “Attēli”", fixed before validation.
- Validation: Latvian tests **30/30**; `tsc --noEmit` and `eslint` pass. Prettier rewrapped a few lines.
- Counts: Latvian **3,548 / 3,850**; remaining languages ga, lv, lt, mt: **11,852** outstanding. Remaining Latvian batches: configuration (220) and conversation (82).

## Milestone 48 — Latvian configuration: brand, connectors, Claude MCP and location coverage

- **New files, merged into one `configuration` batch** (220 keys; namespaces `brand`, `wp`, `shopify`, `claude`, `connect`, `connections`, `coverage`; fingerprint `0e11ebfc…aa60`, identical to Romanian). Test count 3,548 → 3,768.
  - `lv-configuration.ts`: brand intelligence, WordPress and Shopify connectors, the Claude MCP connector (including `claude.apps.*` and `claude.apps.scope.needsApproval`), the connect authorization screen, and `connections.*` from `premium.ts`.
  - `lv-coverage.ts`: 45 `coverage.*` keys from `location-coverage.ts`.
- **Kept distinct:**
  - an application password or token is never shown again after saving;
  - Shopify approval alone never publishes;
  - the Claude token is account-wide and read-only;
  - propose-scope connections can never approve their own suggestions, publish, delete, or change settings or billing;
  - coverage details are unverified claims (listings, NAP, hreflang, rankings);
  - an exact page-URL match does not verify live coverage.
- **Preserved:** "Settings → Apps and sales channels → Develop apps" (external admin path in English), "Application Password", "mystore.myshopify.com", "claude_desktop_config.json", "Claude.ai", "MCP", "REST API", "••••••", "2 000" (regular space), `{count}`, `{handle}`.
- **Allowlist:** "Brand Intelligence", "URL", "WordPress", "Shopify", "Claude Code (CLI)" and "Claude Desktop (claude_desktop_config.json)" were added (the same keys as Romanian).
- **Style:** "Signed in as" is rendered as the neutral "Pieteikšanās konts", and "you remain responsible" as "atbildība … paliek jūsu" (avoiding masculine participles). "NOT" is emphasised as "NEVARĒS".
- **Correction during validation:** the no-English-copy guard failed on `brand.section.cta` "CTA preferences", which is identical to English because "preferences" is also valid Latvian. It was reworded to "CTA vēlmes"; the guard rather than the allowlist was satisfied.

## Milestone 49 — Latvian conversation batch; Latvian complete

- **New file** `lv-conversation.ts` (82 `chat.*` keys, typed as `ConversationCopy`), including the 10 `chat.account.*` keys from Milestone 1. Fingerprint `37dd02d1…1b85`, the same as the other 16 staged locales.
- **Tests:**
  - `latvian.test.ts` now asserts **3,850** keys and includes the complete-English-key-set test (as in Hungarian and Romanian);
  - `conversation.test.ts` includes `lv` in its staged map.
- **Kept distinct:**
  - deletion does not restore access;
  - titles stay hidden after a failed check;
  - work already sent may finish and use the allowance;
  - an unconfirmed send must be recovered before resending;
  - stopping prevents later steps but cannot recall a request already sent.
- **Validation:**
  - Latvian + conversation tests **54/54**;
  - `vitest run src/i18n` **606/606, 26 files**;
  - `tsc --noEmit` and `eslint` pass; Prettier applied.
- **Counts:** Latvian **3,850 / 3,850**, staged only: `isUiLanguage("lv")` is still false and nothing is registered in the runtime or language picker. Remaining languages lt, mt, ga: **11,550** outstanding.
- **Fluent review still needed for all Latvian copy.** Open Latvian review items, collected from Milestones 26–49:
  - masculine "Jūs esat pieteicies" in `authScreen.passwordUpdated`;
  - plan and service names translated ("Bezmaksas priekšskatījums", "Asistēta iestatīšana", "Ikmēneša aprūpe") versus kept ("Agency", "Authority Builder", "Milo Score"). Romanian made the opposite call for Authority Builder, so a cross-locale decision is needed;
  - "avots" used for both source and origin;
  - `{business}{location}` composition and the `knowledge.ui.irreversible` leading "?" (the same as Romanian);
  - "label: {value}" count phrasing chosen to avoid plural agreement;
  - hero fragment emphasis on the public home;
  - the page-language claim (EN/PL/SV/DA) on the public beta page;
  - dot decimals for USD in `backlinkRecurring.allowance`.
- **Next:** Lithuanian, starting with authentication and shared controls. Register: formal plural imperative, matching `euEmailCopy.lt` ("Atidarykite", "Peržiūrėti"). Roles: Skaitytojas / Redaktorius / Tikrintojas.

## Milestone 50 — Lithuanian staged authoring, batch 1 (authentication + shared controls)

- **New files:**
  - `src/i18n/staged/lt-auth-screen.ts` (48 `authScreen.*` keys);
  - `lt-shared-ui.ts` (24 `sharedUi.*` keys);
  - index `lt.ts` (`LT_STAGED_BATCHES` / frozen `LT_STAGED_CATALOG`);
  - `lithuanian.test.ts`, which follows `latvian.test.ts`: fingerprint and token checks per batch, runtime exclusion (`isUiLanguage("lt")` false), unique ownership, and a 72-key count. Its no-English-copy allowlist starts empty.
- **Fingerprints** are identical to the Romanian and Latvian batches from `ff9b085`: `f0d4cd1c…29dc8` and `678278d0…d9de5`.
- **Style:**
  - formal plural imperative for instructions ("Prisijunkite", "Įveskite"), infinitive for buttons ("Prisijungti", "Sukurti paskyrą");
  - "DI" (dirbtinis intelektas) for AI, per standard Lithuanian usage (a review item: confirm against product preference for "AI");
  - "8" preserved;
  - `authScreen.passwordUpdated` uses the neutral "Jūsų sesija aktyvi" instead of a gendered participle.
- Validation: Lithuanian tests **4/4**; `tsc --noEmit` and `eslint` pass. Prettier rewrapped one line.
- Counts: Lithuanian **72 / 3,850**; remaining languages lt, mt, ga: **11,478** outstanding.

## Milestone 51 — Lithuanian core batch

- **New file** `lt-core.ts` (202 keys; namespaces `common`, `nav`, `appShell`, `shell`, `onboarding`, `setup`, `lang`, `market`, `goal`, `pipeline`; fingerprint `845b2b1a…7ff2`, identical to Romanian and Latvian). Test count 72 → 274.
- **Overrides applied from the start:** `shell.nav.home`, `shell.nav.backlinks`, `shell.nav.insights` and `pipeline.stage.live` follow `premium.ts` ("Šiandien", "Nuorodos", "Matomumas", "Paskelbta").
- **Terms:**
  - "juodraštis" (draft), "darbo sritis" (workspace), "kreipimaisi" (outreach), "atgalinės nuorodos" (Backlinks label, distinct from the "Nuorodos" shell label);
  - `pipeline.stage.planned` "Suplanuota" versus `armed` "Paskelbimas suplanuotas", so the two stages stay distinguishable;
  - "Premium analitika" keeps the plan name.
- **Preserved:** `{step}` with "7" ("{step} žingsnis iš 7"), "iki 3", `{currency}`, "Milo Growth — sukūrė Andersen Innovations".
- **Style:** `shell.loadError.body` uses the neutral "Jei nėra interneto ryšio" instead of a participle addressed to the user.
- Validation: Lithuanian tests **5/5**; `tsc --noEmit` and `eslint` pass; Prettier reported no changes.
- Counts: Lithuanian **274 / 3,850**; remaining languages lt, mt, ga: **11,276** outstanding.

## Milestone 52 — Lithuanian setup, services and audit screens

- **New files** (71 keys; fingerprints identical to Romanian and Latvian). Test count 274 → 345.
  - `lt-setup-screen.ts`: 24 keys, fingerprint `565b0bcd…a5ca`.
  - `lt-services-screen.ts`: 18 keys, fingerprint `c769d10a…313d`.
  - `lt-audit-screen.ts`: 29 keys, fingerprint `2c15a706…1aed`.
- **Kept distinct:**
  - approval marks an article ready and never publishes;
  - previously approved articles may still be drafts;
  - on-page review scores are assessments, not measured metrics or a full-site crawl;
  - the on-page review never runs the separate technical crawl.
- **Preserved:** `{field}`, `{fields}`, `{mode}`, `{count}`, `{name}`, "iki 5", the `http://` / `https://` literals, and the `{business}{location}` composition (the same open review item as the other locales).
- **Terms:** "galinis taškas" (endpoint), "slaptasis raktas" (secret), "DUK" (FAQ), "Puslapio peržiūra" (On-page review, matching `shell.nav.onpage`), "nuskaitymas" (crawl), "apyt." (est.).
- Validation: Lithuanian tests **8/8**; `tsc --noEmit` and `eslint` pass; Prettier reported no changes.
- Counts: Lithuanian **345 / 3,850**; remaining languages lt, mt, ga: **11,205** outstanding.

## Milestone 53 — Lithuanian analytics and billing screens

- **New files** (90 keys; fingerprints identical to Romanian and Latvian). Test count 345 → 435.
  - `lt-analytics-screen.ts`: 36 keys, fingerprint `d86d1510…02c5`.
  - `lt-billing-screen.ts`: 54 keys, fingerprint `d0e701ba…7194`.
- **Kept distinct:**
  - views are recorded events, not unique visitors;
  - click rate does not measure completed sales or bookings;
  - the report is limited to up to 50 000 retrieved events from 60 days;
  - publisher placements need separate review and purchase approval.
- **Preserved:** "50 000", "30", "60", "1", "3", "5", "15", `{n}`, `{views}`, `{clicks}`, `{title}`, `{date}`, `billing@milogrowth.com`, Milo Analytics, Milo Score, GSC Lite, Brand Intelligence, Paddle, WordPress, "v2".
- **Terms:** "jungtis" (connector), "Nemokama peržiūra" (Free Preview; the same plan-name review item as Latvian).
- Validation: Lithuanian tests **10/10**; `tsc --noEmit` and `eslint` pass; Prettier reported no changes.
- Counts: Lithuanian **435 / 3,850**; remaining languages lt, mt, ga: **11,115** outstanding.

### Correction to earlier milestones: thousands separators

- Earlier milestones said grouped numbers such as "2 000" and "50 000" use a non-breaking space. A byte-level search shows every staged Romanian, Latvian and Lithuanian file uses an ordinary space, matching the existing Hungarian files the convention came from. There are 28 occurrences, and no U+00A0 anywhere in those files.
- Those milestone notes now read "regular space". No catalog change was needed, and the number-token checks pass either way. If typographic non-breaking spaces are wanted, that is a separate cross-locale change covering Hungarian too.

## Milestone 54 — Lithuanian evidence screen (competitors + AI readiness)

- **New file** `lt-evidence-screen.ts` (89 keys, fingerprint `2c7e9ccb…c136`). Test count 435 → 524.
- **Kept distinct:**
  - competitor analysis is a snapshot, not ongoing monitoring;
  - failed fetches supply no competitor evidence;
  - gap scores are estimates;
  - readiness analysis does not check live answers in ChatGPT, Perplexity, Gemini or Google AI Overviews;
  - AI referral traffic measures visits only.
- **Preserved:** `{business}{location}`, `{number}`, `{count}`, `{level}`, "iki 3", "1–3", "iki 5", "→".
- **Terms:** "spraga" (gap), "užklausa" (prompt, as a score label), "klausimai" (question categories), "momentinė kopija" (snapshot), "DI" (AI).
- Validation: Lithuanian tests **11/11**; `tsc --noEmit` and `eslint` pass; Prettier reported no changes.
- Counts: Lithuanian **524 / 3,850**; remaining languages lt, mt, ga: **11,026** outstanding.

## Milestone 55 — Lithuanian plan screen

- **New file** `lt-plan-screen.ts` (113 keys, fingerprint `288f529e…4bb7`). Test count 524 → 637.
- **Kept distinct:**
  - a work target date ("darbo tikslinė data") is not a publication time;
  - accepting a discovery suggestion creates no content and schedules nothing;
  - an armed schedule on an orphaned draft stays active.
- **Preserved:** `{date}`, `{count}`, `{skipped}`, `{title}`, `{from}`, `{to}`, `{label}`, `{source}`, `{stage}`, "→".
- **Allowlist:** "Claude" and "Search Console" source labels were added (the same keys as Romanian and Latvian).
- **Review item:** "Plan" is used as the locative "plane" inside sentences and "Planas → {stage}" in the manual help, matching the "Planas" navigation label.
- Validation: Lithuanian tests **12/12**; `tsc --noEmit` and `eslint` pass. Prettier rewrapped two lines.
- Counts: Lithuanian **637 / 3,850**; remaining languages lt, mt, ga: **10,913** outstanding.

## Milestone 56 — Lithuanian editor screen

- **New file** `lt-editor-screen.ts` (148 keys, fingerprint `1e827d27…ec9f`). Test count 637 → 785.
- **Kept distinct:**
  - structured data is included for managed platforms but not sent to custom endpoints, and the search engine decides rich results;
  - uploads stay private until alt text and approval, and approval makes the URL public;
  - unresolved links block sending and publishing through every connector;
  - only validation-verified sources are cited;
  - Milo never invents an author name or credential;
  - the E-E-A-T recommendation does not block publishing.
- **Preserved:** "5 MB", "{count}/60", "{count}/160", `{platform}`, `{path}`, `{anchor}`, `{section}`, `{claim}`, `{language}`, `{type}`, `{source}`, "schema.org JSON-LD", "Google Rich Results Test", "E-E-A-T", "sameAs", "Markdown", "HTML", "JPEG, PNG, WebP", "PT, MSc".
- **Allowlist:** "H1" was added. "Slug" and "Desktop" are translated ("URL identifikatorius", "Kompiuteris").
- **Terms:** "TVS" (CMS), "jungtis" (connector), "išplėstiniai rezultatai" (rich results).
- Validation: Lithuanian tests **13/13**; `tsc --noEmit` and `eslint` pass. Prettier rewrapped two lines.
- Counts: Lithuanian **785 / 3,850**; remaining languages lt, mt, ga: **10,765** outstanding.

## Milestone 57 — Lithuanian public pricing and case studies

- **New files** (70 keys; fingerprints identical to Romanian and Latvian). Test count 785 → 855.
  - `lt-public-pricing.ts`: 40 keys, fingerprint `8e7cecc9…de60`.
  - `lt-public-studies.ts`: 30 keys, fingerprint `ace563fb…e8de`.
- **Kept distinct:**
  - new paid subscriptions, add-on activation and marketplace purchases are on hold pending payment and supplier acceptance;
  - billing country, not site language or region, sets price eligibility;
  - no rankings, traffic, revenue or AI citations are guaranteed;
  - case studies claim no observed growth outcome or verified customer result.
- **Preserved:** `{count}`, "1 projektas", Agency, Milo Score, Brand Intelligence, Synergy, Search Console. The place names are declined ("Limhamne / Malmėje").
- **Review item:** "Assisted Setup" / "Monthly Care" are translated as "Asistuojama sąranka" / "Mėnesinė priežiūra", the same plan-name decision as Latvian.
- Validation: Lithuanian tests **15/15**; `tsc --noEmit` and `eslint` pass. Prettier rewrapped one line.
- Counts: Lithuanian **855 / 3,850**; remaining languages lt, mt, ga: **10,695** outstanding.

## Milestone 58 — Lithuanian public home

- **New file** `lt-public-home.ts` (100 keys, fingerprint `2855ce0e…c141`). Test count 855 → 955.
- **Kept distinct:**
  - nothing enters Plan until accepted;
  - human review happens before publication;
  - saved connection settings alone do not confirm publication;
  - missing data is not zero activity;
  - Milo Score never ranks opportunities;
  - Backlinks activation and purchases are on hold;
  - cancellation is via Settings → Billing ("Nustatymai → Atsiskaitymai") for linked subscriptions only.
- **Preserved:** `{count}`, `{number}`, `{region}`, Milo Growth, Milo Score, Search Console, Agency, Premium.
- **Allowlist:** "Beta" was added.
- **Style:** `publicHome.faqCancelQ` uses the impersonal "Ar galima atšaukti nesikreipiant…" to avoid a gendered participle.
- **Review items (the same as Romanian and Latvian):**
  - hero fragments "Jūsų mėnesinė" + emphasised "DI augimo" + "sistema";
  - "Captured" rendered as the stage label "Idėja";
  - the `{region}` strings use a colon to avoid case inflection.
- Validation: Lithuanian tests **16/16**; `tsc --noEmit` and `eslint` pass; Prettier reported no changes.
- Counts: Lithuanian **955 / 3,850**; remaining languages lt, mt, ga: **10,595** outstanding.

## Milestone 59 — Lithuanian beta validation screen

- **New file** `lt-beta-screen.ts` (88 keys, fingerprint `c4dcf482…8119`). Test count 955 → 1,043.
- **Kept distinct:**
  - the page is an internal owner-only playbook;
  - outreach templates use their own language choice and need review;
  - CSV exports keep the original field names;
  - tracker statuses stay distinct ("Susisiekta", "Atsakė", "Demonstracija užsakyta", "Demonstracija įvykusi", "Priėmė beta versiją", "Atsisakė", "Susisiekti vėliau").
- **Preserved:** "12–13", "20", "1–5", "PL / EN / SV", "CSV", Milo Growth.
- **Terms:** "Monthly Care" is "Mėnesinė priežiūra", consistent with public pricing; "UK" / "EU" become "Jungtinė Karalystė" / "ES". No allowlist additions.
- Validation: Lithuanian tests **17/17**; `tsc --noEmit` and `eslint` pass; Prettier reported no changes.
- Counts: Lithuanian **1,043 / 3,850**; remaining languages lt, mt, ga: **10,507** outstanding.

## Milestone 60 — Lithuanian public beta page

- **New file** `lt-public-beta.ts` (100 keys, fingerprint `e670953b…fb59e`). Test count 1,043 → 1,143.
- **Kept distinct:**
  - paid launch and payments are on hold (Stripe setup, commercial approval);
  - connectors need live end-to-end testing per site;
  - demo data is not proof of growth, and missing Search Console data is not zero clicks;
  - brand rules support review but do not prove claims;
  - the founding-beta price is for the first pilot businesses only.
- **Preserved:** the price ranges exactly as in the source ("699–1499 PLN", "299–599 PLN", "2500–5000 SEK", "799–1499 SEK", "€249–€499", "€79–€149"), "8–10", "30", "1–4 savaitė", the quoted talk track, "→", Stripe, WordPress, Shopify, GSC Lite, Search Console, Milo Score, Brand Intelligence, Authority Builder.
- **Allowlist:** "Beta" and "Milo Growth Assisted Beta" were added (the same keys as Romanian and Latvian).
- **Review item (the same as the other locales):** the page-language claim (EN/PL/SV/DA) is translated as stated.
- Validation: Lithuanian tests **18/18**; `tsc --noEmit` and `eslint` pass. Prettier rewrapped a line.
- Counts: Lithuanian **1,143 / 3,850**; remaining languages lt, mt, ga: **10,407** outstanding.

## Milestone 61 — Lithuanian beta guidance playbook

- **New file** `lt-beta-guide.ts` (125 keys, fingerprint `8c815e10…520d`). Test count 1,143 → 1,268.
- **Kept distinct:**
  - the playbook is not evidence that validation happened;
  - outreach, demos, live audits and generation each need separate authorization;
  - no payment is collected while paid launch is on hold, and a manual Billing status does not confirm payment;
  - what was shown differs from what was verified;
  - copying a template does not send a message;
  - rankings, revenue, traffic and AI citations are never promised.
- **Preserved:** "20–30", "3–5", "1–2", "30", the target counts, `{name}`, `{referrer}`, `{points}`, "→", Synergy Massage, Stripe, Paddle, Shopify, WooCommerce, WordPress, Search Console, ChatGPT, Google Ads, Authority Builder.
- Validation: Lithuanian tests **19/19**; `tsc --noEmit` and `eslint` pass. Prettier rewrapped a line.
- Counts: Lithuanian **1,268 / 3,850**; remaining languages lt, mt, ga: **10,282** outstanding.

## Milestone 62 — Lithuanian collaboration, team, notifications and email settings

- **New files, merged into one `collaboration` batch** (248 keys; namespaces `collaboration`, `team`, `notifications`, `awareness`, `emailSettings`; fingerprint `429e59f1…77ed0`, identical to Romanian and Latvian). Test count 1,268 → 1,516.
  - `lt-collaboration.ts`: 98 keys.
  - `lt-team.ts`: 58 keys.
  - `lt-notifications.ts`: 15 `awareness.*` + 71 `notifications.*` keys.
  - `lt-email-settings.ts`: 6 keys.
- **New test:** `lithuanian.test.ts` now checks that `collaboration.viewer`, `collaboration.editor` and `collaboration.reviewer` equal `euEmailCopy.lt.invitation.roles` ("Skaitytojas", "Redaktorius", "Tikrintojas").
- **Kept distinct:**
  - opening an invitation email link grants no access, and creating an in-app invitation sends no email;
  - notifications need both owner assignment and recipient consent;
  - recording a review never publishes or resumes a held schedule;
  - saved advice and reports are dated evidence, not proof of results;
  - failure and recovery records do not verify the destination or restart work;
  - capacity is a shared allowance, not a promise of completed articles;
  - saving the email language neither enables nor sends email.
- **Preserved:** every placeholder (`{count}`, `{page}`, `{pages}`, `{at}`, `{attempts}`, `{status}`, `{period}`, `{saved}`, `{pending}`, `{publishing}`, `{published}`, `{failed}`, `{cancelled}`, `{shown}`, `{total}`, `{missing}`, `{remaining}`, `{usagePeriod}`), plus HTTP, PNG/JPEG/WebP, GSC, Markdown. "Seven days" stays a word ("septynių dienų").
- **Style:**
  - consent states use the neutral "Gavėjo sutikimas duotas";
  - the review acknowledgement uses the gender-neutral first-person past "Peržiūrėjau";
  - team role titles use generic masculine nouns ("strategas", "tyrėjas"), a review item shared with Latvian.
- Validation: Lithuanian tests **21/21**; `tsc --noEmit` and `eslint` pass. Prettier rewrapped a line.
- Counts: Lithuanian **1,516 / 3,850**; remaining languages lt, mt, ga: **10,034** outstanding.

## Milestone 63 — Lithuanian knowledge, weekly preparation, approval and source refresh

- **New file** `lt-knowledge.ts` (242 keys; namespaces `knowledge`, `weekly`, `approval`, `refresh`; fingerprint `a3a32970…5816`, identical to Romanian and Latvian). Test count 1,516 → 1,758.
- **Kept distinct:**
  - a knowledge review is separate from publication approval and may lapse when evidence changes;
  - inspection neither approves publication nor clears a hold;
  - a saved or approved draft is not queued;
  - a status label alone does not grant approval;
  - accepting a source fact does not independently verify it;
  - an unobserved catalog item is not a confirmed removal;
  - owner settings take precedence over source proposals.
- **Preserved:**
  - "100", "20", "5 MiB", "40 PDF", "2 000" (regular space), "500", `{count}`, `{when}`, `{date}`;
  - "five" and "ten-minute" stay words ("iki penkių", "dešimties minučių");
  - Shopify, PDF, DOCX, Brand Intelligence.
- **Composition:** `knowledge.ui.forgetAll` / `forgetRecord` are accusative objects for "Visam laikui pamiršti". `knowledge.ui.irreversible` keeps the leading "? ".
- **Avoided up front:** the Latvian `approval.failed` tautology did not recur ("Nepavyko užtikrinti, kad patvirtinimas išsaugotas").
- Validation: Lithuanian tests **22/22**; `tsc --noEmit` and `eslint` pass. Prettier rewrapped a few lines.
- Counts: Lithuanian **1,758 / 3,850**; remaining languages lt, mt, ga: **9,792** outstanding.

## Milestone 64 — Lithuanian technical crawl, Google index and performance

- **New files, merged into one `technical` batch** (238 keys; namespaces `crawl`, `gindex`, `perf`; fingerprint `106a19b8…35e6`, identical to Romanian and Latvian). Test count 1,758 → 1,996.
  - `lt-crawl.ts`: 106 keys.
  - `lt-google-index.ts`: 69 keys.
  - `lt-performance.ts`: 63 keys.
- **Kept distinct:**
  - DNS ownership verification expires after 24 hours;
  - a listed sitemap URL is a declaration, not proof of existence or indexing;
  - crawl completion does not prove full-site coverage, Google indexing or Core Web Vitals;
  - Google index inspection neither tests the live page nor requests indexing;
  - refreshing history never calls Google or the measurement service;
  - a lab test does not establish real-user Core Web Vitals;
  - uncertain requests are never retried automatically.
- **Preserved:** "24", "10", "2 000" (regular space), "100", "20", "(0–100)", "(ms)", "HTTP 4xx", "robots.txt", TXT, DNS, XML, JSON, HTML, CrUX, PageSpeed, LCP, CLS, Core Web Vitals, Search Console, and `{files}`, `{queued}`, `{urls}`, `{locs}`, `{rejected}`, `{done}`. "Four" and "three" stay words.
- **Terms:**
  - "nuskaitymas" (crawl), "robotas" (crawler), "svetainės schema" (sitemap), "nuosavybė" (Search Console property), "kilmė" (origin);
  - "Kompiuteris" / "Mobilusis" as device labels, consistent with the editor preview.
- Validation: Lithuanian tests **23/23**; `tsc --noEmit` and `eslint` pass. Prettier rewrapped a line.
- Counts: Lithuanian **1,996 / 3,850**; remaining languages lt, mt, ga: **9,554** outstanding.

## Milestone 65 — Lithuanian analytics, Search Console and reports

- **New file** `lt-measurements.ts` (204 keys; namespaces `analytics`, `gsc`, `report`; fingerprint `216126da…8395`, identical to Romanian and Latvian). Test count 1,996 → 2,200.
- **Overrides applied from the start:** `gsc.sourceApi`, `gsc.sourceCsv`, `gsc.rec.waitOrPromote`, `gsc.helper` and the `gsc.integrity.*` keys follow `gsc-integrity.ts`.
- **Kept distinct:**
  - reports do not recheck live pages;
  - "accepted for sending" is not confirmed delivery;
  - AI referral traffic is under-counted and is not mentions, citations or rankings;
  - declared source and property are not independent verification;
  - "—" means unavailable, never zero;
  - query and page tables are separate samples;
  - search observations do not establish causality.
- **Preserved:** "30 d.", "28", "90", "1000" (truncation notice, as in the source), "1 000" (regular space, where the source has "1,000"), "2 MB", "0–1", "2026", "✓", `{agency}`, `{count}`, `{clicks}`, `{impressions}`, `{position}`, `{date}`, `{days}`, `{rows}`, "Settings → Secrets", `docs/GSC-OAUTH-SETUP.md`, and the Query / Page / Date table names.
- **Allowlist:** "CTA", "Milo Score", "Search Console Lite" and "CTR" were added (the same keys as Romanian and Latvian).
- **Review items (shared with Latvian):** "label: {value}" count phrasing; "Pacific calendar days" rendered as "Ramiojo vandenyno laiko kalendorinės dienos".
- Validation: Lithuanian tests **24/24**; `tsc --noEmit` and `eslint` pass; Prettier reported no changes.
- Counts: Lithuanian **2,200 / 3,850**; remaining languages lt, mt, ga: **9,350** outstanding.

## Milestone 66 — Lithuanian outreach, hooks and anchors

- **New files:** `lt-outreach.ts` (outreach, hook, anchor) and `lt-outreach-integrity.ts`, which follows the `outreach-integrity.ts` overrides, including the `recoveryCopy` cancel strings. They are registered as one `outreach` batch (158 keys; fingerprint `c2bfe98e…61b4`, identical to Romanian and Latvian). Test count 2,200 → 2,358.
- **Terminology:** "hook" is rendered as "įžanginė frazė" and "anchor" as "inkaras"; "Article Studio 3.0" and "Resend" are kept as product names.
- **Kept distinct:**
  - Milo never sends email automatically;
  - every send and follow-up needs exact recipient and content confirmation;
  - "accepted for delivery" is not confirmed delivery;
  - the YMYL hook finding stays advisory ("no longer required to publish").
- **Preserved:** `{count}`, `{status}`, `{time}`, "24", "3.0", "→", and the CTA / FAQ ("DUK") placement labels.
- Validation: Lithuanian tests **25/25**; `tsc --noEmit` and `eslint` pass; Prettier reflowed `lt-outreach.ts` only.
- Counts: Lithuanian **2,358 / 3,850**; remaining languages lt, mt, ga: **9,192** outstanding.

## Milestone 67 — Lithuanian growth (authority, pending actions, public audit)

- **New file:** `lt-growth.ts` (201 keys; namespaces `authority`, `actions`, `publicAudit`; fingerprint `79460ac6…f136`, identical to Romanian and Latvian). Test count 2,358 → 2,559.
- **Kept distinct:**
  - authority opportunities are suggestions; Milo does not guarantee backlinks, rankings, traffic or revenue;
  - the public audit is a readiness check, not a live ranking check;
  - Claude can only propose changes; nothing applies until the user approves;
  - duplicates and over-limit items are skipped, and the counts shown are not guaranteed;
  - completion status is unchanged;
  - notes are never shared.
- **Preserved:** `{count}`, "yourbusiness.com", "GSC Lite", "NAP", "Meta", and "DUK" (FAQ).
- **Allowlist:** "Authority Builder" (product name, consistent with the Lithuanian beta pages) and "H1" were added, the same as Latvian.
- Validation: Lithuanian tests **26/26**; `tsc --noEmit` and `eslint` pass; Prettier reflowed `lt-growth.ts`.
- Counts: Lithuanian **2,559 / 3,850**; remaining languages lt, mt, ga: **8,991** outstanding.

## Milestone 68 — Lithuanian billing, launch readiness and beta notes

- **New file:** `lt-commerce.ts` (192 keys; namespaces `billing`, `launch`, `beta`; fingerprint `6cd0596e…8ff2`, identical to Romanian and Latvian). Test count 2,559 → 2,751.
- **Overrides applied from the start:** nine keys follow `launch-readiness.ts` (connector test scope, Stripe as Paddle's replacement with sandbox and lifecycle checks still outstanding, beta intro and reassurance, and the payments demo note). `launch.conn.gsc.csvOnly` and `launch.conn.gsc.synced` follow `gsc-integrity.ts`.
- **Kept distinct:**
  - the test payment charges nothing and does not change the plan;
  - a successful connector test does not verify publishing permissions;
  - checklist completion alone does not establish paid self-serve readiness;
  - an owner-supplied CSV does not prove OAuth status;
  - a declared API source is not independently verified.
- **Preserved:** `{n}`, "30 d.", Stripe, Paddle, WordPress, Shopify, OAuth, API, CSV, "Milo Score" and "Brand Intelligence".
- **Allowlist:** `launch.conn.brand` ("Brand Intelligence") and `launch.conn.gsc` ("GSC Lite") were added, the same as Latvian.
- Validation: Lithuanian tests **27/27**; `tsc --noEmit` and `eslint` pass; Prettier reflowed `lt-commerce.ts`.
- Counts: Lithuanian **2,751 / 3,850**; remaining languages lt, mt, ga: **8,799** outstanding.

## Milestone 69 — Lithuanian link network, backlinks and sponsored placements

- **New files:** `lt-links.ts` (158 keys), `lt-backlink-monitoring.ts` (43), `lt-backlink-details.ts` (24) and `lt-backlink-recurring.ts` (31). They are registered as one `links` batch (256 keys; six namespaces; fingerprint `7b8c4cfd…40d7`, identical to Romanian and Latvian). Test count 2,751 → 3,007.
- **Overrides applied from the start:** `backlinks.gapNote` and the nine `backlinks.integrity.*` keys follow `backlink-integrity.ts`; `linknet.policyNote` and `linknet.reciprocalWarn` follow `link-network-copy.ts`.
- **Kept distinct:**
  - index metrics are estimates and "—" never means zero;
  - omitted domains do not prove missing or lost links;
  - first/last-seen dates describe the index, not placement;
  - sponsored placements need disclosure plus `rel="sponsored"`, and a request is not a purchase;
  - the demo catalog creates no provider order or payment;
  - paused monitoring may still settle accepted collection;
  - the recurring cap does not add account funds.
- **Preserved:** `{balance}`, `{list}`, `{date}`, `{count}`, `{time}`, `{total}`, `{retained}`, `{returned}`, `{page}`, `{month}`, `{used}`, `{cap}`, "€{total}", "{count}%", "✓", "UTC", "1–92", "100", "0–20 000" and "10 000" (regular spaces), "0–100", "0.024" and "0.000036" (source dot decimals), and the DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD names.
- **Wording choice:** `marketplace.days` uses "{count} d." to avoid Lithuanian plural agreement with an unknown count.
- **Allowlist:** "nofollow" and "Demo" were added, the same as Latvian.
- Validation: Lithuanian tests **28/28**; `tsc --noEmit` and `eslint` pass; Prettier reflowed `lt-backlink-details.ts`.
- Counts: Lithuanian **3,007 / 3,850**; remaining languages lt, mt, ga: **8,543** outstanding.

## Milestone 70 — Lithuanian evidence (answers, logs, proof, AI evaluation, benchmark)

- **New file:** `lt-evidence.ts` (196 keys; namespaces `answer`, `logs`, `proof`, `aiEval`, `benchmark`; fingerprint `2911f87d…211d`, identical to Romanian and Latvian). Test count 3,007 → 3,203.
- **Sources:** keys are taken from the programmatic sources `answer-evidence.ts`, `log-evidence.ts` and `proof-evidence.ts`. The `workflow.*` keys from `proof-evidence.ts` are left to the workflow batch.
- **Kept distinct:**
  - answer and log provenance is owner-declared and unverified; saving calls no provider and logs are not fetched;
  - literal brand matching can miss variants, and no sentiment, accuracy, causality, ranking or referral measure is inferred;
  - zero declared log rows does not prove zero crawler traffic, and requests do not establish AI answers, citations, human referrals or conversions;
  - a connector response is not independent confirmation of page content or rankings;
  - later search observations are tentative and do not establish causality;
  - the benchmark does not repeat generation on refresh;
  - evaluation results never switch models automatically.
- **Preserved:** `{count}`, `{sources}`, `{knowledge}`, `{stages}`, `{clicks}`, `{impressions}`, "$5", "50", "90 kB", "200", "100", "500", "31", "500 kB", "180 kB", "UTC", "ISO", "JSON", "HTTP", "User-agent" and OpenAI.
- **Allowlist:** "Milo Score" (`aiEval.taskType.contentQualityScore`) and "API" (`answer.api`) were added, the same as Latvian.
- Validation: Lithuanian tests **29/29**; `tsc --noEmit` and `eslint` pass; Prettier reflowed `lt-evidence.ts`.
- Counts: Lithuanian **3,203 / 3,850**; remaining languages lt, mt, ga: **8,347** outstanding.

## Milestone 71 — Lithuanian workflow (editor, scheduling, plan, generation results)

- **New files:** `lt-workflow-editor.ts` (213 keys), `lt-workflow-plan.ts` (95) and `lt-workflow-results.ts` (37). They are registered as one `workflow` batch (345 keys; 17 namespaces; fingerprint `649e9d72…6615`, identical to Romanian and Latvian). Test count 3,203 → 3,548.
- **Overrides applied from the start:**
  - `premium.ts` supplies `today.*` and `plan.*`, including the `inspector` loop's `plan.detail.*` and `plan.source.manual`;
  - `proof-evidence.ts` supplies `workflow.*`.
- **Terminology:** "go-live" is rendered as "paskelbimas" and "hook" as "įžanginė frazė", consistent with the outreach batch. Weekday abbreviations are Pr/An/Tr/Kt/Pn/Št/Sk.
- **Kept distinct:**
  - approval never publishes;
  - auto mode does not guarantee every slot is filled or that publishing succeeds;
  - a saved schedule still depends on checks and destination availability;
  - an overdue schedule is not confirmed publication;
  - the preview does not verify the published appearance;
  - recovery approves, schedules and publishes nothing, and removing a copy does not refund allowance;
  - fidelity checks do not prove delivery, connector persistence or rich-result eligibility;
  - reviewed workflow comparisons are owner-recorded, not independently certified.
- **Preserved:** `{when}`, `{title}`, `{date}`, `{count}`, `+{count}`, `{concept}`, `{connector}`, "7", "3.0" (both occurrences), "(1:1)", "(4:5)", "(4:3)", "(x, y)", "SEO/GEO", "Markdown", "JSON-LD", "Article Studio 3.0" and "Milo Growth".
- **Allowlist:** "Milo Score" (`quality.title`) was added, the same as Latvian.
- Validation: Lithuanian tests **30/30**; `tsc --noEmit` and `eslint` pass; Prettier reflowed the editor and results files.
- Counts: Lithuanian **3,548 / 3,850**; remaining languages lt, mt, ga: **8,002** outstanding.

## Milestone 72 — Lithuanian configuration and conversation; Lithuanian catalog complete

- **New files:** `lt-configuration.ts` (175 keys) and `lt-coverage.ts` (45), registered as one `configuration` batch (220 keys; fingerprint `0e11ebfc…aa60`). `lt-conversation.ts` (82 keys, typed `ConversationCopy`) is registered as the `conversation` batch (`sourceRevision: "account conversations candidate after ff9b085"`, fingerprint `37dd02d1…1b85`). Test count 3,548 → **3,850**.
- **Conventions kept, as in Latvian:**
  - `connections.*` follows `premium.ts`;
  - external admin menu paths ("Settings → Apps and sales channels → Develop apps") stay in English;
  - "CTA nuostatos" avoids an English-identical section heading.
- **Grammar:** the "Claude NEGALĖS" list uses genitive objects after negation, as Lithuanian requires.
- **Kept distinct:**
  - Claude tokens are read-only, hashed, shown once and never logged;
  - write access can never publish or delete;
  - propose access can never approve its own proposals;
  - coverage details are declared claims, and listings, reviews, NAP, page presence, hreflang and rankings are not verified;
  - erasing a conversation does not restore access or undo dispatched work;
  - saving a proposal returns the draft to review and revokes prior publish approval.
- **Preserved:** `{count}`, `{handle}`, `{date}`, `{project}`, `{from}`, `{to}`, `{total}`, "••••••", "mystore.myshopify.com", "claude_desktop_config.json", "Claude.ai", "REST API", "Admin API", "MCP", "HTTPS", "2 000" (regular space), "JSON", "SEO" and "Ctrl / ⌘ + Enter".
- **Allowlist:** `brand.title`, `brand.field.url`, `wp.wordpress`, `shopify.shopify`, `claude.cliHeading` and `claude.desktopHeading` were added, the same as Latvian.
- **Completion checks:**
  - the complete-key-set test ("covers the complete current English interface key set") was added to `lithuanian.test.ts`;
  - `lt: LT_STAGED_BATCHES` was added to the staged map in `src/i18n/conversation.test.ts`.
- Validation: `lithuanian.test.ts` and `conversation.test.ts` pass **55/55**; `tsc --noEmit` and `eslint` pass.
- Lithuanian remains staged only: `isUiLanguage("lt")` is false and it is not in `UI_CATALOGS`.
- Counts: Lithuanian **3,850 / 3,850 (complete)**; remaining languages mt, ga: **7,700** outstanding.
- **Regression check after completion:** `vitest run src/i18n` passed **27 files, 640 tests**.

## Milestone 73 — Maltese started: authentication and shared controls

- **New files:**
  - `src/i18n/staged/mt.ts`: `MT_STAGED_BATCHES` ending in the frozen `MT_STAGED_CATALOG`; never imported by the runtime.
  - `mt-auth-screen.ts` (42 keys; fingerprint `f0d4cd1c…9dc8`).
  - `mt-shared-ui.ts` (30 keys; fingerprint `678278d0…9de5`).
  - `maltese.test.ts`: same structure as the other staged tests; count 72.
- **Register:** follows the existing Maltese operational emails in `email-copy-eu.ts`, which use the singular imperative and "tiegħek" ("Idħol", "Oħloq", "Irrevedi"). This is the established Maltese product register, and phrasing stays gender-neutral ("Dħalt fil-kont").
- **Terminology:**

  | English | Maltese |
  | --- | --- |
  | AI | "IA" (intelliġenza artifiċjali) |
  | draft | "abbozz" |
  | workspace | "spazju tax-xogħol" |
  | link | "link" in prose; "ħoloq" as the Links nav label |
  | publish | "ippubblika" |

- **Allowlist:** "Password" (`authScreen.password`), the standard Maltese loanword for the field label, is flagged for native review. No other English-identical values are allowed.
- **Deferred:** the collaborator-roles test (`euEmailCopy.mt.invitation.roles`: Qarrej / Editur / Reviżur) is added when the collaboration batch lands.
- Validation: Maltese tests **4/4**; `tsc --noEmit` and `eslint` pass.
- Counts: Maltese **72 / 3,850**; remaining languages mt, ga: **7,628** outstanding.

## Milestone 74 — Maltese core, setup screen and services screen

- **New files:**
  - `mt-core.ts`: 202 keys across 10 namespaces; fingerprint `845b2b1a…7ff2`.
  - `mt-setup-screen.ts`: 24 keys; fingerprint `565b0bcd…a5ca`.
  - `mt-services-screen.ts`: 18 keys; fingerprint `c769d10a…313d`.
  - All key sets are identical to the override-aware Latvian files. Test count 72 → 274 → 316.
- **Overrides applied from the start:** `shell.nav.home` ("Illum"), `shell.nav.backlinks` ("Ħoloq"), `shell.nav.insights` ("Viżibbiltà") and `pipeline.stage.live` ("Ippubblikat") follow `premium.ts`.
- **English-identical values caught before testing and reworded:**

  | Key | Was | Now |
  | --- | --- | --- |
  | `shell.nav.settings` | "Settings" | "Konfigurazzjonijiet" |
  | `nav.backlinks` | "Backlinks" | "Ħoloq minn siti oħra" |
  | `shell.nav.backlinks` | "Links" | "Ħoloq" |

  Similarly, "Idea" became "Ħsieb" and "Menu" became "Menù", so no allowlist entries were needed.
- **Kept distinct:**
  - approval marks an article ready, while publishing needs a separate publish-now or schedule action;
  - automatic publish-on-approval is retired;
  - secrets are stored server-side and sent in a request header.
- **Preserved:** `{step}`, "7", `{currency}`, "3", `{field}`, `{fields}`, `{mode}`, `{name}`, "http://", "https://" and "Andersen Innovations".
- Validation: Maltese tests **7/7**; `tsc --noEmit` and `eslint` pass.
- Counts: Maltese **316 / 3,850**; remaining languages mt, ga: **7,384** outstanding.

## Milestone 75 — Maltese audit, analytics, billing and evidence screens

- **New files and fingerprints:**
  - `mt-audit-screen.ts`: 29 keys, `2c15a706…1aed`.
  - `mt-analytics-screen.ts`: 36 keys, `d86d1510…02c5`.
  - `mt-billing-screen.ts`: 54 keys, `d0e701ba…7194`.
  - `mt-evidence-screen.ts`: 89 keys, `2c7e9ccb…c136`.
  - Key sets match Latvian. Test count 316 → 381 → 524.
- **Kept distinct:**
  - page-check scores are estimates, not measured rankings or technical metrics;
  - an unreadable page falls back to supplied business context only;
  - view counts are recorded events, not unique visitors;
  - click rate does not measure completed purchases;
  - AI referral traffic does not measure mentions or citations;
  - readiness analysis does not check real answers in ChatGPT, Perplexity, Gemini or Google AI Overviews;
  - competitor analysis is a snapshot, not ongoing monitoring;
  - failed fetches provide no competitor evidence.
- **Preserved:** `{count}`, `{business}{location}`, `{n}`, `{views}`, `{clicks}`, `{title}`, `{date}`, `{number}`, `{level}`, "30", "60", "50 000" (regular space), "5", "1–3", "3", "15", "v2", "billing@milogrowth.com", "UTC", "→", and Paddle, WordPress, GSC Lite, Milo Score, Brand Intelligence and Milo Analytics.
- **Wording choice:** "FAQ" is spelled out as "mistoqsijiet frekwenti", so no English acronyms are needed in Maltese labels.
- Validation: Maltese tests **11/11**; `tsc --noEmit` and `eslint` pass.
- Counts: Maltese **524 / 3,850**; remaining languages mt, ga: **7,176** outstanding.

## Milestone 76 — Maltese plan screen and editor screen

- **New files and fingerprints:**
  - `mt-plan-screen.ts`: 113 keys, `288f529e…4bb7`.
  - `mt-editor-screen.ts`: 148 keys, `1e827d27…c9f`.
  - Key sets match Latvian. Test count 524 → 785.
- **Kept distinct:**
  - the work target date is separate from the publication time;
  - accepting a discovery suggestion creates no content and schedules nothing;
  - orphan drafts keep any armed schedule;
  - link resolution blocks sending and publishing through every connector;
  - only validation-verified sources are cited;
  - uploads stay private until alt text plus approval;
  - structured data is not guaranteed to be shown, and custom endpoints do not receive JSON-LD;
  - the E-E-A-T author recommendation does not block publishing.
- **Preserved:** `{date}`, `{label}`, `{count}`, `{skipped}`, `{title}`, `{from}`, `{to}`, `{source}`, `{stage}`, `{path}`, `{anchor}`, `{status}`, `{name}`, `{platform}`, `{section}`, `{claim}`, `{language}`, `{type}`, "5 MB", "60", "160", "→", "schema.org JSON-LD", "Google Rich Results Test", "E-E-A-T", "sameAs", "PT, MSc", "JPEG, PNG, WebP", "Markdown" and "HTML".
- **Allowlist:** "Claude", "Search Console" and "H1" were added, the same as the other staged locales.
- Validation: Maltese tests **13/13**; `tsc --noEmit` and `eslint` pass (lint also covered `mt-public-pricing.ts` and `mt-public-studies.ts`).
- Counts: Maltese **785 / 3,850**; remaining languages mt, ga: **6,915** outstanding.

## Milestone 77 — Maltese public pricing, public studies, public home and beta screen

- **New files and fingerprints:**
  - `mt-public-pricing.ts`: 40 keys, `8e7cecc9…de60`.
  - `mt-public-studies.ts`: 30 keys, `ace563fb…e8de`.
  - `mt-public-home.ts`: 100 keys, `2855ce0e…c141`.
  - `mt-beta-screen.ts`: 88 keys, `c4dcf482…8119`.
  - Key sets match Latvian. Test count 785 → 1,043.
- **English-identical values caught before testing and reworded:**
  - `betaScreen.field.status`: "Status" → "Stat";
  - `betaScreen.field.segment`: "Segment" → "Segment tas-suq";
  - `publicBeta.cookies` (next batch): "Cookies" → "Politika dwar il-cookies".
- **Kept distinct:**
  - paid activation, add-ons and marketplace purchases are on hold until payment and provider acceptance;
  - billing country, not site language or public region, sets price eligibility;
  - saved connection settings alone do not prove publishing will succeed;
  - missing data is not zero activity;
  - case studies are setup and workflow examples with no claimed outcomes.
- **Preserved:** `{count}`, `{number}`, `{region}`, "12–13", "20", "1–5", "1", "PL / EN / SV", "Agency", "Milo Growth", "Milo Score", "Brand Intelligence", "Search Console", "Synergy" and "Limhamn / Malmö".
- **Allowlist:** "Beta" (`publicHome.beta`) was added, the same as Latvian and Lithuanian.
- **Nav consistency:** the FAQ cancel answer uses "Konfigurazzjonijiet → Fatturazzjoni", matching the Maltese settings nav label.
- Validation: Maltese tests **17/17**; `tsc --noEmit` and `eslint` pass.
- Counts: Maltese **1,043 / 3,850**; remaining languages mt, ga: **6,657** outstanding.

## Milestone 78 — Maltese public beta, beta guidance and collaboration

- **New files:**
  - `mt-public-beta.ts`: 100 keys; fingerprint `e670953b…b59e`.
  - `mt-beta-guide.ts`: 125 keys; fingerprint `8c815e10…520d`.
  - `mt-collaboration.ts` (98), `mt-team.ts` (58), `mt-notifications.ts` (86) and `mt-email-settings.ts` (6), registered as one `collaboration` batch: 248 keys; fingerprint `429e59f1…7ed0`.
  - Key sets match Latvian. Test count 1,043 → 1,268 → 1,516.
- **Roles test:** the deferred collaborator-roles test is now active. `collaboration.viewer`, `editor` and `reviewer` match `euEmailCopy.mt.invitation.roles` exactly (Qarrej / Editur / Reviżur).
- **Kept distinct:**
  - validation goals are plans, not evidence that validation happened;
  - paid launch is on hold while Stripe setup and payment testing finish;
  - manual billing status does not prove payment;
  - opening an invitation email link grants no access;
  - review decisions do not publish or resume a held schedule;
  - changing the approval policy revokes collaborator approvals but keeps the owner's;
  - awareness checks send no email;
  - capacity figures are shared capacity, not a promise of finished articles;
  - "accepted by provider" is not confirmed delivery.
- **Preserved:**
  - numbers and ranges: "8–10", "30", "1"–"4", "699–1499 PLN", "299–599 PLN", "2500–5000 SEK", "799–1499 SEK", "€249–€499", "€79–€149", "20–30", "3–5", "1–2", and the target counts 20/10/10/5/3/2/1/2/5/5/5;
  - placeholders: `{name}`, `{referrer}`, `{points}`, `{count}`, `{page}`, `{pages}`, `{at}`, `{attempts}`, `{status}`, `{period}`, `{saved}`, `{pending}`, `{publishing}`, `{published}`, `{failed}`, `{cancelled}`, `{shown}`, `{total}`, `{missing}`, `{usagePeriod}`, `{remaining}`;
  - literals: "HTTP", "PNG, JPEG, WebP".
- **Allowlist:** "Beta" (`publicBeta.beta`) and "Milo Growth Assisted Beta" were added, the same as Latvian.
- Validation: Maltese tests **21/21**; `tsc --noEmit` and `eslint` pass (lint also covered `mt-knowledge.ts`).
- Counts: Maltese **1,516 / 3,850**; remaining languages mt, ga: **6,184** outstanding.

## Milestone 79 — Maltese knowledge, weekly preparation, approval and source refresh

- **New file:** `mt-knowledge.ts` (242 keys; namespaces `knowledge`, `weekly`, `approval`, `refresh`; fingerprint `a3a32970…5816`, identical to Latvian). Test count 1,516 → 1,758.
- **Composition preserved:** `knowledge.ui.permanent` ("Insa b’mod permanenti") + `forgetAll` / `forgetRecord` (object phrases) + `irreversible` (leading "?"), as in Latvian.
- **Kept distinct:**
  - knowledge review is separate from publishing approval;
  - inspection does not approve or release a hold;
  - accepting a source fact does not independently verify it;
  - an unobserved catalog item is not a confirmed removal;
  - a saved or approved draft is not queued;
  - approval covers exactly this content and destination, and a status label alone grants nothing;
  - owner brand settings take precedence over source proposals.
- **Preserved:** `{count}`, `{when}`, `{date}`, "100" (twice), "20" (three times), "5 MiB", "40", "2 000" (regular space), "500", "PDF", "DOCX", "Shopify" and "Brand Intelligence". Words stay words for "ten-minute" ("għaxar minuti") and "five" ("ħamsa"), as in the source.
- Validation: Maltese tests **22/22**; `tsc --noEmit` and `eslint` pass (lint also covered `mt-crawl.ts`, `mt-google-index.ts` and `mt-performance.ts`).
- **Pre-test fix:** `perf.tablet` "Tablet" → "Apparat tablet", to avoid an English-identical value.
- Counts: Maltese **1,758 / 3,850**; remaining languages mt, ga: **5,942** outstanding.

## Milestone 80 — Maltese technical checks and measurements

- **New files:**
  - `mt-crawl.ts` (106), `mt-google-index.ts` (69) and `mt-performance.ts` (63), registered as one `technical` batch: 238 keys; fingerprint `106a19b8…35e6`.
  - `mt-measurements.ts`: 204 keys; fingerprint `216126da…8395`.
  - Key sets match Latvian. Test count 1,758 → 2,200.
- **Overrides applied from the start:** `gsc.sourceApi`, `gsc.sourceCsv`, `gsc.rec.waitOrPromote`, `gsc.helper` and `gsc.integrity.*` follow `gsc-integrity.ts`.
- **Kept distinct:**
  - crawl completion does not prove whole-site coverage, Google indexing or Core Web Vitals;
  - a listed sitemap URL is a declaration, not proof of existence or indexing;
  - a Google index inspection neither checks the live page nor requests indexing;
  - missing Google-reported entries do not prove absence;
  - a lab test does not determine field Core Web Vitals;
  - reports do not recheck live pages;
  - an email "accepted for sending" is not confirmed delivery;
  - AI referral traffic is under-counted and is not mentions, citations or rankings;
  - declared source and property are not independent verification;
  - "—" means unavailable, never zero;
  - search observations do not establish causality.
- **Preserved:**
  - Crawl: "24", "10", "2 000", "100", "20", "HTTP 4xx", `{files}`, `{queued}`, `{urls}`, `{locs}`, `{rejected}`, `{done}`.
  - Performance: "0–100", "(ms)", "robots.txt", "CrUX", "PageSpeed", "LCP", "CLS".
  - Measurements: "30", "28", "90", "2026", "1 000" (regular space), "1000" (truncation notice), "2 MB", "0–1", `{agency}`, `{count}`, `{clicks}`, `{impressions}`, `{position}`, `{date}`, `{days}`, `{rows}`, "Settings → Secrets", `docs/GSC-OAUTH-SETUP.md`, "Lovable Cloud", and the Query / Page / Date table names.
- **Allowlist:** "CTA", "Milo Score", "Search Console Lite" and "CTR" were added, the same as Latvian.
- Validation: Maltese tests **24/24**; `tsc --noEmit` and `eslint` pass (lint also covered the outreach files).
- Counts: Maltese **2,200 / 3,850**; remaining languages mt, ga: **5,500** outstanding.

## Milestone 81 — Maltese outreach, growth and commerce

- **New files:**
  - `mt-outreach.ts` (131) and `mt-outreach-integrity.ts` (27), registered as one `outreach` batch: 158 keys; fingerprint `c2bfe98e…61b4`.
  - `mt-growth.ts`: 201 keys; fingerprint `79460ac6…f136`.
  - `mt-commerce.ts`: 192 keys; fingerprint `6cd0596e…8ff2`.
  - Key sets match Latvian. Test count 2,200 → 2,751.
- **Overrides applied from the start:**
  - `outreach-integrity.ts`, including the `recoveryCopy` cancel strings;
  - `launch-readiness.ts` (nine keys);
  - `gsc-integrity.ts` for `launch.conn.gsc.csvOnly` and `launch.conn.gsc.synced`.
- **Terminology:** "hook" is rendered as "sentenza tal-ftuħ" and "anchor" as "ankra". FAQ is spelled out as "mistoqsijiet frekwenti".
- **English-identical values caught before testing and reworded:** `actions.filter.status` and `billing.status` both use "Stat" instead of "Status".
- **Kept distinct:**
  - Milo never sends outreach automatically, and provider acceptance is not inbox delivery;
  - uncertain attempts stay held and refresh never resends;
  - Claude only proposes, and nothing applies until approval;
  - the public audit is a readiness check, not a live ranking check;
  - the test payment charges nothing;
  - a successful connector test does not verify publishing permissions;
  - checklist completion alone does not establish paid readiness.
- **Preserved:** `{count}`, `{status}`, `{time}`, `{n}`, "24", "3.0", "3 000" (regular space), "30", "yourbusiness.com", "→", and Resend, Stripe, Paddle, WordPress, Shopify, OAuth, API, CSV, GSC Lite, NAP, Milo Score and Brand Intelligence.
- **Allowlist:** "H1", "Authority Builder", "Brand Intelligence" (`launch.conn.brand`) and "GSC Lite" (`launch.conn.gsc`) were added, the same as Latvian.
- Validation: Maltese tests **27/27**; `tsc --noEmit` and `eslint` pass (lint also covered `mt-links.ts`).
- Counts: Maltese **2,751 / 3,850**; remaining languages mt, ga: **4,949** outstanding.

## Milestone 82 — Maltese link network, backlinks and sponsored placements

- **New files:** `mt-links.ts` (158 keys), `mt-backlink-monitoring.ts` (43), `mt-backlink-details.ts` (24) and `mt-backlink-recurring.ts` (31). They are registered as one `links` batch (256 keys; six namespaces; fingerprint `7b8c4cfd…40d7`). Test count 2,751 → 3,007.
- **Overrides applied from the start:** `backlinks.gapNote` and the nine `backlinks.integrity.*` keys follow `backlink-integrity.ts`; `linknet.policyNote` and `linknet.reciprocalWarn` follow `link-network-copy.ts`.
- **Terminology:** "backlinks" as a label is rendered as "ħoloq minn siti oħra", consistent with the nav label "Ħoloq"; "link" stays as the prose loanword.
- **Kept distinct:**
  - index metrics are estimates, and "—" never means zero;
  - omitted domains do not prove missing or lost links;
  - first/last-seen dates describe the index, not placement;
  - sponsored placements need disclosure plus `rel="sponsored"`, and a request is not a purchase;
  - the demo catalog creates no provider order or payment;
  - pausing monitoring still lets already-accepted collection finish;
  - the recurring cap adds no account funds.
- **Preserved:** `{balance}`, `{list}`, `{date}`, `{count}`, `{time}`, `{total}`, `{retained}`, `{returned}`, `{page}`, `{month}`, `{used}`, `{cap}`, "€{total}", "{count}%", "✓", "UTC", "USD", "1–92", "100", "0–20 000" and "10 000" (regular spaces), "0–100", "0.024" and "0.000036" (dot decimals), DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD, and Linkhouse.
- **Allowlist:** "nofollow" and "Demo" were added, the same as Latvian.
- Validation: Maltese tests **28/28**; `tsc --noEmit` and `eslint` pass (lint also covered `mt-evidence.ts`).
- Counts: Maltese **3,007 / 3,850**; remaining languages mt, ga: **4,693** outstanding.

## Milestone 83 — Maltese evidence and workflow

- **New files:**
  - `mt-evidence.ts`: 196 keys; fingerprint `2911f87d…211d`.
  - `mt-workflow-editor.ts` (213), `mt-workflow-plan.ts` (95) and `mt-workflow-results.ts` (37), registered as one `workflow` batch: 345 keys; 17 namespaces; fingerprint `649e9d72…6615`.
  - Key sets match Latvian. Test count 3,007 → 3,548.
- **Overrides applied from the start:**
  - programmatic `answer-evidence.ts`, `log-evidence.ts` and `proof-evidence.ts`;
  - `premium.ts` for `today.*` and `plan.*`, including the `inspector` loop keys and `plan.source.manual`.
- **Terminology:**
  - "go-live" is rendered as "pubblikazzjoni" and "hook" as "sentenza tal-ftuħ", consistent with outreach;
  - Maltese weekday abbreviations are Tn / Tl / Er / Ħa / Ġi / Si / Ħd.
- **Kept distinct:**
  - owner-declared answer and log evidence is unverified; saving calls no provider, and logs are not fetched;
  - zero declared log rows does not prove zero crawler traffic;
  - a connector response is not independent confirmation;
  - evaluation results never switch models automatically;
  - approval never publishes, and auto mode does not guarantee filled slots or successful publishing;
  - an overdue schedule is not confirmed publication;
  - recovery approves, schedules and publishes nothing;
  - fidelity checks do not prove delivery;
  - reviewed workflow comparisons are owner-recorded, not independently certified.
- **Preserved:**
  - evidence: "$5", "50", `{sources}`, `{knowledge}`, `{stages}`, `{clicks}`, `{impressions}`, "90 kB", "200", "100", "500", "31", "500 kB", "180 kB", "UTC", "ISO", "JSON", "HTTP", "User-agent", "OpenAI";
  - workflow: `{when}`, `{title}`, `{date}`, `{count}`, "+{count}", `{concept}`, `{connector}`, "7", "3.0" (every occurrence), "(1:1)", "(4:5)", "(4:3)", "(x, y)", "SEO/GEO", "Markdown", "JSON-LD", "Article Studio 3.0".
- **English-identical values reworded before testing:**
  - `arrange.status`, `editor.status`, `plan.status` and `logs.statuses` use "Stat" instead of "Status";
  - `pres.val.portrait` / `landscape` / `card` use Maltese words.
- **Allowlist:** "Milo Score" (`aiEval.taskType.contentQualityScore` and `quality.title`) and "API" (`answer.api`) were added, the same as Latvian.
- Validation: Maltese tests **30/30**; `tsc --noEmit` and `eslint` pass (lint also covered `mt-configuration.ts` and `mt-coverage.ts`).
- Counts: Maltese **3,548 / 3,850**; remaining languages mt, ga: **4,152** outstanding.

## Milestone 84 — Maltese configuration and conversation; Maltese catalog complete

- **New files:**
  - `mt-configuration.ts` (175) and `mt-coverage.ts` (45), registered as one `configuration` batch: 220 keys; fingerprint `0e11ebfc…aa60`.
  - `mt-conversation.ts`: 82 keys, typed `ConversationCopy`; `sourceRevision: "account conversations candidate after ff9b085"`; fingerprint `37dd02d1…1b85`.
  - Test count 3,548 → **3,850**.
- **Conventions kept, as in Latvian and Lithuanian:**
  - `connections.*` follows `premium.ts`;
  - external admin menu paths ("Settings → Apps and sales channels → Develop apps") stay in English;
  - "Preferenzi tas-CTA" avoids an English-identical heading;
  - `wp.post` is "Artiklu tal-blog", avoiding the English-identical "Post".
- **Kept distinct:**
  - Claude tokens are read-only, hashed, shown once and never logged;
  - write access can never publish or delete;
  - propose access can never approve its own proposals;
  - coverage details are declared claims, and listings, reviews, NAP, page presence, hreflang and rankings are unverified;
  - erasing a conversation does not restore access or undo dispatched work;
  - saving a proposal returns the draft to review and revokes prior publish approval.
- **Preserved:** `{count}`, `{handle}`, `{date}`, `{project}`, `{from}`, `{to}`, `{total}`, "••••••", "mystore.myshopify.com", "claude_desktop_config.json", "Claude.ai", "REST API", "Admin API", "MCP", "HTTPS", "2 000" (regular space), "JSON", "SEO" and "Ctrl / ⌘ + Enter".
- **Allowlist:** `brand.title`, `brand.field.url`, `wp.wordpress`, `shopify.shopify`, `claude.cliHeading` and `claude.desktopHeading` were added. The full Maltese allowlist is 30 keys: the 29 the other staged locales use plus `authScreen.password` ("Password", flagged for native review).
- **Completion checks:**
  - the complete-key-set test was added to `maltese.test.ts`;
  - `mt: MT_STAGED_BATCHES` was added to the staged map in `src/i18n/conversation.test.ts`.
- Validation: `maltese.test.ts` plus `conversation.test.ts` pass **56/56**; `tsc --noEmit` and `eslint` pass.
- Maltese remains staged only: `isUiLanguage("mt")` is false and it is not in `UI_CATALOGS`.
- **Review items for a native Maltese reviewer:**
  - "IA" for AI;
  - the "Password" loanword;
  - "ħoloq" as the Links nav label;
  - "sentenza tal-ftuħ" for hook;
  - singular-imperative register, matching the existing operational emails.
- Counts: Maltese **3,850 / 3,850 (complete)**; remaining language ga: **3,850** outstanding.

## Milestone 85 — Irish started

- **Register:** follows the existing Irish operational emails in `email-copy-eu.ts`, which use the singular imperative and "do" ("Oscail", "Bainistigh", "Sínigh isteach"). Collaborator roles must match `euEmailCopy.ga.invitation.roles` (Léitheoir / Eagarthóir / Athbhreithneoir).
- **Terminology:**

  | English | Irish |
  | --- | --- |
  | AI | "IS" (intleacht shaorga) |
  | draft | "dréacht" |
  | workspace | "spás oibre" |
  | publish | "foilsigh" |
  | approve | "ceadaigh" |

- **Written so far:** `ga-auth-screen.ts` (42 keys) and `ga-shared-ui.ts` (30), with the `ga.ts` registry and `irish.test.ts` following the staged convention.
- **First validation:** authentication and shared controls passed Irish tests **4/4**, and `tsc` and `eslint` pass.

## Milestone 86 — Irish core, setup, services, audit and analytics screens

- **New files and fingerprints:**
  - `ga-core.ts`: 202 keys, `845b2b1a…7ff2`.
  - `ga-setup-screen.ts`: 24 keys, `565b0bcd…a5ca`.
  - `ga-services-screen.ts`: 18 keys, `c769d10a…313d`.
  - `ga-audit-screen.ts`: 29 keys, `2c15a706…1aed`.
  - `ga-analytics-screen.ts`: 36 keys, `d86d1510…02c5`.
  - All key sets are identical to Latvian. Test count 72 → 381.
- **Overrides applied from the start:** `shell.nav.home` ("Inniu"), `shell.nav.backlinks` ("Naisc"), `shell.nav.insights` ("Infheictheacht") and `pipeline.stage.live` ("Foilsithe") follow `premium.ts`.
- **Terminology:** "Naisc isteach" is used for backlinks, "Roghchlár" for menu and "Smaoineamh" for idea, so no allowlist entries are needed in these batches.
- **Kept distinct:**
  - approval marks ready, and publishing is a separate action;
  - page-check scores are estimates, not rankings;
  - views are recorded events, not unique visitors.
- **Preserved:** `{step}`, "7", `{currency}`, "3", `{field}`, `{fields}`, `{mode}`, `{name}`, "http://", "https://", `{count}`, `{business}{location}`, "5", "30", "60", "50 000" (regular space), `{n}`, `{views}`, `{clicks}`, `{title}`, `{date}`, "UTC" and "Milo Analytics".
- Validation: Irish tests **9/9**; `tsc --noEmit` and `eslint` pass (lint also covered `ga-billing-screen.ts` and `ga-evidence-screen.ts`).
- Counts: Irish **381 / 3,850**; remaining: **3,469** Irish keys.

## Milestone 87 — Irish billing, evidence, plan and editor screens

- **New files and fingerprints:**
  - `ga-billing-screen.ts`: 54 keys, `d0e701ba…7194`.
  - `ga-evidence-screen.ts`: 89 keys, `2c7e9ccb…c136`.
  - `ga-plan-screen.ts`: 113 keys, `288f529e…4bb7`.
  - `ga-editor-screen.ts`: 148 keys, `1e827d27…c9f`.
  - Key sets match Latvian. Test count 381 → 785.
- **Terminology:** FAQ is spelled out as "ceisteanna coitianta", and backlinks are "naisc isteach".
- **Kept distinct:**
  - readiness analysis does not check real AI answers;
  - competitor analysis is a snapshot;
  - the work target date is separate from the publish time;
  - accepting a suggestion creates and schedules nothing;
  - uploads stay private until alt text and approval;
  - rich results are not guaranteed.
- **Preserved:** `{n}`, `{date}`, "billing@milogrowth.com", "1", "3", "5", "15", "v2", `{number}`, `{business}{location}`, `{count}`, `{level}`, "1–3", `{label}`, `{skipped}`, `{title}`, `{from}`, `{to}`, `{source}`, `{stage}`, `{path}`, `{anchor}`, `{status}`, `{name}`, `{platform}`, `{section}`, `{claim}`, `{language}`, `{type}`, "5 MB", "60", "160", "→", "schema.org JSON-LD", "E-E-A-T", "PT, MSc", "sameAs", "Markdown" and "HTML".
- **Allowlist:** "Claude", "Search Console" and "H1" were added.
- Validation: Irish tests **13/13**; `tsc --noEmit` and `eslint` pass (lint also covered public pricing and studies).
- Counts: Irish **785 / 3,850**; remaining: **3,065** Irish keys.

## Milestone 88 — Irish public pricing, public studies, public home and beta screen

- **New files and fingerprints:**
  - `ga-public-pricing.ts`: 40 keys, `8e7cecc9…de60`.
  - `ga-public-studies.ts`: 30 keys, `ace563fb…e8de`.
  - `ga-public-home.ts`: 100 keys, `2855ce0e…c141`.
  - `ga-beta-screen.ts`: 88 keys, `c4dcf482…8119`.
  - Key sets match Latvian. Test count 785 → 1,043.
- **Terminology:** Irish "Béite" is used for Beta, so unlike Latvian and Maltese no Beta allowlist entry is needed. "Stádas", "Deighleog" and "AE" also avoid English-identical values.
- **Kept distinct:**
  - paid activation, add-ons and marketplace purchases are on hold until payment and provider acceptance;
  - billing country, not site language or region, sets price eligibility;
  - saved connection settings alone do not prove publishing will succeed;
  - missing data is not zero activity;
  - case studies claim no outcomes.
- **Preserved:** `{count}`, `{number}`, `{region}`, "1", "12–13", "20", "1–5", "PL / EN / SV", "Agency", "Milo Growth", "Milo Score", "Brand Intelligence", "Search Console", "Synergy" and "Limhamn / Malmö".
- **Nav consistency:** the FAQ cancel answer uses "Socruithe → Billeáil", matching the Irish nav labels.
- Validation: Irish tests **17/17**; `tsc --noEmit` and `eslint` pass (lint also covered `ga-public-beta.ts`).
- Counts: Irish **1,043 / 3,850**; remaining: **2,807** Irish keys.

## Milestone 89 — Irish public beta, beta guidance and collaboration

- **New files:**
  - `ga-public-beta.ts`: 100 keys; fingerprint `e670953b…b59e`.
  - `ga-beta-guide.ts`: 125 keys; fingerprint `8c815e10…520d`.
  - `ga-collaboration.ts` (98), `ga-team.ts` (58), `ga-notifications.ts` (86) and `ga-email-settings.ts` (6), registered as one `collaboration` batch: 248 keys; fingerprint `429e59f1…7ed0`.
  - Key sets match Latvian. Test count 1,043 → 1,516.
- **Roles test:** the Irish collaborator-roles test is active. `collaboration.viewer`, `editor` and `reviewer` match `euEmailCopy.ga.invitation.roles` exactly (Léitheoir / Eagarthóir / Athbhreithneoir).
- **Terminology:** "Béite" for beta, "Fianáin" for cookies and "Tusa" for you, so only "Milo Growth Assisted Beta" is allowlisted here.
- **Kept distinct:**
  - validation targets are plans, not evidence that validation happened;
  - paid launch is on hold while Stripe setup and payment testing finish;
  - opening an invitation link grants no access;
  - review decisions do not publish or resume a held schedule;
  - awareness checks send no email;
  - capacity figures are shared capacity, not promised articles;
  - "accepted by provider" is not confirmed delivery.
- **Preserved:**
  - numbers and ranges: "8–10", "30", "1"–"4", "699–1499 PLN", "299–599 PLN", "2500–5000 SEK", "799–1499 SEK", "€249–€499", "€79–€149", "20–30", "3–5", "1–2", and the target counts 20/10/10/5/3/2/1/2/5/5/5;
  - placeholders: `{name}`, `{referrer}`, `{points}`, `{count}`, `{page}`, `{pages}`, `{at}`, `{attempts}`, `{status}`, `{period}`, `{saved}`, `{pending}`, `{publishing}`, `{published}`, `{failed}`, `{cancelled}`, `{shown}`, `{total}`, `{missing}`, `{usagePeriod}`, `{remaining}`;
  - literals: "HTTP" and "PNG, JPEG, WebP".
- Validation: Irish tests **21/21**; `tsc --noEmit` and `eslint` pass (lint also covered `ga-knowledge.ts`).
- Counts: Irish **1,516 / 3,850**; remaining: **2,334** Irish keys.

## Milestone 90 — Irish knowledge, technical checks and measurements

- **New files:**
  - `ga-knowledge.ts`: 242 keys; fingerprint `a3a32970…5816`.
  - `ga-crawl.ts` (106), `ga-google-index.ts` (69) and `ga-performance.ts` (63), registered as one `technical` batch: 238 keys; fingerprint `106a19b8…35e6`.
  - `ga-measurements.ts`: 204 keys; fingerprint `216126da…8395`.
  - Key sets match Latvian. Test count 1,516 → 2,200.
- **Composition preserved:** `knowledge.ui.permanent` ("Déan dearmad go buan ar") + object phrases + `irreversible` (leading "?").
- **Terminology:** `perf.tablet` is "Táibléad" (not the English-identical "Tablet"); `crawl.non_html` is "Ní HTML é".
- **Kept distinct:**
  - knowledge review is separate from publishing approval;
  - accepting a source fact does not verify it;
  - crawl completion does not prove whole-site coverage, indexing or Core Web Vitals;
  - index inspection neither checks the live page nor requests indexing;
  - a lab test does not determine field vitals;
  - reports do not recheck live pages;
  - AI referral traffic is not mentions or citations;
  - "—" never means zero;
  - declared source and property are not independent verification.
- **Preserved:**
  - Knowledge: `{count}`, `{when}`, `{date}`, "100", "20", "5 MiB", "40", "500".
  - Crawl: "24", "10", "HTTP 4xx", `{files}`, `{queued}`, `{urls}`, `{locs}`, `{rejected}`, `{done}`.
  - Performance: "0–100", "(ms)".
  - Measurements: "30", "28", "90", "2026", "1000", "2 MB", "0–1", `{agency}`, `{clicks}`, `{impressions}`, `{position}`, `{days}`, `{rows}`, "Settings → Secrets", `docs/GSC-OAUTH-SETUP.md`, "Lovable Cloud", and Query / Page / Date.
  - "2 000" and "1 000" keep regular spaces.
- **Allowlist:** "CTA", "Milo Score", "Search Console Lite" and "CTR" were added.
- Validation: Irish tests **24/24**; `tsc --noEmit` and `eslint` pass (lint also covered the outreach files).
- Counts: Irish **2,200 / 3,850**; remaining: **1,650** Irish keys.

## Milestone 91 — Irish outreach, growth and commerce

- **New files:**
  - `ga-outreach.ts` (131) and `ga-outreach-integrity.ts` (27), registered as one `outreach` batch: 158 keys; fingerprint `c2bfe98e…61b4`.
  - `ga-growth.ts`: 201 keys; fingerprint `79460ac6…f136`.
  - `ga-commerce.ts`: 192 keys; fingerprint `6cd0596e…7ff2`.
  - Key sets match Latvian. Test count 2,200 → 2,751.
- **Allowlist:** four English-identical entries were added: `publicAudit.signal.h1`, `authority.title`, `launch.conn.brand` and `launch.conn.gsc`.
- **Kept distinct:** a sent message is not a published link, a prepared purchase is not a paid order, and readiness checks do not guarantee rankings or traffic.
- Validation: Irish tests **27/27**; `tsc --noEmit` and `eslint` pass (lint also covered `ga-links.ts`).
- Counts: Irish **2,751 / 3,850**; remaining: **1,099** Irish keys.

## Milestone 92 — Irish links and backlink monitoring

- **New files**, registered as one `links` batch: 256 keys; fingerprint `7b8c4cfd…40d7`.
  - `ga-links.ts` (158), `ga-backlink-monitoring.ts` (43), `ga-backlink-details.ts` (24), `ga-backlink-recurring.ts` (31).
  - Key sets match Latvian. Test count 2,751 → 3,007.
- **Allowlist:** `linknet.nofollow` ("nofollow" is the HTML attribute value).
- **Terminology:** backlinks are "naisc isteach", referring domains "fearainn atreoraithe", anchor text "téacs ancaire", and `marketplace.demoBadge` is "Taispeántas".
- **Kept distinct:**
  - index observations do not verify individual link placement or a complete link list;
  - missing data is shown as "—", never zero;
  - the monitoring cap limits only this monitor and does not add funds;
  - an unconfirmed result does not mean the provider charged nothing.
- **Preserved:** "100", "1–92", "0–20 000", "10 000", "0–100", "0.024 USD", "0.000036 USD", `{retained}`, `{returned}`, `{total}`, `{page}`, `{count}`, `{month}`, `{used}`, `{cap}`, `{date}`, `{balance}`, `{list}`, DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD. USD keeps dot decimals; thousands use regular spaces.
- Validation: Irish tests **28/28**; `tsc --noEmit` and `eslint` pass.
- Counts: Irish **3,007 / 3,850**; remaining: **843** Irish keys.

## Milestone 93 — Irish evidence

- **New file:** `ga-evidence.ts`: 196 keys (`answer`, `logs`, `proof`, `aiEval`, `benchmark`); fingerprint `2911f87d…211d`. Key set matches Latvian. Test count 3,007 → 3,203.
- **Allowlist:** `aiEval.taskType.contentQualityScore` ("Milo Score") and `answer.api` ("API").
- **Kept distinct:**
  - owner-reported samples and imports are not independently verified;
  - a connector response does not confirm published content or positions;
  - zero reported log rows do not prove zero crawler traffic;
  - observations do not establish causality.
- **Preserved:** "$5", "50", "90 kB", "200", "100", "500", "31", "500 kB", "180 kB", `{count}`, `{sources}`, `{knowledge}`, `{stages}`, `{clicks}`, `{impressions}`.
- Validation: Irish tests **29/29**; `eslint` passes.

## Milestone 94 — Irish workflow

- **New files**, registered as one `workflow` batch: 345 keys; fingerprint `649e9d72…6615`.
  - `ga-workflow-editor.ts` (213), `ga-workflow-plan.ts` (95), `ga-workflow-results.ts` (37).
  - Key sets match Latvian. Test count 3,203 → 3,548.
- **Allowlist:** `quality.title` ("Milo Score").
- **Terminology:** go-live is "foilsiú"; the hook is "abairt tosaigh"; alt text is "téacs malartach"; weekday abbreviations are Luan / Máirt / Céad / Déar / Aoine / Sath / Domh.
- **Kept distinct:** approval never publishes; a saved schedule does not guarantee publication; preview does not verify the destination; recovery neither approves, schedules nor publishes; fidelity checks do not confirm delivery.
- **Preserved:** "3.0", "1:1", "4:5", "4:3", "7", `{when}`, `{title}`, `{date}`, `{count}`, `{concept}`, `{connector}`, "Article Studio", Markdown and JSON-LD.
- Validation: Irish tests **30/30**; `eslint` passes.

## Milestone 95 — Irish configuration, coverage and conversations (Irish complete)

- **New files:**
  - `ga-configuration.ts` (175) and `ga-coverage.ts` (45), registered as one `configuration` batch: 220 keys; fingerprint `0e11ebfc…aa60`.
  - `ga-conversation.ts`: 82 keys typed as `ConversationCopy`; `sourceRevision: "account conversations candidate after ff9b085"`; fingerprint `37dd02d1…4f1b85`.
  - Test count 3,548 → **3,850**. The complete-key-set test was added, and `ga: GA_STAGED_BATCHES` was added to `src/i18n/conversation.test.ts`.
- **Allowlist:** `brand.title` ("Brand Intelligence", product feature name), `brand.field.url`, `wp.wordpress`, `shopify.shopify`, `claude.cliHeading` and `claude.desktopHeading`.
- **Kept in English:** external admin menu paths (Settings → Apps and sales channels → Develop apps), API names and `claude_desktop_config.json`.
- **Kept distinct:**
  - Claude tokens are read-only; proposal access never approves its own proposals;
  - coverage records are owner-declared and unverified;
  - erasing a conversation neither restores nor changes project access, and work already sent may still finish and use allowance.
- **Preserved:** "2 000" (regular space), `{count}`, `{handle}`, `{date}`, `{project}`, `{from}`, `{to}`, `{total}`, "Ctrl / ⌘ + Enter".
- Validation: Irish and conversation tests **57/57** (2 files); `tsc --noEmit` and `eslint` pass.
- Counts: Irish **3,850 / 3,850**. All five previously unauthored EU catalogs (ga, lv, lt, mt, ro) are now fully staged, and none is activated.

## Final handoff after Milestone 95 (supersedes the "Next exact actions" list above)

**Validation actually run:**

| Check | Result |
| --- | --- |
| Full suite `vitest run --maxWorkers=2` | **5,680 tests / 364 files pass** (52 s) |
| `vitest run src/i18n/staged/irish.test.ts src/i18n/conversation.test.ts` | **57/57** |
| `tsc --noEmit -p .` | Pass |
| `eslint` on every changed Irish file, `ga.ts`, `irish.test.ts`, `conversation.test.ts` | Pass |

**Not run:** `npm run build` was denied again by this session's permission mode, and browser fixtures were not run for the same reason.

**No** commits, pushes, PRs, migrations, deployments, provider calls or paid usage. Everything is left uncommitted for review.

**Next exact actions for review:**

1. Review the uncommitted diff (`git status`).
2. Run `npm run build`.
3. Run the account-conversation browser fixtures at 1280×900 and 390×844, and add a full-route check for `/app/conversations`.
4. Regenerate `routeTree.gen.ts` with the router plugin and compare it with the hand edit.
5. Obtain security review of `20260914090000_milo_account_conversations.sql` and its endpoint.
6. Arrange fluent human review of the staged ro, lv, lt, mt and ga catalogs, and decide the cross-locale product-name items (Brand Intelligence, Authority Builder, Article Studio, plan and service names). None of these catalogs is activated.

## Extended queue — owner instruction, 14 September

After the assigned queue was completed, the owner instructed: "work on them all". This covers the four locally doable packets identified from `CONVERSATIONAL_WORKSPACE_2026_09_13.md` (implementation step 4 and the remaining full-plan table) and `ROADMAP.md`. They are worked in order under the same handoff boundaries (no commits, pushes, migration application, deployment, provider or paid calls):

1. **Chat execution breadth (R03/R05/R06/R08/R14/R15/R18/R19):** add bounded read-only specialist tools for saved technical SEO, evidence/reporting and authority data through the existing role/owner/admission guards. No auto-publishing, outreach, purchases or permission changes. D07-dependent choices are recorded, not invented.
2. **Inherited membership timing concern (R00/R24):** diagnose the large-history membership test without weakening assertions or timeouts.
3. **Staged-language claims reconciliation (R20):** check staged copy claims against shipped behaviour before any activation.
4. **Premium setup/UI gaps (R01–R03):** brand-upload, website-led and skip setup paths, and remaining screens, as far as local verification allows.

Items that need external state stay listed under "Next exact actions" above.

## Milestone 96 — chat execution breadth: saved technical, visibility and authority evidence

- **New specialist tools** (`src/lib/milo-specialist.ts`, `milo-specialist-tools.server.ts`), all read-only, owner-only and bounded:
  - `technical_evidence` (seo/research/performance): the latest 5 saved crawl runs, 10 Google index inspections and 10 performance requests via `listTechnicalRuns`, `listGoogleIndex` and `listTechnicalPerformance`; stored observations are clipped to 600 UTF-8 bytes. `startedNewWork: false`.
  - `visibility_evidence` (ai/research/performance): AI answer sample and log-import counts plus metadata via `readAnswerEvidence` and `readLogEvidence`. **Raw answers and log rows are never forwarded.** `verified: false`, superseded flags kept.
  - `authority_evidence` (authority/research): the latest 5 backlink monitoring requests via `readBacklinkMonitoringHistory`. Daily totals are `null` whenever any day was unreported (never an undercounted number), with a missing-day count.
- **Authority:** the existing `toolAllowed` role check and a fresh `readAdmittedTeamProject` admission run before any reader; a second explicit owner check sits inside the branch. Collaborators get `unavailable` without any RPC. **D07 decision needed:** whether members or reviewers may read these owner-scoped evidence stores in chat.
- **Event schema** (`milo-conversation.ts`): the three tool names and reference kinds `technical`, `visibility` and `authority` were added. Owner result links go to `/app/audit`, `/app/ai-visibility` and `/app/backlinks`; collaborators get no link.
- **Copy:** three `chat.tool.*` labels in en/pl/sv/da and all 20 staged catalogs. Conversation source fingerprint `37dd02d1…` → `9fa7dd2f7fd7d8ff4ae433eb0ea28fc1b65f5e202717d9d133814a60256f79a4`, updated on all 20 staged conversation batches and `DE_AUTHORING_SOURCE_HASHES`. Staged key counts 3,850 → 3,853 in the 15 count tests. The `sourceRevision` label strings on older batches were left unchanged; only the fingerprint is authoritative in tests. New staged labels need fluent review like the rest.
- **Tests:** owner summaries (scoping, 600-byte clip, no raw rows, null totals, references), role refusal, collaborator refusal for all three, and UI destinations. The migration/dispatch test fixtures now supply the new readers as refusing stubs.
- **Validation:**
  - `vitest run src/i18n` 708/708 (29 files).
  - Specialist/executor/conversation tests 52/52 (5 files).
  - Conversation and dispatch migration tests 41/41.
  - `tsc --noEmit` and `eslint` on changed files pass.
- **Not done in this packet:** mutating tools (starting crawls, inspections, monitoring or collection). These spend provider quota or money and need explicit per-turn consent like `allowDraftGeneration` plus a D07/spending decision. Also not done: live signed-in or provider acceptance, and browser fixtures for the new result links.

## Milestone 97 — inherited membership timing concern: diagnosed, not reproduced

**Subject:** `project-team-membership-migration.test.ts:435` "permits editing and reviewing after retained history exceeds the former limits". It inserts 10,000 edit and 10,000 approval rows in PGlite (in-process WASM Postgres), then saves an edit and an approval. It timed out at 9,146 ms against its 5,000 ms limit in the 13 September Hungarian full run (389 s total, two workers).

| Measurement (this worktree, no code/assertion/timeout changes) | Target test | Context |
| --- | --- | --- |
| Test alone (`-t`) | 437 ms | 1 file |
| Whole file, one worker | 402 ms | 91/91 in 4.44 s (the 13 Sept isolated recheck took 27.61 s) |
| All 39 PGlite migration files, **eight** workers (heavier than the suite's two) | 1,697 ms | 809/809 in 26.17 s |
| Two full suites this session, two workers | passed | 5,578 and 5,680 tests; 52 s for the latter |

**SQL inspection:**
- Both save paths use windowed counts on indexed columns: `project_team_edits_recent_activity` / `_actor_activity (owner_id, project_id[, actor_id], created_at)` and the matching `project_team_approval_history` indexes. The replay checks use primary keys.
- No per-save full-history scan was found. Old rows (2 hours) fall outside the one-hour windows.

**Conclusion:**
- The failing run was about 7.5× slower overall than the current full runs on the same configuration. The test is about 21× over its isolated time there, and only 4× over under eight-worker PGlite load here.
- The cause is most consistent with machine-level load or throttling during that run, but it is **not reproduced and not proven**. The recorded failure stays valid historical evidence. No assertion, data volume or timeout was changed.

**Separate finding** (not a timing cause here, because the test uses the default policy):
- The `separate_reviewers` authorship lookup is in `save_project_team_approval` and `read_project_team_review_authority`. It filters `(owner_id, project_id, asset_id, content_hash)` ordered by `created_at DESC LIMIT 1`, and no index leads with `asset_id`.
- It can walk the project's edit history backwards, bounded by rows since the asset's last matching edit.
- A candidate index `(owner_id, project_id, asset_id, created_at DESC)` would bound it. It is not added: no measured slowness, and it would need a reviewed new migration.

**Next:** if the timeout recurs in a full run, capture machine load (`uptime`/Activity Monitor) and the per-file durations from the same run before re-running.

## Milestone 98 — staged-language claim reconciliation, part 1

**Fixed (claims contradicted by shipped behaviour or registries):**

1. **Home FAQ stage name.**
   - `publicHome.faqDiscoveryA` said accepted ideas enter Plan "in Captured". The Plan UI labels that stage `pipeline.stage.idea` ("Idea"), and no catalog renders "Captured" as a stage.
   - English now says "at the Idea stage". pl/sv/da and the 16 staged catalogs that translated "Captured" now use their own `pipeline.stage.idea` term. lt, mt, lv and ga already did.
   - Public-home source fingerprint `2855ce0e…` → `09e34a037936057698a84cecda0fb297d2fe94c43288d416ab04efcef466f384` in 18 staged registries and `DE_AUTHORING_SOURCE_HASHES`. French has no public-home fingerprint.
2. **Trust page language statement** (`src/routes/trust.tsx`, English-only legal page).
   - It claimed Milo works "natively in English, Polish, Swedish and Danish — interface and generated content". Generated content already supports all 24 EU languages (`CONTENT_LANGUAGE_OPTIONS`).
   - It now derives the interface list from `UI_LANGUAGE_CODES` and the content count from the registry, and says per-language quality review continues during the beta.
   - `UI_LANGUAGE_CODES` moved to a dependency-free `src/i18n/ui-languages.ts` (re-exported unchanged from `catalogs.ts`), so the public page does not bundle every dictionary.
   - **Owner review needed** for this outward-facing legal-page wording before release.

**Guard added** — `src/i18n/language-claims.test.ts` (5 tests):
- The public-beta note must name exactly the active interface languages, so activating a staged language fails until that note is reconciled.
- Every active catalog's home FAQ must contain its own Idea stage label.

**Recorded, not changed** (need owner or behavioural decisions):
- `publicBeta.thisPageSupportsEnglishPolishSwedishAnd` stays correct while only four UI languages are active. The guard forces an update at activation.
- Romanian authentication emails (`auth-email-copy.ts`) use the informal register; the Romanian UI and operational emails use the formal "dvs." register. These are live email templates, so they are left for owner or fluent review.
- The onboarding "generate a first foundation" and pipeline live-state wording need behavioural review against onboarding and publication code before activation. Translation does not verify them.

**Validation:** `vitest run src/i18n` 713/713 (30 files); `tsc --noEmit` and `eslint` on changed files pass.

**Payment-provider claims checked (no change needed):**
- The base `en/pl/sv/da` keys `billing.paddleNote`, `launch.item.paddlePending(.desc)`, `launch.qa.paddle`, `beta.limit.paddle` and `beta.demo.payments` still describe Paddle activation. All are overridden in the composed `UI_CATALOGS` by `launch-readiness.ts`, which describes Stripe as the selected provider with setup and lifecycle checks outstanding. Staged catalogs are authored from that composed source.
- The remaining Paddle mentions are the legacy webhook/portal code and "legacy Paddle portal" billing copy, which match the code that still exists.
- The dead base strings can be deleted in a later cleanup; they do not reach users.

## Milestone 99 — premium setup/knowledge journey (P1): already implemented; no duplicate build

An inspection before building anything found the P1 code exit criteria from `AGENT_WEEKLY_PLAN_2026_09_09.md` already present and tested:

| P1 requirement | Evidence in this worktree |
| --- | --- |
| Setup offers upload brand guidelines / build from website / skip | `app.onboarding.tsx`: `setupPath` `"website" \| "document" \| "skip"` (lines ~137, 647–695) with `ProjectKnowledgePanel`; "continue", "skip" and "finish later" actions (lines ~539–557) |
| Edit path after setup | `app.setup.tsx:590` renders `BrandIntelligenceCard`, which embeds `ProjectKnowledgePanel` |
| Brand document parsing | `brand-document{,.client,.worker,-zip}.ts` with `brand-document{,.client,.bundle}.test.ts` |
| Accepted rules influence the next draft and image brief | `ai.functions.ts` (text) and `image-gen.functions.ts` (`"visual"`) load knowledge before dispatch. `generation-usage.test.ts:123–155` asserts the provider prompt contains accepted context for text, image and legacy paths, loads it before the provider call and retains exact knowledge references; `:156–169` asserts no provider call when knowledge cannot be authorised. The weekly executor uses text and visual context. |
| Replacement, revoke, forget, conflict, isolation | `project-knowledge-migration.test.ts` (current owned original; foreign/stale/revoked reads denied; bytes removed on revoke/forget; source re-review after replacement; no late-save resurrection), `project-knowledge.test.ts` (conflicting accepted values held, not newest-wins), `knowledge-brand.test.ts:94`, `project-knowledge.server.test.ts` (fresh read per context request, no uncertain-write retry), `source-refresh-migration.test.ts` (replacement, revocation, foreign scope) |

**No code changed in this packet.**

Remaining P1/R01–R03 acceptance cannot be verified locally in this session:
- responsive and visual checks of the setup paths (mobile/tablet/desktop, long translations, keyboard/focus, reduced motion);
- visual extraction quality on real brand PDFs/DOCX;
- applying the chosen Today/list+inspector design to the remaining screens, which needs owner design review and a browser;
- signed-in real-use acceptance.

These need a browser and real documents, which this session does not have.

## Final handoff after the extended queue (Milestones 96–99)

**Validation actually run:**

| Check | Result |
| --- | --- |
| Full suite `vitest run --maxWorkers=2` after packets 1–3 | **5,686 tests / 365 files pass** (49.7 s) |
| `vitest run src/i18n` | 713/713 (30 files) |
| `tsc --noEmit -p .` | Pass |
| `eslint` on every changed file | Pass |

`npm run build` was denied again by the session permission mode, and browser fixtures were not run. No commits, pushes, PRs, migrations, deployments, provider calls or paid usage. Everything is uncommitted for review.

**Decisions needed from the owner:**

1. **D07:** may collaborators or reviewers read the new owner-only evidence tools in chat? May chat start paid or quota-using work (crawls, inspections, monitoring) with per-turn consent?
2. **Trust page:** approve the new language wording on `/trust`.
3. **Romanian:** choose one register (formal UI vs informal authentication emails).
4. **Setup UI:** review the design roll-out across the remaining screens.

**Next exact actions for review:**

1. Review the uncommitted diff.
2. Run `npm run build`.
3. Run the browser fixtures, including the new chat result links (`/app/audit`, `/app/ai-visibility`, `/app/backlinks`) and `/trust`.
4. Carry over the open items from the earlier handoff above: routeTree regeneration, the security review of the account-conversation migration and PR135, and fluent review of all staged catalogs, including the new chat tool labels and the Idea-stage FAQ edits.

## Milestone 100 — owner decisions of 14 September applied

**Owner answers:**
- **Team roles:** "I think yes, at the end, you will pay for the business access and then we should adjust the price based on the number of people that will have access to it".
- **Trust page:** "trust page ok".
- **Romanian:** "do the same as is for other languages".

1. **D07 (partial), evidence reads for collaborators.**
   - `technical_evidence`, `visibility_evidence` and `authority_evidence` are no longer owner-only. Any current project member with the matching specialist role can read them in chat, and the registry offers them to collaborators.
   - The fresh `readAdmittedTeamProject` admission still runs first. Readers are then called with the **owner's** account ID, because the stores are keyed by the owning account, never the actor's.
   - Knowledge, weekly preparation, saved audit and draft generation stay owner-only; the owner did not change them.
   - Collaborators still get no result link to the owner-only `/app/audit`, `/app/ai-visibility` and `/app/backlinks` screens.
   - New test: a collaborator reads after admission, with the reader called as the owner; revoked admission prevents any reader call.
2. **Pricing direction (D01 input, not implemented).**
   - The owning business account pays for team access.
   - Price should scale with the number of people who have access.
   - A future paid, quota-using chat action (starting crawls, inspections, monitoring) charges the owner's account and still needs explicit per-turn consent. This is not built yet and needs seat metering, entitlement and Stripe work.
3. **Trust page wording approved** (Milestone 98). It still has to go through release review.
4. **Romanian register.** The Romanian sign-in and password-reset emails (`src/i18n/auth-email-copy.ts`) now use the formal "dvs." register (Confirmați, ați, puteți, Resetați, Folosiți, ignorați, finalizați), consistent with the Romanian UI and operational emails, as each other language is internally consistent. `{siteName}` is preserved. Fluent review is still recommended.
5. **Decision log.** The decisions are recorded in `product/DECISIONS.md` (2026-09-14).

**Validation:**

| Check | Result |
| --- | --- |
| Full suite `vitest run --maxWorkers=2` | **5,687 tests / 365 files pass** (49 s) |
| Specialist tool, executor, conversation UI and email tests | 92/92 |
| `tsc --noEmit` | Pass |
| `eslint` on changed files | Pass |

The build was not run (permission denied earlier this session). Nothing is committed.

## Milestone 101 — consented Google checks from chat

**Owner direction:** the owning business account pays; paid or quota-using chat work needs explicit per-request consent.

**New candidate migration** `supabase/migrations/20260914120000_milo_provider_check_consent.sql` (after `20260914090000_milo_account_conversations.sql`, unapplied):
- adds `milo_conversation_turns.allow_provider_checks boolean NOT NULL DEFAULT false`;
- `milo_conversation_turn_view` also returns `allowProviderChecks`;
- `begin_milo_conversation_turn` is dropped and recreated with a trailing `p_allow_checks boolean DEFAULT false`. Existing seven- and eight-argument calls keep working. A replay must match both consent choices, so consent cannot be added to a saved request later. Grants are restored to service_role only.
- Any current project member may consent (owner decision). Draft generation consent stays owner-only.

**Server, executor and tools:**
- `conversationSend`/`conversationTurn` accept `allowProviderChecks`. `beginConversationTurn` sends `p_allow_checks` and rejects a stored turn whose consent differs.
- The executor offers `google_index_inspection` and `performance_test` only when the saved turn has consent, and passes the flag to tools.
- `google_index_inspection {url}` (seo/research/performance) and `performance_test {url, device mobile|desktop}` (performance/seo; PageSpeed lab only) run through the existing `requestGoogleIndex` / `requestTechnicalPerformance`:
  - they run as the **owner account**, after fresh team admission, a final `beforeDispatch` authority check and a cancellation check;
  - the durable operation ID is the provider request ID, so an interrupted or replayed turn reads the reserved record and cannot dispatch twice;
  - the existing property/origin scope checks, reservation leases and quota handling are unchanged;
  - the evidence records status/error, a 1,500-byte observation excerpt and explicit limits (no indexing request, no ranking proof; lab data is not field data).
- At most two provider checks per plan. Result links follow the existing `technical` reference (owner → `/app/audit`).

**UI:** a separate "Allow up to two Google checks…" checkbox for every participant, reset after sending, and a per-message "Google checks allowed" note. Four new copy keys in en/pl/sv/da and all 20 staged catalogs. Conversation fingerprint → `46abec96024590bb7f9a69247b9db770741e811a1ae8e9adebefa884f916d780`; staged counts 3,853 → 3,857.

**Tests:**
- SQL: consent stored for a member, replay conflict, default false, non-member refused.
- Server: sends consent and rejects a mismatched stored response.
- Tools: no consent → no call; the owner-account call uses the operation ID; excerpt bound; role refusal; no dispatch after cancellation or a failed final authority check.

**Validation:**

| Check | Result |
| --- | --- |
| Full suite `vitest run --maxWorkers=2` | **5,691 tests / 365 files pass** (51 s) |
| `vitest run src/i18n` | 713/713 |
| Chat, tool and conversation migration tests | 160/160 |
| `tsc --noEmit` | Pass |
| `eslint` on changed files | Pass |

**Not done:**
- starting crawls (multi-step runs) or paid backlink monitoring from chat;
- seat metering or pricing;
- browser fixtures for the new checkbox;
- live Google/provider acceptance.

The migration needs the same release review as the other candidates. Nothing is committed.

## Milestone 102 — consented site crawl from chat, and seat pricing research

### Site crawl from chat

**New tool `site_crawl`:**
- It uses the same saved per-message consent as Milestone 101; no new migration was needed.
- The consent label now reads "site checks (Google index inspection, page speed or one site crawl)".
- Roles: seo, research, performance. At most one crawl per plan, still within the two-check limit.

**Runtime** (`milo-specialist-tools.server.ts`):
- Runs as the **owner account** after fresh team admission, a final `beforeDispatch` authority check and a cancellation check.
- The durable operation ID is the crawl run ID, and `start_technical_crawl` returns the existing run for a replay. An interrupted turn therefore cannot start a second crawl.
- Advances with the existing `stepTechnicalRun`, re-checking authority and cancellation before each step. It stops when the run is no longer active, when the revision is unchanged (another visit owns the lease), or at 40 steps or 90 seconds.
- Existing robots, ownership-proof, capacity, website-change and 20-per-hour limits are unchanged.
- A blocked start (`technical_crawl_unavailable` / `technical_website_invalid`) returns `unavailable` with a hint instead of failing the message.
- Evidence records status, admission hold, pages observed, queue size, coverage limits, whether the crawl continues on the technical checks page, and explicit limits.

**Copy:** a new `chat.tool.site_crawl` label, and a reworded consent label and message note, in en/pl/sv/da and all 20 staged catalogs. Conversation fingerprint → `d37f66e7435e11e49b2e69c75ace0f494c1d288b7c4e4b1d3f3c110a1274649b`; staged counts 3,857 → 3,858.

**Tests:** no consent → no start; the owner-account start and steps use the operation ID; the bounded step loop completes; stops on a lease owned by another visit (unchanged revision); a blocked start is reported as unavailable with no steps.

**Validation:**

| Check | Result |
| --- | --- |
| Full suite | **5,692 tests / 365 files pass** (49.5 s) |
| `src/i18n` | 713/713 |
| Chat and tool tests | 93/93 |
| `tsc --noEmit` | Pass |
| `eslint` | Pass |

**Not done:** paid backlink monitoring from chat; browser check of the reworded consent; live crawl acceptance.

### Seat pricing research

`product/SEAT_PRICING_RESEARCH_2026_09_14.md` covers:
- current plan prices and limits from code, including a stale legacy `pricing.ts` table to reconcile;
- team and chat limits, and cost drivers;
- competitor seat patterns, **from memory and flagged for live verification**, because the session had no web access;
- a proposed model: bundled working seats (2 / 3 / 5 / 10), free bounded viewers (2 / 5 / 10 / 50), extra working seats €15 / €15 / €12 / €10, pooled per-account AI usage, and market scaling;
- example bills, a margin check using C / (1 − M), and the owner decisions still needed.

No pricing was changed in code.

- **Full override audit completed** against the `OVERRIDES` list in `catalogs.ts`. Overrides of base keys used by authored batches are premium (including `plan.detail.*` / `plan.source.manual` from its `inspector` loop), `gscIntegrity`, `launchReadinessCopy`, `backlinkIntegrity`, `linkNetworkCopy` and `locationCoverage`. All are translated from the overriding text in both Romanian and Latvian. The remaining entries are namespaced copies authored from their own files.

**Validation actually run after Milestone 49:**

| Check | Result |
| --- | --- |
| Full suite `vitest run --maxWorkers=2` | **5,578 tests / 361 files pass** (up from 5,510 / 359 after Milestone 1, due to the added Romanian/Latvian tests). Output includes `Cannot load "@napi-rs/canvas"` warnings from an optional package; these are warnings, not failures. |
| `vitest run src/i18n` | **606/606, 26 files** |
| `tsc --noEmit`, `eslint` on changed staged files | Pass |

**Not done or not run in this session**, with reasons:

- Production build and browser fixtures were not run: this session's permission mode denied `npm run build` and `node scripts/milo-conversation-browser/build.cjs`, and no browser control is available.
- Romanian and Latvian have had no fluent human review. The copy is machine-authored under the staged conventions, and the review items are listed in Milestones 25 and 49.
- No commits, pushes, PRs, migration application, deployment, provider or paid calls were made.

**Next exact actions for Codex:**

1. Review the uncommitted diff (`git status` lists it).
2. Run `npm run build` (the full suite above already passes).
3. Run `node scripts/milo-conversation-browser/build.cjs <en|pl|sv|da> account` in a browser at 1280×900 and 390×844, and add a full-route check for `/app/conversations`.
4. Regenerate `routeTree.gen.ts` with the router plugin and compare it with the hand edit.
5. Obtain security review of `20260914090000_milo_account_conversations.sql` and its endpoint before any release.
6. Arrange fluent review of the staged Romanian and Latvian catalogs, and decide the cross-locale product-name items (Authority Builder, plan and service names).
7. Continue the remaining catalogs, one batch at a time: Lithuanian (in progress, see Milestone 50), then Maltese and Irish.

## Milestone 103 — continuation moved to a Claude Code worktree; competitor seat prices verified (14 September)

**Location change.** The Claude desktop session that continued this queue runs in its own isolated worktree, `/Users/rafi/Claude/Projects/andersen-visibility-engine/.claude/worktrees/milo-growth-implementation-5fec33`, on local branch `claude/milo-continuation-20260914` at the same base `ff9b085a3829254a4c60da554e09b65bc64722a3`. The Codex worktree `/Users/rafi/.codex/worktrees/milo-claude-continuation-20260913` is read-only for that session, so its uncommitted state (82 modified and 233 untracked files, 1,368 insertions / 103 deletions) was copied here with `git diff --binary` + `git apply` and `rsync` of the untracked list. Parity was checked by identical `git diff --stat` on both trees. From this milestone on, the Codex copy is stale; review the diff in this worktree. Nothing is committed or pushed on either side.

**Baseline re-verified here:** `tsc --noEmit -p .` passes; 794 tests / 36 files pass across the specialist tool, executor, conversation server/UI/migration, account endpoint and all `src/i18n` suites (Vitest run with an equivalent config copy in the session scratchpad, because Vite cannot write its config bundle into `node_modules` under this sandbox; test settings are unchanged).

**Seat pricing research updated.** Section 2 of `product/SEAT_PRICING_RESEARCH_2026_09_14.md` now holds figures fetched from the official pricing pages of Semrush, Ahrefs, SE Ranking, Surfer, AgencyAnalytics and Otterly on 14 September 2026, replacing the from-memory table. Peec AI shows no amounts on its page; third-party 2026 reviews are cited as secondary sources. The proposal's rationale was corrected: an extra seat at €10–€15 matches SE Ranking's "from $16" and sits well below Ahrefs ($40–$80) and Semrush ($45+); the bundled 2/3/5/10 seats mirror Surfer's 1/3/5/10. The proposed numbers themselves were not changed; owner decisions in section 5 remain open.

**Discarded duplicate.** A separate Codex handoff on the older UI branch asked for owner beta-playbook localization; that work already exists at this baseline (`src/i18n/beta-guidance.ts`), so a partial duplicate started before the queue was identified was discarded outside the repository.

## Milestone 104 — browser checks run; dialog focus defect fixed; consent covered in fixtures (14 September)

**Browser runs** (Claude desktop Browser pane, synthetic fixtures only; no server, provider or production involvement):

| Fixture | Locales × viewports | Result |
| --- | --- | --- |
| `account` (`/app/conversations` component) | EN, PL, SV, DA × 1280×900 and 390×844 | 10/10 groups in all eight runs after the fix below; scroll width equals viewport at 390 px |
| `component` (chat workspace) | EN × 1280×900 and 390×844 | 9/9, including the new consent assertions |
| `full` (real home route, shell, router) | EN 1280×900; PL 390×844 | 4/4 in both |

**Defect found and fixed:** the first `account` run failed "focus returns to Delete". The erase confirmation is a controlled Radix AlertDialog without a trigger element, so Radix's default `onCloseAutoFocus` focused nothing and keyboard focus dropped to `<body>` after Cancel. `src/components/MiloAccountConversations.tsx` now records the Delete control that opened the dialog and refocuses it on close, or focuses the list container (`tabIndex={-1}`) when that control no longer exists after erasure. The fixture assertion was not changed.

**Fixture updates:** `scripts/milo-conversation-browser/entry.jsx` group 1 ticks the site-check consent, asserts `allowProviderChecks: true` on the request, both consent notes on the saved message, and cleared boxes after sending; its send mock stores the flag. `entry.jsx` group 5 and `full-entry.jsx` now expect a collaborator to see exactly one consent box (site checks) and no generation control, matching the 14 September owner decision (Milestone 101). README observation paragraph updated.

**How the runs were possible here:** the repository's `build.cjs`, dev server and `/tmp` output path cannot be used under this sandbox (no writes to `node_modules` or `/tmp`, and Nitro's dotenv loader cannot stat `.env`). A scratchpad copy of `build.cjs` with a local output directory and relative asset links was used, the stylesheet was compiled from `src/styles.css` with `@tailwindcss/node` + `@tailwindcss/oxide` (the same pipeline `@tailwindcss/vite` runs), and a loopback `python3 -m http.server` served the directory. Nothing in the repository's fixture settings or assertions was weakened.

**Validation after the component change:** `tsc --noEmit -p .` pass; `eslint` and `prettier --check` on the changed component and fixtures pass.

**Production build:** still not run. `bun run build` fails in this sandbox first on the `node_modules/.vite-temp` write (avoidable with `--configLoader runner`) and then because Nitro stats `.env`, which the sandbox denies as a credentials file. Run `bun run build` outside the sandbox before release.

**Not done:** auth/bookmark/proposal/lifecycle/generation/multitab fixture reruns; PL/SV/DA component runs; SV/DA full-route runs; visual review of the consent label at phone width in all locales.

### Milestone 104 addendum — remaining fixture modes and full suite

| Check | Result |
| --- | --- |
| Full suite `vitest run --maxWorkers=2` (this worktree, equivalent config copy) | **5,692 tests / 365 files pass** (49.5 s) |
| `auth` fixture, EN 1280×900 | 6/6 |
| `bookmark` fixture, EN 1280×900 | 12/12 (includes erasure through the extracted cache purge) |
| `lifecycle` fixture, EN 1280×900 | 11/11 |
| `proposal` fixture, EN 1280×900 | 8/8 |
| `generation` fixture, EN 1280×900 | 3/3 |
| `multitab` fixture | Not rerun (needs its own local SQL server process) |

Every browser mode that renders the imported shell, workspace, action, route and account changes now passes in a real browser. Fixture data is synthetic; this is not signed-in, provider or production acceptance.

**Decision recorded, not built — backlink monitoring from chat.** The last "not built" item from Milestone 102 would spend real supplier money on the owner's account. The handoff grants no authority to invent spending policy, and Milestone 100 records that paid chat actions need entitlement and Stripe work. It stays unbuilt until the owner decides whether chat may start paid monitoring at all, with which per-turn consent wording and which spending cap. Google inspections, PageSpeed tests and crawls remain available in chat because they use quota, not money.

**State at this milestone:** all changes remain uncommitted on `claude/milo-continuation-20260914` in the Claude worktree named in Milestone 103. Session-local artifacts (scratch `build.cjs` copy, compiled stylesheet, Vitest config copy, build logs) live in the session scratchpad, outside the repository. No commits, pushes, PRs, migration application, deployment, provider calls or paid usage occurred.

**Next exact actions for review:**
1. Review the uncommitted diff in the Claude worktree (`git status`), not the stale Codex copy.
2. Run `bun run build` outside the sandbox.
3. Decide the backlink-monitoring-from-chat spending question and the seat pricing decisions in `SEAT_PRICING_RESEARCH_2026_09_14.md` section 5.
4. Carry over: routeTree regeneration, security review of the six candidate migrations and PR135, fluent review of the staged catalogs.

## Milestone 105 — owner answers applied: seat enforcement built, route tree verified, review started (14 September)

**Owner answers** (recorded in `DECISIONS.md`, 2026-09-14 later entry): seat model and numbers approved; backlink monitoring from chat undecided and left unbuilt; review items to proceed.

**Route tree.** `src/routeTree.gen.ts` was regenerated with `@tanstack/router-generator` 1.167.17 into the scratchpad (default single-quote, no-semicolon settings, same routes directory). The generated body is byte-identical to the hand edit; the only difference is the ten-line `@tanstack/react-start` type registration the Start plugin appends, which the hand edit already contains. No route file was altered by the generator. Item closed.

**Seat allowances and enforcement (approved D01 model):**
- `src/lib/billing.ts`: `PLAN_SEATS` (Starter 2/2, Growth 3/5, Pro 5/10, Agency 10/50 working/viewer seats; extra working seat €15/€15/€12/€10 list prices, not sold), `teamSeatAllowance(planId, purchasedWorkingSeats)`. **Assumption to confirm:** Free Preview keeps the owner alone with one viewer seat; the owner did not decide the free tier.
- New candidate migration `supabase/migrations/20260914150000_project_team_seats.sql` (seventh unapplied): `count_project_team_seats(owner)` counts distinct people across the whole account (owner = 1 working seat; active unexpired members plus pending unexpired invitations; a person holding any working role counts once as working). `assert_project_team_seat` raises `team_seat_limit` when an invitation or role change needs a seat the plan lacks; a person already counted as working, or already a viewer being invited to view, needs no new seat. `create_project_team_invitation` and `change_project_team_member` are dropped and recreated with trailing `p_working_seats`/`p_viewer_seats` (`DEFAULT NULL` keeps the previous behaviour for six- and seven-argument calls). The check runs inside the existing owner lock, before the insert/update, so a refused request leaves no row and no audit event. Grants remain service_role only.
- Server: `updateProjectTeam` accepts an optional allowance and sends it for `invite` and `role`; `teamCall` maps the database message to `TeamSeatLimitError` (`src/lib/project-team-seats.ts`, client-safe). `src/lib/project-team-seats.server.ts` resolves the allowance from the owner's entitlement (fail-closed to Free Preview like other entitlement reads; purchased seats fixed at 0 until billing records them) and reads usage. `updateProjectTeamFn` always supplies the authenticated owner's allowance; new `readTeamSeatsFn` returns plan, allowance and usage for the owner only.
- UI (`app.collaborators.tsx`): a seat summary under the invitation form and a specific "no seat is free" message on refusal. Blocking at the limit, as the owner chose; no automatic billing.
- Copy: `collaboration.seats` and `collaboration.seatLimit` in en/pl/sv/da and all 20 staged catalogs (fluent review still outstanding). Collaboration source fingerprint `429e59f1…` → `66e659da6d8b879af77aef68c0bba3717cb793240da5ae2364a93212f16bd83f` in 19 registries/source files; staged counts 3,858 → 3,860 in 15 tests.
- Tests: new `src/lib/project-team-seats-migration.test.ts` (7 PGlite cases: empty account, NULL limits unchanged, working/viewer limits refused separately with no leftover rows, one person counted once across projects, revoked invitation frees its seat, viewer→working promotion needs a seat while working→working does not, malformed limits and service-only grants). `project-team.functions.test.ts` asserts the allowance comes from the authenticated owner and that `readTeamSeatsFn` rejects supplied identities (15 entry points).

**Validation:** seats + membership + functions + billing suites 122/122; `src/i18n` 713/713 (30 files); `tsc --noEmit -p .` pass; `eslint` on every changed file pass. Full suite run recorded below when finished. No browser fixture exists for the collaborators screen; the summary and message are not browser-verified.

**Not built:** extra-seat purchases and Stripe quantity items, pricing-page and terms copy for seats, measured cost per active seat, and any seat wording on public pages. Nothing is committed.

## Milestone 106 — local security review of the candidate migrations, endpoints and PR135; two findings fixed (14 September)

A read-only local review (Claude security reviewer agent, PGlite reconstruction of the full chain) covered the seven candidate migrations, the account-conversation and consent endpoints, the consented tool branches and PR135's diff. **Verdict: no exploitable authorization defect; pass with fixes.** It is not the repository's required Codex security review. Verified sound: production-order application of all candidates, service_role-only grants, pinned `search_path` on every definer function, RLS with zero policies on every conversation/proposal/erasure/dispatch table, revoked-membership reads refused, owner cannot list a member's conversations, stored-consent gating in the executor and tools, output clipping, no credential logging, and PR135's fail-closed canonical matching with intact SSRF pinning.

**Fixed here:**
1. *Medium — a viewer could consent to owner-quota checks.* `20260914120000_milo_provider_check_consent.sql` (unapplied candidate, edited in place) now raises `milo_conversation_invalid` when `p_allow_checks` comes from a collaborator without an active editor or reviewer role. `MiloConversationWorkspace` takes `canConsentChecks`; the chat home derives it from the membership directory (owner, editor, reviewer), so viewers do not see the box. Demotion after consent is already covered by membership-revision fencing on claim/advance. New SQL test: viewer refused, reviewer/editor/owner accepted. Recorded in `DECISIONS.md` as a refinement pending owner confirmation.
2. *Medium — no test applied the candidate chain in production order with a grant matrix.* New `src/lib/milo-candidate-chain-migration.test.ts` applies the released chain plus all eight candidates in filename order and asserts: the candidate list equals the files after the newest applied migration; service_role-only EXECUTE on `list_my_milo_conversations`, the nine-argument `begin_milo_conversation_turn`, export/erase, `count_project_team_seats`, and the recreated invitation/member functions; no role can execute `milo_conversation_turn_view`, `assert_milo_conversation_access` or `assert_project_team_seat`; exactly one overload of each dropped-and-recreated function; pinned `search_path` on every definer function; RLS on with zero policies and no privileges on nine tables.

**Recorded for Codex, not changed:**
- Medium (defence in depth): `list_my_milo_conversations` inlines the access predicate instead of calling `assert_milo_conversation_access`; a precondition matrix test or a shared boolean helper is recommended.
- Low: erasing never-created conversation IDs grows `milo_erased_conversations` without a cap or retention.
- Low (PR135): `competitorUrl` persists raw, unvalidated browser input up to 4,096 characters; persist the normalized key or skip the snapshot when it is not a URL. Rendered as escaped text only.
- Low: an applied proposal on a turn with 24 events stays `ready` although apply can never succeed.
- Low: the consented crawl loop's per-step liveness check consumes the actor's team-preview budget and can abort a healthy crawl.
- Info: `equalSecret` returns early on length mismatch.
- The two newest migrations were untracked in the Codex worktree; here every migration is in the same uncommitted tree for review.

**Validation:** migration suites (chain, conversation, account, dispatch) 66/66; conversation UI, tools, executor and server tests 51/51; `tsc --noEmit -p .` and `eslint` on changed files pass; browser `component` 9/9 and `full` 4/4 in EN after the change. Full suite result is appended when the background run finishes.

**Full suite after Milestones 105–106:** `vitest run --maxWorkers=2` **5,714 tests / 367 files pass** (65 s). Nothing is committed, pushed, applied or deployed. Uncommitted tree: 105 modified and 238 new files (1,656 insertions / 131 deletions against `ff9b085`).

**Next exact actions for review:** review the diff in this Claude worktree; run `bun run build` outside the sandbox; confirm the viewer-consent refinement and the Free Preview seat default; obtain the required Codex security review of the eight candidate migrations and PR135 (with the recorded PR135 `competitorUrl` finding); arrange fluent review of the staged catalogs including the two new seat messages; decide backlink monitoring from chat when Stripe and spending caps exist.

**Owner confirmations (14 September, later):** the Free Preview seat default (owner only plus one viewer) and the rule that viewers cannot consent to site checks are both confirmed and recorded in `DECISIONS.md` items 4 and 5 of the later 14 September entry. No open assumptions remain in Milestones 105–106.

**Production build (owner-run, 14 September):** the owner ran `bun run build` outside the sandbox on the current uncommitted tree and reported that it passed. This closes the "build not run" item that every earlier milestone carried. The build log was not captured in this session; rerun it after any further source change.

**Remaining review items:** the required Codex security review of the eight candidate migrations and PR135 (with the recorded findings), fluent human review of the staged catalogs, the Stripe seat items and pricing-page copy, and the deferred backlink-monitoring-from-chat decision.

**Committed (owner instruction, 14 September):** all of the above is commit `04c63b2` on local branch `claude/milo-continuation-20260914` (343 files on top of `ff9b085`). The `.env` file was left untouched. Not pushed; no PR; nothing applied or deployed.

**Pushed and draft PR opened (owner instruction, 14 September):** branch `claude/milo-continuation-20260914` is on origin; draft PR #136 (https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/136) carries the review checklist. It stays a draft until the Codex security review of the eight candidate migrations is complete. No merge, migration application or deployment.

**PR #136 marked ready for review (owner instruction, 14 September).** This supersedes the draft note above: the review bots run on the PR head. Merge still requires the Codex security review, full CI on both Bun runtimes and the release protocol; nothing is applied or deployed.
