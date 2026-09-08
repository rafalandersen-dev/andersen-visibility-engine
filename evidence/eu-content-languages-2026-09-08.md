# EU content-language support

Date: 2026-09-08. Base: published PR #96, merge `d33faebd852ab844d152d3884378f68e840acb60`.

## Scope and behavior

One shared registry defines the 24 official EU content-language names, codes and native labels. The list was checked against the [European Union language page](https://european-union.europa.eu/principles-countries-history/languages_en) on 8 September. It replaces the four-language copies used in project setup, onboarding content selection, opportunity filtering, AI prompt schemas/normalization and MCP setup/draft/topic authoring.

Content-language codes now have their own type. App interface language remains the existing EN/PL/SV/DA type and dictionary set; billing currency and target market remain separate. No claim is made that the entire interface, email or legal content is translated into 24 languages.

Explicit language edits synchronize `primaryLanguage` and `primaryContentLanguage`. Generation and MCP defaults prefer the content setting, then a valid legacy primary language, then English. Approved project-setup proposals also apply the selected language to topics created in that same operation. Existing content and previously created topics retain their stored language.

Normalization recognizes exact English/native names, supported ISO codes and regional tags without fuzzy prefix matches between Slovak and Slovenian. Unsupported or ambiguous language values are rejected by external write schemas; existing legacy generator fallbacks remain. Proposal/batch size, identity, scope, idempotency, approval and publication restrictions remain in place. The existing maximum of three additional languages in one MCP setup proposal is unchanged.

Review correction: upcoming and recent content on Today now resolve their language through the same registry and format the name in the active interface locale. New languages no longer fall through the old four-language map to English. Content without its own language uses the authoritative project content setting; an unrecognized stored language is displayed as supplied rather than mislabeled as English.

The shared slug generator adds basic Latin mappings for Bulgarian, Greek and Maltese letters so newly created non-Latin titles do not collapse to empty URLs. It preserves the ASCII/word-boundary slug contract. This is a readable deterministic URL rendering, not a certified linguistic transliteration. It does not rewrite stored slugs or publish anything.

## Verification and limits

- Full suite: 1,956 tests across 138 files passed. The new matrix covers each of the 24 languages in onboarding mapping, generation labels, setup validation and externally authored topic batches; additional integration tests cover actual proposal application and MCP recommendation defaults.
- TypeScript and focused lint of the new registry/tests, batch adapter and setup UI passed. Touched legacy modules retain existing formatting/lint debt; full repository lint is not clean or claimed clean. Existing German-as-invalid fixtures were updated to an unsupported language because German is now intentionally supported.
- Production build passed during implementation; final post-format build is recorded in the PR release evidence.
- Local visual acceptance is **pending**. CUA refused the local preview because its administrator-enforced browser policy could not be verified. No other browser or indirect method was used to bypass that restriction. The local preview server was stopped.
- Provider responses are synthetic. No real multilingual AI quality, external CMS publication, locale-specific SEO/hreflang behavior or 24-language UI/email/legal acceptance is established by these tests. Those remain R20/R13/R18 work.
- No dependencies, database migration, credentials, budgets or customer data changed. No AI spending, publishing or email occurred. Code review/merge/release are pending at this documentation revision.

## Current continuation

PR #97 is now reviewed, merged and published. Final reviewed head `10d46312faccb0ba3a13e3374be7602ebc1a049e`, automated review run34277384080 succeeded with no new inline findings; the earlier dashboard fallback finding was corrected. Normal merge `b49964cc483b6d3b5c9f1a59f43f27248309e634`. Deployment `5e78d400-9e16-4861-99ef-9be3a86647a6`, build1788901133476, exact merge revision, modified=false, full fingerprint259582255ec1a35abe988b4613dc5d22c43f1c13f857891e2926ffe13a8acc6a and all components matching clean main. Home200, MCP GET200/OPTIONS204/anonymous POST401. Final dashboard correction passed TypeScript, 76 focused tests and production build after the earlier full1,956 suite. No paid calls, migration or client publication. This supersedes the review/release-pending note above, without claiming visual or real multilingual AI acceptance.

PR #96 is now live: deployment `63132b2e-78b5-4afd-adb6-2ac5f5e33705`, build `1788899288773`, exact clean merge revision, full fingerprint `bc369ba9dd442488197fca4034f11f48ee51e9cec5f3a598cdd7ecc78b3031e7` and all components matching. It connected native text/image generation to account/global monetary admission; it did not provision budgets.

The owner reports changing the existing OpenAI account email to Synergy and authorizes that temporary account for Milo. The exact address has not been provided or independently verified. Milo's own account remains `rafi@anderseninnovations.com`. A fresh connector check after that update returned `UNAUTHORIZED` / `openai_platform_authentication_failed`. The precise reconnect request is already pending; do not duplicate it. The prior successful reconnect does not establish current authentication.

No secure picker selection/local-save confirmation or API key has been received. The USD5 approval remains unused and limited to the isolated one-scan/article/image benchmark. Stripe remains owner-deferred. The entire R00–R24/D01–D08 plan and public launch are not complete.
