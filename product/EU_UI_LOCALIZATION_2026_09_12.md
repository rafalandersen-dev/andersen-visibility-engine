# EU interface localization — implementation checkpoint

The full R20 interface requirement remains open. The live interface still offers English, Polish, Swedish and Danish. Content and operational email languages have their own 24-language registries and preferences; those registries do not enable additional interface languages.

This unreleased branch contains a browser-independent interface catalog, literal interpolation, 11 source-copy corrections in the four existing languages, and a complete first French translation of the current 2,702 dictionary keys. French is staged outside the runtime and language picker. Dictionary coverage is not fluent-user approval, complete screen coverage or a delivered French interface. Overall delivery remains approximately 60%, implementation 75% (weighted 58.25% / 73.5% after PR130); no further milestone credit is assigned to this unreleased work.

## Catalog and source corrections

The original catalog refactor preserves all 2,702 effective strings in each existing language and the priority of the 21 existing overlays. React still uses the device override with the project language as its fallback. English fallback now covers the assembled catalog across all product areas, and prototype properties cannot masquerade as translation keys. Interpolation inserts supplied values literally in one pass: dollar replacement sequences and braces inside supplied values cannot change other text.

Two later overlays intentionally correct 11 messages per current language. Nine launch/billing/beta messages reflect the selected Stripe replacement, outstanding setup and payment acceptance, reviewed image references and verified demo flows. The old Paddle configuration diagnostic is explicitly labelled legacy because its underlying value still reads Paddle configuration. Two link-network messages remove the unsupported promise of search-policy safety and the blanket reassurance that a single reciprocal exchange is safe. Google's [spam policies](https://developers.google.com/search/docs/essentials/spam-policies#link-spam) identify excessive exchanges and ranking-oriented link schemes; they do not establish the former blanket reassurance. This is a source-copy correction, not certification of any placement.

The payment and image corrections are grounded in `product/DECISIONS.md`, `product/CURRENT_STATE.md` and `evidence/publishing-fidelity-release-2026-09-10.md`. They do not replace payment plumbing or prove actual image delivery. There are now 27 dictionary source files and 23 overlays, with 2,702 effective keys in each of the four existing languages. Every other effective string remains identical to the prior source.

## French authoring coverage

| Product area | Keys |
| --- | ---: |
| Navigation, setup and work stages | 202 |
| Editor, planning, content and publication | 345 |
| Collaboration, specialists and notifications | 248 |
| Project knowledge and weekly preparation | 242 |
| Technical inspection, indexing and performance | 238 |
| Analytics, Search Console and reports | 204 |
| Publication/answer/log evidence and evaluation | 196 |
| Brand, connectors, permissions and coverage | 220 |
| Authority, public audit and proposed actions | 201 |
| Billing, launch checklist and beta notes | 192 |
| Backlinks, placements and recurring monitoring | 256 |
| Outreach, article hooks and image placement | 158 |
| **Current dictionary total** | **2,702** |

All 12 batches live under `src/i18n/staged/`, aggregated only for authoring and tests. Each current key appears once, with the exact source placeholder set. The three collaborator role names match the released French invitation. Planned/scheduled/sent/published work, draft/public delivery, email preparation/provider acceptance/unknown outcomes, approval/application/rejection and supplier accounting states remain distinct.

The initial whole-catalog review checked unchanged English values and different translations of repeated source labels. Unchanged values are shared French words, proper names or technical labels. Product naming and brand-fit wording were aligned, while grammatical gender, action-versus-status labels and context-specific meanings were preserved. A number comparison, allowing French decimal and thousands separators, found no mismatched numeric values. These automated and author reviews do not replace fluent-user review.

## Validation and retained evidence

- All localization tests pass: 61 checks across eight files, including complete French key coverage, placeholders, uniqueness, continued runtime exclusion and status/role distinctions.
- TypeScript and lint for the catalog, bindings, interpolation, new overlays and all staged files pass.
- `/tmp/milo-ui-fr-final-{tests,types,lint}.log` retains the completed combined checks.
- `/tmp/milo-ui-catalog-preservation.json` records the earlier refactor's full preservation. `/tmp/milo-ui-copy-corrections-preservation.json` verifies exactly 11 later intentional differences per locale, unchanged key sets and preservation of all other strings.
- `/tmp/milo-ui-translation-source-current.json` is the current resolved source. `/tmp/milo-ui-localization-current-catalogs.json` remains the historical baseline; do not overwrite it or reuse its stale beta/link-network wording for later translations.
- `/tmp/milo-ui-fr-review.json` and `/tmp/milo-ui-fr-number-review.json` retain the first terminology and number review. The two terminology corrections after that first report are in source; a repeated audit should read the current files.

## Remaining work

A conservative source inventory scanned 161 route/component files and found 1,083 candidate displayed strings in 66 files, plus 52 formatting calls, 29 of which use the device default rather than the chosen interface language. This is a triage inventory, not an exact remaining translation count: candidates can be shared words or deliberate proper names, and the scan does not exhaust conditional strings, shared data arrays or server-returned messages. The largest candidate groups include the editor, plan, beta validation, public home page, AI visibility, pricing and audit screens. Evidence: `/tmp/milo-ui-embedded-inventory.json`.

Next: fix language-aware formatting in existing screens, extract remaining displayed copy with precise context, complete the other 19 new interface languages, and implement selected-language loading without shipping all 24 dictionaries eagerly. Keep content, email, interface, market, currency and ownership preferences separate. Retain explicit UTC evidence windows and actual currency units when formatting. French remains unavailable until required screen coverage, language selection, runtime behavior and fluent-user acceptance are completed. Public policy review, signed-in journeys, actual reports and full R20 acceptance remain open.

## Preserve released and parallel work

PR130 operational/team/invitation email localization is already released at `44eeb47`; migration `20260912030000` was applied once and deployment `a45ad475-a9e0-4785-94e4-11df88684813` was verified. Do not repeat release operations. The branch includes the normal merge and canonical documentation `91a81af`. See [release evidence](../evidence/eu-email-localization-release-2026-09-12.md).

PR129 reference-photo work remains draft with its existing pricing and secure-authentication boundaries. No supplier/model call, email, invitation, opt-in, billing change, CMS/Google/DNS action, production evidence import, funding or credential change occurred during this interface work. No browser or real-use acceptance is claimed.
